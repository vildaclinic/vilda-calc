/** Kompaktowa stopka strony — .site-footer__inner z marką, operatorem i odnośnikami. */
export interface SiteFooterProps {
  /** Marka (.site-footer__brand): nieinteraktywny znak z ikoną 22 px i nazwą "wagaiwzrost.pl" oraz akapitem meta. */
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
  /** Tekst w .site-footer__operator, np. "© 2025 Vilda Clinic sp. z o.o.". */
  copyright: string;
  /** Krótki copyright dla mobilnej .site-footer__mobile-only, np. "© 2025 Vilda Clinic". */
  compactCopyright: string;
  /** Odnośnik operatora w .site-footer__operator: <a class="site-footer__vildaclinic" target="_blank" rel="noopener noreferrer">. */
  vildaclinic: { href: string; label: string };
}
export interface SiteFooterColumnProps {
  /** aria-label grupy, standardowo „Informacje”. */
  ariaLabel: string;
  /** Starszy opcjonalny tytuł; kompaktowa stopka używa nazwy nav bez dodatkowego nagłówka. */
  title?: string;
  hiddenTitle?: boolean;
  /** Odnośniki .site-footer__link; cztery kolumny w układzie mobilnym, na desktopie zawijane. */
  links: { href: string; label: string; compactLabel?: string }[];
}
export declare const SiteFooter: (props: SiteFooterProps) => HTMLElement;
