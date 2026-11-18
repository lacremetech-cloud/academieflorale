import assert from 'node:assert/strict';
import { test } from 'node:test';
import fonction from '../api/cockpit/pubs.js';
import { classerPubs, indicateursPub, parJourDeSemaine, rattacherTunnel, regrouperPubs, resultats, totaliserPubs, trierPubs, tunnelParle } from '../partage/pubs.js';
import { COOKIE, creerSession } from '../serveur/cockpit/acces.js';
import { controlerSuivi } from '../serveur/cockpit/controle.js';
import { assemblerPubs, joursDePeriode, pubsDeDemonstration, traiterPubs } from '../serveur/cockpit/pubs.js';
import { enregistrerInscription, noterEtat } from '../serveur/suivi.js';
import { AC, fauxIclosed, fauxMonde, PROD } from './faux.js';

/** Un instant où novembre 2026 est entièrement passé. */
const APRES = new Date('2026-12-05T10:00:00Z');
const PENDANT = new Date('2026-11-18T10:00:00Z');

const pub = (modifs) => ({ id: '1', nom: 'P01 H1', campagne: 'VSL CBO', ensemble: 'Large', depense: 0, impressions: 0, clics: 0, vues3s: 0, vuesCompletes: 0, prospects: 0, rdv: 0, achats: 0, valeurAchats: 0, ...modifs });

test('créations : la même pub diffusée dans plusieurs ensembles ne fait qu’une ligne', () => {
  const lignes = regrouperPubs(
    [
      pub({ id: '11', depense: 100.105, impressions: 10000, clics: 100, vues3s: 3000, vuesCompletes: 600, prospects: 10, rdv: 2 }),
      pub({ id: '12', nom: 'p01  h1', ensemble: 'Intérêts', depense: 50, impressions: 5000, clics: 40, prospects: 4, achats: 1, valeurAchats: 3000 }),
      pub({ id: '21', nom: 'P02 H1', campagne: 'VSL ABO', depense: 80, impressions: 9000, clics: 60, prospects: 3 }),
    ],
    {
      11: { statut: 'PAUSED', creeLe: '2026-09-10', titre: 'Titre', texte: 'Texte principal', vignette: 'https://images.test/a.jpg' },
      12: { statut: 'ACTIVE', creeLe: '2026-09-02' },
    },
  );
  assert.equal(lignes.length, 2);
  const [p01, p02] = lignes;
  assert.deepEqual(
    { cle: p01.cle, nom: p01.nom, ids: p01.ids, campagnes: p01.campagnes, ensembles: p01.ensembles, statut: p01.statut, creeLe: p01.creeLe, titre: p01.titre, texte: p01.texte },
    { cle: 'nom:p01 h1', nom: 'P01 H1', ids: ['11', '12'], campagnes: ['VSL CBO'], ensembles: 2, statut: 'ACTIVE', creeLe: '2026-09-02', titre: 'Titre', texte: 'Texte principal' },
  );
  assert.deepEqual([p01.depense, p01.impressions, p01.clics, p01.vues3s], [150.11, 15000, 140, 3000]);
  assert.deepEqual(p01.meta, { prospects: 14, rdv: 2, achats: 1, valeur: 3000 });
  assert.deepEqual([p02.cle, p02.ensembles, p02.statut], ['nom:p02 h1', 1, '']);
});

