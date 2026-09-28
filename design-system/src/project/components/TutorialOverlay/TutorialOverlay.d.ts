/** Nakładka samouczka — <div class="tutorial-overlay" style="display:block"> z .tutorial-blocker (inline inset), .tutorial-highlight-frame (inline top/left/width/height) i .tutorial-bubble[role="dialog"]. Wszystkie warstwy są position:fixed. */
export interface TutorialOverlayProps {
  /** Tytuł kroku w <strong> (1.08rem, --primary), np. "Pierwsze kroki". */
  title: string;
  /** Opis kroku w <p> (.98rem). */
  description: string;
  /** Prostokąt celu z getBoundingClientRect(): ramka .tutorial-highlight-frame; cel dostaje klasę "tutorial-highlight". */
  target?: { top: number; left: number; width: number; height: number };
  /** Etykieta przycisku głównego .tutorial-next (teal). Domyślnie "Dalej". */
  nextLabel?: string;
  /** Etykieta przycisku pominięcia .tutorial-skip (#e6ebee / #22303a). Domyślnie "Pomiń". */
  skipLabel?: string;
  /** Chwilowe ukrycie — klasa "is-temporarily-hidden" na nakładce lub dymku. */
  temporarilyHidden?: boolean;
  /** Chowa dock mobilny i przycisk „do góry” — klasa "nav-ui-temporarily-hidden" na <body>. */
  hideNavUi?: boolean;
}
export declare const TutorialOverlay: (props: TutorialOverlayProps) => HTMLDivElement;
