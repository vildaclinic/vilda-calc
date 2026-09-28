/** Chip podsumowania pacjenta w pasku bocznym — <div class="ms-chip ms-chip--{tone}"> z <div class="ms-chip-icon">, <div class="ms-chip-main"> (<span class="ms-chip-label">, <span class="ms-chip-value">) i opcjonalnym <div class="ms-chip-badge">; w <div class="ms-chips">. */
export interface MiniSummaryChipProps {
  /** Ton: "ms-chip--normal" (turkus) | "ms-chip--borderline" (bursztyn) | "ms-chip--alert" (czerwień) | "ms-chip--neutral" (szarość). */
  tone: 'normal' | 'borderline' | 'alert' | 'neutral';
  /** Litera w kółku, np. "W" (waga), "H" (wzrost), "B" (BMI), "S" (płeć). */
  icon: string;
  /** Etykieta (wersaliki), np. "Waga". */
  label: string;
  /** Wartość, np. "26,0&thinsp;kg", "21,4". */
  value: string;
  /** Odznaka centyla, np. "45 c", "<1 c"; pominięta gdy brak. */
  badge?: string;
}
export declare const MiniSummaryChip: (props: MiniSummaryChipProps) => HTMLDivElement;
/** Kolumna chipów: <div class="ms-chips"> (gap .3rem). */
export declare const MiniSummaryChips: (props: { children: HTMLDivElement[] }) => HTMLDivElement;
