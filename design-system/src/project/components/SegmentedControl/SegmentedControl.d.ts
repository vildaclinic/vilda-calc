/** Jedna opcja pigułki radiowej: <label><input type="radio"><span>…</span></label>. */
export interface PillOption {
  /** Tekst w <span>, np. "OLAF", "Nie", "Aktualna". */
  label: string;
  value: string;
  checked?: boolean;
  /** Stan wyłączony (obrys #ccc, tło #f3f3f3, tekst #666). */
  disabled?: boolean;
  /** Dopisek PRO w <sup class="pro-superscript"> po tekście. */
  pro?: boolean;
  /** id pola; "sourcePalczewska" włącza fioletowy wariant PRO (#90f). */
  id?: string;
}

/** Wybór źródła danych: <div class="data-source-toggle"> z etykietami <label><input type="radio"><span>. Obrys 2px --primary, promień 20px, max-width 360px. */
export interface DataSourceToggleProps {
  /** Wspólny atrybut name pól radio, w aplikacji "dataSource". */
  name: string;
  options: PillOption[];
  /** id kontenera, w aplikacji "dataToggleContainer". */
  id?: string;
}

/** Pytanie tak/nie: <div class="adult-vitals-radio-group" role="radiogroup"> z <label class="adult-vitals-radio-option"><input type="radio"><span>. Pigułki 999px, min-width 60px, .88rem/700. */
export interface VitalsRadioGroupProps {
  name: string;
  options: PillOption[];
  /** id elementu opisującego grupę (aria-labelledby), np. "adultHrAthleteLabel". */
  labelledBy?: string;
  /** Wariant tokenowy: grupa w kontenerze .nutrition-norms-card z dodatkową klasą "nutrition-norms-radio-group". Klasy: (brak) | "nutrition-norms-radio-group" */
  variant?: 'default' | 'nutrition';
}

/** Przełącznik strategii diety: <div class="diet-segmented-control"> z dwoma <button type="button">; aktywny ma klasę "is-active". */
export interface DietSegmentedControlProps {
  /** Dokładnie dwie opcje (siatka dwukolumnowa), np. "Redukcja masy" / "Stabilizacja masy". */
  options: [DietSegmentOption, DietSegmentOption];
  /** Wewnątrz #dietRecommendationsContent kolory pochodzą z tokenów --diet-ui-*. */
  inDietContent?: boolean;
}

export interface DietSegmentOption {
  label: string;
  /** Wartość atrybutu data-diet-strategy-choice, np. "reduction". */
  value: string;
  /** Klasa "is-active" na przycisku. */
  active?: boolean;
}

export declare const DataSourceToggle: (props: DataSourceToggleProps) => HTMLDivElement;
export declare const VitalsRadioGroup: (props: VitalsRadioGroupProps) => HTMLDivElement;
export declare const DietSegmentedControl: (props: DietSegmentedControlProps) => HTMLDivElement;
