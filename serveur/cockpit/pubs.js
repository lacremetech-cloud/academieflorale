// @ts-check
/**
 * Cockpit, rapport des publicités : pour une période, chaque création
 * publicitaire avec sa dépense (Meta), puis ce qu'elle a amené : inscrites,
 * rendez-vous, ventes. Deux lectures côte à côte :
 * - ce que Meta attribue à la publicité (pixel et API de conversion) ;
 * - ce que le tunnel a vu lui-même (publicité d'arrivée retenue à l'inscription,
 *   rendez-vous d'iClosed et ventes du cockpit, rattachés par l'email).
 * S'y ajoutent les moments : par jour, par heure, et le délai entre
 * l'inscription, le rendez-vous et la vente.
 *
 * Aucune donnée personnelle ne sort d'ici : les emails servent seulement à
 * rattacher un rendez-vous ou une vente à sa publicité, sur le serveur.
 */
import { clePub, joursEntre, PARAMETRES_PUB, SANS_PUB, trancheDelai, TRANCHES_DELAI } from '../../partage/attribution.js';
import { joursEcoules, jourParis, moisCourant, moisDecale, moisValide } from '../../partage/cockpit.js';
import { rattacherTunnel, regrouperPubs } from '../../partage/pubs.js';
import { encaisseAu } from '../../partage/ventes.js';
import { nettoyerEmail } from '../../partage/validation.js';
import { empreinteEmail } from '../empreinte.js';
import { estAnnule, jourDe, utmDe } from '../iclosed.js';
import { versionMeta } from '../meta-conversions.js';
import { repondre } from '../reponse.js';
import { lireInscriptions, lireInscritesParPub, lireMoments } from '../suivi.js';
import { verifierAcces } from './acces.js';
import { lireAppelsReserves } from './iclosed.js';
import { filtreCampagnes } from './meta.js';
import { lireRegistre } from './registre.js';

/** Périodes proposées, en nombre de mois (le mois affiché compris). */
export const PERIODES = Object.freeze({ mois: 1, '3m': 3, '12m': 12 });

const CHAMPS_INSIGHTS = 'spend,impressions,inline_link_clicks,actions,action_values,video_thruplay_watched_actions';
/** Types d'action de Meta, par ordre de préférence (le premier trouvé est retenu). */
const ACTIONS = {
  prospects: ['lead', 'offsite_conversion.fb_pixel_lead', 'onsite_web_lead'],
  rdv: ['schedule_total', 'schedule_website', 'offsite_conversion.fb_pixel_schedule', 'schedule'],
  achats: ['purchase', 'omni_purchase', 'offsite_conversion.fb_pixel_purchase', 'onsite_web_purchase'],
  vues3s: ['video_view'],
};
/** Nombre de créations dont le texte est demandé à Meta. */
const FICHES_MAX = 40;
/**
 * Publicité par publicité, Meta ne rend par défaut que celles qui existent encore :
 * une publicité archivée ou supprimée disparaît du détail, alors que sa dépense reste
 * dans le total du compte. On demande donc tous les états, pour que le détail et le
 * total disent la même chose.
 */
const TOUS_LES_ETATS = [
  'ACTIVE',
  'PAUSED',
  'CAMPAIGN_PAUSED',
  'ADSET_PAUSED',
  'ARCHIVED',
  'DELETED',
  'IN_PROCESS',
  'WITH_ISSUES',
  'DISAPPROVED',
  'PENDING_REVIEW',
  'PREAPPROVED',
  'PENDING_BILLING_INFO',
];

/**
 * La valeur d'une action dans la liste rendue par Meta.
 * @param {unknown} actions
 * @param {string[]} types
 */
function action(actions, types) {
  if (!Array.isArray(actions)) return 0;
  for (const type of types) {
    const trouvee = actions.find((a) => a?.action_type === type);
    if (trouvee) return Number(trouvee.value) || 0;
  }
  return 0;
}

/** @param {unknown} texte @param {number} longueur */
const court = (texte, longueur) => (typeof texte === 'string' ? texte.replace(/[\u0000-\u0008\u000b-\u001f\u007f]/g, ' ').trim().slice(0, longueur) : '');

