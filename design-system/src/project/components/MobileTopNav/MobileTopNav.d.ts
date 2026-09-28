/** Przycisk menu paska górnego (≤991px) — <button type="button" class="chrome-mobile-menu-btn" data-vilda-chrome-menu-btn aria-label="Otwórz menu"> z inline SVG 22px (trzy linie). */
export interface MobileMenuButtonProps {
  /** aria-label; w aplikacji "Otwórz menu". */
  ariaLabel: string;
  /** Ikona: zawsze inline SVG menu 22px (trzy linie, stroke="currentColor"); przycisk nie ma glifu zastępczego, a skrypt nie zmienia etykiety ani aria-expanded. */
  icon: SVGElement;
}
export declare const MobileMenuButton: (props: MobileMenuButtonProps) => HTMLButtonElement;

/** Pasek marki pod paskiem górnym (≤991px) — <div class="chrome-mobile-brand-bar" aria-hidden="true">wagaiwzrost.pl</div>, drugie dziecko [data-vilda-chrome-wrap]. */
export interface MobileBrandBarProps {
  /** Tekst paska; w aplikacji "wagaiwzrost.pl". */
  brandName: string;
}
export declare const MobileBrandBar: (props: MobileBrandBarProps) => HTMLDivElement;

/** Legacy hamburger CSS-only — <nav class="main-nav"><ul><li class="menu-toggle"><input type="checkbox" class="nav-toggle" id><label for><span class="bar"/>×3</label></li>…</ul></nav>; ukryty pod chrome (.has-sidebar header>.main-nav) i ≥992px. */
export interface LegacyMenuToggleProps {
  /** id pola <input class="nav-toggle"> i for etykiety. */
  id: string;
  /** checked → kreski składają się w krzyżyk (.nav-toggle:checked+label .bar). */
  open?: boolean;
}
export declare const LegacyMenuToggle: (props: LegacyMenuToggleProps) => HTMLElement;
