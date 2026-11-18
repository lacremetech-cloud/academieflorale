// @ts-check
/**
 * Ventes de l'Académie Florale : les formules, les moyens de paiement, et le
 * calcul de ce que l'Académie encaisse et quand (l'échéancier de chaque vente).
 * Le cockpit en tire les ventes du jour, l'encaissé, le reste à encaisser, les
 * mensualités attendues chaque mois (MRR) et les commissions.
 *
 * Fonctions pures, communes au serveur et à la page : aucune dépendance,
 * aucun secret. Les montants sont en euros, calculés en centimes.
 */

/** Les trois formules vendues. Le montant de la vente est toujours saisi. */
export const FORMULES = Object.freeze({
  essentiel: 'Fleuriste Essentiel',
  independant: 'Fleuriste Indépendant',
  business: 'Fleuriste Business',
});

/**
 * Les moyens de paiement, et ce que chacun fait entrer en caisse.
 * - GoCardless, virement : la somme arrive à chaque échéance (une fois, ou une
 *   mensualité par mois).
 * - Secura : l'Académie reçoit 70 % le lendemain, 15 % trois mois plus tard et
 *   15 % à la fin des mensualités de l'élève.
 * - CPF : la somme arrive 60 jours après.
 */
export const METHODES = Object.freeze({
  gocardless: { nom: 'GoCardless', enPlusieursFois: true },
  virement: { nom: 'Virement bancaire', enPlusieursFois: true },
  secura: { nom: 'Secura', enPlusieursFois: true },
  cpf: { nom: 'CPF', enPlusieursFois: false },
});

/** Secura : part reçue d'abord, et son délai en jours. */
export const SECURA_ACOMPTE = 0.7;
export const SECURA_ACOMPTE_JOURS = 1;
/** Secura : part reçue ensuite, et son délai en mois. Le solde arrive à la fin des mensualités. */
export const SECURA_SECONDE_PART = 0.15;
export const SECURA_SECONDE_MOIS = 3;
/** CPF : délai de paiement, en jours. */
export const CPF_JOURS = 60;

export const MONTANT_MAX = 200000;
export const MENSUALITES_MAX = 48;
export const PAIEMENTS_MAX = 6;
export const NOTE_VENTE_MAX = 200;
export const NOM_CLOSER_MAX = 60;
/** Aucune vente n'est acceptée avant cette date. */
const PREMIER_JOUR = '2024-01-01';

/**
 * @typedef {{ methode: string, montant: number, mensualites: number, debut: string }} Paiement
 * @typedef {{ id?: string, date: string, formule: string, montant: number, commission: number,
 *   closer?: string, closerNom?: string, paiements: Paiement[], note?: string, creeLe?: string }} Vente
 * @typedef {{ date: string, montant: number, methode: string, recurrent: boolean, etape: string }} Echeance
 */

/* ---------- Dates (jours « AAAA-MM-JJ », sans fuseau) ---------- */

/** @param {unknown} texte */
export function jourValide(texte) {
  if (typeof texte !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(texte)) return false;
  const date = new Date(`${texte}T12:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === texte;
}

/**
 * @param {string} jour
 * @param {number} nombre
 */
export function ajouterJours(jour, nombre) {
  const date = new Date(`${jour}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + nombre);
  return date.toISOString().slice(0, 10);
}

/**
 * Le même jour, quelques mois plus tard ; le dernier jour du mois quand ce jour
 * n'existe pas (le 31 janvier plus un mois donne le 28 ou le 29 février).
 * @param {string} jour
 * @param {number} nombre
 */
export function ajouterMois(jour, nombre) {
  const [annee, mois, quantieme] = jour.split('-').map(Number);
  const cible = new Date(Date.UTC(annee ?? 0, (mois ?? 1) - 1 + nombre, 1, 12));
  const dernier = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0, 12)).getUTCDate();
  cible.setUTCDate(Math.min(quantieme ?? 1, dernier));
  return cible.toISOString().slice(0, 10);
}

