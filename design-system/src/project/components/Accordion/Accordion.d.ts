/** Karta słownika — <details class="thy-glossary-item"> w div#thyroidCancerKidsCard > div.thy-glossary (id wymagany przez selektory źródła). */
export interface GlossaryAccordionProps {
  /** Hasło w <strong>, np. „Bethesda III (AUS/FLUS) u dzieci”. */
  term: string;
  /** Dopowiedzenie po „–”, np. „co to znaczy?”. */
  hint?: string;
  open?: boolean;
  id?: string;
  /** Treść div.thy-glossary-body (akapity, ul.thy-list, code). */
  children: HTMLElement | HTMLElement[];
}

/** Płaskie rozwinięcie pod podsumowaniem — <details class="current-summary-prognosis">. */
export interface SummaryDisclosureProps {
  /** Tekst summary, np. „Pozostałe metody prognozy (3)”. */
  label: string;
  open?: boolean;
  /** div.current-summary-prognosis-nota */
  note?: string;
  /** Wiersze div.current-summary-row (flex, .95rem, margin-top .4rem; kolor może nadać skrypt inline). */
  rows: string[];
}

/** Przycisk z panelem — <div class="adv-growth-result-details"><button class="adv-growth-result-details-btn"> + <div class="adv-growth-result-details-panel" [hidden]>. */
export interface DetailsPanelProps {
  /** Tekst przycisku: „Szczegóły” gdy zwinięty, „Ukryj szczegóły” gdy rozwinięty; ustawia aria-expanded. */
  expanded?: boolean;
  /** Treść panelu — p.adv-growth-result-details-copy. */
  children: HTMLElement | HTMLElement[];
}

/** Nagłówek listy z licznikiem — <button class="adv-history-toggle" aria-expanded aria-controls> przed kontenerem wierszy (P-HISTORIA-ZWIJANA). */
export interface ListHeaderProps {
  /** Tytuł span.adv-history-title, np. „Poprzednie pomiary”. */
  title: string;
  /** Liczba pomiarów w liście (także ukrytych); licznik span.porownanie-chip z odmianą: 1 pomiar, 2–4 pomiary, 5+ pomiarów. */
  count: number;
  /** Zwinięta lista: aria-expanded="false", akcja „Rozwiń”, widoczne podsumowanie. */
  collapsed?: boolean;
  /** Linia span.adv-history-summary (tylko przy zwiniętej liście), np. „wiek 4 l. – 9 l. · najnowszy: 129,1 cm · 27,0 kg”. */
  summary?: string;
  /** Liczba ukrytych wierszy z polem poza zakresem min/max — znacznik „Do poprawy: N” (0 = ukryty). */
  invalidCount?: number;
  /** id kontenera wierszy dla aria-controls, np. "advMeasurements". */
  controls: string;
}

/** Natywny <details> w trzech wariantach: "glossary" | "summary" | "panel"; nagłówek listy to wariant "list-header". */
export type AccordionProps =
  | ({ variant: 'glossary' } & GlossaryAccordionProps)
  | ({ variant: 'summary' } & SummaryDisclosureProps)
  | ({ variant: 'panel' } & DetailsPanelProps)
  | ({ variant: 'list-header' } & ListHeaderProps);

export declare const Accordion: (props: AccordionProps) => HTMLDetailsElement | HTMLDivElement | HTMLButtonElement;
