// Fonction serveur Vercel : GET ou POST /api/booking
// Lance le suivi des rendez-vous iClosed (ActiveCampaign, API de conversion Meta).
// Appelée toutes les dix minutes par Vercel (« crons » dans vercel.json), par le
// webhook d'iClosed s'il est réglé, et par la page merci call. Le contenu de la
// demande est ignoré : la logique vit dans serveur/booking.js.
import { traiterRdv } from '../serveur/booking.js';

export default {
  /** @param {Request} request */
  fetch(request) {
    return traiterRdv(request, { env: process.env });
  },
};
