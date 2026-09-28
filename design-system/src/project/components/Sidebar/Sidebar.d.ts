/** Sekcja paska bocznego — <div class="sidebar-section"> z tytułem i listą <ul> pozycji SidebarNavLink. */
export interface SidebarSectionProps {
  /** Tytuł sekcji (.sidebar-section-title): "Pacjent" | "Narzędzia" | "Konto". */
  title: string;
  /** Pozycje <li> (SidebarNavLink). */
  children: HTMLLIElement[];
}

/** Pasek boczny chrome (≥992px) — <aside class="sidebar sidebar-v2" data-vilda-chrome-mounted="1"> w pierwszej kolumnie .desktop-layout, na <body class="liquid-ios26 has-vilda-chrome has-sidebar">. */
export interface SidebarProps {
  /** Wariant: "chrome" = .sidebar.sidebar-v2 (szkło, sekcje); "legacy" = .sidebar z sidebar.css (biała karta, .sidebar-logo); "decor" = .decor-sidebar (≥1400px, trzecia kolumna). Klasy: "sidebar sidebar-v2" | "sidebar" | "decor-sidebar". */
  variant?: 'chrome' | 'legacy' | 'decor';
  /** aria-label nawigacji <nav class="sidebar-nav">; w aplikacji "Nawigacja boczna". */
  navLabel?: string;
  /** Sekcje nawigacji w kolejności modelu menu vilda_chrome.js. */
  sections: SidebarSectionProps[];
  /** Zawartość .sidebar-extras[data-vilda-chrome-extras]: MiniSummary (#miniSummary) i .steroid-summary. */
  extras?: HTMLElement[];
  /** Tylko "decor": klasa .decor-sidebar--has-content; bez niej kolumna jest visibility:hidden. */
  hasContent?: boolean;
  /** Stan przed montażem: brak .sidebar-v2 na <body class="has-sidebar"> ukrywa dzieci i (bez has-vilda-chrome) rysuje szkielet ::before. */
  mounted?: boolean;
}
export declare const Sidebar: (props: SidebarProps) => HTMLElement;
