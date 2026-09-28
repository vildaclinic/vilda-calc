/** Pasek systemowy aplikacji — trzy rodziny: karta aktualizacji SW, pasek #updateBanner, bramka PRO. */
export interface SwUpdateBannerProps {
  /** <div id="sw-update-banner" role="alert" aria-live="polite" aria-atomic="true">; budowany przez ios26-ui.js. */
  kind: 'sw-update';
  /** Tekst w <span class="ww-sw-update-banner__title"><strong>…</strong></span>, np. „Dostępna nowa wersja aplikacji". */
  title: string;
  /** Tekst w <span class="ww-sw-update-banner__sub">. */
  subtitle: string;
  /** Opcjonalna lista „Co nowego" w <details class="ww-sw-update-banner__notes">. */
  notes?: string[];
  /** Czy przycisk #sw-refresh ma klasę "ww-sw-refresh--pulse" (fioletowa pulsująca obwódka). */
  pulse?: boolean;
  /** Stan po kliknięciu: oba przyciski dostają disabled, #sw-refresh aria-busy="true" i tekst „Aktualizuję…". */
  busy?: boolean;
}
export interface UpdateBannerProps {
  /** <div id="updateBanner" role="status"> — tekst + <button> + <button class="dismiss">; arkusz ukrywa go (display:none). */
  kind: 'update';
  message: string;
  /** Etykiety przycisków, np. „Odśwież" i „Później". */
  actionLabel: string;
  dismissLabel: string;
  disabled?: boolean;
}
export interface ProGateBannerProps {
  /** <div class="vilda-pro-gate-banner vilda-pro-gate-banner--upgrade|--login">; widoczny przez klasy na <html>. */
  kind: 'pro-gate';
  /** "upgrade" (fiolet #9900ff, html.vilda-pro-inactive.vilda-logged-in) | "login" (teal #00838d, html.vilda-pro-inactive:not(.vilda-logged-in)) */
  tone: 'upgrade' | 'login';
  /** Tekst w <span class="vilda-pro-gate-banner__text">, z emoji na początku (⚡, 🔐). */
  text: string;
  /** Element akcji: <a class="vilda-pro-gate-banner__btn" href> (upgrade) lub <button class="vilda-pro-gate-banner__btn"> (login). */
  actionLabel: string;
  href?: string;
}
export type BannerProps = SwUpdateBannerProps | UpdateBannerProps | ProGateBannerProps;
export declare const Banner: (props: BannerProps) => HTMLDivElement;
