/** Pole formularza kart klinicznych: <label> z tekstem etykiety i zagnieżdżonym <input> lub <select>. */
export interface FormFieldProps {
  /** Treść etykiety z jednostką w nawiasie, np. "Obwód talii (cm):" — nie ma osobnego slotu jednostki. */
  label: string;
  /** Rodzaj kontrolki: input[type=text] | input[type=number] | select. */
  control?: 'text' | 'number' | 'select';
  /** Opcje dla select (tekst polski, np. "Mężczyzna", "Kobieta"). */
  options?: string[];
  /** Klasa stanu na kontrolce: (brak) | "vild-age-auto" | "vild-pole-z-kartoteki" | "vild-range-invalid" | "dose-out-of-range" (ta ostatnia działa tylko na #abxDoseInput). */
  state?: 'default' | 'auto' | 'from-record' | 'range-invalid' | 'dose-out-of-range';
  /** readonly na input → z klasą "vild-age-auto" lub "vild-pole-z-kartoteki" daje szare pole tylko do odczytu (#eef3f4). */
  readonly?: boolean;
  /** disabled — szary wygląd niosą reguły z id: #name, #advName, #abxDoseInput. */
  disabled?: boolean;
  /** id kontrolki; wymagane, gdy stan zależy od reguły z id (name, advName, dobInput, abxDoseInput). */
  id?: string;
  /** Wariant kontenera: "user-card" (Inter 1.05rem, promień .4rem) — klasa na przodku. */
  container?: 'default' | 'user-card';
}

/** Wiersz wieku: <div class="vild-age-row"> z dwiema etykietami; pierwsza ma klasę "vild-age-years". */
export interface AgeRowProps {
  years: FormFieldProps;
  months: FormFieldProps;
  /** Tekst pod wierszem w <div class="vild-dob-note"> (zielony #0f6e56). */
  note?: string;
}

/** Wyróżniona podgrupa <div class="vild-weeks-row"> (tło #eaf4f5) z etykietą i opcjonalnym błędem. */
export interface WeeksRowProps {
  field: FormFieldProps;
  /** Tekst w <div class="vild-dob-error" role="alert"> (czerwony #a32d2d). */
  error?: string;
}

/** Siatki pól pomiarowych — klasa na <div> otaczającym etykiety. */
export type MeasureGridClass = 'measure-row' | 'measure-row-sep' | 'measure-row-top' | 'measure-row-bot' | 'snack-row' | 'meal-row' | 'food-row' | 'flex' | 'half';

/** Tekst pomocniczy pod polem: <div class="muted">, <div class="vild-dob-note">, <div class="vild-dob-error">; "abx-disabled-label" szarzy etykietę wyłączonej dawki. */
export type HelperTextClass = 'muted' | 'vild-dob-note' | 'vild-dob-error' | 'abx-disabled-label';

/** Przycisk-link czyszczący datę: <button type="button" class="vild-dob-clear">. */
export type ClearButtonClass = 'vild-dob-clear';

export declare const FormField: (props: FormFieldProps) => HTMLLabelElement;
export declare const AgeRow: (props: AgeRowProps) => HTMLDivElement;
export declare const WeeksRow: (props: WeeksRowProps) => HTMLDivElement;
