import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  BRUTS,
  CHAMPS_SAISIE,
  chiffresDeVente,
  indicateurs,
  jourParis,
  joursDuMois,
  joursEcoules,
  jourVide,
  lireSaisie,
  moisCourant,
  moisDecale,
  moisValide,
  totaliser,
} from '../partage/cockpit.js';

/** Une journée du tableau publicitaire d'origine (10/03), sans son second appel. */
const JOUR = {
  depense: 222,
  impressions: 31429,
  clics: 385,
  vues: 340,
  inscrits: 29,
  chargements: 30,
  lectures: 24,
  heures: 2.1,
  appels: 3,
  annules: 0,
  absentes: 0,
  ventes: 1,
  contracte: 3000,
  encaisse: 3000,
};

const proche = (reel, attendu, tolerance = 0.005) =>
  assert.ok(Math.abs(reel - attendu) <= tolerance, `${reel} au lieu de ${attendu}`);

test('mois : validité, jours, voisins', () => {
  assert.equal(moisValide('2026-11'), true);
  for (const faux of ['2026-13', '2026-00', '26-11', '2026-1', '2023-12', '', null, 202611]) {
    assert.equal(moisValide(faux), false);
  }
  assert.equal(joursDuMois('2026-11').length, 30);
  assert.equal(joursDuMois('2026-11')[0], '2026-11-01');
  assert.equal(joursDuMois('2026-11').at(-1), '2026-11-30');
  assert.equal(joursDuMois('2028-02').length, 29);
  assert.equal(moisDecale('2026-01', -1), '2025-12');
  assert.equal(moisDecale('2026-12', 1), '2027-01');
  assert.equal(moisDecale('2026-11', 0), '2026-11');
  // Les jours déjà commencés d'un mois, à l'heure de Paris.
  assert.equal(joursEcoules('2026-10', new Date('2026-11-18T10:00:00Z')).length, 31);
  assert.equal(joursEcoules('2026-11', new Date('2026-11-18T10:00:00Z')).at(-1), '2026-11-18');
  assert.equal(joursEcoules('2026-11', new Date('2026-11-18T23:30:00Z')).at(-1), '2026-11-19');
  assert.deepEqual(joursEcoules('2026-12', new Date('2026-11-18T10:00:00Z')), []);
});

test('jour à l’heure de Paris, été comme hiver', () => {
  assert.equal(jourParis('2026-11-18T22:59:59Z'), '2026-11-18');
  assert.equal(jourParis('2026-11-18T23:00:00Z'), '2026-11-19');
  assert.equal(jourParis('2026-07-01T21:59:59Z'), '2026-07-01');
  assert.equal(jourParis('2026-07-01T22:00:00Z'), '2026-07-02');
  assert.equal(jourParis('pas une date'), '');
  assert.equal(moisCourant(new Date('2026-11-30T23:30:00Z')), '2026-12');
});

test('indicateurs : les mêmes calculs que le tableau publicitaire', () => {
  const i = indicateurs(JOUR);
  proche(i.cpm, 7.06, 0.01); // 7,1 € dans le tableau
  proche(i.ctr, 0.01225, 0.0001); // 1,2 %
  proche(i.cpc, 0.577, 0.001); // 0,6 €
  proche(i.cpp, 7.655, 0.001); // 7,6 €
  proche(i.tauxInscription, 0.0753, 0.0001); // 8 %
  proche(i.tauxAppel, 0.1034, 0.0001); // 10,3 %
  proche(i.cpa, 74, 0.001); // 74 €
  assert.equal(i.tauxAnnulation, 0);
  assert.equal(i.maintenus, 3);
  proche(i.cpaMaintenu, 74, 0.001);
  proche(i.tauxClosing, 1 / 3, 0.0001);
  assert.equal(i.reste, 0);
  assert.equal(i.cpv, 222);
  proche(i.roas, 13.51, 0.01); // 13,5
  proche(i.roasDirect, 13.51, 0.01);
  proche(i.tauxLecture, 0.8, 0.0001);
  proche(i.minutesVues, 5.25, 0.0001);
  proche(i.partVue, 0.4992, 0.001);
});

