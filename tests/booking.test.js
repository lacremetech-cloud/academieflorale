import assert from 'node:assert/strict';
import { test } from 'node:test';
import fonction from '../api/booking.js';
import { construireContactRdv, forme, lireReservation, traiterReservation } from '../serveur/booking.js';

const SITE = 'https://tunnel.test';
const SECRET = 'secret-de-test-0123456789';
const PROD = {
  VERCEL_ENV: 'production',
  ICLOSED_WEBHOOK_SECRET: SECRET,
  ACTIVECAMPAIGN_API_URL: 'https://compte.api-us1.com/',
  ACTIVECAMPAIGN_API_KEY: 'cle-secrete-de-test',
};

/**
 * Webhook « Call booked » tel que la documentation d'iClosed le décrit : l'event,
 * l'appel (avec le closer), le setter, l'invitée, ses réponses, l'attribution.
 */
function appelReserve(modifs = {}) {
  return {
    event_type: {
      uuid: 'evt-1',
      kind: 'Round Robin',
      slug: 'candidature-vsl',
      name: 'Appel de candidature',
      duration: 45,
      durationUnit: 'MINUTES',
    },
    event: {
      uuid: 'appel-1',
      assigned_to: 'Closer Exemple',
      name: 'Closer Exemple',
      email: 'closer@academie.test',
      start_time: '2026-11-20T18:00:00+01:00',
      location: 'phone',
      canceled: false,
    },
    setter: { id: 'setter-1', firstName: 'Setter', lastName: 'Exemple', email: 'setter@academie.test' },
    invitee: {
      uuid: 'contact-1',
      firstName: 'Camille',
      lastName: 'Martin',
      email: 'Camille@Exemple.fr',
      text_reminder_number: '+33639980101',
      timezone: 'Europe/Paris',
    },
    questions_and_answers: { '1_question': 'Ton projet ?', '1_response': 'Me reconvertir', 'Ton projet ?': 'Me reconvertir' },
    tracking: { utm_source: 'meta', utm_campaign: 'vsl' },
    call_booked_from: 'PUBLIC SCHEDULER',
    hookType: 'Call booked',
    ...modifs,
  };
}