test('tunnel : inscrites, rendez-vous et ventes rattachés par identifiant, par nom, ou comptés à part', () => {
  const lignes = regrouperPubs([pub({ id: '11', depense: 100 }), pub({ id: '21', nom: 'P02 H1', depense: 80 })]);
  const { lignes: toutes, sansPub } = rattacherTunnel(lignes, {
    inscrites: { 'id:11': 8, 'nom:p01 h1': 2, 'nom:p02 h1': 3, '(sans)': 4, 'id:99': 1, 'id:88': 1, 'nom:ancienne pub': 2 },
    rdv: [{ pub: 'id:11' }, { pub: 'id:11', annule: true }, { pub: 'nom:p02 h1' }, { pub: '' }],
    ventes: [{ pub: 'id:11', montant: 3000, encaisse: 1000 }, { pub: '', montant: 1800, encaisse: 0 }],
    noms: { 99: 'P02 H1', 88: '' },
  });
  const par = Object.fromEntries(toutes.map((ligne) => [ligne.cle, ligne]));
  assert.deepEqual(par['nom:p01 h1'].tunnel, { inscrites: 10, rdv: 1, rdvAnnules: 1, ventes: 1, commande: 3000, encaisse: 1000 });
  // La pub 99, hors période, porte le nom d'une création connue : elle la rejoint.
  assert.equal(par['nom:p02 h1'].tunnel.inscrites, 4);
  assert.equal(par['nom:p02 h1'].tunnel.rdv, 1);
  // Les pubs inconnues de la période gardent leur propre ligne, sans dépense.
  assert.deepEqual([par['id:88'].nom, par['id:88'].depense, par['id:88'].tunnel.inscrites], ['Publicité 88', 0, 1]);
  assert.equal(par['nom:ancienne pub'].tunnel.inscrites, 2);
  assert.deepEqual(sansPub, { inscrites: 4, rdv: 1, rdvAnnules: 0, ventes: 1, commande: 1800, encaisse: 0 });
  assert.equal(tunnelParle(toutes, sansPub), true);
  // Avant la mise en ligne du tunnel : des rendez-vous et des ventes sans publicité connue ne suffisent pas, Meta garde la parole.
  const rien = { inscrites: 0, rdv: 0, rdvAnnules: 0, ventes: 0, commande: 0, encaisse: 0 };
  assert.equal(tunnelParle(regrouperPubs([pub({ depense: 10 })]), rien), false);
  assert.equal(tunnelParle(regrouperPubs([pub({ depense: 10 })]), { ...rien, rdv: 3, ventes: 1 }), false);
  assert.equal(tunnelParle(regrouperPubs([pub({ depense: 10 })]), { ...rien, inscrites: 1 }), true);
});

test('indicateurs : coûts et taux d’une création, selon la source', () => {
  const [ligne] = regrouperPubs([pub({ depense: 200, impressions: 20000, clics: 250, vues3s: 6000, vuesCompletes: 1200, prospects: 20, rdv: 4, achats: 1, valeurAchats: 3000 })]);
  ligne.tunnel = { inscrites: 16, rdv: 2, rdvAnnules: 1, ventes: 1, commande: 2400, encaisse: 800 };
  assert.deepEqual(resultats(ligne, 'meta'), { inscrites: 20, rdv: 4, ventes: 1, commande: 3000 });
  assert.deepEqual(resultats(ligne, 'tunnel'), { inscrites: 16, rdv: 2, ventes: 1, commande: 2400 });
  const i = indicateursPub(ligne, resultats(ligne, 'tunnel'));
  assert.deepEqual(
    { cpm: i.cpm, ctr: i.ctr, cpc: i.cpc, accroche: i.accroche, retention: i.retention, coutInscrite: i.coutInscrite, tauxRdv: i.tauxRdv, coutRdv: i.coutRdv, coutVente: i.coutVente, roas: i.roas },
    { cpm: 10, ctr: 0.0125, cpc: 0.8, accroche: 0.3, retention: 0.2, coutInscrite: 12.5, tauxRdv: 0.125, coutRdv: 100, coutVente: 200, roas: 12 },
  );
  // Une image n'a ni accroche ni rétention ; sans résultat, pas de coût.
  const vide = indicateursPub(pub({ depense: 50, impressions: 1000 }), { inscrites: 0, rdv: 0, ventes: 0, commande: 0 });
  assert.deepEqual([vide.accroche, vide.retention, vide.coutInscrite, vide.roas], [null, null, null, 0]);
  assert.deepEqual(totaliserPubs([ligne], 'tunnel'), { depense: 200, impressions: 20000, clics: 250, vues3s: 6000, vuesCompletes: 1200, inscrites: 16, rdv: 2, ventes: 1, commande: 2400 });
});

