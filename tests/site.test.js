import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { DOMAINE_PUBLIC } from '../partage/site.js';

const vercel = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));

test('domaine du tunnel : sa racine mène à la landing, sans toucher aux pages historiques ailleurs', () => {
  const racine = vercel.redirects.find((redirection) => redirection.source === '/');
  // Le domaine s'écrit à deux endroits (partage/site.js et vercel.json) : ils doivent dire la même chose.
  assert.deepEqual(racine, {
    source: '/',
    has: [{ type: 'host', value: new URL(DOMAINE_PUBLIC).host }],
    destination: '/inscription',
    permanent: false,
  });
});

test('suivi des rendez-vous : Vercel appelle /api/booking toutes les dix minutes', () => {
  assert.deepEqual(vercel.crons, [{ path: '/api/booking', schedule: '*/10 * * * *' }]);
  assert.equal(vercel.functions['api/*.js'].maxDuration >= 15, true);
});
