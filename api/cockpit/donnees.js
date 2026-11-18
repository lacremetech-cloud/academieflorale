// Fonction serveur Vercel : /api/cockpit/donnees
// GET : les chiffres d'un mois, pour une session ouverte.
// Tout fichier de ce dossier devient une fonction : la logique vit dans serveur/cockpit/.
import { traiterDonnees } from '../../serveur/cockpit/donnees.js';

export default {
  /** @param {Request} request */
  fetch(request) {
    return traiterDonnees(request, { env: process.env });
  },
};
