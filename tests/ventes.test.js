import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ajouterJours,
  ajouterMois,
  calculerVentes,
  echeancier,
  encaisseAu,
  FORMULES,
  jourValide,
  lireMontant,
  METHODES,
  normaliserVente,
  partager,
} from '../partage/ventes.js';
import { COOKIE, creerSession } from '../serveur/cockpit/acces.js';
import { traiterCloser, traiterVente } from '../serveur/cockpit/ventes.js';

const AUJOURD_HUI = '2026-11-18';
const lignes = (vente) => echeancier(vente).map((e) => [e.date, e.montant, e.methode]);

test('dates : jours et mois ajoutés, fin de mois comprise', () => {
  assert.equal(jourValide('2026-11-18'), true);
  for (const faux of ['2026-11-31', '2026-13-01', '18/11/2026', '', null, 20261118]) assert.equal(jourValide(faux), false);
  assert.equal(ajouterJours('2026-11-18', 1), '2026-11-19');
  assert.equal(ajouterJours('2026-11-18', 60), '2027-01-17');
  assert.equal(ajouterJours('2026-12-31', 1), '2027-01-01');
  assert.equal(ajouterMois('2026-11-18', 3), '2027-02-18');
  assert.equal(ajouterMois('2026-11-18', 6), '2027-05-18');
  // Le 31 n'existe pas partout : le dernier jour du mois.
  assert.equal(ajouterMois('2026-01-31', 1), '2026-02-28');
  assert.equal(ajouterMois('2028-01-31', 1), '2028-02-29');
  assert.equal(ajouterMois('2026-08-31', 1), '2026-09-30');
});

test('montants : saisie à la française, partage au centime près', () => {
  assert.equal(lireMontant('3 000'), 3000);
  assert.equal(lireMontant('1 500,50 €'), 1500.5);
  assert.equal(lireMontant(2000), 2000);
  for (const rien of ['', '  ', null, undefined]) assert.equal(lireMontant(rien), null);
  for (const faux of ['abc', '-5', '1,234', '1e3', 200001, {}, true]) assert.equal(lireMontant(faux), undefined);
  assert.deepEqual(partager(3000, 6), [500, 500, 500, 500, 500, 500]);
  assert.deepEqual(partager(1000, 3), [333.34, 333.33, 333.33]);
  assert.equal(partager(1000, 3).reduce((s, x) => s + Math.round(x * 100), 0), 100000);
});

test('formules et moyens de paiement de l’Académie', () => {
  assert.deepEqual(Object.values(FORMULES), ['Fleuriste Essentiel', 'Fleuriste Indépendant', 'Fleuriste Business']);
  assert.deepEqual(Object.values(METHODES).map((m) => m.nom), ['GoCardless', 'Virement bancaire', 'seQura', 'CPF']);
});

test('échéancier : l’exemple de la vente à 3 000 € (dépôt GoCardless, le reste en seQura sur 6 mois)', () => {
  const vente = {
    date: AUJOURD_HUI,
    paiements: [
      { methode: 'gocardless', montant: 1000, mensualites: 1, debut: AUJOURD_HUI },
      { methode: 'sequra', montant: 2000, mensualites: 6, debut: AUJOURD_HUI },
    ],
  };
  // Dépôt le jour même ; seQura : 70 % le lendemain, 15 % à 3 mois, 15 % à la fin des 6 mensualités.
  assert.deepEqual(lignes(vente), [
    ['2026-11-18', 1000, 'gocardless'],
    ['2026-11-19', 1400, 'sequra'],
    ['2027-02-18', 300, 'sequra'],
    ['2027-05-18', 300, 'sequra'],
  ]);
  assert.equal(echeancier(vente).reduce((s, e) => s + e.montant, 0), 3000);
  assert.equal(encaisseAu(vente, '2026-11-18'), 1000);
  assert.equal(encaisseAu(vente, '2026-11-19'), 2400);
  assert.equal(encaisseAu(vente, '2027-02-18'), 2700);
  assert.equal(encaisseAu(vente, '2027-05-18'), 3000);
});

