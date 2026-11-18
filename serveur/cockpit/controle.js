// @ts-check
/**
 * Cockpit, « Suivi du tunnel » : l'état de chaque maillon entre la publicité,
 * ActiveCampaign, iClosed et Meta. Chaque carte dit si le maillon est en place,
 * ce qui manque, et ce qu'il a fait en dernier. Rien de secret ni de personnel
 * ne sort d'ici.
 */
import { accesCompteurs } from '../../partage/compteurs.js';
import { lireReglage } from '../activecampaign.js';
import { accesConversions, regleConsentement } from '../meta-conversions.js';
import { AUTOMATISATIONS, CHAMPS, LISTES } from '../reglages.js';
import { lireEtats } from '../suivi.js';

/**
 * @typedef {object} Maillon
 * @property {string} nom
 * @property {'ok' | 'a-brancher' | 'attente' | 'erreur'} etat
 * @property {string[]} lignes ce qu'il faut savoir, en clair
 * @property {string[]} [variables] variables à saisir dans Vercel quand le maillon n'est pas branché
 */

/** Dernier contrôle d'ActiveCampaign, gardé quelques minutes : il ne change pas d'une minute à l'autre. */
let memoire = { cle: '', instant: 0, /** @type {Maillon | null} */ maillon: null };
const GARDE_MS = 3 * 60 * 1000;

/** « il y a 4 min », « il y a 2 h », « il y a 3 j ». @param {string} iso @param {Date} maintenant */
function ilYA(iso, maintenant) {
  const ecart = maintenant.getTime() - Date.parse(iso);
  if (!Number.isFinite(ecart) || ecart < 0) return '';
  const minutes = Math.round(ecart / 60000);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  if (minutes < 48 * 60) return `il y a ${Math.round(minutes / 60)} h`;
  return `il y a ${Math.round(minutes / 1440)} j`;
}

/**
 * ActiveCampaign : la clé répond-elle, les listes et le déclencheur de la séquence sont-ils en place ?
 * @param {Record<string, string | undefined>} env
 * @param {typeof fetch} fetchImpl
 * @param {Date} maintenant
 * @returns {Promise<Maillon>}
 */
async function controlerActiveCampaign(env, fetchImpl, maintenant) {
  const nom = 'ActiveCampaign';
  const apiUrl = (env.ACTIVECAMPAIGN_API_URL ?? '').trim();
  const apiKey = (env.ACTIVECAMPAIGN_API_KEY ?? '').trim();
  if (!apiUrl || !apiKey) {
    return {
      nom,
      etat: 'a-brancher',
      lignes: ['Sans lui, le formulaire de la landing ne peut rien enregistrer.'],
      variables: ['ACTIVECAMPAIGN_API_URL', 'ACTIVECAMPAIGN_API_KEY'],
    };
  }
  const cle = `${apiUrl}|${apiKey.length}|${apiKey.slice(-4)}`;
  if (memoire.maillon && memoire.cle === cle && maintenant.getTime() - memoire.instant < GARDE_MS) return memoire.maillon;

  const [listes, declencheurs] = await Promise.all([
    lireReglage({ apiUrl, apiKey, chemin: '/api/3/lists?limit=100', fetchImpl }),
    lireReglage({ apiUrl, apiKey, chemin: `/api/3/automations/${AUTOMATISATIONS.sequence.numero}/triggers`, fetchImpl }),
  ]);
  /** @type {Maillon} */
  let maillon;
  if (listes.statut === 401 || listes.statut === 403) {
    maillon = { nom, etat: 'erreur', lignes: ['ActiveCampaign refuse la clé : elle est à recopier dans Vercel.'] };
  } else if (listes.statut !== 200) {
    maillon = { nom, etat: 'erreur', lignes: [listes.statut === 0 ? 'ActiveCampaign ne répond pas.' : `ActiveCampaign a répondu ${listes.statut}.`] };
  } else {
    const connues = new Map((Array.isArray(listes.corps?.lists) ? listes.corps.lists : []).map((/** @type {any} */ l) => [String(l?.id), String(l?.name ?? '')]));
    const lignes = [];
    let etat = /** @type {Maillon['etat']} */ ('ok');
    for (const [role, numero] of Object.entries(LISTES)) {
      if (connues.has(numero)) lignes.push(`Liste « ${connues.get(numero)} » trouvée.`);
      else {
        etat = 'erreur';
        lignes.push(`Liste n° ${numero} (${role}) introuvable dans le compte.`);
      }
    }
    const lance = (Array.isArray(declencheurs.corps?.automationTriggers) ? declencheurs.corps.automationTriggers : []).some(
      (/** @type {any} */ d) => String(d?.params?.field) === CHAMPS.source.numero && String(d?.params?.toValue) === CHAMPS.source.valeur,
    );
    if (declencheurs.statut === 200 && lance) lignes.push(`« ${AUTOMATISATIONS.sequence.nom} » démarre bien à l’inscription (Source = ${CHAMPS.source.valeur}).`);
    else if (declencheurs.statut === 200) {
      etat = 'erreur';
      lignes.push(`« ${AUTOMATISATIONS.sequence.nom} » n’est plus déclenchée par Source = ${CHAMPS.source.valeur} : les emails ne partiraient pas.`);
    }
    maillon = { nom, etat, lignes };
  }
  memoire = { cle, instant: maintenant.getTime(), maillon };
  return maillon;
}

