/** Karta wprowadzająca strony informacyjnej — <section> u góry treści; wariant decyduje o klasach i wymaganej klasie strony na <body>. */
export interface MarketingHeroProps {
  /**
   * Wariant strony. Klasy sekcji: "about-hero" (wymaga body.about-page) | "contact-hero" (wymaga przodka .contact-page)
   * | "sub-hero" (subskrypcja, body bez liquid-ios26) | "guide-hero" (instrukcja).
   */
  variant: 'about' | 'contact' | 'sub' | 'guide';
  /** Odznaki nad nagłówkiem (about: <span class="about-badge">, contact: <span class="contact-badge">) — ikona Lucide w <span class="sidebar-icon"> i tekst. */
  badges?: Array<{ icon: string; label: string }>;
  /** Pigułka PRO nad nagłówkiem (tylko sub): <span class="sub-hero__pill">, prefiks ★ dodaje ::before. */
  pill?: string;
  /** Nagłówek: <h2> (about, contact), <h1> (sub), <h2 class="guide-title"> lub <h1 class="guide-title"> (guide). */
  title: string;
  /** Lead: <p class="hero-lead"> w <div class="hero-copy"> (about), <p class="hero-lead"> (contact), <p> (sub), <p class="guide-lead"> (guide). */
  lead: string;
  /** Dalsze akapity (about: kolejne <p> w .hero-copy; mogą zawierać <strong> i <span class="inline-label">). */
  paragraphs?: string[];
  /** Notatka pod treścią (about): <div class="hero-note"> ze <strong> na początku. */
  note?: string;
  /** Odnośniki na końcu hero: about → <div class="about-quick-links"> (QuickLink), contact → <div class="contact-actions"> (QuickLink). */
  links?: HTMLElement;
}
export declare const MarketingHero: (props: MarketingHeroProps) => HTMLElement;

/** Etykieta w tekście hero „O aplikacji”: <span class="inline-label">Dane użytkownika</span>. */
export interface InlineLabelProps {
  children: string;
}
export declare const InlineLabel: (props: InlineLabelProps) => HTMLSpanElement;
