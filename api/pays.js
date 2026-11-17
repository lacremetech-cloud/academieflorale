// Fonction serveur Vercel : GET /api/pays
// Donne le pays de la visiteuse d'après son adresse IP, pour présélectionner
// l'indicatif du champ téléphone. Vercel fait la géolocalisation lui-même et la
// transmet dans un en-tête : aucune adresse IP n'est lue, gardée ni journalisée ici.
export default {
  /** @param {Request} request */
  fetch(request) {
    const pays = (request.headers.get('x-vercel-ip-country') ?? '').toUpperCase();
    return new Response(JSON.stringify({ pays: /^[A-Z]{2}$/.test(pays) ? pays : '' }), {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Cache-Control': 'private, max-age=3600',
      },
    });
  },
};
