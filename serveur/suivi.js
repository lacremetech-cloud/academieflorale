// @ts-check
/**
 * Suivi du tunnel : ce que le serveur retient pour relier une publicité à une
 * inscription, puis à un rendez-vous et à une vente. Tout est rangé dans la base
 * du cockpit (Upstash Redis), sans email ni téléphone :
 * - la publicité d'arrivée de chaque inscrite, sous l'empreinte de son email
 *   (gardée 400 jours) ;
 * - le contexte technique de l'inscription (adresse IP, navigateur), seulement
 *   quand elle a donné son accord, gardé 14 jours : il accompagne l'événement
 *   « rendez-vous » envoyé à Meta ;
 * - le nombre d'inscrites par publicité et par jour, et par créneau horaire ;
 * - le dernier état de chaque branchement (rendez-vous, API de conversion).
 * Rien ici ne lève d'erreur : le suivi ne doit jamais gêner une inscription.
 */
import { clePub, creneauParis, fbcDepuis, SANS_PUB } from '../partage/attribution.js';
import { jourParis } from '../partage/cockpit.js';
import { accesCompteurs, executer } from '../partage/compteurs.js';
import { empreinteEmail } from './empreinte.js';
import { GARDE_CONTEXTE_S, GARDE_INSCRIPTION_S } from './reglages.js';

const PREFIXE = 'af:c1';
const CLE_ETATS = `${PREFIXE}:etat`;
/** @param {string} empreinte */
const cleInscription = (empreinte) => `${PREFIXE}:lead:${empreinte}`;
/** @param {string} empreinte */
const cleContexte = (empreinte) => `${PREFIXE}:ctx:${empreinte}`;
/** @param {string} jour */
const clePubsDuJour = (jour) => `${PREFIXE}:pubs:${jour}`;
/** @param {string} mois */
const cleMoments = (mois) => `${PREFIXE}:moments:${mois}`;
/** @param {string} mois */
export const cleRdv = (mois) => `${PREFIXE}:rdv:${mois}`;
export const CLE_VERROU_RDV = `${PREFIXE}:verrou:rdv`;

/** @param {unknown} texte @param {number} longueur */
const court = (texte, longueur) => (typeof texte === 'string' ? texte.slice(0, longueur) : '');

/**
 * @typedef {object} Inscription ce que la base retient d'une inscrite
 * @property {number} t instant de l'inscription (millisecondes)
 * @property {string} jour jour de l'inscription, à Paris
 * @property {string} variante formulation de la landing
 * @property {string} pub clé de la publicité d'arrivée, '' si inconnue
 * @property {string} campagne
 * @property {string} ensemble
 * @property {string} annonce
 * @property {string} fbc identifiant de clic Meta, '' sans fbclid
 * @property {0 | 1} accord 1 si elle a accepté la mesure publicitaire
 */

/** @param {unknown} brut @returns {any} */
function lireJson(brut) {
  if (brut && typeof brut === 'object') return brut;
  if (typeof brut !== 'string') return null;
  try {
    const valeur = JSON.parse(brut);
    return valeur && typeof valeur === 'object' ? valeur : null;
  } catch {
    return null;
  }
}

/**
 * Une table de la base : « champ, valeur, champ, valeur… » (Upstash) ou un objet.
 * @param {unknown} brut
 * @returns {[string, unknown][]}
 */
export function paires(brut) {
  if (Array.isArray(brut)) {
    /** @type {[string, unknown][]} */
    const lues = [];
    for (let rang = 0; rang + 1 < brut.length; rang += 2) lues.push([String(brut[rang]), brut[rang + 1]]);
    return lues;
  }
  return brut && typeof brut === 'object' ? Object.entries(brut) : [];
}

