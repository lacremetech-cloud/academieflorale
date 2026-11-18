// Fonction serveur Vercel : /api/cockpit/connexion
// POST ouvre une session du cockpit (mot de passe), DELETE la ferme.
// Tout fichier de ce dossier devient une fonction : la logique vit dans serveur/cockpit/.
import { traiterConnexion } from '../../serveur/cockpit/acces.js';

export default {
  /** @param {Request} request */
  fetch(request) {
    return traiterConnexion(request, { env: process.env });
  },
};