test('échéancier : mensualités GoCardless, virement, CPF à 60 jours, seQura au centime près', () => {
  const mensualites = echeancier({ date: '2026-11-18', paiements: [{ methode: 'gocardless', montant: 3000, mensualites: 6, debut: '2026-11-18' }] });
  assert.deepEqual(mensualites.map((e) => e.date), ['2026-11-18', '2026-12-18', '2027-01-18', '2027-02-18', '2027-03-18', '2027-04-18']);
  assert.ok(mensualites.every((e) => e.montant === 500));
  assert.equal(mensualites[1].etape, 'mensualité 2 sur 6');

  assert.deepEqual(lignes({ date: '2026-11-18', paiements: [{ methode: 'virement', montant: 2500, mensualites: 1, debut: '2026-11-20' }] }), [['2026-11-20', 2500, 'virement']]);
  // Le CPF ne se paie qu'en une fois, 60 jours après : le nombre de mensualités est ignoré.
  assert.deepEqual(lignes({ date: '2026-11-18', paiements: [{ methode: 'cpf', montant: 1800, mensualites: 4, debut: '2026-11-18' }] }), [['2027-01-17', 1800, 'cpf']]);
  // seQura sur une somme qui ne tombe pas juste : le total reste exact.
  const sequra = echeancier({ date: '2026-11-18', paiements: [{ methode: 'sequra', montant: 1999.99, mensualites: 10, debut: '2026-11-18' }] });
  assert.deepEqual(sequra.map((e) => e.montant), [1399.99, 300, 300]);
  assert.equal(sequra.at(-1).date, '2027-09-18');
  // Sans date propre, un paiement part de la date de la vente.
  assert.deepEqual(lignes({ date: '2026-11-18', paiements: [{ methode: 'gocardless', montant: 100, mensualites: 1 }] }), [['2026-11-18', 100, 'gocardless']]);
});

test('vente saisie : mise au propre, et refus de ce qui ne tient pas', () => {
  const brute = {
    date: AUJOURD_HUI,
    formule: 'independant',
    montant: '3 000',
    commission: '300',
    paiements: [
      { methode: 'gocardless', montant: '1000', mensualites: 1, debut: '' },
      { methode: 'sequra', montant: 2000, mensualites: 6 },
    ],
    note: '  <b>appel\ndu soir</b> ',
  };
  const lue = normaliserVente(brute, { aujourdHui: AUJOURD_HUI });
  assert.equal(lue.ok, true);
  assert.deepEqual(lue.vente, {
    date: AUJOURD_HUI,
    formule: 'independant',
    montant: 3000,
    commission: 300,
    paiements: [
      { methode: 'gocardless', montant: 1000, mensualites: 1, debut: AUJOURD_HUI },
      { methode: 'sequra', montant: 2000, mensualites: 6, debut: AUJOURD_HUI },
    ],
    note: 'b appel du soir /b',
  });
  const refus = (changement) => normaliserVente({ ...brute, ...changement }, { aujourdHui: AUJOURD_HUI }).erreur;
  assert.equal(refus({ date: '2026-11-19' }), 'date'); // un jour à venir
  assert.equal(refus({ date: '2026-02-30' }), 'date');
  assert.equal(refus({ formule: 'premium' }), 'formule');
  assert.equal(refus({ montant: '' }), 'montant');
  assert.equal(refus({ montant: 'beaucoup' }), 'montant');
  assert.equal(refus({ commission: 3001 }), 'commission');
  assert.equal(refus({ paiements: [] }), 'paiements');
  assert.equal(refus({ paiements: [{ methode: 'cheque', montant: 3000 }] }), 'paiements');
  assert.equal(refus({ paiements: [{ methode: 'gocardless', montant: 3000, mensualites: 0 }] }), 'paiements');
  assert.equal(refus({ paiements: [{ methode: 'gocardless', montant: 3000, mensualites: 2.5 }] }), 'paiements');
  assert.equal(refus({ paiements: [{ methode: 'gocardless', montant: 3000, debut: '2031-01-01' }] }), 'paiements');
  // La somme des paiements doit égaler le montant de la vente.
  assert.equal(refus({ paiements: [{ methode: 'gocardless', montant: 1000 }, { methode: 'sequra', montant: 1500, mensualites: 6 }] }), 'repartition');
  assert.equal(normaliserVente(null, { aujourdHui: AUJOURD_HUI }).erreur, 'vente');
  // Sans commission : zéro.
  assert.equal(normaliserVente({ ...brute, commission: '' }, { aujourdHui: AUJOURD_HUI }).vente.commission, 0);
});

