// @ts-check
/**
 * Une demande de page est-elle une vraie visite, à compter ? On écarte les robots
 * (aperçus de lien, vérification des publicités) et les préchargements.
 */
const ROBOTS = /bot|crawl|spider|slurp|preview|facebookexternalhit|facebookcatalog|meta-external|whatsapp|headless|lighthouse|pagespeed|monitor|uptime|curl|wget|python|vercel/i;

/** @param {Request} request */
export function visiteACompter(request) {
  if (request.method !== 'GET') return false;
  const agent = request.headers.get('user-agent') ?? '';
  if (!agent || ROBOTS.test(agent)) return false;
  const but = `${request.headers.get('purpose') ?? ''} ${request.headers.get('sec-purpose') ?? ''}`;
  if (/prefetch|prerender/i.test(but)) return false;
  // Une page demandée par le navigateur : « document », ou rien pour les navigateurs anciens.
  const destination = request.headers.get('sec-fetch-dest');
  return !destination || destination === 'document';
}
