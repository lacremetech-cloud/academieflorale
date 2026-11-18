import assert from 'node:assert/strict';
import { test } from 'node:test';
import fonction from '../api/booking.js';
import { construireContactRdv, synchroniserRdv, traiterRdv } from '../serveur/booking.js';
import { empreinteEmail } from '../serveur/empreinte.js';
import { enregistrerInscription } from '../serveur/suivi.js';
import { AC, fauxIclosed, fauxJournal, fauxMonde, PROD } from './faux.js';

const MAINTENANT = new Date('2026-11-18T19:30:00Z');
const PLUS_TARD = new Date('2026-11-18T19:40:00Z');
const VERROU = 'af:c1:verrou:rdv';

/** Un appel tel que l'API d'iClosed le rend (dates sans fuseau, en UTC). */
function appel(modifs = {}) {
  return {
    id: 501,
    eventId: 77,
    createdAt: '2026-11-18 18:05:00.000',
    updatedAt: '2026-11-18 18:05:00.000',
    dateTimeUTC: '2026-11-20T17:00:00.000Z',
    inviteeEmail: 'Camille@Exemple.fr',
    inviteeName: 'Camille Martin',
    phoneNumber: '+33639980101',
    cancelledBy: null,
    cancelReason: null,
    task: [],
    utm: [{ utmKey: 'utm_content', utmValue: 'P02 H1' }],
    event: { name: 'Appel de Candidature [VSL]', linkPrefix: 'academie-florale/candidature-vsl' },
    ...modifs,
  };
}

/** Un monde où iClosed rend ces appels, ActiveCampaign et Meta acceptent tout. */
function monde(appels, { ac = () => ({}), meta = () => ({ events_received: 1 }) } = {}) {
  const etat = { appels };
  const m = fauxMonde({ iclosed: fauxIclosed(() => etat.appels), activecampaign: ac, meta });
  const { journal, lignes } = fauxJournal();
  return { ...m, etat, lignes, ctx: { env: PROD, fetchImpl: m.fetchImpl, journal, attente: async () => {} } };
}

/** L'inscription de Camille, une heure avant sa réservation, avec son accord. */
async function inscrire(m, accord = true) {
  await enregistrerInscription(
    PROD,
    {
      email: 'camille@exemple.fr',
      variante: 'inscription/90-jours',
      utm: { utm_id: '120212345678901234', fbclid: 'IwAR0abcDEF_123-xyz' },
      accord,
      contexte: { ip: '203.0.113.7', ua: 'Navigateur de test' },
    },
    { fetchImpl: m.fetchImpl, maintenant: new Date('2026-11-18T17:00:00Z') },
  );
}

test('la fonction Vercel expose bien un gestionnaire fetch', () => {
  assert.equal(typeof fonction.fetch, 'function');
});

test('fiche ActiveCampaign : tag et champs à la réservation, tag seul à l’annulation', () => {
  assert.deepEqual(construireContactRdv({ email: 'a@b.fr', nomEvent: 'Appel de Candidature [VSL]' }), {
    email: 'a@b.fr',
    fieldValues: [
      { field: '3', value: 'VSL' },
      { field: '10', value: 'Appel de Candidature [VSL]' },
    ],
    tags: ['vsl-rdv'],
  });
  assert.deepEqual(construireContactRdv({ email: 'a@b.fr', annule: true }), { email: 'a@b.fr', tags: ['vsl-rdv-annule'] });
});

