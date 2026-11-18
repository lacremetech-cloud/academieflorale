// @ts-check
/**
 * Cockpit : calculs communs au serveur et à la page.
 * Un « jour » rassemble les chiffres bruts d'une journée (tout ce qui s'additionne) ;
 * les indicateurs (coûts, taux, ROAS) s'en déduisent, pour un jour comme pour un mois.
 * Un chiffre vaut null tant que sa source n'est pas branchée : la page affiche
 * alors un tiret, jamais un zéro trompeur.
 * Fonctions pures : aucune dépendance, aucun secret.
 */

/** Durée de la VSL, en minutes (10 min 31) : sert à dire quelle part de la vidéo est vue. */
export const DUREE_VSL_MINUTES = 631 / 60;

/**
 * Chiffres bruts d'une journée, par source.
 * - Meta Ads : depense (€), impressions, clics (clics sur le lien)
 * - Tunnel : vues (affichages de la landing), inscrits (formulaires envoyés)
 * - Wistia : chargements et lectures de la VSL, heures regardées
 * - iClosed : appels réservés ce jour-là ; annulés et absentes des appels prévus ce jour-là
 * - Registre des ventes : ventes du jour, commandé (€, « contracte » dans le code) et ce qui en est déjà encaissé (€)
 */
export const BRUTS = Object.freeze([
  'depense',
  'impressions',
  'clics',
  'vues',
  'inscrits',
  'chargements',
  'lectures',
  'heures',
  'appels',
  'annules',
  'absentes',
  'ventes',
  'contracte',
  'encaisse',
]);

/** @typedef {Record<string, number | null>} Chiffres */

/** @param {unknown} texte « 2026-11 » */
export function moisValide(texte) {
  if (typeof texte !== 'string' || !/^\d{4}-(0[1-9]|1[0-2])$/.test(texte)) return false;
  const annee = Number(texte.slice(0, 4));
  return annee >= 2024 && annee <= 2100;
}

/**
 * Les jours d'un mois : ['2026-11-01', …, '2026-11-30'].
 * @param {string} mois « 2026-11 »
 * @returns {string[]}
 */
export function joursDuMois(mois) {
  const [annee, numero] = mois.split('-').map(Number);
  const nombre = new Date(Date.UTC(annee ?? 0, numero ?? 1, 0)).getUTCDate();
  return Array.from({ length: nombre }, (_, i) => `${mois}-${String(i + 1).padStart(2, '0')}`);
}

/**
 * Les jours d'un mois qui ne sont pas à venir : tout le mois s'il est passé, ses
 * premiers jours jusqu'à aujourd'hui s'il est en cours, rien s'il est à venir.
 * Une source ne doit jamais être interrogée sur des jours à venir : certaines
 * répondent alors par des zéros pour toute la période.
 * @param {string} mois « 2026-11 »
 * @param {Date | string | number} [maintenant]
 * @returns {string[]}
 */
export function joursEcoules(mois, maintenant = new Date()) {
  const aujourdHui = jourParis(maintenant);
  return joursDuMois(mois).filter((jour) => jour <= aujourdHui);
}

/**
 * Le mois voisin : moisDecale('2026-01', -1) donne '2025-12'.
 * @param {string} mois
 * @param {number} ecart
 */
