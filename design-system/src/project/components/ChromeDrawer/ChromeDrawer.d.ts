/** Wiersz nawigacji szuflady — <li><a href> lub <li><button type="button" class="chrome-drawer-btn"> z .chrome-drawer-icon (SVG 18px) i .chrome-drawer-label. */
export interface ChromeDrawerItemProps {
  label: string;
  /** Nazwa ikony Lucide (data-lucide), np. "home", "save", "users". */
  icon: string;
  /** Adres strony; bez href wiersz jest przyciskiem akcji (.chrome-drawer-btn, data-drawer-btn=id). */
  href?: string;
  /** id akcji w data-drawer-btn: "saveDataBtnSidebar" | "addVisitNoteBtnSidebar" | "patientsListBtnSidebar". */
  id?: string;
  /** Klasa "pro-link": kolor secondary, 700. */
  pro?: boolean;
  /** aria-current="page" (lub .is-active): gradient chrome-active-bg i biały tekst. */
  current?: boolean;
  /** Tylko dla zalogowanych: klasa "auth-only-item" + data-auth-only="true"; dla gościa style="display:none". */
  authOnly?: boolean;
}

/** Sekcja szuflady — <div class="chrome-drawer-section">[<div class="chrome-drawer-section-title">…</div>]<ul>…</ul></div>. */
export interface ChromeDrawerSectionProps {
  /** Tytuł ("Narzędzia", "Konto"); sekcja "Pacjent" ma hideDrawerTitle i nie rysuje tytułu. */
  title?: string;
  items: ChromeDrawerItemProps[];
}

/** Karta konta i pacjenta u góry .chrome-drawer-body — <div class="chrome-drawer-account">. */
export interface ChromeDrawerAccountProps {
  /** Stan awatara: "logged-in" (.is-logged-in, inicjały, akcja "Wyloguj się") | "guest" (.is-guest, ikona użytkownika, wartość "Niezalogowany"/"Tryb gościa", akcja "Zaloguj się") | "loading" (bez klasy, treść "…"). */
  state: 'logged-in' | 'guest' | 'loading';
  /** Inicjały w awatarze (.chrome-drawer-account-avatar) dla zalogowanego. */
  initials?: string;
  /** Wartość pod etykietą "Konto" (.chrome-drawer-account-value). */
  accountValue: string;
  /** Wartość wiersza "Pacjent" (.chrome-drawer-patient-value); bez pacjenta "—". */
  patientValue: string;
}

/** Mobilna szuflada nawigacji — <div class="chrome-drawer" data-vilda-chrome-drawer [hidden] aria-hidden> z .chrome-drawer-backdrop i .chrome-drawer-panel[role=dialog][aria-label="Menu"]; na końcu <body class="has-vilda-chrome">. */
export interface ChromeDrawerProps {
  /** true → bez atrybutu hidden, aria-hidden="false" i klasa chrome-drawer-open na <body> (panel wsunięty, tło opacity:1). */
  open: boolean;
  /** Tytuł nagłówka; w aplikacji "Menu". */
  title?: string;
  /** aria-label przycisku zamknięcia; w aplikacji "Zamknij menu". */
  closeLabel?: string;
  account: ChromeDrawerAccountProps;
  /** Sekcje z modelu menu vilda_chrome.js (Pacjent, Narzędzia, Konto). */
  sections: ChromeDrawerSectionProps[];
}
export declare const ChromeDrawer: (props: ChromeDrawerProps) => HTMLDivElement;
