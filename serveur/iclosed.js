// @ts-check
/**
 * Client de l'API publique d'iClosed (https://public.api.iclosed.io), côté serveur.
 * Il sert au cockpit (appels du mois) et au suivi des rendez-vous (/api/booking).
 *
 * Variable d'environnement (saisie dans Vercel) :
 * - ICLOSED_API_KEY : clé créée dans iClosed (Paramètres, Développeur, Clés API),
 *   collée telle qu'iClosed la donne, avec son préfixe. Deux droits de lecture
 *   suffisent : « Évènements » et « Appels d'évènements ».
 */
import { jourParis } from '../partage/cockpit.js';
import { ICLOSED_VSL } from '../partage/iclosed.js';

const BASE = 'https://public.api.iclosed.io';
const PAGES_MAX = 25;
/** Motifs d'absence de vente qui valent annulation. */
const MOTIFS_ANNULATION = ['CONTACT_CANCELLED', 'ADMIN_CANCELLED'];

/** Event déjà retrouvé (son identifiant ne change pas) : évite une demande à chaque passage. */
const eventsConnus = new Map();

export class ErreurIclosed extends Error {}

/**
 * @param {string} chemin
 * @param {Record<string, string>} parametres
 * @param {string} cle
 * @param {typeof fetch} fetchImpl
 */
export async function demander(chemin, parametres, cle, fetchImpl) {
  const reponse = await fetchImpl(`${BASE}${chemin}?${new URLSearchParams(parametres)}`, {
    headers: { Authorization: `Bearer ${cle}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(9000),
  });
  const corps = await reponse.json().catch(() => null);
  if (!reponse.ok) {
    const message = typeof corps?.message === 'string' ? corps.message : (corps?.message?.message ?? corps?.error ?? 'erreur');
    throw new ErreurIclosed(`iClosed a répondu ${reponse.status} : ${String(message).slice(0, 160)}`);
  }
  return corps;
}

/**
 * Toutes les pages d'une liste d'iClosed.
 * @param {string} chemin
 * @param {Record<string, string>} parametres
 * @param {number} parPage
 * @param {(corps: any) => { lignes: unknown, total: unknown }} lire
 * @param {string} cle
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<any[]>}
 */
export async function lister(chemin, parametres, parPage, lire, cle, fetchImpl) {
  const tout = [];
  for (let page = 0; page < PAGES_MAX; page += 1) {
    const corps = await demander(chemin, { ...parametres, limit: String(parPage), page: String(page) }, cle, fetchImpl);
    const { lignes, total } = lire(corps);
    const recues = Array.isArray(lignes) ? lignes : [];
    tout.push(...recues);
    if (recues.length < parPage || tout.length >= (Number(total) || 0)) break;
  }
  return tout;
}

/** Lit une page d'appels telle qu'iClosed la rend. */
export const lireAppels = (/** @type {any} */ corps) => ({ lignes: corps?.data?.eventCalls, total: corps?.data?.count });

/**
 * L'identifiant de l'event du tunnel VSL, retrouvé par son adresse.
 * @param {string} cle
 * @param {typeof fetch} fetchImpl
 * @returns {Promise<string>} '' s'il est introuvable
 */
export async function trouverEvent(cle, fetchImpl) {
  const lien = `${ICLOSED_VSL.compte}/${ICLOSED_VSL.event}`;
  const connu = eventsConnus.get(lien);
  if (connu) return connu;
  const corps = await demander('/v1/events', { search: ICLOSED_VSL.event, limit: '50' }, cle, fetchImpl);
  const trouve = (Array.isArray(corps?.data) ? corps.data : []).find(
    (/** @type {any} */ e) => String(e?.linkPrefix ?? '').toLowerCase() === lien.toLowerCase(),
  );
  if (!trouve?.id) return '';
  const id = String(trouve.id);
  eventsConnus.set(lien, id);
  return id;
}

/**
 * Les identifiants d'autres events du compte, retrouvés par la fin de leur adresse.
 * Une seule demande les retrouve tous ; un event introuvable manque dans la réponse.
 * @param {string} cle
 * @param {typeof fetch} fetchImpl
 * @param {readonly string[]} events fins d'adresse (« candidature », « setting »…)
 * @returns {Promise<Map<string, string>>} fin d'adresse → identifiant
 */
export async function trouverEvents(cle, fetchImpl, events) {
  const lienDe = (/** @type {string} */ event) => `${ICLOSED_VSL.compte}/${event}`.toLowerCase();
  if (events.some((event) => !eventsConnus.has(lienDe(event)))) {
    const corps = await demander('/v1/events', { limit: '100' }, cle, fetchImpl);
    for (const e of Array.isArray(corps?.data) ? corps.data : []) {
      const lien = String(e?.linkPrefix ?? '').toLowerCase();
      if (lien && e?.id) eventsConnus.set(lien, String(e.id));
    }
  }
  /** @type {Map<string, string>} */
  const trouves = new Map();
  for (const event of events) {
    const id = eventsConnus.get(lienDe(event));
    if (id) trouves.set(event, id);
  }
  return trouves;
}

/** L'adresse de l'event du tunnel, pour les messages d'erreur. */
export const LIEN_EVENT = `${ICLOSED_VSL.compte}/${ICLOSED_VSL.event}`;

/**
 * Une date d'iClosed, parfois sans fuseau (« 2025-12-10 19:23:01.299 ») : lue en UTC.
 * @param {unknown} texte
 * @returns {number} l'instant en millisecondes, NaN si la date est illisible
 */
export function instantDe(texte) {
  if (typeof texte !== 'string' || !texte) return Number.NaN;
  return Date.parse(/(Z|[+-]\d{2}:?\d{2})$/.test(texte) ? texte : `${texte.replace(' ', 'T')}Z`);
}

/**
 * @param {unknown} texte
 * @returns {string} le jour à Paris, ou ''
 */
export function jourDe(texte) {
  const instant = instantDe(texte);
  return Number.isNaN(instant) ? '' : jourParis(instant);
}

/** Un appel est-il annulé ? @param {any} appel */
export function estAnnule(appel) {
  const motifs = (Array.isArray(appel?.task) ? appel.task : []).map((/** @type {any} */ t) => t?.noSaleReason);
  return Boolean(appel?.cancelledBy || appel?.cancelReason || motifs.some((m) => MOTIFS_ANNULATION.includes(m)));
}

/** La prospecte ne s'est-elle pas présentée ? @param {any} appel */
export function estAbsente(appel) {
  return (Array.isArray(appel?.task) ? appel.task : []).some((/** @type {any} */ t) => t?.noSaleReason === 'NO_SHOW');
}

/**
 * Les paramètres de suivi (UTM) qu'iClosed a gardés pour un appel.
 * @param {any} appel
 * @returns {Record<string, string>}
 */
export function utmDe(appel) {
  /** @type {Record<string, string>} */
  const utm = {};
  for (const ligne of Array.isArray(appel?.utm) ? appel.utm : []) {
    const cle = typeof ligne?.utmKey === 'string' ? ligne.utmKey.trim().toLowerCase() : '';
    const valeur = typeof ligne?.utmValue === 'string' ? ligne.utmValue.trim() : '';
    if (/^[a-z_]{3,20}$/.test(cle) && valeur && !(cle in utm)) utm[cle] = valeur.slice(0, 200);
  }
  return utm;
}
