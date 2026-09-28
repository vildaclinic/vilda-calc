/** Bramka profesjonalna: <div class="doctor-wrapper"> z <label class="doctor-label">, <span class="doctor-subtitle"> i <input type="checkbox" class="doctor-checkbox">. */
export interface DoctorCheckboxProps {
  /** Etykieta nad polem, np. "Jestem lekarzem". */
  label: string;
  /** Podtytuł, np. "Zaznacz, aby odblokować moduł profesjonalny". */
  subtitle?: string;
  /** Modyfikator kontenera: (brak) | "compact" (pole 24px, mniejsze teksty). */
  size?: 'default' | 'compact';
  checked?: boolean;
  /** id pola, powiązane z for etykiety (w aplikacji "isDoctor"). */
  id: string;
}

/** Chip ankiety: <label class="diet-survey-chip"><input type="checkbox"><span>…</span></label>, zwykle w <div class="diet-survey-grid">. */
export interface SurveyChipProps {
  /** Tekst w <span>, np. "Słodycze codziennie". */
  label: string;
  name?: string;
  value?: string;
  checked?: boolean;
}

/** Siatka chipów (dwie kolumny, odstęp .45rem). */
export interface SurveyChipGridProps {
  chips: SurveyChipProps[];
}

export declare const DoctorCheckbox: (props: DoctorCheckboxProps) => HTMLDivElement;
export declare const SurveyChip: (props: SurveyChipProps) => HTMLLabelElement;
export declare const SurveyChipGrid: (props: SurveyChipGridProps) => HTMLDivElement;