test('verdicts : jugés sur les inscrites tant que les rendez-vous et les ventes sont trop rares', () => {
  const lignes = regrouperPubs([
    pub({ id: '1', nom: 'Gagnante', depense: 100, prospects: 40 }),
    pub({ id: '2', nom: 'Moyenne', depense: 100, prospects: 20 }),
    pub({ id: '3', nom: 'Chère', depense: 100, prospects: 6 }),
    pub({ id: '4', nom: 'Sans résultat', depense: 40, prospects: 0 }),
    pub({ id: '5', nom: 'Débutante', depense: 5, prospects: 0 }),
    pub({ id: '6', nom: 'Deux inscrites', depense: 6, prospects: 2 }),
    pub({ id: '7', nom: 'Petit volume', depense: 20, prospects: 8 }),
  ]);
  const { niveau, reperes, verdicts } = classerPubs(lignes, 'meta');
  assert.equal(niveau, 'inscrites');
  // 371 € pour 76 inscrites : 4,88 € en moyenne.
  assert.equal(Math.round(reperes.coutInscrite * 100) / 100, 4.88);
  assert.deepEqual(
    Object.fromEntries(Object.entries(verdicts).map(([cle, v]) => [cle.slice(4), v.verdict])),
    // « Petit volume » : 2,50 € l'inscrite, mais sur 8 inscrites seulement. Prometteuse, pas encore gagnante.
    { gagnante: 'gagnante', moyenne: 'moyenne', chère: 'a-couper', 'sans résultat': 'a-couper', débutante: 'trop-tot', 'deux inscrites': 'trop-tot', 'petit volume': 'prometteuse' },
  );
  assert.deepEqual(trierPubs(lignes, verdicts).map((ligne) => ligne.nom), ['Gagnante', 'Petit volume', 'Moyenne', 'Deux inscrites', 'Débutante', 'Chère', 'Sans résultat']);
  // Le tunnel n'a rien vu : aucun repère, donc rien ne se juge.
  assert.deepEqual(Object.values(classerPubs(lignes, 'tunnel').verdicts).map((v) => v.verdict), Array(7).fill('trop-tot'));
});

test('verdicts : avec assez de rendez-vous puis de ventes, le jugement descend dans le tunnel', () => {
  const lignes = regrouperPubs([
    pub({ id: '1', nom: 'A', depense: 300, prospects: 60, rdv: 6 }),
    pub({ id: '2', nom: 'B', depense: 300, prospects: 90, rdv: 2 }),
    pub({ id: '3', nom: 'C', depense: 300, prospects: 30, rdv: 0 }),
    pub({ id: '4', nom: 'D', depense: 20, prospects: 10, rdv: 0 }),
  ]);
  // 8 rendez-vous pour 920 € : 115 € en moyenne.
  const surRdv = classerPubs(lignes, 'meta');
  assert.equal(surRdv.niveau, 'rdv');
  assert.deepEqual(
    Object.values(surRdv.verdicts).map((v) => [v.verdict, v.base]),
    [
      ['gagnante', 'rdv'], // 50 € le rendez-vous
      ['moyenne', 'rdv'], // 150 € : au-dessus de la moyenne, sans dépasser 1,5 fois
      ['a-couper', 'rdv'], // 300 € dépensés sans rendez-vous
      ['prometteuse', 'inscrites'], // trop peu dépensé pour un rendez-vous, mais 2 € l'inscrite
    ],
  );

  lignes[0].meta.achats = 2;
  lignes[0].meta.valeur = 6000;
  lignes[1].meta.achats = 1;
  lignes[1].meta.valeur = 250;
  const surVentes = classerPubs(lignes, 'meta');
  assert.equal(surVentes.niveau, 'ventes');
  assert.deepEqual(
    Object.values(surVentes.verdicts).map((v) => [v.verdict, v.base]),
    [
      ['gagnante', 'ventes'], // ROAS de 20
      ['a-couper', 'ventes'], // une vente, mais moins que la dépense
      ['a-couper', 'rdv'],
      ['prometteuse', 'inscrites'],
    ],
  );
});

test('moments : journées regroupées par jour de la semaine, lundi en premier', () => {
  const lignes = parJourDeSemaine(
    [
      { date: '2026-11-16', depense: 100, inscrites: 10 }, // lundi
      { date: '2026-11-22', depense: 50, inscrites: 2 }, // dimanche
      { date: '2026-11-23', depense: 80, inscrites: 4 }, // lundi
    ],
    ['depense', 'inscrites'],
  );
  assert.equal(lignes.length, 7);
  assert.deepEqual(lignes[0], { jour: 0, jours: 2, depense: 180, inscrites: 14 });
  assert.deepEqual(lignes[6], { jour: 6, jours: 1, depense: 50, inscrites: 2 });
  assert.deepEqual(lignes[3], { jour: 3, jours: 0, depense: 0, inscrites: 0 });
});

