// @ts-check
/**
 * Cockpit : enregistrer, modifier ou supprimer une vente, et tenir la liste des
 * closers. Chaque réponse rend le « bloc ventes » du mois affiché, recalculé :
 * la page n'a pas à redemander les autres sources (Meta, Wistia, iClosed).
 * Une vente qui porte l'email de l'élève la fait passer en « Client » dans
 * ActiveCampaign et envoie l'événement « Achat » à Meta (serveur/cockpit/suivi-vente.js).
 */
import { jourParis, moisCourant, moisValide } from '../../partage/cockpit.js';
import { tunnelValide } from '../../partage/tunnels.js';
import { calculerVentes, NOM_CLOSER_MAX, normaliserVente, texteCourt } from '../../partage/ventes.js';
import { repondre } from '../reponse.js';
import { memeOrigine } from '../requete.js';
import { verifierAcces } from './acces.js';
import { ecrireRegistre, lireRegistre } from './registre.js';
import { suivreVente } from './suivi-vente.js';

/** Identifiant d'une fiche : lettres, chiffres et tirets seulement. */
const ID = /^[a-z0-9-]{8,40}$/;

/**
 * Ce que la page reçoit sur les ventes d'un mois, pour un onglet du cockpit : les
 * ventes de son tunnel, jour par jour ; les encaissements et les commissions de
 * toutes les ventes.
 * @param {{ ventes: import('../../partage/ventes.js').Vente[], closers: { id: string, nom: string }[] }} registre
 * @param {string} mois
 * @param {Date} maintenant
 * @param {unknown} [tunnel] l'onglet affiché (celui du tunnel VSL sans précision)
 */
export function blocVentes(registre, mois, maintenant, tunnel) {
  return { ...calculerVentes(registre.ventes, { mois, aujourdHui: jourParis(maintenant), tunnel: tunnelValide(tunnel) }), closers: registre.closers };
}

/**
 * @param {Request} request
 * @returns {Promise<any>}
 */
async function corpsJson(request) {
  try {
    const texte = await request.text();
    return texte.length <= 8192 ? JSON.parse(texte) : null;
  } catch {
    return null;
  }
}

/**
 * Vérifie la demande (méthode, origine, session) et lit le registre.
 * @param {Request} request
 * @param {string[]} methodes
 * @param {{ env: Record<string, string | undefined>, fetchImpl: typeof fetch }} contexte
 */
async function ouvrir(request, methodes, { env, fetchImpl }) {
  if (!methodes.includes(request.method)) return { refus: repondre(405, { ok: false, erreur: 'methode' }, { Allow: methodes.join(', ') }) };
  if (!memeOrigine(request)) return { refus: repondre(403, { ok: false, erreur: 'origine' }) };
  const acces = verifierAcces(request, env);
  if (!acces.ok) return { refus: acces.reponse };
  const registre = await lireRegistre(env, { fetchImpl });
  if (registre.etat === 'a-brancher') return { refus: repondre(503, { ok: false, erreur: 'a-brancher' }) };
  if (registre.etat !== 'ok') return { refus: repondre(502, { ok: false, erreur: 'indisponible' }) };
  return { registre };
}

/** @param {unknown} texte */
const moisDemande = (texte, maintenant = new Date()) => (moisValide(texte) ? String(texte) : moisCourant(maintenant));

/**
 * POST /api/cockpit/vente : enregistre une vente ({ mois, tunnel?, vente, closerNom? }) ;
 * avec `vente.id`, modifie la vente existante. Un nom de closer inconnu crée le
 * closer, qui se choisira ensuite dans la liste. `tunnel` est l'onglet affiché (le
 * bloc rendu est le sien) ; le tunnel de la vente elle-même est `vente.tunnel`.
 * POST { mois, renvoyer: id } : relance ce que la vente devait déclencher
 * (ActiveCampaign, Meta) et qui n'a pas abouti.
 * DELETE /api/cockpit/vente?id=…&mois=… : supprime une vente (rien n'est défait
 * dans ActiveCampaign ni chez Meta).
 * @param {Request} request
 * @param {object} [contexte]
 * @param {Record<string, string | undefined>} [contexte.env]
 * @param {typeof fetch} [contexte.fetchImpl]
 * @param {Date} [contexte.maintenant]
 * @param {() => string} [contexte.identifiant]
 * @param {Pick<Console, 'warn' | 'error'>} [contexte.journal]
 * @param {(ms: number) => Promise<void>} [contexte.attente]
 * @returns {Promise<Response>}
 */
