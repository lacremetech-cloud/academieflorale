import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { VARIANTES_EN_TEST, choisirVariante, empreinte } from '../partage/repartition.js';

test('le même clic revoit toujours la même promesse', () => {
  for (const fbclid of ['IwAR0abc', 'IwZXh0bgNhZW0CMTAAAR1', 'x']) {
    const premiere = choisirVariante(fbclid);
    for (let i = 0; i < 20; i += 1) assert.equal(choisirVariante(fbclid), premiere);
    assert.ok(VARIANTES_EN_TEST.includes(premiere));
  }
  assert.equal(empreinte('abc'), empreinte('abc'));
});

test('les clics se répartissent à parts égales entre les promesses', () => {
  const comptes = Object.fromEntries(VARIANTES_EN_TEST.map((v) => [v, 0]));
  const total = 30000;
  for (let i = 0; i < total; i += 1) comptes[choisirVariante(`IwAR${i.toString(36)}x${(i * 7919).toString(16)}`)] += 1;
  const attendu = total / VARIANTES_EN_TEST.length;
  for (const [variante, n] of Object.entries(comptes)) {
    assert.ok(Math.abs(n - attendu) / attendu < 0.03, `${variante} : ${n} sur ${total}`);
  }
});

test('des identifiants qui se suivent ne tombent pas ensemble', () => {
  const suite = Array.from({ length: 300 }, (_, i) => choisirVariante(`clic-${i}`));
  const changements = suite.filter((v, i) => i > 0 && v !== suite[i - 1]).length;
  assert.ok(changements > 150, `${changements} changements sur 299`);
});

test('sans identifiant : tirage au hasard, à parts égales', () => {
  assert.equal(choisirVariante(null, () => 0), VARIANTES_EN_TEST[0]);
  assert.equal(choisirVariante('', () => 0.5), VARIANTES_EN_TEST[1]);
  assert.equal(choisirVariante(undefined, () => 0.999999), VARIANTES_EN_TEST.at(-1));
  assert.equal(choisirVariante(null, () => 1), VARIANTES_EN_TEST.at(-1));
});

test('chaque promesse en test existe bien parmi les variantes de la landing', () => {
  const source = readFileSync(new URL('../src/contenu/landings.ts', import.meta.url), 'utf8');
  const slugs = [...source.matchAll(/slug: '([^']+)'/g)].map((m) => m[1]);
  for (const variante of VARIANTES_EN_TEST) assert.ok(slugs.includes(variante), variante);
  assert.equal(slugs[0], VARIANTES_EN_TEST[0], 'la première variante sert de repli');
});