test('période : le mois affiché, les trois ou les douze derniers mois, jamais au-delà d’aujourd’hui', () => {
  assert.equal(joursDePeriode('2026-11', 'mois', APRES).length, 30);
  const trois = joursDePeriode('2026-11', '3m', APRES);
  assert.deepEqual([trois[0], trois.at(-1), trois.length], ['2026-09-01', '2026-11-30', 91]);
  assert.deepEqual([joursDePeriode('2026-11', '12m', APRES)[0], joursDePeriode('2026-11', 'mois', PENDANT).at(-1)], ['2025-12-01', '2026-11-18']);
});

/** Meta de test : statistiques par publicité, par jour, par heure, puis fiches des publicités. */
function fauxMeta() {
  return (url) => {
    if (url.pathname.endsWith('/insights')) {
      if (url.searchParams.get('level') === 'ad') {
        return {
          data: [
            {
              ad_id: '120211111111111111',
              ad_name: 'P01 H1',
              adset_name: 'Large',
              campaign_name: 'VSL CBO',
              spend: '300.50',
              impressions: '30000',
              inline_link_clicks: '400',
              actions: [
                { action_type: 'video_view', value: '9000' },
                { action_type: 'lead', value: '50' },
                { action_type: 'offsite_conversion.fb_pixel_lead', value: '48' },
                { action_type: 'schedule_total', value: '5' },
              ],
              video_thruplay_watched_actions: [{ action_type: 'video_view', value: '1500' }],
            },
            { ad_id: '120222222222222222', ad_name: 'P02 H1', adset_name: 'Large', campaign_name: 'VSL CBO', spend: '100', impressions: '12000', inline_link_clicks: '90', actions: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: '6' }] },
          ],
        };
      }
      if (url.searchParams.get('breakdowns')) {
        return { data: [{ hourly_stats_aggregated_by_advertiser_time_zone: '20:00:00 - 20:59:59', spend: '80.25', inline_link_clicks: '120', actions: [{ action_type: 'lead', value: '14' }] }] };
      }
      return { data: [{ date_start: '2026-11-18', spend: '120', inline_link_clicks: '150', actions: [{ action_type: 'lead', value: '12' }] }] };
    }
    // Fiche d'une publicité, demandée par son identifiant : nom, état, texte.
    const fiches = {
      '120211111111111111': {
        name: 'P01 H1',
        effective_status: 'ACTIVE',
        created_time: '2026-10-28T09:00:00+0100',
        // Meta rend parfois un émoji abîmé dans le titre court : la version intacte de la création passe d'abord.
        creative: { title: '\ufffd Fleuriste indépendante', thumbnail_url: 'https://images.test/p01.jpg', object_story_spec: { video_data: { message: 'Et si tu vivais des fleurs ?', title: 'Fleuriste indépendante' } } },
      },
      '120299999999999999': { name: 'P09 H1', effective_status: 'PAUSED' },
    };
    return fiches[url.pathname.split('/').pop()] ?? new Response(JSON.stringify({ error: { message: 'Unsupported get request' } }), { status: 400 });
  };
}

