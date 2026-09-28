/** Numerowany krążek kroku. Lista informacyjna: <ol class="flow-steps"> (body.about-page) lub <ol class="contact-steps"> (.contact-page) z <li> — numer z licznika CSS w li::before. */
export interface StepListProps {
  variant: 'flow-steps' | 'contact-steps';
  /** Treść kolejnych <li>; numeracja automatyczna. */
  items: string[];
}
export declare const StepList: (props: StepListProps) => HTMLOListElement;

/** Krok kreatora przelicznika: <div class="lab-step" id="labStepN"><div class="lab-step-num" id="labStepNNum">N</div><div class="lab-step-body"><div class="lab-step-label">…</div>…</div></div>. */
export interface LabStepProps {
  /** Numer kroku (treść krążka i sufiks identyfikatorów labStepN / labStepNNum). */
  number: number;
  /** Stan krążka: (brak) | "is-active" (pełny #00838d + halo + lab-step-glow) | "is-done" (#1D9E75). */
  state?: 'idle' | 'active' | 'done';
  /** Klasa "is-hidden" na .lab-step — krok ukryty. */
  hidden?: boolean;
  /** Etykieta w .lab-step-label (wersaliki), np. "Substancja". */
  label: string;
  children?: string;
}
export declare const LabStep: (props: LabStepProps) => HTMLDivElement;

/** Krok planu dnia (cukrzyca): <div class="diab-day-step"><span class="diab-day-step__num">N</span><div><strong>Tytuł</strong><p>…</p></div></div>; pod body.page-cukrzyca skórka --diab-*. */
export interface DiabDayStepProps {
  number: number;
  title: string;
  children: string;
}
export declare const DiabDayStep: (props: DiabDayStepProps) => HTMLDivElement;

/** Pigułka "Krok N" na karcie modułu: <span class="diab-module-card__step">Krok 2</span>. */
export declare const DiabModuleStep: (props: { children: string }) => HTMLSpanElement;

/** Indeks akordeonu instrukcji: <span class="guide-accordion-index">N</span> (2rem koło). */
export declare const GuideAccordionIndex: (props: { children: string }) => HTMLSpanElement;
