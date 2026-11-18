// @ts-check
/**
 * Rapport des publicités : de la publicité au rendez-vous, puis à la vente.
 * Les publicités sont regroupées par nom (la même création diffusée dans plusieurs
 * ensembles ne fait qu'une ligne) : c'est la création, donc l'angle, qu'on juge.
 *
 * Deux sources pour les résultats d'une publicité :
 * - « tunnel » : ce que le tunnel a vu lui-même (inscrites retenues à l'inscription,
 *   rendez-vous d'iClosed, ventes du cockpit), rattaché à la publicité d'arrivée ;
 * - « meta » : ce que Meta attribue à la publicité (pixel et API de conversion).
 *
 * Fonctions pures, communes au serveur et à la page : aucune dépendance, aucun secret.
 */
import { nomDePub, SANS_PUB } from './attribution.js';

/**
 * @typedef {object} PubMeta une publicité, telle que Meta la décrit sur la période
 * @property {string} id
 * @property {string} nom
 * @property {string} campagne
 * @property {string} ensemble
 * @property {number} depense
 * @property {number} impressions
 * @property {number} clics clics sur le lien
 * @property {number} vues3s lectures de la vidéo d'au moins 3 secondes
 * @property {number} vuesCompletes lectures complètes ou d'au moins 15 secondes (ThruPlay)
 * @property {number} prospects événements « Prospect » attribués par Meta
 * @property {number} rdv événements « Rendez-vous programmé » attribués par Meta
 * @property {number} achats événements « Achat » attribués par Meta
 * @property {number} valeurAchats
 *
 * @typedef {object} FichePub ce que Meta sait d'une publicité, hors chiffres
 * @property {string} [nom]
 * @property {string} [statut]
 * @property {string} [creeLe]
 * @property {string} [titre]
 * @property {string} [texte]
 * @property {string} [vignette]
 *
 * @typedef {{ inscrites: number, rdv: number, rdvAnnules: number, ventes: number, commande: number, encaisse: number }} ResultatsTunnel
 * @typedef {{ prospects: number, rdv: number, achats: number, valeur: number }} ResultatsMeta
 *
 * @typedef {object} LignePub une création publicitaire (toutes ses diffusions réunies)
 * @property {string} cle
 * @property {string} nom
 * @property {string[]} ids
 * @property {string[]} campagnes
 * @property {number} ensembles
 * @property {string} statut
 * @property {string} creeLe
 * @property {string} titre
 * @property {string} texte
 * @property {string} vignette
 * @property {number} depense
 * @property {number} impressions
 * @property {number} clics
 * @property {number} vues3s
 * @property {number} vuesCompletes
 * @property {ResultatsMeta} meta
 * @property {ResultatsTunnel} tunnel
 *
 * @typedef {'tunnel' | 'meta'} SourcePub
 * @typedef {'gagnante' | 'prometteuse' | 'moyenne' | 'a-couper' | 'trop-tot' | ''} Verdict
 */

/** Les verdicts, du meilleur au moins bon : c'est l'ordre d'affichage. */
export const VERDICTS = Object.freeze({
  gagnante: 'Gagnante',
  prometteuse: 'Prometteuse',
  moyenne: 'Dans la moyenne',
  'trop-tot': 'Trop tôt pour juger',
  'a-couper': 'À couper',
});

/** @returns {ResultatsTunnel} */
const tunnelVide = () => ({ inscrites: 0, rdv: 0, rdvAnnules: 0, ventes: 0, commande: 0, encaisse: 0 });

/**
 * @param {string} cle
 * @param {string} nom
 * @returns {LignePub}
 */
function ligneVide(cle, nom) {
  return {
    cle,
    nom,
    ids: [],
    campagnes: [],
    ensembles: 0,
    statut: '',
    creeLe: '',
    titre: '',
    texte: '',
    vignette: '',
    depense: 0,
    impressions: 0,
    clics: 0,
    vues3s: 0,
    vuesCompletes: 0,
    meta: { prospects: 0, rdv: 0, achats: 0, valeur: 0 },
    tunnel: tunnelVide(),
  };
}

/**
 * Réunit les publicités de Meta par nom de création.
 * @param {PubMeta[]} pubs
 * @param {Record<string, FichePub>} [fiches] par identifiant de publicité
 * @returns {LignePub[]}
 */
