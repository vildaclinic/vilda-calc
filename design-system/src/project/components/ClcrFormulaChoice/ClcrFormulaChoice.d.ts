/** Karta modułu obliczeń klirensu — <article class="clcr-module-card" data-module-id> w <div class="clcr-module-grid"> wewnątrz <section class="clcr-module-section" data-level>. */
export interface ClcrModuleCardProps {
  /** data-module-id, np. "child-egfr". */
  id: string;
  /** <h4 class="clcr-module-card__title">, np. „eGFR u dziecka i młodej osoby”. */
  title: string;
  /** <p class="clcr-module-card__description">, np. „Współczesny wzór kreatyninowy CKiD U25.” */
  description: string;
  /** Klasa "is-active" (gradient, obrys rgba(0, 131, 141, 0.55), lewy pasek --clcr-primary). */
  active?: boolean;
  /**
   * Jedna formuła: <button class="clcr-formula-choice" data-formula-id aria-pressed>Wybierz</button>;
   * kilka formuł: <select class="clcr-module-variant-select" aria-label="Wariant: <tytuł>"> z opcją „Wybierz wariant (N)” i <button class="clcr-formula-choice" disabled>Otwórz obliczenie</button>.
   */
  variants: { formulaId: string; label: string }[];
  /** Aktywna formuła (aria-pressed="true" lub zaznaczona opcja selecta). */
  activeFormulaId?: string;
}

/** Przycisk wyboru formuły — <button type="button" class="clcr-formula-choice"> w .clcr-module-card__variants. */
export interface ClcrFormulaChoiceProps {
  /** data-formula-id (tylko przy jednej formule). */
  formulaId?: string;
  /** aria-pressed="true" — biały tekst na --clcr-primary (w szkle nadpisane regułą .liquid-ios26 button). */
  pressed?: boolean;
  /** :disabled — tekst #819395, tło #edf2f2, opacity 0.8, cursor not-allowed. */
  disabled?: boolean;
  /** „Wybierz” | „Otwórz obliczenie”. */
  children: string;
}

/** Sekcja poziomu — <section class="clcr-module-section" data-level> z <h3 class="clcr-module-section__title">. */
export interface ClcrModuleSectionProps {
  /** data-level: "basic" | "advanced" | "pro" | "spot". */
  level: 'basic' | 'advanced' | 'pro' | 'spot';
  /** „Obliczenia podstawowe” | „Obliczenia zaawansowane” | „Obliczenia profesjonalne” | „Obliczenia z próbki moczu”. */
  title: string;
  cards: ClcrModuleCardProps[];
}

/** Starszy kafel wersji zachowany dla silnika — <div class="version-option"> w <div id="versionContainer" class="version-container">. Klasy: (brak) | "selected" | "disabled". */
export interface ClcrVersionOptionProps {
  selected?: boolean;
  disabled?: boolean;
  /** Etykieta formuły, np. „Klirens kreatyniny — dorośli (ml/min)”. */
  children: string;
}

/** Ukryty picker kanoniczny — <div id="formulaPicker" class="clcr-canonical-picker"> (2×2px, opacity 0). */
export declare const ClcrCanonicalPicker: () => HTMLDivElement;
export declare const ClcrModuleSection: (props: ClcrModuleSectionProps) => HTMLElement;
export declare const ClcrModuleCard: (props: ClcrModuleCardProps) => HTMLElement;
export declare const ClcrFormulaChoice: (props: ClcrFormulaChoiceProps) => HTMLButtonElement;
export declare const ClcrVersionOption: (props: ClcrVersionOptionProps) => HTMLDivElement;
