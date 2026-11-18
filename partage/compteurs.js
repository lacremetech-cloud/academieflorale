// @ts-check
/**
 * Compteurs du tunnel : affichages de la landing et inscriptions, par jour et par
 * formulation, plus les notes du cockpit. Ils donnent au cockpit ses inscrites
 * par jour et permettent de lire le test des formulations.
 * Aucune donnée personnelle ici : seulement des nombres et de courtes notes.
 * (La même base porte aussi le registre des ventes, serveur/cockpit/registre.js,
 * et le suivi des publicités, serveur/suivi.js, rangé sous des empreintes.)
 *
 * Stockage : une base Redis (Upstash, depuis le Marketplace de Vercel), par son
 * API REST. Vercel pose lui-même les variables quand la base est reliée au projet :
 * KV_REST_API_URL et KV_REST_API_TOKEN (ou UPSTASH_REDIS_REST_URL et _TOKEN).
 * Sans elles, compter ne fait rien et le cockpit affiche « à brancher ».
 *
 * Ce module n'utilise que fetch : il sert aux fonctions serveur comme au
 * middleware de la landing.
 */
import { joursDuMois, jourParis } from './cockpit.js';
import { VARIANTES_EN_TEST } from './repartition.js';

/** Ce qui se compte. */
export const EVENEMENTS = Object.freeze(['vues', 'inscrits']);
const PREFIXE = 'af:c1';
const CLE_VARIANTES = `${PREFIXE}:variantes`;
const CLE_NOTES = `${PREFIXE}:notes`;
/** Longueur maximale d'une note du cockpit. */
export const NOTE_MAX = 160;

/**
 * @param {Record<string, string | undefined>} env
 * @returns {{ url: string, jeton: string } | null} null si la base n'est pas reliée
 */
export function accesCompteurs(env) {
  const url = (env.KV_REST_API_URL ?? env.UPSTASH_REDIS_REST_URL ?? '').trim().replace(/\/+$/, '');
  const jeton = (env.KV_REST_API_TOKEN ?? env.UPSTASH_REDIS_REST_TOKEN ?? '').trim();
  return url.startsWith('https://') && jeton ? { url, jeton } : null;
}

/**
 * Nom de formulation pour une clé : celui d'une formulation en test, sinon « autre ».
 * (Le nom vient en partie du navigateur : on ne compte que sous des noms connus.)
 * @param {unknown} brut « 90-jours » ou « inscription/90-jours »
 * @param {readonly string[]} [connues]
 */
export function nomDeVariante(brut, connues = VARIANTES_EN_TEST) {
  const dernier = typeof brut === 'string' ? (brut.split('/').filter(Boolean).pop() ?? '') : '';
  return connues.includes(dernier) ? dernier : 'autre';
}

/**
 * Envoie une suite de commandes à la base.
 * @param {{ url: string, jeton: string }} acces
 * @param {(string | number)[][]} commandes
 * @param {typeof fetch} fetchImpl
 * @param {number} delaiMs
 * @returns {Promise<any[]>} le résultat de chaque commande
 */
