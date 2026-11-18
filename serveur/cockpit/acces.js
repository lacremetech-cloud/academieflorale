// @ts-check
/**
 * Accès privé au cockpit : un mot de passe, puis une session signée dans un cookie.
 *
 * Le mot de passe vit dans la variable d'environnement COCKPIT_MOT_DE_PASSE, saisie
 * dans Vercel : il n'est jamais écrit dans le repo (qui est public), ni renvoyé au
 * navigateur, ni journalisé. Tant qu'il n'est pas réglé, le cockpit reste fermé.
 *
 * La session est un jeton « expiration.signature ». La clé de signature dérive du
 * mot de passe : changer le mot de passe ferme toutes les sessions ouvertes.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { creerLimiteur } from '../lead.js';
import { repondre } from '../reponse.js';
import { adresseCliente, enHttps, memeOrigine } from '../requete.js';

export const COOKIE = 'af_cockpit';
/** Le cookie n'accompagne que les demandes faites aux fonctions du cockpit. */
const CHEMIN_COOKIE = '/api/cockpit';
/** Durée d'une session : une semaine. */
export const DUREE_SESSION_S = 7 * 24 * 3600;
/** En dessous de cette longueur, le mot de passe est refusé : le cockpit reste fermé. */
const MOT_DE_PASSE_MIN = 8;
/** Essais de connexion acceptés par adresse IP, sur la période. */
const ESSAIS = 6;
const PERIODE_MS = 10 * 60 * 1000;
/** Pause après un mauvais mot de passe : elle ralentit les essais en série. */
const PAUSE_ECHEC_MS = 600;

/**
 * @param {string | Buffer} cle
 * @param {string} texte
 */
const signer = (cle, texte) => createHmac('sha256', cle).update(texte).digest();

/**
 * Le mot de passe réglé dans l'environnement, ou '' s'il est absent ou trop court.
 * @param {Record<string, string | undefined>} env
 */
export function motDePasseRegle(env) {
  const motDePasse = env.COCKPIT_MOT_DE_PASSE ?? '';
  return motDePasse.length >= MOT_DE_PASSE_MIN ? motDePasse : '';
}

/**
 * Comparaison à durée constante : le temps de réponse ne renseigne pas sur le mot de passe.
 * @param {string} saisi
 * @param {string} attendu
 */
export function memeMotDePasse(saisi, attendu) {
  return timingSafeEqual(signer('af-cockpit-comparaison', saisi), signer('af-cockpit-comparaison', attendu));
}

/** @param {string} motDePasse */
const cleDeSession = (motDePasse) => signer(motDePasse, 'af-cockpit-session-v1');

/**
 * @param {string} motDePasse
 * @param {number} [maintenant] en millisecondes
 * @returns {string} jeton de session
 */
export function creerSession(motDePasse, maintenant = Date.now()) {
  const expiration = String(Math.floor(maintenant / 1000) + DUREE_SESSION_S);
  return `${expiration}.${signer(cleDeSession(motDePasse), expiration).toString('base64url')}`;
}

/**
 * @param {unknown} jeton
 * @param {string} motDePasse
 * @param {number} [maintenant] en millisecondes
 */
export function sessionValide(jeton, motDePasse, maintenant = Date.now()) {
  if (typeof jeton !== 'string' || !motDePasse) return false;
  const morceaux = jeton.split('.');
  const [expiration, signature] = morceaux;
  if (morceaux.length !== 2 || !expiration || !signature || !/^\d{9,12}$/.test(expiration)) return false;
  if (Number(expiration) * 1000 <= maintenant) return false;
  const attendue = signer(cleDeSession(motDePasse), expiration);
  const recue = Buffer.from(signature, 'base64url');
  return recue.length === attendue.length && timingSafeEqual(recue, attendue);
}

/**
 * @param {Request} request
 * @param {string} [nom]
 * @returns {string} la valeur du cookie, ou ''
 */
