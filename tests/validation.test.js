import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  nettoyerEmail,
  nettoyerPrenom,
  nettoyerSlug,
  nettoyerTelephone,
  nettoyerUTM,
  prenomAffichable,
} from '../partage/validation.js';

test('prénom : majuscule initiale, espaces et casse normalisés', () => {
  assert.equal(nettoyerPrenom('  jean-pierre '), 'Jean-Pierre');
  assert.equal(nettoyerPrenom('MARIE'), 'Marie');
  assert.equal(nettoyerPrenom('élodie'), 'Élodie');
  assert.equal(nettoyerPrenom('marie   claire'), 'Marie Claire');
  assert.equal(nettoyerPrenom("d'arc"), "D'Arc");
});

test('prénom : rien d’autre que des lettres, jamais de balise', () => {
  const p = nettoyerPrenom('<img src=x onerror=alert(1)>Léa');
  assert.ok(!/[<>=()0-9]/.test(p));
  assert.equal(nettoyerPrenom('123'), '');
  assert.equal(nettoyerPrenom(''), '');
  assert.equal(nettoyerPrenom('  -  '), '');
  assert.equal(nettoyerPrenom(null), '');
  assert.equal(nettoyerPrenom({ prenom: 'x' }), '');
});

test('prénom : longueur limitée', () => {
  assert.ok(nettoyerPrenom('a'.repeat(200)).length <= 40);
  assert.equal(prenomAffichable('Marie-Charlotte Dupont de la Rivière'), 'Marie-Charlotte');
  assert.equal(prenomAffichable('a'.repeat(30)), '');
  assert.equal(prenomAffichable('sybile'), 'Sybile');
});

test('email : minuscules, formats invalides refusés', () => {
  assert.equal(nettoyerEmail('  Test@Exemple.FR '), 'test@exemple.fr');
  assert.equal(nettoyerEmail('prenom.nom+pub@exemple.co.uk'), 'prenom.nom+pub@exemple.co.uk');
  for (const invalide of ['a@b', 'nom@domaine', 'a..b@c.fr', 'nom @exemple.fr', '@exemple.fr', 'nom@.fr', '', null, 42]) {
    assert.equal(nettoyerEmail(invalide), '', String(invalide));
  }
  assert.equal(nettoyerEmail('a'.repeat(250) + '@exemple.fr'), '');
});

test('téléphone : format international', () => {
  assert.equal(nettoyerTelephone('06 12 34 56 78'), '+33612345678');
  assert.equal(nettoyerTelephone('06.12.34.56.78'), '+33612345678');
  assert.equal(nettoyerTelephone('+33 6 12 34 56 78'), '+33612345678');
  assert.equal(nettoyerTelephone('0033612345678'), '+33612345678');
  assert.equal(nettoyerTelephone('+33 (0)6 12 34 56 78'), '+33612345678');
  assert.equal(nettoyerTelephone('612345678'), '+33612345678');
  assert.equal(nettoyerTelephone('+32 470 12 34 56'), '+32470123456');
  for (const invalide of ['abc', '06 12', '+33 6 12 34 56', '06 12 34 56 78 9', '', null]) {
    assert.equal(nettoyerTelephone(invalide), '', String(invalide));
  }
});

test('UTM : seules les clés connues, en texte court', () => {
  assert.deepEqual(
    nettoyerUTM({ utm_source: ' meta ', utm_campaign: 'vsl', fbclid: 'abc', autre: 'x', utm_term: 12 }),
    { utm_source: 'meta', utm_campaign: 'vsl', fbclid: 'abc' },
  );
  assert.equal(nettoyerUTM({ utm_source: 'a'.repeat(999) }).utm_source.length, 200);
  assert.deepEqual(nettoyerUTM(null), {});
  assert.deepEqual(nettoyerUTM('utm_source=x'), {});
});

test('identifiant de page', () => {
  assert.equal(nettoyerSlug('inscription/reconversion'), 'inscription/reconversion');
  assert.equal(nettoyerSlug('/Inscription/'), 'inscription');
  assert.equal(nettoyerSlug('../secret'), '');
  assert.equal(nettoyerSlug('a b'), '');
  assert.equal(nettoyerSlug(undefined), '');
});
