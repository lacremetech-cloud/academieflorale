// @ts-check
/**
 * Suivi des rendez-vous : à chaque appel réservé pour le tunnel VSL dans iClosed,
 * - la fiche ActiveCampaign reçoit le tag de rendez-vous, « Prise de RDV » = VSL
 *   (ce qui lance « Onboarding Call » et arrête la séquence d'emails) et « Nom de l'event » ;
 * - Meta reçoit l'événement « Rendez-vous programmé » (API de conversion) ;
 * - le cockpit retient l'appel, pour ne jamais le traiter deux fois.
 * Une annulation pose le tag d'annulation.
 *
 * Le serveur va lui-même lire les appels récents dans iClosed, avec la clé du
 * cockpit (ICLOSED_API_KEY). Il ne fait donc confiance à aucun message reçu :
 * /api/booking n'est qu'un signal « va voir », envoyé toutes les dix minutes par
 * Vercel, par le webhook d'iClosed s'il est réglé, et par la page merci call.
 * Son contenu est ignoré : il n'y a pas de secret à partager avec iClosed.
 *
 * Règles :
 * - aucune donnée personnelle dans les journaux ni dans la base (empreinte de l'email seulement) ;
 * - hors production, rien n'est écrit, sauf dans ActiveCampaign pour l'adresse de test ;
 * - aucun appel réservé avant le début du suivi n'est repris.
 */
import { clePub, joursEntre } from '../partage/attribution.js';
import { jourParis } from '../partage/cockpit.js';
import { accesCompteurs, executer } from '../partage/compteurs.js';
import { DOMAINE_PUBLIC } from '../partage/site.js';
import { nettoyerEmail } from '../partage/validation.js';
import { synchroniserContact } from './activecampaign.js';
import { empreinteEmail } from './empreinte.js';
import { demander, ErreurIclosed, estAnnule, instantDe, lireAppels, lister, trouverEvent, utmDe } from './iclosed.js';
import { accesConversions, construireEvenement, envoiPermis, envoyerEvenement, regleConsentement } from './meta-conversions.js';
import { CHAMPS, RDV_RECUL_MS, SUIVI_DEPUIS, TAGS } from './reglages.js';
import { repondre } from './reponse.js';
import { CLE_VERROU_RDV, cleRdv, lireInscriptions, noterEtat } from './suivi.js';

/** Longueur maximale du nom d'event écrit dans ActiveCampaign. */
const NOM_EVENT_MAX = 120;
/** Durée du verrou, en secondes : deux passages ne se marchent jamais dessus. */
const VERROU_S = 25;

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

