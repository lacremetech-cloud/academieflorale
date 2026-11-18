// Fonction serveur Vercel : POST /api/lead
// Tout fichier de ce dossier devient une fonction : la logique vit dans serveur/.
import { waitUntil } from '@vercel/functions';
import { compter } from '../partage/compteurs.js';
import { traiterLead } from '../serveur/lead.js';
import { suivreInscription } from '../serveur/suivi-inscription.js';

/**
 * Laisse une tâche se terminer après la réponse : elle ne retarde pas l'inscription.
 * @param {Promise<unknown>} tache
 */
function apres(tache) {
  const sure = tache.catch(() => {});
  try {
    waitUntil(sure);
  } catch {
    /* hors de Vercel (aperçu local, tests) : la tâche se termine toute seule */
  }
}

export default {
  /** @param {Request} request */
  fetch(request) {
    return traiterLead(request, {
      env: process.env,
      // Le compteur du cockpit, puis la publicité d'arrivée et l'événement « Prospect » pour Meta.
      compter(evenement, variante) {
        apres(compter(process.env, evenement, variante));
      },
      suivre(inscription) {
        apres(suivreInscription({ env: process.env, inscription }));
      },
    });
  },
};
