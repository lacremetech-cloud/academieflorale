// Fonction serveur Vercel : /api/cockpit/vente
// POST : enregistre ou modifie une vente. DELETE : la supprime.
// Tout fichier de ce dossier devient une fonction : la logique vit dans serveur/cockpit/.
import { traiterVente } from '../../serveur/cockpit/ventes.js';

export default {
  /** @param {Request} request */
  fetch(request) {
    return traiterVente(request, { env: process.env });
  },
};
