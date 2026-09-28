/** Wiersz rozwijanego menu — <li><a href>…</a></li> albo <li><button type="button">…</button></li> w ul.vertical-menu. */
export interface VerticalMenuItemProps {
  label: string;
  /** Adres; bez href element jest <button type="button">. */
  href?: string;
  /** disabled na <button> lub atrybut [disabled] na <a>: kolor #9eb8bb, bez tła na hover. */
  disabled?: boolean;
}

/** Link paska górnego — <li><a href>Kalkulator</a></li> w ul .main-nav. */
export interface MainNavLinkProps {
  label: string;
  href: string;
}

/** Legacy nawigacja górna — <nav class="main-nav"><ul><li class="menu-toggle"><input type="checkbox" class="nav-toggle" id><label for aria-label="Menu"><span class="bar"/>×3</label><ul class="vertical-menu">…</ul></li><li><a/></li>…</ul></nav>; ukryta w <header> pod chrome i ≥992px. */
export interface MainNavProps {
  /** id pola <input class="nav-toggle"> i for etykiety (unikalne w dokumencie). */
  toggleId: string;
  /** checked → menu rozwinięte (.nav-toggle:checked+label+.vertical-menu), kreski złożone w krzyżyk. */
  open?: boolean;
  /** Wiersze rozwijanego menu (np. "O aplikacji", "Kontakt", "Wyloguj się"). */
  menuItems: VerticalMenuItemProps[];
  /** Linki widoczne w pasku (np. "Kalkulator", "DocPro"). */
  links: MainNavLinkProps[];
}
export declare const MainNav: (props: MainNavProps) => HTMLElement;
