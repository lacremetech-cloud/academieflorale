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
 * @returns {Promise<ResultatSync>}
 */
export async function synchroniserContact({
  apiUrl,
  apiKey,
  contact,
  fetchImpl = fetch,
  attente = (ms) => new Promise((resoudre) => setTimeout(resoudre, ms)),
  delaiMs = 6000,
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
      // On ne lit pas la réponse : elle contient la fiche du contact.
      await reponse.body?.cancel().catch(() => {});
      resultat = { ok: reponse.ok, statut: reponse.status, tentatives: tentative };
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