test('rapport : Meta, inscrites du tunnel, rendez-vous d’iClosed et ventes du cockpit, sans aucune donnée personnelle', async () => {
  const appels = [
    { id: 1, createdAt: '2026-11-18 18:05:00.000', inviteeEmail: 'Camille@Exemple.fr', task: [], utm: [] },
    { id: 2, createdAt: '2026-11-19 09:00:00.000', inviteeEmail: 'lea@exemple.fr', task: [], utm: [{ utmKey: 'utm_content', utmValue: 'P02 H1' }] },
    { id: 3, createdAt: '2026-11-20 09:00:00.000', inviteeEmail: 'zoe@exemple.fr', cancelledBy: 'INVITEE', task: [], utm: [{ utmKey: 'utm_id', utmValue: '120299999999999999' }] },
    // Réservé hors de la période (le 1er décembre à Paris) : écarté.
    { id: 4, createdAt: '2026-11-30 23:30:00.000', inviteeEmail: 'eva@exemple.fr', task: [], utm: [] },
  ];
  const m = fauxMonde({ meta: fauxMeta(), iclosed: fauxIclosed(appels) });
  // Camille s'est inscrite le 16 par la pub P01 ; Inès, sans paramètre de publicité.
  const utm = { utm_id: '120211111111111111', utm_content: 'P01 H1' };
  await enregistrerInscription(PROD, { email: 'camille@exemple.fr', utm }, { fetchImpl: m.fetchImpl, maintenant: new Date('2026-11-16T19:30:00Z') });
  await enregistrerInscription(PROD, { email: 'ines@exemple.fr', utm: {} }, { fetchImpl: m.fetchImpl, maintenant: new Date('2026-11-17T08:10:00Z') });
  // Deux ventes : celle de Camille (rattachée par son email), et une sans email.
  const paiements = [{ methode: 'gocardless', montant: 3000, mensualites: 1, debut: '2026-11-25' }];
  await m.commandes(
    ['HSET', 'af:c1:ventes', 'v1', JSON.stringify({ date: '2026-11-25', formule: 'independant', montant: 3000, commission: 0, paiements, email: 'camille@exemple.fr' })],
    ['HSET', 'af:c1:ventes', 'v2', JSON.stringify({ date: '2026-11-26', formule: 'essentiel', montant: 1800, commission: 0, paiements: [{ methode: 'cpf', montant: 1800, mensualites: 1, debut: '2026-11-26' }] })],
    ['HSET', 'af:c1:ventes', 'v3', JSON.stringify({ date: '2026-10-02', formule: 'essentiel', montant: 999, commission: 0, paiements: [{ methode: 'virement', montant: 999, mensualites: 1, debut: '2026-10-02' }] })],
  );

  const rapport = await assemblerPubs({ mois: '2026-11', periode: 'mois', env: PROD, fetchImpl: m.fetchImpl, maintenant: APRES });
  assert.deepEqual([rapport.du, rapport.au, rapport.campagnes, rapport.demonstration], ['2026-11-01', '2026-11-30', 'VSL', false]);
  assert.deepEqual(rapport.etats, { meta: 'ok', tunnel: 'ok', iclosed: 'ok' });

  const par = Object.fromEntries(rapport.pubs.map((ligne) => [ligne.nom, ligne]));
  const p01 = par['P01 H1'];
  assert.deepEqual([p01.depense, p01.impressions, p01.clics, p01.vues3s, p01.vuesCompletes], [300.5, 30000, 400, 9000, 1500]);
  // Selon Meta : « lead » passe avant le détail du pixel, pour ne pas compter deux fois.
  assert.deepEqual(p01.meta, { prospects: 50, rdv: 5, achats: 0, valeur: 0 });
  assert.deepEqual(p01.tunnel, { inscrites: 1, rdv: 1, rdvAnnules: 0, ventes: 1, commande: 3000, encaisse: 3000 });
  assert.deepEqual([p01.statut, p01.creeLe, p01.titre, p01.texte, p01.vignette], ['ACTIVE', '2026-10-28', 'Fleuriste indépendante', 'Et si tu vivais des fleurs ?', 'https://images.test/p01.jpg']);
  // Léa n'est pas passée par la landing : son rendez-vous est rattaché par les paramètres gardés par iClosed.
  assert.deepEqual([par['P02 H1'].meta.prospects, par['P02 H1'].tunnel.rdv], [6, 1]);
  // La pub de Zoé n'a pas dépensé sur la période : son nom est retrouvé, son rendez-vous annulé compté à part.
  assert.deepEqual([par['P09 H1'].depense, par['P09 H1'].tunnel.rdv, par['P09 H1'].tunnel.rdvAnnules], [0, 0, 1]);
  assert.deepEqual(rapport.sansPub, { inscrites: 1, rdv: 0, rdvAnnules: 0, ventes: 1, commande: 1800, encaisse: 0 });

  const jour = (date) => rapport.jours.find((j) => j.date === date);
  assert.equal(rapport.jours.length, 30);
  assert.deepEqual(jour('2026-11-18'), { date: '2026-11-18', depense: 120, clics: 150, prospects: 12, inscrites: 0, rdv: 1, ventes: 0, commande: 0 });
  assert.deepEqual([jour('2026-11-16').inscrites, jour('2026-11-25').ventes, jour('2026-11-25').commande, jour('2026-11-20').rdv], [1, 1, 3000, 0]);
  assert.deepEqual(rapport.heures[20], { heure: 20, depense: 80.25, clics: 120, prospects: 14, inscrites: 1 });
  assert.equal(rapport.heures[9].inscrites, 1);
  // Camille : rendez-vous deux jours après son inscription, vente neuf jours après.
  assert.deepEqual([rapport.delais.rdv, rapport.delais.vente], [{ 'j2-3': 1 }, { 'j8-14': 1 }]);
  assert.deepEqual(rapport.typesVus, ['lead', 'offsite_conversion.fb_pixel_lead', 'schedule_total', 'video_view']);

  // Ce que Meta reçoit : le jeton en en-tête, les campagnes « VSL », la période.
  const versMeta = m.vers('meta');
  assert.equal(versMeta.every((d) => d.options.headers.Authorization === 'Bearer jeton-meta-de-test' && !d.url.href.includes('jeton')), true);
  const parPub = versMeta.find((d) => d.url.searchParams.get('level') === 'ad');
  assert.deepEqual(JSON.parse(parPub.url.searchParams.get('time_range')), { since: '2026-11-01', until: '2026-11-30' });
  // Publicité par publicité, les archivées et les supprimées sont demandées aussi : sinon leur dépense manquerait au détail.
  const filtres = JSON.parse(parPub.url.searchParams.get('filtering'));
  assert.deepEqual(filtres[0], { field: 'campaign.name', operator: 'CONTAIN', value: 'VSL' });
  assert.deepEqual([filtres[1].field, filtres[1].operator, filtres[1].value.includes('ARCHIVED'), filtres[1].value.includes('DELETED'), filtres[1].value.includes('PAUSED')], ['ad.effective_status', 'IN', true, true, true]);
  const parJour = versMeta.find((d) => d.url.searchParams.get('time_increment'));
  assert.deepEqual(JSON.parse(parJour.url.searchParams.get('filtering')), [{ field: 'campaign.name', operator: 'CONTAIN', value: 'VSL' }]);
  // Les fiches se demandent une par une (Meta n'accepte plus la lecture groupée) : les créations de la période, puis la pub vue par le tunnel.
  const fiches = versMeta.filter((d) => /^\/v27\.0\/\d+$/.test(d.url.pathname));
  assert.deepEqual(fiches.map((d) => d.url.pathname.split('/').pop()), ['120211111111111111', '120222222222222222', '120299999999999999']);
  assert.equal(fiches.every((d) => d.url.searchParams.get('fields').startsWith('name,effective_status,created_time') && !d.url.searchParams.has('ids')), true);
  assert.deepEqual(rapport.lectures.fiches, { demandees: 3, lues: 2, refus: 'Meta a répondu 400 : Unsupported get request' });
  // Aucun email ne sort du serveur.
  assert.equal(/exemple|camille|lea@|zoe@/i.test(JSON.stringify(rapport)), false);
});

