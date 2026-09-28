/** Przycisk funkcji PRO — <button type="button"> z <span> etykiety i <sup class="pro-superscript">PRO</sup>; biały, ramka 3px #9900ff. */
export interface ProButtonProps {
  /**
   * Identyfikator wymagany przez reguły źródła: "toggleAdvancedGrowth" (ramka fioletowa, klasy "advanced-growth-btn pro-button")
   * lub "toggleGrowthCalculations" (ramka turkusowa, klasy "advanced-growth-btn growth-calculations-btn").
   */
  id: 'toggleAdvancedGrowth' | 'toggleGrowthCalculations';
  /** Zablokowane (brak planu PRO): atrybut disabled na elemencie z klasą "pro-button" → tło #f3f3f3, ramka 3px #cccccc, tekst #000, opacity 1. */
  disabled?: boolean;
  /** Czy dopisać indeks górny "PRO" (klasa "pro-superscript"); false dla wariantu bezpłatnego. */
  proTag?: boolean;
  /** Etykieta w <span>, np. "Zaawansowane obliczenia wzrostowe". */
  children: string;
}
export declare const ProButton: (props: ProButtonProps) => HTMLButtonElement;

/** Etykieta z tagiem PRO: <span class="label-right pro-label">…<sup class="pro-tag">PRO</sup></span> wewnątrz #resultsModeToggleContainer. */
export interface ProLabelProps {
  children: string;
}
export declare const ProLabel: (props: ProLabelProps) => HTMLSpanElement;

/** Mała fioletowa pigułka "PRO": <span class="circ-pro-pill">PRO</span> po tekście etykiety. */
export declare const ProPill: () => HTMLSpanElement;

/** Link akcentu PRO: <a class="pro-link">; #90f, waga 600, hover #b34af7 z podkreśleniem. */
export interface ProLinkProps {
  href: string;
  children: string;
}
export declare const ProLink: (props: ProLinkProps) => HTMLAnchorElement;
