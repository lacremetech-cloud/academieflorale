import assert from 'node:assert/strict';
import { test } from 'node:test';
import connexion from '../api/cockpit/connexion.js';
import donnees from '../api/cockpit/donnees.js';
import note from '../api/cockpit/note.js';
import saisie from '../api/cockpit/saisie.js';
import {
  COOKIE,
  creerSession,
  DUREE_SESSION_S,
  lireCookie,
  motDePasseRegle,
  sessionValide,
  traiterConnexion,
  verifierAcces,
} from '../serveur/cockpit/acces.js';
import { traiterDonnees, traiterNote, traiterSaisie } from '../serveur/cockpit/donnees.js';
import { creerLimiteur } from '../serveur/lead.js';

const SITE = 'https://tunnel.test';
// Mot de passe de test, sans rapport avec un vrai.
const MOT_DE_PASSE = 'essai-du-cockpit-42';
const ENV = { COCKPIT_MOT_DE_PASSE: MOT_DE_PASSE };

function demande(chemin, { methode = 'POST', corps, enTetes = {} } = {}) {
  return new Request(`${SITE}${chemin}`, {
    method: methode,
    headers: { origin: SITE, 'content-type': 'application/json', 'x-real-ip': '203.0.113.9', ...enTetes },
    body: methode === 'POST' ? JSON.stringify(corps ?? {}) : undefined,
  });
}

function contexte(env = ENV) {
  const lignes = [];
  const journal = { warn: (...a) => lignes.push(a), error: (...a) => lignes.push(a) };
  return { lignes, ctx: { env, journal, attente: async () => {}, limiteur: creerLimiteur(6, 600000) } };
}

/** Ouvre une session et rend l'en-tête « cookie » à présenter ensuite. */
async function seConnecter() {
  const { ctx } = contexte();
  const reponse = await traiterConnexion(demande('/api/cockpit/connexion', { corps: { motDePasse: MOT_DE_PASSE } }), ctx);
  assert.equal(reponse.status, 200);
  return (reponse.headers.get('set-cookie') ?? '').split(';')[0];
}

test('les fonctions Vercel du cockpit exposent bien un gestionnaire fetch', () => {
  for (const fonction of [connexion, donnees, note, saisie]) assert.equal(typeof fonction.fetch, 'function');
});

test('mot de passe : réglé seulement s’il est assez long', () => {
  assert.equal(motDePasseRegle({}), '');
  assert.equal(motDePasseRegle({ COCKPIT_MOT_DE_PASSE: 'court' }), '');
  assert.equal(motDePasseRegle(ENV), MOT_DE_PASSE);
});

test('session : valide pour ce mot de passe, jusqu’à son expiration', () => {
  const maintenant = Date.parse('2026-11-18T10:00:00Z');
  const jeton = creerSession(MOT_DE_PASSE, maintenant);
  assert.equal(sessionValide(jeton, MOT_DE_PASSE, maintenant + 1000), true);
  assert.equal(sessionValide(jeton, MOT_DE_PASSE, maintenant + DUREE_SESSION_S * 1000 - 1000), true);
  assert.equal(sessionValide(jeton, MOT_DE_PASSE, maintenant + DUREE_SESSION_S * 1000 + 1000), false);
  // Changer le mot de passe ferme les sessions ouvertes.
  assert.equal(sessionValide(jeton, 'un-autre-mot-de-passe', maintenant + 1000), false);
  const [expiration, signature] = jeton.split('.');
  // Jeton trafiqué : expiration repoussée, signature inventée ou tronquée.
  assert.equal(sessionValide(`${Number(expiration) + 999999}.${signature}`, MOT_DE_PASSE, maintenant), false);
  assert.equal(sessionValide(`${expiration}.${signature.slice(0, -2)}`, MOT_DE_PASSE, maintenant), false);
  for (const faux of ['', 'abc', `${expiration}.`, `${expiration}.x.y`, null, 42]) {
    assert.equal(sessionValide(faux, MOT_DE_PASSE, maintenant), false);
  }
  assert.equal(sessionValide(jeton, '', maintenant), false);
});

test('connexion : bon mot de passe, cookie de session protégé', async () => {
  const { ctx, lignes } = contexte();
  const reponse = await traiterConnexion(demande('/api/cockpit/connexion', { corps: { motDePasse: MOT_DE_PASSE } }), ctx);
  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { ok: true });
  const cookie = reponse.headers.get('set-cookie') ?? '';
  assert.match(cookie, new RegExp(`^${COOKIE}=\\d+\\.[\\w-]+; Path=/api/cockpit; HttpOnly; SameSite=Strict; Max-Age=${DUREE_SESSION_S}; Secure$`));
  assert.equal(reponse.headers.get('cache-control'), 'no-store');
  assert.equal(lignes.length, 0);
  // Le cookie ne contient pas le mot de passe.
  assert.equal(cookie.includes(MOT_DE_PASSE), false);
});

