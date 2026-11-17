import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formaterRdv, instantSur, lireRetourIclosed, rechercheSansDonnees } from '../partage/rdv.js';

/** Adresse de retour telle qu'iClosed la compose (paramètres de sa documentation). */
const RETOUR =
  '?assigned_to=Closer%20Exemple&event_type_uuid=evt-1&closer_id=42&timeZone=Europe%2FParis&language=fr' +
  '&event_type_name=Appel%20de%20candidature&event_start_time=2026-11-20T18%3A00%3A00%2B01%3A00' +
  '&event_end_time=2026-11-20T18%3A45%3A00%2B01%3A00&invitee_uuid=contact-1&invitee_full_name=camille%20Martin' +
  '&Invitee_email=camille%40exemple.fr&text_reminder_number=%2B33639980101&answer_1=camille%40exemple.fr' +
  '&hyros=enabled&previewId=appel-123&utm_source=meta&utm_campaign=vsl&fbclid=abc123';

test('retour d’iClosed : identifiant, prénom et instant de l’appel, rien d’autre', () => {
  assert.deepEqual(lireRetourIclosed(RETOUR), {
    id: 'appel-123',
    prenom: 'Camille',
    debut: '2026-11-20T17:00:00.000Z',
    details: true,
  });
});

test('retour d’iClosed : le prénom est le premier mot du nom, nettoyé', () => {
  assert.equal(lireRetourIclosed('?previewId=a&invitee_full_name=%20anne-sophie%20%20de%20la%20Tour')?.prenom, 'Anne-Sophie');
  assert.equal(lireRetourIclosed('?previewId=a&invitee_full_name=%3Cscript%3Ealert(1)%3C%2Fscript%3E')?.prenom, 'Script');
  assert.equal(lireRetourIclosed('?previewId=a&invitee_full_name=12345')?.prenom, '');
  assert.equal(lireRetourIclosed('?previewId=a')?.prenom, '');
});

test('retour d’iClosed : sans identifiant d’appel, pas de code de confirmation', () => {
  assert.deepEqual(lireRetourIclosed('?invitee_uuid=contact%2F1&invitee_full_name=Camille'), {
    id: 'contact1',
    prenom: 'Camille',
    debut: '',
    details: false,
  });
  assert.equal(lireRetourIclosed('?event_start_time=2026-11-20T18:00:00Z')?.id, '');
});

test('sans réservation : une visite directe, même avec des UTM, n’est pas un retour d’iClosed', () => {
  assert.equal(lireRetourIclosed(''), null);
  assert.equal(lireRetourIclosed('?utm_source=meta&fbclid=abc'), null);
  assert.equal(lireRetourIclosed('?previewId='), null);
  assert.equal(lireRetourIclosed('?invitee_full_name=Camille'), null);
});

test('instant de l’appel : seulement une date qui porte son décalage horaire', () => {
  assert.equal(instantSur('2026-11-20T18:00:00+01:00'), '2026-11-20T17:00:00.000Z');
  assert.equal(instantSur('2026-11-20T17:00:00.000Z'), '2026-11-20T17:00:00.000Z');
  assert.equal(instantSur('2026-11-20T12:00-05:00'), '2026-11-20T17:00:00.000Z');
  // Décalage sans « : », et « + » arrivé sous la forme d'une espace.
  assert.equal(instantSur('2026-11-20T18:00:00+0100'), '2026-11-20T17:00:00.000Z');
  assert.equal(instantSur('2026-11-20T18:00:00 01:00'), '2026-11-20T17:00:00.000Z');
  // Sans décalage, l'heure pourrait être lue dans le mauvais fuseau : on n'affiche rien.
  for (const ambigu of ['2026-11-20T18:00:00', '2026-11-20 18:00', '20/11/2026 18:00', '1795197600', 'demain', '', null, 12]) {
    assert.equal(instantSur(ambigu), '');
  }
  assert.equal(instantSur('2026-13-45T18:00:00Z'), '');
});

test('date affichée : en français, dans le fuseau demandé', () => {
  assert.equal(formaterRdv('2026-11-20T17:00:00.000Z', 'Europe/Paris'), 'vendredi 20 novembre à 18:00');
  assert.equal(formaterRdv('2026-11-20T17:00:00.000Z', 'America/Montreal'), 'vendredi 20 novembre à 12:00');
  assert.equal(formaterRdv('2026-07-03T07:30:00.000Z', 'Europe/Brussels'), 'vendredi 3 juillet à 09:30');
  assert.equal(formaterRdv('', 'Europe/Paris'), '');
  assert.equal(formaterRdv('pas une date', 'Europe/Paris'), '');
});

test('adresse nettoyée : seuls les paramètres d’attribution restent', () => {
  assert.equal(rechercheSansDonnees(RETOUR), '?utm_source=meta&utm_campaign=vsl&fbclid=abc123');
  assert.equal(rechercheSansDonnees('?previewId=a&Invitee_email=camille%40exemple.fr&text_reminder_number=%2B33639980101'), '');
  assert.equal(rechercheSansDonnees('?utm_content=pub%2031'), '?utm_content=pub+31');
  assert.equal(rechercheSansDonnees(''), '');
  const propre = rechercheSansDonnees(RETOUR);
  for (const interdit of ['camille', 'Martin', 'exemple.fr', '639980101', 'appel-123', 'contact-1', 'Closer']) {
    assert.equal(propre.includes(interdit), false, `« ${interdit} » ne doit pas rester dans l’adresse`);
  }
});
