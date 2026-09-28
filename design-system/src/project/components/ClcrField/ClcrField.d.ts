/** Karta pola formularza klirensu — <label class="clcr-field" data-clcr-field-id> w <html data-clcr-workflow-ui="1">; dzieci w kolejności: .clcr-field__heading, kontrolka, .clcr-field__help, .clcr-field__validation. */
export interface ClcrFieldProps {
  /** Identyfikator kontrolki; daje id="clcr-label-<id>" nazwie i id="clcr-help-<id>" dymkowi. */
  id: string;
  /** Tekst .clcr-field__name (etykieta bez dwukropka, np. „Masa ciała (kg)”). */
  label: string;
  /**
   * Status pola: data-clcr-status i klasa etykiety "clcr-field__status--required" | "clcr-field__status--interpretation" | "clcr-field__status--optional".
   * Teksty: „* Wymagane” / „Wymagane potwierdzenie” (checkbox), „Do pełnej interpretacji”, „Opcjonalne”. W układzie U2 etykieta jest ukryta (display: none !important).
   */
  status?: 'required' | 'interpretation' | 'optional';
  /**
   * Rodzaj kontrolki jako bezpośrednie dziecko: input (nie checkbox), select, textarea;
   * 'choice' = klasa "clcr-field--choice" z <input type="checkbox"> (22px w kolumnie 28px);
   * 'protocol' = "clcr-field--choice" z ukrytym <input class="clcr-canonical-checkbox"> i <select class="clcr-protocol-answer"> („— wybierz —”, „Tak — potwierdzam”, „Nie”, „Nie wiem”).
   */
  control: 'input' | 'select' | 'textarea' | 'choice' | 'protocol';
  /** Klasy pary: "clcr-field--value" (z data-clcr-unit-pair) | "clcr-field--unit"; oba pola w <div class="clcr-field-pair" data-clcr-value-field data-clcr-unit-field>. */
  pairRole?: 'value' | 'unit';
  /** Treść dymka .clcr-field__help (hidden do kliknięcia przycisku informacji). */
  help: string;
  /** Źródło pomocy: data-clcr-help-source="field" | "formula". */
  helpSource?: 'field' | 'formula';
  /** Stan błędu: klasa "error" na kontrolce (obrys --danger) i tekst w <div class="validation-message clcr-field__validation">; karta dostaje tło --clcr-error-bg przez :has(> .error). */
  error?: string;
  /** Atrybut hidden na karcie (display: none !important). */
  hidden?: boolean;
}

/** Zwijana grupa pól opcjonalnego kontekstu — <details class="clcr-context-details"> z <summary class="clcr-context-details__summary"> i <div class="clcr-context-details__body"> (grid 2 kolumny, 1 kolumna do 760px). */
export interface ClcrContextDetailsProps {
  /** Tekst summary; w aplikacji „Opcjonalny kontekst kliniczny”. */
  summary: string;
  open?: boolean;
  /** Karty pól w body. */
  children: HTMLLabelElement[];
}

export declare const ClcrField: (props: ClcrFieldProps) => HTMLLabelElement;
export declare const ClcrFieldPair: (props: { value: HTMLLabelElement; unit: HTMLLabelElement }) => HTMLDivElement;
export declare const ClcrContextDetails: (props: ClcrContextDetailsProps) => HTMLDetailsElement;