test('nouvelle réservation : ActiveCampaign, puis Meta, puis la base ; jamais deux fois', async () => {
  const m = monde([appel()]);
  await inscrire(m);
  const resultat = await synchroniserRdv({ ...m.ctx, maintenant: MAINTENANT });
  assert.deepEqual(resultat, { etat: 'ok', vus: 1, nouveaux: 1, annules: 0, echecs: 0, simulation: false });

  // iClosed : l'event du tunnel, ses appels récents et ses appels modifiés, avec la clé en en-tête.
  const versIclosed = m.vers('iclosed');
  assert.deepEqual(versIclosed.map((d) => d.url.pathname), ['/v1/events', '/v1/eventCalls', '/v1/eventCalls']);
  assert.equal(versIclosed[1].url.searchParams.get('eventIds'), '77');
  assert.equal(versIclosed[1].url.searchParams.get('createdAtStart'), '2026-11-15T19:30:00.000Z');
  assert.equal(versIclosed[1].options.headers.Authorization, 'Bearer cle-iclosed-de-test');

  // ActiveCampaign : la fiche retrouvée par l'email, le tag et les deux champs.
  const [versAC] = m.vers('activecampaign');
  assert.equal(versAC.url.href, `${AC}/api/3/contact/sync`);
  assert.deepEqual(versAC.corps, { contact: construireContactRdv({ email: 'camille@exemple.fr', nomEvent: 'Appel de Candidature [VSL]' }) });

  // Meta : « Rendez-vous programmé », daté de la réservation, avec le clic et le navigateur de l'inscription.
  const [versMeta] = m.vers('meta');
  const [evenement] = versMeta.corps.data;
  assert.equal(evenement.event_name, 'Schedule');
  assert.equal(evenement.event_id, 'rdv-501');
  assert.equal(evenement.event_time, Date.parse('2026-11-18T18:05:00Z') / 1000);
  assert.equal(evenement.action_source, 'website');
  assert.equal(evenement.event_source_url, 'https://decouvrir.academie-florale.fr/call');
  assert.deepEqual(evenement.user_data.em, [empreinteEmail('camille@exemple.fr')]);
  assert.equal(evenement.user_data.client_user_agent, 'Navigateur de test');
  assert.match(evenement.user_data.fbc, /^fb\.1\.\d+\.IwAR0abcDEF_123-xyz$/);

  // La base : l'appel, sa publicité d'arrivée (celle de l'inscription), sans email.
  const [fiche] = await m.commandes(['HGET', 'af:c1:rdv:2026-11', '501']);
  assert.deepEqual(JSON.parse(fiche), {
    etat: 'reserve',
    t: Date.parse('2026-11-18T18:05:00Z'),
    jour: '2026-11-18',
    h: empreinteEmail('camille@exemple.fr'),
    pub: 'id:120212345678901234',
    delai: 0,
    ac: 1,
    meta: 1,
  });
  assert.equal(/camille|exemple/i.test(fiche), false);

  // Dix minutes plus tard : rien n'est renvoyé.
  await m.commandes(['DEL', VERROU]);
  const second = await synchroniserRdv({ ...m.ctx, maintenant: PLUS_TARD });
  assert.deepEqual(second, { etat: 'ok', vus: 1, nouveaux: 0, annules: 0, echecs: 0, simulation: false });
  assert.equal(m.vers('activecampaign').length, 1);
  assert.equal(m.vers('meta').length, 1);
  assert.equal(JSON.stringify(m.lignes).includes('exemple'), false);
});

test('sans accord, ou sans inscription connue : ActiveCampaign oui, Meta non', async () => {
  const m = monde([appel(), appel({ id: 502, inviteeEmail: 'lea@exemple.fr' })]);
  await inscrire(m, false);
  await synchroniserRdv({ ...m.ctx, maintenant: MAINTENANT });
  assert.equal(m.vers('activecampaign').length, 2);
  assert.equal(m.vers('meta').length, 0);
  const [camille, lea] = (await m.commandes(['HGET', 'af:c1:rdv:2026-11', '501'], ['HGET', 'af:c1:rdv:2026-11', '502'])).map((f) => JSON.parse(f));
  assert.equal(camille.meta, -1);
  // Léa n'est pas passée par la landing : sa publicité vient des paramètres gardés par iClosed.
  assert.deepEqual({ pub: lea.pub, delai: lea.delai, meta: lea.meta }, { pub: 'nom:p02 h1', delai: null, meta: -1 });
});

