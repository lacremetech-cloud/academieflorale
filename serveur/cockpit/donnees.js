// @ts-check
/**
 * Cockpit : assemble, pour un mois, les chiffres de chaque journée à partir des
 * sources (Meta Ads, compteurs du tunnel, Wistia, iClosed), et dit pour chaque
 * source si elle est branchée. Une source absente ou en panne n'empêche jamais
 * les autres de s'afficher.
 */
import { BRUTS, joursDuMois, jourParis, jourVide, moisCourant, moisValide } from '../../partage/cockpit.js';
import { ecrireNote, lireCompteurs, NOTE_MAX } from '../../partage/compteurs.js';
import { repondre } from '../reponse.js';
import { memeOrigine } from '../requete.js';
import { verifierAcces } from './acces.js';
import { lireIclosed } from './iclosed.js';
import { lireMeta } from './meta.js';
import { lireWistia } from './wistia.js';

/** Ce que chaque source apporte, et ce qu'il faut pour la brancher. */
export const SOURCES = Object.freeze({
  meta: {
    nom: 'Meta Ads',
    chiffres: ['depense', 'impressions', 'clics'],
    variables: ['META_ACCESS_TOKEN', 'META_AD_ACCOUNT_ID'],
  },
  compteurs: {
    nom: 'Compteurs du tunnel',
    chiffres: ['vues', 'inscrits'],
    variables: ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
  },
  wistia: {
    nom: 'Wistia',
    chiffres: ['chargements', 'lectures', 'heures'],
    variables: ['WISTIA_API_TOKEN'],
  },
  iclosed: {
    nom: 'iClosed',
    chiffres: ['appels', 'annules', 'absentes', 'ventes', 'contracte'],
    variables: ['ICLOSED_API_KEY'],
  },
});

/**
 * @param {object} options
 * @param {string} options.mois
 * @param {Record<string, string | undefined>} options.env
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Date} [options.maintenant]
 */
export async function assemblerMois({ mois, env, fetchImpl = fetch, maintenant = new Date() }) {
  const [meta, compteurs, wistia, iclosed] = await Promise.all([
    lireMeta({ env, mois, fetchImpl }),
    lireCompteurs(env, mois, { fetchImpl }),
    lireWistia({ env, mois, fetchImpl }),
    lireIclosed({ env, mois, fetchImpl }),
  ]);
  const lues = { meta, compteurs, wistia, iclosed };
  const aujourdHui = jourParis(maintenant);

  const jours = joursDuMois(mois).map((date) => {
    /** @type {Record<string, number | null | string>} */
    const jour = { date, ...jourVide() };
    for (const [cle, source] of Object.entries(SOURCES)) {
      const lue = lues[/** @type {keyof typeof lues} */ (cle)];
      // Une source branchée vaut zéro les jours sans activité ; les jours à venir restent vides.
      if (lue.etat !== 'ok' || date > aujourdHui) continue;
      for (const chiffre of source.chiffres) jour[chiffre] = lue.jours[date]?.[chiffre] ?? 0;
    }
    return jour;
  });

  return {
    mois,
    aujourdHui,
    demonstration: false,
    jours,
    notes: compteurs.notes,
    variantes: compteurs.variantes,
    campagnes: (env.META_CAMPAGNES ?? '').trim(),
    sources: Object.fromEntries(
      Object.entries(SOURCES).map(([cle, source]) => {
        const lue = lues[/** @type {keyof typeof lues} */ (cle)];
        return [cle, { nom: source.nom, etat: lue.etat, detail: lue.detail ?? '', variables: source.variables }];
      }),
    ),
  };
}

/**
 * Nombre pseudo-aléatoire stable, entre 0 et 1, pour une date et un rang donnés.
 * @param {string} date
 * @param {number} rang
 */
