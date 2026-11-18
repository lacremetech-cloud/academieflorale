import assert from 'node:assert/strict';
import { test } from 'node:test';
import { COOKIE, creerSession } from '../serveur/cockpit/acces.js';
import { suivreVente } from '../serveur/cockpit/suivi-vente.js';
import { traiterVente } from '../serveur/cockpit/ventes.js';
import { empreinteEmail } from '../serveur/empreinte.js';
import { enregistrerInscription } from '../serveur/suivi.js';
import { AC, fauxJournal, fauxMonde, PROD } from './faux.js';

const SITE = 'https://tunnel.test';
const MOT_DE_PASSE = 'essai-du-cockpit-42';
const ENV = { ...PROD, COCKPIT_MOT_DE_PASSE: MOT_DE_PASSE };
const MAINTENANT = new Date('2026-11-18T10:00:00Z');
const cookie = `${COOKIE}=${creerSession(MOT_DE_PASSE, MAINTENANT.getTime())}`;

const VENTE = {
  date: '2026-11-18',
  formule: 'independant',
  montant: 3000,
  commission: 300,
  email: 'Camille@Exemple.fr',
  paiements: [
    { methode: 'gocardless', montant: 1000, mensualites: 1 },
    { methode: 'sequra', montant: 2000, mensualites: 6 },
  ],
};

/** ActiveCampaign de test : rend le numéro du contact à la synchronisation. */
const activecampaign = (url) => (url.pathname === '/api/3/contact/sync' ? { contact: { id: '4321', email: 'ne-doit-pas-sortir@exemple.fr' } } : {});

function demande(corps, methode = 'POST', chemin = '/api/cockpit/vente') {
  return new Request(`${SITE}${chemin}`, {
    method: methode,
    headers: { origin: SITE, 'content-type': 'application/json', cookie },
    body: methode === 'POST' ? JSON.stringify(corps) : undefined,
  });
}

function monde(services = {}) {
  const m = fauxMonde({ activecampaign, meta: () => ({ events_received: 1 }), ...services });
  const { journal, lignes } = fauxJournal();
  let numero = 0;
  return {
    ...m,
    lignes,
    ctx: { env: ENV, fetchImpl: m.fetchImpl, maintenant: MAINTENANT, journal, attente: async () => {}, identifiant: () => `fiche-${String((numero += 1)).padStart(4, '0')}` },
  };
}

/** L'inscription de Camille, six jours avant la vente, avec son accord. */
const inscrire = (m, accord = true) =>
  enregistrerInscription(
    ENV,
    { email: 'camille@exemple.fr', utm: { utm_id: '120212345678901234', fbclid: 'IwAR0abcDEF_123-xyz' }, accord },
    { fetchImpl: m.fetchImpl, maintenant: new Date('2026-11-12T18:00:00Z') },
  );