test('rapport : si Meta refuse le détail des créations, on se contente du nom et de l’état', async () => {
  const demandes = [];
  const meta = (url) => {
    if (url.pathname.endsWith('/insights')) {
      return url.searchParams.get('level') === 'ad'
        ? { data: [{ ad_id: '120211111111111111', ad_name: 'P01 H1', spend: '10', impressions: '900' }, { ad_id: '120233333333333333', ad_name: 'P03 H1', spend: '5', impressions: '400' }] }
        : { data: [] };
    }
    const champs = url.searchParams.get('fields');
    demandes.push([url.pathname.split('/').pop(), champs.includes('object_story_spec') ? 'tout' : champs.includes('creative') ? 'texte' : 'nom']);
    // Le détail complet d'une création est refusé (droit sur la Page manquant) ; son texte simple passe.
    if (champs.includes('object_story_spec')) return new Response(JSON.stringify({ error: { message: '(#200) Requires pages_read_engagement' } }), { status: 403 });
    // Une publicité supprimée depuis longtemps ne se lit plus du tout.
    if (url.pathname.endsWith('/120233333333333333')) return new Response(JSON.stringify({ error: { message: 'Unsupported get request' } }), { status: 400 });
    return { name: 'P01 H1', effective_status: 'ARCHIVED', creative: { body: 'Texte de P01' } };
  };
  const m = fauxMonde({ meta, iclosed: fauxIclosed([]) });
  const rapport = await assemblerPubs({ mois: '2026-11', periode: 'mois', env: PROD, fetchImpl: m.fetchImpl, maintenant: APRES });
  const par = Object.fromEntries(rapport.pubs.map((ligne) => [ligne.nom, ligne]));
  assert.deepEqual([par['P01 H1'].texte, par['P01 H1'].statut, par['P03 H1'].texte, par['P03 H1'].depense], ['Texte de P01', 'ARCHIVED', '', 5]);
  // La première publicité trouve le niveau accepté ; la suivante le demande directement.
  assert.deepEqual(demandes, [['120211111111111111', 'tout'], ['120211111111111111', 'texte'], ['120233333333333333', 'texte']]);
  assert.deepEqual(rapport.lectures.fiches, { demandees: 2, lues: 1, refus: 'Meta a répondu 403 : (#200) Requires pages_read_engagement' });
});