test('connexion : mauvais mot de passe refusé, sans jamais le journaliser', async () => {
  const { ctx, lignes } = contexte();
  for (const motDePasse of ['mauvais-mot-de-passe', '', MOT_DE_PASSE.slice(0, -1), `${MOT_DE_PASSE} `]) {
    const reponse = await traiterConnexion(demande('/api/cockpit/connexion', { corps: { motDePasse } }), ctx);
    assert.equal(reponse.status, 401);
    assert.equal(reponse.headers.get('set-cookie'), null);
  }
  assert.equal(JSON.stringify(lignes).includes('mauvais-mot-de-passe'), false);
  assert.equal(JSON.stringify(lignes).includes(MOT_DE_PASSE), false);
});

test('connexion : fermée sans mot de passe réglé, autre site refusé, essais limités', async () => {
  const sansReglage = contexte({});
  assert.equal((await traiterConnexion(demande('/api/cockpit/connexion', { corps: { motDePasse: 'x' } }), sansReglage.ctx)).status, 503);

  const { ctx } = contexte();
  const ailleurs = demande('/api/cockpit/connexion', { corps: { motDePasse: MOT_DE_PASSE }, enTetes: { origin: 'https://ailleurs.test' } });
  assert.equal((await traiterConnexion(ailleurs, ctx)).status, 403);
  assert.equal((await traiterConnexion(demande('/api/cockpit/connexion', { methode: 'GET' }), ctx)).status, 405);

  const limite = contexte();
  const statuts = [];
  for (let essai = 0; essai < 8; essai += 1) {
    statuts.push((await traiterConnexion(demande('/api/cockpit/connexion', { corps: { motDePasse: 'faux' } }), limite.ctx)).status);
  }
  assert.deepEqual(statuts, [401, 401, 401, 401, 401, 401, 429, 429]);
  // Même le bon mot de passe attend la fin de la période.
  assert.equal((await traiterConnexion(demande('/api/cockpit/connexion', { corps: { motDePasse: MOT_DE_PASSE } }), limite.ctx)).status, 429);
});

test('déconnexion : le cookie est effacé', async () => {
  const { ctx } = contexte();
  const reponse = await traiterConnexion(demande('/api/cockpit/connexion', { methode: 'DELETE' }), ctx);
  assert.equal(reponse.status, 200);
  assert.match(reponse.headers.get('set-cookie') ?? '', new RegExp(`^${COOKIE}=; .*Max-Age=0`));
});

test('accès aux chiffres : seulement avec une session valide', async () => {
  const sans = await traiterDonnees(demande('/api/cockpit/donnees?mois=2026-11', { methode: 'GET' }), { env: ENV });
  assert.equal(sans.status, 401);
  const faux = await traiterDonnees(demande('/api/cockpit/donnees', { methode: 'GET', enTetes: { cookie: `${COOKIE}=1999999999.abc` } }), { env: ENV });
  assert.equal(faux.status, 401);
  assert.equal((await traiterDonnees(demande('/api/cockpit/donnees', { methode: 'GET' }), { env: {} })).status, 503);

  const cookie = await seConnecter();
  assert.equal(lireCookie(new Request(SITE, { headers: { cookie: `autre=1; ${cookie}` } })), cookie.split('=')[1]);
  assert.equal(verifierAcces(new Request(SITE, { headers: { cookie } }), ENV).ok, true);

  // Sans aucune source branchée : le mois s'affiche, tout est « à brancher », aucun appel sortant.
  const appels = [];
  const fetchImpl = async (adresse) => {
    appels.push(adresse);
    return new Response('{}');
  };
  const reponse = await traiterDonnees(demande('/api/cockpit/donnees?mois=2026-11', { methode: 'GET', enTetes: { cookie } }), {
    env: ENV,
    fetchImpl,
    maintenant: new Date('2026-11-18T10:00:00Z'),
  });
  assert.equal(reponse.status, 200);
  assert.equal(reponse.headers.get('cache-control'), 'private, no-store');
  const corps = await reponse.json();
  assert.equal(corps.mois, '2026-11');
  assert.equal(corps.demonstration, false);
  assert.equal(corps.jours.length, 30);
  assert.equal(corps.jours[0].depense, null);
  assert.deepEqual(Object.keys(corps.sources), ['meta', 'compteurs', 'wistia', 'iclosed', 'ventes']);
  assert.ok(Object.values(corps.sources).every((s) => s.etat === 'a-brancher'));
  assert.equal(corps.sources.ventes.manuel, true);
  assert.match(corps.sources.ventes.brancher, /Upstash/);
  assert.equal(corps.jours[0].ventes, null); // pas de base : rien à saisir, rien d'affiché
  assert.deepEqual(corps.saisie, ['ventes', 'encaisse', 'reste']);
  assert.equal(appels.length, 0);

  // Mois illisible : le mois en cours.
  const defaut = await traiterDonnees(demande('/api/cockpit/donnees?mois=n-importe-quoi', { methode: 'GET', enTetes: { cookie } }), {
    env: ENV,
    maintenant: new Date('2026-11-18T10:00:00Z'),
  });
  assert.equal((await defaut.json()).mois, '2026-11');
});

