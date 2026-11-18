import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compter, lireCompteurs, nomDeVariante } from '../partage/compteurs.js';
import { visiteACompter } from '../partage/visites.js';
import { assemblerMois } from '../serveur/cockpit/donnees.js';
import { pauseDe, TUNNELS } from '../partage/tunnels.js';
import { lireIclosed } from '../serveur/cockpit/iclosed.js';
import { filtreCampagnes, filtreWebinaire, lireMeta, oublierConversions } from '../serveur/cockpit/meta.js';
import { lireWistia } from '../serveur/cockpit/wistia.js';
import { oublierEvents } from '../serveur/iclosed.js';
import { creerLimiteur, traiterLead } from '../serveur/lead.js';

const MOIS = '2026-11';
/** Un instant où le mois de novembre 2026 est entièrement passé : les tests ne dépendent pas du jour où ils tournent. */
const APRES = new Date('2026-12-05T10:00:00Z');
/** Un instant en plein mois de novembre 2026. */
const PENDANT = new Date('2026-11-18T10:00:00Z');

/** Faux réseau : répond selon l'adresse demandée, et garde la trace des demandes. */
function fauxReseau(repondre) {
  const demandes = [];
  const fetchImpl = async (adresse, options = {}) => {
    const url = new URL(adresse);
    demandes.push({ url, options, corps: options.body ? JSON.parse(options.body) : null });
    const reponse = await repondre(url, options, demandes.length);
    if (reponse instanceof Response) return reponse;
    return new Response(JSON.stringify(reponse), { status: 200, headers: { 'content-type': 'application/json' } });
  };
  return { demandes, fetchImpl };
}

test('Meta : dépense, impressions et clics par jour, jeton hors de l’adresse', async () => {
  const { demandes, fetchImpl } = fauxReseau((url) =>
    url.searchParams.get('after')
      ? { data: [{ date_start: '2026-11-03', spend: '181.20', impressions: '24397', inline_link_clicks: '313' }], paging: { cursors: { after: 'B' } } }
      : {
          data: [
            { date_start: '2026-11-01', spend: '197.4', impressions: '29186', inline_link_clicks: '430' },
            { date_start: '2026-11-02', spend: '179', impressions: '28126' },
          ],
          paging: { cursors: { after: 'A' }, next: 'https://graph.facebook.com/suite' },
        },
  );
  // Sans réglage particulier, seules les campagnes dont le nom contient « VSL » sont comptées.
  const env = { META_ACCESS_TOKEN: 'jeton-meta-de-test', META_AD_ACCOUNT_ID: 'act_123456789' };
  const lu = await lireMeta({ env, mois: MOIS, fetchImpl, maintenant: APRES });
  assert.equal(lu.etat, 'ok');
  assert.deepEqual(lu.jours['2026-11-01'], { depense: 197.4, impressions: 29186, clics: 430 });
  assert.deepEqual(lu.jours['2026-11-02'], { depense: 179, impressions: 28126, clics: 0 });
  assert.equal(lu.jours['2026-11-03'].clics, 313);

  const [premiere, seconde] = demandes;
  assert.equal(premiere.url.origin + premiere.url.pathname, 'https://graph.facebook.com/v27.0/act_123456789/insights');
  assert.deepEqual(JSON.parse(premiere.url.searchParams.get('time_range')), { since: '2026-11-01', until: '2026-11-30' });
  assert.equal(premiere.url.searchParams.get('time_increment'), '1');
  assert.deepEqual(JSON.parse(premiere.url.searchParams.get('filtering')), [{ field: 'campaign.name', operator: 'CONTAIN', value: 'VSL' }]);
  assert.equal(premiere.options.headers.Authorization, 'Bearer jeton-meta-de-test');
  assert.equal(premiere.url.href.includes('jeton-meta-de-test'), false);
  assert.equal(seconde.url.searchParams.get('after'), 'A');
  assert.equal(demandes.length, 2);
});

test('Meta : campagnes « VSL » par défaut, autre texte ou tout le compte sur réglage', async () => {
  const filtreDemande = async (reglage) => {
    const { demandes, fetchImpl } = fauxReseau(() => ({ data: [] }));
    await lireMeta({ env: { META_ACCESS_TOKEN: 'jeton', META_AD_ACCOUNT_ID: '123456789', ...reglage }, mois: MOIS, fetchImpl, maintenant: APRES });
    const filtre = demandes[0].url.searchParams.get('filtering');
    return filtre ? JSON.parse(filtre)[0].value : null;
  };
  assert.equal(await filtreDemande({}), 'VSL');
  assert.equal(await filtreDemande({ META_CAMPAGNES: ' Webinaire ' }), 'Webinaire');
  assert.equal(await filtreDemande({ META_CAMPAGNES: '' }), null);
  assert.equal(filtreCampagnes({}), 'VSL');
  assert.equal(filtreCampagnes({ META_CAMPAGNES: '' }), '');
});

test('Meta : non branché sans variables, erreur lisible si Meta refuse', async () => {
  assert.equal((await lireMeta({ env: {}, mois: MOIS })).etat, 'a-brancher');
  assert.equal((await lireMeta({ env: { META_ACCESS_TOKEN: 'x', META_AD_ACCOUNT_ID: 'compte' }, mois: MOIS })).etat, 'erreur');

  const refus = fauxReseau(() => new Response(JSON.stringify({ error: { message: 'Error validating access token: Session has expired', code: 190 } }), { status: 400 }));
  const lu = await lireMeta({ env: { META_ACCESS_TOKEN: 'jeton-secret', META_AD_ACCOUNT_ID: '123456789' }, mois: MOIS, fetchImpl: refus.fetchImpl, maintenant: APRES });
  assert.equal(lu.etat, 'erreur');
  assert.match(lu.detail, /Meta a répondu 400 : Error validating access token/);
  assert.equal(lu.detail.includes('jeton-secret'), false);

  const panne = await lireMeta({
    env: { META_ACCESS_TOKEN: 'x', META_AD_ACCOUNT_ID: '123456789' },
    mois: MOIS,
    maintenant: APRES,
    fetchImpl: async () => {
      throw new TypeError('fetch failed');
    },
  });
  assert.deepEqual([panne.etat, panne.detail], ['erreur', 'Meta est injoignable']);
});

