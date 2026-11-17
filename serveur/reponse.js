// @ts-check
/**
 * Réponse JSON d'une fonction serveur, jamais mise en cache.
 * @param {number} statut
 * @param {Record<string, unknown>} corps
 * @param {Record<string, string>} [enTetes]
 */
export function repondre(statut, corps, enTetes = {}) {
  return new Response(JSON.stringify(corps), {
    status: statut,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      ...enTetes,
    },
  });
}