test('cockpit : ventes par jour, encaissements par mois (MRR), reste à encaisser et commissions', () => {
  const ventes = [
    // 18/11 : 3 000 €, dépôt GoCardless 1 000 € + seQura 2 000 € sur 6 mois.
    { id: 'a', date: '2026-11-18', formule: 'independant', montant: 3000, commission: 300, closer: 'c1', closerNom: 'Camille', creeLe: '2026-11-18T09:00:00Z',
      paiements: [{ methode: 'gocardless', montant: 1000, mensualites: 1, debut: '2026-11-18' }, { methode: 'sequra', montant: 2000, mensualites: 6, debut: '2026-11-18' }] },
    // 18/11 aussi : 1 800 € en CPF (payé à 60 jours).
    { id: 'b', date: '2026-11-18', formule: 'essentiel', montant: 1800, commission: 180, closer: 'c2', closerNom: 'Albane', creeLe: '2026-11-18T10:00:00Z',
      paiements: [{ methode: 'cpf', montant: 1800, mensualites: 1, debut: '2026-11-18' }] },
    // 05/10 : 3 000 € en 6 mensualités GoCardless de 500 €.
    { id: 'c', date: '2026-10-05', formule: 'business', montant: 3000, commission: 0, closer: 'c1', closerNom: 'Camille', creeLe: '2026-10-05T10:00:00Z',
      paiements: [{ methode: 'gocardless', montant: 3000, mensualites: 6, debut: '2026-10-05' }] },
  ];
  const novembre = calculerVentes(ventes, { mois: '2026-11', aujourdHui: AUJOURD_HUI });
  assert.deepEqual(novembre.jours, { '2026-11-18': { ventes: 2, contracte: 4800, encaisse: 1000 } });
  assert.deepEqual(novembre.ventes.map((v) => [v.id, v.encaisse, v.reste]), [['a', 1000, 2000], ['b', 0, 1800]]);
  // Novembre : dépôt 1 000 + seQura 1 400 + la mensualité de la vente d'octobre (500).
  const [mois0, mois1, mois2, mois3] = novembre.encaissements;
  assert.equal(novembre.encaissements.length, 12);
  assert.deepEqual([mois0.mois, mois0.total, mois0.encaisse], ['2026-11', 2900, 1500]);
  assert.deepEqual(mois0.parMethode, { gocardless: 1500, virement: 0, sequra: 1400, cpf: 0 });
  // Décembre : la mensualité GoCardless seule ; janvier : la mensualité et le CPF (payé à 60 jours).
  assert.deepEqual([mois1.mois, mois1.total, mois1.parMethode.gocardless], ['2026-12', 500, 500]);
  assert.deepEqual([mois2.mois, mois2.total, mois2.parMethode.cpf], ['2027-01', 2300, 1800]);
  assert.deepEqual([mois3.mois, mois3.total, mois3.parMethode.sequra], ['2027-02', 800, 300]);
  // Reste à venir après le 18/11 : 2 000 (seQura) + 1 800 (CPF) + 4 mensualités de 500.
  assert.equal(novembre.aEncaisser, 5800);
  assert.deepEqual(novembre.commissions, [
    { closer: 'c2', nom: 'Albane', ventes: 1, contracte: 1800, commission: 180 },
    { closer: 'c1', nom: 'Camille', ventes: 1, contracte: 3000, commission: 300 },
  ]);

  const octobre = calculerVentes(ventes, { mois: '2026-10', aujourdHui: AUJOURD_HUI });
  // La vente d'octobre : deux mensualités déjà passées (05/10 et 05/11).
  assert.deepEqual(octobre.jours, { '2026-10-05': { ventes: 1, contracte: 3000, encaisse: 1000 } });
  assert.deepEqual([octobre.encaissements[0].total, octobre.encaissements[0].encaisse], [500, 500]);
  assert.deepEqual(calculerVentes([], { mois: '2026-11', aujourdHui: AUJOURD_HUI }).jours, {});
});

