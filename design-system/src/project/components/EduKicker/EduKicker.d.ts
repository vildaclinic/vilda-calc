/** Etykieta nad tytułem hero edukacyjnego — <span class="edu-kicker"> z <span class="edu-kicker-icon"> (SVG Lucide) i <span> z tekstem; pod body.edu-page bierze tokeny --edu-kicker-*. */
export interface EduKickerProps {
  /** Nazwa ikony Lucide (w aplikacji data-lucide), np. "play", "book-open", "file-text". */
  icon: string;
  /** Tekst etykiety, np. "Film instruktażowy". */
  children: string;
}
export declare const EduKicker: (props: EduKickerProps) => HTMLSpanElement;