test('Wistia : chargements, lectures et heures de la VSL par jour', async () => {
  const { demandes, fetchImpl } = fauxReseau(() => [
    { date: '2026-11-01', load_count: 40, play_count: 31, hours_watched: 2.75 },
    { date: '2026-11-02', load_count: 12, play_count: 9, hours_watched: 0.9 },
  ]);
  const lu = await lireWistia({ env: { WISTIA_API_TOKEN: 'jeton-wistia' }, mois: MOIS, fetchImpl, maintenant: APRES });
  assert.equal(lu.etat, 'ok');
  assert.deepEqual(lu.jours['2026-11-01'], { chargements: 40, lectures: 31, heures: 2.75 });
  const [demande] = demandes;
  assert.equal(demande.url.origin + demande.url.pathname, 'https://api.wistia.com/modern/stats/medias/zklz621hsl/by_date');
  assert.equal(demande.url.searchParams.get('start_date'), '2026-11-01');
  assert.equal(demande.url.searchParams.get('end_date'), '2026-11-30');
  assert.equal(demande.options.headers.Authorization, 'Bearer jeton-wistia');
  assert.equal(demande.options.headers['X-Wistia-API-Version'], '2026-09');

  assert.equal((await lireWistia({ env: {}, mois: MOIS })).etat, 'a-brancher');
  const refus = await lireWistia({
    env: { WISTIA_API_TOKEN: 'x' },
    mois: MOIS,
    maintenant: APRES,
    fetchImpl: async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 }),
  });
  assert.equal(refus.detail, 'Wistia a répondu 401 : Unauthorized');
});

/** Un appel tel que la documentation d'iClosed le décrit. */
const appel = (id, createdAt, dateTimeUTC, suite = {}) => ({
  id,
  createdAt,
  dateTimeUTC,
  cancelledBy: null,
  cancelReason: null,
  task: [],
  inviteeEmail: 'camille@exemple.fr',
  event: { linkPrefix: 'academie-florale/candidature-vsl' },
  ...suite,
});

test('iClosed : appels réservés, annulés et absentes de l’event du tunnel', async () => {
  const { demandes, fetchImpl } = fauxReseau((url) => {
    if (url.pathname === '/v1/events') {
      return { data: [{ id: 7, linkPrefix: 'academie-florale/webinaire' }, { id: 12, linkPrefix: 'Academie-Florale/candidature-vsl' }] };
    }
    if (url.pathname === '/v1/eventCalls' && url.searchParams.has('createdAtStart')) {
      return {
        data: {
          count: 4,
          eventCalls: [
            appel(1, '2026-11-03T09:10:00.000Z', '2026-11-05T17:00:00.000Z'),
            appel(2, '2026-11-03T22:30:00.000Z', '2026-11-06T09:00:00.000Z'),
            // Réservé le 3 à 23 h 30 UTC : c'est déjà le 4 à Paris.
            appel(3, '2026-11-03T23:30:00.000Z', '2026-11-07T09:00:00.000Z'),
            // Réservé la veille du mois (fenêtre élargie) : hors du mois, non compté.
            appel(4, '2026-10-31T12:00:00.000Z', '2026-11-02T09:00:00.000Z'),
          ],
        },
      };
    }
    if (url.pathname === '/v1/eventCalls') {
      return {
        data: {
          count: 4,
          eventCalls: [
            appel(1, '2026-11-03T09:10:00.000Z', '2026-11-05T17:00:00.000Z', { task: [{ outcome: 'WON', noSaleReason: null }] }),
            appel(2, '2026-11-03T22:30:00.000Z', '2026-11-06T09:00:00.000Z', { cancelledBy: 'INVITEE', cancelReason: 'empêchement' }),
            appel(3, '2026-11-03T23:30:00.000Z', '2026-11-07T09:00:00.000Z', { task: [{ outcome: 'NO_SALE', noSaleReason: 'NO_SHOW' }] }),
            appel(4, '2026-10-31T12:00:00.000Z', '2026-11-02T09:00:00.000Z', { task: [{ outcome: 'NO_SALE', noSaleReason: 'ADMIN_CANCELLED' }] }),
          ],
        },
      };
    }
    return new Response('{}', { status: 404 });
  });

  const lu = await lireIclosed({ env: { ICLOSED_API_KEY: 'iclosed_cle-de-test' }, mois: MOIS, fetchImpl, maintenant: APRES });
  assert.equal(lu.etat, 'ok', lu.detail);
  assert.equal(lu.jours['2026-11-03'].appels, 2);
  assert.equal(lu.jours['2026-11-04'].appels, 1);
  assert.equal(lu.jours['2026-10-31'], undefined);
  assert.equal(lu.jours['2026-11-06'].annules, 1);
  assert.equal(lu.jours['2026-11-02'].annules, 1);
  assert.equal(lu.jours['2026-11-07'].absentes, 1);
  // Les ventes ne se lisent pas dans iClosed : elles se saisissent à la main.
  assert.deepEqual(lu.jours['2026-11-03'], { appels: 2, annules: 0, absentes: 0 });
  assert.equal(demandes.some((d) => d.url.pathname === '/v1/deals'), false);
  // Aucune donnée personnelle ne sort de la lecture.
  assert.equal(JSON.stringify(lu).includes('camille'), false);

  const appels = demandes.filter((d) => d.url.pathname === '/v1/eventCalls');
  assert.equal(appels[0].url.searchParams.get('eventIds'), '12');
  assert.equal(appels[0].url.searchParams.get('createdAtStart'), '2026-10-31T00:00:00.000Z');
  assert.equal(appels[0].url.searchParams.get('createdAtEnd'), '2026-12-01T23:59:59.999Z');
  assert.equal(appels[1].url.searchParams.get('dateFrom'), '2026-10-31T00:00:00.000Z');
  assert.equal(demandes[0].options.headers.Authorization, 'Bearer iclosed_cle-de-test');
});

test('iClosed : non branché sans clé, erreurs lisibles', async () => {
  assert.equal((await lireIclosed({ env: {}, mois: MOIS })).etat, 'a-brancher');
  const refus = await lireIclosed({
    env: { ICLOSED_API_KEY: 'mauvaise-cle-1' },
    mois: '2026-08',
    fetchImpl: async () => new Response(JSON.stringify({ message: 'Invalid API key' }), { status: 401 }),
  });
  assert.deepEqual([refus.etat, refus.detail], ['erreur', 'iClosed a répondu 401 : Invalid API key']);
});

