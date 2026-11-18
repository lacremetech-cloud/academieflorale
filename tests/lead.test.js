import assert from 'node:assert/strict';
import { test } from 'node:test';
import fonction from '../api/lead.js';
import { CHAMP_PIEGE, creerLimiteur, traiterLead } from '../serveur/lead.js';

const SITE = 'https://tunnel.test';
const LEAD = { prenom: 'camille', email: 'Camille@Exemple.fr', delai: 5000 };
const PROD = {
  VERCEL_ENV: 'production',
  ACTIVECAMPAIGN_API_URL: 'https://compte.api-us1.com/',
  ACTIVECAMPAIGN_API_KEY: 'cle-secrete-de-test',
};

/** Fabrique une demande comme l'envoie le formulaire. */
function demande(corps, { methode = 'POST', enTetes = {}, brut } = {}) {
  return new Request(`${SITE}/api/lead`, {
    method: methode,
    headers: { origin: SITE, 'content-type': 'application/json', 'x-real-ip': '203.0.113.7', ...enTetes },
    body: methode === 'POST' ? (brut ?? JSON.stringify(corps)) : undefined,
  });
}

/** Faux ActiveCampaign : répond avec les statuts donnés, dans l'ordre. */
function fauxActiveCampaign(...statuts) {
  const appels = [];
  const fetchImpl = async (adresse, options) => {
    appels.push({ adresse, options, corps: JSON.parse(options.body) });
    const statut = statuts[Math.min(appels.length - 1, statuts.length - 1)];
    if (statut === 'panne') throw new TypeError('fetch failed');
    return new Response('{}', { status: statut });
  };
  return { appels, fetchImpl };
}

/** Contexte de test : pas d'attente réelle, journal capturé, limiteur neuf. */
function contexte(env, ac = fauxActiveCampaign(200)) {
  const lignes = [];
  const journal = { warn: (...a) => lignes.push(a), error: (...a) => lignes.push(a) };
  return {
    ac,
    lignes,
    ctx: { env, fetchImpl: ac.fetchImpl, journal, attente: async () => {}, limiteur: creerLimiteur() },
  };
}

test('la fonction Vercel expose bien un gestionnaire fetch', () => {
  assert.equal(typeof fonction.fetch, 'function');
});

test('refuse tout sauf POST', async () => {
  const { ctx, ac } = contexte(PROD);
  const reponse = await traiterLead(demande(null, { methode: 'GET' }), ctx);
  assert.equal(reponse.status, 405);
  assert.equal(reponse.headers.get('allow'), 'POST');
  assert.equal(ac.appels.length, 0);
});

test('refuse une demande venue d’un autre site, ou sans origine', async () => {
  const { ctx, ac } = contexte(PROD);
  assert.equal((await traiterLead(demande(LEAD, { enTetes: { origin: 'https://ailleurs.test' } }), ctx)).status, 403);
  const sansOrigine = new Request(`${SITE}/api/lead`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(LEAD),
  });
  assert.equal((await traiterLead(sansOrigine, ctx)).status, 403);
  assert.equal(ac.appels.length, 0);
});

test('refuse un corps qui n’est pas du JSON valide ou trop gros', async () => {
  const { ctx } = contexte(PROD);
  assert.equal((await traiterLead(demande(LEAD, { enTetes: { 'content-type': 'text/plain' } }), ctx)).status, 415);
  assert.equal((await traiterLead(demande(null, { brut: '{pas du json' }), ctx)).status, 400);
  assert.equal((await traiterLead(demande(null, { brut: '[1,2]' }), ctx)).status, 400);
  assert.equal((await traiterLead(demande({ ...LEAD, bourrage: 'x'.repeat(5000) }), ctx)).status, 413);
});

test('anti-spam : champ piège rempli ou envoi trop rapide, réponse normale et rien d’écrit', async () => {
  const { ctx, ac } = contexte(PROD);
  for (const corps of [
    { ...LEAD, [CHAMP_PIEGE]: 'https://spam.test' },
    { ...LEAD, delai: 120 },
    { prenom: 'camille', email: 'camille@exemple.fr' },
    { ...LEAD, delai: 'vite' },
  ]) {
    const reponse = await traiterLead(demande(corps), ctx);
    assert.equal(reponse.status, 200);
    assert.deepEqual(await reponse.json(), { ok: true });
  }
  assert.equal(ac.appels.length, 0);
});

test('validation : dit quels champs sont invalides', async () => {
  const { ctx, ac } = contexte(PROD);
  const reponse = await traiterLead(demande({ prenom: '42', email: 'pas-un-email', telephone: '06 12', delai: 5000 }), ctx);
  assert.equal(reponse.status, 400);
  assert.deepEqual(await reponse.json(), {
    ok: false,
    erreur: 'validation',
    champs: { prenom: 'invalide', email: 'invalide', telephone: 'invalide' },
  });
  assert.equal(ac.appels.length, 0);
});

