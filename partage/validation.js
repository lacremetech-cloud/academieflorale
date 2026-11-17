// @ts-check
/**
 * Validation commune au navigateur (formulaire) et au serveur (/api/lead).
 * Fonctions pures : aucune dépendance, aucun secret.
 */

/** Longueur maximale d'un prénom enregistré. */
export const PRENOM_MAX = 40;
/** Longueur maximale d'un prénom affiché dans un titre. */
export const PRENOM_AFFICHE_MAX = 20;

/** Paramètres d'attribution lus dans l'adresse d'arrivée. */
export const CLES_UTM = Object.freeze([
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
]);

/**
 * Nettoie un prénom : lettres, espaces, tirets et apostrophes seulement,
 * majuscule initiale à chaque partie (« jean-pierre » devient « Jean-Pierre »).
 * @param {unknown} brut
 * @returns {string} le prénom propre, ou '' s'il est inutilisable
 */
export function nettoyerPrenom(brut) {
  if (typeof brut !== 'string') return '';
  let p = brut
    .normalize('NFC')
    .replace(/[^\p{L}\p{M}'’ -]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  p = p.slice(0, PRENOM_MAX).trim().replace(/^[-'’ ]+|[-'’ ]+$/g, '');
  if (!/\p{L}/u.test(p)) return '';
  return p
    .toLocaleLowerCase('fr-FR')
    .replace(/(^|[ \-'’])(\p{L})/gu, (_, avant, lettre) => avant + lettre.toLocaleUpperCase('fr-FR'));
}

/**
 * Prénom prêt à être affiché dans un titre : le prénom propre s'il est court,
 * sinon son premier mot, sinon rien (la page affiche alors sa version neutre).
 * @param {unknown} brut
 * @returns {string}
 */
export function prenomAffichable(brut) {
  const p = nettoyerPrenom(brut);
  if (!p) return '';
  if (p.length <= PRENOM_AFFICHE_MAX) return p;
  const premier = p.split(' ')[0] ?? '';
  return premier.length <= PRENOM_AFFICHE_MAX ? premier : '';
}

/**
 * @param {unknown} brut
 * @returns {string} l'email en minuscules, ou '' s'il est invalide
 */
export function nettoyerEmail(brut) {
  if (typeof brut !== 'string') return '';
  const e = brut.trim().toLowerCase();
  if (e.length < 6 || e.length > 254) return '';
  if (!/^[a-z0-9._%+\-]+@[a-z0-9¡-￿.\-]+\.[a-z¡-￿]{2,}$/u.test(e)) return '';
  if (e.includes('..') || e.startsWith('.') || e.includes('.@') || e.includes('@.') || e.includes('@-')) return '';
  return e;
}

/**
 * Met un numéro de téléphone au format international (+33612345678).
 * Un numéro français saisi « 06 12 34 56 78 » reçoit l'indicatif par défaut.
 * @param {unknown} brut
 * @param {string} [indicatif] indicatif par défaut, sans le « + »
 * @returns {string} le numéro au format international, ou '' s'il est invalide
 */
export function nettoyerTelephone(brut, indicatif = '33') {
  if (typeof brut !== 'string') return '';
  let t = brut.trim().replace(/[\s.\-()/  ]/g, '');
  if (t.startsWith('00')) t = '+' + t.slice(2);
  if (!/^\+?\d+$/.test(t)) return '';
  if (!t.startsWith('+')) {
    if (/^0\d{9}$/.test(t)) t = '+' + indicatif + t.slice(1);
    else if (/^[1-9]\d{8}$/.test(t)) t = '+' + indicatif + t;
    else return '';
  }
  // « +33 (0)6 12… » : le zéro entre parenthèses ne fait pas partie du numéro.
  const prefixe = '+' + indicatif + '0';
  if (t.startsWith(prefixe)) t = '+' + indicatif + t.slice(prefixe.length);
  if (t.startsWith('+33') && !/^\+33[1-9]\d{8}$/.test(t)) return '';
  return /^\+[1-9]\d{7,14}$/.test(t) ? t : '';
}

/**
 * Ne garde que les paramètres d'attribution connus, en texte court.
 * @param {unknown} brut
 * @returns {Record<string, string>}
 */
export function nettoyerUTM(brut) {
  /** @type {Record<string, string>} */
  const propres = {};
  if (!brut || typeof brut !== 'object') return propres;
  for (const cle of CLES_UTM) {
    const valeur = /** @type {Record<string, unknown>} */ (brut)[cle];
    if (typeof valeur !== 'string') continue;
    const v = valeur.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, cle === 'fbclid' ? 500 : 200);
    if (v) propres[cle] = v;
  }
  return propres;
}

/**
 * Identifiant de page ou de variante (« inscription/reconversion »).
 * @param {unknown} brut
 * @returns {string}
 */
export function nettoyerSlug(brut) {
  if (typeof brut !== 'string') return '';
  const s = brut.trim().toLowerCase().replace(/^\/+|\/+$/g, '');
  return /^[a-z0-9][a-z0-9\-/]{0,79}$/.test(s) ? s : '';
}