/* ---------- Montants ---------- */

/** @param {number} montant */
const centimes = (montant) => Math.round(montant * 100);

/**
 * Lit un montant saisi : 3000, « 1 500,50 », « 1000 € », ''…
 * @param {unknown} brut
 * @returns {number | null | undefined} le montant ; null si rien n'est saisi ;
 *   undefined si la saisie est illisible ou hors limites
 */
export function lireMontant(brut) {
  if (brut == null) return null;
  let nombre;
  if (typeof brut === 'number') nombre = brut;
  else if (typeof brut === 'string') {
    const texte = brut.replace(/[\s€]/g, '').replace(',', '.');
    if (texte === '') return null;
    if (!/^\d+(\.\d{1,2})?$/.test(texte)) return undefined;
    nombre = Number(texte);
  } else return undefined;
  if (!Number.isFinite(nombre) || nombre < 0 || nombre > MONTANT_MAX) return undefined;
  return centimes(nombre) / 100;
}

/**
 * Partage une somme en parts égales, au centime près : les centimes en trop
 * vont aux premières parts, et le total est toujours exact.
 * @param {number} montant
 * @param {number} nombre
 * @returns {number[]}
 */
export function partager(montant, nombre) {
  const total = centimes(montant);
  const base = Math.floor(total / nombre);
  const reste = total - base * nombre;
  return Array.from({ length: nombre }, (_, rang) => (base + (rang < reste ? 1 : 0)) / 100);
}

/* ---------- L'échéancier d'une vente ---------- */

/**
 * Ce que l'Académie encaisse pour une vente, et quand, dans l'ordre des dates.
 * `recurrent` marque les mensualités d'un paiement en plusieurs fois (GoCardless
 * ou virement) : c'est ce que le cockpit appelle le MRR.
 * @param {Pick<Vente, 'date' | 'paiements'>} vente
 * @returns {Echeance[]}
 */