test('vente avec l’email de l’élève : liste Client, plus Prospect, événement Achat, publicité d’arrivée', async () => {
  const m = monde();
  await inscrire(m);
  const reponse = await traiterVente(demande({ mois: '2026-11', vente: VENTE, closerNom: 'Albane' }), m.ctx);
  assert.equal(reponse.status, 200);
  const [vente] = (await reponse.json()).ventes;
  assert.equal(vente.email, 'camille@exemple.fr');
  assert.deepEqual(vente.suivi, { pub: 'id:120212345678901234', delai: 6, le: MAINTENANT.toISOString(), ac: 'ok', meta: 'ok' });

  // ActiveCampaign : la fiche, puis « Client » (n° 4), puis la sortie de « Prospect » (n° 3).
  const versAC = m.vers('activecampaign');
  assert.deepEqual(versAC.map((d) => d.url.pathname), ['/api/3/contact/sync', '/api/3/contactLists', '/api/3/contactLists']);
  assert.deepEqual(versAC[0].corps, { contact: { email: 'camille@exemple.fr' } });
  assert.deepEqual(versAC[1].corps, { contactList: { list: '4', contact: '4321', status: 1 } });
  assert.deepEqual(versAC[2].corps, { contactList: { list: '3', contact: '4321', status: 2 } });
  assert.equal(versAC[1].options.headers['Api-Token'], 'cle-activecampaign-de-test');

  // Meta : « Achat », avec le montant commandé, conclu au téléphone, rattaché au clic de l'inscription.
  const [evenement] = m.vers('meta')[0].corps.data;
  assert.deepEqual(
    { nom: evenement.event_name, id: evenement.event_id, origine: evenement.action_source, donnees: evenement.custom_data, em: evenement.user_data.em },
    {
      nom: 'Purchase',
      id: 'vente-fiche-0002',
      origine: 'phone_call',
      donnees: { currency: 'EUR', value: 3000, content_name: 'Fleuriste Indépendant' },
      em: [empreinteEmail('camille@exemple.fr')],
    },
  );
  assert.match(evenement.user_data.fbc, /^fb\.1\.\d+\.IwAR0abcDEF_123-xyz$/);
  assert.equal(evenement.event_time, Math.floor(MAINTENANT.getTime() / 1000));

  // Une modification du montant ne renvoie ni l'achat, ni la fiche.
  const modifiee = await traiterVente(demande({ mois: '2026-11', vente: { ...VENTE, id: 'fiche-0002', montant: 3500, paiements: [{ methode: 'virement', montant: 3500 }], closer: 'fiche-0001' } }), m.ctx);
  assert.deepEqual((await modifiee.json()).ventes[0].suivi.meta, 'ok');
  assert.equal(m.vers('meta').length, 1);
  assert.equal(m.vers('activecampaign').length, 3);
  assert.equal(JSON.stringify(m.lignes).includes('exemple'), false);
});

test('vente sans email : enregistrée, rien ne bouge ailleurs', async () => {
  const m = monde();
  const { email: _, ...sansEmail } = VENTE;
  const reponse = await traiterVente(demande({ mois: '2026-11', vente: sansEmail, closerNom: 'Albane' }), m.ctx);
  const [vente] = (await reponse.json()).ventes;
  assert.deepEqual([vente.email, vente.suivi], ['', undefined]);
  assert.equal(m.demandes.length, 0);
});

test('élève jamais passée par la landing : la liste change et l’achat part quand même, sans publicité connue', async () => {
  const m = monde();
  const inconnue = await suivreVente({ env: ENV, vente: { ...VENTE, id: 'v9', email: 'lea@exemple.fr' }, fetchImpl: m.fetchImpl, maintenant: MAINTENANT, journal: fauxJournal().journal });
  assert.deepEqual(inconnue, { pub: '', delai: null, le: MAINTENANT.toISOString(), ac: 'ok', meta: 'ok' });
  const [evenement] = m.vers('meta')[0].corps.data;
  assert.deepEqual([evenement.event_name, evenement.action_source, 'fbc' in evenement.user_data], ['Purchase', 'phone_call', false]);
});

test('si l’accord redevenait requis : sans lui, la liste change, l’achat ne part pas chez Meta', async () => {
  const m = monde();
  m.ctx.env = { ...ENV, META_CONSENTEMENT: 'requis' };
  await inscrire(m, false);
  const reponse = await traiterVente(demande({ mois: '2026-11', vente: VENTE, closerNom: 'Albane' }), m.ctx);
  assert.deepEqual((await reponse.json()).ventes[0].suivi, { pub: 'id:120212345678901234', delai: 6, le: MAINTENANT.toISOString(), ac: 'ok', meta: 'sans-accord' });
  assert.equal(m.vers('meta').length, 0);

  const inconnue = await suivreVente({ env: m.ctx.env, vente: { ...VENTE, id: 'v9', email: 'lea@exemple.fr' }, fetchImpl: m.fetchImpl, maintenant: MAINTENANT, journal: fauxJournal().journal });
  assert.deepEqual(inconnue, { pub: '', delai: null, le: MAINTENANT.toISOString(), ac: 'ok', meta: 'sans-accord' });
});