/**
 * Retient la publicité d'arrivée d'une inscrite. La première inscription d'une
 * adresse fait foi : une réinscription ne change ni sa publicité, ni les compteurs.
 * @param {Record<string, string | undefined>} env
 * @param {object} infos
 * @param {string} infos.email
 * @param {string} [infos.variante]
 * @param {Record<string, string>} [infos.utm]
 * @param {boolean} [infos.accord]
 * @param {{ ip?: string, ua?: string, fbp?: string }} [infos.contexte]
 * @param {{ fetchImpl?: typeof fetch, maintenant?: Date }} [options]
 * @returns {Promise<{ ok: boolean, nouvelle: boolean, inscription: Inscription | null }>}
 */
export async function enregistrerInscription(env, infos, options = {}) {
  const acces = accesCompteurs(env);
  const empreinte = empreinteEmail(infos.email);
  if (!acces || !empreinte) return { ok: false, nouvelle: false, inscription: null };
  const fetchImpl = options.fetchImpl ?? fetch;
  const maintenant = options.maintenant ?? new Date();
  const utm = infos.utm ?? {};
  /** @type {Inscription} */
  const inscription = {
    t: maintenant.getTime(),
    jour: jourParis(maintenant),
    variante: court(infos.variante, 80),
    pub: clePub(utm),
    campagne: court(utm.utm_campaign, 120),
    ensemble: court(utm.utm_term, 120),
    annonce: court(utm.utm_content, 120),
    fbc: fbcDepuis(utm.fbclid, maintenant.getTime()),
    accord: infos.accord === true ? 1 : 0,
  };
  try {
    const [pose] = await executer(
      acces,
      [['SET', cleInscription(empreinte), JSON.stringify(inscription), 'NX', 'EX', String(GARDE_INSCRIPTION_S)]],
      fetchImpl,
      2500,
    );
    if (pose !== 'OK') return { ok: true, nouvelle: false, inscription: null };

    const creneau = creneauParis(maintenant);
    /** @type {(string | number)[][]} */
    const commandes = [['HINCRBY', clePubsDuJour(inscription.jour), inscription.pub || SANS_PUB, 1]];
    if (creneau) commandes.push(['HINCRBY', cleMoments(inscription.jour.slice(0, 7)), `i:${creneau.jour}:${creneau.heure}`, 1]);
    const contexte = infos.contexte ?? {};
    if (inscription.accord === 1 && (contexte.ip || contexte.ua)) {
      const garde = { ip: court(contexte.ip, 64), ua: court(contexte.ua, 400), fbp: court(contexte.fbp, 120) };
      commandes.push(['SET', cleContexte(empreinte), JSON.stringify(garde), 'EX', String(GARDE_CONTEXTE_S)]);
    }
    await executer(acces, commandes, fetchImpl, 2500);
    return { ok: true, nouvelle: true, inscription };
  } catch {
    return { ok: false, nouvelle: false, inscription: null };
  }
}

/**
 * Les inscriptions connues pour ces emails : sert à rattacher un rendez-vous ou
 * une vente à la publicité d'arrivée.
 * @param {Record<string, string | undefined>} env
 * @param {string[]} emails
 * @param {{ fetchImpl?: typeof fetch, avecContexte?: boolean }} [options]
 * @returns {Promise<Map<string, { inscription: Inscription | null, contexte: { ip?: string, ua?: string, fbp?: string } | null }>>} par empreinte d'email
 */
export async function lireInscriptions(env, emails, options = {}) {
  /** @type {Map<string, { inscription: Inscription | null, contexte: any }>} */
  const trouvees = new Map();
  const acces = accesCompteurs(env);
  const empreintes = [...new Set(emails.map(empreinteEmail).filter(Boolean))];
  if (!acces || empreintes.length === 0) return trouvees;
  try {
    /** @type {(string | number)[][]} */
    const commandes = [['MGET', ...empreintes.map(cleInscription)]];
    if (options.avecContexte) commandes.push(['MGET', ...empreintes.map(cleContexte)]);
    const [inscriptions, contextes] = await executer(acces, commandes, options.fetchImpl ?? fetch, 4000);
    empreintes.forEach((empreinte, rang) => {
      const inscription = lireJson(inscriptions?.[rang]);
      if (!inscription) return;
      trouvees.set(empreinte, { inscription, contexte: lireJson(contextes?.[rang]) });
    });
  } catch {
    /* base injoignable : aucune attribution, sans bloquer l'appelant */
  }
  return trouvees;
}

