/** Pulsujący pierścień uwagi na ramce wyniku — klasa na gospodarzu (.result-box / .result-card / .adult-vitals-result-box); gospodarze z id (#bpResult, #coleInfo, #intakeResults, #circHeadResult, #circChestResult, #adultVitalsResult) rysują go na nakładce ::after i zachowują w trybie ograniczonego ruchu. */
export interface PulseProps {
  /** Klasa pulsu: "pulse-danger-infinite" | "pulse-warning-infinite" | "pulse-danger-2s" | "pulse-warning-2s". */
  pulse: 'danger-infinite' | 'warning-infinite' | 'danger-2s' | 'warning-2s';
  /** Klasa progu zmieniająca obrys gospodarza: "rr-danger" | "rr-warning" (#bpResult, #circHeadResult, #circChestResult) | "bmi-danger" | "bmi-warning" (#coleInfo, #intakeResults) | "adult-vitals-danger" | "adult-vitals-warning" (.adult-vitals-result-box). */
  threshold?: 'rr-danger' | 'rr-warning' | 'bmi-danger' | 'bmi-warning' | 'adult-vitals-danger' | 'adult-vitals-warning';
  /** Gospodarz: "result-box" (z .result-val w środku) | "result-card" | "adult-vitals-result-box" (#adultVitalsResult) | "pro-overlay" (nakładka PRO — pierścień na ::after, w trybie ograniczonego ruchu wyłączony). */
  host?: 'result-box' | 'result-card' | 'adult-vitals-result-box' | 'pro-overlay';
  /** id gospodarza, po którym źródło rysuje pierścień na ::after. */
  id?: 'bpResult' | 'coleInfo' | 'intakeResults' | 'circHeadResult' | 'circChestResult' | 'adultVitalsResult';
  /** Wjazd nowego wyniku — klasa "animate-in" (fadeSlideUp .45s). */
  animateIn?: boolean;
  /** Błysk tła na .result-card — klasa "--pulse" (pulseBG 1s, var(--brand-light) o kryciu .15). */
  flash?: boolean;
  /** Treść wyniku, np. <div class="result-val">142/94 mmHg</div>. */
  children: string | HTMLElement;
}
export declare const Pulse: (props: PulseProps) => HTMLDivElement;

/** Stan ładowania strony: klasa "js-loading" na <body> ukrywa .main-content (visibility:hidden) do inicjalizacji skryptów. */
export declare const JS_LOADING: 'js-loading';
