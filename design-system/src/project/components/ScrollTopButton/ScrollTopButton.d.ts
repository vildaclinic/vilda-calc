/** Przycisk „do góry” strony — <button id="scrollTopBtn" type="button" aria-label="Powrót na górę strony"><i data-lucide="arrow-up"></i></button>, doklejany na końcu <body>; reguły są po id. */
export interface ScrollTopButtonProps {
  /** aria-label; w aplikacji "Powrót na górę strony". */
  ariaLabel: string;
  /** Ikona: <i data-lucide="arrow-up"> zamieniane przez Lucide na <svg>, albo gotowy SVG (24 viewBox, stroke currentColor, stroke-width 1.75). */
  icon?: HTMLElement | SVGElement;
  /** Znacznik, że przycisk wstrzyknął ios26-ui.js (data-ios26-injected="true"). */
  injected?: boolean;
}
export declare const ScrollTopButton: (props: ScrollTopButtonProps) => HTMLButtonElement;

/** Klasy <body>/<html>, które przesuwają lub chowają #scrollTopBtn: has-mobile-bottom-dock (dół --scroll-top-btn-bottom, z-index 1201), mobile-nav-ui-locked + has-mobile-bottom-dock (dół nad dockiem), mobile-nav-ui-locked + user-hides-mobile-dock (dół = kotwica docka), user-hides-nav-arrow / nav-ui-temporarily-hidden / vilda-password-alert-open / vilda-modal-alert-open / vilda-embedded / vilda-shell-host (display:none). */
export type ScrollTopButtonContextClass =
  | 'has-mobile-bottom-dock'
  | 'has-mobile-bottom-dock-visible'
  | 'mobile-bottom-dock-transitioning'
  | 'mobile-nav-ui-locked'
  | 'user-hides-mobile-dock'
  | 'user-hides-nav-arrow'
  | 'nav-ui-temporarily-hidden'
  | 'vilda-password-alert-open'
  | 'vilda-modal-alert-open'
  | 'vilda-embedded'
  | 'vilda-shell-host';

/** Przycisk „do góry” powłoki app.html — <button id="appShellScrollTop" type="button" aria-label="Przewiń na górę"> z inline SVG 22px; widoczny tylko z klasą "is-visible". */
export interface AppShellScrollTopProps {
  /** Klasa "is-visible" (opacity 1, translateY(0), pointer-events auto). */
  visible: boolean;
  /** aria-label; w aplikacji "Przewiń na górę". */
  ariaLabel?: string;
}
export declare const AppShellScrollTop: (props: AppShellScrollTopProps) => HTMLButtonElement;

/** Przycisk „Nowy termin” powłoki (trasa Terminarz) — <button id="appShellTermFab" type="button" aria-label="Nowy termin">+</button>; widoczny tylko z klasą "is-visible". */
export interface AppShellTermFabProps {
  /** Klasa "is-visible". */
  visible: boolean;
  /** aria-label; w aplikacji "Nowy termin". */
  ariaLabel?: string;
  /** Treść przycisku; w aplikacji "+". */
  children?: string;
}
export declare const AppShellTermFab: (props: AppShellTermFabProps) => HTMLButtonElement;
