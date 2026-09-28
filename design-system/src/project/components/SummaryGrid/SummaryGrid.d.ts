/** Zestawienie etykieta–wartość podsumowania pacjenta — <div class="summary-grid"> lub <table class="porownanie-tabela">. */
export interface SummaryGridProps {
  /**
   * Odmiana:
   * - "grid"       → <div class="summary-grid"> z parami <span class="label"> + <span class="val"><span class="result-val">
   * - "diff"       → jak "grid" z <div class="diff-section"> > .diff-row + .diff-verdict
   * - "dots"       → wiersze <div class="current-summary-row"> (.current-summary-param, .current-summary-dots, .current-summary-value)
   * - "comparison" → <table class="porownanie-tabela"> + .porownanie-tempo + .porownanie-nota;
   *                  komórki: th/td "pt-kol-poprzednio" (znika poniżej 560 px), td "pt-dzis", td "pt-zmiana";
   *                  w komórkach: "pt-w" (wartość), "pt-s" (podpis), "pt-s pt-byl" (tylko poniżej 560 px), "pt-d" (różnica),
   *                  "pt-pill" (werdykt), "pt-brak" (brak danych „—”); blok pozostałych parametrów: <div class="porownanie-pozostale"> z <h4>
   */
  variant?: 'grid' | 'diff' | 'dots' | 'comparison';
  /** Wiersze: etykieta, wartość (z przecinkiem), opcjonalny podpis .pt-s / .muted. */
  rows: Array<{ label: string; value: string; unit?: string; note?: string; status?: 'ok' | 'improve' | 'alert'; previous?: string; delta?: string; verdict?: string }>;
  /** Klasa statusu dla .diff-verdict, .pt-w, .pt-d, .pt-pill, .porownanie-tempo: "status-ok" | "status-improve" | "status-alert". */
  status?: 'ok' | 'improve' | 'alert';
  /** Zdanie tempa pod tabelą (.porownanie-tempo). */
  tempo?: string;
  /** Nota pod tabelą (.porownanie-nota); flaga ustawia "porownanie-nota--plec". */
  note?: string;
  notePlec?: boolean;
  /** Tylko "comparison": chipy nad tabelą (<div class="porownanie-chipy">); klasa chipu: "porownanie-chip" | "porownanie-chip porownanie-chip--szara" | "porownanie-chip porownanie-chip--kontekst" (+ atrybut hidden). */
  chips?: Array<{ text: string; tone?: 'teal' | 'szara' | 'kontekst'; hidden?: boolean }>;
  /** Tytuł nad siatką (.prev-summary-label) i separator (<hr class="prev-summary-separator">). */
  title?: string;
}
export declare const SummaryGrid: (props: SummaryGridProps) => HTMLDivElement | HTMLTableElement;
