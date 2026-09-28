/** Komunikat w karcie wyników kalkulatora — <div> lub <p> z jedną z klas poniżej. */
export interface NoticeProps {
  /**
   * Wariant:
   * - "danger-card"  → class="plan-warning-card" (obrys 2px --danger, tło #ffeaea)
   * - "orange-card"  → class="plan-warning-card notice-orange" (obrys i tekst #c75d00, tło #fff); z id="whrSuggest" rozmiar 1.5rem
   * - "reminder"     → class="wfl-reminder" (1.3rem, #c75d00)
   * - "error-text"   → id="errorBox" (1.4rem, --primary, wyśrodkowany; display steruje skrypt)
   * - "compare"      → id="compareInstruction" (1.2rem, --primary)
   * - "diet-danger"  → class="diet-warning" (1.5rem, --danger)
   * - "centile"      → class="centile-warning" (--danger) | "centile-monitor-warning" (--notice-orange)
   * - "gh-test"      → class="gh-test-warning" (1.25rem, --danger)
   * - "intake"       → class="intake-alert warn" | "intake-alert danger" wewnątrz #intakeResults
   * - "professional" → class="professional-message" (#ce0000)
   * - "growth-panel" → class="adv-growth-profile-warning" (panel bursztynowy, promień 14px)
   * - "diet-info"    → class="diet-info-note" (efektywnie czarny tekst bez tła)
   */
  variant:
    | 'danger-card'
    | 'orange-card'
    | 'reminder'
    | 'error-text'
    | 'compare'
    | 'diet-danger'
    | 'centile'
    | 'gh-test'
    | 'intake'
    | 'professional'
    | 'growth-panel'
    | 'diet-info';
  /** Wymagane id z arkusza dla części wariantów. */
  id?: 'planWarning' | 'whrSuggest' | 'errorBox' | 'compareInstruction' | 'wflReminderBMI' | 'wflReminderCole';
  /** Widoczność — w aplikacji karty są ukryte (style="display:none") do czasu obliczenia. */
  hidden?: boolean;
  /** Treść po polsku; dozwolone <strong> i <a> (link w .centile-warning dziedziczy kolor). */
  children: string;
}
export declare const Notice: (props: NoticeProps) => HTMLDivElement | HTMLParagraphElement;
