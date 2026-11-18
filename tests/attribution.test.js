import assert from 'node:assert/strict';
import { test } from 'node:test';
import { clePub, creneauParis, ecartEnJours, fbcDepuis, joursEntre, nomDePub, PARAMETRES_PUB, trancheDelai } from '../partage/attribution.js';
import { CLES_UTM, nettoyerUTM } from '../partage/validation.js';
import { empreinteEmail, empreintePrenom, empreinteTelephone, hacher } from '../serveur/empreinte.js';
import { enregistrerInscription, lireEtats, lireInscriptions, lireInscritesParPub, lireMoments, noterEtat } from '../serveur/suivi.js';
import { BASE, fauxMonde } from './faux.js';

const ENV = { KV_REST_API_URL: BASE, KV_REST_API_TOKEN: 'jeton-de-test' };

test('publicité d’arrivée : l’identifiant de la pub d’abord, son nom sinon', () => {
  assert.equal(clePub({ utm_id: '120212345678901234', utm_content: 'P31 H1' }), 'id:120212345678901234');
  assert.equal(clePub({ utm_content: '  VSL-P01  H1 · Reconversion ' }), 'nom:vsl-p01 h1 · reconversion');
  // Un paramètre que Meta n'a pas remplacé ne désigne aucune publicité.
  assert.equal(clePub({ utm_id: '{{ad.id}}', utm_content: '{{ad.name}}' }), '');
  assert.equal(clePub({ utm_id: 'abc', utm_source: 'meta' }), '');
  assert.equal(clePub(null), '');
  assert.equal(nomDePub('Été\u0000 2026'), 'été 2026');
});

test('paramètres d’URL des pubs : chacun est gardé par la landing', () => {
  const cles = [...new URLSearchParams(PARAMETRES_PUB).keys()];
  assert.deepEqual(cles, ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'utm_id']);
  for (const cle of cles) assert.ok(CLES_UTM.includes(cle), `${cle} n’est pas gardé`);
  assert.deepEqual(nettoyerUTM({ utm_id: ' 120212345678901234 ', autre: 'x' }), { utm_id: '120212345678901234' });
});

test('identifiant de clic Meta : fabriqué à partir du fbclid, jamais d’une valeur douteuse', () => {
  assert.equal(fbcDepuis('IwAR0abcDEF_123-xyz', 1795000000000), 'fb.1.1795000000000.IwAR0abcDEF_123-xyz');
  assert.equal(fbcDepuis('court', 1795000000000), '');
  assert.equal(fbcDepuis('avec espace et <balise>', 1795000000000), '');
  assert.equal(fbcDepuis(undefined, 1795000000000), '');
});

test('créneaux et délais : à l’heure de Paris, lundi en premier', () => {
  // Mercredi 18 novembre 2026, 20 h 30 à Paris (19 h 30 UTC).
  assert.deepEqual(creneauParis(new Date('2026-11-18T19:30:00Z')), { jour: 2, heure: 20 });
  // Dimanche 23 h 30 UTC en été : déjà lundi 1 h 30 à Paris.
  assert.deepEqual(creneauParis(new Date('2026-07-05T23:30:00Z')), { jour: 0, heure: 1 });
  assert.equal(creneauParis('pas une date'), null);
  const jour = 86400000;
  assert.equal(ecartEnJours(0, jour * 2.9), 2);
  assert.equal(ecartEnJours(jour, 0), 0);
  assert.equal(ecartEnJours(Number.NaN, 0), null);
  // En jours de calendrier : inscrite le 16 au soir, rendez-vous pris le 18.
  assert.deepEqual([joursEntre('2026-11-16', '2026-11-18'), joursEntre('2026-10-31', '2026-11-01'), joursEntre('2026-11-18', '2026-11-18'), joursEntre(null, '2026-11-18')], [2, 1, 0, null]);
  assert.deepEqual([0, 1, 3, 7, 14, 40].map(trancheDelai), ['j0', 'j1', 'j2-3', 'j4-7', 'j8-14', 'j15+']);
  assert.equal(trancheDelai(null), '');
});

test('empreintes : la mise en forme attendue par Meta avant le hachage', () => {
  assert.equal(empreinteEmail('  Camille@Exemple.FR '), hacher('camille@exemple.fr'));
  assert.equal(empreinteEmail(''), '');
  assert.equal(empreinteTelephone('+33 6 39 98 01 01'), hacher('33639980101'));
  assert.equal(empreinteTelephone('0033639980101'), hacher('33639980101'));
  assert.equal(empreinteTelephone('12'), '');
  assert.equal(empreintePrenom(' Camille '), hacher('camille'));
  assert.match(empreinteEmail('a@b.fr'), /^[0-9a-f]{64}$/);
});