test('annulation : le tag d’annulation, une seule fois', async () => {
  const m = monde([appel()]);
  await synchroniserRdv({ ...m.ctx, maintenant: MAINTENANT });
  m.etat.appels = [appel({ cancelledBy: 'INVITEE', updatedAt: '2026-11-18 19:35:00.000' })];
  await m.commandes(['DEL', VERROU]);
  const resultat = await synchroniserRdv({ ...m.ctx, maintenant: PLUS_TARD });
  assert.deepEqual({ nouveaux: resultat.nouveaux, annules: resultat.annules }, { nouveaux: 0, annules: 1 });
  assert.deepEqual(m.vers('activecampaign')[1].corps, { contact: { email: 'camille@exemple.fr', tags: ['vsl-rdv-annule'] } });
  assert.equal(JSON.parse((await m.commandes(['HGET', 'af:c1:rdv:2026-11', '501']))[0]).etat, 'annule');

  await m.commandes(['DEL', VERROU]);
  await synchroniserRdv({ ...m.ctx, maintenant: new Date('2026-11-18T19:50:00Z') });
  assert.equal(m.vers('activecampaign').length, 2);
});

test('un appel annulé avant d’avoir été vu ne déclenche rien', async () => {
  const m = monde([appel({ task: [{ noSaleReason: 'CONTACT_CANCELLED' }] })]);
  const resultat = await synchroniserRdv({ ...m.ctx, maintenant: MAINTENANT });
  assert.deepEqual({ nouveaux: resultat.nouveaux, annules: resultat.annules }, { nouveaux: 0, annules: 1 });
  assert.equal(m.vers('activecampaign').length, 0);
  assert.equal(m.vers('meta').length, 0);
});

test('ni les appels d’avant le suivi, ni ceux qui n’ont pas bougé depuis trois jours', async () => {
  const m = monde([
    appel({ id: 1, createdAt: '2026-11-10 10:00:00.000', updatedAt: '2026-11-18 19:00:00.000' }),
    appel({ id: 2, createdAt: '2026-11-18 01:00:00.000', updatedAt: '2026-11-18 01:00:00.000' }),
    appel({ id: 3, createdAt: 'illisible' }),
  ]);
  const tard = new Date('2026-11-22T12:00:00Z');
  const resultat = await synchroniserRdv({ ...m.ctx, maintenant: tard });
  assert.deepEqual({ vus: resultat.vus, nouveaux: resultat.nouveaux }, { vus: 0, nouveaux: 0 });
  assert.equal(m.vers('activecampaign').length, 0);
});

test('ActiveCampaign en panne : l’appel est repris au passage suivant, Meta n’est pas renvoyé', async () => {
  let panne = true;
  const m = monde([appel()], { ac: () => (panne ? new Response('{}', { status: 500 }) : {}) });
  await inscrire(m);
  const premier = await synchroniserRdv({ ...m.ctx, maintenant: MAINTENANT });
  assert.equal(premier.echecs, 1);
  assert.deepEqual(m.lignes, [['booking : échec ActiveCampaign', { statut: 500, motif: 'refus' }]]);
  const avant = JSON.parse((await m.commandes(['HGET', 'af:c1:rdv:2026-11', '501']))[0]);
  assert.deepEqual({ ac: avant.ac, meta: avant.meta }, { ac: 0, meta: 1 });

  panne = false;
  await m.commandes(['DEL', VERROU]);
  const second = await synchroniserRdv({ ...m.ctx, maintenant: PLUS_TARD });
  assert.deepEqual({ nouveaux: second.nouveaux, echecs: second.echecs }, { nouveaux: 0, echecs: 0 });
  assert.equal(JSON.parse((await m.commandes(['HGET', 'af:c1:rdv:2026-11', '501']))[0]).ac, 1);
  assert.equal(m.vers('meta').length, 1);
});

