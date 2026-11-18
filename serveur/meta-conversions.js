// @ts-check
/**
 * API de conversion Meta : le serveur envoie lui-même à Meta les trois
 * événements du tunnel, sans dépendre du navigateur de la visiteuse.
 * - « Lead » (Prospect) : à l'inscription sur la landing ;
 * - « Schedule » (Rendez-vous programmé) : à la réservation d'un appel dans iClosed ;
 * - « Purchase » (Achat) : à l'enregistrement d'une vente dans le cockpit.
 *
 * Variables d'environnement (saisies dans Vercel, jamais dans le repo) :
 * - META_CAPI_TOKEN : jeton de l'API de conversion, créé dans le Gestionnaire
 *   d'évènements (Paramètres du pixel, « API Conversions ») ;
 * - META_PIXEL_ID (facultatif) : un autre pixel que celui de partage/meta.js ;
 * - META_CONSENTEMENT (facultatif) : « requis » ou « non-requis », pour changer la
 *   règle de serveur/reglages.js sans toucher au code ;
 * - META_TEST_EVENT_CODE (facultatif, le temps d'un essai) : code de l'onglet
 *   « Évènements de test ». Meta traite quand même ces événements comme des vrais.
 *
 * Règles :
 * - l'email, le téléphone et le prénom ne partent que sous forme d'empreintes ;
 * - la règle d'accord est celle de CONSENTEMENT_META (serveur/reglages.js) : quand
 *   l'accord est requis, rien ne part sans lui ;
 * - aucune donnée personnelle dans les journaux, et le jeton ne voyage que dans un en-tête.
 */
import { PIXEL_META } from '../partage/meta.js';
import { empreinteEmail, empreintePrenom, empreinteTelephone } from './empreinte.js';
import { CONSENTEMENT_META } from './reglages.js';

/** Version de l'API en cours le 18/11/2026. */
const VERSION_PAR_DEFAUT = 'v27.0';
/** Meta refuse un événement vieux de plus de 7 jours : on s'arrête un peu avant. */
export const AGE_MAX_MS = 6.5 * 86400000;

/**
 * La version de l'API Graph à appeler.
 * @param {Record<string, string | undefined>} env
 */
export function versionMeta(env) {
  return /^v\d{1,3}\.\d$/.test(env.META_API_VERSION ?? '') ? String(env.META_API_VERSION) : VERSION_PAR_DEFAUT;
}

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ pixel: string, jeton: string, version: string, codeDeTest: string } | null} null si rien n'est réglé
 */
export function accesConversions(env) {
  const pixel = (env.META_PIXEL_ID ?? '').trim() || PIXEL_META;
  const jeton = (env.META_CAPI_TOKEN ?? '').trim();
  if (!/^\d{8,20}$/.test(pixel) || !jeton) return null;
  const code = (env.META_TEST_EVENT_CODE ?? '').trim();
  return { pixel, jeton, version: versionMeta(env), codeDeTest: /^[A-Za-z0-9_-]{4,40}$/.test(code) ? code : '' };
}

/**
 * La règle d'accord en vigueur : celle du code, ou celle de la variable META_CONSENTEMENT.
 * @param {Record<string, string | undefined>} env
 * @returns {'requis' | 'non-requis'}
 */
export function regleConsentement(env) {
  const voulue = (env.META_CONSENTEMENT ?? '').trim();
  return voulue === 'requis' || voulue === 'non-requis' ? voulue : CONSENTEMENT_META;
}

/**
 * L'envoi à Meta est-il permis pour cette personne ?
 * @param {boolean | undefined} accord vrai si elle a accepté la mesure publicitaire
 * @param {'requis' | 'non-requis'} [regle]
 */
export function envoiPermis(accord, regle = CONSENTEMENT_META) {
  return regle === 'non-requis' || accord === true;
}

/**
 * @typedef {object} Personne
 * @property {string} [email]
 * @property {string} [telephone] au format international
 * @property {string} [prenom]
 * @property {string} [ip]
 * @property {string} [ua] navigateur (« user agent »)
 * @property {string} [fbc] identifiant de clic Meta
 * @property {string} [fbp] identifiant de navigateur Meta
 */

