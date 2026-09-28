/** Pigułka statusu kart klinicznych — pojedynczy <span> z klasą bazową i opcjonalnym modyfikatorem; grupa .porownanie-chip w <div class="porownanie-chipy">. */
export interface ChipProps {
  /** Rodzina chipa (klasa bazowa): "porownanie-chip" | "pt-pill" | "energy-mode-badge" | "adv-growth-reliability-badge" | "adv-growth-profile-badge" | "adv-growth-model-chip" | "adult-vitals-summary-badge" | "nutrition-micros-badge" | "diet-personalized-badge" | "diet-recommended-badge" | "vild-rem-chip" | "circ-pro-pill" | "whr-badge" | "badge" (ten ostatni tylko pod #intakeCard). */
  family:
    | 'porownanie-chip' | 'pt-pill' | 'energy-mode-badge'
    | 'adv-growth-reliability-badge' | 'adv-growth-profile-badge' | 'adv-growth-model-chip'
    | 'adult-vitals-summary-badge' | 'nutrition-micros-badge'
    | 'diet-personalized-badge' | 'diet-recommended-badge'
    | 'vild-rem-chip' | 'circ-pro-pill' | 'whr-badge' | 'badge';
  /** Modyfikator zależny od rodziny: porownanie-chip → "porownanie-chip--szara" | "porownanie-chip--kontekst"; pt-pill → "status-ok" | "status-improve" | "status-alert"; energy-mode-badge → "energy-mode-badge--clinical"; adv-growth-reliability-badge → "is-high" | "is-moderate" | "is-lowered" | "is-low" | "is-indicative"; adv-growth-profile-badge → "is-standard" | "is-possible" | "is-probable" | "is-out-of-scope"; adv-growth-model-chip → "is-preferred" | "is-specialist" | "is-comparison" | "is-warning" | "is-unavailable"; adult-vitals-summary-badge → "tone-warn" | "tone-danger"; diet-personalized-badge → "diet-personalized-badge--active". */
  modifier?: string;
  /** Ukrycie chipa atrybutem hidden (obsługiwane przez .porownanie-chip[hidden]). */
  hidden?: boolean;
  /** Treść, np. "Poprzedni pomiar: 12.03.2025", "w normie", "Tryb kliniczny", "Ciśnienie podwyższone", "RDA", "Zalecane", "PRO". */
  children: string;
  /** Dopisek w <small> (tylko .whr-badge), np. "(dorośli)". */
  small?: string;
}
export declare const Chip: (props: ChipProps) => HTMLSpanElement;
/** Wiersz chipów: <div class="porownanie-chipy"> z <span class="porownanie-chip …"> albo <div class="energy-mode-badge-row [energy-mode-badge-row--inline | energy-mode-badge-row--results]"> z <span class="energy-mode-badge …">. */
export declare const ChipRow: (props: { kind: 'porownanie-chipy' | 'energy-mode-badge-row'; modifier?: 'energy-mode-badge-row--inline' | 'energy-mode-badge-row--results'; children: HTMLSpanElement[] }) => HTMLDivElement;
