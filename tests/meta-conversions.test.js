import assert from 'node:assert/strict';
import { test } from 'node:test';
import { empreinteEmail, empreintePrenom, empreinteTelephone } from '../serveur/empreinte.js';
import { PIXEL_META } from '../partage/meta.js';
import { accesConversions, construireEvenement, envoiPermis, envoyerEvenement, regleConsentement } from '../serveur/meta-conversions.js';
import { CONSENTEMENT_META } from '../serveur/reglages.js';
import { suivreInscription } from '../serveur/suivi-inscription.js';
import { fauxJournal, fauxMonde, PROD } from './faux.js';

const MAINTENANT = new Date('2026-11-18T19:30:00Z');
const INSCRIPTION = {
  email: 'camille@exemple.fr',
  prenom: 'Camille',
  telephone: '+33639980101',
  variante: 'inscription/90-jours',
  utm: { utm_id: '120212345678901234', fbclid: 'IwAR0abcDEF_123-xyz' },
  accord: true,
  ip: '203.0.113.7',
  ua: 'Navigateur de test',
  fbp: 'fb.1.1795000000000.123456789',
  fbc: '',
  adresse: 'https://decouvrir.academie-florale.fr/inscription',
  idEvenement: 'lead-0001-test',
};

test('réglage : le jeton suffit (le pixel de l’Académie est connu), code de test facultatif', () => {
  assert.equal(accesConversions({}), null);
  assert.equal(accesConversions({ META_PIXEL_ID: '1234567890123456' }), null);
  // Sans autre pixel indiqué, c'est celui de l'Académie, le même que dans les pages.
  assert.equal(accesConversions({ META_CAPI_TOKEN: 'jeton' }).pixel, PIXEL_META);
  assert.match(PIXEL_META, /^\d{8,20}$/);
  assert.equal(accesConversions({ META_PIXEL_ID: 'pas-un-pixel', META_CAPI_TOKEN: 'jeton' }), null);
  assert.deepEqual(accesConversions({ META_PIXEL_ID: ' 1234567890123456 ', META_CAPI_TOKEN: ' jeton ', META_TEST_EVENT_CODE: 'TEST12345' }), {
    pixel: '1234567890123456',
    jeton: 'jeton',
    version: 'v27.0',
    codeDeTest: 'TEST12345',
  });
});

test('accord : pas de bandeau, tout part ; la règle se change par une variable', () => {
  // Décision de l'Académie du 18/11/2026 : « Pas de bandeau, on charge sans consentement ».
  assert.equal(CONSENTEMENT_META, 'non-requis');
  assert.equal(regleConsentement({}), 'non-requis');
  assert.equal(regleConsentement({ META_CONSENTEMENT: ' requis ' }), 'requis');
  assert.equal(regleConsentement({ META_CONSENTEMENT: 'autre chose' }), 'non-requis');
  assert.equal(envoiPermis(undefined), true);
  assert.equal(envoiPermis(false, 'non-requis'), true);
  // Si un jour l'accord redevient requis, rien ne part sans lui.
  assert.equal(envoiPermis(true, 'requis'), true);
  assert.equal(envoiPermis(false, 'requis'), false);
  assert.equal(envoiPermis(undefined, 'requis'), false);
});