test('mois en cours : aucune source n’est interrogée au-delà d’aujourd’hui, ni sur un mois à venir', async () => {
  const env = { META_ACCESS_TOKEN: 'jeton', META_AD_ACCOUNT_ID: '123456789', WISTIA_API_TOKEN: 'jeton', ICLOSED_API_KEY: 'iclosed_cle' };
  const { demandes, fetchImpl } = fauxReseau((url) => {
    if (url.hostname === 'graph.facebook.com') return { data: [] };
    if (url.hostname === 'api.wistia.com') return [{ date: '2026-11-17', load_count: 9, play_count: 5, hours_watched: 0.4 }];
    if (url.pathname === '/v1/events') return { data: [{ id: 12, linkPrefix: 'academie-florale/candidature-vsl' }] };
    return { data: { count: 0, eventCalls: [] } };
  });
  await lireMeta({ env, mois: MOIS, fetchImpl, maintenant: PENDANT });
  const wistia = await lireWistia({ env, mois: MOIS, fetchImpl, maintenant: PENDANT });
  await lireIclosed({ env, mois: MOIS, fetchImpl, maintenant: PENDANT });
  const vers = (hote) => demandes.filter((d) => d.url.hostname === hote);
  assert.deepEqual(JSON.parse(vers('graph.facebook.com')[0].url.searchParams.get('time_range')), { since: '2026-11-01', until: '2026-11-18' });
  assert.deepEqual([vers('api.wistia.com')[0].url.searchParams.get('start_date'), vers('api.wistia.com')[0].url.searchParams.get('end_date')], ['2026-11-01', '2026-11-18']);
  assert.equal(wistia.jours['2026-11-17'].lectures, 5);
  const appels = vers('public.api.iclosed.io').filter((d) => d.url.pathname === '/v1/eventCalls');
  assert.equal(appels[0].url.searchParams.get('createdAtEnd'), '2026-11-19T23:59:59.999Z');
  assert.equal(appels[1].url.searchParams.get('dateTo'), '2026-11-19T23:59:59.999Z');

  // Un mois à venir : rien n'est demandé, la source reste « branchée » et vide.
  const avant = demandes.length;
  for (const lire of [lireMeta, lireWistia, lireIclosed]) {
    assert.deepEqual(await lire({ env, mois: '2026-12', fetchImpl, maintenant: PENDANT }), { etat: 'ok', jours: {} });
  }
  assert.equal(demandes.length, avant);
});

test('compteurs : une vue ou une inscription se compte par jour et par formulation', async () => {
  const { demandes, fetchImpl } = fauxReseau(() => [{ result: 5 }, { result: 2 }, { result: 0 }]);
  const env = { KV_REST_API_URL: 'https://base.test', KV_REST_API_TOKEN: 'jeton-base' };
  const maintenant = new Date('2026-11-18T23:30:00Z'); // déjà le 19 à Paris
  assert.equal(await compter(env, 'inscrits', 'inscription/90-jours-plan', { fetchImpl, maintenant }), true);
  assert.deepEqual(demandes[0].corps, [
    ['INCR', 'af:c1:inscrits:j:2026-11-19'],
    ['INCR', 'af:c1:inscrits:m:2026-11:90-jours-plan'],
    ['SADD', 'af:c1:variantes', '90-jours-plan'],
  ]);
  assert.equal(demandes[0].options.headers.Authorization, 'Bearer jeton-base');

  // Sans base reliée, ou si elle tombe : rien ne casse.
  assert.equal(await compter({}, 'inscrits', '90-jours'), false);
  assert.equal(await compter(env, 'autre-chose', '90-jours', { fetchImpl }), false);
  const panne = async () => {
    throw new TypeError('fetch failed');
  };
  assert.equal(await compter(env, 'vues', '90-jours', { fetchImpl: panne }), false);
  assert.equal(await compter(env, 'vues', '90-jours', { fetchImpl: async () => new Response('non', { status: 500 }) }), false);

  assert.equal(nomDeVariante('inscription/90-jours'), '90-jours');
  assert.equal(nomDeVariante('90-jours-rythme'), '90-jours-rythme');
  // Seules les formulations en test ont leur compteur : tout autre nom va dans « autre ».
  for (const douteux of ['inscription', '', null, '../secret', 'mariages', 'A B', 'x'.repeat(60)]) assert.equal(nomDeVariante(douteux), 'autre');
});

test('compteurs : lecture d’un mois, par jour et par formulation, avec les notes', async () => {
  const { demandes, fetchImpl } = fauxReseau((url, options, rang) => {
    if (rang === 1) {
      const jours = 30;
      return [
        { result: ['120', '95', ...Array(jours - 2).fill(null)] },
        { result: ['12', null, ...Array(jours - 2).fill(null)] },
        { result: [null, 'scaling cbo', ...Array(jours - 2).fill(null)] },
        { result: ['90-jours-plan', '90-jours', 'ancienne'] },
      ];
    }
    return [{ result: ['110', '105', null] }, { result: ['7', '5', null] }];
  });
  const lu = await lireCompteurs({ UPSTASH_REDIS_REST_URL: 'https://base.test/', UPSTASH_REDIS_REST_TOKEN: 'jeton' }, MOIS, { fetchImpl });
  assert.equal(lu.etat, 'ok');
  assert.deepEqual(lu.jours['2026-11-01'], { vues: 120, inscrits: 12 });
  assert.deepEqual(lu.jours['2026-11-02'], { vues: 95, inscrits: 0 });
  assert.deepEqual(lu.jours['2026-11-30'], { vues: 0, inscrits: 0 });
  assert.deepEqual(lu.notes, { '2026-11-02': 'scaling cbo' });
  assert.equal(demandes[0].corps.length, 4);
  // Formulations triées ; celle qui n'a rien ce mois-ci n'est pas listée.
  assert.deepEqual(lu.variantes, [
    { nom: '90-jours', vues: 110, inscrits: 7 },
    { nom: '90-jours-plan', vues: 105, inscrits: 5 },
  ]);
  assert.equal(demandes[0].corps[0].length, 31);
  assert.equal(demandes[0].corps[0][1], 'af:c1:vues:j:2026-11-01');
  assert.equal(demandes[1].corps[0][1], 'af:c1:vues:m:2026-11:90-jours');

  assert.equal((await lireCompteurs({}, MOIS)).etat, 'a-brancher');
  const refus = await lireCompteurs({ KV_REST_API_URL: 'https://base.test', KV_REST_API_TOKEN: 'x' }, MOIS, {
    fetchImpl: async () => new Response('non', { status: 401 }),
  });
  assert.equal(refus.etat, 'erreur');
});