test('rapport : chaque source peut manquer sans empêcher les autres', async () => {
  const m = fauxMonde({ meta: () => new Response(JSON.stringify({ error: { message: 'Jeton expiré' } }), { status: 400 }), iclosed: () => new Response('{}', { status: 500 }) });
  const rapport = await assemblerPubs({ mois: '2026-11', periode: 'mois', env: PROD, fetchImpl: m.fetchImpl, maintenant: APRES });
  assert.deepEqual(rapport.etats, { meta: 'erreur', tunnel: 'ok', iclosed: 'erreur' });
  assert.equal(rapport.details.meta, 'Meta a répondu 400 : Jeton expiré');
  assert.deepEqual([rapport.pubs, rapport.jours.length], [[], 30]);

  const rien = await assemblerPubs({ mois: '2026-11', periode: 'mois', env: {}, maintenant: APRES });
  assert.deepEqual(rien.etats, { meta: 'a-brancher', tunnel: 'a-brancher', iclosed: 'a-brancher' });
  const avenir = await assemblerPubs({ mois: '2027-01', periode: 'mois', env: PROD, fetchImpl: m.fetchImpl, maintenant: APRES });
  assert.deepEqual([avenir.pubs, avenir.jours], [[], []]);
});

test('/api/cockpit/pubs : session exigée, période au choix, démonstration en local seulement', async () => {
  assert.equal(typeof fonction.fetch, 'function');
  const MOT_DE_PASSE = 'essai-du-cockpit-42';
  const cookie = `${COOKIE}=${creerSession(MOT_DE_PASSE, APRES.getTime())}`;
  const demande = (suite, session = true, methode = 'GET') => new Request(`https://tunnel.test/api/cockpit/pubs${suite}`, { method: methode, headers: session ? { cookie } : {} });
  const ctx = { env: { COCKPIT_MOT_DE_PASSE: MOT_DE_PASSE, COCKPIT_DEMO: '1' }, maintenant: APRES };
  assert.equal((await traiterPubs(demande('?mois=2026-11', false), ctx)).status, 401);
  assert.equal((await traiterPubs(demande('', true, 'POST'), ctx)).status, 405);
  const reponse = await traiterPubs(demande('?mois=2026-11&periode=3m'), ctx);
  assert.equal(reponse.status, 200);
  const corps = await reponse.json();
  assert.deepEqual([corps.ok, corps.demonstration, corps.periode, corps.du, corps.pubs.length > 3], [true, true, '3m', '2026-09-01', true]);
  // Une période inconnue revient au mois ; sur Vercel, jamais de démonstration.
  assert.equal((await (await traiterPubs(demande('?mois=2026-11&periode=siecle'), ctx)).json()).periode, 'mois');
  const enLigne = await (await traiterPubs(demande('?mois=2026-11'), { ...ctx, env: { ...ctx.env, VERCEL: '1' } })).json();
  assert.deepEqual([enLigne.demonstration, enLigne.pubs], [false, []]);
  assert.equal(pubsDeDemonstration('2026-11', 'mois', APRES).jours.length, 30);
});

