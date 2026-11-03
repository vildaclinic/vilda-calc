/** Kompaktowa stopka strony — .site-footer__inner z marką, operatorem i odnośnikami oraz .site-footer__disclaimer-wrap. */
export interface SiteFooterProps {
  /** Marka (.site-footer__brand): odnośnik do index.html z ikoną 22 px i nazwą "wagaiwzrost.pl" oraz akapitem meta. */
  brand: {
    /** Nazwa w <span class="site-footer__brand-name">. */
    name: string;
    /** Obraz w <span class="site-footer__brand-icon"><img width="22" height="22" alt=""></span> (data: URI lub logo_vilda.webp). */
    iconSrc: string;
    /** Informacje operatora w .site-footer__brand-meta, np. konsultant albo KRS; prawa autorskie pochodzą z copyright. */
    meta: string[];
  };
  /** Grupy <nav class="site-footer__col" aria-label="…">. Bieżący układ używa jednej grupy „Informacje”, bez listy kalkulatorów. */
  columns: SiteFooterColumnProps[];
  /** Tekst <p class="site-footer__disclaimer"> (glif ⚕ dodaje :before). */
  disclaimer: string;
  /** Tekst w .site-footer__operator, np. "© 2025 Vilda Clinic sp. z o.o.". */
  copyright: string;
  /** Odnośnik operatora w .site-footer__operator: <a class="site-footer__vildaclinic" target="_blank" rel="noopener noreferrer">. */
  vildaclinic: { href: string; label: string };
}
export interface SiteFooterColumnProps {
  /** aria-label grupy, standardowo „Informacje”. */
  ariaLabel: string;
  /** Starszy opcjonalny tytuł; kompaktowa stopka używa nazwy nav bez dodatkowego nagłówka. */
  title?: string;
  hiddenTitle?: boolean;
  /** Odnośniki .site-footer__link; zawijane lub dwie kolumny zależnie od szerokości stopki. */
  links: { href: string; label: string }[];
}
export declare const SiteFooter: (props: SiteFooterProps) => HTMLElement;
