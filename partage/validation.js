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
 * Pays proposés dans le champ téléphone, dans l'ordre d'affichage.
 * - indicatif : sans le « + » ;
 * - zero : le numéro national s'écrit avec un 0 devant, qu'on retire à l'international ;
 * - longueurs : nombres de chiffres acceptés après l'indicatif (absent : contrôle général) ;
 * - exemple : ce que la visiteuse voit dans le champ vide.
 * Un pays absent de la liste passe par « Autre pays » : numéro saisi avec son « + ».
 * @type {Readonly<Record<string, { nom: string, indicatif: string, zero: boolean, longueurs?: number[], exemple: string }>>}
 */
export const PAYS_TELEPHONE = Object.freeze({
  FR: { nom: 'France', indicatif: '33', zero: true, longueurs: [9], exemple: '06 12 34 56 78' },
  BE: { nom: 'Belgique', indicatif: '32', zero: true, longueurs: [8, 9], exemple: '0470 12 34 56' },
  CH: { nom: 'Suisse', indicatif: '41', zero: true, longueurs: [9], exemple: '079 123 45 67' },
  LU: { nom: 'Luxembourg', indicatif: '352', zero: false, exemple: '621 123 456' },
  MC: { nom: 'Monaco', indicatif: '377', zero: false, exemple: '06 12 34 56 78' },
  CA: { nom: 'Canada', indicatif: '1', zero: false, longueurs: [10], exemple: '514 555 0123' },
  RE: { nom: 'La Réunion', indicatif: '262', zero: true, longueurs: [9], exemple: '0692 12 34 56' },
  GP: { nom: 'Guadeloupe', indicatif: '590', zero: true, longueurs: [9], exemple: '0690 12 34 56' },
  MQ: { nom: 'Martinique', indicatif: '596', zero: true, longueurs: [9], exemple: '0696 12 34 56' },
  GF: { nom: 'Guyane', indicatif: '594', zero: true, longueurs: [9], exemple: '0694 12 34 56' },
  YT: { nom: 'Mayotte', indicatif: '262', zero: true, longueurs: [9], exemple: '0639 12 34 56' },
  NC: { nom: 'Nouvelle-Calédonie', indicatif: '687', zero: false, exemple: '75 12 34' },
  PF: { nom: 'Polynésie française', indicatif: '689', zero: false, exemple: '87 12 34 56' },
  DE: { nom: 'Allemagne', indicatif: '49', zero: true, exemple: '0151 23456789' },
  ES: { nom: 'Espagne', indicatif: '34', zero: false, exemple: '612 34 56 78' },
  IT: { nom: 'Italie', indicatif: '39', zero: false, exemple: '312 345 6789' },
  PT: { nom: 'Portugal', indicatif: '351', zero: false, exemple: '912 345 678' },
  NL: { nom: 'Pays-Bas', indicatif: '31', zero: true, exemple: '06 12345678' },
  GB: { nom: 'Royaume-Uni', indicatif: '44', zero: true, exemple: '07400 123456' },
  IE: { nom: 'Irlande', indicatif: '353', zero: true, exemple: '085 012 3456' },
  US: { nom: 'États-Unis', indicatif: '1', zero: false, longueurs: [10], exemple: '201 555 0123' },
  MA: { nom: 'Maroc', indicatif: '212', zero: true, exemple: '0612 345678' },
  DZ: { nom: 'Algérie', indicatif: '213', zero: true, exemple: '0551 23 45 67' },
  TN: { nom: 'Tunisie', indicatif: '216', zero: false, exemple: '20 123 456' },
  SN: { nom: 'Sénégal', indicatif: '221', zero: false, exemple: '70 123 45 67' },
  CI: { nom: 'Côte d’Ivoire', indicatif: '225', zero: false, exemple: '01 23 45 67 89' },
});

/**
 * Met un numéro de téléphone au format international (+33612345678).
 * La visiteuse tape son numéro comme d'habitude (« 06 12 34 56 78 ») : l'indicatif
 * vient du pays choisi. Un numéro déjà international (« +32… » ou « 0032… ») est
 * accepté tel quel, quel que soit le pays choisi.
 * @param {unknown} brut
 * @param {unknown} [pays] code du pays (FR, BE, CH…) ; inconnu ou vide : numéro attendu avec son « + »
 * @returns {string} le numéro au format international, ou '' s'il est invalide
 */
export function nettoyerTelephone(brut, pays = 'FR') {
  if (typeof brut !== 'string') return '';
  let t = brut.trim().replace(/[\s.\-()/  ]/g, '');
  if (t.startsWith('00')) t = '+' + t.slice(2);
  if (!/^\+?\d+$/.test(t)) return '';

  const code = typeof pays === 'string' ? pays.toUpperCase() : '';
  let regle = Object.hasOwn(PAYS_TELEPHONE, code) ? PAYS_TELEPHONE[code] : undefined;

  if (t.startsWith('+')) {
    // Numéro international : on retrouve le pays d'après l'indicatif, pour le contrôler.
    regle = Object.values(PAYS_TELEPHONE).find((r) => t.startsWith('+' + r.indicatif) && (r.longueurs || r.indicatif.length > 1));
    if (regle?.zero && t.startsWith('+' + regle.indicatif + '0')) {
      // « +33 (0)6 12… » : le zéro entre parenthèses ne fait pas partie du numéro.
      t = '+' + regle.indicatif + t.slice(regle.indicatif.length + 2);
    }
  } else {
    if (!regle) return '';
    if (regle.zero && t.startsWith('0')) t = t.slice(1);
    t = '+' + regle.indicatif + t;
  }

  if (regle?.longueurs) {
    const national = t.slice(regle.indicatif.length + 1);
    if (!regle.longueurs.includes(national.length) || national.startsWith('0')) return '';
  }
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
