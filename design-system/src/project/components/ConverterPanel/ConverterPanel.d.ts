/** Stan wyniku względem zakresu referencyjnego — klasa na .lab-result-big-value, .lab-range-status i .lab-range-marker. */
export type LabResultState = 'is-normal' | 'is-below' | 'is-above' | 'is-uwaga-high' | 'is-uwaga-low';

/** Krok formularza — <div class="lab-step"> z numerem .lab-step-num i treścią .lab-step-body. */
export interface LabStep {
  number: number;
  /** Stan numeru: "done" → .is-done (#1D9E75), "active" → .is-active (teal z poświatą), "idle" → brak klasy. */
  state: 'idle' | 'active' | 'done';
  /** Etykieta .lab-step-label (wersaliki), np. "Substancja". */
  label: string;
  /** Dopisek: hint → <span class="lab-step-label-hint"> (teal), opt → <span class="lab-step-label-opt"> („— opcjonalnie"). */
  hint?: { kind: 'hint' | 'opt'; text: string };
  /**
   * Kontrolka kroku:
   * - "substance"  → .lab-search-wrap > .lab-substance-input-wrap > input.lab-substance + button.lab-substance-clear, .lab-substance-hint
   * - "value-unit" → .lab-input-row > input[inputmode="decimal"] + select
   * - "target"     → .lab-step-target-row > .lab-step-target-arrow „→" + select
   * - "pills"      → .lab-mini-pills > button.lab-mini-pill (.is-active)
   */
  control: 'substance' | 'value-unit' | 'target' | 'pills';
  /** Tylko "pills": etykiety pigułek i indeks aktywnej. */
  pills?: { label: string; active?: boolean }[];
  /** Podpowiedź pod kontrolką w .lab-step-hint. */
  note?: string;
  /** Krok ukryty (.is-hidden). */
  hidden?: boolean;
}

/** Sekcja wyniku — <div class="lab-result-section"> (z .is-empty przed wpisaniem wartości). */
export interface LabResult {
  empty?: boolean;
  state: LabResultState;
  /** Tekst pigułki .lab-range-status, np. "W normie". */
  statusLabel: string;
  /** Wartość i jednostka w .lab-result-big (np. "97", "mg/dl"); placeholder "Wpisz wartość, aby zobaczyć wynik…". */
  value?: string;
  unit?: string;
  /** Pasek .lab-range-scale: zmienne --low-pct, --high-pct, --low-dark-pct, --high-dark-pct i --marker-pct (procenty w atrybucie style). */
  range?: { lowPct: number; highPct: number; lowDarkPct: number; highDarkPct: number; markerPct?: number; title?: string };
  /** Notka kliniczna .lab-range-uwaga-note dla stanów „Uwaga". */
  uwagaNote?: string;
  /** Linia .lab-result-source, np. "Zakres referencyjny: <strong>70–99 mg/dl</strong> (3,9–5,5 mmol/l)". */
  sourceLine: string;
  /** Przycisk .lab-show-all-toggle[aria-expanded]. */
  showAllExpanded?: boolean;
}

/** Karta przelicznika — <div class="lab-card lab-full lab-smart-card" id="labResultsCard">. */
export interface ConverterPanelProps {
  /** Tytuł w <h1>, w aplikacji "Przelicznik jednostek laboratoryjnych". */
  title: string;
  steps: LabStep[];
  result: LabResult;
  /** Przycisk <button id="labClearBtn" class="lab-clear-btn"> (id wymagane przez reguły). */
  clearLabel: string;
  /** Toast .lab-toast (fixed); .is-visible po skopiowaniu, tekst "Skopiowano". */
  toast?: { text: string; visible: boolean };
}
export declare const ConverterPanel: (props: ConverterPanelProps) => HTMLDivElement;

/** Chip proponowanego badania — <button class="lab-suggest-chip"> w karcie .lab-suggest-card. */
export interface LabSuggestChipProps {
  label: string;
  /** Wybrany chip dostaje .is-selected. */
  selected?: boolean;
}
export declare const LabSuggestChip: (props: LabSuggestChipProps) => HTMLButtonElement;