export function lireCookie(request, nom = COOKIE) {
  for (const morceau of (request.headers.get('cookie') ?? '').split(';')) {
    const egal = morceau.indexOf('=');
    if (egal > 0 && morceau.slice(0, egal).trim() === nom) return morceau.slice(egal + 1).trim();
  }
  return '';
}

/**
 * En-tête qui pose (ou efface) le cookie de session.
 * @param {string} jeton '' pour effacer
 * @param {boolean} securise vrai en HTTPS
 */
export function cookieDeSession(jeton, securise) {
  const attributs = [
    `${COOKIE}=${jeton}`,
    `Path=${CHEMIN_COOKIE}`,
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${jeton ? DUREE_SESSION_S : 0}`,
  ];
  if (securise) attributs.push('Secure');
  return attributs.join('; ');
}

/**
 * La demande porte-t-elle une session valide ?
 * @param {Request} request
 * @param {Record<string, string | undefined>} env
 * @returns {{ ok: true } | { ok: false, reponse: Response }}
 */
export function verifierAcces(request, env) {
  const motDePasse = motDePasseRegle(env);
  if (!motDePasse) return { ok: false, reponse: repondre(503, { ok: false, erreur: 'non-regle' }) };
  if (!sessionValide(lireCookie(request), motDePasse)) {
    return { ok: false, reponse: repondre(401, { ok: false, erreur: 'session' }) };
  }
  return { ok: true };
}

const limiteurParDefaut = creerLimiteur(ESSAIS, PERIODE_MS);

/**
 * POST : ouvre une session si le mot de passe est le bon. DELETE : la ferme.
 * @param {Request} request
 * @param {object} [contexte]
 * @param {Record<string, string | undefined>} [contexte.env]
 * @param {Pick<Console, 'warn' | 'error'>} [contexte.journal]
 * @param {(ms: number) => Promise<void>} [contexte.attente]
 * @param {{ autoriser: (cle: string) => boolean }} [contexte.limiteur]
 * @returns {Promise<Response>}
 */
export async function traiterConnexion(request, contexte = {}) {
  const {
    env = {},
    journal = console,
    attente = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms)),
    limiteur = limiteurParDefaut,
  } = contexte;
  const securise = enHttps(request);

  if (request.method === 'DELETE') {
    if (!memeOrigine(request)) return repondre(403, { ok: false, erreur: 'origine' });
    return repondre(200, { ok: true }, { 'Set-Cookie': cookieDeSession('', securise) });
  }
  if (request.method !== 'POST') return repondre(405, { ok: false, erreur: 'methode' }, { Allow: 'POST, DELETE' });
  if (!memeOrigine(request)) return repondre(403, { ok: false, erreur: 'origine' });

  const motDePasse = motDePasseRegle(env);
  if (!motDePasse) {
    journal.error('cockpit : mot de passe absent ou trop court (variable COCKPIT_MOT_DE_PASSE)');
    return repondre(503, { ok: false, erreur: 'non-regle' });
  }

  if (!limiteur.autoriser(adresseCliente(request))) {
    journal.warn('cockpit : trop d’essais de connexion');
    return repondre(429, { ok: false, erreur: 'limite' }, { 'Retry-After': '600' });
  }

  let saisi = '';
  try {
    const texte = await request.text();
    const donnees = texte.length <= 1024 ? JSON.parse(texte) : null;
    if (donnees && typeof donnees.motDePasse === 'string') saisi = donnees.motDePasse;
  } catch {
    return repondre(400, { ok: false, erreur: 'format' });
  }

  if (!saisi || !memeMotDePasse(saisi, motDePasse)) {
    await attente(PAUSE_ECHEC_MS);
    // Jamais le mot de passe saisi dans les journaux.
    journal.warn('cockpit : mot de passe refusé');
    return repondre(401, { ok: false, erreur: 'mot-de-passe' });
  }

  return repondre(200, { ok: true }, { 'Set-Cookie': cookieDeSession(creerSession(motDePasse), securise) });
}
