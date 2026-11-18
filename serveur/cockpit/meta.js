// @ts-check
/**
 * Cockpit, source « Meta Ads » : dépense, impressions et clics sur le lien, jour
 * par jour, pour le compte publicitaire.
 *
 * Variables d'environnement (saisies dans Vercel, jamais dans le repo) :
 * - META_ACCESS_TOKEN : jeton d'accès avec le droit « ads_read » (utilisateur système) ;
 * - META_AD_ACCOUNT_ID : identifiant du compte publicitaire, avec ou sans « act_ » ;
 * - META_CAMPAGNES (facultatif) : remplace le texte que doit contenir le nom d'une
 *   campagne pour être comptée (« VSL » sans cette variable). Vide : tout le compte ;
 * - META_API_VERSION (facultatif) : version de l'API, si celle par défaut expire.
 */
import { joursEcoules } from '../../partage/cockpit.js';
import { versionMeta } from '../meta-conversions.js';

const PAGES_MAX = 6;

/** Seules comptent les campagnes dont le nom contient ce texte (règle de nommage des campagnes du tunnel). */
export const CAMPAGNES_PAR_DEFAUT = 'VSL';

/**
 * Le texte que doit contenir le nom d'une campagne pour être comptée. Une chaîne
 * vide veut dire « tout le compte publicitaire ».
 * @param {Record<string, string | undefined>} env
 */
export function filtreCampagnes(env) {
  return (env.META_CAMPAGNES ?? CAMPAGNES_PAR_DEFAUT).trim().slice(0, 80);
}

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string} options.mois « 2026-11 »
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Date} [options.maintenant]
 * @returns {Promise<{ etat: 'ok' | 'a-brancher' | 'erreur', detail?: string, jours: Record<string, Record<string, number>> }>}
 */
export async function lireMeta({ env, mois, fetchImpl = fetch, maintenant = new Date() }) {
  const jeton = (env.META_ACCESS_TOKEN ?? '').trim();
  const compte = (env.META_AD_ACCOUNT_ID ?? '').trim().replace(/^act_/, '');
  if (!jeton || !compte) return { etat: 'a-brancher', jours: {} };
  if (!/^\d{5,20}$/.test(compte)) return { etat: 'erreur', detail: 'identifiant du compte publicitaire invalide', jours: {} };

  const version = versionMeta(env);
  // Jusqu'à aujourd'hui seulement : aucune source n'est interrogée sur des jours à venir.
  const jours = joursEcoules(mois, maintenant);
  if (jours.length === 0) return { etat: 'ok', jours: {} };
  const parametres = new URLSearchParams({
    level: 'account',
    fields: 'spend,impressions,inline_link_clicks',
    time_range: JSON.stringify({ since: jours[0], until: jours[jours.length - 1] }),
    time_increment: '1',
    limit: '100',
  });
  const filtre = filtreCampagnes(env);
  if (filtre) {
    parametres.set('filtering', JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: filtre }]));
  }

  /** @type {Record<string, Record<string, number>>} */
  const resultat = {};
  try {
    for (let page = 0; page < PAGES_MAX; page += 1) {
      // Le jeton part dans un en-tête, jamais dans l'adresse.
      const reponse = await fetchImpl(`https://graph.facebook.com/${version}/act_${compte}/insights?${parametres}`, {
        headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(9000),
      });
      const corps = await reponse.json().catch(() => null);
      if (!reponse.ok) {
        const erreur = corps?.error ?? {};
        // Le message de Meta ne contient pas le jeton : il dit ce qui cloche (jeton expiré, droit manquant…).
        return { etat: 'erreur', detail: `Meta a répondu ${reponse.status} : ${String(erreur.message ?? 'erreur').slice(0, 160)}`, jours: {} };
      }
      for (const ligne of Array.isArray(corps?.data) ? corps.data : []) {
        if (typeof ligne?.date_start !== 'string') continue;
        resultat[ligne.date_start] = {
          depense: Number(ligne.spend) || 0,
          impressions: Number(ligne.impressions) || 0,
          clics: Number(ligne.inline_link_clicks) || 0,
        };
      }
      const suite = corps?.paging?.next ? corps?.paging?.cursors?.after : null;
      if (!suite) break;
      parametres.set('after', String(suite));
    }
  } catch (erreur) {
    const nom = erreur instanceof Error ? erreur.name : '';
    return { etat: 'erreur', detail: nom === 'TimeoutError' ? 'Meta ne répond pas (délai dépassé)' : 'Meta est injoignable', jours: {} };
  }
  return { etat: 'ok', jours: resultat };
}
