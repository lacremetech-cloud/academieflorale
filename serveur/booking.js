// @ts-check
/**
 * Réception du webhook iClosed : à chaque appel réservé pour le tunnel VSL, met à
 * jour la fiche ActiveCampaign (tag de rendez-vous, « Prise de RDV », « Nom de
 * l'event »), sans Make ni outil intermédiaire.
 *
 * Règles :
 * - l'adresse est protégée par un secret, gardé dans les variables d'environnement ;
 * - seuls les events iClosed du tunnel VSL et les déclencheurs attendus sont traités ;
 * - aucune donnée personnelle dans les journaux ;
 * - sur une preview, on n'écrit dans ActiveCampaign que pour l'adresse de test.
 *
 * iClosed ne publie pas d'exemple complet de ses webhooks (ils sont en bêta) : la
 * lecture est donc tolérante sur l'emplacement des champs. Quand elle ne trouve pas
 * ce qu'il lui faut, elle journalise la forme reçue (les noms des champs, jamais
 * leurs valeurs) pour qu'on puisse l'ajuster à la recette.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { nettoyerEmail } from '../partage/validation.js';
import { synchroniserContact } from './activecampaign.js';
import { repondre } from './reponse.js';
import { CHAMPS, DECLENCHEURS, EVENTS_ICLOSED, SECRET_MIN, TAGS, TAILLE_MAX_WEBHOOK } from './reglages.js';

/** Longueur maximale du nom d'event écrit dans ActiveCampaign. */
const NOM_EVENT_MAX = 120;

/**
 * Nom de champ ramené à l'essentiel : « event_type », « eventType » et « Event Type »
 * deviennent tous « eventtype ».
 * @param {string} nom
 */
const essentiel = (nom) => nom.toLowerCase().replace(/[^a-z0-9]/g, '');

/**
 * Parcourt la charge utile en largeur : les champs les plus proches de la racine
 * sortent en premier. Borné, pour qu'une charge anormale ne coûte rien.
 * @param {unknown} racine
 * @returns {Generator<[string, unknown]>} couples (nom ramené à l'essentiel, valeur)
 */
function* champs(racine) {
  const file = [racine];
  let vus = 0;
  while (file.length > 0 && vus < 2000) {
    const noeud = file.shift();
    if (!noeud || typeof noeud !== 'object') continue;
    for (const [nom, valeur] of Object.entries(noeud)) {
      vus += 1;
      yield [essentiel(nom), valeur];
      if (valeur && typeof valeur === 'object') file.push(valeur);
    }
  }
}

/**
 * Premier texte non vide trouvé sous l'un de ces noms, où qu'il soit.
 * @param {unknown} racine
 * @param {string[]} noms
 */
function texte(racine, noms) {
  for (const [nom, valeur] of champs(racine)) {
    if (noms.includes(nom) && typeof valeur === 'string' && valeur.trim() !== '') return valeur.trim();
  }
  return '';
}

/**
 * Texte d'un champ de cet objet, sans descendre plus bas.
 * @param {object} objet
 * @param {string[]} noms
 */
function texteDirect(objet, noms) {
  for (const [nom, valeur] of Object.entries(objet)) {
    if (noms.includes(essentiel(nom)) && typeof valeur === 'string' && valeur.trim() !== '') return valeur.trim();
  }
  return '';
}

/**
 * Premier objet trouvé sous l'un de ces noms, où qu'il soit.
 * @param {unknown} racine
 * @param {string[]} noms
 * @returns {object | null}
 */
function objet(racine, noms) {
  for (const [nom, valeur] of champs(racine)) {
    if (noms.includes(nom) && valeur && typeof valeur === 'object' && !Array.isArray(valeur)) return valeur;
  }
  return null;
}

/**
 * Ce qu'il faut savoir d'un webhook iClosed.
 * L'email est celui de l'invitée : jamais celui du closer ni du setter, qui
 * figurent aussi dans la charge utile.
 * @param {unknown} donnees
 * @returns {{ type: 'reserve' | 'annule' | 'autre' | '', event: string, nomEvent: string, email: string }}
 */
