/** Podstawowy przycisk aplikacji — <button type="button"> lub <input type="button|submit">; wygląd z reguły globalnej `button` plus klasa wariantu. */
export interface ButtonProps {
  /**
   * Wariant. Klasy: (brak) | "primary-btn" | "secondary-btn" | "icon" | "add-row" | "module-btn" | "vild-tanner-toggle" | "btn-accent" (tylko pod szkłem, nadaje ios26-ui.js).
   * Pod `body.liquid-ios26` każdy z nich jest białą pigułką; turkus wraca tylko przez `id` sekcji (patrz `sectionId`).
   */
  variant?: 'default' | 'primary' | 'secondary' | 'icon' | 'add-row' | 'module' | 'tanner-toggle' | 'accent';
  /** Klasa "btn-icon" (szkło): inline-flex z gap .5rem i SVG 20px. */
  withIcon?: boolean;
  /** Klasa chwilowa "_pressed" (szkło): scale(.96) podczas naciśnięcia; ustawia ios26-ui.js. */
  pressed?: boolean;
  /**
   * Identyfikator wymagany przez reguły źródła: przełączniki sekcji ("toggleIntakeCard" | "toggleFoodCard" | "toggleNutritionMicrosCard" | "toggleNutritionNormsCard" | "toggleDownSyndrome" | "toggleCircSection" | "generateCentileChart" | "generateCentileChartBasic")
   * dają pełną szerokość i turkus; przełączniki modułów ("toggleAbxTherapy" | "toggleFluTherapy" | "toggleObesityTherapy" | "toggleHypertensionTherapy" | "toggleThyroidCancerKids" | "toggleIgfTests" | "toggleSnp" | "toggleTurner" | "togglePws" | "toggleSga" | "toggleIgf1" | "toggleGhMonitor") dają obrys `brand-light` po `active-toggle`; "tannerToggleBtn" dla przełącznika Tannera.
   */
  sectionId?: string;
  /** Moduł rozwinięty — klasa "active-toggle" na `.module-btn` (razem z aria-expanded="true"). */
  active?: boolean;
  /** Atrybut disabled → opacity .45, cursor not-allowed. */
  disabled?: boolean;
  /** Etykieta dostępności; obowiązkowa dla wariantu "icon" (glif × lub SVG Lucide). */
  ariaLabel?: string;
  /** Tekst przycisku, po polsku, w trybie rozkazującym. */
  children: string;
}
export declare const Button: (props: ButtonProps) => HTMLButtonElement;

/** Kontener przycisku modułu: <div class="module-btn-wrapper"> wewnątrz <div id="modulesWrapper"> (układ 50/50 od 700 px, reguły wysokiego kontrastu). */
export interface ModuleButtonWrapperProps {
  /** Opcjonalne id kontenera, np. "abxButtonWrapper". */
  id?: string;
  children: HTMLButtonElement;
}
export declare const ModuleButtonWrapper: (props: ModuleButtonWrapperProps) => HTMLDivElement;

/** Zestaw akcji okna przypomnienia: <div class="vild-rem-dlg-acts"> z przyciskami o klasach "vild-rem-dlg-pri" | "vild-rem-dlg-destr" | "vild-rem-dlg-ghost". */
export interface ReminderDialogActionProps {
  /** pri = turkusowy wypełniony (Zapisz), destr = czerwony tekst i obrys (Usuń), ghost = bez obrysu (Anuluj), (brak) = biały z obrysem #d7e9ec. */
  kind?: 'pri' | 'destr' | 'ghost';
  children: string;
}
export declare const ReminderDialogActions: (props: { children: HTMLButtonElement[] }) => HTMLDivElement;