export async function traiterVente(request, contexte = {}) {
  const { env = {}, fetchImpl = fetch, maintenant = new Date(), identifiant = () => crypto.randomUUID(), journal = console, attente } = contexte;
  const ouverture = await ouvrir(request, ['POST', 'DELETE'], { env, fetchImpl });
  if (ouverture.refus) return ouverture.refus;
  const { registre } = ouverture;
  const adresse = new URL(request.url);

  if (request.method === 'DELETE') {
    const id = adresse.searchParams.get('id') ?? '';
    if (!ID.test(id) || !registre.ventes.some((vente) => vente.id === id)) return repondre(404, { ok: false, erreur: 'vente' });
    if ((await ecrireRegistre(env, { sansVente: id }, { fetchImpl })) !== 'ok') return repondre(502, { ok: false, erreur: 'indisponible' });
    const reste = { ...registre, ventes: registre.ventes.filter((vente) => vente.id !== id) };
    return repondre(200, { ok: true, ...blocVentes(reste, moisDemande(adresse.searchParams.get('mois'), maintenant), maintenant, adresse.searchParams.get('tunnel')) });
  }

  const demande = await corpsJson(request);

  // Relancer ce qu'une vente devait déclencher : seul ce qui n'a pas abouti est refait.
  if (typeof demande?.renvoyer === 'string') {
    const existante = registre.ventes.find((vente) => vente.id === demande.renvoyer);
    if (!existante) return repondre(404, { ok: false, erreur: 'vente' });
    const suivi = await suivreVente({ env, vente: existante, ancienne: existante, fetchImpl, maintenant, journal, attente });
    const relancee = suivi ? { ...existante, suivi } : existante;
    if (suivi && (await ecrireRegistre(env, { vente: relancee }, { fetchImpl })) !== 'ok') return repondre(502, { ok: false, erreur: 'indisponible' });
    const apres = { ...registre, ventes: registre.ventes.map((vente) => (vente.id === relancee.id ? relancee : vente)) };
    return repondre(200, { ok: true, id: relancee.id, ...blocVentes(apres, moisDemande(demande?.mois, maintenant), maintenant, demande?.tunnel) });
  }

  const lue = normaliserVente(demande?.vente, { aujourdHui: jourParis(maintenant) });
  if (!lue.ok) return repondre(400, { ok: false, erreur: lue.erreur });

  // Le closer : l'un de ceux déjà enregistrés, ou un nouveau nom, enregistré au passage.
  let closer = registre.closers.find((c) => c.id === demande?.vente?.closer);
  let nouveauCloser;
  if (!closer) {
    const nom = texteCourt(demande?.closerNom, NOM_CLOSER_MAX);
    if (!nom) return repondre(400, { ok: false, erreur: 'closer' });
    closer = registre.closers.find((c) => c.nom.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'));
    if (!closer) {
      closer = { id: identifiant(), nom };
      nouveauCloser = closer;
    }
  }

  const ancienne = typeof demande.vente.id === 'string' ? registre.ventes.find((vente) => vente.id === demande.vente.id) : undefined;
  if (demande.vente.id != null && !ancienne) return repondre(404, { ok: false, erreur: 'vente' });
  const instant = maintenant.toISOString();
  /** @type {import('../../partage/ventes.js').Vente & { id: string }} */
  let vente = {
    ...lue.vente,
    id: ancienne?.id ?? identifiant(),
    closer: closer.id,
    closerNom: closer.nom,
    creeLe: ancienne?.creeLe ?? instant,
    ...(ancienne ? { modifieLe: instant } : {}),
    // Ce que la vente a déjà déclenché reste noté tant que l'élève est la même.
    ...(ancienne?.suivi && ancienne.email === lue.vente.email ? { suivi: ancienne.suivi } : {}),
  };
  // La vente est d'abord enregistrée : elle ne dépend jamais d'ActiveCampaign ni de Meta.
  if ((await ecrireRegistre(env, { vente, closer: nouveauCloser }, { fetchImpl })) !== 'ok') return repondre(502, { ok: false, erreur: 'indisponible' });
  const suivi = await suivreVente({ env, vente, ancienne, fetchImpl, maintenant, journal, attente });
  if (suivi) {
    vente = { ...vente, suivi };
    // Si cette seconde écriture échoue, la vente reste enregistrée ; son suivi se relance depuis la liste.
    await ecrireRegistre(env, { vente }, { fetchImpl });
  }

  const suite = {
    ventes: [...registre.ventes.filter((v) => v.id !== vente.id), vente],
    closers: nouveauCloser ? [...registre.closers, nouveauCloser].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) : registre.closers,
  };
  return repondre(200, { ok: true, id: vente.id, ...blocVentes(suite, moisDemande(demande?.mois, maintenant), maintenant, demande?.tunnel) });
}