/** Fabrique un webhook comme iClosed l'envoie : le secret est dans l'adresse. */
function webhook(corps, { methode = 'POST', cle = SECRET, enTetes = {}, brut } = {}) {
  const adresse = `${SITE}/api/booking${cle === null ? '' : `?cle=${encodeURIComponent(cle)}`}`;
  return new Request(adresse, {
    method: methode,
    headers: { 'content-type': 'application/json', ...enTetes },
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

/** Contexte de test : pas d'attente réelle, journal capturé. */
function contexte(env, ac = fauxActiveCampaign(200)) {
  const lignes = [];
  const journal = { warn: (...a) => lignes.push(a), error: (...a) => lignes.push(a) };
  return { ac, lignes, ctx: { env, fetchImpl: ac.fetchImpl, journal, attente: async () => {} } };
}

/** Aucune donnée de l'invitée, du closer ni du setter ne doit sortir dans les journaux. */
function sansDonneePersonnelle(lignes) {
  const texte = JSON.stringify(lignes).toLowerCase();
  for (const interdit of ['camille', 'martin', 'exemple.fr', '639980101', 'closer', 'academie.test', 'reconvertir', SECRET]) {
    assert.equal(texte.includes(interdit.toLowerCase()), false, `« ${interdit} » ne doit pas être journalisé`);
  }
}

test('la fonction Vercel expose bien un gestionnaire fetch', () => {
  assert.equal(typeof fonction.fetch, 'function');
});

test('refuse tout sauf POST', async () => {
  const { ctx, ac } = contexte(PROD);
  const reponse = await traiterReservation(webhook(null, { methode: 'GET' }), ctx);
  assert.equal(reponse.status, 405);
  assert.equal(reponse.headers.get('allow'), 'POST');
  assert.equal(ac.appels.length, 0);
});

test('reste fermée tant que le secret n’est pas réglé, ou s’il est trop court', async () => {
  for (const secret of [undefined, '', 'court']) {
    const { ctx, ac, lignes } = contexte({ ...PROD, ICLOSED_WEBHOOK_SECRET: secret });
    const reponse = await traiterReservation(webhook(appelReserve(), { cle: secret ?? '' }), ctx);
    assert.equal(reponse.status, 503);
    assert.equal(ac.appels.length, 0);
    assert.equal(lignes.length, 1);
  }
});

test('refuse un webhook sans le bon secret', async () => {
  const { ctx, ac } = contexte(PROD);
  for (const cle of [null, '', 'mauvais-secret-0123456789', SECRET.slice(0, -1)]) {
    assert.equal((await traiterReservation(webhook(appelReserve(), { cle }), ctx)).status, 401);
  }
  assert.equal(ac.appels.length, 0);
});

test('accepte le secret dans l’adresse ou dans un en-tête', async () => {
  for (const enTetes of [{ 'x-webhook-secret': SECRET }, { authorization: `Bearer ${SECRET}` }]) {
    const { ctx, ac } = contexte(PROD);
    assert.equal((await traiterReservation(webhook(appelReserve(), { cle: null, enTetes }), ctx)).status, 200);
    assert.equal(ac.appels.length, 1);
  }
});

test('refuse un corps illisible ou trop gros', async () => {
  const { ctx, ac } = contexte(PROD);
  assert.equal((await traiterReservation(webhook(null, { brut: '{pas du json' }), ctx)).status, 400);
  assert.equal((await traiterReservation(webhook(null, { brut: '"texte"' }), ctx)).status, 400);
  assert.equal((await traiterReservation(webhook(appelReserve({ bourrage: 'x'.repeat(70000) })), ctx)).status, 413);
  assert.equal(ac.appels.length, 0);
});

test('appel réservé : tag vsl-rdv, « Prise de RDV » et « Nom de l’event » sur la fiche de l’invitée', async () => {
  const { ctx, ac, lignes } = contexte(PROD);
  const reponse = await traiterReservation(webhook(appelReserve()), ctx);
  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { ok: true });
  assert.equal(reponse.headers.get('cache-control'), 'no-store');

  assert.equal(ac.appels.length, 1);
  const [appel] = ac.appels;
  assert.equal(appel.adresse, 'https://compte.api-us1.com/api/3/contact/sync');
  assert.equal(appel.options.headers['Api-Token'], 'cle-secrete-de-test');
  // L'email est celui de l'invitée, en minuscules : ni celui du closer, ni celui du setter.
  assert.deepEqual(appel.corps, {
    contact: {
      email: 'camille@exemple.fr',
      fieldValues: [
        { field: '3', value: 'VSL' },
        { field: '10', value: 'Appel de candidature' },
      ],
      tags: ['vsl-rdv'],
    },
  });
  assert.equal(lignes.length, 0);
});

test('appel annulé : tag vsl-rdv-annule, sans toucher aux champs', async () => {
  for (const hookType of ['Call cancelled', 'Call canceled', 'CALL CANCELLED']) {
    const { ctx, ac } = contexte(PROD);
    assert.equal((await traiterReservation(webhook(appelReserve({ hookType })), ctx)).status, 200);
    assert.deepEqual(ac.appels[0].corps, { contact: { email: 'camille@exemple.fr', tags: ['vsl-rdv-annule'] } });
  }
});

test('les autres déclencheurs sont acceptés sans rien écrire', async () => {
  const { ctx, ac, lignes } = contexte(PROD);
  for (const hookType of ['Call rescheduled', 'Contact created', 'Contact updated', 'Call outcome added']) {
    const reponse = await traiterReservation(webhook(appelReserve({ hookType })), ctx);
    assert.equal(reponse.status, 200);
    assert.deepEqual(await reponse.json(), { ok: true, ignore: 'declencheur' });
  }
  assert.equal(ac.appels.length, 0);
  assert.equal(lignes.length, 0);
});

test('les réservations des autres events iClosed sont acceptées sans rien écrire', async () => {
  const { ctx, ac, lignes } = contexte(PROD);
  const autre = appelReserve();
  autre.event_type = { ...autre.event_type, slug: 'nuit-des-fleuristes', name: 'Appel de candidature' };
  const reponse = await traiterReservation(webhook(autre), ctx);
  assert.equal(reponse.status, 200);
  assert.deepEqual(await reponse.json(), { ok: true, ignore: 'event' });
  assert.equal(ac.appels.length, 0);
  assert.equal(lignes.length, 0);
});

test('lecture tolérante : charge enveloppée, noms en camelCase, adresse complète de l’event', () => {
  const base = appelReserve();
  const attendu = { type: 'reserve', event: 'candidature-vsl', nomEvent: 'Appel de candidature', email: 'camille@exemple.fr' };

  assert.deepEqual(lireReservation(base), attendu);
  // Enveloppe « payload », comme les webhooks dont iClosed reprend le format.
  assert.deepEqual(lireReservation({ event: 'call.booked', payload: base }), attendu);
  assert.deepEqual(lireReservation([base]), attendu);
  // Noms en camelCase.
  const { event_type: eventType, hookType, ...reste } = base;
  assert.deepEqual(lireReservation({ ...reste, eventType, config: { hookType } }), attendu);
  // L'event donné par son adresse complète.
  assert.deepEqual(
    lireReservation(
      appelReserve({
        event_type: { slug: 'https://app.iclosed.io/e/academie-florale/Candidature-VSL?x=1', name: ' Appel\tde  candidature ' },
      }),
    ),
    attendu,
  );
  // Ancienne et nouvelle invitée d'un appel déplacé : seule « invitee » compte.
  assert.equal(
    lireReservation({ ...base, old_invitee: { email: 'ancienne@exemple.fr' } }).email,
    'camille@exemple.fr',
  );
});

test('lecture : sans invitée, l’email du closer ou du setter n’est jamais pris à sa place', () => {
  const { invitee, ...sansInvitee } = appelReserve();
  assert.equal(invitee.email, 'Camille@Exemple.fr');
  assert.equal(lireReservation(sansInvitee).email, '');
  assert.equal(lireReservation({ ...sansInvitee, invitee: { email: 'pas un email' } }).email, '');
  assert.equal(lireReservation({ ...sansInvitee, Invitee_email: 'Camille@Exemple.fr' }).email, 'camille@exemple.fr');
  for (const vide of [null, 'texte', 12, {}, []]) {
    assert.deepEqual(lireReservation(vide), { type: '', event: '', nomEvent: '', email: '' });
  }
});

test('webhook non reconnu : rien n’est écrit, la forme est journalisée sans aucune valeur', async () => {
  const { hookType, ...sansDeclencheur } = appelReserve();
  const { event_type: _eventType, ...sansEvent } = appelReserve();
  const { invitee: _invitee, ...sansInvitee } = appelReserve();
  assert.equal(hookType, 'Call booked');

  for (const [corps, statut, manque] of [
    [sansDeclencheur, 200, 'declencheur'],
    [sansEvent, 200, 'event'],
    [sansInvitee, 422, 'email'],
  ]) {
    const { ctx, ac, lignes } = contexte(PROD);
    assert.equal((await traiterReservation(webhook(corps), ctx)).status, statut);
    assert.equal(ac.appels.length, 0);
    assert.equal(lignes.length, 1);
    assert.equal(lignes[0][1].manque, manque);
    assert.ok(lignes[0][1].forme.includes('tracking.utm_source'));
    sansDonneePersonnelle(lignes);
  }
});

test('forme : les noms des champs seulement, et pas le texte des questions', () => {
  const chemins = forme(appelReserve());
  assert.ok(chemins.includes('invitee.email'));
  assert.ok(chemins.includes('event_type.slug'));
  assert.ok(chemins.includes('questions_and_answers.1_question'));
  assert.ok(chemins.includes('questions_and_answers.«autre»'));
  assert.equal(chemins.some((chemin) => chemin.includes('projet')), false);
  // Un nom de champ fait de chiffres (un numéro, par exemple) n'est pas recopié.
  assert.deepEqual(forme({ 33639980101: true, liste: [{ a: 1 }] }), ['«autre»', 'liste', 'liste[].a']);
  assert.ok(forme(Object.fromEntries(Array.from({ length: 300 }, (_, i) => [`champ_${i}`, i]))).length <= 80);
});

test('preview : n’écrit que pour l’adresse de test', async () => {
  const preview = { ...PROD, VERCEL_ENV: 'preview' };

  const sansAdresse = contexte(preview);
  const simulation = await traiterReservation(webhook(appelReserve()), sansAdresse.ctx);
  assert.deepEqual(await simulation.json(), { ok: true, simulation: true });
  assert.equal(sansAdresse.ac.appels.length, 0);

  const autreAdresse = contexte({ ...preview, LEAD_TEST_EMAIL: 'test@exemple.fr' });
  assert.deepEqual(await (await traiterReservation(webhook(appelReserve()), autreAdresse.ctx)).json(), {
    ok: true,
    simulation: true,
  });
  assert.equal(autreAdresse.ac.appels.length, 0);

  const adresseDeTest = contexte({ ...preview, LEAD_TEST_EMAIL: ' CAMILLE@exemple.fr ' });
  assert.deepEqual(await (await traiterReservation(webhook(appelReserve()), adresseDeTest.ctx)).json(), { ok: true });
  assert.equal(adresseDeTest.ac.appels.length, 1);

  // Hors de Vercel (développement), même règle que sur une preview.
  const { VERCEL_ENV: _env, ...local } = PROD;
  const enLocal = contexte(local);
  assert.deepEqual(await (await traiterReservation(webhook(appelReserve()), enLocal.ctx)).json(), {
    ok: true,
    simulation: true,
  });
  assert.equal(enLocal.ac.appels.length, 0);
});

test('variables ActiveCampaign absentes : 503, sans rien écrire', async () => {
  const { ACTIVECAMPAIGN_API_KEY: _cle, ...sansCle } = PROD;
  const { ctx, ac, lignes } = contexte(sansCle);
  assert.equal((await traiterReservation(webhook(appelReserve()), ctx)).status, 503);
  assert.equal(ac.appels.length, 0);
  assert.equal(lignes.length, 1);
});

test('ActiveCampaign en panne : une nouvelle tentative, puis 502, journal sans donnée personnelle', async () => {
  const passagere = contexte(PROD, fauxActiveCampaign(500, 200));
  assert.equal((await traiterReservation(webhook(appelReserve()), passagere.ctx)).status, 200);
  assert.equal(passagere.ac.appels.length, 2);

  for (const statuts of [[500, 500], ['panne', 'panne'], [422]]) {
    const { ctx, ac, lignes } = contexte(PROD, fauxActiveCampaign(...statuts));
    const reponse = await traiterReservation(webhook(appelReserve()), ctx);
    assert.equal(reponse.status, 502);
    assert.deepEqual(await reponse.json(), { ok: false, erreur: 'indisponible' });
    assert.equal(ac.appels.length, statuts.length);
    assert.equal(lignes.length, 1);
    sansDonneePersonnelle(lignes);
  }
});

test('construireContactRdv : sans nom d’event, seul « Prise de RDV » est écrit', () => {
  assert.deepEqual(construireContactRdv({ email: 'camille@exemple.fr' }), {
    email: 'camille@exemple.fr',
    fieldValues: [{ field: '3', value: 'VSL' }],
    tags: ['vsl-rdv'],
  });
});