test('inscription : la première fait foi, comptée par publicité, par jour et par créneau', async () => {
  const monde = fauxMonde();
  const maintenant = new Date('2026-11-18T19:30:00Z');
  const utm = { utm_id: '120212345678901234', utm_campaign: 'VSL CBO', utm_term: 'Large', utm_content: 'P01 H1', fbclid: 'IwAR0abcDEF_123-xyz' };
  const premiere = await enregistrerInscription(
    ENV,
    { email: 'Camille@Exemple.fr', variante: 'inscription/90-jours', utm, accord: true, contexte: { ip: '203.0.113.7', ua: 'Navigateur de test' } },
    { fetchImpl: monde.fetchImpl, maintenant },
  );
  assert.deepEqual({ ok: premiere.ok, nouvelle: premiere.nouvelle }, { ok: true, nouvelle: true });
  assert.equal(premiere.inscription.pub, 'id:120212345678901234');

  // Une seconde inscription de la même adresse, venue d'une autre pub, ne change rien.
  const seconde = await enregistrerInscription(ENV, { email: 'camille@exemple.fr', utm: { utm_id: '999999999999' } }, { fetchImpl: monde.fetchImpl, maintenant });
  assert.deepEqual({ ok: seconde.ok, nouvelle: seconde.nouvelle }, { ok: true, nouvelle: false });
  // Une autre inscrite, sans paramètre de publicité ni accord.
  await enregistrerInscription(ENV, { email: 'lea@exemple.fr', utm: {} }, { fetchImpl: monde.fetchImpl, maintenant });

  const parPub = await lireInscritesParPub(ENV, ['2026-11-17', '2026-11-18'], { fetchImpl: monde.fetchImpl });
  assert.deepEqual(parPub, { etat: 'ok', parPub: { 'id:120212345678901234': 1, '(sans)': 1 }, parJour: { '2026-11-18': 2 } });
  assert.deepEqual(await lireMoments(ENV, ['2026-11'], { fetchImpl: monde.fetchImpl }), { '2:20': 2 });

  const lues = await lireInscriptions(ENV, ['CAMILLE@exemple.fr', 'lea@exemple.fr', 'inconnue@exemple.fr'], { fetchImpl: monde.fetchImpl, avecContexte: true });
  assert.equal(lues.size, 2);
  const camille = lues.get(empreinteEmail('camille@exemple.fr'));
  assert.deepEqual(camille.inscription, {
    t: maintenant.getTime(),
    jour: '2026-11-18',
    variante: 'inscription/90-jours',
    pub: 'id:120212345678901234',
    campagne: 'VSL CBO',
    ensemble: 'Large',
    annonce: 'P01 H1',
    fbc: `fb.1.${maintenant.getTime()}.IwAR0abcDEF_123-xyz`,
    accord: 1,
  });
  // Le contexte technique n'est gardé qu'avec l'accord de l'inscrite.
  assert.deepEqual(camille.contexte, { ip: '203.0.113.7', ua: 'Navigateur de test', fbp: '' });
  assert.equal(lues.get(empreinteEmail('lea@exemple.fr')).contexte, null);

  // Rien de ce qui est rangé ne contient un email.
  const [fiche] = await monde.commandes(['GET', `af:c1:lead:${empreinteEmail('camille@exemple.fr')}`]);
  assert.equal(/exemple|camille/i.test(fiche), false);
});

test('suivi : sans base, rien ne casse ; les états des branchements se relisent', async () => {
  const sansBase = await enregistrerInscription({}, { email: 'camille@exemple.fr' });
  assert.deepEqual(sansBase, { ok: false, nouvelle: false, inscription: null });
  assert.deepEqual(await lireInscritesParPub({}, ['2026-11-18']), { etat: 'a-brancher', parPub: {}, parJour: {} });
  assert.equal((await lireInscriptions({}, ['camille@exemple.fr'])).size, 0);
  // Une base en panne ne lève pas d'erreur.
  const panne = async () => new Response('non', { status: 500 });
  assert.deepEqual(await enregistrerInscription(ENV, { email: 'camille@exemple.fr' }, { fetchImpl: panne }), { ok: false, nouvelle: false, inscription: null });
  assert.equal((await lireInscritesParPub(ENV, ['2026-11-18'], { fetchImpl: panne })).etat, 'erreur');

  const monde = fauxMonde();
  await noterEtat(ENV, 'rdv', { t: '2026-11-18T10:00:00.000Z', vus: 2 }, { fetchImpl: monde.fetchImpl });
  assert.deepEqual(await lireEtats(ENV, { fetchImpl: monde.fetchImpl }), { rdv: { t: '2026-11-18T10:00:00.000Z', vus: 2 } });
});
