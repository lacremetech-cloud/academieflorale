// Fonction serveur Vercel : /api/cockpit/note
// POST : enregistre la note d'une journée.
// Tout fichier de ce dossier devient une fonction : la logique vit dans serveur/cockpit/.
import { traiterNote } from '../../serveur/cockpit/donnees.js';

export default {
  /** @param {Request} request */
  fetch(request) {
    return traiterNote(request, { env: process.env });
  },
};
