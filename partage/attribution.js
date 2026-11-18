// @ts-check
/**
 * Attribution : quelle publicité a amené une inscrite, et quand.
 * Le lien de chaque publicité porte des paramètres (UTM) que la landing garde
 * pendant toute la visite. À l'inscription, le serveur retient la publicité
 * d'arrivée ; le cockpit s'en sert ensuite pour relier pubs, rendez-vous et ventes.
 * Fonctions pures : aucune dépendance, aucun secret.
 */

/**
 * Paramètres d'URL à coller dans chaque publicité Meta (champ « Paramètres d'URL »).
 * Meta remplace lui-même les valeurs entre accolades. « utm_id » porte
 * l'identifiant de la publicité : sans lui, le cockpit se rabat sur son nom.
 */
export const PARAMETRES_PUB =
  'utm_source=meta&utm_medium=paid&utm_campaign={{campaign.name}}&utm_term={{adset.name}}&utm_content={{ad.name}}&utm_id={{ad.id}}';

/** Clé des inscrites arrivées sans paramètre de publicité (lien direct, email, test). */
export const SANS_PUB = '(sans)';

/** Longueur maximale d'un nom de publicité gardé. */
const NOM_MAX = 120;

/**
 * Nom d'une publicité ramené à une forme comparable : sans majuscules, espaces réduits.
 * Un paramètre que Meta n'a pas remplacé (« {{ad.name}} ») n'est pas un nom.
 * @param {unknown} brut
 * @returns {string}
 */
export function nomDePub(brut) {
  if (typeof brut !== 'string') return '';
  const nom = brut.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, NOM_MAX);
  if (!nom || nom.includes('{{') || nom.includes('}}')) return '';
  return nom.toLocaleLowerCase('fr');
}

/**
 * La clé d'une publicité, d'après les paramètres de son lien : son identifiant
 * Meta (« id:1202… ») quand le lien le porte, sinon son nom (« nom:… »).
 * @param {Record<string, unknown> | null | undefined} utm
 * @returns {string} '' quand rien ne désigne une publicité
 */
export function clePub(utm) {
  const id = typeof utm?.utm_id === 'string' ? utm.utm_id.trim() : '';
  if (/^\d{6,25}$/.test(id)) return `id:${id}`;
  const nom = nomDePub(utm?.utm_content);
  return nom ? `nom:${nom}` : '';
}

/**
 * L'identifiant de clic de Meta (« fbc »), fabriqué à partir du paramètre fbclid
 * du lien : fb.1.<instant en millisecondes>.<fbclid>.
 * @param {unknown} fbclid
 * @param {number} instantMs instant où le clic a été vu
 * @returns {string}
 */
export function fbcDepuis(fbclid, instantMs) {
  if (typeof fbclid !== 'string') return '';
  const clic = fbclid.trim();
  // Un fbclid est fait de lettres, de chiffres, de tirets et de soulignés.
  if (!/^[A-Za-z0-9_-]{8,500}$/.test(clic) || !Number.isFinite(instantMs)) return '';
  return `fb.1.${Math.round(instantMs)}.${clic}`;
}

const HEURE_PARIS = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', weekday: 'short', hour: '2-digit', hourCycle: 'h23' });
const JOURS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/**
 * Le créneau d'un instant, à l'heure de Paris.
 * @param {Date | number | string} instant
 * @returns {{ jour: number, heure: number } | null} jour : 0 = lundi … 6 = dimanche
 */
export function creneauParis(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return null;
  const parties = HEURE_PARIS.formatToParts(date);
  const jour = JOURS.indexOf(parties.find((p) => p.type === 'weekday')?.value ?? '');
  const heure = Number(parties.find((p) => p.type === 'hour')?.value);
  return jour < 0 || !Number.isInteger(heure) ? null : { jour, heure };
}

/**
 * Nombre de jours pleins entre deux instants (jamais négatif).
 * @param {number} debutMs
 * @param {number} finMs
 * @returns {number | null}
 */
export function ecartEnJours(debutMs, finMs) {
  if (!Number.isFinite(debutMs) || !Number.isFinite(finMs)) return null;
  return Math.max(0, Math.floor((finMs - debutMs) / 86400000));
}

/**
 * Nombre de jours de calendrier entre deux jours (« AAAA-MM-JJ ») : inscrite le 16
 * au soir et rendez-vous pris le 18, cela fait 2 jours.
 * @param {unknown} debut
 * @param {unknown} fin
 * @returns {number | null}
 */
export function joursEntre(debut, fin) {
  if (typeof debut !== 'string' || typeof fin !== 'string') return null;
  return ecartEnJours(Date.parse(`${debut}T12:00:00Z`), Date.parse(`${fin}T12:00:00Z`));
}

/** Tranches de délai, dans l'ordre d'affichage. */
export const TRANCHES_DELAI = Object.freeze([
  { cle: 'j0', nom: 'Le jour même', jusqu: 0 },
  { cle: 'j1', nom: 'Le lendemain', jusqu: 1 },
  { cle: 'j2-3', nom: '2 à 3 jours', jusqu: 3 },
  { cle: 'j4-7', nom: '4 à 7 jours', jusqu: 7 },
  { cle: 'j8-14', nom: '8 à 14 jours', jusqu: 14 },
  { cle: 'j15+', nom: '15 jours et plus', jusqu: Infinity },
]);

/**
 * La tranche d'un délai en jours.
 * @param {number | null | undefined} jours
 * @returns {string} '' si le délai est inconnu
 */
export function trancheDelai(jours) {
  if (typeof jours !== 'number' || !Number.isFinite(jours) || jours < 0) return '';
  return TRANCHES_DELAI.find((tranche) => jours <= tranche.jusqu)?.cle ?? '';
}