/* ---------- Les fonctions serveur ---------- */

const SITE = 'https://tunnel.test';
const MOT_DE_PASSE = 'essai-du-cockpit-42';
const ENV = { COCKPIT_MOT_DE_PASSE: MOT_DE_PASSE, KV_REST_API_URL: 'https://base.test', KV_REST_API_TOKEN: 'jeton-de-test' };
const MAINTENANT = new Date('2026-11-18T10:00:00Z');
const cookie = `${COOKIE}=${creerSession(MOT_DE_PASSE, MAINTENANT.getTime())}`;

/** Fausse base : deux tables (ventes, closers) qui retiennent ce qui est écrit. */
function fausseBase() {
  const tables = { 'af:c1:ventes': new Map(), 'af:c1:closers': new Map() };
  const commandes = [];
  const fetchImpl = async (adresse, options) => {
    const corps = JSON.parse(options.body);
    commandes.push(...corps);
    return new Response(
      JSON.stringify(
        corps.map(([nom, cle, champ, valeur]) => {
          if (nom === 'HGETALL') return { result: [...tables[cle]].flat() };
          if (nom === 'HSET') return { result: tables[cle].set(champ, valeur) && 1 };
          if (nom === 'HDEL') return { result: tables[cle].delete(champ) ? 1 : 0 };
          return { error: 'commande inconnue' };
        }),
      ),
    );
  };
  return { tables, commandes, fetchImpl };
}

function demande(chemin, { methode = 'POST', corps, session = true } = {}) {
  return new Request(`${SITE}${chemin}`, {
    method: methode,
    headers: { origin: SITE, 'content-type': 'application/json', ...(session ? { cookie } : {}) },
    body: methode === 'POST' ? JSON.stringify(corps ?? {}) : undefined,
  });
}

const VENTE = {
  date: '2026-11-18',
  formule: 'independant',
  montant: 3000,
  commission: 300,
  paiements: [
    { methode: 'gocardless', montant: 1000, mensualites: 1 },
    { methode: 'sequra', montant: 2000, mensualites: 6 },
  ],
};

