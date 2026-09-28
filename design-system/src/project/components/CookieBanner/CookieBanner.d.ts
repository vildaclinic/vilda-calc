/** Baner zgody na analitykę — <div id="consent-banner" class="cookie-banner">, przypięty do dołu, budowany przez vilda_chrome.js. */
export interface CookieBannerProps {
  /** Treść akapitu <p> (HTML): <strong>Vilda Clinic</strong> + linki do ustawienia.html i polityka-prywatnosci.html. */
  message: string;
  /** Opcjonalna lista punktów <ul> nad przyciskami. */
  items?: string[];
  /** Etykieta <button id="consent-accept"> (tło #007c8d), np. „Akceptuję analitykę". */
  acceptLabel: string;
  /** Etykieta <button id="consent-decline"> (tło #e0e0e0), np. „Nie zgadzam się". */
  declineLabel: string;
  /** Widoczność — arkusz daje display:none, skrypt ustawia style.display="block" do czasu zapisania zgody. */
  visible?: boolean;
}
export declare const CookieBanner: (props: CookieBannerProps) => HTMLDivElement;
