/** Panel „Źródła i zastrzeżenia” — <fieldset id="sourceFieldset"> z legendą, podpanelami, przyciskiem i listą źródeł. */
export interface SourcePanelItem {
  /** Wariant podpanelu. Klasy: "source-panel source-panel--warning" | "source-panel source-panel--pro" */
  tone: 'warning' | 'pro';
  /** Tekst w <strong> nagłówka, np. „Ograniczenia”, „Tryb profesjonalny”. */
  heading: string;
  /** Ikona Lucide (SVG inline w <span class="source-panel__icon">), np. "triangle-alert", "shield-check". */
  icon: string;
  /** Akapity <p> i opcjonalna lista <ul><li>. */
  paragraphs: string[];
  bullets?: string[];
}
export interface SourcePanelProps {
  /** Tekst <legend>; domyślnie „Źródła i zastrzeżenia”. */
  legend?: string;
  items: SourcePanelItem[];
  /** Pozycje <ol id="sourceList"><li> (HTML z <a> dozwolony). */
  sources: string[];
  /** Czy lista źródeł jest rozwinięta (brak atrybutu hidden); etykieta przycisku „Ukryj źródła” / „Pokaż źródła”. */
  expanded?: boolean;
}
/** Zwraca <fieldset id="sourceFieldset">. */
export declare const SourcePanel: (props: SourcePanelProps) => HTMLFieldSetElement;

/** Drobny druk źródłowy pod wynikiem — <p class="source-note"> lub <div class="bp-definition"> z listą i własną notką. */
export interface SourceNoteProps {
  /** Klasy: "source-note" | "bp-definition" */
  variant?: 'note' | 'definition';
  children: string;
}
export declare const SourceNote: (props: SourceNoteProps) => HTMLElement;
