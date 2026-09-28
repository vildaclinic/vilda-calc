/** Karta materiałów edukacyjnych — <section class="card edu-…">; klasa "card" jest wymagana. */
export interface EduCardProps {
  /**
   * Wariant. Klasy: "card edu-hero" | "card edu-resource-card" | "card edu-presentation-card" | "card edu-video-shell" (+ "edu-video-shell--portrait") | "card edu-info-card"
   */
  variant: 'hero' | 'resource' | 'presentation' | 'video' | 'info';
  /** Pionowa ramka odtwarzacza (tylko variant "video"). Klasa: "edu-video-shell--portrait" */
  portrait?: boolean;
  /** Kicker hero: <span class="edu-kicker"> z ikoną Lucide (.edu-kicker-icon) i tekstem, np. „Film instruktażowy”. */
  kicker?: { icon: string; label: string };
  /** Odznaka kafelka: <span class="edu-card-badge">, np. „Film”. */
  badge?: string;
  /** Tytuł: h1.edu-title (hero), h3.edu-card-title (resource/presentation), h2 (info). */
  title: string;
  /** Opis: p.edu-lead (hero) albo p.edu-card-description. */
  description?: string;
  /** Pigułki meta (.edu-meta-row > .edu-meta-pill), np. „Czas filmu: 03:05”. */
  meta?: Array<{ icon?: string; label: string }>;
  /** Przyciski zasobów (.resource-actions > a.resource-button.primary|secondary). */
  actions?: Array<{ label: string; href: string; tone: 'primary' | 'secondary' }>;
  /** Wyśrodkowanie przycisków. Klasa: "resource-actions center" */
  actionsCenter?: boolean;
  /** Rozdziały (info): <ol class="chapter-list"><li><a><span class="chapter-time">mm:ss</span><span>tytuł</span></a></li>. */
  chapters?: Array<{ time: string; label: string; href: string }>;
  /** Drobne zastrzeżenie pod treścią: <p class="notice">. */
  notice?: string;
  /** Element <video controls preload="metadata" poster> w .edu-video-frame (variant "video"). */
  video?: { src: string; poster?: string };
}
/** Zwraca <section class="card edu-…">. */
export declare const EduCard: (props: EduCardProps) => HTMLElement;
