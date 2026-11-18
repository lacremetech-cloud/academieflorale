// @ts-check
/**
 * Cockpit : le registre des ventes et la liste des closers, rangés dans la même
 * base que les compteurs du tunnel (Upstash Redis). Chaque vente et chaque
 * closer est une fiche, sous son identifiant.
 * Une vente porte une date, une formule, des montants, un closer, une note
 * libre et, si elle a été saisie, l'adresse email de l'élève : c'est elle qui la
 * fait passer en « Client » dans ActiveCampaign et qui rattache la vente à sa
 * publicité. C'est la seule donnée personnelle de cette base ; elle ne sort que
 * vers le cockpit, pour une session ouverte.
 */
import { accesCompteurs, executer } from '../../partage/compteurs.js';

const CLE_VENTES = 'af:c1:ventes';
const CLE_CLOSERS = 'af:c1:closers';

/**
 * Les fiches d'une table de la base. Upstash rend « champ, valeur, champ,
 * valeur… » ; un objet est accepté aussi.
 * @param {unknown} brut
 * @returns {any[]}
 */
function fiches(brut) {
  /** @type {[string, unknown][]} */
  let paires = [];
  if (Array.isArray(brut)) {
    for (let rang = 0; rang + 1 < brut.length; rang += 2) paires.push([String(brut[rang]), brut[rang + 1]]);
  } else if (brut && typeof brut === 'object') {
    paires = Object.entries(brut);
  }
  const lues = [];
  for (const [id, valeur] of paires) {
    try {
      const fiche = typeof valeur === 'string' ? JSON.parse(valeur) : valeur;
      if (fiche && typeof fiche === 'object') lues.push({ ...fiche, id });
    } catch {
      /* fiche illisible : ignorée */
    }
  }
  return lues;
}

/**
 * Toutes les ventes et tous les closers.
 * @param {Record<string, string | undefined>} env
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<{ etat: 'ok' | 'a-brancher' | 'erreur', detail?: string, ventes: import('../../partage/ventes.js').Vente[], closers: { id: string, nom: string }[] }>}
 */
export async function lireRegistre(env, options = {}) {
  const acces = accesCompteurs(env);
  if (!acces) return { etat: 'a-brancher', ventes: [], closers: [] };
  try {
    const [ventes, closers] = await executer(acces, [['HGETALL', CLE_VENTES], ['HGETALL', CLE_CLOSERS]], options.fetchImpl ?? fetch, 6000);
    return {
      etat: 'ok',
      ventes: fiches(ventes).filter((vente) => typeof vente.date === 'string' && Array.isArray(vente.paiements)),
      closers: fiches(closers)
        .filter((closer) => typeof closer.nom === 'string' && closer.nom)
        .map((closer) => ({ id: String(closer.id), nom: String(closer.nom) }))
        .sort((a, b) => a.nom.localeCompare(b.nom, 'fr')),
    };
  } catch (erreur) {
    const nom = erreur instanceof Error ? erreur.name : '';
    return {
      etat: 'erreur',
      detail: nom === 'TimeoutError' ? 'la base ne répond pas' : 'la base est injoignable ou refuse la demande',
      ventes: [],
      closers: [],
    };
  }
}

/**
 * Applique des écritures au registre, en une seule demande.
 * @param {Record<string, string | undefined>} env
 * @param {{ vente?: any, closer?: { id: string, nom: string }, sansVente?: string, sansCloser?: string }} ecritures
 * @param {{ fetchImpl?: typeof fetch }} [options]
 * @returns {Promise<'ok' | 'a-brancher' | 'erreur'>}
 */
export async function ecrireRegistre(env, ecritures, options = {}) {
  const acces = accesCompteurs(env);
  if (!acces) return 'a-brancher';
  /** @type {(string | number)[][]} */
  const commandes = [];
  if (ecritures.closer) commandes.push(['HSET', CLE_CLOSERS, ecritures.closer.id, JSON.stringify({ nom: ecritures.closer.nom })]);
  if (ecritures.vente) {
    const { id, ...fiche } = ecritures.vente;
    commandes.push(['HSET', CLE_VENTES, String(id), JSON.stringify(fiche)]);
  }
  if (ecritures.sansVente) commandes.push(['HDEL', CLE_VENTES, ecritures.sansVente]);
  if (ecritures.sansCloser) commandes.push(['HDEL', CLE_CLOSERS, ecritures.sansCloser]);
  if (commandes.length === 0) return 'ok';
  try {
    await executer(acces, commandes, options.fetchImpl ?? fetch, 5000);
    return 'ok';
  } catch {
    return 'erreur';
  }
}