test('assemblage : zéro les jours passés d’une source branchée, vide pour les jours à venir et les sources absentes', async () => {
  const { fetchImpl } = fauxReseau((url) =>
    url.hostname === 'graph.facebook.com' ? { data: [{ date_start: '2026-11-02', spend: '100', impressions: '10000', inline_link_clicks: '150' }] } : new Response('{}', { status: 500 }),
  );
  const donnees = await assemblerMois({
    mois: MOIS,
    env: { META_ACCESS_TOKEN: 'x', META_AD_ACCOUNT_ID: '123456789', WISTIA_API_TOKEN: 'y' },
    fetchImpl,
    maintenant: new Date('2026-11-03T12:00:00Z'),
  });
  const [premier, deuxieme, troisieme, quatrieme] = donnees.jours;
  assert.deepEqual([premier.depense, premier.clics], [0, 0]);
  assert.deepEqual([deuxieme.depense, deuxieme.impressions, deuxieme.clics], [100, 10000, 150]);
  assert.equal(troisieme.depense, 0);
  assert.equal(quatrieme.depense, null); // demain
  assert.equal(deuxieme.inscrits, null); // compteurs non reliés
  assert.equal(deuxieme.lectures, null); // Wistia en erreur
  assert.equal(donnees.sources.meta.etat, 'ok');
  assert.equal(donnees.sources.wistia.etat, 'erreur');
  assert.equal(donnees.sources.iclosed.etat, 'a-brancher');
  assert.deepEqual(donnees.sources.compteurs.variables, ['KV_REST_API_URL', 'KV_REST_API_TOKEN']);
  // Sans base, les ventes ne peuvent pas s'enregistrer : elles restent vides, et la source le dit.
  assert.deepEqual([deuxieme.ventes, deuxieme.encaisse, deuxieme.contracte], [null, null, null]);
  assert.deepEqual([donnees.sources.ventes.etat, donnees.sources.ventes.manuel], ['a-brancher', true]);
  // Aucun secret dans ce qui part vers la page.
  assert.equal(/"x"|"y"/.test(JSON.stringify(donnees)), false);
});

test('assemblage : les ventes du registre, zéro les jours sans vente', async () => {
  const jours = 30;
  // Vente du 2 novembre : 3 000 €, dont 1 000 € en GoCardless le jour même et 2 000 € en seQura sur 6 mois.
  const vente = {
    date: '2026-11-02',
    formule: 'independant',
    montant: 3000,
    commission: 300,
    closer: 'c-1',
    closerNom: 'Camille',
    paiements: [
      { methode: 'gocardless', montant: 1000, mensualites: 1, debut: '2026-11-02' },
      { methode: 'sequra', montant: 2000, mensualites: 6, debut: '2026-11-02' },
    ],
  };
  const { demandes, fetchImpl } = fauxReseau((url, options) => {
    if (url.hostname !== 'base.test') return new Response('{}', { status: 500 });
    const commandes = JSON.parse(options.body);
    return commandes[0][0] === 'HGETALL'
      ? [{ result: ['v-00000001', JSON.stringify(vente), 'abimee', '{pas du json'] }, { result: ['c-1', JSON.stringify({ nom: 'Camille' })] }]
      : [{ result: Array(jours).fill(null) }, { result: Array(jours).fill(null) }, { result: Array(jours).fill(null) }, { result: [] }];
  });
  const donnees = await assemblerMois({
    mois: MOIS,
    env: { KV_REST_API_URL: 'https://base.test', KV_REST_API_TOKEN: 'jeton' },
    fetchImpl,
    maintenant: new Date('2026-11-03T12:00:00Z'),
  });
  const [premier, deuxieme, , quatrieme] = donnees.jours;
  assert.deepEqual([premier.ventes, premier.encaisse, premier.contracte], [0, 0, 0]);
  // Le 3 novembre : le dépôt (1 000 €) et les 70 % de seQura (1 400 €) sont encaissés.
  assert.deepEqual([deuxieme.ventes, deuxieme.encaisse, deuxieme.contracte], [1, 2400, 3000]);
  assert.equal(quatrieme.ventes, null); // demain
  assert.equal(deuxieme.appels, null); // iClosed non branché : les ventes s'enregistrent quand même
  assert.deepEqual([donnees.sources.ventes.etat, donnees.sources.compteurs.etat, donnees.sources.iclosed.etat], ['ok', 'ok', 'a-brancher']);
  assert.deepEqual(donnees.ventes.map((v) => [v.id, v.encaisse, v.reste]), [['v-00000001', 2400, 600]]);
  assert.equal(donnees.aEncaisser, 600);
  assert.deepEqual(donnees.closers, [{ id: 'c-1', nom: 'Camille' }]);
  assert.deepEqual(donnees.commissions, [{ closer: 'c-1', nom: 'Camille', ventes: 1, contracte: 3000, commission: 300 }]);
  assert.deepEqual(donnees.encaissements.filter((e) => e.total > 0).map((e) => [e.mois, e.total]), [['2026-11', 2400], ['2027-02', 300], ['2027-05', 300]]);
  assert.ok(demandes.some((d) => d.corps?.[0]?.[0] === 'HGETALL' && d.corps[0][1] === 'af:c1:ventes'));
});