test('ActiveCampaign en panne : la vente reste enregistrée, et le suivi se relance', async () => {
  let panne = true;
  const m = monde({ activecampaign: (url) => (panne ? new Response('{}', { status: 500 }) : activecampaign(url)) });
  await inscrire(m);
  const reponse = await traiterVente(demande({ mois: '2026-11', vente: VENTE, closerNom: 'Albane' }), m.ctx);
  assert.equal(reponse.status, 200);
  const [vente] = (await reponse.json()).ventes;
  assert.deepEqual([vente.suivi.ac, vente.suivi.meta], ['erreur', 'ok']);
  assert.deepEqual(m.lignes, [['vente : échec ActiveCampaign']]);

  panne = false;
  const relance = await traiterVente(demande({ mois: '2026-11', renvoyer: vente.id }), m.ctx);
  assert.equal(relance.status, 200);
  assert.deepEqual([(await relance.json()).ventes[0].suivi.ac, m.vers('meta').length], ['ok', 1]);
  // Ce que la base garde : le suivi à jour.
  const [fiche] = await m.commandes(['HGET', 'af:c1:ventes', vente.id]);
  assert.deepEqual([JSON.parse(fiche).suivi.ac, JSON.parse(fiche).suivi.meta], ['ok', 'ok']);
  assert.equal((await traiterVente(demande({ mois: '2026-11', renvoyer: 'fiche-inconnue' }), m.ctx)).status, 404);
});

test('une élève qui n’était plus dans Prospect : rien à retirer, tout va bien', async () => {
  const m = monde({ activecampaign: (url, _, corps) => (url.pathname === '/api/3/contactLists' && corps.contactList.status === 2 ? new Response('{}', { status: 422 }) : activecampaign(url)) });
  const suivi = await suivreVente({ env: ENV, vente: { ...VENTE, id: 'v1' }, fetchImpl: m.fetchImpl, maintenant: MAINTENANT, journal: fauxJournal().journal });
  assert.equal(suivi.ac, 'ok');
});

test('vente passée : l’achat est daté du jour de la vente ; au-delà de six jours, Meta ne le prendrait plus', async () => {
  const m = monde();
  await inscrire(m);
  const hier = await suivreVente({ env: ENV, vente: { ...VENTE, id: 'v1', date: '2026-11-17' }, fetchImpl: m.fetchImpl, maintenant: MAINTENANT, journal: fauxJournal().journal });
  assert.equal(hier.meta, 'ok');
  assert.equal(m.vers('meta')[0].corps.data[0].event_time, Date.parse('2026-11-17T12:00:00Z') / 1000);
  const ancienne = await suivreVente({ env: ENV, vente: { ...VENTE, id: 'v2', date: '2026-11-05' }, fetchImpl: m.fetchImpl, maintenant: MAINTENANT, journal: fauxJournal().journal });
  assert.deepEqual([ancienne.meta, ancienne.ac, m.vers('meta').length], ['trop-ancienne', 'ok', 1]);
});

test('hors production : la vente s’enregistre, mais rien n’est écrit ailleurs, sauf pour l’adresse de test', async () => {
  const m = monde();
  const env = { ...ENV, VERCEL_ENV: 'preview', LEAD_TEST_EMAIL: 'test@exemple.fr' };
  const simulee = await suivreVente({ env, vente: { ...VENTE, id: 'v1' }, fetchImpl: m.fetchImpl, maintenant: MAINTENANT });
  assert.deepEqual([simulee.ac, simulee.meta], ['simulation', 'simulation']);
  assert.equal(m.demandes.length, 0);
  const test = await suivreVente({ env, vente: { ...VENTE, id: 'v2', email: 'test@exemple.fr' }, fetchImpl: m.fetchImpl, maintenant: MAINTENANT });
  assert.deepEqual([test.ac, test.meta], ['ok', 'simulation']);
  assert.equal(m.vers('activecampaign')[0].url.href, `${AC}/api/3/contact/sync`);

  // Sans ActiveCampaign ni jeton Meta : la vente dit ce qui reste à brancher.
  const { ACTIVECAMPAIGN_API_KEY: _a, META_CAPI_TOKEN: _m, ...nu } = ENV;
  const aBrancher = await suivreVente({ env: nu, vente: { ...VENTE, id: 'v3' }, fetchImpl: m.fetchImpl, maintenant: MAINTENANT });
  assert.deepEqual([aBrancher.ac, aBrancher.meta], ['a-brancher', 'a-brancher']);
});
