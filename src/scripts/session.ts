/**
 * Session de la visiteuse : attribution (UTM, fbclid) et données du formulaire.
 *
 * - Les UTM lus à l'arrivée sont gardés pour toute la visite et reportés dans
 *   l'adresse des pages suivantes du tunnel (iClosed les lit sur la page call).
 * - Le prénom, l'email et le téléphone passent d'une page à l'autre par
 *   sessionStorage, jamais par l'adresse d'une page.
 * - Le prénom s'insère comme du texte (textContent), jamais comme du HTML.
 */
import { CLES_UTM, nettoyerUTM, prenomAffichable } from '../../partage/validation.js';

const CLE_UTM = 'af_utm';
const CLE_LEAD = 'af_lead';

export interface Lead {
  prenom: string;
  email: string;
  telephone?: string;
}

/* sessionStorage peut être refusé (navigation privée, navigateur intégré) :
   on garde alors les valeurs en mémoire, le temps de la page. */
const memoire = new Map<string, string>();

function lire(cle: string): string | null {
  try {
    const valeur = window.sessionStorage.getItem(cle);
    if (valeur !== null) return valeur;
  } catch {
    /* stockage indisponible */
  }
  return memoire.get(cle) ?? null;
}

function ecrire(cle: string, valeur: string): void {
  memoire.set(cle, valeur);
  try {
    window.sessionStorage.setItem(cle, valeur);
  } catch {
    /* stockage indisponible */
  }
}

/** UTM gardés pour la visite. */
export function lireUTM(): Record<string, string> {
  try {
    return nettoyerUTM(JSON.parse(lire(CLE_UTM) ?? '{}'));
  } catch {
    return {};
  }
}

/** Lit les UTM de l'adresse courante ; s'il y en a, ils remplacent ceux de la session. */
export function capturerUTM(): Record<string, string> {
  const parametres = new URLSearchParams(window.location.search);
  const trouves: Record<string, string> = {};
  for (const cle of CLES_UTM) {
    const valeur = parametres.get(cle);
    if (valeur) trouves[cle] = valeur;
  }
  const propres = nettoyerUTM(trouves);
  if (Object.keys(propres).length > 0) {
    ecrire(CLE_UTM, JSON.stringify(propres));
    return propres;
  }
  return lireUTM();
}

/** Ajoute les UTM de la session à une adresse interne. Aucune donnée personnelle. */
export function adresseAvecUTM(chemin: string): string {
  let url: URL;
  try {
    url = new URL(chemin, window.location.origin);
  } catch {
    return chemin;
  }
  if (url.origin !== window.location.origin) return chemin;
  for (const [cle, valeur] of Object.entries(lireUTM())) {
    if (!url.searchParams.has(cle)) url.searchParams.set(cle, valeur);
  }
  return url.pathname + url.search + url.hash;
}

/** Reporte les UTM sur les liens internes du tunnel (attribut data-tunnel). */
export function reporterUTMSurLesLiens(racine: ParentNode = document): void {
  racine.querySelectorAll<HTMLAnchorElement>('a[data-tunnel]').forEach((lien) => {
    const href = lien.getAttribute('href');
    if (href && href.startsWith('/')) lien.setAttribute('href', adresseAvecUTM(href));
  });
}

export function enregistrerLead(lead: Lead): void {
  ecrire(CLE_LEAD, JSON.stringify(lead));
}

export function lireLead(): Lead | null {
  try {
    const lead = JSON.parse(lire(CLE_LEAD) ?? 'null');
    if (lead && typeof lead.prenom === 'string' && typeof lead.email === 'string') return lead;
  } catch {
    /* donnée illisible */
  }
  return null;
}

/**
 * Personnalise la page avec le prénom, s'il est connu.
 *   <span data-sans-prenom>version neutre</span>
 *   <span data-si-prenom hidden>version avec <span data-prenom></span></span>
 * Sans prénom (arrivée par un email, autre appareil), la version neutre reste affichée.
 */
export function afficherPrenom(racine: ParentNode = document, prenomBrut?: string): string {
  const prenom = prenomAffichable(prenomBrut ?? lireLead()?.prenom ?? '');
  racine.querySelectorAll<HTMLElement>('[data-prenom]').forEach((element) => {
    element.textContent = prenom;
  });
  racine.querySelectorAll<HTMLElement>('[data-si-prenom]').forEach((element) => {
    element.hidden = !prenom;
  });
  racine.querySelectorAll<HTMLElement>('[data-sans-prenom]').forEach((element) => {
    element.hidden = Boolean(prenom);
  });
  return prenom;
}

/** À appeler une fois par page (fait par la mise en page). */
export function demarrerSession(): void {
  capturerUTM();
  reporterUTMSurLesLiens();
  afficherPrenom();
}