test('démonstration : en local seulement, jamais sur Vercel', async () => {
  const cookie = await seConnecter();
  const lire = async (env) =>
    (await traiterDonnees(demande('/api/cockpit/donnees?mois=2026-10', { methode: 'GET', enTetes: { cookie } }), { env, maintenant: new Date('2026-11-18T10:00:00Z') })).json();
  const local = await lire({ ...ENV, COCKPIT_DEMO: '1' });
  assert.equal(local.demonstration, true);
  assert.ok(local.jours.every((jour) => jour.depense > 0));
  const vercel = await lire({ ...ENV, COCKPIT_DEMO: '1', VERCEL: '1' });
  assert.equal(vercel.demonstration, false);
  assert.equal(vercel.jours[0].depense, null);

  // Avec une base reliée (en local : la base en mémoire), les ventes et les notes de la
  // démonstration sont celles qui ont été saisies, comme en vrai.
  const jours = 31;
  const base = async () =>
    new Response(
      JSON.stringify([
        { result: Array(jours).fill(null) },
        { result: Array(jours).fill(null) },
        { result: ['note saisie', ...Array(jours - 1).fill(null)] },
        { result: [] },
        { result: ['2', '500', '1500', ...Array((jours - 1) * 3).fill(null)] },
      ]),
    );
  const avecBase = await (
    await traiterDonnees(demande('/api/cockpit/donnees?mois=2026-10', { methode: 'GET', enTetes: { cookie } }), {
      env: { ...ENV, COCKPIT_DEMO: '1', KV_REST_API_URL: 'https://base.test', KV_REST_API_TOKEN: 'jeton' },
      fetchImpl: base,
      maintenant: new Date('2026-11-18T10:00:00Z'),
    })
  ).json();
  assert.equal(avecBase.demonstration, true);
  assert.deepEqual([avecBase.jours[0].ventes, avecBase.jours[0].encaisse, avecBase.jours[0].contracte], [2, 500, 2000]);
  assert.deepEqual([avecBase.jours[1].ventes, avecBase.jours[1].contracte], [0, 0]);
  assert.deepEqual(avecBase.notes, { '2026-10-01': 'note saisie' });
});

test('notes : session exigée, date vérifiée, base non reliée signalée', async () => {
  const cookie = await seConnecter();
  const sans = await traiterNote(demande('/api/cockpit/note', { corps: { date: '2026-11-18', note: 'test' } }), { env: ENV });
  assert.equal(sans.status, 401);
  const mauvaiseDate = await traiterNote(demande('/api/cockpit/note', { corps: { date: '2026-11-31', note: 'test' }, enTetes: { cookie } }), { env: ENV });
  assert.equal(mauvaiseDate.status, 400);
  const nonReliee = await traiterNote(demande('/api/cockpit/note', { corps: { date: '2026-11-18', note: 'test' }, enTetes: { cookie } }), { env: ENV });
  assert.equal(nonReliee.status, 503);

  const commandes = [];
  const fetchImpl = async (adresse, options) => {
    commandes.push({ adresse, corps: JSON.parse(options.body), jeton: options.headers.Authorization });
    return new Response(JSON.stringify([{ result: 1 }]));
  };
  const env = { ...ENV, KV_REST_API_URL: 'https://base.test/', KV_REST_API_TOKEN: 'jeton-de-test' };
  const ecrite = await traiterNote(
    demande('/api/cockpit/note', { corps: { date: '2026-11-18', note: `  scaling\ncbo ${'x'.repeat(300)}` }, enTetes: { cookie } }),
    { env, fetchImpl },
  );
  assert.equal(ecrite.status, 200);
  assert.equal(commandes[0].adresse, 'https://base.test/pipeline');
  assert.equal(commandes[0].jeton, 'Bearer jeton-de-test');
  assert.equal(commandes[0].corps[0][0], 'HSET');
  assert.equal(commandes[0].corps[0][2], '2026-11-18');
  assert.equal(commandes[0].corps[0][3].length, 160);
  assert.ok(commandes[0].corps[0][3].startsWith('scaling cbo x'));

  await traiterNote(demande('/api/cockpit/note', { corps: { date: '2026-11-18', note: '   ' }, enTetes: { cookie } }), { env, fetchImpl });
  assert.deepEqual(commandes[1].corps[0].slice(0, 3), ['HDEL', 'af:c1:notes', '2026-11-18']);
});