export function moisDecale(mois, ecart) {
  const [annee, numero] = mois.split('-').map(Number);
  const date = new Date(Date.UTC(annee ?? 0, (numero ?? 1) - 1 + ecart, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

/**
 * Le jour (AAAA-MM-JJ) d'un instant, à l'heure de Paris : c'est le fuseau du
 * compte publicitaire et de l'équipe.
 * @param {Date | string | number} instant
 * @returns {string} '' si l'instant est illisible
 */
export function jourParis(instant) {
  const date = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(date.getTime())) return '';
  // « fr-CA » écrit les dates sous la forme AAAA-MM-JJ.
  return new Intl.DateTimeFormat('fr-CA', { timeZone: 'Europe/Paris' }).format(date);
}

/** Le mois en cours, à l'heure de Paris. */
export function moisCourant(maintenant = new Date()) {
  return jourParis(maintenant).slice(0, 7);
}

/**
 * @param {number | null | undefined} a
 * @param {number | null | undefined} b
 * @returns {number | null} null si l'un des deux manque ou si le diviseur est nul
 */
function rapport(a, b) {
  if (a == null || b == null || b === 0) return null;
  return a / b;
}

/**
 * Additionne des journées, chiffre par chiffre. Un chiffre absent de toutes les
 * journées reste null.
 * @param {Chiffres[]} jours
 * @returns {Chiffres}
 */
export function totaliser(jours) {
  /** @type {Chiffres} */
  const total = {};
  for (const cle of BRUTS) {
    let somme = null;
    for (const jour of jours) {
      const valeur = jour[cle];
      if (typeof valeur === 'number' && Number.isFinite(valeur)) somme = (somme ?? 0) + valeur;
    }
    total[cle] = somme;
  }
  return total;
}

/**
 * Les indicateurs d'une journée ou d'un mois, à partir de ses chiffres bruts.
 * Mêmes définitions que le tableau publicitaire d'origine, sans le second appel
 * (R1 closing : la vente se fait au premier appel).
 * @param {Chiffres} b
 */
export function indicateurs(b) {
  const maintenus = b.appels == null ? null : Math.max(0, b.appels - (b.annules ?? 0));
  const minutesVues = b.heures == null ? null : rapport(b.heures * 60, b.lectures);
  const reste = b.contracte == null ? null : Math.max(0, b.contracte - (b.encaisse ?? 0));
  return {
    // Acquisition
    cpm: b.depense == null ? null : rapport(b.depense * 1000, b.impressions),
    ctr: rapport(b.clics, b.impressions),
    cpc: rapport(b.depense, b.clics),
    /** Coût par inscrite (« CPP »). */
    cpp: rapport(b.depense, b.inscrits),
    /** Inscrites pour 100 clics (« % PI »). */
    tauxInscription: rapport(b.inscrits, b.clics),
    // VSL
    /** Lectures pour 100 chargements de la vidéo. */
    tauxLecture: rapport(b.lectures, b.chargements),
    /** Minutes regardées par lecture, en moyenne. */
    minutesVues,
    /** Part de la vidéo regardée, en moyenne (0 à 1). */
    partVue: minutesVues == null ? null : Math.min(1, minutesVues / DUREE_VSL_MINUTES),
    /** Appels réservés pour 100 inscrites. */
    tauxAppel: rapport(b.appels, b.inscrits),
    /** Coût par appel réservé (« CPA »). */
    cpa: rapport(b.depense, b.appels),
    // Closing
    /** Annulations pour 100 appels réservés (« % Canc. »). */
    tauxAnnulation: rapport(b.annules, b.appels),
    /** Appels réservés moins les annulés (« Q. Calls »). */
    maintenus,
    /** Coût par appel maintenu (« Q. CPA »). */
    cpaMaintenu: rapport(b.depense, maintenus),
    /** Ventes pour 100 appels maintenus. */
    tauxClosing: rapport(b.ventes, maintenus),
    /** Commandé moins encaissé (« Reste »). */
    reste,
    /** Coût par vente (« CPV »). */
    cpv: rapport(b.depense, b.ventes),
    /** Commandé pour 1 € dépensé (« ROAS »). */
    roas: rapport(b.contracte, b.depense),
    /** Encaissé pour 1 € dépensé (« D. ROAS »). */
    roasDirect: rapport(b.encaisse, b.depense),
  };
}

/**
 * Une journée sans aucun chiffre : tout à null.
 * @returns {Chiffres}
 */
export function jourVide() {
  return Object.fromEntries(BRUTS.map((cle) => [cle, null]));
}