function alea(date, rang) {
  let h = 2166136261 ^ rang;
  for (const lettre of date) h = Math.imul(h ^ lettre.charCodeAt(0), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Données de démonstration, pour mettre au point l'affichage en local : des
 * chiffres inventés mais plausibles, toujours signalés comme tels à l'écran.
 * Jamais servies sur Vercel.
 * @param {string} mois
 * @param {Date} [maintenant]
 */
export function donneesDeDemonstration(mois, maintenant = new Date()) {
  const aujourdHui = jourParis(maintenant);
  const jours = joursDuMois(mois).map((date) => {
    /** @type {Record<string, number | null | string>} */
    const jour = { date, ...jourVide() };
    if (date > aujourdHui) return jour;
    const depense = Math.round(130 + alea(date, 1) * 120);
    const impressions = Math.round(depense * (95 + alea(date, 2) * 70));
    const clics = Math.round(impressions * (0.011 + alea(date, 3) * 0.008));
    const vues = Math.round(clics * (0.82 + alea(date, 4) * 0.1));
    const inscrits = Math.round(clics * (0.06 + alea(date, 5) * 0.08));
    const chargements = Math.round(inscrits * (0.9 + alea(date, 6) * 0.25));
    const lectures = Math.round(chargements * (0.62 + alea(date, 7) * 0.2));
    const appels = Math.round(inscrits * (0.05 + alea(date, 8) * 0.18));
    const annules = alea(date, 9) > 0.8 ? Math.min(appels, 1 + Math.round(alea(date, 10))) : 0;
    const absentes = alea(date, 11) > 0.75 ? Math.min(Math.max(0, appels - annules), 1) : 0;
    const ventes = alea(date, 12) > 0.86 && appels - annules > 0 ? 1 : 0;
    const contracte = ventes * [3000, 3800, 3800, 4500][Math.floor(alea(date, 13) * 4)];
    Object.assign(jour, {
      depense,
      impressions,
      clics,
      vues,
      inscrits,
      chargements,
      lectures,
      heures: Math.round(lectures * (0.07 + alea(date, 14) * 0.05) * 100) / 100,
      appels,
      annules,
      absentes,
      ventes,
      contracte,
      encaisse: ventes ? [750, 1000, 3000, 3800][Math.floor(alea(date, 15) * 4)] : 0,
    });
    if (typeof jour.encaisse === 'number' && typeof jour.contracte === 'number') jour.encaisse = Math.min(jour.encaisse, jour.contracte);
    return jour;
  });
  const total = (/** @type {string} */ cle) => jours.reduce((somme, jour) => somme + (Number(jour[cle]) || 0), 0);
  const parts = [0.36, 0.33, 0.31];
  return {
    mois,
    aujourdHui,
    demonstration: true,
    jours,
    notes: Object.fromEntries(
      [
        [3, 'pubs coupées le matin'],
        [10, 'nouvelles créas'],
        [11, 'scaling cbo'],
        [19, 'nouvelles pubs'],
      ]
        .map(([rang, note]) => [`${mois}-${String(rang).padStart(2, '0')}`, String(note)])
        .filter(([date]) => String(date) <= aujourdHui),
    ),
    variantes: ['90-jours', '90-jours-plan', '90-jours-rythme'].map((nom, rang) => ({
      nom,
      vues: Math.round(total('vues') * (parts[rang] ?? 0)),
      inscrits: Math.round(total('inscrits') * ((parts[rang] ?? 0) + (rang === 1 ? 0.03 : -0.015))),
    })),
    campagnes: 'VSL',
    sources: Object.fromEntries(
      Object.entries(SOURCES).map(([cle, source]) => [cle, { nom: source.nom, etat: 'ok', detail: '', variables: source.variables }]),
    ),
  };
}

/**
 * GET /api/cockpit/donnees?mois=2026-11 : les chiffres du mois, pour une session ouverte.
 * @param {Request} request
 * @param {object} [contexte]
 * @param {Record<string, string | undefined>} [contexte.env]
 * @param {typeof fetch} [contexte.fetchImpl]
 * @param {Date} [contexte.maintenant]
 * @returns {Promise<Response>}
 */
export async function traiterDonnees(request, contexte = {}) {
  const { env = {}, fetchImpl = fetch, maintenant = new Date() } = contexte;
  if (request.method !== 'GET') return repondre(405, { ok: false, erreur: 'methode' }, { Allow: 'GET' });
  const acces = verifierAcces(request, env);
  if (!acces.ok) return acces.reponse;

  const demande = new URL(request.url).searchParams.get('mois');
  const mois = moisValide(demande) ? String(demande) : moisCourant(maintenant);
  // En local seulement : COCKPIT_DEMO=1 sert des chiffres de démonstration.
  const donnees =
    env.COCKPIT_DEMO === '1' && !env.VERCEL
      ? donneesDeDemonstration(mois, maintenant)
      : await assemblerMois({ mois, env, fetchImpl, maintenant });
  return repondre(200, { ok: true, chiffres: BRUTS, ...donnees }, { 'Cache-Control': 'private, no-store' });
}

/**
 * POST /api/cockpit/note : enregistre la note d'une journée ({ date, note }).
 * @param {Request} request
 * @param {object} [contexte]
 * @param {Record<string, string | undefined>} [contexte.env]
 * @param {typeof fetch} [contexte.fetchImpl]
 * @returns {Promise<Response>}
 */
export async function traiterNote(request, contexte = {}) {
  const { env = {}, fetchImpl = fetch } = contexte;
  if (request.method !== 'POST') return repondre(405, { ok: false, erreur: 'methode' }, { Allow: 'POST' });
  if (!memeOrigine(request)) return repondre(403, { ok: false, erreur: 'origine' });
  const acces = verifierAcces(request, env);
  if (!acces.ok) return acces.reponse;

  let donnees;
  try {
    const texte = await request.text();
    donnees = texte.length <= 2048 ? JSON.parse(texte) : null;
  } catch {
    donnees = null;
  }
  const date = typeof donnees?.date === 'string' ? donnees.date : '';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !moisValide(date.slice(0, 7)) || !joursDuMois(date.slice(0, 7)).includes(date)) {
    return repondre(400, { ok: false, erreur: 'date' });
  }
  const note = (typeof donnees?.note === 'string' ? donnees.note : '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, NOTE_MAX);

  const resultat = await ecrireNote(env, date, note, { fetchImpl });
  if (resultat === 'a-brancher') return repondre(503, { ok: false, erreur: 'a-brancher' });
  if (resultat !== 'ok') return repondre(502, { ok: false, erreur: 'indisponible' });
  return repondre(200, { ok: true, date, note });
}
