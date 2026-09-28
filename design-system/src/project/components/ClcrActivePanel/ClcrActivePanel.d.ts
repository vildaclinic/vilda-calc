/** Powłoka kalkulatora klirensu — <section class="clcr-workflow"> pod <html data-clcr-workflow-ui="1">. */
export interface ClcrWorkflowProps {
  /** span.clcr-workflow__eyebrow, np. „Klirens kreatyniny”. */
  eyebrow: string;
  /** h1.clcr-workflow__title */
  title: string;
  /** p.clcr-workflow__lead */
  lead?: string;
  children: HTMLElement[];
}
export declare const ClcrWorkflow: (props: ClcrWorkflowProps) => HTMLElement;

/** Panel aktywnego obliczenia — <div class="clcr-active-panel"> (renderActiveHeading). */
export interface ClcrActivePanelProps {
  /** Kicker: „Aktywne obliczenie” (domyślnie) lub „Tryb zgodności” (formuła zgodnościowa). */
  legacy?: boolean;
  /** h2.clcr-active-panel__title = formula.label, np. „CKiD U25 eGFRcr (2021)”; bez formuły „Najpierw wybierz formułę”. */
  title: string;
  /** p.clcr-active-panel__note = formula.note (opcjonalne). */
  note?: string;
}
export declare const ClcrActivePanel: (props: ClcrActivePanelProps) => HTMLDivElement;

/** Panel gotowości danych — <div class="clcr-readiness clcr-readiness--<state>"> z <p> lub <ul class="clcr-missing-list">. */
export interface ClcrReadinessProps {
  /** Klasy: "clcr-readiness--neutral" | "clcr-readiness--incomplete" | "clcr-readiness--warning" | "clcr-readiness--error" | "clcr-readiness--ready" */
  state: 'neutral' | 'incomplete' | 'warning' | 'error' | 'ready';
  message: string;
  missing?: string[];
}
export declare const ClcrReadiness: (props: ClcrReadinessProps) => HTMLDivElement;

/** Szyna wyniku — <div class="clcr-result-rail"> z .clcr-rail-head, button.clcr-fullreport-button i kartami .card; ≥980px przyklejona (top 74px). */
export interface ClcrResultRailProps {
  /** .clcr-rail-kick (stateKicker): „Wynik gotowy” | „Wynik liczbowy gotowy” | inne stany. */
  kicker: string;
  /** .clcr-rail-formula — nazwa formuły. */
  formula?: string;
  /** .clcr-rnum — wartość i <small> jednostka, np. { value: "92", unit: "mL/min/1,73 m²" }. */
  result?: { value: string; unit?: string };
  /** Przycisk „Zobacz pełny opis wyniku ↓”; hidden dopóki nie ma wyniku. */
  fullReportVisible?: boolean;
  children?: HTMLElement[];
}
export declare const ClcrResultRail: (props: ClcrResultRailProps) => HTMLDivElement;
