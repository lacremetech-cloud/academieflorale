import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compter, lireCompteurs, nomDeVariante } from '../partage/compteurs.js';
import { visiteACompter } from '../partage/visites.js';
import { assemblerMois } from '../serveur/cockpit/donnees.js';
import { lireIclosed } from '../serveur/cockpit/iclosed.js';
import { lireMeta } from '../serveur/cockpit/meta.js';
import { lireWistia } from '../serveur/cockpit/wistia.js';
import { creerLimiteur, traiterLead } from '../serveur/lead.js';

const MOIS = '2026-11';

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
  const env = { META_ACCESS_TOKEN: 'jeton-meta-de-test', META_AD_ACCOUNT_ID: 'act_123456789', META_CAMPAGNES: 'VSL' };
  const lu = await lireMeta({ env, mois: MOIS, fetchImpl });
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

test('Meta : non branché sans variables, erreur lisible si Meta refuse', async () => {
  assert.equal((await lireMeta({ env: {}, mois: MOIS })).etat, 'a-brancher');
  assert.equal((await lireMeta({ env: { META_ACCESS_TOKEN: 'x', META_AD_ACCOUNT_ID: 'compte' }, mois: MOIS })).etat, 'erreur');

  const refus = fauxReseau(() => new Response(JSON.stringify({ error: { message: 'Error validating access token: Session has expired', code: 190 } }), { status: 400 }));
  const lu = await lireMeta({ env: { META_ACCESS_TOKEN: 'jeton-secret', META_AD_ACCOUNT_ID: '123456789' }, mois: MOIS, fetchImpl: refus.fetchImpl });
  assert.equal(lu.etat, 'erreur');
  assert.match(lu.detail, /Meta a répondu 400 : Error validating access token/);
  assert.equal(lu.detail.includes('jeton-secret'), false);
  assert.equal(refus.demandes[0].url.searchParams.has('filtering'), false);

  const panne = await lireMeta({
    env: { META_ACCESS_TOKEN: 'x', META_AD_ACCOUNT_ID: '123456789' },
    mois: MOIS,
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
  const lu = await lireWistia({ env: { WISTIA_API_TOKEN: 'jeton-wistia' }, mois: MOIS, fetchImpl });
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

test('iClosed : appels réservés, annulés, absentes et ventes de l’event du tunnel', async () => {
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
    if (url.pathname === '/v1/deals') {
      return { data: { count: 2, deals: [{ id: 1, value: 3800, time: '2026-11-05 17:45:00.000', transactionType: 'WON' }, { id: 2, value: '3000', time: '2026-11-20 10:00:00.000' }] } };
    }
    return new Response('{}', { status: 404 });
  });

  const lu = await lireIclosed({ env: { ICLOSED_API_KEY: 'iclosed_cle-de-test' }, mois: MOIS, fetchImpl });
  assert.equal(lu.etat, 'ok', lu.detail);
  assert.equal(lu.jours['2026-11-03'].appels, 2);
  assert.equal(lu.jours['2026-11-04'].appels, 1);
  assert.equal(lu.jours['2026-10-31'], undefined);
  assert.equal(lu.jours['2026-11-06'].annules, 1);
  assert.equal(lu.jours['2026-11-02'].annules, 1);
  assert.equal(lu.jours['2026-11-07'].absentes, 1);
  assert.deepEqual([lu.jours['2026-11-05'].ventes, lu.jours['2026-11-05'].contracte], [1, 3800]);
  assert.deepEqual([lu.jours['2026-11-20'].ventes, lu.jours['2026-11-20'].contracte], [1, 3000]);
  // Aucune donnée personnelle ne sort de la lecture.
  assert.equal(JSON.stringify(lu).includes('camille'), false);

  const appels = demandes.filter((d) => d.url.pathname === '/v1/eventCalls');
  assert.equal(appels[0].url.searchParams.get('eventIds'), '12');
  assert.equal(appels[0].url.searchParams.get('createdAtStart'), '2026-10-31T00:00:00.000Z');
  assert.equal(appels[0].url.searchParams.get('createdAtEnd'), '2026-12-01T23:59:59.999Z');
  assert.equal(appels[1].url.searchParams.get('dateFrom'), '2026-10-31T00:00:00.000Z');
  assert.equal(demandes[0].options.headers.Authorization, 'Bearer iclosed_cle-de-test');
  assert.equal(demandes.find((d) => d.url.pathname === '/v1/deals').url.searchParams.get('eventIds'), '12');
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
  // Aucun secret dans ce qui part vers la page.
  assert.equal(/"x"|"y"/.test(JSON.stringify(donnees)), false);
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
