/** Uniwersalna karta aplikacji — <div>/<section class="card"> albo <fieldset> z <legend>. */
export interface CardProps {
  /**
   * Wariant powierzchni. Klasy: "card" | "card summary-card porownanie-karta" | "card gh-test-card" | "plan-card" (bez "card") | section.card | fieldset (z legendą) | fieldset.user-card
   */
  variant?: 'card' | 'summary' | 'gh-test' | 'plan' | 'section' | 'fieldset' | 'user-card';
  /** Tekst legendy — tylko dla fieldset/user-card; <legend> musi być pierwszym dzieckiem. */
  legend?: string;
  /** Nagłówek karty: h2 (wyśrodkowany inline w aplikacji) albo h3 z margin:0. */
  heading?: string;
  /** Poziom nagłówka. */
  headingLevel?: 2 | 3;
  /**
   * Dodatkowe selektory z partiala: ".current-summary-card" (h3 bez górnego marginesu, .summary-content),
   * "#professionalModule" (obrys i cień bez tła, wymagane id), ".info-card" i "#toNormCard" (tylko reguły
   * wysokiego kontrastu / wyśrodkowany h2). Klasy: "current-summary-card" | "info-card"
   */
  extra?: 'current-summary-card' | 'info-card';
  /** Klasa "_enter" (animacja wejścia ios26-ui.js) — na szkle neutralizowana. */
  enter?: boolean;
  /** Treść karty: akapity, label+input (user-card), .porownanie (summary). */
  children: string | HTMLElement | HTMLElement[];
}
/** Zwraca <div>, <section> lub <fieldset> zależnie od wariantu. */
export declare const Card: (props: CardProps) => HTMLDivElement | HTMLElement | HTMLFieldSetElement;