test('landing : seules les vraies visites sont comptées', () => {
  const visite = (enTetes, methode = 'GET') => new Request('https://tunnel.test/inscription', { method: methode, headers: enTetes });
  const iphone = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Instagram 330.0';
  assert.equal(visiteACompter(visite({ 'user-agent': iphone, 'sec-fetch-dest': 'document' })), true);
  assert.equal(visiteACompter(visite({ 'user-agent': iphone })), true);
  assert.equal(visiteACompter(visite({ 'user-agent': iphone, 'sec-fetch-dest': 'image' })), false);
  assert.equal(visiteACompter(visite({ 'user-agent': iphone, 'sec-purpose': 'prefetch;prerender' })), false);
  assert.equal(visiteACompter(visite({ 'user-agent': iphone }, 'HEAD')), false);
  assert.equal(visiteACompter(visite({})), false);
  for (const robot of ['facebookexternalhit/1.1 (+http://www.facebook.com/externalhit_uatext.php)', 'WhatsApp/2.23.20.0', 'Mozilla/5.0 (compatible; Googlebot/2.1)', 'vercel-screenshot/1.0', 'curl/8.4.0']) {
    assert.equal(visiteACompter(visite({ 'user-agent': robot })), false, robot);
  }
});

test('inscription : comptée une fois, seulement quand elle est vraiment enregistrée', async () => {
  const SITE = 'https://tunnel.test';
  const demande = (corps) =>
    new Request(`${SITE}/api/lead`, {
      method: 'POST',
      headers: { origin: SITE, 'content-type': 'application/json', 'x-real-ip': '203.0.113.7' },
      body: JSON.stringify(corps),
    });
  const lead = { prenom: 'camille', email: 'camille@exemple.fr', delai: 5000, page: 'inscription/90-jours-plan' };
  const prod = { VERCEL_ENV: 'production', ACTIVECAMPAIGN_API_URL: 'https://compte.api-us1.com', ACTIVECAMPAIGN_API_KEY: 'cle' };
  const essai = async (env, statutAC, corps = lead, compter) => {
    const comptes = [];
    const reponse = await traiterLead(demande(corps), {
      env,
      fetchImpl: async () => new Response('{}', { status: statutAC }),
      journal: { warn() {}, error() {} },
      attente: async () => {},
      limiteur: creerLimiteur(),
      compter: compter ?? ((evenement, variante) => comptes.push([evenement, variante])),
    });
    return { statut: reponse.status, comptes };
  };
  assert.deepEqual(await essai(prod, 200), { statut: 200, comptes: [['inscrits', 'inscription/90-jours-plan']] });
  // ActiveCampaign en panne, preview (simulation), robot : rien n'est compté.
  assert.deepEqual(await essai(prod, 500), { statut: 502, comptes: [] });
  assert.deepEqual(await essai({ ...prod, VERCEL_ENV: 'preview' }, 200), { statut: 200, comptes: [] });
  assert.deepEqual(await essai(prod, 200, { ...lead, delai: 100 }), { statut: 200, comptes: [] });
  // Un compteur qui plante ne fait jamais échouer l'inscription.
  const plante = await essai(prod, 200, lead, () => {
    throw new Error('compteur en panne');
  });
  assert.equal(plante.statut, 200);
});

/* ---------- Les onglets Webinaire et Organique ---------- */

test('Meta, webinaire : ses campagnes, et ses inscriptions comptées comme dans le gestionnaire de publicités', async () => {
  oublierConversions();
  const env = { META_ACCESS_TOKEN: 'jeton-meta-de-test', META_AD_ACCOUNT_ID: 'act_123456789' };
  const lecture = { env, mois: MOIS, maintenant: APRES, filtre: filtreWebinaire(env), resultat: TUNNELS.webinaire.resultat };
  const { demandes, fetchImpl } = fauxReseau((url) => {
    if (url.pathname.endsWith('/customconversions')) return { data: [{ id: '998877665544', name: 'Lead_VSL' }, { id: '112233445566', name: 'lead_nuitfleuristes' }] };
    return {
      data: [
        { date_start: '2026-11-01', spend: '440', impressions: '33266', inline_link_clicks: '647', actions: [{ action_type: 'lead', value: '61' }, { action_type: 'offsite_conversion.custom.112233445566', value: '54' }] },
        { date_start: '2026-11-02', spend: '434', impressions: '43494', inline_link_clicks: '775', actions: [{ action_type: 'lead', value: '3' }] },
      ],
    };
  });
  const lu = await lireMeta({ ...lecture, fetchImpl });
  assert.deepEqual([lu.etat, lu.mesure], ['ok', 'resultat']);
  // Le résultat visé par les campagnes (« Lead_NuitFleuristes »), et non tous les prospects.
  assert.deepEqual(lu.jours['2026-11-01'], { depense: 440, impressions: 33266, clics: 647, inscrits: 54 });
  // Un jour sans ce résultat : zéro.
  assert.equal(lu.jours['2026-11-02'].inscrits, 0);
  const [conversions, insights] = demandes;
  assert.equal(conversions.url.pathname, '/v27.0/act_123456789/customconversions');
  assert.equal(conversions.options.headers.Authorization, 'Bearer jeton-meta-de-test');
  assert.deepEqual(JSON.parse(insights.url.searchParams.get('filtering')), [{ field: 'campaign.name', operator: 'CONTAIN', value: 'nuit des fleuristes' }]);
  assert.equal(insights.url.searchParams.get('fields'), 'spend,impressions,inline_link_clicks,actions,conversions');
  assert.equal(demandes.some((d) => d.url.href.includes('jeton-meta-de-test')), false);
  // Pour vérifier ce qui est compté : le total du mois de chaque type d'action rendu par Meta.
  assert.deepEqual(lu.typesVus, { lead: 64, 'offsite_conversion.custom.112233445566': 54 });
  // La conversion est retenue : la lecture suivante ne la redemande pas.
  await lireMeta({ ...lecture, fetchImpl });
  assert.equal(demandes.filter((d) => d.url.pathname.endsWith('/customconversions')).length, 1);

  // Le résultat est un événement personnalisé du pixel (et non une conversion personnalisée) : Meta le détaille
  // dans « conversions », sous son nom ; « actions » ne donne que le total de tous les événements personnalisés.
  oublierConversions();
  const evenement = fauxReseau((url) =>
    url.pathname.endsWith('/customconversions')
      ? { data: [] }
      : {
          data: [
            {
              date_start: '2026-11-01',
              spend: '440',
              impressions: '33266',
              inline_link_clicks: '647',
              actions: [{ action_type: 'offsite_conversion.fb_pixel_custom', value: '90' }, { action_type: 'lead', value: '2' }],
              conversions: [{ action_type: 'offsite_conversion.fb_pixel_custom.Lead_NuitFleuristes', value: '54' }, { action_type: 'offsite_conversion.fb_pixel_custom.Qualified', value: '9' }],
            },
            { date_start: '2026-11-02', spend: '434', impressions: '43494', inline_link_clicks: '775', conversions: [{ action_type: 'offsite_conversion.fb_pixel_custom.Lead_NuitFleuristes', value: '60' }] },
            { date_start: '2026-11-03', spend: '100', impressions: '9000', inline_link_clicks: '90', actions: [{ action_type: 'lead', value: '1' }] },
          ],
        },
  );
  const parNom = await lireMeta({ ...lecture, fetchImpl: evenement.fetchImpl });
  assert.deepEqual([parNom.mesure, parNom.jours['2026-11-01'].inscrits, parNom.jours['2026-11-02'].inscrits], ['resultat', 54, 60]);
  // La même mesure pour tout le mois : un jour sans ce résultat vaut zéro, il ne se rabat pas sur les prospects.
  assert.equal(parNom.jours['2026-11-03'].inscrits, 0);
  assert.equal(parNom.typesVus['offsite_conversion.fb_pixel_custom.Lead_NuitFleuristes'], 114);

  // Conversion introuvable, ou que Meta ne veut pas donner : les prospects attribués aux campagnes, et l'onglet le dit.
  oublierConversions();
  const sans = fauxReseau((url) =>
    url.pathname.endsWith('/customconversions')
      ? new Response(JSON.stringify({ error: { message: 'droit manquant' } }), { status: 403 })
      : { data: [{ date_start: '2026-11-01', spend: '440', impressions: '33266', inline_link_clicks: '647', actions: [{ action_type: 'offsite_conversion.fb_pixel_lead', value: '58' }] }] },
  );
  const repli = await lireMeta({ ...lecture, fetchImpl: sans.fetchImpl });
  assert.deepEqual([repli.etat, repli.mesure, repli.jours['2026-11-01'].inscrits], ['ok', 'prospects', 58]);

  // Le texte des campagnes du webinaire se règle, mais ne se vide jamais (l'onglet ne doit pas compter tout le compte).
  assert.equal(filtreWebinaire({}), 'nuit des fleuristes');
  assert.equal(filtreWebinaire({ META_CAMPAGNES_WEBINAIRE: '  WEBINAIRE ' }), 'WEBINAIRE');
  assert.equal(filtreWebinaire({ META_CAMPAGNES_WEBINAIRE: '   ' }), 'nuit des fleuristes');
  oublierConversions();
});