test('preview : aucun faux lead, sauf l’adresse de test', async () => {
  const env = { ...PROD, VERCEL_ENV: 'preview', LEAD_TEST_EMAIL: 'Test@Exemple.fr' };
  const { ctx, ac } = contexte(env);
  const simulation = await traiterLead(demande(LEAD), ctx);
  assert.deepEqual(await simulation.json(), { ok: true, simulation: true });
  assert.equal(ac.appels.length, 0);

  const reel = await traiterLead(demande({ ...LEAD, email: 'test@exemple.fr' }), ctx);
  assert.deepEqual(await reel.json(), { ok: true });
  assert.equal(ac.appels.length, 1);

  const sansAdresse = contexte({ ...PROD, VERCEL_ENV: 'preview' });
  assert.deepEqual(await (await traiterLead(demande(LEAD), sansAdresse.ctx)).json(), { ok: true, simulation: true });
  assert.equal(sansAdresse.ac.appels.length, 0);
});

test('production : écrit la fiche attendue dans ActiveCampaign', async () => {
  const { ctx, ac } = contexte(PROD);
  const reponse = await traiterLead(
    demande({
      ...LEAD,
      telephone: '06 12 34 56 78',
      source: 'meta',
      page: 'inscription/reconversion',
      utm: { utm_source: 'meta', utm_campaign: 'vsl-nov' },
    }),
    ctx,
  );
  assert.deepEqual(await reponse.json(), { ok: true });
  assert.equal(ac.appels.length, 1);
  const { adresse, options, corps } = ac.appels[0];
  assert.equal(adresse, 'https://compte.api-us1.com/api/3/contact/sync');
  assert.equal(options.method, 'POST');
  assert.equal(options.headers['Api-Token'], 'cle-secrete-de-test');
  assert.deepEqual(corps, {
    contact: {
      email: 'camille@exemple.fr',
      firstName: 'Camille',
      fieldValues: [{ field: '2', value: 'VSL' }],
      tags: ['vsl-inscrite', 'VSL Meta Ads'],
      phone: '+33612345678',
    },
  });
});

test('production : après l’inscription, le suivi reçoit la publicité d’arrivée et le contexte', async () => {
  const suivies = [];
  const comptees = [];
  const { ctx } = contexte(PROD);
  const hooks = { ...ctx, suivre: (inscription) => suivies.push(inscription), compter: (...a) => comptees.push(a), identifiant: () => 'uuid-de-test' };
  const lead = {
    ...LEAD,
    telephone: '06 12 34 56 78',
    page: 'inscription/90-jours',
    utm: { utm_source: 'meta', utm_id: '120212345678901234', utm_content: 'P01 H1', fbclid: 'IwAR0abcDEF_123-xyz', autre: 'x' },
  };
  const enTetes = {
    referer: `${SITE}/inscription?utm_id=120212345678901234&fbclid=IwAR0abcDEF_123-xyz`,
    host: 'tunnel.test',
    'user-agent': 'Navigateur de test',
    cookie: 'autre=1; _fbp=fb.1.1795000000000.123456789; _fbc=fb.1.1795000000001.IwAR0abcDEF_123-xyz',
  };
  assert.deepEqual(await (await traiterLead(demande(lead, { enTetes }), hooks)).json(), { ok: true });
  assert.deepEqual(comptees, [['inscrits', 'inscription/90-jours']]);
  assert.deepEqual(suivies, [
    {
      email: 'camille@exemple.fr',
      prenom: 'Camille',
      telephone: '+33612345678',
      variante: 'inscription/90-jours',
      utm: { utm_source: 'meta', utm_content: 'P01 H1', utm_id: '120212345678901234', fbclid: 'IwAR0abcDEF_123-xyz' },
      // Aucun bandeau ne demande d'accord : il n'est jamais supposé (la règle d'envoi se décide plus loin).
      accord: false,
      ip: '203.0.113.7',
      ua: 'Navigateur de test',
      // Les deux cookies du pixel Meta, quand il les a posés.
      fbp: 'fb.1.1795000000000.123456789',
      fbc: 'fb.1.1795000000001.IwAR0abcDEF_123-xyz',
      // L'adresse donnée à Meta : la page du formulaire, sans ses paramètres, sur le domaine public.
      adresse: 'https://decouvrir.academie-florale.fr/inscription',
      idEvenement: 'lead-uuid-de-test',
    },
  ]);

  // L'accord et l'identifiant d'événement donnés par la page sont repris ; une page d'un autre site, jamais.
  await traiterLead(demande({ ...lead, consentement: true, idEvenement: 'lead-navigateur-0001' }, { enTetes: { referer: 'https://ailleurs.test/piege?email=x' } }), hooks);
  assert.deepEqual([suivies[1].accord, suivies[1].idEvenement, suivies[1].adresse, suivies[1].fbp, suivies[1].fbc], [true, 'lead-navigateur-0001', 'https://decouvrir.academie-florale.fr/inscription', '', '']);

  // Un suivi qui plante ne fait jamais échouer l'inscription.
  const plante = await traiterLead(demande(lead), {
    ...ctx,
    suivre: () => {
      throw new Error('suivi en panne');
    },
  });
  assert.equal(plante.status, 200);
});