export function regrouperPubs(pubs, fiches = {}) {
  /** @type {Map<string, LignePub>} */
  const lignes = new Map();
  /** @type {Map<string, Set<string>>} */
  const ensembles = new Map();
  for (const pub of pubs) {
    const cle = `nom:${nomDePub(pub.nom) || pub.id}`;
    const ligne = lignes.get(cle) ?? ligneVide(cle, pub.nom || `Publicité ${pub.id}`);
    lignes.set(cle, ligne);
    ligne.ids.push(pub.id);
    if (pub.campagne && !ligne.campagnes.includes(pub.campagne)) ligne.campagnes.push(pub.campagne);
    ensembles.set(cle, (ensembles.get(cle) ?? new Set()).add(`${pub.campagne}/${pub.ensemble}`));
    ligne.depense += pub.depense;
    ligne.impressions += pub.impressions;
    ligne.clics += pub.clics;
    ligne.vues3s += pub.vues3s;
    ligne.vuesCompletes += pub.vuesCompletes;
    ligne.meta.prospects += pub.prospects;
    ligne.meta.rdv += pub.rdv;
    ligne.meta.achats += pub.achats;
    ligne.meta.valeur += pub.valeurAchats;

    const fiche = fiches[pub.id];
    if (!fiche) continue;
    // Une création active dans au moins un ensemble est « active ».
    if (fiche.statut === 'ACTIVE' || !ligne.statut) ligne.statut = fiche.statut ?? ligne.statut;
    if (fiche.creeLe && (!ligne.creeLe || fiche.creeLe < ligne.creeLe)) ligne.creeLe = fiche.creeLe;
    ligne.titre ||= fiche.titre ?? '';
    ligne.texte ||= fiche.texte ?? '';
    ligne.vignette ||= fiche.vignette ?? '';
  }
  for (const [cle, ligne] of lignes) {
    ligne.ensembles = ensembles.get(cle)?.size ?? 0;
    ligne.depense = Math.round(ligne.depense * 100) / 100;
    ligne.meta.valeur = Math.round(ligne.meta.valeur * 100) / 100;
  }
  return [...lignes.values()];
}

/**
 * Rattache aux créations ce que le tunnel a vu : inscrites, rendez-vous, ventes.
 * Une publicité inconnue de Meta sur la période (plus diffusée, ou nom changé)
 * obtient sa propre ligne, sans dépense. Ce qui n'a aucune publicité d'arrivée
 * est compté à part.
 * @param {LignePub[]} lignes modifiées sur place
 * @param {object} vu
 * @param {Record<string, number>} [vu.inscrites] par clé de publicité
 * @param {{ pub: string, annule?: boolean }[]} [vu.rdv]
 * @param {{ pub: string, montant: number, encaisse: number }[]} [vu.ventes]
 * @param {Record<string, string>} [vu.noms] noms des publicités inconnues de la période, par identifiant
 * @returns {{ lignes: LignePub[], sansPub: ResultatsTunnel }}
 */
export function rattacherTunnel(lignes, vu) {
  /** @type {Map<string, LignePub>} */
  const parCle = new Map(lignes.map((ligne) => [ligne.cle, ligne]));
  /** @type {Map<string, LignePub>} */
  const parId = new Map();
  for (const ligne of lignes) for (const id of ligne.ids) parId.set(id, ligne);
  const sansPub = tunnelVide();

  /** @param {string} pub @returns {ResultatsTunnel} */
  const resultats = (pub) => {
    if (!pub || pub === SANS_PUB) return sansPub;
    let ligne;
    if (pub.startsWith('id:')) {
      const id = pub.slice(3);
      ligne = parId.get(id);
      if (!ligne) {
        // Publicité hors période : on la range sous son nom s'il est connu.
        const nom = vu.noms?.[id] ?? '';
        const cle = nom ? `nom:${nomDePub(nom) || id}` : pub;
        ligne = parCle.get(cle) ?? ligneVide(cle, nom || `Publicité ${id}`);
        parCle.set(cle, ligne);
        parId.set(id, ligne);
        if (!ligne.ids.includes(id)) ligne.ids.push(id);
      }
    } else {
      ligne = parCle.get(pub) ?? ligneVide(pub, pub.replace(/^nom:/, ''));
      parCle.set(pub, ligne);
    }
    return ligne.tunnel;
  };

  for (const [pub, nombre] of Object.entries(vu.inscrites ?? {})) resultats(pub).inscrites += Number(nombre) || 0;
  for (const rdv of vu.rdv ?? []) {
    const cible = resultats(rdv.pub);
    if (rdv.annule) cible.rdvAnnules += 1;
    else cible.rdv += 1;
  }
  for (const vente of vu.ventes ?? []) {
    const cible = resultats(vente.pub);
    cible.ventes += 1;
    cible.commande = Math.round((cible.commande + vente.montant) * 100) / 100;
    cible.encaisse = Math.round((cible.encaisse + vente.encaisse) * 100) / 100;
  }
  return { lignes: [...parCle.values()], sansPub };
}

/**
 * Les résultats d'une création, selon la source choisie.
 * @param {LignePub} ligne
 * @param {SourcePub} source
 * @returns {{ inscrites: number, rdv: number, ventes: number, commande: number }}
 */