test('événement : coordonnées en empreintes, jamais en clair', () => {
  const evenement = construireEvenement({
    nom: 'Lead',
    id: 'lead-1',
    instant: MAINTENANT,
    origine: 'website',
    adresse: 'https://decouvrir.academie-florale.fr/inscription',
    personne: { email: 'Camille@Exemple.fr', telephone: '+33639980101', prenom: 'Camille', ip: '203.0.113.7', ua: 'Navigateur', fbc: 'fb.1.1.abcdefgh', fbp: 'fb.1.2.345' },
    donnees: { content_name: 'inscription/90-jours' },
  });
  assert.deepEqual(evenement, {
    event_name: 'Lead',
    event_time: 1795030200,
    event_id: 'lead-1',
    action_source: 'website',
    user_data: {
      em: [empreinteEmail('camille@exemple.fr')],
      external_id: [empreinteEmail('camille@exemple.fr')],
      ph: [empreinteTelephone('+33639980101')],
      fn: [empreintePrenom('camille')],
      fbc: 'fb.1.1.abcdefgh',
      fbp: 'fb.1.2.345',
      client_user_agent: 'Navigateur',
      client_ip_address: '203.0.113.7',
    },
    event_source_url: 'https://decouvrir.academie-florale.fr/inscription',
    custom_data: { content_name: 'inscription/90-jours' },
  });
  assert.equal(/camille|exemple|639980101/i.test(JSON.stringify(evenement)), false);
});

test('événement : sans navigateur connu, il n’est pas déclaré « site web » ; une vente est « au téléphone »', () => {
  const rdv = construireEvenement({ nom: 'Schedule', id: 'rdv-9', instant: MAINTENANT, origine: 'website', adresse: 'https://decouvrir.academie-florale.fr/call', personne: { email: 'a@b.fr' } });
  assert.equal(rdv.action_source, 'other');
  assert.equal('event_source_url' in rdv, false);
  assert.equal('client_user_agent' in rdv.user_data, false);
  const achat = construireEvenement({ nom: 'Purchase', id: 'vente-1', instant: MAINTENANT, origine: 'phone_call', personne: { email: 'a@b.fr' }, donnees: { currency: 'EUR', value: 3000 } });
  assert.equal(achat.action_source, 'phone_call');
  assert.deepEqual(achat.custom_data, { currency: 'EUR', value: 3000 });
});

test('envoi : le jeton dans un en-tête, le pixel dans l’adresse, la réponse de Meta lue', async () => {
  const evenement = construireEvenement({ nom: 'Lead', id: 'lead-1', instant: MAINTENANT, origine: 'other', personne: { email: 'a@b.fr' } });
  const monde = fauxMonde({ meta: () => ({ events_received: 1, fbtrace_id: 'x' }) });
  const env = { ...PROD, META_TEST_EVENT_CODE: 'TEST12345' };
  assert.deepEqual(await envoyerEvenement(env, evenement, { fetchImpl: monde.fetchImpl, maintenant: MAINTENANT }), { etat: 'ok', statut: 200 });
  const [demande] = monde.vers('meta');
  assert.equal(demande.url.href, 'https://graph.facebook.com/v27.0/1234567890123456/events');
  assert.equal(demande.options.headers.Authorization, 'Bearer jeton-conversions-de-test');
  assert.deepEqual(demande.corps, { data: [evenement], test_event_code: 'TEST12345' });
  assert.equal(JSON.stringify(demande.corps).includes('jeton-conversions-de-test'), false);

  assert.deepEqual(await envoyerEvenement({}, evenement), { etat: 'a-brancher' });
  // Meta refuse un événement de plus de 7 jours : on ne l'envoie pas.
  const tard = new Date(MAINTENANT.getTime() + 7 * 86400000);
  assert.deepEqual(await envoyerEvenement(PROD, evenement, { fetchImpl: monde.fetchImpl, maintenant: tard }), { etat: 'trop-ancien' });
  assert.equal(monde.vers('meta').length, 1);

  const refus = fauxMonde({ meta: () => new Response(JSON.stringify({ error: { message: 'Invalid OAuth access token.' } }), { status: 400 }) });
  assert.deepEqual(await envoyerEvenement(PROD, evenement, { fetchImpl: refus.fetchImpl, maintenant: MAINTENANT }), { etat: 'erreur', statut: 400, detail: 'Invalid OAuth access token.' });
  const panne = async () => {
    throw new TypeError('fetch failed');
  };
  assert.deepEqual(await envoyerEvenement(PROD, evenement, { fetchImpl: panne, maintenant: MAINTENANT }), { etat: 'erreur', statut: 0, detail: 'Meta est injoignable' });
});

