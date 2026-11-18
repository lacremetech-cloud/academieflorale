// @ts-check
/**
 * Cockpit, source « Wistia » : chargements, lectures et heures regardées de la
 * vidéo de vente, jour par jour.
 *
 * Variable d'environnement (saisie dans Vercel) :
 * - WISTIA_API_TOKEN : jeton d'API Wistia avec le droit « Read detailed stats ».
 */
import { joursEcoules } from '../../partage/cockpit.js';
import { WISTIA_VSL } from '../../partage/wistia.js';

/** Version de l'API Wistia, exigée dans chaque demande. */
const VERSION = '2026-09';

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string} options.mois
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Date} [options.maintenant]
 * @returns {Promise<{ etat: 'ok' | 'a-brancher' | 'erreur', detail?: string, jours: Record<string, Record<string, number>> }>}
 */
export async function lireWistia({ env, mois, fetchImpl = fetch, maintenant = new Date() }) {
  const jeton = (env.WISTIA_API_TOKEN ?? '').trim();
  if (!jeton) return { etat: 'a-brancher', jours: {} };

  // Jusqu'à aujourd'hui seulement : interrogé sur une période qui dépasse le jour
  // même, Wistia a répondu zéro pour tout le mois en cours (constaté le 18/11/2026).
  const jours = joursEcoules(mois, maintenant);
  if (jours.length === 0) return { etat: 'ok', jours: {} };
  const parametres = new URLSearchParams({ start_date: jours[0] ?? '', end_date: jours[jours.length - 1] ?? '' });
  try {
    const reponse = await fetchImpl(`https://api.wistia.com/modern/stats/medias/${WISTIA_VSL}/by_date?${parametres}`, {
      headers: { Authorization: `Bearer ${jeton}`, 'X-Wistia-API-Version': VERSION, Accept: 'application/json' },
      signal: AbortSignal.timeout(9000),
    });
    const corps = await reponse.json().catch(() => null);
    if (!reponse.ok) {
      const message = typeof corps?.error === 'string' ? corps.error : typeof corps?.message === 'string' ? corps.message : 'erreur';
      return { etat: 'erreur', detail: `Wistia a répondu ${reponse.status} : ${message.slice(0, 160)}`, jours: {} };
    }
    /** @type {Record<string, Record<string, number>>} */
    const resultat = {};
    for (const ligne of Array.isArray(corps) ? corps : []) {
      if (typeof ligne?.date !== 'string') continue;
      resultat[ligne.date.slice(0, 10)] = {
        chargements: Number(ligne.load_count) || 0,
        lectures: Number(ligne.play_count) || 0,
        heures: Number(ligne.hours_watched) || 0,
      };
    }
    return { etat: 'ok', jours: resultat };
  } catch (erreur) {
    const nom = erreur instanceof Error ? erreur.name : '';
    return { etat: 'erreur', detail: nom === 'TimeoutError' ? 'Wistia ne répond pas (délai dépassé)' : 'Wistia est injoignable', jours: {} };
  }
}
