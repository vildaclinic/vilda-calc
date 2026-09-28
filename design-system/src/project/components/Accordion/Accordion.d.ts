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

/** Natywny <details> w trzech wariantach: "glossary" | "summary" | "panel". */
export type AccordionProps =
  | ({ variant: 'glossary' } & GlossaryAccordionProps)
  | ({ variant: 'summary' } & SummaryDisclosureProps)
  | ({ variant: 'panel' } & DetailsPanelProps);

export declare const Accordion: (props: AccordionProps) => HTMLDetailsElement | HTMLDivElement;
