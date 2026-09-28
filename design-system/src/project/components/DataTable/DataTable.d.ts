/** Tabela danych z nagłówkiem w kolorze marki — <table>, opcjonalnie w <div class="data-card"> lub <div class="table-scroll">. */
export interface DataTableProps {
  /**
   * Opakowanie:
   * - "plain"   → sama <table> (nagłówek --primary, paski --card, hover #00b0a614)
   * - "card"    → <div class="data-card"><table> (ramka 2 px --primary, komórki do środka, parzyste wiersze #00000008)
   * - "scroll"  → <div class="table-scroll"><table> (min-width 520px, przewijanie w poziomie)
   * - "total"   → <div class="total-card"><h2>…</h2><table class="kcal-table"> (kompaktowe komórki 4px 6px, ostatnia kolumna do prawej)
   * - "intake"  → <div id="intakeResults"><div class="intake-results-table-wrap"><table class="intake-results-table"> (trzy kolumny, nagłówek --secondary);
   *               w komórkach <div class="intake-period-main"> (700, --primary) i <div class="intake-period-sub"> (.88rem, #6b7a7a)
   */
  variant?: 'plain' | 'card' | 'scroll' | 'total' | 'intake';
  /** Tylko "total": klasa "kcal-table--macro" (komórki do góry). */
  macro?: boolean;
  /** Nagłówki kolumn (<thead><tr><th>). */
  columns: Array<{ label: string; align?: 'left' | 'center' | 'right' }>;
  /** Wiersze (<tbody><tr><td>); wyrównanie komórki klasami "text-center" | "text-right". */
  rows: string[][];
  /** Tylko "total": tytuł w <h2>. */
  title?: string;
  /** Id opakowania, gdy aplikacja go wymaga: "whrChildTable" | "intakeResults". */
  id?: string;
}
export declare const DataTable: (props: DataTableProps) => HTMLTableElement | HTMLDivElement;