test('après une inscription : publicité retenue, puis « Prospect » envoyé une seule fois', async () => {
  const monde = fauxMonde({ meta: () => ({ events_received: 1 }) });
  const { journal, lignes } = fauxJournal();
  const options = { env: PROD, fetchImpl: monde.fetchImpl, maintenant: MAINTENANT, journal };

  assert.deepEqual(await suivreInscription({ ...options, inscription: INSCRIPTION }), { retenue: true, nouvelle: true, meta: 'ok' });
  const [envoi] = monde.vers('meta');
  const [evenement] = envoi.corps.data;
  assert.equal(evenement.event_name, 'Lead');
  assert.equal(evenement.event_id, 'lead-0001-test');
  assert.equal(evenement.action_source, 'website');
  assert.equal(evenement.event_source_url, 'https://decouvrir.academie-florale.fr/inscription');
  assert.equal(evenement.user_data.fbc, `fb.1.${MAINTENANT.getTime()}.IwAR0abcDEF_123-xyz`);
  assert.deepEqual(evenement.custom_data, { content_name: 'inscription/90-jours' });

  // La même adresse qui se réinscrit ne fait pas un second prospect.
  assert.deepEqual(await suivreInscription({ ...options, inscription: { ...INSCRIPTION, idEvenement: 'lead-0002-test' } }), { retenue: true, nouvelle: false, meta: 'deja' });
  assert.equal(monde.vers('meta').length, 1);

  // Pas de bandeau : une inscrite à qui l'on n'a rien demandé est envoyée aussi, avec l'identifiant de clic du pixel s'il existe.
  const sansQuestion = await suivreInscription({ ...options, inscription: { ...INSCRIPTION, email: 'lea@exemple.fr', accord: false, fbc: 'fb.1.1795000000001.ClicDuPixel_0001' } });
  assert.deepEqual(sansQuestion, { retenue: true, nouvelle: true, meta: 'ok' });
  assert.equal(monde.vers('meta').length, 2);
  assert.equal(monde.vers('meta')[1].corps.data[0].user_data.fbc, 'fb.1.1795000000001.ClicDuPixel_0001');

  // Si l'accord redevenait requis : la publicité resterait retenue pour le cockpit, rien ne partirait chez Meta.
  const requis = { ...options, env: { ...PROD, META_CONSENTEMENT: 'requis' } };
  const sansAccord = await suivreInscription({ ...requis, inscription: { ...INSCRIPTION, email: 'ines@exemple.fr', accord: false } });
  assert.deepEqual(sansAccord, { retenue: true, nouvelle: true, meta: 'sans-accord' });
  assert.equal(monde.vers('meta').length, 2);

  // Sans jeton : rien à envoyer.
  const { META_CAPI_TOKEN: _, ...sansJeton } = PROD;
  assert.equal((await suivreInscription({ ...options, env: sansJeton, inscription: { ...INSCRIPTION, email: 'zoe@exemple.fr' } })).meta, 'a-brancher');
  assert.equal(JSON.stringify(lignes).includes('exemple'), false);
});

test('après une inscription : un refus de Meta se note, sans donnée personnelle', async () => {
  const monde = fauxMonde({ meta: () => new Response(JSON.stringify({ error: { message: 'Permission manquante' } }), { status: 403 }) });
  const { journal, lignes } = fauxJournal();
  const resultat = await suivreInscription({ env: PROD, inscription: INSCRIPTION, fetchImpl: monde.fetchImpl, maintenant: MAINTENANT, journal });
  assert.deepEqual(resultat, { retenue: true, nouvelle: true, meta: 'erreur' });
  assert.deepEqual(lignes, [['lead : échec de l’API de conversion', { statut: 403 }]]);
  const [etat] = await monde.commandes(['HGET', 'af:c1:etat', 'conversions']);
  assert.deepEqual(JSON.parse(etat), { t: MAINTENANT.toISOString(), nom: 'Lead', ok: false, detail: 'Permission manquante' });
});
