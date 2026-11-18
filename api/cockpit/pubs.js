// Fonction serveur Vercel : GET /api/cockpit/pubs?mois=2026-11&periode=mois
// Le rapport des publicités (de la pub au rendez-vous, puis à la vente), pour une session ouverte.
import { traiterPubs } from '../../serveur/cockpit/pubs.js';

export default {
  /** @param {Request} request */
  fetch(request) {
    return traiterPubs(request, { env: process.env });
  },
};
