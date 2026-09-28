/** Pigułka tematyczna strony edukacyjnej — <span class="edu-chip"> z <span class="edu-chip-icon"> (SVG Lucide) i <span> z tekstem, w <div class="edu-chip-row">. */
export interface EduChipProps {
  /** Nazwa ikony Lucide, np. "activity", "calculator", "syringe", "info", "plus-circle", "minus-circle". */
  icon: string;
  /** Tekst, np. "Cukrzyca typu 1", "Ocena glikemii przed i po posiłku". */
  children: string;
}
export declare const EduChip: (props: EduChipProps) => HTMLSpanElement;
/** Wiersz chipów: <div class="edu-chip-row"> (flex-wrap, gap .65rem, margin-top 1rem). */
export declare const EduChipRow: (props: { children: HTMLSpanElement[] }) => HTMLDivElement;
