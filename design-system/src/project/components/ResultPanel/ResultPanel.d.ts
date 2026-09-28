/** Panel głównego wyniku obliczenia — <div class="result-box"> albo <section class="result-card">. */
export interface ResultPanelProps {
  /**
   * Odmiana:
   * - "box"       → <div class="result-box"> z <strong> etykietą i <span class="result-val">
   * - "card"      → <section class="result-card"> z <h2 class="intake-title"> i <div class="result-number">…<small>jednostka</small></div>
   * - "whr"       → <div class="result-box"> z .whr-result > .whr-topline (.whr-label, .whr-number) + .whr-badges (.whr-badge) + .whr-status
   * - "adult"     → <div class="result-box adult-vitals-result-box"> (wyrównany do lewej, 1rem)
   * - "intake"    → <div class="intake-result-card"> z <p><strong>Etykieta:</strong> wartość</p>
   * - "plan"      → <div class="plan-result-card"> z <h3> i .result-number
   * - "advanced"  → <div id="advResults"> (blok wyników zaawansowanych; wygląd po id)
   * - "bsa"       → <div class="bsa-info"> (jedna wartość 1.35rem, --primary)
   */
  variant?: 'box' | 'card' | 'whr' | 'adult' | 'intake' | 'plan' | 'advanced' | 'bsa';
  /**
   * Interpretacja kliniczna (tylko ramka i liczba zmieniają kolor).
   * Klasy na .result-box: (brak) | "bmi-warning" | "bmi-danger" | "whr-warning" | "whr-danger";
   * na #bpResult: "rr-warning" | "rr-danger"; na .adult-vitals-result-box: "adult-vitals-warning" | "adult-vitals-danger";
   * na .whr-status: "ok" | "warn" | "bad"; na .intake-alert: "warn" | "danger";
   * stany PRO: "pro-hidden-border" na .result-box/.result-card, "pro-warning" | "pro-danger" na .result-val.
   */
  severity?: 'ok' | 'warning' | 'danger';
  /** Tylko "card": klasa "--pulse" — jednorazowy błysk tła (animacja pulseBG 1 s). */
  pulse?: boolean;
  /** Wymagane id ze źródła, gdy reguły są po id: "intakeCard" | "bpResult" | "advResults" | "intakeResults" | "adultVitalsResult" | "idealWeightInfo". */
  id?: string;
  /** Etykieta w <strong> („BMI:", „WHR:", „Ciśnienie:"). */
  label?: string;
  /** Wartość liczbowa z przecinkiem dziesiętnym („17,4", „1850"). */
  value: string;
  /** Jednostka w <small> przy .result-number („kcal", „kg"). */
  unit?: string;
  /** Interpretacja słowna pod liczbą („48. centyl", „w normie"). */
  note?: string;
}
export declare const ResultPanel: (props: ResultPanelProps) => HTMLDivElement | HTMLElement;