test('indicateurs : annulations, reste à encaisser, et jamais de division par zéro', () => {
  const i = indicateurs({ ...JOUR, appels: 12, annules: 2, ventes: 1, contracte: 3800, encaisse: 1000, depense: 164 });
  assert.equal(i.maintenus, 10);
  proche(i.tauxAnnulation, 2 / 12, 0.0001); // 16,7 %
  proche(i.cpaMaintenu, 16.4, 0.001);
  assert.equal(i.reste, 2800);
  proche(i.roas, 23.17, 0.01);
  proche(i.roasDirect, 6.1, 0.01);

  const zero = indicateurs({ ...jourVide(), depense: 150, impressions: 0, clics: 0, inscrits: 0, appels: 0, annules: 0, ventes: 0 });
  for (const cle of ['cpm', 'ctr', 'cpc', 'cpp', 'tauxInscription', 'cpa', 'tauxAnnulation', 'cpaMaintenu', 'tauxClosing', 'cpv']) {
    assert.equal(zero[cle], null, cle);
  }
  assert.equal(zero.maintenus, 0);
});

test('indicateurs : une source non branchée donne des tirets, pas des zéros', () => {
  const i = indicateurs({ ...jourVide(), depense: 200, impressions: 20000, clics: 300 });
  proche(i.cpm, 10);
  for (const cle of ['cpp', 'tauxInscription', 'tauxAppel', 'cpa', 'maintenus', 'tauxClosing', 'reste', 'roas', 'roasDirect', 'tauxLecture', 'minutesVues', 'partVue']) {
    assert.equal(i[cle], null, cle);
  }
  const sansEncaisse = indicateurs({ ...jourVide(), depense: 200, ventes: 1, contracte: 3000 });
  assert.equal(sansEncaisse.roas, 15);
  assert.equal(sansEncaisse.roasDirect, null);
});

test('totaux : somme des jours, et null quand aucun jour n’a le chiffre', () => {
  const total = totaliser([JOUR, { ...JOUR, depense: 100, ventes: 0, contracte: 0, encaisse: 0 }, jourVide()]);
  assert.equal(total.depense, 322);
  assert.equal(total.inscrits, 58);
  assert.equal(total.ventes, 1);
  assert.deepEqual(Object.keys(total), [...BRUTS]);
  const partiel = totaliser([{ ...jourVide(), depense: 10 }, { ...jourVide(), depense: 5 }]);
  assert.equal(partiel.depense, 15);
  assert.equal(partiel.inscrits, null);
  // Le total du mois se calcule sur les sommes, pas sur la moyenne des jours.
  proche(indicateurs(total).cpp, 322 / 58, 0.0001);
});

test('saisie à la main : montants à la française, rien pour zéro, refus de l’illisible', () => {
  assert.deepEqual([...CHAMPS_SAISIE], ['ventes', 'encaisse', 'reste']);
  assert.equal(lireSaisie('ventes', '2'), 2);
  assert.equal(lireSaisie('ventes', 3), 3);
  assert.equal(lireSaisie('encaisse', '1\u202f500,50 €'), 1500.5);
  assert.equal(lireSaisie('encaisse', '1 500'), 1500);
  assert.equal(lireSaisie('reste', '2000.00'), 2000);
  // Case vidée ou zéro : rien à garder.
  for (const rien of ['', '   ', '0', 0, null, undefined]) assert.equal(lireSaisie('encaisse', rien), null);
  // Illisible, négatif, démesuré, ventes à virgule, champ inconnu.
  for (const faux of ['abc', '-5', '1,234', '1.2.3', '1e3', {}, true]) assert.equal(lireSaisie('encaisse', faux), undefined);
  assert.equal(lireSaisie('ventes', '1,5'), undefined);
  assert.equal(lireSaisie('ventes', 1000), undefined);
  assert.equal(lireSaisie('encaisse', 10000000), undefined);
  assert.equal(lireSaisie('depense', '5'), undefined);
});

test('ventes saisies : le contracté est l’encaissé plus le reste à encaisser', () => {
  assert.deepEqual(chiffresDeVente(undefined), { ventes: 0, encaisse: 0, contracte: 0 });
  assert.deepEqual(chiffresDeVente({ ventes: 1, encaisse: 1000, reste: 2000 }), { ventes: 1, encaisse: 1000, contracte: 3000 });
  assert.deepEqual(chiffresDeVente({ ventes: 2, reste: 3800 }), { ventes: 2, encaisse: 0, contracte: 3800 });
  assert.deepEqual(chiffresDeVente({ encaisse: 0.1, reste: 0.2 }), { ventes: 0, encaisse: 0.1, contracte: 0.3 });
  // Dans le cockpit : « Recu. » retrouve bien le reste saisi, « Cum. » le total.
  const jour = { ...jourVide(), depense: 200, appels: 4, annules: 1, ...chiffresDeVente({ ventes: 1, encaisse: 1000, reste: 2000 }) };
  const i = indicateurs(jour);
  assert.equal(i.reste, 2000);
  assert.equal(i.roas, 15);
  assert.equal(i.roasDirect, 5);
  assert.equal(i.cpv, 200);
});