test('vente : enregistrée avec un nouveau closer, qui se choisit ensuite dans la liste', async () => {
  const base = fausseBase();
  let numero = 0;
  const ctx = { env: ENV, fetchImpl: base.fetchImpl, maintenant: MAINTENANT, identifiant: () => `fiche-${String((numero += 1)).padStart(4, '0')}` };

  const premiere = await traiterVente(demande('/api/cockpit/vente', { corps: { mois: '2026-11', vente: VENTE, closerNom: '  Camille  ' } }), ctx);
  assert.equal(premiere.status, 200);
  const corps = await premiere.json();
  assert.deepEqual(corps.closers, [{ id: 'fiche-0001', nom: 'Camille' }]);
  assert.deepEqual(corps.jours, { '2026-11-18': { ventes: 1, contracte: 3000, encaisse: 1000 } });
  assert.deepEqual(corps.ventes.map((v) => [v.id, v.closer, v.closerNom, v.encaisse, v.reste]), [['fiche-0002', 'fiche-0001', 'Camille', 1000, 2000]]);
  assert.equal(corps.aEncaisser, 2000);
  assert.deepEqual(corps.commissions, [{ closer: 'fiche-0001', nom: 'Camille', ventes: 1, contracte: 3000, commission: 300 }]);
  // Ce qui est rangé dans la base : la fiche du closer, puis celle de la vente (sans son identifiant, qui sert de clé).
  const ecrites = base.commandes.filter(([nom]) => nom === 'HSET');
  assert.deepEqual(ecrites.map(([, cle, champ]) => [cle, champ]), [['af:c1:closers', 'fiche-0001'], ['af:c1:ventes', 'fiche-0002']]);
  const fiche = JSON.parse(ecrites[1][3]);
  assert.equal(fiche.id, undefined);
  assert.deepEqual([fiche.date, fiche.montant, fiche.closer, fiche.paiements.length, fiche.creeLe], ['2026-11-18', 3000, 'fiche-0001', 2, MAINTENANT.toISOString()]);

  // Deuxième vente : le closer se choisit dans la liste ; redonner son nom (même en minuscules) ne le crée pas deux fois.
  const seconde = await traiterVente(demande('/api/cockpit/vente', { corps: { mois: '2026-11', vente: { ...VENTE, montant: 1800, commission: 0, paiements: [{ methode: 'cpf', montant: 1800 }], closer: 'fiche-0001' } } }), ctx);
  assert.equal((await seconde.json()).ventes.length, 2);
  const troisieme = await traiterVente(demande('/api/cockpit/vente', { corps: { mois: '2026-11', vente: { ...VENTE, date: '2026-11-17' }, closerNom: 'camille' } }), ctx);
  const apres = await troisieme.json();
  assert.deepEqual(apres.closers, [{ id: 'fiche-0001', nom: 'Camille' }]);
  assert.equal(base.tables['af:c1:closers'].size, 1);
  assert.equal(base.tables['af:c1:ventes'].size, 3);

  // Modification : même identifiant, date de création gardée.
  const modifiee = await traiterVente(demande('/api/cockpit/vente', { corps: { mois: '2026-11', vente: { ...VENTE, id: 'fiche-0002', montant: 3500, paiements: [{ methode: 'virement', montant: 3500 }], closer: 'fiche-0001' } } }), {
    ...ctx,
    maintenant: new Date('2026-11-18T15:00:00Z'),
  });
  const relue = (await modifiee.json()).ventes.find((v) => v.id === 'fiche-0002');
  assert.deepEqual([relue.montant, relue.encaisse, relue.creeLe, relue.modifieLe], [3500, 3500, MAINTENANT.toISOString(), '2026-11-18T15:00:00.000Z']);
  assert.equal(base.tables['af:c1:ventes'].size, 3);

  // Suppression.
  const supprimee = await traiterVente(demande('/api/cockpit/vente?id=fiche-0002&mois=2026-11', { methode: 'DELETE' }), ctx);
  assert.equal(supprimee.status, 200);
  assert.equal((await supprimee.json()).ventes.some((v) => v.id === 'fiche-0002'), false);
  assert.equal(base.tables['af:c1:ventes'].has('fiche-0002'), false);
  assert.equal((await traiterVente(demande('/api/cockpit/vente?id=fiche-0002&mois=2026-11', { methode: 'DELETE' }), ctx)).status, 404);
});