/** @param {unknown} brut */
const nomEventPropre = (brut) =>
  (typeof brut === 'string' ? brut : '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOM_EVENT_MAX);

/**
 * Ce que la base retient d'un appel suivi.
 * @typedef {object} FicheRdv
 * @property {'reserve' | 'annule'} etat
 * @property {number} t instant de la réservation
 * @property {string} jour jour de la réservation, à Paris
 * @property {string} h empreinte de l'email, '' sans email
 * @property {string} pub clé de la publicité d'arrivée, '' si inconnue
 * @property {number | null} delai jours entre l'inscription et la réservation
 * @property {0 | 1} ac 1 quand ActiveCampaign est à jour
 * @property {number} meta 1 : envoyé à Meta ; 0 : à envoyer ; -1 : sans accord ; -2 : trop ancien
 */

/**
 * Lit les appels récents de l'event du tunnel et traite ceux qui ne l'ont pas été.
 * @param {object} [contexte]
 * @param {Record<string, string | undefined>} [contexte.env]
 * @param {typeof fetch} [contexte.fetchImpl]
 * @param {Date} [contexte.maintenant]
 * @param {Pick<Console, 'warn' | 'error'>} [contexte.journal]
 * @param {(ms: number) => Promise<void>} [contexte.attente]
 * @returns {Promise<{ etat: 'ok' | 'a-brancher' | 'occupe' | 'erreur', vus?: number, nouveaux?: number, annules?: number, echecs?: number, simulation?: boolean }>}
 */
export async function synchroniserRdv(contexte = {}) {
  const { env = {}, fetchImpl = fetch, maintenant = new Date(), journal = console, attente } = contexte;
  const cle = (env.ICLOSED_API_KEY ?? '').trim();
  if (!cle) return { etat: 'a-brancher' };
  const production = env.VERCEL_ENV === 'production';
  const base = accesCompteurs(env);
  // En production, la base est indispensable : elle retient les appels déjà traités.
  if (production && !base) return { etat: 'a-brancher' };
  const instant = maintenant.getTime();

  if (production && base) {
    try {
      const [pose] = await executer(base, [['SET', CLE_VERROU_RDV, String(instant), 'NX', 'EX', String(VERROU_S)]], fetchImpl, 2500);
      if (pose !== 'OK') return { etat: 'occupe' };
    } catch {
      return { etat: 'erreur' };
    }
  }

  /** @type {any[]} */
  let appels;
  try {
    const event = await trouverEvent(cle, fetchImpl);
    if (!event) {
      journal.error('booking : event du tunnel introuvable dans iClosed');
      return { etat: 'erreur' };
    }
    const commun = { eventIds: event, eventType: 'ALL' };
    const debut = new Date(instant - RDV_RECUL_MS).toISOString();
    const fin = new Date(instant + 86400000).toISOString();
    // Les appels réservés récemment, et ceux qui ont changé récemment (annulations).
    const [recents, modifies] = await Promise.all([
      lister('/v1/eventCalls', { ...commun, createdAtStart: debut, createdAtEnd: fin }, 100, lireAppels, cle, fetchImpl),
      demander('/v1/eventCalls', { ...commun, orderColumn: 'updatedAt', orderBy: 'desc', limit: '50', page: '0' }, cle, fetchImpl).then(
        (corps) => (Array.isArray(lireAppels(corps).lignes) ? /** @type {any[]} */ (lireAppels(corps).lignes) : []),
      ),
    ]);
    const parId = new Map();
    for (const appel of [...recents, ...modifies]) {
      const id = String(appel?.id ?? '');
      const cree = instantDe(appel?.createdAt);
      const modifie = instantDe(appel?.updatedAt ?? appel?.createdAt);
      if (!/^[\w-]{1,60}$/.test(id) || Number.isNaN(cree)) continue;
      // Ni les appels d'avant le suivi, ni ceux qui n'ont pas bougé depuis trois jours.
      if (cree < Date.parse(SUIVI_DEPUIS) || Math.max(cree, Number.isNaN(modifie) ? cree : modifie) < instant - RDV_RECUL_MS) continue;
      parId.set(id, appel);
    }
    appels = [...parId.values()];
  } catch (erreur) {
    journal.error('booking : lecture d’iClosed impossible', { motif: erreur instanceof ErreurIclosed ? 'refus' : 'reseau' });
    return { etat: 'erreur' };
  }

  // Ce que la base sait déjà de ces appels (en production seulement).
  /** @type {Map<string, FicheRdv>} */
  const connus = new Map();
  /** @param {any} appel */
  const moisDe = (appel) => jourParis(instantDe(appel.createdAt)).slice(0, 7);
  if (production && base && appels.length > 0) {
    /** @type {Map<string, string[]>} */
    const parMois = new Map();
    for (const appel of appels) parMois.set(moisDe(appel), [...(parMois.get(moisDe(appel)) ?? []), String(appel.id)]);
    try {
      const mois = [...parMois.keys()];
      const lus = await executer(base, mois.map((m) => ['HMGET', cleRdv(m), ...(parMois.get(m) ?? [])]), fetchImpl, 4000);
      mois.forEach((m, rang) => {
        (parMois.get(m) ?? []).forEach((id, place) => {
          try {
            const fiche = typeof lus[rang]?.[place] === 'string' ? JSON.parse(lus[rang][place]) : null;
            if (fiche && typeof fiche === 'object') connus.set(id, fiche);
          } catch {
            /* fiche illisible : l'appel sera retraité */
          }
        });
      });
    } catch {
      // Sans la mémoire des appels déjà traités, mieux vaut ne rien faire que tout refaire.
      return { etat: 'erreur' };
    }
  }

  const adresseDeTest = nettoyerEmail(env.LEAD_TEST_EMAIL ?? '');
  const acRegle = Boolean(env.ACTIVECAMPAIGN_API_URL && env.ACTIVECAMPAIGN_API_KEY);
  const metaRegle = production && accesConversions(env) !== null;
  const emails = appels.map((appel) => nettoyerEmail(appel?.inviteeEmail ?? appel?.contact?.email ?? ''));
  const inscriptions = production ? await lireInscriptions(env, emails.filter(Boolean), { fetchImpl, avecContexte: true }) : new Map();

  /** @param {string} email @param {Record<string, unknown>} contact */
  const ecrireAC = async (email, contact) => {
    if (!acRegle || !(production || (adresseDeTest && email === adresseDeTest))) return false;
    const resultat = await synchroniserContact({
      apiUrl: String(env.ACTIVECAMPAIGN_API_URL),
      apiKey: String(env.ACTIVECAMPAIGN_API_KEY),
      contact,
      fetchImpl,
      ...(attente ? { attente } : {}),
    });
    // Jamais d'email ici.
    if (!resultat.ok) journal.error('booking : échec ActiveCampaign', { statut: resultat.statut, motif: resultat.motif ?? 'refus' });
    return resultat.ok;
  };

  let nouveaux = 0;
  let annules = 0;
  let echecs = 0;
  /** @type {(string | number)[][]} */
  const ecritures = [];

  for (const [rang, appel] of appels.entries()) {
    const id = String(appel.id);
    const email = emails[rang] ?? '';
    const empreinte = email ? empreinteEmail(email) : '';
    const connu = connus.get(id);
    const annule = estAnnule(appel);
    const reserveLe = instantDe(appel.createdAt);
    const suivi = inscriptions.get(empreinte);

    if (connu?.etat === 'annule') continue;
    if (connu && !annule && connu.ac === 1 && (connu.meta === 1 || connu.meta === -2 || !metaRegle)) continue;

    const avant = connu ? JSON.stringify(connu) : '';
    /** @type {FicheRdv} */
    const fiche = connu ?? {
      etat: annule ? 'annule' : 'reserve',
      t: reserveLe,
      jour: jourParis(reserveLe),
      h: empreinte,
      pub: suivi?.inscription?.pub || clePub(utmDe(appel)),
      delai: suivi?.inscription ? joursEntre(suivi.inscription.jour, jourParis(reserveLe)) : null,
      ac: 0,
      meta: 0,
    };

    if (annule) {
      // Un appel annulé avant d'avoir été vu ne laisse aucune trace ailleurs que dans la base.
      if (connu) {
        if (email && !(await ecrireAC(email, construireContactRdv({ email, annule: true })))) {
          echecs += 1;
          continue;
        }
      }
      fiche.etat = 'annule';
      annules += 1;
    } else {
      if (!connu) nouveaux += 1;
      if (email && fiche.ac !== 1) {
        const nomEvent = nomEventPropre(appel?.event?.name) || 'candidature-vsl';
        fiche.ac = (await ecrireAC(email, construireContactRdv({ email, nomEvent }))) ? 1 : 0;
        if (fiche.ac === 0 && acRegle && (production || email === adresseDeTest)) echecs += 1;
      }
      if (email && metaRegle && fiche.meta !== 1 && fiche.meta !== -2) {
        if (!envoiPermis(suivi?.inscription?.accord === 1, regleConsentement(env))) {
          fiche.meta = -1;
        } else {
          const surLeSite = Boolean(suivi?.contexte?.ua);
          const resultat = await envoyerEvenement(
            env,
            construireEvenement({
              nom: 'Schedule',
              id: `rdv-${id}`,
              instant: new Date(reserveLe),
              origine: surLeSite ? 'website' : 'other',
              adresse: `${DOMAINE_PUBLIC}/call`,
              personne: {
                email,
                telephone: typeof appel?.phoneNumber === 'string' ? appel.phoneNumber : '',
                ip: suivi?.contexte?.ip,
                ua: suivi?.contexte?.ua,
                fbp: suivi?.contexte?.fbp,
                fbc: suivi?.inscription?.fbc,
              },
            }),
            { fetchImpl, maintenant },
          );
          fiche.meta = resultat.etat === 'ok' ? 1 : resultat.etat === 'trop-ancien' ? -2 : 0;
          if (resultat.etat === 'erreur') {
            echecs += 1;
            journal.error('booking : échec de l’API de conversion', { statut: resultat.statut ?? 0 });
          }
          if (resultat.etat !== 'a-brancher') {
            await noterEtat(env, 'conversions', { t: maintenant.toISOString(), nom: 'Schedule', ok: resultat.etat === 'ok', detail: resultat.detail ?? '' }, { fetchImpl });
          }
        }
      }
    }
    // Seul ce qui a changé est réécrit.
    if (JSON.stringify(fiche) !== avant) ecritures.push(['HSET', cleRdv(moisDe(appel)), id, JSON.stringify(fiche)]);
  }

  if (production && base) {
    try {
      if (ecritures.length > 0) await executer(base, ecritures, fetchImpl, 4000);
    } catch {
      journal.error('booking : la base n’a pas retenu les appels traités');
      echecs += 1;
    }
    await noterEtat(env, 'rdv', { t: maintenant.toISOString(), vus: appels.length, nouveaux, annules, echecs }, { fetchImpl });
  }
  return { etat: 'ok', vus: appels.length, nouveaux, annules, echecs, simulation: !production };
}

/**
 * GET ou POST /api/booking : lance le suivi des rendez-vous. Le contenu de la
 * demande est ignoré, et la réponse ne dit rien des appels.
 * @param {Request} request
 * @param {Parameters<typeof synchroniserRdv>[0]} [contexte]
 * @returns {Promise<Response>}
 */
export async function traiterRdv(request, contexte = {}) {
  if (request.method !== 'GET' && request.method !== 'POST') {
    return repondre(405, { ok: false, erreur: 'methode' }, { Allow: 'GET, POST' });
  }
  const resultat = await synchroniserRdv(contexte);
  if (resultat.etat === 'a-brancher') return repondre(503, { ok: false, erreur: 'indisponible' });
  if (resultat.etat === 'erreur') return repondre(502, { ok: false, erreur: 'indisponible' });
  return repondre(200, { ok: true });
}
