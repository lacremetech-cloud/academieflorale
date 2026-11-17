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

test('téléphone : l’indicatif vient du pays choisi', () => {
  assert.equal(nettoyerTelephone('0470 12 34 56', 'BE'), '+32470123456');
  assert.equal(nettoyerTelephone('02 123 45 67', 'BE'), '+3221234567');
  assert.equal(nettoyerTelephone('079 123 45 67', 'CH'), '+41791234567');
  assert.equal(nettoyerTelephone('621 123 456', 'LU'), '+352621123456');
  assert.equal(nettoyerTelephone('514 555 0123', 'CA'), '+15145550123');
  assert.equal(nettoyerTelephone('0692 12 34 56', 're'), '+262692123456');
  assert.equal(nettoyerTelephone('0612 345678', 'MA'), '+212612345678');
});

test('téléphone : un numéro déjà international passe quel que soit le pays choisi', () => {
  assert.equal(nettoyerTelephone('+41 79 123 45 67', 'FR'), '+41791234567');
  assert.equal(nettoyerTelephone('0032 470 12 34 56', 'FR'), '+32470123456');
  assert.equal(nettoyerTelephone('+33 (0)6 12 34 56 78', 'BE'), '+33612345678');
  assert.equal(nettoyerTelephone('+81 90 1234 5678', ''), '+819012345678');
});

test('téléphone : mauvais nombre de chiffres ou pays inconnu sans indicatif', () => {
  assert.equal(nettoyerTelephone('06 12 34 56 78', 'CH'), '+41612345678');
  assert.equal(nettoyerTelephone('0470 12 34', 'BE'), '');
  assert.equal(nettoyerTelephone('079 123 45', 'CH'), '');
  assert.equal(nettoyerTelephone('06 12 34 56 78', ''), '');
  assert.equal(nettoyerTelephone('06 12 34 56 78', 'ZZ'), '');
  assert.equal(nettoyerTelephone('06 12 34 56 78', '__proto__'), '');
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