/**
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Date} [options.maintenant]
 * @returns {Promise<Record<string, Maillon>>}
 */
export async function controlerSuivi({ env, fetchImpl = fetch, maintenant = new Date() }) {
  const production = env.VERCEL_ENV === 'production';
  const [activecampaign, etats] = await Promise.all([controlerActiveCampaign(env, fetchImpl, maintenant), lireEtats(env, { fetchImpl })]);
  const acPret = activecampaign.etat === 'ok';
  const base = accesCompteurs(env) !== null;

  /** @type {Maillon} */
  const tunnel = production
    ? { nom: 'Tunnel en ligne', etat: 'ok', lignes: ['Public : les inscriptions, les rendez-vous et les ventes sont suivis.'] }
    : {
        nom: 'Tunnel en ligne',
        etat: 'attente',
        lignes: ['Encore en préversion : visible seulement connecté à Vercel. Inscriptions, rendez-vous et événements Meta ne sont suivis qu’une fois en production.'],
      };

  /** @type {Maillon} */
  let rdv;
  if (!(env.ICLOSED_API_KEY ?? '').trim() || !base) {
    rdv = { nom: 'Rendez-vous', etat: 'a-brancher', lignes: ['La clé iClosed et la base du cockpit sont nécessaires.'], variables: ['ICLOSED_API_KEY'] };
  } else if (!acPret) {
    rdv = { nom: 'Rendez-vous', etat: 'attente', lignes: ['Attend ActiveCampaign : à chaque appel réservé, la fiche reçoit le tag « vsl-rdv » et « Prise de RDV » = VSL.'] };
  } else if (etats.rdv?.t) {
    const dernier = etats.rdv;
    rdv = {
      nom: 'Rendez-vous',
      etat: Number(dernier.echecs) > 0 ? 'erreur' : 'ok',
      lignes: [
        `iClosed relu ${ilYA(String(dernier.t), maintenant)} (toutes les 10 minutes).`,
        Number(dernier.echecs) > 0 ? 'Le dernier passage n’a pas pu tout écrire : il réessaie au suivant.' : 'Chaque appel réservé pose le tag « vsl-rdv » et « Prise de RDV » = VSL.',
        // Les autres events de candidature renvoient vers la même page merci : le serveur prévient Meta pour eux aussi.
        ...(dernier.autres !== undefined ? ['Les réservations des autres events de candidature (webinaire, site, setting, DM, YouTube) sont signalées à Meta.'] : []),
      ],
    };
  } else {
    rdv = { nom: 'Rendez-vous', etat: 'attente', lignes: ['Prêt : iClosed sera relu toutes les 10 minutes dès la mise en production.'] };
  }

  /** @type {Maillon} */
  let conversions;
  if (!accesConversions(env)) {
    conversions = {
      nom: 'API de conversion Meta',
      etat: 'a-brancher',
      lignes: ['Prospect à l’inscription, Rendez-vous programmé à la réservation, Achat à la vente.'],
      variables: ['META_CAPI_TOKEN'],
    };
  } else {
    const dernier = etats.conversions;
    const lignes = [regleConsentement(env) === 'requis' ? 'N’envoie que les événements des visiteuses qui ont donné leur accord.' : 'Envoie Prospect, Rendez-vous programmé et Achat.'];
    if (dernier?.t) lignes.push(`Dernier événement (${dernier.nom}) ${ilYA(String(dernier.t), maintenant)} : ${dernier.ok ? 'reçu par Meta' : `refusé (${String(dernier.detail || 'erreur').slice(0, 120)})`}.`);
    else lignes.push('Aucun événement envoyé pour l’instant.');
    conversions = { nom: 'API de conversion Meta', etat: dernier?.t && !dernier.ok ? 'erreur' : production ? 'ok' : 'attente', lignes };
  }

  /** @type {Maillon} */
  const client = acPret
    ? {
        nom: 'Vente → liste Client',
        etat: etats.client?.t && !etats.client.ok ? 'erreur' : 'ok',
        lignes: [
          'Une vente enregistrée avec l’email de l’élève la fait entrer dans « Client » et sortir de « Prospect ».',
          ...(etats.client?.t ? [`Dernier passage ${ilYA(String(etats.client.t), maintenant)} : ${etats.client.ok ? 'fait' : 'à relancer depuis la liste des ventes'}.`] : []),
        ],
      }
    : { nom: 'Vente → liste Client', etat: 'attente', lignes: ['Attend ActiveCampaign.'] };

  return { tunnel, activecampaign, rdv, client, conversions };
}
