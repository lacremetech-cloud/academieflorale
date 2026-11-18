// @ts-check
/**
 * Traitement du formulaire de la landing : valide les champs, puis crée ou met
 * à jour le contact dans ActiveCampaign, sans Make ni systeme.io.
 *
 * Règles :
 * - aucune donnée personnelle dans les journaux ;
 * - sur une preview, on n'écrit dans ActiveCampaign que pour l'adresse de test ;
 * - un robot reçoit une réponse « tout va bien » et rien n'est écrit.
 */
import {
  nettoyerEmail,
  nettoyerPrenom,
  nettoyerSlug,
  nettoyerTelephone,
  nettoyerUTM,
} from '../partage/validation.js';
import { synchroniserContact } from './activecampaign.js';
import { repondre } from './reponse.js';
import { adresseCliente, memeOrigine } from './requete.js';
import {
  CHAMPS,
  DELAI_MINIMAL_MS,
  LIMITE_ENVOIS,
  LIMITE_PERIODE_MS,
  TAGS,
  TAGS_SOURCE,
  TAILLE_MAX_DEMANDE,
} from './reglages.js';

/** Nom du champ piège : invisible pour une personne, rempli par les robots. */
export const CHAMP_PIEGE = 'af_champ_libre';

/**
 * Limitation simple, en mémoire : elle freine les rafales sur une instance.
 * Une limitation stricte se règle en plus dans le pare-feu Vercel.
 * @param {number} limite
 * @param {number} periodeMs
 */
export function creerLimiteur(limite = LIMITE_ENVOIS, periodeMs = LIMITE_PERIODE_MS) {
  /** @type {Map<string, number[]>} */
  const envois = new Map();
  return {
    /**
     * @param {string} cle
     * @param {number} [maintenant]
     */
    autoriser(cle, maintenant = Date.now()) {
      const recents = (envois.get(cle) ?? []).filter((instant) => maintenant - instant < periodeMs);
      if (recents.length >= limite) {
        envois.set(cle, recents);
        return false;
      }
      recents.push(maintenant);
      envois.set(cle, recents);
      if (envois.size > 5000) {
        for (const [autre, instants] of envois) {
          if (instants.every((instant) => maintenant - instant >= periodeMs)) envois.delete(autre);
        }
      }
      return true;
    },
  };
}

const limiteurParDefaut = creerLimiteur();

/**
 * Prépare la fiche envoyée à ActiveCampaign.
 * @param {object} lead
 * @param {string} lead.prenom
 * @param {string} lead.email
 * @param {string} lead.telephone
 * @param {string} lead.source
 * @param {Record<string, string>} lead.utm
 * @param {string} lead.page
 */
export function construireContact({ prenom, email, telephone, source, utm, page }) {
  /** @type {{ field: string, value: string }[]} */
  const fieldValues = [{ field: CHAMPS.source.numero, value: CHAMPS.source.valeur }];
  for (const [cle, numero] of Object.entries(CHAMPS.utm)) {
    const valeur = utm[cle];
    if (numero && valeur) fieldValues.push({ field: numero, value: valeur });
  }
  if (CHAMPS.pageOrigine && page) fieldValues.push({ field: CHAMPS.pageOrigine, value: page });

  /** @type {string[]} */
  const tags = [TAGS.inscrite];
  const tagSource = Object.hasOwn(TAGS_SOURCE, source)
    ? TAGS_SOURCE[/** @type {keyof typeof TAGS_SOURCE} */ (source)]
    : '';
  if (tagSource) tags.push(tagSource);

  /** @type {Record<string, unknown>} */
  const contact = { email, firstName: prenom, fieldValues, tags };
  if (telephone) contact.phone = telephone;
  return contact;
}

/**
 * @param {Request} request
 * @param {object} [contexte]
 * @param {Record<string, string | undefined>} [contexte.env]
 * @param {typeof fetch} [contexte.fetchImpl]
 * @param {Pick<Console, 'warn' | 'error'>} [contexte.journal]
 * @param {(ms: number) => Promise<void>} [contexte.attente]
 * @param {{ autoriser: (cle: string) => boolean }} [contexte.limiteur]
 * @param {(evenement: string, variante: string) => void} [contexte.compter] compte l'inscription (cockpit)
 * @returns {Promise<Response>}
 */
