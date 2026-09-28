/** Przycisk informacji pola klirensu — <button type="button" class="clcr-info-button">i</button> jako ostatnie dziecko .clcr-field__heading. */
export interface ClcrInfoButtonProps {
  /** Nazwa pola do aria-label="Informacja: <nazwa>". */
  fieldLabel: string;
  /** aria-controls = id dymka ("clcr-help-<id>"). */
  helpId: string;
  /** aria-expanded; "true" = biały glif na --clcr-primary (w szkle nadpisane regułą .liquid-ios26 button) i widoczny dymek. */
  expanded?: boolean;
}

/** Dymek pomocy — <span class="clcr-field__help" id="clcr-help-<id>" data-clcr-help-source> po kontrolce; position: fixed, współrzędne i --clcr-arrow-x ustawia skrypt. */
export interface ClcrFieldHelpProps {
  id: string;
  /** Zdanie pomocy z aplikacji. */
  text: string;
  /** data-clcr-help-source: "field" | "formula". */
  source?: 'field' | 'formula';
  /** Klasa "clcr-field__help--above": akcent 3px i strzałka na dolnej krawędzi (dymek nad przyciskiem). */
  above?: boolean;
  /** Atrybut hidden (dymek zamknięty). */
  hidden?: boolean;
}

export declare const ClcrInfoButton: (props: ClcrInfoButtonProps) => HTMLButtonElement;
export declare const ClcrFieldHelp: (props: ClcrFieldHelpProps) => HTMLSpanElement;
