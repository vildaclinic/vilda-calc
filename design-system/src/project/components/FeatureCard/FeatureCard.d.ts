/** Kafelek podstrony w instrukcji — <button type="button" class="guide-tile"> wewnątrz <div class="guide-tile-grid">. */
export interface GuideTileProps {
  /** Wartość atrybutu data-guide-page, np. "index" | "docpro" | "klirens" | "homa". */
  page: string;
  /** Ikona Lucide (SVG inline) w <span class="guide-tile-icon" aria-hidden="true">. */
  icon: string;
  /** Pigułka z liczbą modułów obok ikony: <span class="guide-tile-count">. */
  count?: string;
  /** <h3 class="guide-tile-title">. */
  title: string;
  /** <p class="guide-tile-copy">. */
  copy: string;
  /** Tekst stopki <div class="guide-tile-footer"><span>…</span></div>, np. "Rozwiń moduły" / "Zwiń moduły". */
  footer: string;
  /** Kafelek rozwinięty — klasa "is-active" i aria-expanded="true". */
  active?: boolean;
}
export declare const GuideTile: (props: GuideTileProps) => HTMLButtonElement;

/** Siatka kafelków: <div class="guide-tile-grid"> (1 kolumna; od 700px 2; od 1180px 3). */
export declare const GuideTileGrid: (props: { children: HTMLButtonElement[] }) => HTMLDivElement;

/** Odznaka modułu w szczegółach instrukcji: <span class="guide-module-badge guide-module-badge-user|-doctor|-shared"> w <div class="guide-module-meta">. */
export interface GuideModuleBadgeProps {
  /** Klasy: "guide-module-badge-user" | "guide-module-badge-doctor" | "guide-module-badge-shared". */
  kind: 'user' | 'doctor' | 'shared';
  children: string;
}
export declare const GuideModuleBadge: (props: GuideModuleBadgeProps) => HTMLSpanElement;

/** Numerowane kroki „Jak to działa”: <ol class="flow-steps"> pod body.about-page; każdy <li> zaczyna się od <strong>, numer rysuje ::before. */
export interface FlowStepsProps {
  steps: Array<{ title: string; text: string }>;
}
export declare const FlowSteps: (props: FlowStepsProps) => HTMLOListElement;

/** Karta-odnośnik z ikoną i strzałką: <a class="about-link-card"> w <div class="about-link-grid"> pod body.about-page. */
export interface AboutLinkCardProps {
  href: string;
  /** Ikona Lucide w pierwszym <span class="sidebar-icon">; strzałka arrow-right w ostatnim. */
  icon: string;
  children: string;
}
export declare const AboutLinkCard: (props: AboutLinkCardProps) => HTMLAnchorElement;