export async function traiterLead(request, contexte = {}) {
  const { env = {}, fetchImpl = fetch, journal = console, attente, limiteur = limiteurParDefaut, compter } = contexte;

  if (request.method !== 'POST') return repondre(405, { ok: false, erreur: 'methode' }, { Allow: 'POST' });
  if (!memeOrigine(request)) return repondre(403, { ok: false, erreur: 'origine' });
  if (!(request.headers.get('content-type') ?? '').toLowerCase().startsWith('application/json')) {
    return repondre(415, { ok: false, erreur: 'format' });
  }

  let texte;
  try {
    texte = await request.text();
  } catch {
    return repondre(400, { ok: false, erreur: 'format' });
  }
  if (texte.length > TAILLE_MAX_DEMANDE) return repondre(413, { ok: false, erreur: 'format' });

  /** @type {Record<string, unknown>} */
  let donnees;
  try {
    const lu = JSON.parse(texte);
    if (!lu || typeof lu !== 'object' || Array.isArray(lu)) throw new Error('format');
    donnees = lu;
  } catch {
    return repondre(400, { ok: false, erreur: 'format' });
  }

  // Anti-spam : champ piège rempli, ou formulaire envoyé plus vite qu'une personne ne le peut.
  const piege = donnees[CHAMP_PIEGE];
  const delai = donnees.delai;
  const robot =
    (typeof piege === 'string' && piege.trim() !== '') ||
    typeof delai !== 'number' ||
    !Number.isFinite(delai) ||
    delai < DELAI_MINIMAL_MS;
  if (robot) {
    journal.warn('lead : envoi écarté par l’anti-spam');
    return repondre(200, { ok: true });
  }

  if (!limiteur.autoriser(adresseCliente(request))) {
    journal.warn('lead : limitation atteinte');
    return repondre(429, { ok: false, erreur: 'limite' }, { 'Retry-After': '120' });
  }

  const prenom = nettoyerPrenom(donnees.prenom);
  const email = nettoyerEmail(donnees.email);
  const telephoneSaisi = typeof donnees.telephone === 'string' ? donnees.telephone.trim() : '';
  // Le pays choisi dans le formulaire donne l'indicatif (France par défaut).
  const pays = typeof donnees.pays === 'string' ? donnees.pays : 'FR';
  const telephone = telephoneSaisi ? nettoyerTelephone(telephoneSaisi, pays) : '';

  /** @type {Record<string, string>} */
  const champs = {};
  if (!prenom) champs.prenom = 'invalide';
  if (!email) champs.email = 'invalide';
  if (telephoneSaisi && !telephone) champs.telephone = 'invalide';
  if (Object.keys(champs).length > 0) return repondre(400, { ok: false, erreur: 'validation', champs });

  // Previews et développement : aucun faux lead dans le compte.
  if ((env.VERCEL_ENV ?? 'development') !== 'production') {
    const adresseDeTest = nettoyerEmail(env.LEAD_TEST_EMAIL ?? '');
    if (!adresseDeTest || email !== adresseDeTest) return repondre(200, { ok: true, simulation: true });
  }

  if (!env.ACTIVECAMPAIGN_API_URL || !env.ACTIVECAMPAIGN_API_KEY) {
    journal.error('lead : variables ActiveCampaign absentes');
    return repondre(503, { ok: false, erreur: 'indisponible' });
  }

  const page = nettoyerSlug(donnees.page);
  const contact = construireContact({
    prenom,
    email,
    telephone,
    source: typeof donnees.source === 'string' ? donnees.source : '',
    utm: nettoyerUTM(donnees.utm),
    page,
  });

  const resultat = await synchroniserContact({
    apiUrl: env.ACTIVECAMPAIGN_API_URL,
    apiKey: env.ACTIVECAMPAIGN_API_KEY,
    contact,
    fetchImpl,
    ...(attente ? { attente } : {}),
  });

  if (!resultat.ok) {
    // Jamais de prénom, d'email ni de téléphone ici.
    journal.error('lead : échec ActiveCampaign', {
      statut: resultat.statut,
      tentatives: resultat.tentatives,
      motif: resultat.motif ?? 'refus',
    });
    return repondre(502, { ok: false, erreur: 'indisponible' });
  }

  // L'inscription est enregistrée : on la compte pour le cockpit, sans jamais faire échouer la réponse.
  try {
    compter?.('inscrits', page);
  } catch {
    /* le compteur ne doit jamais gêner une inscription */
  }

  return repondre(200, { ok: true });
}