/** Les events du compte, tels qu'iClosed les liste. */
const EVENTS = [
  { id: 12, linkPrefix: 'academie-florale/candidature-vsl' },
  { id: 71, linkPrefix: 'academie-florale/candidature' },
  { id: 72, linkPrefix: 'academie-florale/setting' },
  { id: 73, linkPrefix: 'academie-florale/candidature-site' },
  { id: 74, linkPrefix: 'academie-florale/candidature-dm' },
  { id: 75, linkPrefix: 'academie-florale/candidature-yt' },
];

/** iClosed de test : chaque event rend ses propres appels. */
const iclosedParEvent = (parEvent, events = EVENTS) => (url) => {
  if (url.pathname === '/v1/events') return { data: events };
  if (url.pathname === '/v1/eventCalls') {
    const liste = parEvent[url.searchParams.get('eventIds')] ?? [];
    return { data: { count: liste.length, eventCalls: liste } };
  }
  return new Response('{}', { status: 404 });
};

test('iClosed, autres tunnels : les appels de plusieurs events, jour par jour et source par source', async () => {
  oublierEvents();
  const { demandes, fetchImpl } = fauxReseau(
    iclosedParEvent({
      74: [appel(1, '2026-11-03T09:10:00.000Z', '2026-11-05T17:00:00.000Z'), appel(2, '2026-11-04T10:00:00.000Z', '2026-11-06T09:00:00.000Z', { cancelledBy: 'INVITEE' })],
      75: [appel(3, '2026-11-03T12:00:00.000Z', '2026-11-07T09:00:00.000Z', { task: [{ outcome: 'NO_SALE', noSaleReason: 'NO_SHOW' }] })],
    }),
  );
  const sources = [
    { event: 'candidature-dm', nom: 'Setting DM' },
    { event: 'candidature-yt', nom: 'YouTube' },
  ];
  const env = { ICLOSED_API_KEY: 'iclosed_cle-de-test' };
  const lu = await lireIclosed({ env, mois: MOIS, fetchImpl, maintenant: APRES, events: sources });
  assert.equal(lu.etat, 'ok', lu.detail);
  assert.deepEqual(lu.jours['2026-11-03'], { appels: 2, annules: 0, absentes: 0 });
  assert.deepEqual(lu.jours['2026-11-04'], { appels: 1, annules: 0, absentes: 0 });
  assert.equal(lu.jours['2026-11-06'].annules, 1);
  assert.equal(lu.jours['2026-11-07'].absentes, 1);
  assert.deepEqual(lu.parEvent, [
    { event: 'candidature-dm', nom: 'Setting DM', appels: 2, annules: 1, absentes: 0 },
    { event: 'candidature-yt', nom: 'YouTube', appels: 1, annules: 0, absentes: 1 },
  ]);
  // La liste des events une fois, puis deux demandes par event (réservés, prévus) ; jamais l'event du tunnel VSL.
  const appels = demandes.filter((d) => d.url.pathname === '/v1/eventCalls');
  assert.equal(demandes.filter((d) => d.url.pathname === '/v1/events').length, 1);
  assert.deepEqual(appels.map((d) => d.url.searchParams.get('eventIds')).sort(), ['74', '74', '75', '75']);
  assert.equal(JSON.stringify(lu).includes('camille'), false);

  // Un event introuvable : l'onglet le dit, plutôt que d'afficher des chiffres incomplets.
  oublierEvents();
  const manque = await lireIclosed({ env, mois: MOIS, fetchImpl, maintenant: APRES, events: [...sources, { event: 'evenement-disparu', nom: 'Disparu' }] });
  assert.deepEqual([manque.etat, manque.detail], ['erreur', 'event « evenement-disparu » introuvable dans iClosed']);
  oublierEvents();
});