test('suivi du tunnel : chaque maillon dit s’il est en place, ce qui manque et ce qu’il a fait', async () => {
  // Rien de réglé, en préversion.
  const nu = await controlerSuivi({ env: { VERCEL_ENV: 'preview' }, maintenant: PENDANT });
  assert.deepEqual(Object.fromEntries(Object.entries(nu).map(([cle, maillon]) => [cle, maillon.etat])), {
    tunnel: 'attente',
    activecampaign: 'a-brancher',
    rdv: 'a-brancher',
    client: 'attente',
    conversions: 'a-brancher',
  });
  assert.deepEqual(nu.activecampaign.variables, ['ACTIVECAMPAIGN_API_URL', 'ACTIVECAMPAIGN_API_KEY']);
  assert.deepEqual(nu.conversions.variables, ['META_PIXEL_ID', 'META_CAPI_TOKEN']);

  // Tout réglé, en production : ActiveCampaign est interrogé (ses listes, le déclencheur de la séquence).
  const activecampaign = (url) =>
    url.pathname === '/api/3/lists'
      ? { lists: [{ id: '3', name: 'Prospect' }, { id: '4', name: 'Client' }] }
      : { automationTriggers: [{ type: 'field', params: { field: '2', toValue: 'VSL' } }] };
  const m = fauxMonde({ activecampaign });
  await noterEtat(PROD, 'rdv', { t: '2026-11-18T09:56:00.000Z', vus: 1, nouveaux: 1, annules: 0, echecs: 0 }, { fetchImpl: m.fetchImpl });
  await noterEtat(PROD, 'conversions', { t: '2026-11-18T08:00:00.000Z', nom: 'Lead', ok: true, detail: '' }, { fetchImpl: m.fetchImpl });
  const pret = await controlerSuivi({ env: PROD, fetchImpl: m.fetchImpl, maintenant: PENDANT });
  assert.deepEqual(Object.values(pret).map((maillon) => maillon.etat), ['ok', 'ok', 'ok', 'ok', 'ok']);
  assert.deepEqual(pret.activecampaign.lignes, ['Liste « Prospect » trouvée.', 'Liste « Client » trouvée.', '« VSL Séquence Mail » démarre bien à l’inscription (Source = VSL).']);
  assert.equal(pret.rdv.lignes[0], 'iClosed relu il y a 4 min (toutes les 10 minutes).');
  assert.equal(pret.conversions.lignes[1], 'Dernier événement (Lead) il y a 2 h : reçu par Meta.');
  assert.deepEqual(m.vers('activecampaign').map((d) => [d.url.href, d.options.headers['Api-Token']]), [
    [`${AC}/api/3/lists?limit=100`, 'cle-activecampaign-de-test'],
    [`${AC}/api/3/automations/1/triggers`, 'cle-activecampaign-de-test'],
  ]);
  // Le contrôle d'ActiveCampaign est gardé quelques minutes : pas de nouvelle demande au rechargement.
  await controlerSuivi({ env: PROD, fetchImpl: m.fetchImpl, maintenant: new Date(PENDANT.getTime() + 60000) });
  assert.equal(m.vers('activecampaign').length, 2);

  // Une clé refusée, une liste disparue, un déclencheur changé : dits clairement.
  const refus = fauxMonde({ activecampaign: () => new Response('{}', { status: 403 }) });
  const refuse = await controlerSuivi({ env: { ...PROD, ACTIVECAMPAIGN_API_KEY: 'autre-cle-0001' }, fetchImpl: refus.fetchImpl, maintenant: PENDANT });
  assert.deepEqual([refuse.activecampaign.etat, refuse.activecampaign.lignes, refuse.rdv.etat, refuse.client.etat], ['erreur', ['ActiveCampaign refuse la clé : elle est à recopier dans Vercel.'], 'attente', 'attente']);
  const change = fauxMonde({ activecampaign: (url) => (url.pathname === '/api/3/lists' ? { lists: [{ id: '3', name: 'Prospect' }] } : { automationTriggers: [{ params: { field: '2', toValue: 'Autre' } }] }) });
  const casse = await controlerSuivi({ env: { ...PROD, ACTIVECAMPAIGN_API_KEY: 'autre-cle-0002' }, fetchImpl: change.fetchImpl, maintenant: PENDANT });
  assert.equal(casse.activecampaign.etat, 'erreur');
  assert.deepEqual(casse.activecampaign.lignes.slice(1), ['Liste n° 4 (client) introuvable dans le compte.', '« VSL Séquence Mail » n’est plus déclenchée par Source = VSL : les emails ne partiraient pas.']);
});
