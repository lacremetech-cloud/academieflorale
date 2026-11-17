// Fonction serveur Vercel : POST /api/lead
// Tout fichier de ce dossier devient une fonction : la logique vit dans serveur/.
import { traiterLead } from '../serveur/lead.js';

export default {
  /** @param {Request} request */
  fetch(request) {
    return traiterLead(request, { env: process.env });
  },
};