/**
 * Les jours de la période qui ne sont pas à venir.
 * @param {string} mois dernier mois de la période
 * @param {keyof typeof PERIODES} periode
 * @param {Date} maintenant
 */
export function joursDePeriode(mois, periode, maintenant) {
  const nombre = PERIODES[periode] ?? 1;
  const jours = [];
  for (let rang = nombre - 1; rang >= 0; rang -= 1) jours.push(...joursEcoules(moisDecale(mois, -rang), maintenant));
  return jours;
}

/**
 * Une lecture des statistiques publicitaires de Meta, toutes pages réunies.
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {Record<string, string>} options.parametres
 * @param {typeof fetch} options.fetchImpl
 * @param {boolean} [options.tousLesEtats] publicités archivées et supprimées comprises
 * @returns {Promise<{ etat: 'ok' | 'a-brancher' | 'erreur', detail?: string, lignes: any[] }>}
 */
async function statistiques({ env, parametres, fetchImpl, tousLesEtats = false }) {
  const jeton = (env.META_ACCESS_TOKEN ?? '').trim();
  const compte = (env.META_AD_ACCOUNT_ID ?? '').trim().replace(/^act_/, '');
  if (!jeton || !compte) return { etat: 'a-brancher', lignes: [] };
  if (!/^\d{5,20}$/.test(compte)) return { etat: 'erreur', detail: 'identifiant du compte publicitaire invalide', lignes: [] };
  const demande = new URLSearchParams({ limit: '500', ...parametres });
  const filtre = filtreCampagnes(env);
  /** @type {{ field: string, operator: string, value: string | string[] }[]} */
  const filtres = filtre ? [{ field: 'campaign.name', operator: 'CONTAIN', value: filtre }] : [];
  if (tousLesEtats) filtres.push({ field: 'ad.effective_status', operator: 'IN', value: TOUS_LES_ETATS });
  if (filtres.length > 0) demande.set('filtering', JSON.stringify(filtres));
  const lignes = [];
  try {
    for (let page = 0; page < 12; page += 1) {
      const reponse = await fetchImpl(`https://graph.facebook.com/${versionMeta(env)}/act_${compte}/insights?${demande}`, {
        // Le jeton part dans un en-tête, jamais dans l'adresse.
        headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(12000),
      });
      const corps = await reponse.json().catch(() => null);
      if (!reponse.ok) {
        return { etat: 'erreur', detail: `Meta a répondu ${reponse.status} : ${String(corps?.error?.message ?? 'erreur').slice(0, 160)}`, lignes: [] };
      }
      lignes.push(...(Array.isArray(corps?.data) ? corps.data : []));
      const suite = corps?.paging?.next ? corps?.paging?.cursors?.after : null;
      if (!suite) break;
      demande.set('after', String(suite));
    }
  } catch (erreur) {
    const nom = erreur instanceof Error ? erreur.name : '';
    return { etat: 'erreur', detail: nom === 'TimeoutError' ? 'Meta ne répond pas (délai dépassé)' : 'Meta est injoignable', lignes: [] };
  }
  return { etat: 'ok', lignes };
}

/**
 * Le nom, l'état et le texte de quelques publicités.
 * @param {object} options
 * @param {Record<string, string | undefined>} options.env
 * @param {string[]} options.ids
 * @param {typeof fetch} options.fetchImpl
 * @returns {Promise<Record<string, import('../../partage/pubs.js').FichePub>>}
 */