export function resultats(ligne, source) {
  return source === 'meta'
    ? { inscrites: ligne.meta.prospects, rdv: ligne.meta.rdv, ventes: ligne.meta.achats, commande: ligne.meta.valeur }
    : { inscrites: ligne.tunnel.inscrites, rdv: ligne.tunnel.rdv, ventes: ligne.tunnel.ventes, commande: ligne.tunnel.commande };
}

/** @param {number} a @param {number} b */
const rapport = (a, b) => (b > 0 ? a / b : null);

/**
 * Les indicateurs d'une création (ou d'un total).
 * @param {{ depense: number, impressions: number, clics: number, vues3s: number, vuesCompletes: number }} ligne
 * @param {{ inscrites: number, rdv: number, ventes: number, commande: number }} r
 */
export function indicateursPub(ligne, r) {
  return {
    cpm: rapport(ligne.depense * 1000, ligne.impressions),
    ctr: rapport(ligne.clics, ligne.impressions),
    cpc: rapport(ligne.depense, ligne.clics),
    /** Accroche : lectures de 3 secondes pour 100 impressions. */
    accroche: ligne.vues3s > 0 ? rapport(ligne.vues3s, ligne.impressions) : null,
    /** Rétention : lectures complètes pour 100 lectures de 3 secondes. */
    retention: ligne.vuesCompletes > 0 ? rapport(ligne.vuesCompletes, ligne.vues3s) : null,
    tauxInscription: rapport(r.inscrites, ligne.clics),
    coutInscrite: rapport(ligne.depense, r.inscrites),
    tauxRdv: rapport(r.rdv, r.inscrites),
    coutRdv: rapport(ligne.depense, r.rdv),
    coutVente: rapport(ligne.depense, r.ventes),
    roas: rapport(r.commande, ligne.depense),
  };
}

/**
 * Le total d'une liste de créations.
 * @param {LignePub[]} lignes
 * @param {SourcePub} source
 */
export function totaliserPubs(lignes, source) {
  const total = { depense: 0, impressions: 0, clics: 0, vues3s: 0, vuesCompletes: 0, inscrites: 0, rdv: 0, ventes: 0, commande: 0 };
  for (const ligne of lignes) {
    const r = resultats(ligne, source);
    total.depense += ligne.depense;
    total.impressions += ligne.impressions;
    total.clics += ligne.clics;
    total.vues3s += ligne.vues3s;
    total.vuesCompletes += ligne.vuesCompletes;
    total.inscrites += r.inscrites;
    total.rdv += r.rdv;
    total.ventes += r.ventes;
    total.commande += r.commande;
  }
  total.depense = Math.round(total.depense * 100) / 100;
  total.commande = Math.round(total.commande * 100) / 100;
  return total;
}

/** Le tunnel a-t-il vu quelque chose sur la période ? Sinon, seuls les chiffres de Meta parlent. */
export function tunnelParle(/** @type {LignePub[]} */ lignes, /** @type {ResultatsTunnel} */ sansPub) {
  return lignes.some((ligne) => ligne.tunnel.inscrites + ligne.tunnel.rdv + ligne.tunnel.ventes > 0) || sansPub.inscrites + sansPub.rdv + sansPub.ventes > 0;
}

/**
 * Juge chaque création par rapport à la moyenne de la période.
 * Le niveau de jugement est le plus profond qui porte assez de résultats : les
 * ventes (3 au moins sur la période), sinon les rendez-vous (5 au moins), sinon
 * les inscrites. Une création n'est « gagnante » que si elle fait au moins 20 %
 * mieux que la moyenne, avec assez de résultats ; « à couper » si elle a dépensé
 * deux fois le coût moyen d'un résultat sans en obtenir, ou si elle coûte 50 % de
 * plus que la moyenne. Une création bonne en amont mais pas encore confirmée au
 * niveau jugé est « prometteuse ».
 * @param {LignePub[]} lignes
 * @param {SourcePub} source
 * @returns {{ niveau: 'ventes' | 'rdv' | 'inscrites', reperes: { coutInscrite: number | null, coutRdv: number | null, coutVente: number | null, roas: number | null }, verdicts: Record<string, { verdict: Verdict, base: 'ventes' | 'rdv' | 'inscrites' | '' }> }}
 */
