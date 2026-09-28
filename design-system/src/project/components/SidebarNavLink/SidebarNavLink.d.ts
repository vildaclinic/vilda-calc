/** Pozycja paska bocznego — <li><a class="sidebar-link"><span class="sidebar-icon"><svg/></span><span class="sidebar-label">…</span></a></li> w ul sekcji .sidebar-nav (aside.sidebar.sidebar-v2). */
export interface SidebarNavLinkProps {
  /** Etykieta (.sidebar-label), np. "Strona główna", "Zapisz dane", "DocPro". */
  label: string;
  /** Nazwa ikony Lucide (data-lucide) i inline SVG 18px w .sidebar-icon: "home" | "stethoscope" | "calculator" | "droplets" | "pill" | "flask-conical" | "book-open" | "file-text" | "calendar" | "settings" | "save" | "sticky-note" | "users". */
  icon: string;
  /** Adres strony; dla akcji "#". */
  href?: string;
  /** Akcja na karcie pacjenta zamiast strony: role="button" (Zapisz dane, Dodaj notatkę do wizyty, Pacjenci). */
  role?: 'button';
  /** id akcji, którego szuka skrypt: "saveDataBtnSidebar" | "addVisitNoteBtnSidebar" | "patientsListBtnSidebar". */
  id?: string;
  /** Wariant PRO: klasa "pro-link" (etykieta i ikona w secondary, plakietka ::after "PRO"). */
  pro?: boolean;
  /** Bieżąca strona: aria-current="page" (+ klasa "is-active") — gradient chrome-active-bg, biały tekst. */
  current?: boolean;
  /** aria-disabled="true" — kolor #9eb8bb, bez tła; skrypt zdejmuje po uzupełnieniu danych. */
  disabled?: boolean;
  /** Tylko po zalogowaniu: klasa "auth-only-item" + data-auth-only="true" (ukryte style="display:none" dla gościa). */
  authOnly?: boolean;
  /** Podpowiedź .vilda-tip (data-tip), np. "Aby zapisać dane, wprowadź imię, wiek, wzrost i wagę." */
  tip?: string;
}
export declare const SidebarNavLink: (props: SidebarNavLinkProps) => HTMLLIElement;
