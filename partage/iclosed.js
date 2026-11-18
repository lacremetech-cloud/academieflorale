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

/**
 * Ce que l'ancienne page merci (go.academie-florale.fr/confirmation) joignait à
 * l'événement « Rendez-vous programmé » de Meta. Gardé tel quel, pour que les
 * conversions personnalisées bâties dessus restent justes ; « tunnel » dit d'où
 * vient le rendez-vous.
 */
export const RDV_VSL = Object.freeze({ tunnel: 'vsl', donnees: Object.freeze({ content_category: 'R1_Booked' }) });

/**
 * Les autres events « Appel de candidature » du compte iClosed. Depuis le
 * 18/11/2026, ils renvoient tous vers la page merci du tunnel : leurs réservations
 * sont donc signalées à Meta par le serveur (/api/booking), avec ce que leur
 * ancienne page merci envoyait (« /confirmation » : R1_Booked ; « /confirmation-yt » :
 * « Call confirmé »). Rien d'autre n'est fait pour eux : ni ActiveCampaign, ni cockpit.
 * Les appels de suivi des élèves et les reprogrammations n'y figurent pas : ce ne
 * sont pas de nouveaux rendez-vous de candidature.
 *
 * « depuis » est l'instant où la page merci de l'event a été changée dans iClosed.
 * Avant lui, c'est l'ancienne page merci qui a prévenu Meta : une réservation d'avant
 * n'est jamais reprise, elle serait comptée deux fois.
 */
export const ICLOSED_AUTRES = Object.freeze([
  Object.freeze({ event: 'candidature', tunnel: 'webinaire', depuis: '2026-11-18T17:05:26Z', donnees: Object.freeze({ content_category: 'R1_Booked' }) }),
  Object.freeze({ event: 'candidature-site', tunnel: 'site', depuis: '2026-11-18T17:06:52Z', donnees: Object.freeze({ content_category: 'R1_Booked' }) }),
  Object.freeze({ event: 'setting', tunnel: 'setting', depuis: '2026-11-18T17:06:07Z', donnees: Object.freeze({ content_name: 'Call confirmé' }) }),
  Object.freeze({ event: 'candidature-dm', tunnel: 'dm', depuis: '2026-11-18T17:07:07Z', donnees: Object.freeze({ content_name: 'Call confirmé' }) }),
  Object.freeze({ event: 'candidature-yt', tunnel: 'youtube', depuis: '2026-11-18T17:07:51Z', donnees: Object.freeze({ content_name: 'Call confirmé' }) }),
]);