test('assemblage, onglets Webinaire et Organique : leurs sources seulement, et les ventes de leur tunnel', async () => {
  oublierEvents();
  oublierConversions();
  const vente = (montant, tunnel) => ({
    date: '2026-11-02',
    formule: 'independant',
    montant,
    commission: montant / 10,
    closer: 'c-1',
    closerNom: 'Camille',
    ...(tunnel ? { tunnel } : {}),
    paiements: [{ methode: 'virement', montant, mensualites: 1, debut: '2026-11-02' }],
  });
  const iclosed = iclosedParEvent({
    71: [appel(1, '2026-11-02T09:00:00.000Z', '2026-11-04T17:00:00.000Z')],
    74: [appel(2, '2026-11-02T10:00:00.000Z', '2026-11-05T17:00:00.000Z')],
    73: [appel(3, '2026-11-01T10:00:00.000Z', '2026-11-02T17:00:00.000Z', { cancelledBy: 'INVITEE' })],
    12: [appel(4, '2026-11-02T11:00:00.000Z', '2026-11-06T17:00:00.000Z')],
  });
  const { demandes, fetchImpl } = fauxReseau((url, options) => {
    if (url.hostname === 'base.test') {
      const commandes = JSON.parse(options.body);
      return commandes[0][0] === 'HGETALL'
        ? [
            // La première vente date d'avant les onglets : sans tunnel, elle vient du tunnel VSL.
            { result: ['v-00000001', JSON.stringify(vente(3000)), 'v-00000002', JSON.stringify(vente(1800, 'webinaire')), 'v-00000003', JSON.stringify(vente(4000, 'organique'))] },
            { result: ['c-1', JSON.stringify({ nom: 'Camille' })] },
          ]
        : commandes.map(() => ({ result: null }));
    }
    if (url.hostname === 'graph.facebook.com') {
      if (url.pathname.endsWith('/customconversions')) return { data: [] };
      return { data: [{ date_start: '2026-11-02', spend: '500', impressions: '40000', inline_link_clicks: '700', actions: [{ action_type: 'lead', value: '60' }] }] };
    }
    if (url.hostname === 'public.api.iclosed.io') return iclosed(url);
    return new Response('{}', { status: 500 });
  });
  const env = { META_ACCESS_TOKEN: 'x', META_AD_ACCOUNT_ID: '123456789', ICLOSED_API_KEY: 'y', KV_REST_API_URL: 'https://base.test', KV_REST_API_TOKEN: 'z', VERCEL_ENV: 'production' };
  const maintenant = new Date('2026-11-03T12:00:00Z');

  // Le webinaire sans sa pause : c'est sa reprise qui se vérifie ici (la pause a son test, plus bas).
  const webinaire = await assemblerMois({ mois: MOIS, tunnel: 'webinaire', env, fetchImpl, maintenant, pause: null });
  assert.deepEqual([webinaire.tunnel, webinaire.enLigne, webinaire.pause], ['webinaire', true, null]);
  assert.deepEqual(Object.keys(webinaire.sources), ['meta', 'iclosed', 'ventes']);
  assert.deepEqual(Object.values(webinaire.sources).map((source) => source.etat), ['ok', 'ok', 'ok']);
  const [, leDeux, leTrois, leQuatre] = webinaire.jours;
  assert.deepEqual([leDeux.depense, leDeux.clics, leDeux.inscrits, leDeux.appels, leDeux.ventes, leDeux.contracte], [500, 700, 60, 1, 1, 1800]);
  // Ni landing ni vidéo sur ce site pour le webinaire : des tirets, pas des zéros.
  assert.deepEqual([leDeux.vues, leDeux.chargements, leDeux.lectures], [null, null, null]);
  assert.deepEqual([leTrois.depense, leTrois.inscrits, leTrois.appels], [0, 0, 0]);
  assert.equal(leQuatre.depense, null); // demain
  assert.deepEqual([webinaire.campagnes, webinaire.mesureInscrits, webinaire.resultat], ['nuit des fleuristes', 'prospects', 'Lead_NuitFleuristes']);
  assert.deepEqual(webinaire.ventes.map((v) => [v.id, v.tunnel]), [['v-00000002', 'webinaire']]);
  // Les commissions et la caisse : toutes les ventes, quel que soit le tunnel.
  assert.deepEqual(webinaire.commissions, [{ closer: 'c-1', nom: 'Camille', ventes: 3, contracte: 8800, commission: 880 }]);
  assert.equal(webinaire.encaissements[0].total, 8800);
  assert.deepEqual([webinaire.suivi, webinaire.notes, webinaire.variantes], [undefined, {}, []]);
  const insights = demandes.find((d) => d.url.pathname.endsWith('/insights'));
  assert.deepEqual(JSON.parse(insights.url.searchParams.get('filtering')), [{ field: 'campaign.name', operator: 'CONTAIN', value: 'nuit des fleuristes' }]);

  const avant = demandes.length;
  const organique = await assemblerMois({ mois: MOIS, tunnel: 'organique', env, fetchImpl, maintenant });
  assert.deepEqual([Object.keys(organique.sources), organique.pause], [['iclosed', 'ventes'], null]);
  const [premier, second] = organique.jours;
  // Le 1er : un appel réservé sur le site ; le 2 : un appel par messages privés, et l'annulation de celui du site.
  assert.deepEqual([premier.appels, second.appels, second.annules, second.ventes, second.contracte], [1, 1, 1, 1, 4000]);
  assert.deepEqual([second.depense, second.inscrits], [null, null]);
  assert.deepEqual(organique.parSource, [
    { event: 'candidature-dm', nom: 'Setting DM', appels: 1, annules: 0, absentes: 0 },
    { event: 'candidature-yt', nom: 'YouTube', appels: 0, annules: 0, absentes: 0 },
    { event: 'setting', nom: 'Setting call', appels: 0, annules: 0, absentes: 0 },
    { event: 'candidature-site', nom: 'Site internet', appels: 1, annules: 1, absentes: 0 },
  ]);
  assert.deepEqual(organique.ventes.map((v) => v.id), ['v-00000003']);
  // Sans publicité, Meta n'est pas interrogé.
  assert.equal(demandes.slice(avant).some((d) => d.url.hostname === 'graph.facebook.com'), false);

  // Un onglet inconnu : celui du tunnel VSL, avec la vente d'avant les onglets.
  const defaut = await assemblerMois({ mois: MOIS, tunnel: 'salon', env, fetchImpl, maintenant });
  assert.equal(defaut.tunnel, 'vsl');
  assert.deepEqual(Object.keys(defaut.sources), ['meta', 'compteurs', 'wistia', 'iclosed', 'ventes']);
  assert.deepEqual(defaut.ventes.map((v) => [v.id, v.tunnel]), [['v-00000001', 'vsl']]);
  assert.equal(defaut.jours[1].appels, 1);
  // Aucun secret dans ce qui part vers la page.
  assert.equal(/"x"|"y"|"z"/.test(JSON.stringify([webinaire, organique, defaut])), false);
  oublierEvents();
  oublierConversions();
});

