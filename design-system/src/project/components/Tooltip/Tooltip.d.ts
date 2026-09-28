/** Podpowiedź menu / potwierdzenie kopiowania — <div class="menu-tooltip [copy-tooltip]"> dodany do <body>; widoczność przez inline style opacity:1. */
export interface MenuTooltipProps {
  /** Wariant: "menu" (bez klasy dodatkowej, tekst 1.5rem) | "copy" — klasa "copy-tooltip" (.95rem). */
  variant?: 'menu' | 'copy';
  /** Pokazany: skrypt ustawia inline opacity:1 (brak klasy stanu). */
  visible?: boolean;
  children: string;
}
export declare const MenuTooltip: (props: MenuTooltipProps) => HTMLDivElement;

/** Dymek „poza zakresem” nad polem — <span class="vild-range-tip [is-on]" role="tooltip"> wewnątrz kotwicy .vild-range-host (position:relative); pole dostaje klasę "vild-range-invalid" i aria-invalid="true". */
export interface RangeTipProps {
  /** Widoczny — klasa "is-on". */
  on?: boolean;
  /** Ikona: inline SVG (kółko z wykrzyknikiem) w <span class="vild-range-tip__ic">. */
  icon?: SVGElement;
  /** Tekst w <span class="vild-range-tip__txt">, np. "Waga poza zakresem (1–500 kg)". */
  children: string;
}
export declare const RangeTip: (props: RangeTipProps) => HTMLSpanElement;

/** Objaśnienie skrótu w karcie mikroskładników — jeden <div id="nutritionMicrosTooltip" class="nutrition-micros-tooltip" role="tooltip" hidden> na <body>; kotwica <span class="nutrition-micros-abbr" tabindex="0">. */
export interface MicrosTooltipProps {
  /** Stan: ukryty (atrybut hidden) | pomiar ("is-measuring") | widoczny ("is-visible"). */
  state?: 'hidden' | 'measuring' | 'visible';
  children: string;
}
export declare const MicrosTooltip: (props: MicrosTooltipProps) => HTMLDivElement;
