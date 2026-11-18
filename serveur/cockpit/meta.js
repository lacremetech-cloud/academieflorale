// @ts-check
/**
 * Cockpit, source « Meta Ads » : dépense, impressions et clics sur le lien, jour
 * par jour, pour le compte publicitaire. Pour le webinaire, aussi les inscriptions
 * que Meta attribue à ses campagnes.
 *
 * Variables d'environnement (saisies dans Vercel, jamais dans le repo) :
 * - META_ACCESS_TOKEN : jeton d'accès avec le droit « ads_read » (utilisateur système) ;
 * - META_AD_ACCOUNT_ID : identifiant du compte publicitaire, avec ou sans « act_ » ;
 * - META_CAMPAGNES (facultatif) : remplace le texte que doit contenir le nom d'une
 *   campagne pour être comptée (« VSL » sans cette variable). Vide : tout le compte ;
 * - META_CAMPAGNES_WEBINAIRE (facultatif) : la même chose pour l'onglet Webinaire
 *   (« nuit des fleuristes » sans cette variable) ;
 * - META_API_VERSION (facultatif) : version de l'API, si celle par défaut expire.
 */
import { joursEcoules } from '../../partage/cockpit.js';
import { TUNNELS } from '../../partage/tunnels.js';
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
 * Le texte que doit contenir le nom d'une campagne du webinaire. Jamais vide : cet
 * onglet ne doit pas compter tout le compte publicitaire.
 * @param {Record<string, string | undefined>} env
 */
export function filtreWebinaire(env) {
  return (env.META_CAMPAGNES_WEBINAIRE ?? '').trim().slice(0, 80) || TUNNELS.webinaire.campagnes;
}

/** Types d'action de Meta qui comptent une inscription, par ordre de préférence (le premier trouvé est retenu). */
export const ACTIONS_PROSPECTS = Object.freeze(['lead', 'offsite_conversion.fb_pixel_lead', 'onsite_web_lead']);

/**
 * La valeur d'une action dans la liste rendue par Meta.
 * @param {unknown} actions
 * @param {readonly string[]} types
 */
export function valeurAction(actions, types) {
  if (!Array.isArray(actions)) return 0;
  for (const type of types) {
    const trouvee = actions.find((a) => a?.action_type === type);
    if (trouvee) return Number(trouvee.value) || 0;
  }
  return 0;
}

/** Conversions personnalisées déjà retrouvées (leur identifiant ne change pas). */
const conversionsConnues = new Map();

/**
 * L'identifiant d'une conversion personnalisée du compte, retrouvée par son nom.
 * (Le résultat d'une campagne peut aussi être un événement personnalisé du pixel,
 * qui n'a pas d'identifiant : lireMeta le reconnaît alors à son nom.)
 * @param {object} options
 * @param {string} options.nom
 * @param {string} options.compte
 * @param {string} options.jeton
 * @param {string} options.version
 * @param {typeof fetch} options.fetchImpl
 * @returns {Promise<string>} '' si elle est introuvable ou si Meta ne la donne pas
 */
async function conversionPersonnalisee({ nom, compte, jeton, version, fetchImpl }) {
  const cle = `${compte}:${nom.toLowerCase()}`;
  if (conversionsConnues.has(cle)) return conversionsConnues.get(cle);
  try {
    const reponse = await fetchImpl(`https://graph.facebook.com/${version}/act_${compte}/customconversions?${new URLSearchParams({ fields: 'id,name', limit: '200' })}`, {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(6000),
    });
    const corps = await reponse.json().catch(() => null);
    if (!reponse.ok) return '';
    const trouvee = (Array.isArray(corps?.data) ? corps.data : []).find((c) => String(c?.name ?? '').trim().toLowerCase() === nom.toLowerCase());
    const id = /^\d{5,25}$/.test(String(trouvee?.id ?? '')) ? String(trouvee.id) : '';
    // Seule une réponse lue en entier se garde : une panne ne doit pas faire oublier la conversion.
    conversionsConnues.set(cle, id);
    return id;
  } catch {
    return '';
  }
}

/** Oublie les conversions déjà retrouvées (pour les tests). */
export function oublierConversions() {
  conversionsConnues.clear();
}

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string} options.mois « 2026-11 »
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Date} [options.maintenant]
 * @param {string} [options.filtre] texte que doit contenir le nom des campagnes (sans lui : celui du tunnel VSL)
 * @param {string} [options.resultat] avec lui, chaque jour porte aussi `inscrits` : le résultat de ce nom, tel que
 *   la colonne « Résultats » du gestionnaire de publicités le compte (un événement personnalisé du pixel, ou une
 *   conversion personnalisée du compte) ou, s'il est introuvable, les prospects que Meta attribue aux campagnes
 * @returns {Promise<{ etat: 'ok' | 'a-brancher' | 'erreur', detail?: string, mesure?: 'resultat' | 'prospects',
 *   typesVus?: Record<string, number>, jours: Record<string, Record<string, number>> }>} `typesVus` : le total du mois
 *   de chaque type d'action rendu par Meta, pour vérifier ce qui est compté
 */
