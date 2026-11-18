// Fonction serveur Vercel : POST /api/lead
// Tout fichier de ce dossier devient une fonction : la logique vit dans serveur/.
import { waitUntil } from '@vercel/functions';
import { compter } from '../partage/compteurs.js';
import { traiterLead } from '../serveur/lead.js';

export default {
  /** @param {Request} request */
  fetch(request) {
    return traiterLead(request, {
      env: process.env,
      // Le compteur du cockpit tourne après la réponse : il ne retarde pas l'inscription.
      compter(evenement, variante) {
        const tache = compter(process.env, evenement, variante);
        try {
          waitUntil(tache);
        } catch {
          /* hors de Vercel (aperçu local, tests) : la tâche se termine toute seule */
        }
      },
    });
  },
};
