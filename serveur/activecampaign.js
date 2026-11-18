// @ts-check
/**
 * Client ActiveCampaign (API v3), côté serveur seulement.
 * La clé d'API vient des variables d'environnement Vercel : elle n'est jamais
 * écrite dans le repo, ni renvoyée au navigateur, ni journalisée.
 */

/**
 * @typedef {object} ResultatSync
 * @property {boolean} ok
 * @property {number} statut code HTTP d'ActiveCampaign, 0 si aucune réponse
 * @property {number} tentatives
 * @property {'delai' | 'reseau'} [motif] quand aucune réponse n'est arrivée
 * @property {string} [id] numéro du contact dans ActiveCampaign, seulement si « avecId » est demandé
 */

/**
 * Crée ou met à jour un contact, reconnu à son email (POST /api/3/contact/sync).
 * Un deuxième envoi avec le même email met la fiche à jour, sans doublon.
 * En cas d'échec passager (réseau, 5xx, 429), une seule nouvelle tentative.
 *
 * @param {object} options
 * @param {string} options.apiUrl adresse du compte, par exemple https://compte.api-us1.com
 * @param {string} options.apiKey
 * @param {Record<string, unknown>} options.contact
 * @param {typeof fetch} [options.fetchImpl]
 * @param {(ms: number) => Promise<void>} [options.attente]
 * @param {number} [options.delaiMs] délai maximal d'une tentative
 * @param {boolean} [options.avecId] rend aussi le numéro du contact (pour changer ses listes)
 * @returns {Promise<ResultatSync>}
 */
export async function synchroniserContact({
  apiUrl,
  apiKey,
  contact,
  fetchImpl = fetch,
  attente = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms)),
  delaiMs = 6000,
  avecId = false,
}) {
  const adresse = apiUrl.trim().replace(/\/+$/, '') + '/api/3/contact/sync';
  /** @type {ResultatSync} */
  let resultat = { ok: false, statut: 0, tentatives: 0 };

  for (let tentative = 1; tentative <= 2; tentative += 1) {
    try {
      const reponse = await fetchImpl(adresse, {
        method: 'POST',
        headers: {
          'Api-Token': apiKey,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({ contact }),
        signal: AbortSignal.timeout(delaiMs),
      });
      resultat = { ok: reponse.ok, statut: reponse.status, tentatives: tentative };
      if (reponse.ok && avecId) {
        // De la fiche rendue, on ne garde que son numéro.
        const corps = await reponse.json().catch(() => null);
        const id = String(corps?.contact?.id ?? '');
        if (/^\d{1,12}$/.test(id)) resultat.id = id;
      } else {
        // On ne lit pas la réponse : elle contient la fiche du contact.
        await reponse.body?.cancel().catch(() => {});
      }
      if (reponse.ok) return resultat;
      const passager = reponse.status >= 500 || reponse.status === 429 || reponse.status === 408;
      if (!passager) return resultat;
    } catch (erreur) {
      const nom = erreur instanceof Error ? erreur.name : '';
      resultat = {
        ok: false,
        statut: 0,
        tentatives: tentative,
        motif: nom === 'TimeoutError' || nom === 'AbortError' ? 'delai' : 'reseau',
      };
    }
    if (tentative === 1) await attente(400);
  }
  return resultat;
}

/**
 * Inscrit un contact à une liste, ou l'en désinscrit (POST /api/3/contactLists).
 * @param {object} options
 * @param {string} options.apiUrl
 * @param {string} options.apiKey
 * @param {string} options.contact numéro du contact
 * @param {string} options.liste numéro de la liste
 * @param {'inscrire' | 'desinscrire'} options.action
 * @param {typeof fetch} [options.fetchImpl]
 * @param {number} [options.delaiMs]
 * @returns {Promise<{ ok: boolean, statut: number }>}
 */
export async function changerListe({ apiUrl, apiKey, contact, liste, action, fetchImpl = fetch, delaiMs = 5000 }) {
  try {
    const reponse = await fetchImpl(apiUrl.trim().replace(/\/+$/, '') + '/api/3/contactLists', {
      method: 'POST',
      headers: { 'Api-Token': apiKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      // Statut 1 : inscrite ; statut 2 : désinscrite.
      body: JSON.stringify({ contactList: { list: liste, contact, status: action === 'inscrire' ? 1 : 2 } }),
      signal: AbortSignal.timeout(delaiMs),
    });
    // La réponse contient la fiche du contact : on ne la lit pas.
    await reponse.body?.cancel().catch(() => {});
    return { ok: reponse.ok, statut: reponse.status };
  } catch {
    return { ok: false, statut: 0 };
  }
}

/**
 * Lit un réglage du compte (listes, déclencheurs d'une automatisation) : jamais un contact.
 * @param {object} options
 * @param {string} options.apiUrl
 * @param {string} options.apiKey
 * @param {string} options.chemin par exemple « /api/3/lists?limit=100 »
 * @param {typeof fetch} [options.fetchImpl]
 * @returns {Promise<{ statut: number, corps: any }>}
 */
export async function lireReglage({ apiUrl, apiKey, chemin, fetchImpl = fetch }) {
  try {
    const reponse = await fetchImpl(apiUrl.trim().replace(/\/+$/, '') + chemin, {
      headers: { 'Api-Token': apiKey, Accept: 'application/json' },
      signal: AbortSignal.timeout(5000),
    });
    return { statut: reponse.status, corps: await reponse.json().catch(() => null) };
  } catch {
    return { statut: 0, corps: null };
  }
}
