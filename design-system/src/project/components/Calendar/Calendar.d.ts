/** Kategoria terminu — klasa tz-cat-<name> na chipie, kropce i wierszu (ustawia --cat-c, --cat-bg, --cat-a). */
export type CalendarCategory =
  | 'followup'
  | 'treatment'
  | 'observation'
  | 'wynik'
  | 'uni'
  | 'duty'
  | 'clinic'
  | 'clinicnfz'
  | 'act'
  | 'procedura'
  | 'reservation'
  | 'absence';

/** Chip terminu w komórce — <span class="tz-chip tz-cat-…"> ze znacznikiem i nazwą. */
export interface CalendarChip {
  category: CalendarCategory;
  /** Tekst w .tz-chip__nm (nazwa pacjenta lub tytuł). */
  label: string;
  /** Znacznik .tz-chip__mk: "done" → --v „✓" (#34C759), "noshow" → --x „✕" (#FF3B30). */
  mark?: 'done' | 'noshow';
  /** Stany chipa: .is-done (szary, przekreślony) | .is-noshow (#FFEBEA / #C2271D). */
  state?: 'done' | 'noshow';
}

/** Komórka siatki miesiąca — <div class="tz-cell" data-day="RRRR-MM-DD">. */
export interface CalendarCell {
  day: number;
  iso: string;
  /** Klasy stanu: .is-other | .is-today | .is-selected | .is-wknd | .is-duty | .is-holiday | .is-split | .is-absence (łączą się). */
  states?: ('other' | 'today' | 'selected' | 'wknd' | 'duty' | 'holiday' | 'split' | 'absence')[];
  /** Nazwa święta w .tz-cell__holiday (#b91c1c). */
  holiday?: string;
  chips?: CalendarChip[];
  /** Kropki w stopce .tz-cell__dots (maks. 4) i licznik „+N więcej" w .tz-chip--more. */
  more?: number;
}

/** Wiersz panelu dnia — .tz-row.tz-row--c (kompaktowy) lub .tz-row--strip (pasek w kolorze kategorii). */
export interface CalendarRow {
  variant: 'compact' | 'strip';
  category: CalendarCategory;
  /** Godzina w .tz-time-pill; "cały dzień" → .is-all. */
  time?: string;
  allDay?: boolean;
  patient?: string;
  title?: string;
  /** Plakietki .tz-mini w .tz-row__meta, np. "Obserwacja · 30 min". */
  meta?: string[];
  /** Stany wiersza: .is-done | .is-overdue | .is-noshow. */
  state?: 'done' | 'overdue' | 'noshow';
  /** Przyciski .tz-actions: .tz-done-btn „✓ Wykonane", .tz-noshow-btn „🚫 Nie zgłosił się", .tz-del-btn „🗑" (aria-label="Usuń wpis"; .is-armed po pierwszym kliknięciu). */
  actions?: ('done' | 'noshow' | 'del')[];
}

/** Widok miesiąca terminarza — <div class="terminarz-shell" id="terminarzRoot">. */
export interface CalendarProps {
  /** Tytuł w .tz-title, np. "Październik 2026". */
  title: string;
  /** Aktywny przycisk .tz-switch (Miesiąc | Tydzień | Dzień | Lista oczekujących | Statystyki). */
  view: 'month' | 'week' | 'day' | 'waitlist' | 'stats';
  /** Szukajka otwarta: .tz-search-btn[data-on="1"]. */
  searchOpen?: boolean;
  /** Nagłówek dni: Pn Wt Śr Cz Pt So Nd (weekend z .is-wknd). */
  weekdays: string[];
  cells: CalendarCell[];
  /** Panel dnia .tz-day-panel: nagłówek h2 (np. "Piątek, 2 października (dziś)") i wiersze albo .tz-empty. */
  dayPanel?: { heading: string; rows: CalendarRow[]; emptyText?: string };
  /** Stan zablokowany .terminarz-locked (ikona, tytuł, opis) zamiast siatki. */
  locked?: { icon: string; title: string; desc: string };
}
export declare const Calendar: (props: CalendarProps) => HTMLDivElement;