async function fichesDesPubs({ env, ids, fetchImpl }) {
  const jeton = (env.META_ACCESS_TOKEN ?? '').trim();
  /** @type {Record<string, import('../../partage/pubs.js').FichePub>} */
  const fiches = {};
  if (!jeton || ids.length === 0) return fiches;
  const champs = 'name,effective_status,created_time,creative{title,body,thumbnail_url,object_story_spec,asset_feed_spec}';
  /** @param {string[]} groupe @returns {Promise<Record<string, unknown> | null>} */
  const demander = async (groupe) => {
    const reponse = await fetchImpl(`https://graph.facebook.com/${versionMeta(env)}/?${new URLSearchParams({ ids: groupe.join(','), fields: champs })}`, {
      headers: { Authorization: `Bearer ${jeton}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(12000),
    });
    const corps = await reponse.json().catch(() => null);
    return reponse.ok && corps && typeof corps === 'object' ? corps : null;
  };
  try {
    const voulus = ids.slice(0, 50);
    let corps = await demander(voulus);
    if (!corps && voulus.length > 1) {
      // Une seule publicité illisible (supprimée depuis longtemps) fait échouer toute la demande : on les prend une par une.
      const une = await Promise.all(voulus.map((id) => demander([id]).catch(() => null)));
      corps = Object.assign({}, ...une.filter(Boolean));
    }
    if (!corps) return fiches;
    for (const [id, pub] of Object.entries(corps)) {
      if (!/^\d{6,25}$/.test(id) || !pub || typeof pub !== 'object') continue;
      const creation = /** @type {any} */ (pub).creative ?? {};
      const recit = creation.object_story_spec ?? {};
      const flux = creation.asset_feed_spec ?? {};
      const vignette = typeof creation.thumbnail_url === 'string' && creation.thumbnail_url.startsWith('https://') ? creation.thumbnail_url.slice(0, 1000) : '';
      fiches[id] = {
        nom: court(/** @type {any} */ (pub).name, 200),
        statut: court(/** @type {any} */ (pub).effective_status, 40),
        creeLe: court(/** @type {any} */ (pub).created_time, 10),
        titre: court(creation.title || recit.video_data?.title || recit.link_data?.name || flux.titles?.[0]?.text, 300),
        texte: court(creation.body || recit.video_data?.message || recit.link_data?.message || flux.bodies?.[0]?.text, 3000),
        vignette,
      };
    }
  } catch {
    /* sans les textes, le rapport garde ses chiffres */
  }
  return fiches;
}

/**
 * @param {object} options
 * @param {string} options.mois dernier mois de la période
 * @param {keyof typeof PERIODES} options.periode
 * @param {Record<string, string | undefined>} options.env
 * @param {typeof fetch} [options.fetchImpl]
 * @param {Date} [options.maintenant]
 */
export async function assemblerPubs({ mois, periode, env, fetchImpl = fetch, maintenant = new Date() }) {
  const jours = joursDePeriode(mois, periode, maintenant);
  const aujourdHui = jourParis(maintenant);
  const vide = {
    mois,
    periode,
    du: jours[0] ?? '',
    au: jours[jours.length - 1] ?? '',
    demonstration: false,
    campagnes: filtreCampagnes(env),
    parametres: PARAMETRES_PUB,
  };
  if (jours.length === 0) {
    return { ...vide, etats: { meta: 'ok', tunnel: 'ok', iclosed: 'ok' }, details: {}, pubs: [], sansPub: null, jours: [], heures: [], creneaux: {}, delais: { rdv: {}, vente: {}, tranches: TRANCHES_DELAI }, typesVus: [] };
  }
  const dansLaPeriode = new Set(jours);
  const plage = JSON.stringify({ since: jours[0], until: jours[jours.length - 1] });
  const moisDeLaPeriode = [...new Set(jours.map((jour) => jour.slice(0, 7)))];

  const [parPub, parJour, parHeure, inscrites, appels, registre, creneaux] = await Promise.all([
    statistiques({ env, fetchImpl, tousLesEtats: true, parametres: { level: 'ad', fields: `ad_id,ad_name,adset_name,campaign_name,${CHAMPS_INSIGHTS}`, time_range: plage } }),
    statistiques({ env, fetchImpl, parametres: { level: 'account', fields: 'spend,inline_link_clicks,actions', time_range: plage, time_increment: '1' } }),
    statistiques({
      env,
      fetchImpl,
      parametres: { level: 'account', fields: 'spend,inline_link_clicks,actions', time_range: plage, breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone' },
    }),
    lireInscritesParPub(env, jours, { fetchImpl }),
    lireAppelsReserves({ env, jours, fetchImpl }),
    lireRegistre(env, { fetchImpl }),
    lireMoments(env, moisDeLaPeriode, { fetchImpl }),
  ]);

  // 1. Les publicités selon Meta.
  /** @type {Set<string>} */
  const typesVus = new Set();
  /** @type {import('../../partage/pubs.js').PubMeta[]} */
  const pubsMeta = parPub.lignes
    .filter((ligne) => typeof ligne?.ad_id === 'string')
    .map((ligne) => {
      for (const a of Array.isArray(ligne.actions) ? ligne.actions : []) if (typeof a?.action_type === 'string') typesVus.add(a.action_type);
      return {
        id: String(ligne.ad_id),
        nom: court(ligne.ad_name, 200),
        campagne: court(ligne.campaign_name, 200),
        ensemble: court(ligne.adset_name, 200),
        depense: Number(ligne.spend) || 0,
        impressions: Number(ligne.impressions) || 0,
        clics: Number(ligne.inline_link_clicks) || 0,
        vues3s: action(ligne.actions, ACTIONS.vues3s),
        vuesCompletes: action(ligne.video_thruplay_watched_actions, ACTIONS.vues3s),
        prospects: action(ligne.actions, ACTIONS.prospects),
        rdv: action(ligne.actions, ACTIONS.rdv),
        achats: action(ligne.actions, ACTIONS.achats),
        valeurAchats: action(ligne.action_values, ACTIONS.achats),
      };
    });

  // 2. Ce que le tunnel a vu : rendez-vous et ventes, rattachés à la publicité d'arrivée par l'email.
  const ventesDePeriode = registre.ventes.filter((vente) => dansLaPeriode.has(vente.date));
  const emailsAppels = appels.appels.map((appel) => nettoyerEmail(appel?.inviteeEmail ?? appel?.contact?.email ?? ''));
  const emailsVentes = ventesDePeriode.map((vente) => nettoyerEmail(vente.email ?? ''));
  const inscriptions = await lireInscriptions(env, [...emailsAppels, ...emailsVentes].filter(Boolean), { fetchImpl });

  /** @type {Record<string, number>} */
  const delaisRdv = {};
  /** @type {Record<string, number>} */
  const delaisVente = {};
  /** @type {Record<string, { rdv: number, ventes: number, commande: number }>} */
  const tunnelParJour = {};
  /** @param {string} jour */
  const duJour = (jour) => (tunnelParJour[jour] ??= { rdv: 0, ventes: 0, commande: 0 });
  /** @type {Map<string, string>} la publicité du dernier rendez-vous de chaque email */
  const pubParEmail = new Map();

  const rdv = appels.appels.map((appel, rang) => {
    const empreinte = emailsAppels[rang] ? empreinteEmail(emailsAppels[rang]) : '';
    const inscription = inscriptions.get(empreinte)?.inscription ?? null;
    const pub = inscription?.pub || clePub(utmDe(appel));
    const annule = estAnnule(appel);
    if (empreinte && pub) pubParEmail.set(empreinte, pub);
    if (!annule) {
      duJour(jourDe(appel?.createdAt)).rdv += 1;
      const tranche = trancheDelai(inscription ? joursEntre(inscription.jour, jourDe(appel?.createdAt)) : null);
      if (tranche) delaisRdv[tranche] = (delaisRdv[tranche] ?? 0) + 1;
    }
    return { pub, annule };
  });

  const ventes = ventesDePeriode.map((vente, rang) => {
    const empreinte = emailsVentes[rang] ? empreinteEmail(emailsVentes[rang]) : '';
    const inscription = inscriptions.get(empreinte)?.inscription ?? null;
    const pub = inscription?.pub || vente.suivi?.pub || pubParEmail.get(empreinte) || '';
    const jour = duJour(vente.date);
    jour.ventes += 1;
    jour.commande = Math.round((jour.commande + vente.montant) * 100) / 100;
    const tranche = trancheDelai(inscription ? joursEntre(inscription.jour, vente.date) : (vente.suivi?.delai ?? null));
    if (tranche) delaisVente[tranche] = (delaisVente[tranche] ?? 0) + 1;
    return { pub, montant: vente.montant, encaisse: encaisseAu(vente, aujourdHui) };
  });

  // 3. Les textes des créations les plus dépensières, et le nom des publicités vues par le tunnel mais absentes de la période.
  const connues = new Set(pubsMeta.map((pub) => pub.id));
  const representantes = regrouperPubs(pubsMeta)
    .sort((a, b) => b.depense - a.depense)
    .slice(0, FICHES_MAX)
    .map((ligne) => ligne.ids[0] ?? '');
  const horsPeriode = [...new Set([...Object.keys(inscrites.parPub), ...rdv.map((r) => r.pub), ...ventes.map((v) => v.pub)])]
    .filter((pub) => pub.startsWith('id:') && !connues.has(pub.slice(3)))
    .map((pub) => pub.slice(3))
    .slice(0, 10);
  const fiches = await fichesDesPubs({ env, ids: [...representantes, ...horsPeriode].filter(Boolean), fetchImpl });

  const { lignes, sansPub } = rattacherTunnel(regrouperPubs(pubsMeta, fiches), {
    inscrites: inscrites.parPub,
    rdv,
    ventes,
    noms: Object.fromEntries(horsPeriode.map((id) => [id, fiches[id]?.nom ?? ''])),
  });

  // 4. Les moments : jour par jour, puis heure par heure.
  /** @type {Record<string, { depense: number, clics: number, prospects: number }>} */
  const metaParJour = {};
  for (const ligne of parJour.lignes) {
    if (typeof ligne?.date_start !== 'string') continue;
    metaParJour[ligne.date_start] = { depense: Number(ligne.spend) || 0, clics: Number(ligne.inline_link_clicks) || 0, prospects: action(ligne.actions, ACTIONS.prospects) };
  }
  const heures = Array.from({ length: 24 }, (_, heure) => ({ heure, depense: 0, clics: 0, prospects: 0, inscrites: 0 }));
  for (const ligne of parHeure.lignes) {
    const heure = heures[Number(String(ligne?.hourly_stats_aggregated_by_advertiser_time_zone ?? '').slice(0, 2))];
    if (!heure) continue;
    heure.depense = Math.round((heure.depense + (Number(ligne.spend) || 0)) * 100) / 100;
    heure.clics += Number(ligne.inline_link_clicks) || 0;
    heure.prospects += action(ligne.actions, ACTIONS.prospects);
  }
  for (const [creneau, nombre] of Object.entries(creneaux)) {
    const heure = heures[Number(creneau.split(':')[1])];
    if (heure) heure.inscrites += nombre;
  }

  return {
    ...vide,
    etats: { meta: parPub.etat, tunnel: inscrites.etat, iclosed: appels.etat },
    details: { meta: parPub.detail ?? '', iclosed: appels.detail ?? '' },
    pubs: lignes,
    sansPub,
    jours: jours.map((date) => ({
      date,
      depense: metaParJour[date]?.depense ?? 0,
      clics: metaParJour[date]?.clics ?? 0,
      prospects: metaParJour[date]?.prospects ?? 0,
      inscrites: inscrites.parJour[date] ?? 0,
      rdv: tunnelParJour[date]?.rdv ?? 0,
      ventes: tunnelParJour[date]?.ventes ?? 0,
      commande: tunnelParJour[date]?.commande ?? 0,
    })),
    heures,
    creneaux,
    delais: { rdv: delaisRdv, vente: delaisVente, tranches: TRANCHES_DELAI },
    typesVus: [...typesVus].sort(),
    // Pour le diagnostic : combien de lignes Meta a rendues à chaque lecture, et les champs de la première publicité.
    lectures: { parPub: parPub.lignes.length, parJour: parJour.lignes.length, parHeure: parHeure.lignes.length, champs: Object.keys(parPub.lignes[0] ?? {}) },
  };
}

/**
 * Nombre pseudo-aléatoire stable, entre 0 et 1.
 * @param {string} texte
 * @param {number} rang
 */
function alea(texte, rang) {
  let h = 2166136261 ^ rang;
  for (const lettre of texte) h = Math.imul(h ^ lettre.charCodeAt(0), 16777619);
  h ^= h >>> 15;
  h = Math.imul(h, 2246822507);
  h ^= h >>> 13;
  return ((h >>> 0) % 10000) / 10000;
}

/**
 * Rapport de démonstration, pour mettre au point l'affichage en local : des
 * créations et des chiffres inventés, toujours signalés comme tels. Jamais servi sur Vercel.
 * @param {string} mois
 * @param {keyof typeof PERIODES} periode
 * @param {Date} [maintenant]
 */
export function pubsDeDemonstration(mois, periode, maintenant = new Date()) {
  const jours = joursDePeriode(mois, periode, maintenant);
  const creations = [
    ['VSL-P01-H1 · reconversion', 'Et si tu vivais des fleurs, depuis chez toi ?', 'Tu rêves de travailler avec les fleurs, mais tu ne te vois pas ouvrir une boutique.'],
    ['VSL-P01-H2 · sans CAP', 'Fleuriste indépendante, sans CAP', 'Pas besoin de CAP ni de boutique pour vivre de l’art floral.'],
    ['VSL-P02-H1 · mariages', 'Les mariages, ton premier revenu', 'Un mariage, c’est déjà un vrai chiffre d’affaires pour une fleuriste indépendante.'],
    ['VSL-P03-H1 · 90 jours', '90 jours pour te lancer', 'En 90 jours, tu peux poser les bases de ton activité de fleuriste indépendante.'],
    ['VSL-P04-H1 · témoignage', 'Elle a quitté la banque pour les fleurs', 'Après quinze ans dans la banque, elle vit de ses compositions.'],
    ['VSL-P05-H1 · hôtels', 'Des clients chaque semaine', 'Hôtels, restaurants, commerces : ils ont besoin de fleurs toutes les semaines.'],
  ];
  const parts = [0.3, 0.22, 0.18, 0.14, 0.1, 0.06];
  const poids = jours.length / 30;
  /** @type {import('../../partage/pubs.js').PubMeta[]} */
  const pubsMeta = creations.map(([nom], rang) => {
    const depense = Math.round(4200 * (parts[rang] ?? 0.05) * poids * (0.8 + alea(mois, rang) * 0.4));
    const impressions = Math.round(depense * (90 + alea(mois, rang + 10) * 60));
    const clics = Math.round(impressions * (0.009 + alea(mois, rang + 20) * 0.01));
    const prospects = Math.round(clics * (0.05 + alea(mois, rang + 30) * 0.09));
    return {
      id: `1202000000000${rang}`,
      nom: String(nom),
      campagne: rang < 4 ? 'VSL · CBO · Reconversion' : 'VSL · ABO · Test créas',
      ensemble: rang % 2 === 0 ? 'Large F35+' : 'Intérêts fleurs',
      depense,
      impressions,
      clics,
      vues3s: Math.round(impressions * (0.18 + alea(mois, rang + 40) * 0.2)),
      vuesCompletes: Math.round(impressions * (0.03 + alea(mois, rang + 50) * 0.05)),
      prospects,
      rdv: Math.round(prospects * (0.04 + alea(mois, rang + 60) * 0.1)),
      achats: rang < 2 ? Math.round(1 * poids) : 0,
      valeurAchats: rang < 2 ? Math.round(3000 * poids) : 0,
    };
  });
  /** @type {Record<string, import('../../partage/pubs.js').FichePub>} */
  const fiches = Object.fromEntries(
    creations.map(([nom, titre, texte], rang) => [
      `1202000000000${rang}`,
      { nom: String(nom), statut: rang === 5 ? 'PAUSED' : 'ACTIVE', creeLe: `${mois}-0${rang + 1}`, titre: String(titre), texte: String(texte), vignette: '' },
    ]),
  );
  const rdv = [];
  const ventes = [];
  /** @type {Record<string, number>} */
  const inscritesParPub = { [SANS_PUB]: Math.round(6 * poids) };
  pubsMeta.forEach((pub, rang) => {
    inscritesParPub[`id:${pub.id}`] = Math.round(pub.prospects * (0.85 + alea(mois, rang + 70) * 0.2));
    for (let n = 0; n < Math.round(pub.rdv * 0.9); n += 1) rdv.push({ pub: `id:${pub.id}`, annule: n % 6 === 5 });
    if (rang === 0) ventes.push({ pub: `id:${pub.id}`, montant: 3000, encaisse: 1000 }, { pub: `id:${pub.id}`, montant: 2400, encaisse: 2400 });
    if (rang === 2) ventes.push({ pub: `id:${pub.id}`, montant: 3000, encaisse: 700 });
  });
  const { lignes, sansPub } = rattacherTunnel(regrouperPubs(pubsMeta, fiches), { inscrites: inscritesParPub, rdv, ventes });
  const heures = Array.from({ length: 24 }, (_, heure) => {
    const forme = Math.max(0.05, Math.sin(((heure - 6) / 18) * Math.PI)) * (heure >= 19 && heure <= 22 ? 1.6 : 1);
    return { heure, depense: Math.round(175 * forme * poids), clics: Math.round(60 * forme * poids), prospects: Math.round(7 * forme * poids), inscrites: Math.round(6 * forme * poids) };
  });
  return {
    mois,
    periode,
    du: jours[0] ?? '',
    au: jours[jours.length - 1] ?? '',
    demonstration: true,
    campagnes: 'VSL',
    parametres: PARAMETRES_PUB,
    etats: { meta: 'ok', tunnel: 'ok', iclosed: 'ok' },
    details: {},
    pubs: lignes,
    sansPub,
    jours: jours.map((date) => {
      const depense = Math.round(110 + alea(date, 1) * 90);
      const clics = Math.round(depense * (0.9 + alea(date, 2) * 0.8));
      const inscrites = Math.round(clics * (0.06 + alea(date, 3) * 0.07));
      return { date, depense, clics, prospects: Math.round(inscrites * 1.08), inscrites, rdv: alea(date, 4) > 0.55 ? 1 + Math.round(alea(date, 5)) : 0, ventes: alea(date, 6) > 0.93 ? 1 : 0, commande: alea(date, 6) > 0.93 ? 3000 : 0 };
    }),
    heures,
    creneaux: {},
    delais: { rdv: { j0: Math.round(9 * poids), j1: Math.round(5 * poids), 'j2-3': Math.round(4 * poids), 'j4-7': Math.round(3 * poids), 'j8-14': Math.round(1 * poids) }, vente: { 'j2-3': 1, 'j4-7': 1, 'j8-14': 1 }, tranches: TRANCHES_DELAI },
    typesVus: [],
  };
}

/**
 * GET /api/cockpit/pubs?mois=2026-11&periode=mois : le rapport des publicités, pour une session ouverte.
 * @param {Request} request
 * @param {object} [contexte]
 * @param {Record<string, string | undefined>} [contexte.env]
 * @param {typeof fetch} [contexte.fetchImpl]
 * @param {Date} [contexte.maintenant]
 * @returns {Promise<Response>}
 */
export async function traiterPubs(request, contexte = {}) {
  const { env = {}, fetchImpl = fetch, maintenant = new Date() } = contexte;
  if (request.method !== 'GET') return repondre(405, { ok: false, erreur: 'methode' }, { Allow: 'GET' });
  const acces = verifierAcces(request, env);
  if (!acces.ok) return acces.reponse;

  const demande = new URL(request.url).searchParams;
  const mois = moisValide(demande.get('mois')) ? String(demande.get('mois')) : moisCourant(maintenant);
  const voulue = demande.get('periode') ?? '';
  const periode = /** @type {keyof typeof PERIODES} */ (Object.hasOwn(PERIODES, voulue) ? voulue : 'mois');
  // En local seulement : COCKPIT_DEMO=1 sert un rapport de démonstration.
  const rapport = env.COCKPIT_DEMO === '1' && !env.VERCEL ? pubsDeDemonstration(mois, periode, maintenant) : await assemblerPubs({ mois, periode, env, fetchImpl, maintenant });
  return repondre(200, { ok: true, ...rapport }, { 'Cache-Control': 'private, no-store' });
}