test('hors production : rien n’est retenu ni envoyé à Meta ; ActiveCampaign seulement pour l’adresse de test', async () => {
  const m = monde([appel(), appel({ id: 502, inviteeEmail: 'test@exemple.fr' })]);
  const env = { ...PROD, VERCEL_ENV: 'preview', LEAD_TEST_EMAIL: 'Test@Exemple.fr' };
  const resultat = await synchroniserRdv({ ...m.ctx, env, maintenant: MAINTENANT });
  assert.deepEqual(resultat, { etat: 'ok', vus: 2, nouveaux: 2, annules: 0, echecs: 0, simulation: true });
  assert.deepEqual(m.vers('activecampaign').map((d) => d.corps.contact.email), ['test@exemple.fr']);
  assert.equal(m.vers('meta').length, 0);
  assert.deepEqual(await m.commandes(['HGET', 'af:c1:rdv:2026-11', '501'], ['GET', VERROU], ['HGET', 'af:c1:etat', 'rdv']), [null, null, null]);
});

test('branchements : sans clé iClosed ou sans base, rien ne se lance ; deux passages ne se croisent pas', async () => {
  assert.deepEqual(await synchroniserRdv({ env: { VERCEL_ENV: 'production' } }), { etat: 'a-brancher' });
  const { KV_REST_API_URL: _, ...sansBase } = PROD;
  assert.deepEqual(await synchroniserRdv({ env: sansBase }), { etat: 'a-brancher' });

  const m = monde([appel()]);
  await m.commandes(['SET', VERROU, '1']);
  assert.deepEqual(await synchroniserRdv({ ...m.ctx, maintenant: MAINTENANT }), { etat: 'occupe' });
  assert.equal(m.vers('iclosed').length, 0);

  const refus = fauxMonde({ iclosed: () => new Response(JSON.stringify({ message: 'Unauthorized' }), { status: 401 }) });
  const { journal, lignes } = fauxJournal();
  assert.deepEqual(await synchroniserRdv({ env: PROD, fetchImpl: refus.fetchImpl, journal, maintenant: MAINTENANT }), { etat: 'erreur' });
  assert.deepEqual(lignes, [['booking : lecture d’iClosed impossible', { motif: 'refus' }]]);
});

test('/api/booking : un simple signal, dont le contenu est ignoré et la réponse muette', async () => {
  const m = monde([appel()]);
  const signal = (methode, corps) => new Request('https://tunnel.test/api/booking', { method: methode, body: corps });

  const refus = await traiterRdv(signal('PUT', '{}'), m.ctx);
  assert.equal(refus.status, 405);
  assert.equal(refus.headers.get('allow'), 'GET, POST');

  // Un webhook d'iClosed, la page merci call ou n'importe qui : même effet, aucun détail rendu.
  const reponse = await traiterRdv(signal('POST', '{"invitee":{"email":"pirate@exemple.fr"},"hookType":"Call booked"}'), { ...m.ctx, maintenant: MAINTENANT });
  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { ok: true });
  assert.deepEqual(m.vers('activecampaign').map((d) => d.corps.contact.email), ['camille@exemple.fr']);

  // Vercel appelle la même adresse en GET, toutes les dix minutes : pendant le verrou, rien ne se passe.
  const cron = await traiterRdv(signal('GET'), { ...m.ctx, maintenant: PLUS_TARD });
  assert.equal(cron.status, 200);
  assert.equal(m.vers('activecampaign').length, 1);

  assert.equal((await traiterRdv(signal('POST', ''), { env: {} })).status, 503);
  const panne = fauxMonde({ iclosed: () => new Response('{}', { status: 500 }) });
  assert.equal((await traiterRdv(signal('GET'), { env: PROD, fetchImpl: panne.fetchImpl, journal: fauxJournal().journal })).status, 502);
});