export async function lireMeta({ env, mois, fetchImpl = fetch, maintenant = new Date(), filtre: filtreVoulu, resultat: nomDuResultat }) {
  const jeton = (env.META_ACCESS_TOKEN ?? '').trim();
  const compte = (env.META_AD_ACCOUNT_ID ?? '').trim().replace(/^act_/, '');
  if (!jeton || !compte) return { etat: 'a-brancher', jours: {} };
  if (!/^\d{5,20}$/.test(compte)) return { etat: 'erreur', detail: 'identifiant du compte publicitaire invalide', jours: {} };

  const version = versionMeta(env);
  // Jusqu'à aujourd'hui seulement : aucune source n'est interrogée sur des jours à venir.
  const jours = joursEcoules(mois, maintenant);
  if (jours.length === 0) return { etat: 'ok', jours: {} };
  // Les inscriptions du webinaire : le résultat visé par ses campagnes, tel que le gestionnaire de publicités le compte.
  const conversion = nomDuResultat ? await conversionPersonnalisee({ nom: nomDuResultat, compte, jeton, version, fetchImpl }) : '';
  const parametres = new URLSearchParams({
    level: 'account',
    // « conversions » détaille les événements personnalisés du pixel, un par un ; « actions » ne les donne qu'en bloc.
    fields: nomDuResultat ? 'spend,impressions,inline_link_clicks,actions,conversions' : 'spend,impressions,inline_link_clicks',
    time_range: JSON.stringify({ since: jours[0], until: jours[jours.length - 1] }),
    time_increment: '1',
    limit: '100',
  });
  const filtre = filtreVoulu ?? filtreCampagnes(env);
  if (filtre) {
    parametres.set('filtering', JSON.stringify([{ field: 'campaign.name', operator: 'CONTAIN', value: filtre }]));
  }

  /** @type {Record<string, Record<string, number>>} */
  const resultat = {};
  /** Par jour, la valeur de chaque type d'action (webinaire seulement). @type {Record<string, Map<string, number>>} */
  const actionsParJour = {};
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
        if (nomDuResultat) actionsParJour[ligne.date_start] = actionsDe(ligne);
      }
      const suite = corps?.paging?.next ? corps?.paging?.cursors?.after : null;
      if (!suite) break;
      parametres.set('after', String(suite));
    }
  } catch (erreur) {
    const nom = erreur instanceof Error ? erreur.name : '';
    return { etat: 'erreur', detail: nom === 'TimeoutError' ? 'Meta ne répond pas (délai dépassé)' : 'Meta est injoignable', jours: {} };
  }
  if (!nomDuResultat) return { etat: 'ok', jours: resultat };

  // Une seule mesure pour tout le mois : le résultat visé par les campagnes s'il apparaît, sinon les prospects.
  /** @type {Record<string, number>} */
  const totaux = {};
  for (const actions of Object.values(actionsParJour)) {
    for (const [type, valeur] of actions) totaux[type] = (totaux[type] ?? 0) + valeur;
  }
  const vus = Object.keys(totaux);
  const voulus = [`offsite_conversion.fb_pixel_custom.${nomDuResultat}`, ...(conversion ? [`offsite_conversion.custom.${conversion}`] : [])].map((type) => type.toLowerCase());
  const duResultat = vus.filter((type) => voulus.includes(type.toLowerCase()));
  const retenus = duResultat.length > 0 ? duResultat : ACTIONS_PROSPECTS.filter((type) => vus.includes(type)).slice(0, 1);
  for (const [jour, ligne] of Object.entries(resultat)) {
    ligne.inscrits = retenus.reduce((somme, type) => somme + (actionsParJour[jour]?.get(type) ?? 0), 0);
  }
  return {
    etat: 'ok',
    jours: resultat,
    mesure: /** @type {const} */ (duResultat.length > 0 ? 'resultat' : 'prospects'),
    // Les types d'action les plus fréquents du mois : de quoi vérifier ce qui est compté (aucune donnée personnelle).
    typesVus: Object.fromEntries(
      Object.entries(totaux)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 30)
        .map(([type, total]) => [type, Math.round(total * 100) / 100]),
    ),
  };
}

/**
 * Les actions d'une ligne rendue par Meta, par type. « conversions » passe d'abord :
 * un même type peut figurer dans les deux listes, il n'est compté qu'une fois.
 * @param {any} ligne
 * @returns {Map<string, number>}
 */
function actionsDe(ligne) {
  /** @type {Map<string, number>} */
  const parType = new Map();
  for (const liste of [ligne?.conversions, ligne?.actions]) {
    for (const action of Array.isArray(liste) ? liste : []) {
      const type = typeof action?.action_type === 'string' ? action.action_type : '';
      if (type && !parType.has(type)) parType.set(type, Number(action.value) || 0);
    }
  }
  return parType;
}
