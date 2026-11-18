// @ts-check
/**
 * Lecture d'une demande reçue par une fonction serveur : d'où elle vient.
 */

/**
 * La demande vient-elle bien d'une page du site lui-même ?
 * @param {Request} request
 */
export function memeOrigine(request) {
  const origine = request.headers.get('origin');
  if (!origine) return false;
  let hoteOrigine;
  try {
    hoteOrigine = new URL(origine).host;
  } catch {
    return false;
  }
  const hote =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? new URL(request.url).host;
  return hoteOrigine.toLowerCase() === hote.toLowerCase();
}

/**
 * Adresse IP de la visiteuse, telle que Vercel la transmet.
 * @param {Request} request
 */
export function adresseCliente(request) {
  const reelle = request.headers.get('x-real-ip');
  if (reelle) return reelle.trim();
  const transmise = request.headers.get('x-forwarded-for');
  return transmise ? (transmise.split(',')[0] ?? '').trim() : 'inconnue';
}

/**
 * La demande est-elle arrivée en HTTPS ? (En local, le serveur d'aperçu est en HTTP.)
 * @param {Request} request
 */
export function enHttps(request) {
  const transmis = request.headers.get('x-forwarded-proto');
  return (transmis ?? new URL(request.url).protocol.replace(':', '')).split(',')[0]?.trim() === 'https';
}
