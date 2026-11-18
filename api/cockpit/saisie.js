// Fonction serveur Vercel : /api/cockpit/saisie
// POST : enregistre un chiffre de vente saisi à la main pour une journée.
// Tout fichier de ce dossier devient une fonction : la logique vit dans serveur/cockpit/.
import { traiterSaisie } from '../../serveur/cockpit/donnees.js';

export default {
  /** @param {Request} request */
  fetch(request) {
    return traiterSaisie(request, { env: process.env });
  },
};