test('webinaire en pause : ses chiffres à zéro, ni Meta ni iClosed interrogés, ses ventes gardées', async () => {
  oublierEvents();
  oublierConversions();
  // La pause se règle à un seul endroit ; les autres tunnels n'en ont pas.
  assert.deepEqual([pauseDe('webinaire'), pauseDe('vsl'), pauseDe('organique')], [{ reprise: 'janvier 2027' }, null, null]);
  const vente = (montant, tunnel) => ({
    date: '2026-11-02',
    formule: 'independant',
    montant,
    commission: montant / 10,
    closer: 'c-1',
    closerNom: 'Camille',
    tunnel,
    paiements: [{ methode: 'virement', montant, mensualites: 1, debut: '2026-11-02' }],
  });
  const { demandes, fetchImpl } = fauxReseau((url, options) => {
    if (url.hostname === 'base.test') {
      const commandes = JSON.parse(options.body);
      return commandes[0][0] === 'HGETALL'
        ? [{ result: ['v-00000001', JSON.stringify(vente(3000, 'vsl')), 'v-00000002', JSON.stringify(vente(1800, 'webinaire'))] }, { result: ['c-1', JSON.stringify({ nom: 'Camille' })] }]
        : commandes.map(() => ({ result: null }));
    }
    // Meta et iClosed répondraient de vrais chiffres : en pause, personne ne leur demande rien.
    if (url.hostname === 'graph.facebook.com') return { data: [{ date_start: '2026-11-02', spend: '500', impressions: '40000', inline_link_clicks: '700', actions: [{ action_type: 'lead', value: '60' }] }] };
    if (url.hostname === 'public.api.iclosed.io') return iclosedParEvent({ 71: [appel(1, '2026-11-02T09:00:00.000Z', '2026-11-04T17:00:00.000Z')] })(url);
    return new Response('{}', { status: 500 });
  });
  const env = { META_ACCESS_TOKEN: 'x', META_AD_ACCOUNT_ID: '123456789', ICLOSED_API_KEY: 'y', KV_REST_API_URL: 'https://base.test', KV_REST_API_TOKEN: 'z', VERCEL_ENV: 'production' };
  const maintenant = new Date('2026-11-03T12:00:00Z');

  const webinaire = await assemblerMois({ mois: MOIS, tunnel: 'webinaire', env, fetchImpl, maintenant });
  assert.deepEqual([webinaire.tunnel, webinaire.pause], ['webinaire', { reprise: 'janvier 2027' }]);
  assert.deepEqual(demandes.map((d) => d.url.hostname), ['base.test']);
  assert.deepEqual(Object.fromEntries(Object.entries(webinaire.sources).map(([cle, source]) => [cle, source.etat])), { meta: 'pause', iclosed: 'pause', ventes: 'ok' });
  const [premier, leDeux, leTrois, leQuatre] = webinaire.jours;
  // Zéro chaque jour passé, pas un tiret : l'onglet est « à 0 ». Les jours à venir restent vides.
  for (const jour of [premier, leDeux, leTrois]) {
    assert.deepEqual([jour.depense, jour.impressions, jour.clics, jour.inscrits, jour.appels, jour.annules, jour.absentes], [0, 0, 0, 0, 0, 0, 0]);
  }
  assert.deepEqual([leQuatre.depense, leQuatre.appels, leQuatre.ventes], [null, null, null]);
  // Ni landing ni vidéo pour le webinaire, en pause ou non.
  assert.deepEqual([leDeux.vues, leDeux.lectures], [null, null]);
  // Les ventes s'enregistrent à la main : celle du webinaire reste à sa place, celle du tunnel VSL n'y vient pas.
  assert.deepEqual([leDeux.ventes, leDeux.contracte, premier.ventes], [1, 1800, 0]);
  assert.deepEqual(webinaire.ventes.map((v) => [v.id, v.tunnel]), [['v-00000002', 'webinaire']]);
  assert.deepEqual(webinaire.commissions, [{ closer: 'c-1', nom: 'Camille', ventes: 2, contracte: 4800, commission: 480 }]);
  assert.deepEqual([webinaire.mesureInscrits, webinaire.typesMeta, webinaire.parSource], [null, {}, []]);

  // Un mois passé reste à zéro lui aussi : la pause vaut pour tout l'onglet.
  const octobre = await assemblerMois({ mois: '2026-10', tunnel: 'webinaire', env, fetchImpl, maintenant });
  assert.equal(octobre.jours.length, 31);
  assert.equal(octobre.jours.every((jour) => jour.depense === 0 && jour.inscrits === 0 && jour.appels === 0 && jour.ventes === 0), true);
  assert.equal(demandes.some((d) => d.url.hostname !== 'base.test'), false);

  // La pause ne touche ni l'onglet du tunnel VSL ni l'organique : leurs sources sont lues.
  const organique = await assemblerMois({ mois: MOIS, tunnel: 'organique', env, fetchImpl, maintenant });
  assert.deepEqual([organique.pause, organique.sources.iclosed.etat], [null, 'ok']);
  assert.equal(demandes.some((d) => d.url.hostname === 'public.api.iclosed.io'), true);
  oublierEvents();
  oublierConversions();
});