export async function executer(acces, commandes, fetchImpl, delaiMs) {
  const reponse = await fetchImpl(`${acces.url}/pipeline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${acces.jeton}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(commandes),
    signal: AbortSignal.timeout(delaiMs),
  });
  if (!reponse.ok) throw new Error(`base de compteurs : réponse ${reponse.status}`);
  const corps = await reponse.json();
  if (!Array.isArray(corps)) throw new Error('base de compteurs : réponse inattendue');
  return corps.map((ligne) => {
    if (ligne?.error) throw new Error('base de compteurs : commande refusée');
    return ligne?.result;
  });
}

/**
 * Compte un événement du tunnel. Ne lève jamais d'erreur et n'attend pas
 * longtemps : le tunnel ne doit jamais dépendre de ses compteurs.
 * @param {Record<string, string | undefined>} env
 * @param {string} evenement « vues » ou « inscrits »
 * @param {unknown} variante
 * @param {{ fetchImpl?: typeof fetch, maintenant?: Date }} [options]
 * @returns {Promise<boolean>} vrai si l'événement a été compté
 */
export async function compter(env, evenement, variante, options = {}) {
  const acces = accesCompteurs(env);
  if (!acces || !EVENEMENTS.includes(evenement)) return false;
  const jour = jourParis(options.maintenant ?? new Date());
  const nom = nomDeVariante(variante);
  try {
    await executer(
      acces,
      [
        ['INCR', `${PREFIXE}:${evenement}:j:${jour}`],
        ['INCR', `${PREFIXE}:${evenement}:m:${jour.slice(0, 7)}:${nom}`],
        ['SADD', CLE_VARIANTES, nom],
      ],
      options.fetchImpl ?? fetch,
      1500,
    );
    return true;
  } catch {
    return false;
  }
}

/**
 * Les compteurs d'un mois : par jour, et par formulation sur le mois ; plus les notes.
 * @param {Record<string, string | undefined>} env
 * @param {string} mois « 2026-11 »
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ etat: 'ok' | 'a-brancher' | 'erreur', detail?: string, jours: Record<string, Record<string, number>>, variantes: { nom: string, vues: number, inscrits: number }[], notes: Record<string, string> }>}
 */
export async function lireCompteurs(env, mois, options = {}) {
  const vide = { jours: {}, variantes: [], notes: {} };
  const acces = accesCompteurs(env);
  if (!acces) return { etat: 'a-brancher', ...vide };
  const fetchImpl = options.fetchImpl ?? fetch;
  const jours = joursDuMois(mois);
  try {
    const [vues, inscrits, notes, variantes] = await executer(
      acces,
      [
        ['MGET', ...jours.map((jour) => `${PREFIXE}:vues:j:${jour}`)],
        ['MGET', ...jours.map((jour) => `${PREFIXE}:inscrits:j:${jour}`)],
        ['HMGET', CLE_NOTES, ...jours],
        ['SMEMBERS', CLE_VARIANTES],
      ],
      fetchImpl,
      6000,
    );
    /** @type {Record<string, Record<string, number>>} */
    const parJour = {};
    /** @type {Record<string, string>} */
    const notesDuMois = {};
    jours.forEach((jour, rang) => {
      parJour[jour] = { vues: Number(vues?.[rang]) || 0, inscrits: Number(inscrits?.[rang]) || 0 };
      if (typeof notes?.[rang] === 'string' && notes[rang]) notesDuMois[jour] = notes[rang];
    });

    const noms = (Array.isArray(variantes) ? variantes : []).filter((nom) => typeof nom === 'string').sort();
    /** @type {{ nom: string, vues: number, inscrits: number }[]} */
    let parVariante = [];
    if (noms.length > 0) {
      const [vuesParNom, inscritsParNom] = await executer(
        acces,
        [
          ['MGET', ...noms.map((nom) => `${PREFIXE}:vues:m:${mois}:${nom}`)],
          ['MGET', ...noms.map((nom) => `${PREFIXE}:inscrits:m:${mois}:${nom}`)],
        ],
        fetchImpl,
        6000,
      );
      parVariante = noms
        .map((nom, rang) => ({ nom, vues: Number(vuesParNom?.[rang]) || 0, inscrits: Number(inscritsParNom?.[rang]) || 0 }))
        .filter((variante) => variante.vues > 0 || variante.inscrits > 0);
    }
    return { etat: 'ok', jours: parJour, variantes: parVariante, notes: notesDuMois };
  } catch (erreur) {
    const nom = erreur instanceof Error ? erreur.name : '';
    return {
      etat: 'erreur',
      detail: nom === 'TimeoutError' ? 'la base de compteurs ne répond pas' : 'la base de compteurs est injoignable ou refuse la demande',
      ...vide,
    };
  }
}

/**
 * Enregistre (ou efface) la note d'une journée.
 * @param {Record<string, string | undefined>} env
 * @param {string} jour « 2026-11-18 »
 * @param {string} note '' pour effacer
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<'ok' | 'a-brancher' | 'erreur'>}
 */
export async function ecrireNote(env, jour, note, options = {}) {
  const acces = accesCompteurs(env);
  if (!acces) return 'a-brancher';
  try {
    await executer(acces, [note ? ['HSET', CLE_NOTES, jour, note] : ['HDEL', CLE_NOTES, jour]], options.fetchImpl ?? fetch, 4000);
    return 'ok';
  } catch {
    return 'erreur';
  }
}