export function lireReservation(donnees) {
  const declencheur = texte(donnees, ['hooktype', 'trigger', 'triggername']).toLowerCase();
  /** @type {'reserve' | 'annule' | 'autre' | ''} */
  let type = '';
  if (DECLENCHEURS.reserve.includes(declencheur)) type = 'reserve';
  else if (DECLENCHEURS.annule.includes(declencheur)) type = 'annule';
  else if (declencheur) type = 'autre';

  const typeEvent = objet(donnees, ['eventtype', 'eventtypedata']);
  const slug = (typeEvent ? texteDirect(typeEvent, ['slug']) : '') || texte(donnees, ['eventtypeslug', 'eventslug']);
  const nom = (typeEvent ? texteDirect(typeEvent, ['name']) : '') || texte(donnees, ['eventtypename', 'eventname']);

  const invitee = objet(donnees, ['invitee', 'inviteedata']);
  const email =
    (invitee ? texteDirect(invitee, ['email', 'inviteeemail', 'emailaddress']) : '') ||
    texte(donnees, ['inviteeemail']);

  // Le nom de l'event dans son adresse : on garde le dernier segment, sans paramètres.
  const event = (slug.split(/[?#]/)[0] ?? '').split('/').filter(Boolean).pop() ?? '';

  return {
    type,
    event: event.toLowerCase(),
    nomEvent: nom
      .replace(/[\u0000-\u001f\u007f]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, NOM_EVENT_MAX),
    email: nettoyerEmail(email),
  };
}

/**
 * Forme d'une charge utile : les noms de ses champs, jamais leurs valeurs.
 * Un nom inhabituel (le texte d'une question du formulaire, par exemple) n'est
 * pas recopié.
 * @param {unknown} donnees
 * @param {number} [profondeurMax]
 * @param {number} [limite]
 * @returns {string[]}
 */
export function forme(donnees, profondeurMax = 3, limite = 80) {
  /** @type {Set<string>} */
  const chemins = new Set();
  /**
   * @param {unknown} noeud
   * @param {string} prefixe
   * @param {number} profondeur
   */
  const visiter = (noeud, prefixe, profondeur) => {
    if (!noeud || typeof noeud !== 'object') return;
    if (Array.isArray(noeud)) {
      if (noeud.length > 0) visiter(noeud[0], `${prefixe}[]`, profondeur);
      return;
    }
    for (const [nom, valeur] of Object.entries(noeud)) {
      if (chemins.size >= limite) return;
      const propre = /^[A-Za-z0-9_#-]{1,40}$/.test(nom) && !/^\d{5,}$/.test(nom) ? nom : '«autre»';
      const chemin = prefixe ? `${prefixe}.${propre}` : propre;
      chemins.add(chemin);
      if (profondeur < profondeurMax) visiter(valeur, chemin, profondeur + 1);
    }
  };
  visiter(donnees, '', 1);
  return [...chemins];
}

/**
 * Prépare la mise à jour envoyée à ActiveCampaign. La fiche est retrouvée par son
 * email ; rien d'autre n'est modifié que le tag et les deux champs de rendez-vous.
 * @param {object} reservation
 * @param {string} reservation.email
 * @param {string} [reservation.nomEvent]
 * @param {boolean} [reservation.annule]
 */
export function construireContactRdv({ email, nomEvent = '', annule = false }) {
  if (annule) return { email, tags: [TAGS.rdvAnnule] };
  /** @type {{ field: string, value: string }[]} */
  const fieldValues = [{ field: CHAMPS.priseDeRdv.numero, value: CHAMPS.priseDeRdv.valeur }];
  if (nomEvent) fieldValues.push({ field: CHAMPS.nomEvent.numero, value: nomEvent });
  return { email, fieldValues, tags: [TAGS.rdv] };
}

/**
 * Secret présenté par l'appelant. iClosed ne documente pas d'en-tête : le secret
 * se place alors dans l'adresse du webhook (…/api/booking?cle=…). Les deux
 * en-têtes restent acceptés pour un outil qui saurait les envoyer.
 * @param {Request} request
 */
function secretRecu(request) {
  const enTete = request.headers.get('x-webhook-secret');
  if (enTete) return enTete.trim();
  const autorisation = request.headers.get('authorization') ?? '';
  if (autorisation.toLowerCase().startsWith('bearer ')) return autorisation.slice(7).trim();
  return new URL(request.url).searchParams.get('cle') ?? '';
}

/**
 * Comparaison à durée constante : le temps de réponse ne renseigne pas sur le secret.
 * @param {string} recu
 * @param {string} attendu
 */
function memeSecret(recu, attendu) {
  const a = createHash('sha256').update(recu).digest();
  const b = createHash('sha256').update(attendu).digest();
  return timingSafeEqual(a, b);
}

/**
 * @param {Request} request
 * @param {object} [contexte]
 * @param {Record<string, string | undefined>} [contexte.env]
 * @param {typeof fetch} [contexte.fetchImpl]
 * @param {Pick<Console, 'warn' | 'error'>} [contexte.journal]
 * @param {(ms: number) => Promise<void>} [contexte.attente]
 * @returns {Promise<Response>}
 */
export async function traiterReservation(request, contexte = {}) {
  const { env = {}, fetchImpl = fetch, journal = console, attente } = contexte;

  if (request.method !== 'POST') return repondre(405, { ok: false, erreur: 'methode' }, { Allow: 'POST' });

  // Sans secret réglé, la fonction reste fermée.
  const secret = (env.ICLOSED_WEBHOOK_SECRET ?? '').trim();
  if (secret.length < SECRET_MIN) {
    journal.error('booking : secret du webhook absent ou trop court');
    return repondre(503, { ok: false, erreur: 'indisponible' });
  }
  if (!memeSecret(secretRecu(request), secret)) return repondre(401, { ok: false, erreur: 'acces' });

  let corps;
  try {
    corps = await request.text();
  } catch {
    return repondre(400, { ok: false, erreur: 'format' });
  }
  if (corps.length > TAILLE_MAX_WEBHOOK) return repondre(413, { ok: false, erreur: 'format' });

  /** @type {unknown} */
  let donnees;
  try {
    donnees = JSON.parse(corps);
    if (!donnees || typeof donnees !== 'object') throw new Error('format');
  } catch {
    journal.warn('booking : corps illisible', { type: (request.headers.get('content-type') ?? '').slice(0, 60) });
    return repondre(400, { ok: false, erreur: 'format' });
  }

  const reservation = lireReservation(donnees);

  // Autres déclencheurs (contact créé, appel déplacé…) : rien à écrire.
  if (reservation.type !== 'reserve' && reservation.type !== 'annule') {
    if (reservation.type === '') {
      journal.warn('booking : webhook non reconnu', { manque: 'declencheur', forme: forme(donnees) });
    }
    return repondre(200, { ok: true, ignore: 'declencheur' });
  }

  // Autres events du compte iClosed (webinaire, autres tunnels) : rien à écrire.
  if (!EVENTS_ICLOSED.includes(reservation.event)) {
    if (reservation.event === '') {
      journal.warn('booking : webhook non reconnu', { manque: 'event', forme: forme(donnees) });
    }
    return repondre(200, { ok: true, ignore: 'event' });
  }

  if (!reservation.email) {
    journal.warn('booking : webhook non reconnu', { manque: 'email', forme: forme(donnees) });
    return repondre(422, { ok: false, erreur: 'email' });
  }

  // Previews et développement : aucune écriture, sauf pour l'adresse de test.
  if ((env.VERCEL_ENV ?? 'development') !== 'production') {
    const adresseDeTest = nettoyerEmail(env.LEAD_TEST_EMAIL ?? '');
    if (!adresseDeTest || reservation.email !== adresseDeTest) return repondre(200, { ok: true, simulation: true });
  }

  if (!env.ACTIVECAMPAIGN_API_URL || !env.ACTIVECAMPAIGN_API_KEY) {
    journal.error('booking : variables ActiveCampaign absentes');
    return repondre(503, { ok: false, erreur: 'indisponible' });
  }

  const resultat = await synchroniserContact({
    apiUrl: env.ACTIVECAMPAIGN_API_URL,
    apiKey: env.ACTIVECAMPAIGN_API_KEY,
    contact: construireContactRdv({
      email: reservation.email,
      // À défaut de nom, le nom de l'event dans son adresse.
      nomEvent: reservation.nomEvent || reservation.event,
      annule: reservation.type === 'annule',
    }),
    fetchImpl,
    ...(attente ? { attente } : {}),
  });

  if (!resultat.ok) {
    // Jamais d'email ici.
    journal.error('booking : échec ActiveCampaign', {
      statut: resultat.statut,
      tentatives: resultat.tentatives,
      motif: resultat.motif ?? 'refus',
    });
    return repondre(502, { ok: false, erreur: 'indisponible' });
  }

  return repondre(200, { ok: true });
}