/**
 * Inscrites par publicité, pour une suite de jours.
 * @param {Record<string, string | undefined>} env
 * @param {string[]} jours
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ etat: 'ok' | 'a-brancher' | 'erreur', parPub: Record<string, number>, parJour: Record<string, number> }>}
 */
export async function lireInscritesParPub(env, jours, options = {}) {
  const acces = accesCompteurs(env);
  if (!acces) return { etat: 'a-brancher', parPub: {}, parJour: {} };
  if (jours.length === 0) return { etat: 'ok', parPub: {}, parJour: {} };
  try {
    const tables = await executer(acces, jours.map((jour) => ['HGETALL', clePubsDuJour(jour)]), options.fetchImpl ?? fetch, 8000);
    /** @type {Record<string, number>} */
    const parPub = {};
    /** @type {Record<string, number>} */
    const parJour = {};
    tables.forEach((table, rang) => {
      for (const [pub, valeur] of paires(table)) {
        const nombre = Number(valeur) || 0;
        if (nombre <= 0) continue;
        parPub[pub] = (parPub[pub] ?? 0) + nombre;
        const jour = jours[rang] ?? '';
        parJour[jour] = (parJour[jour] ?? 0) + nombre;
      }
    });
    return { etat: 'ok', parPub, parJour };
  } catch {
    return { etat: 'erreur', parPub: {}, parJour: {} };
  }
}

/**
 * Inscriptions par créneau (jour de la semaine et heure, à Paris), pour une suite de mois.
 * @param {Record<string, string | undefined>} env
 * @param {string[]} moisListe
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<Record<string, number>>} « <jour>:<heure> » → nombre (jour : 0 = lundi)
 */
export async function lireMoments(env, moisListe, options = {}) {
  const acces = accesCompteurs(env);
  /** @type {Record<string, number>} */
  const creneaux = {};
  if (!acces || moisListe.length === 0) return creneaux;
  try {
    const tables = await executer(acces, moisListe.map((mois) => ['HGETALL', cleMoments(mois)]), options.fetchImpl ?? fetch, 6000);
    for (const table of tables) {
      for (const [champ, valeur] of paires(table)) {
        if (!champ.startsWith('i:')) continue;
        creneaux[champ.slice(2)] = (creneaux[champ.slice(2)] ?? 0) + (Number(valeur) || 0);
      }
    }
  } catch {
    /* base injoignable : pas de créneaux */
  }
  return creneaux;
}

/**
 * Note le dernier état d'un branchement, pour la carte du cockpit.
 * @param {Record<string, string | undefined>} env
 * @param {'rdv' | 'conversions' | 'client'} branchement
 * @param {Record<string, unknown>} etat jamais de donnée personnelle
 * @param {{ fetchImpl?: typeof fetch }} [options]
 */
export async function noterEtat(env, branchement, etat, options = {}) {
  const acces = accesCompteurs(env);
  if (!acces) return;
  try {
    await executer(acces, [['HSET', CLE_ETATS, branchement, JSON.stringify(etat)]], options.fetchImpl ?? fetch, 2500);
  } catch {
    /* sans conséquence */
  }
}

/**
 * Les derniers états notés.
 * @param {Record<string, string | undefined>} env
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<Record<string, any>>}
 */
export async function lireEtats(env, options = {}) {
  const acces = accesCompteurs(env);
  if (!acces) return {};
  try {
    const [table] = await executer(acces, [['HGETALL', CLE_ETATS]], options.fetchImpl ?? fetch, 4000);
    return Object.fromEntries(paires(table).map(([cle, valeur]) => [cle, lireJson(valeur)]).filter(([, valeur]) => valeur));
  } catch {
    return {};
  }
}
