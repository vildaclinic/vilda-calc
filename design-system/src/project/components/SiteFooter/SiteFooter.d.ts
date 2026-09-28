/** Stopka strony publicznej — <footer class="site-footer"> z siatką .site-footer__inner, paskiem .site-footer__disclaimer-wrap i wierszem .site-footer__bottom. */
export interface SiteFooterProps {
  /** Marka (.site-footer__brand): odnośnik do index.html z ikoną 22 px i nazwą "wagaiwzrost.pl" oraz akapitem meta. */
  brand: {
    /** Nazwa w <span class="site-footer__brand-name">. */
    name: string;
    /** Obraz w <span class="site-footer__brand-icon"><img width="22" height="22" alt=""></span> (data: URI lub logo_vilda.webp). */
    iconSrc: string;
    /** Wiersze <p class="site-footer__brand-meta"> rozdzielone <br>, np. ["Vilda Clinic sp. z o.o.", "Konsultacja merytoryczna: dr n. med. Maciej Flader"]. */
    meta: string[];
  };
  /** Kolumny <nav class="site-footer__col" aria-label="…">; tytuł <h3 class="site-footer__col-title">, odnośniki <a class="site-footer__link">. */
  columns: SiteFooterColumnProps[];
  /** Tekst <p class="site-footer__disclaimer"> (glif ⚕ dodaje :before). */
  disclaimer: string;
  /** Lewy tekst wiersza dolnego, np. "© 2025 Vilda Clinic sp. z o.o.". */
  copyright: string;
  /** Prawy odnośnik <a class="site-footer__vildaclinic" target="_blank" rel="noopener noreferrer">. */
  vildaclinic: { href: string; label: string };
}
export interface SiteFooterColumnProps {
  /** aria-label kolumny, np. "Kalkulatory", "Kalkulatory — ciąg dalszy", "Informacje". */
  ariaLabel: string;
  /** Tytuł kolumny; przy hiddenTitle tytuł dostaje klasę "site-footer__col-title--hidden" i aria-hidden="true" z &nbsp;. */
  title?: string;
  hiddenTitle?: boolean;
  /** Odnośniki: klasa "site-footer__link" (blok, .78rem, :hover #00838d). */
  links: { href: string; label: string }[];
}
export declare const SiteFooter: (props: SiteFooterProps) => HTMLElement;
