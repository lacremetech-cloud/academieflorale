// @ts-check
/**
 * Cockpit, source « iClosed » : les appels de l'event du tunnel VSL et leurs suites.
 * - appels : appels réservés ce jour-là (date de réservation) ;
 * - annules, absentes : parmi les appels prévus ce jour-là ;
 * - ventes, contracte : ventes enregistrées ce jour-là, et leur montant.
 * L'encaissé n'est pas lu ici : sa source reste à choisir.
 *
 * Variable d'environnement (saisie dans Vercel) :
 * - ICLOSED_API_KEY : clé créée dans iClosed (Settings, Developers, API Keys),
 *   collée telle qu'iClosed la donne, avec son préfixe.
 */
import { joursDuMois, jourParis } from '../../partage/cockpit.js';
import { ICLOSED_VSL } from '../../partage/iclosed.js';

const BASE = 'https://public.api.iclosed.io';
const PAGES_MAX = 25;
/** Motifs d'absence de vente qui valent annulation. */
const MOTIFS_ANNULATION = ['CONTACT_CANCELLED', 'ADMIN_CANCELLED'];

/** Event déjà retrouvé (son identifiant ne change pas) : évite une demande à chaque affichage. */
const eventsConnus = new Map();

class ErreurIclosed extends Error {}

/**
 * @param {string} chemin
 * @param {Record<string, string>} parametres
 * @param {string} cle
 * @param {typeof fetch} fetchImpl
 */
async function demander(chemin, parametres, cle, fetchImpl) {
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
async function lister(chemin, parametres, parPage, lire, cle, fetchImpl) {
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

/**
 * Une date d'iClosed, parfois sans fuseau (« 2025-12-10 19:23:01.299 ») : lue en UTC.
 * @param {unknown} texte
 * @returns {string} le jour à Paris, ou ''
 */
function jourDe(texte) {
  if (typeof texte !== 'string' || !texte) return '';
  const iso = /(Z|[+-]\d{2}:?\d{2})$/.test(texte) ? texte : `${texte.replace(' ', 'T')}Z`;
  return jourParis(iso);
}

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string} options.mois
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{ etat: 'ok' | 'a-brancher' | 'erreur', detail?: string, jours: Record<string, Record<string, number>> }>}
 */
export async function lireIclosed({ env, mois, fetchImpl = fetch }) {
  const cle = (env.ICLOSED_API_KEY ?? '').trim();
  if (!cle) return { etat: 'a-brancher', jours: {} };

  const lien = `${ICLOSED_VSL.compte}/${ICLOSED_VSL.event}`;
  const jours = joursDuMois(mois);
  const dansLeMois = new Set(jours);
  // Fenêtre élargie d'un jour de chaque côté : le tri par jour se fait ensuite à l'heure de Paris.
  const debut = new Date(Date.parse(`${jours[0]}T00:00:00Z`) - 86400000).toISOString();
  const fin = new Date(Date.parse(`${jours[jours.length - 1]}T23:59:59.999Z`) + 86400000).toISOString();

  /** @type {Record<string, Record<string, number>>} */
  const resultat = {};
  /** @param {string} jour @param {string} chiffre @param {number} [combien] */
  const ajouter = (jour, chiffre, combien = 1) => {
    if (!dansLeMois.has(jour)) return;
    const ligne = (resultat[jour] ??= { appels: 0, annules: 0, absentes: 0, ventes: 0, contracte: 0 });
    ligne[chiffre] = (ligne[chiffre] ?? 0) + combien;
  };

  try {
    // 1. L'event du tunnel, retrouvé par son adresse.
    let event = eventsConnus.get(lien);
    if (!event) {
      const corps = await demander('/v1/events', { search: ICLOSED_VSL.event, limit: '50' }, cle, fetchImpl);
      const trouve = (Array.isArray(corps?.data) ? corps.data : []).find(
        (/** @type {any} */ e) => String(e?.linkPrefix ?? '').toLowerCase() === lien.toLowerCase(),
      );
      if (!trouve?.id) return { etat: 'erreur', detail: `event « ${lien} » introuvable dans iClosed`, jours: {} };
      event = String(trouve.id);
      eventsConnus.set(lien, event);
    }

    const lireAppels = (/** @type {any} */ corps) => ({ lignes: corps?.data?.eventCalls, total: corps?.data?.count });
    const commun = { eventIds: event, eventType: 'ALL' };

    // 2. Les appels réservés dans le mois (date de réservation).
    const reserves = await lister('/v1/eventCalls', { ...commun, createdAtStart: debut, createdAtEnd: fin }, 100, lireAppels, cle, fetchImpl);
    for (const appel of reserves) ajouter(jourDe(appel?.createdAt), 'appels');

    // 3. Les appels prévus dans le mois : annulations et absences.
    const prevus = await lister('/v1/eventCalls', { ...commun, dateFrom: debut, dateTo: fin }, 100, lireAppels, cle, fetchImpl);
    for (const appel of prevus) {
      const jour = jourDe(appel?.dateTimeUTC ?? appel?.dateTime);
      const motifs = (Array.isArray(appel?.task) ? appel.task : []).map((/** @type {any} */ t) => t?.noSaleReason);
      if (appel?.cancelledBy || appel?.cancelReason || motifs.some((m) => MOTIFS_ANNULATION.includes(m))) ajouter(jour, 'annules');
      else if (motifs.includes('NO_SHOW')) ajouter(jour, 'absentes');
    }

    // 4. Les ventes enregistrées dans le mois, et leur montant.
    const ventes = await lister(
      '/v1/deals',
      { eventIds: event, timeFrom: debut, timeTo: fin },
      200,
      (corps) => ({ lignes: corps?.data?.deals, total: corps?.data?.count }),
      cle,
      fetchImpl,
    );
    for (const vente of ventes) {
      const jour = jourDe(vente?.time ?? vente?.createdAt);
      ajouter(jour, 'ventes');
      ajouter(jour, 'contracte', Number(vente?.value) || 0);
    }
  } catch (erreur) {
    if (erreur instanceof ErreurIclosed) return { etat: 'erreur', detail: erreur.message, jours: {} };
    const nom = erreur instanceof Error ? erreur.name : '';
    return { etat: 'erreur', detail: nom === 'TimeoutError' ? 'iClosed ne répond pas (délai dépassé)' : 'iClosed est injoignable', jours: {} };
  }
  return { etat: 'ok', jours: resultat };
}