export function classerPubs(lignes, source) {
  const total = totaliserPubs(lignes, source);
  /** @type {'ventes' | 'rdv' | 'inscrites'} */
  const niveau = total.ventes >= 3 ? 'ventes' : total.rdv >= 5 ? 'rdv' : 'inscrites';
  const reperes = {
    coutInscrite: rapport(total.depense, total.inscrites),
    coutRdv: rapport(total.depense, total.rdv),
    coutVente: rapport(total.depense, total.ventes),
    roas: rapport(total.commande, total.depense),
  };

  /** @type {Record<string, { verdict: Verdict, base: 'ventes' | 'rdv' | 'inscrites' | '' }>} */
  const verdicts = {};
  for (const ligne of lignes) {
    if (ligne.depense <= 0) {
      verdicts[ligne.cle] = { verdict: '', base: '' };
      continue;
    }
    const r = resultats(ligne, source);

    /** @returns {Verdict} */
    const surInscrites = () => {
      const moyen = reperes.coutInscrite;
      if (moyen == null) return 'trop-tot';
      if (r.inscrites === 0) return ligne.depense >= 2 * moyen ? 'a-couper' : 'trop-tot';
      const cout = ligne.depense / r.inscrites;
      if (r.inscrites >= 5 && cout <= 0.8 * moyen) return 'gagnante';
      if (r.inscrites >= 3 && cout >= 1.5 * moyen) return 'a-couper';
      return r.inscrites < 3 && ligne.depense < 1.5 * moyen ? 'trop-tot' : 'moyenne';
    };
    /** @returns {Verdict | null} null : pas assez pour juger à ce niveau */
    const surRdv = () => {
      const moyen = reperes.coutRdv;
      if (moyen == null) return null;
      if (r.rdv === 0) return ligne.depense >= 2 * moyen ? 'a-couper' : null;
      const cout = ligne.depense / r.rdv;
      if (r.rdv >= 2 && cout <= 0.8 * moyen) return 'gagnante';
      if (r.rdv >= 2 && cout >= 1.5 * moyen) return 'a-couper';
      if (r.rdv === 1 && cout <= 0.8 * moyen) return 'prometteuse';
      return 'moyenne';
    };
    /** @returns {Verdict | null} */
    const surVentes = () => {
      if (r.ventes === 0) return reperes.coutVente != null && ligne.depense >= 2 * reperes.coutVente ? 'a-couper' : null;
      const roas = r.commande / ligne.depense;
      if (roas >= 1 && (reperes.roas == null || roas >= reperes.roas)) return 'gagnante';
      return roas >= 1 ? 'moyenne' : 'a-couper';
    };
    /** Bonne en amont, pas encore confirmée plus bas. @param {Verdict} v @returns {Verdict} */
    const enAmont = (v) => (v === 'gagnante' ? 'prometteuse' : v);

    /** @type {Verdict | null} */
    let verdict = null;
    /** @type {'ventes' | 'rdv' | 'inscrites'} */
    let base = niveau;
    if (niveau === 'ventes') verdict = surVentes();
    if (verdict == null && niveau !== 'inscrites') {
      base = 'rdv';
      const v = surRdv();
      verdict = v == null ? null : niveau === 'ventes' ? enAmont(v) : v;
    }
    if (verdict == null) {
      base = 'inscrites';
      const v = surInscrites();
      verdict = niveau === 'inscrites' ? v : enAmont(v);
    }
    verdicts[ligne.cle] = { verdict, base };
  }
  return { niveau, reperes, verdicts };
}

const ORDRE = ['gagnante', 'prometteuse', 'moyenne', 'trop-tot', 'a-couper', ''];

/**
 * Trie les créations : les gagnantes d'abord, puis par dépense.
 * @param {LignePub[]} lignes
 * @param {Record<string, { verdict: Verdict }>} verdicts
 * @returns {LignePub[]}
 */
export function trierPubs(lignes, verdicts) {
  return [...lignes].sort((a, b) => {
    const rangA = ORDRE.indexOf(verdicts[a.cle]?.verdict ?? '');
    const rangB = ORDRE.indexOf(verdicts[b.cle]?.verdict ?? '');
    return rangA !== rangB ? rangA - rangB : b.depense - a.depense;
  });
}

/**
 * Regroupe des journées par jour de la semaine (lundi en premier).
 * @param {{ date: string, [chiffre: string]: number | string | null }[]} jours
 * @param {string[]} chiffres
 * @returns {Record<string, number>[]} sept lignes : { jour: 0…6, jours: nombre de journées, …chiffres }
 */
export function parJourDeSemaine(jours, chiffres) {
  const lignes = Array.from({ length: 7 }, (_, jour) => /** @type {Record<string, number>} */ ({ jour, jours: 0, ...Object.fromEntries(chiffres.map((c) => [c, 0])) }));
  for (const journee of jours) {
    const rang = (new Date(`${journee.date}T12:00:00Z`).getUTCDay() + 6) % 7;
    const ligne = lignes[rang];
    if (!ligne || Number.isNaN(rang)) continue;
    ligne.jours = (ligne.jours ?? 0) + 1;
    for (const chiffre of chiffres) ligne[chiffre] = (ligne[chiffre] ?? 0) + (Number(journee[chiffre]) || 0);
  }
  return lignes;
}
