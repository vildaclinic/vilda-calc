/** Szklany dymek powłoki — <div class="vilda-tip [vilda-tip--in]"> w <body>, tworzony z data-tip kotwicy przez vilda_chrome.js; strzałka z ::before/::after. */
export interface ChromeTooltipProps {
  /** Pokazany — klasa "vilda-tip--in" (opacity 1, translate(0)); bez niej dymek jest niewidoczny i przesunięty o 6px. */
  in?: boolean;
  /** Pozycja inline (left/top w px) liczona przez skrypt względem kotwicy. */
  left?: number;
  top?: number;
  /** Treść z atrybutu data-tip kotwicy, np. "Aby zapisać dane, wprowadź imię, wiek, wzrost i wagę." */
  children: string;
}
export declare const ChromeTooltip: (props: ChromeTooltipProps) => HTMLDivElement;

/** Globalna podpowiedź .menu-tooltip w wyglądzie powłoki — wymaga klasy "has-vilda-chrome" na przodku (w aplikacji na <body>). Klasy elementu: "menu-tooltip" | "menu-tooltip copy-tooltip"; stan pokazany to inline style="opacity:1". */
export interface ChromeMenuTooltipProps {
  variant?: 'menu' | 'copy';
  visible?: boolean;
  children: string;
}
export declare const ChromeMenuTooltip: (props: ChromeMenuTooltipProps) => HTMLDivElement;