test('preview : une inscription de test n’est ni comptée ni suivie', async () => {
  const appels = [];
  const { ctx, ac } = contexte({ ...PROD, VERCEL_ENV: 'preview', LEAD_TEST_EMAIL: 'test@exemple.fr' });
  const hooks = { ...ctx, suivre: () => appels.push('suivre'), compter: () => appels.push('compter') };
  assert.deepEqual(await (await traiterLead(demande({ ...LEAD, email: 'test@exemple.fr' }), hooks)).json(), { ok: true });
  assert.equal(ac.appels.length, 1);
  assert.deepEqual(appels, []);
});

test('production : le téléphone prend l’indicatif du pays choisi', async () => {
  for (const [pays, saisi, attendu] of [
    ['BE', '0470 12 34 56', '+32470123456'],
    ['CH', '079 123 45 67', '+41791234567'],
    ['FR', '06 12 34 56 78', '+33612345678'],
    [undefined, '06 12 34 56 78', '+33612345678'],
  ]) {
    const { ctx, ac } = contexte(PROD);
    const reponse = await traiterLead(demande({ ...LEAD, telephone: saisi, pays }), ctx);
    assert.equal(reponse.status, 200, String(pays));
    assert.equal(ac.appels[0].corps.contact.phone, attendu);
  }
  const { ctx, ac } = contexte(PROD);
  const refuse = await traiterLead(demande({ ...LEAD, telephone: '0470 12 34', pays: 'BE' }), ctx);
  assert.equal(refuse.status, 400);
  assert.deepEqual((await refuse.json()).champs, { telephone: 'invalide' });
  assert.equal(ac.appels.length, 0);
});

test('production : sans source Meta ni téléphone, un seul tag et pas de téléphone', async () => {
  for (const source of [undefined, 'autre', '__proto__', 'constructor']) {
    const { ctx, ac } = contexte(PROD);
    await traiterLead(demande({ ...LEAD, source }), ctx);
    assert.deepEqual(ac.appels[0].corps.contact.tags, ['vsl-inscrite'], String(source));
    assert.ok(!('phone' in ac.appels[0].corps.contact));
  }
});

test('production : variables absentes, erreur claire et rien d’envoyé', async () => {
  const { ctx, ac, lignes } = contexte({ VERCEL_ENV: 'production' });
  const reponse = await traiterLead(demande(LEAD), ctx);
  assert.equal(reponse.status, 503);
  assert.equal(ac.appels.length, 0);
  assert.equal(lignes.length, 1);
});

test('ActiveCampaign en panne passagère : une nouvelle tentative, puis succès', async () => {
  for (const premier of [500, 429, 'panne']) {
    const ac = fauxActiveCampaign(premier, 200);
    const { ctx } = contexte(PROD, ac);
    const reponse = await traiterLead(demande(LEAD), ctx);
    assert.equal(reponse.status, 200, String(premier));
    assert.equal(ac.appels.length, 2);
  }
});

test('ActiveCampaign en panne durable : erreur 502 après deux tentatives', async () => {
  for (const statut of [500, 'panne']) {
    const ac = fauxActiveCampaign(statut);
    const { ctx } = contexte(PROD, ac);
    const reponse = await traiterLead(demande(LEAD), ctx);
    assert.equal(reponse.status, 502);
    assert.deepEqual(await reponse.json(), { ok: false, erreur: 'indisponible' });
    assert.equal(ac.appels.length, 2);
  }
});

test('ActiveCampaign refuse la demande (422) : pas de nouvelle tentative', async () => {
  const ac = fauxActiveCampaign(422);
  const { ctx } = contexte(PROD, ac);
  assert.equal((await traiterLead(demande(LEAD), ctx)).status, 502);
  assert.equal(ac.appels.length, 1);
});

test('journaux et réponses : aucune donnée personnelle, aucune clé', async () => {
  const ac = fauxActiveCampaign(500);
  const { ctx, lignes } = contexte(PROD, ac);
  const reponse = await traiterLead(demande({ ...LEAD, telephone: '0612345678' }), ctx);
  const traces = JSON.stringify(lignes) + (await reponse.text());
  assert.ok(lignes.length >= 1);
  for (const interdit of ['camille', 'Camille', 'exemple.fr', '612345678', 'cle-secrete-de-test']) {
    assert.ok(!traces.includes(interdit), interdit);
  }
});

test('limitation : au-delà de 6 envois par adresse IP, erreur 429', async () => {
  const { ctx, ac } = contexte(PROD);
  for (let i = 0; i < 6; i += 1) assert.equal((await traiterLead(demande(LEAD), ctx)).status, 200);
  const septieme = await traiterLead(demande(LEAD), ctx);
  assert.equal(septieme.status, 429);
  assert.equal(septieme.headers.get('retry-after'), '120');
  assert.equal(ac.appels.length, 6);
  const autreAdresse = await traiterLead(demande(LEAD, { enTetes: { 'x-real-ip': '198.51.100.9' } }), ctx);
  assert.equal(autreAdresse.status, 200);
});
