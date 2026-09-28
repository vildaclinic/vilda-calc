/** Pływający dolny dock nawigacji (≤991px) — <nav id="mobileBottomDock" class="mobile-bottom-dock" aria-label="Szybka nawigacja"> z jednym <div class="mobile-bottom-dock__list"> i pięcioma odnośnikami. Reguły są zapisane po id, więc id jest wymagane. */
export interface MobileDockItem {
  /** Adres trasy, np. "index.html" albo "app.html#/start". */
  href: string;
  /** Etykieta widoczna (może być skrócona, np. "Lab"). */
  label: string;
  /** Pełna nazwa trasy → data-full-label na etykiecie i aria-label na odnośniku; w aplikacji "Jednostki laboratoryjne" dla "Lab". */
  fullLabel?: string;
  /** Nazwa ikony Lucide w <span class="mobile-bottom-dock__icon"><span data-lucide="…">; w aplikacji: home, stethoscope, file-text, calendar, flask-conical. */
  icon: string;
  /** Bieżąca trasa: klasa "is-active" + aria-current="page". */
  active?: boolean;
}

export interface MobileDockProps {
  /** Dokładnie pięć tras — siatka ma sztywno repeat(5,minmax(0,1fr)). */
  items: [MobileDockItem, MobileDockItem, MobileDockItem, MobileDockItem, MobileDockItem];
  /** Stan docka: ukryty przy przewijaniu ("is-hidden") lub przy klawiaturze ("is-keyboard-hidden"). Klasy na <nav>: (brak) | "is-hidden" | "is-keyboard-hidden" */
  state?: 'visible' | 'hidden' | 'keyboard-hidden';
  /** aria-label; w aplikacji "Szybka nawigacja". */
  ariaLabel?: string;
}

/** Klasy na <body>, którymi skrypt steruje dockiem: has-mobile-bottom-dock (display:block + padding-bottom), has-mobile-bottom-dock-visible, mobile-bottom-dock-transitioning, mobile-nav-ui-locked (bez animacji), user-hides-mobile-dock / nav-ui-temporarily-hidden / vilda-password-alert-open / vilda-modal-alert-open (display:none), display-mode-standalone (kotwica PWA). */
export type MobileDockBodyClass =
  | 'has-mobile-bottom-dock'
  | 'has-mobile-bottom-dock-visible'
  | 'mobile-bottom-dock-transitioning'
  | 'mobile-nav-ui-locked'
  | 'user-hides-mobile-dock'
  | 'nav-ui-temporarily-hidden'
  | 'vilda-password-alert-open'
  | 'vilda-modal-alert-open'
  | 'display-mode-standalone';

export declare const MobileDock: (props: MobileDockProps) => HTMLElement;