export function echeancier(vente) {
  /** @type {Echeance[]} */
  const echeances = [];
  for (const paiement of vente.paiements ?? []) {
    const debut = paiement.debut || vente.date;
    const fois = METHODES[/** @type {keyof typeof METHODES} */ (paiement.methode)]?.enPlusieursFois
      ? Math.max(1, Math.round(paiement.mensualites ?? 1))
      : 1;
    if (paiement.methode === 'secura') {
      const total = centimes(paiement.montant);
      const acompte = Math.round(total * SECURA_ACOMPTE);
      const seconde = Math.round(total * SECURA_SECONDE_PART);
      echeances.push(
        { date: ajouterJours(debut, SECURA_ACOMPTE_JOURS), montant: acompte / 100, methode: 'secura', recurrent: false, etape: '70 % le lendemain' },
        { date: ajouterMois(debut, SECURA_SECONDE_MOIS), montant: seconde / 100, methode: 'secura', recurrent: false, etape: '15 % à 3 mois' },
        { date: ajouterMois(debut, fois), montant: (total - acompte - seconde) / 100, methode: 'secura', recurrent: false, etape: '15 % à la fin des mensualités' },
      );
    } else if (paiement.methode === 'cpf') {
      echeances.push({ date: ajouterJours(debut, CPF_JOURS), montant: paiement.montant, methode: 'cpf', recurrent: false, etape: 'payé à 60 jours' });
    } else {
      partager(paiement.montant, fois).forEach((part, rang) =>
        echeances.push({
          date: ajouterMois(debut, rang),
          montant: part,
          methode: paiement.methode,
          recurrent: fois > 1,
          etape: fois > 1 ? `mensualité ${rang + 1} sur ${fois}` : 'en une fois',
        }),
      );
    }
  }
  return echeances.filter((echeance) => echeance.montant > 0).sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

/**
 * Ce qui est encaissé à une date donnée, d'après l'échéancier (les échéances
 * passées sont réputées payées : le cockpit ne connaît pas les impayés).
 * @param {Pick<Vente, 'date' | 'paiements'>} vente
 * @param {string} aujourdHui
 */
export function encaisseAu(vente, aujourdHui) {
  return centimes(echeancier(vente).reduce((somme, echeance) => somme + (echeance.date <= aujourdHui ? echeance.montant : 0), 0)) / 100;
}

/* ---------- Vérification d'une vente saisie ---------- */

/**
 * @param {unknown} texte
 * @param {number} longueur
 */
export function texteCourt(texte, longueur) {
  return (typeof texte === 'string' ? texte : '')
    .replace(/[\u0000-\u001f\u007f<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, longueur);
}

/**
 * Vérifie et met au propre une vente saisie (sans son closer, que le serveur
 * rattache ensuite). La somme des paiements doit égaler le montant de la vente.
 * @param {any} brut
 * @param {{ aujourdHui: string }} options
 * @returns {{ ok: true, vente: Vente } | { ok: false, erreur: 'vente' | 'date' | 'formule' | 'montant' | 'commission' | 'paiements' | 'repartition' }}
 */
export function normaliserVente(brut, { aujourdHui }) {
  /** @param {'vente' | 'date' | 'formule' | 'montant' | 'commission' | 'paiements' | 'repartition'} code */
  const refus = (code) => /** @type {const} */ ({ ok: false, erreur: code });
  if (!brut || typeof brut !== 'object') return refus('vente');
  const date = typeof brut.date === 'string' ? brut.date : '';
  // Une vente ne s'enregistre pas pour un jour à venir.
  if (!jourValide(date) || date > aujourdHui || date < PREMIER_JOUR) return refus('date');
  if (typeof brut.formule !== 'string' || !Object.hasOwn(FORMULES, brut.formule)) return refus('formule');
  const montant = lireMontant(brut.montant);
  if (!montant) return refus('montant');
  const commission = lireMontant(brut.commission ?? 0);
  if (commission === undefined || (commission ?? 0) > montant) return refus('commission');

  const lignes = Array.isArray(brut.paiements) ? brut.paiements : [];
  if (lignes.length < 1 || lignes.length > PAIEMENTS_MAX) return refus('paiements');
  /** @type {Paiement[]} */
  const paiements = [];
  for (const ligne of lignes) {
    if (!ligne || typeof ligne.methode !== 'string' || !Object.hasOwn(METHODES, ligne.methode)) return refus('paiements');
    const part = lireMontant(ligne.montant);
    if (!part) return refus('paiements');
    const methode = METHODES[/** @type {keyof typeof METHODES} */ (ligne.methode)];
    const fois = methode.enPlusieursFois ? Number(ligne.mensualites ?? 1) : 1;
    if (!Number.isInteger(fois) || fois < 1 || fois > MENSUALITES_MAX) return refus('paiements');
    const debut = ligne.debut == null || ligne.debut === '' ? date : ligne.debut;
    if (!jourValide(debut) || debut < ajouterJours(date, -366) || debut > ajouterJours(date, 731)) return refus('paiements');
    paiements.push({ methode: ligne.methode, montant: part, mensualites: fois, debut });
  }
  if (paiements.reduce((somme, paiement) => somme + centimes(paiement.montant), 0) !== centimes(montant)) return refus('repartition');

  return {
    ok: true,
    vente: { date, formule: brut.formule, montant, commission: commission ?? 0, paiements, note: texteCourt(brut.note, NOTE_VENTE_MAX) },
  };
}

/* ---------- Ce que le cockpit affiche ---------- */

/**
 * Le mois voisin : « 2026-11 » plus 2 donne « 2027-01 ».
 * @param {string} mois
 * @param {number} ecart
 */
function moisPlus(mois, ecart) {
  return ajouterMois(`${mois}-01`, ecart).slice(0, 7);
}

/**
 * À partir de toutes les ventes, ce que le cockpit affiche pour un mois :
 * - `jours` : par jour de vente, le nombre de ventes, le contracté et ce qui en
 *   est déjà encaissé aujourd'hui ;
 * - `ventes` : les ventes du mois, avec leur encaissé et leur reste ;
 * - `encaissements` : ce qui entre en caisse mois par mois (toutes ventes
 *   confondues), par moyen de paiement, dont les mensualités (MRR) ;
 * - `aEncaisser` : tout ce qui reste à venir, toutes ventes confondues ;
 * - `commissions` : par closer, pour les ventes du mois.
 * @param {Vente[]} toutes
 * @param {{ mois: string, aujourdHui: string, horizon?: number }} options
 */
export function calculerVentes(toutes, { mois, aujourdHui, horizon = 12 }) {
  /** @type {Record<string, { ventes: number, contracte: number, encaisse: number }>} */
  const jours = {};
  /** @type {Record<string, { mois: string, total: number, mensualites: number, encaisse: number, parMethode: Record<string, number> }>} */
  const parMois = {};
  for (let rang = 0; rang < horizon; rang += 1) {
    const cle = moisPlus(mois, rang);
    parMois[cle] = { mois: cle, total: 0, mensualites: 0, encaisse: 0, parMethode: Object.fromEntries(Object.keys(METHODES).map((methode) => [methode, 0])) };
  }
  /** @type {Record<string, { closer: string, nom: string, ventes: number, contracte: number, commission: number }>} */
  const parCloser = {};
  let aEncaisser = 0;
  const duMois = [];

  for (const vente of toutes) {
    const echeances = echeancier(vente);
    let encaisse = 0;
    for (const echeance of echeances) {
      const valeur = centimes(echeance.montant);
      if (echeance.date <= aujourdHui) encaisse += valeur;
      else aEncaisser += valeur;
      const ligne = parMois[echeance.date.slice(0, 7)];
      if (!ligne) continue;
      ligne.total += valeur;
      ligne.parMethode[echeance.methode] = (ligne.parMethode[echeance.methode] ?? 0) + valeur;
      if (echeance.recurrent) ligne.mensualites += valeur;
      if (echeance.date <= aujourdHui) ligne.encaisse += valeur;
    }
    if (vente.date.slice(0, 7) !== mois) continue;
    const jour = (jours[vente.date] ??= { ventes: 0, contracte: 0, encaisse: 0 });
    jour.ventes += 1;
    jour.contracte += centimes(vente.montant);
    jour.encaisse += encaisse;
    const cle = vente.closer ?? '';
    const closer = (parCloser[cle] ??= { closer: cle, nom: vente.closerNom ?? '', ventes: 0, contracte: 0, commission: 0 });
    closer.ventes += 1;
    closer.contracte += centimes(vente.montant);
    closer.commission += centimes(vente.commission ?? 0);
    duMois.push({ ...vente, encaisse: encaisse / 100, reste: (centimes(vente.montant) - encaisse) / 100 });
  }

  for (const jour of Object.values(jours)) {
    jour.contracte /= 100;
    jour.encaisse /= 100;
  }
  return {
    jours,
    ventes: duMois.sort((a, b) => (a.date === b.date ? String(a.creeLe ?? '').localeCompare(String(b.creeLe ?? '')) : a.date < b.date ? -1 : 1)),
    encaissements: Object.values(parMois).map((ligne) => ({
      mois: ligne.mois,
      total: ligne.total / 100,
      mensualites: ligne.mensualites / 100,
      encaisse: ligne.encaisse / 100,
      parMethode: Object.fromEntries(Object.entries(ligne.parMethode).map(([methode, valeur]) => [methode, valeur / 100])),
    })),
    aEncaisser: aEncaisser / 100,
    commissions: Object.values(parCloser)
      .map((closer) => ({ ...closer, contracte: closer.contracte / 100, commission: closer.commission / 100 }))
      .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
  };
}
