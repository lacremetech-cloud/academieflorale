// @ts-check
/**
 * Event iClosed du tunnel VSL, écrit une seule fois : pour la page call, qui
 * affiche son calendrier, et pour /api/booking, qui ne traite que ses réservations.
 *
 * Son adresse dans iClosed est app.iclosed.io/e/<compte>/<event>. Si elle change
 * (event renommé ou dupliqué pour le nouveau tunnel), la corriger ici : sinon le
 * calendrier ne s'affiche plus et les réservations ne sont plus reconnues.
 */
export const ICLOSED_VSL = Object.freeze({
  compte: 'academie-florale',
  event: 'candidature-vsl',
  titre: 'Appel de candidature',
});
