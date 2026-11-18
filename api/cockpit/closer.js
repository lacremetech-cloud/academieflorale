// Fonction serveur Vercel : /api/cockpit/closer
// POST : ajoute ou renomme un closer. DELETE : le retire de la liste.
// Tout fichier de ce dossier devient une fonction : la logique vit dans serveur/cockpit/.
import { traiterCloser } from '../../serveur/cockpit/ventes.js';

export default {
  /** @param {Request} request */
  fetch(request) {
    return traiterCloser(request, { env: process.env });
  },
};