/**
 * POST /api/cockpit/closer : ajoute un closer ({ nom }) ou le renomme ({ id, nom }).
 * DELETE /api/cockpit/closer?id=… : le retire de la liste (ses ventes gardent son nom).
 * @param {Request} request
 * @param {object} [contexte]
 * @param {Record<string, string | undefined>} [contexte.env]
 * @param {typeof fetch} [contexte.fetchImpl]
 * @param {() => string} [contexte.identifiant]
 * @returns {Promise<Response>}
 */
export async function traiterCloser(request, contexte = {}) {
  const { env = {}, fetchImpl = fetch, identifiant = () => crypto.randomUUID() } = contexte;
  const ouverture = await ouvrir(request, ['POST', 'DELETE'], { env, fetchImpl });
  if (ouverture.refus) return ouverture.refus;
  const { registre } = ouverture;
  const adresse = new URL(request.url);
  /** @param {{ id: string, nom: string }[]} closers */
  const reponse = (closers) => repondre(200, { ok: true, closers: [...closers].sort((a, b) => a.nom.localeCompare(b.nom, 'fr')) });

  if (request.method === 'DELETE') {
    const id = adresse.searchParams.get('id') ?? '';
    if (!registre.closers.some((closer) => closer.id === id)) return repondre(404, { ok: false, erreur: 'closer' });
    if ((await ecrireRegistre(env, { sansCloser: id }, { fetchImpl })) !== 'ok') return repondre(502, { ok: false, erreur: 'indisponible' });
    return reponse(registre.closers.filter((closer) => closer.id !== id));
  }

  const demande = await corpsJson(request);
  const nom = texteCourt(demande?.nom, NOM_CLOSER_MAX);
  if (!nom) return repondre(400, { ok: false, erreur: 'nom' });
  const homonyme = registre.closers.find((closer) => closer.nom.toLocaleLowerCase('fr') === nom.toLocaleLowerCase('fr'));
  const existant = typeof demande?.id === 'string' ? registre.closers.find((closer) => closer.id === demande.id) : undefined;
  if (demande?.id != null && !existant) return repondre(404, { ok: false, erreur: 'closer' });
  // Même nom qu'un closer déjà là : rien à écrire, la liste est rendue telle quelle.
  if (homonyme && homonyme.id !== existant?.id) return reponse(registre.closers);
  const closer = { id: existant?.id ?? identifiant(), nom };
  if ((await ecrireRegistre(env, { closer }, { fetchImpl })) !== 'ok') return repondre(502, { ok: false, erreur: 'indisponible' });
  return reponse([...registre.closers.filter((c) => c.id !== closer.id), closer]);
}
