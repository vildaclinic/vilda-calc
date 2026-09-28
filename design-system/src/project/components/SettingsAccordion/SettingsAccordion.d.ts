/** Chip w nagłówku sekcji ustawień — <span class="settings-mini-chip …"> w div.settings-accordion-meta. */
export interface SettingsMiniChipProps {
  /** Modyfikator: (brak) | "settings-mini-chip--expert" | "settings-mini-chip--pro" | "settings-mini-chip--danger". --expert i --pro są w źródle nadpisywane przez regułę bazową. */
  variant?: 'default' | 'expert' | 'pro' | 'danger';
  /** Tekst, np. „17 przełączników”, „Eksperckie”, „PRO”, „Nieodwracalne”. */
  children: string;
}

/** Sekcja strony ustawień — <details class="settings-accordion"> wewnątrz div.settings-accordion-list. */
export interface SettingsAccordionProps {
  /** id sekcji, np. "settings-section-cards"; cel nawigacji bocznej i odnośników #settings-section-…. */
  id: string;
  /** Wariant karty: (brak) | "settings-accordion--danger" | "settings-accordion--locked". */
  variant?: 'default' | 'danger' | 'locked';
  /** Atrybut open na <details>. */
  open?: boolean;
  /** Ikona Lucide jako <svg> 20 px w span.settings-accordion-index (przy --danger dodatkowo klasa settings-accordion-index--danger). */
  icon: SVGElement;
  /** h2.settings-accordion-title */
  title: string;
  /** p.settings-accordion-text */
  text: string;
  /** 0–3 chipy w div.settings-accordion-meta. */
  chips?: SettingsMiniChipProps[];
  /** Tekst dymka blokady (span.settings-lock-tip) — tylko przy variant "locked"; w aplikacji „Zaloguj się, aby uzyskać dostęp”. */
  lockTip?: string;
  /** Treść panelu — div.settings-accordion-panel > div.settings-panel-inner (np. p.settings-section-note, div.settings-grid, div.settings-control-grid). */
  children: HTMLElement | HTMLElement[];
}

/** Etykieta grupy sekcji — <div class="settings-group-label">Interfejs</div> między kartami listy. */
export interface SettingsGroupLabelProps {
  children: string;
}

/** Lista sekcji — <div class="settings-accordion-list"> (siatka, gap 1rem); <body> strony musi mieć klasę page-settings, aby działał wysoki kontrast. */
export declare const SettingsAccordionList: (props: { children: (HTMLDetailsElement | HTMLDivElement)[] }) => HTMLDivElement;
export declare const SettingsGroupLabel: (props: SettingsGroupLabelProps) => HTMLDivElement;
export declare const SettingsAccordion: (props: SettingsAccordionProps) => HTMLDetailsElement;
