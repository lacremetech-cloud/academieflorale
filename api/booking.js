// Fonction serveur Vercel : POST /api/booking (webhook iClosed « Call booked »)
// Tout fichier de ce dossier devient une fonction : la logique vit dans serveur/.
import { traiterReservation } from '../serveur/booking.js';

export default {
  /** @param {Request} request */
  fetch(request) {
    return traiterReservation(request, { env: process.env });
  },
};