/**
 * Prépare un événement tel que Meta l'attend.
 * @param {object} evenement
 * @param {'Lead' | 'Schedule' | 'Purchase'} evenement.nom
 * @param {string} evenement.id identifiant unique : Meta écarte les doublons qui le portent
 * @param {Date} evenement.instant
 * @param {'website' | 'phone_call' | 'other'} evenement.origine où la conversion a eu lieu
 * @param {string} [evenement.adresse] page où elle a eu lieu (sans paramètre), pour « website »
 * @param {Personne} evenement.personne
 * @param {Record<string, string | number>} [evenement.donnees] montant, devise, formule
 */
export function construireEvenement({ nom, id, instant, origine, adresse, personne, donnees }) {
  /** @type {Record<string, unknown>} */
  const utilisateur = {};
  const email = empreinteEmail(personne.email);
  if (email) {
    utilisateur.em = [email];
    // Identifiant stable de la personne chez nous : la même empreinte.
    utilisateur.external_id = [email];
  }
  const telephone = empreinteTelephone(personne.telephone);
  if (telephone) utilisateur.ph = [telephone];
  const prenom = empreintePrenom(personne.prenom);
  if (prenom) utilisateur.fn = [prenom];
  if (personne.fbc) utilisateur.fbc = personne.fbc;
  if (personne.fbp) utilisateur.fbp = personne.fbp;
  // Un événement « site web » doit porter le navigateur de la visiteuse : sans lui, on le déclare « autre ».
  const surLeSite = origine === 'website' && Boolean(personne.ua) && Boolean(adresse);
  if (surLeSite) {
    utilisateur.client_user_agent = personne.ua;
    if (personne.ip && personne.ip !== 'inconnue') utilisateur.client_ip_address = personne.ip;
  }

  /** @type {Record<string, unknown>} */
  const pret = {
    event_name: nom,
    event_time: Math.floor(instant.getTime() / 1000),
    event_id: id,
    action_source: origine === 'website' && !surLeSite ? 'other' : origine,
    user_data: utilisateur,
  };
  if (surLeSite) pret.event_source_url = adresse;
  if (donnees && Object.keys(donnees).length > 0) pret.custom_data = donnees;
  return pret;
}

/**
 * Envoie un événement à Meta.
 * @param {Record<string, string | undefined>} env
 * @param {ReturnType<typeof construireEvenement>} evenement
 * @param {{ fetchImpl?: typeof fetch, maintenant?: Date }} [options]
 * @returns {Promise<{ etat: 'ok' | 'a-brancher' | 'trop-ancien' | 'erreur', statut?: number, detail?: string }>}
 */
export async function envoyerEvenement(env, evenement, options = {}) {
  const acces = accesConversions(env);
  if (!acces) return { etat: 'a-brancher' };
  const maintenant = options.maintenant ?? new Date();
  if (maintenant.getTime() - Number(evenement.event_time) * 1000 > AGE_MAX_MS) return { etat: 'trop-ancien' };
  /** @type {Record<string, unknown>} */
  const corps = { data: [evenement] };
  if (acces.codeDeTest) corps.test_event_code = acces.codeDeTest;
  try {
    const reponse = await (options.fetchImpl ?? fetch)(`https://graph.facebook.com/${acces.version}/${acces.pixel}/events`, {
      method: 'POST',
      // Le jeton part dans un en-tête, jamais dans l'adresse.
      headers: { Authorization: `Bearer ${acces.jeton}`, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(corps),
      signal: AbortSignal.timeout(6000),
    });
    const lu = await reponse.json().catch(() => null);
    if (reponse.ok && Number(lu?.events_received) >= 1) return { etat: 'ok', statut: reponse.status };
    // Le message de Meta dit ce qui cloche (jeton expiré, droit manquant…) ; il ne contient ni le jeton ni la personne.
    return { etat: 'erreur', statut: reponse.status, detail: String(lu?.error?.message ?? 'réponse inattendue').slice(0, 160) };
  } catch (erreur) {
    const nom = erreur instanceof Error ? erreur.name : '';
    return { etat: 'erreur', statut: 0, detail: nom === 'TimeoutError' ? 'Meta ne répond pas (délai dépassé)' : 'Meta est injoignable' };
  }
}