test('vente : session, origine, base et saisie vérifiées avant toute écriture', async () => {
  const base = fausseBase();
  const ctx = { env: ENV, fetchImpl: base.fetchImpl, maintenant: MAINTENANT };
  const envoi = { mois: '2026-11', vente: VENTE, closerNom: 'Camille' };
  assert.equal((await traiterVente(demande('/api/cockpit/vente', { corps: envoi, session: false }), ctx)).status, 401);
  assert.equal((await traiterVente(demande('/api/cockpit/vente', { methode: 'GET' }), ctx)).status, 405);
  const ailleurs = new Request(`${SITE}/api/cockpit/vente`, { method: 'POST', headers: { origin: 'https://ailleurs.test', cookie }, body: JSON.stringify(envoi) });
  assert.equal((await traiterVente(ailleurs, ctx)).status, 403);
  // Base non reliée : dit clairement.
  const sansBase = await traiterVente(demande('/api/cockpit/vente', { corps: envoi }), { ...ctx, env: { COCKPIT_MOT_DE_PASSE: MOT_DE_PASSE } });
  assert.deepEqual([sansBase.status, (await sansBase.json()).erreur], [503, 'a-brancher']);
  for (const [corps, erreur] of [
    [{ ...envoi, vente: { ...VENTE, date: '2026-11-19' } }, 'date'],
    [{ ...envoi, vente: { ...VENTE, montant: 2500 } }, 'repartition'],
    [{ ...envoi, closerNom: '   ' }, 'closer'],
    [{ ...envoi, vente: { ...VENTE, closer: 'inconnu' }, closerNom: undefined }, 'closer'],
  ]) {
    const reponse = await traiterVente(demande('/api/cockpit/vente', { corps }), ctx);
    assert.deepEqual([reponse.status, (await reponse.json()).erreur], [400, erreur]);
  }
  const fantome = await traiterVente(demande('/api/cockpit/vente', { corps: { ...envoi, vente: { ...VENTE, id: 'fiche-inconnue' } } }), ctx);
  assert.equal(fantome.status, 404);
  assert.equal(base.commandes.some(([nom]) => nom === 'HSET' || nom === 'HDEL'), false);
  // Base en panne : la vente n'est pas dite enregistrée.
  const panne = await traiterVente(demande('/api/cockpit/vente', { corps: envoi }), { ...ctx, fetchImpl: async () => new Response('non', { status: 500 }) });
  assert.equal(panne.status, 502);
});

test('closers : ajout, homonyme ignoré, renommage, retrait', async () => {
  const base = fausseBase();
  let numero = 0;
  const ctx = { env: ENV, fetchImpl: base.fetchImpl, identifiant: () => `closer-${String((numero += 1)).padStart(4, '0')}` };
  const noms = async (reponse) => (await reponse.json()).closers.map((c) => c.nom);
  assert.deepEqual(await noms(await traiterCloser(demande('/api/cockpit/closer', { corps: { nom: 'Camille' } }), ctx)), ['Camille']);
  assert.deepEqual(await noms(await traiterCloser(demande('/api/cockpit/closer', { corps: { nom: 'Albane' } }), ctx)), ['Albane', 'Camille']);
  assert.deepEqual(await noms(await traiterCloser(demande('/api/cockpit/closer', { corps: { nom: 'CAMILLE' } }), ctx)), ['Albane', 'Camille']);
  assert.equal(base.tables['af:c1:closers'].size, 2);
  assert.deepEqual(await noms(await traiterCloser(demande('/api/cockpit/closer', { corps: { id: 'closer-0002', nom: 'Albane D.' } }), ctx)), ['Albane D.', 'Camille']);
  assert.equal((await traiterCloser(demande('/api/cockpit/closer', { corps: { nom: '  ' } }), ctx)).status, 400);
  assert.equal((await traiterCloser(demande('/api/cockpit/closer', { corps: { nom: 'Zoé' }, session: false }), ctx)).status, 401);
  assert.deepEqual(await noms(await traiterCloser(demande('/api/cockpit/closer?id=closer-0001', { methode: 'DELETE' }), ctx)), ['Albane D.']);
  assert.equal((await traiterCloser(demande('/api/cockpit/closer?id=closer-0001', { methode: 'DELETE' }), ctx)).status, 404);
});