test('saisie des ventes : session exigée, jour passé, champ et valeur vérifiés', async () => {
  const cookie = await seConnecter();
  const maintenant = new Date('2026-11-18T10:00:00Z');
  const env = { ...ENV, KV_REST_API_URL: 'https://base.test', KV_REST_API_TOKEN: 'jeton-de-test' };
  const commandes = [];
  // Fausse base : elle retient ce qui est écrit et le rend à la relecture.
  const table = new Map();
  const fetchImpl = async (adresse, options) => {
    const corps = JSON.parse(options.body);
    commandes.push(corps);
    return new Response(
      JSON.stringify(
        corps.map(([nom, , ...reste]) => {
          if (nom === 'HSET') return { result: table.set(reste[0], reste[1]) && 1 };
          if (nom === 'HDEL') return { result: table.delete(reste[0]) ? 1 : 0 };
          return { result: reste.map((champ) => table.get(champ) ?? null) };
        }),
      ),
    );
  };
  const envoyer = (corps, options = {}) =>
    traiterSaisie(demande('/api/cockpit/saisie', { corps, enTetes: options.sansSession ? {} : { cookie } }), { env: options.env ?? env, fetchImpl, maintenant });

  assert.equal((await envoyer({ date: '2026-11-17', champ: 'ventes', valeur: 1 }, { sansSession: true })).status, 401);
  assert.equal((await traiterSaisie(demande('/api/cockpit/saisie', { methode: 'GET', enTetes: { cookie } }), { env })).status, 405);
  // Jour inexistant, jour à venir, champ inconnu, valeur illisible : refusés sans rien écrire.
  for (const [corps, erreur] of [
    [{ date: '2026-11-31', champ: 'ventes', valeur: 1 }, 'date'],
    [{ date: '2026-11-19', champ: 'ventes', valeur: 1 }, 'date'],
    [{ date: '2026-11-17', champ: 'depense', valeur: 1 }, 'champ'],
    [{ date: '2026-11-17', champ: 'ventes', valeur: 1.5 }, 'valeur'],
    [{ date: '2026-11-17', champ: 'encaisse', valeur: '-10' }, 'valeur'],
  ]) {
    const reponse = await envoyer(corps);
    assert.deepEqual([reponse.status, (await reponse.json()).erreur], [400, erreur]);
  }
  assert.equal(commandes.length, 0);
  // Base non reliée : dit clairement, rien n'est perdu en silence.
  assert.equal((await envoyer({ date: '2026-11-17', champ: 'ventes', valeur: 1 }, { env: ENV })).status, 503);

  // Une vente du 17 : 1 000 € encaissés, 2 000 € à venir.
  const lire = async (corps) => (await envoyer(corps)).json();
  assert.deepEqual((await lire({ date: '2026-11-17', champ: 'ventes', valeur: 1 })).chiffres, { ventes: 1, encaisse: 0, contracte: 0 });
  assert.deepEqual(commandes[0][0], ['HSET', 'af:c1:saisies', '2026-11-17:ventes', '1']);
  assert.deepEqual(commandes[0][1], ['HMGET', 'af:c1:saisies', '2026-11-17:ventes', '2026-11-17:encaisse', '2026-11-17:reste']);
  assert.deepEqual((await lire({ date: '2026-11-17', champ: 'encaisse', valeur: '1 000' })).chiffres, { ventes: 1, encaisse: 1000, contracte: 1000 });
  assert.deepEqual((await lire({ date: '2026-11-17', champ: 'reste', valeur: 2000 })).chiffres, { ventes: 1, encaisse: 1000, contracte: 3000 });
  // Aujourd'hui se saisit aussi ; une case vidée (ou remise à zéro) efface le chiffre.
  assert.equal((await envoyer({ date: '2026-11-18', champ: 'ventes', valeur: 2 })).status, 200);
  assert.deepEqual((await lire({ date: '2026-11-17', champ: 'reste', valeur: null })).chiffres, { ventes: 1, encaisse: 1000, contracte: 1000 });
  assert.deepEqual(commandes.at(-1)[0], ['HDEL', 'af:c1:saisies', '2026-11-17:reste']);
  assert.deepEqual((await lire({ date: '2026-11-17', champ: 'ventes', valeur: 0 })).chiffres, { ventes: 0, encaisse: 1000, contracte: 1000 });
});
