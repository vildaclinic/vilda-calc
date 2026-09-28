/** Jedno przypomnienie w karcie — wiersz .vild-rem-row (awatar + nazwa + kategoria + termin + „⋮"). */
export interface ReminderItem {
  /** Nazwa pacjenta lub aktywności (.vild-rem-nm); inicjał trafia do awatara .vild-rem-av. */
  name: string;
  /** Etykieta kategorii i tytuł, np. "Kontrola — Kontrola wzrostu" (.vild-rem-cat). */
  category: string;
  /** Kolory kategorii wpisywane w atrybut style: ciemny tekst (color) i akcent (awatar, kropka .vild-rem-dot). */
  color: string;
  accent: string;
  /** Tekst terminu (.vild-rem-when): "3 dni temu" | "wczoraj" | "10:30" | "dziś" | "co 7 dni" | "oczekuje". */
  when: string;
  /** Ton etykiety terminu: "over" → .w-over (bursztyn), "today" → .w-today (zieleń), "pend" → .w-pend (indygo). */
  tone: 'over' | 'today' | 'pend';
}

/** Sekcja karty (.vild-rem-sec + modyfikator) z paskiem .vild-rem-sec-head. */
export interface ReminderSection {
  /** Klasa sekcji: "vild-rem-sec-over" (Zaległe) | "vild-rem-sec-today" (Dziś) | "vild-rem-sec-pend" (Oczekujące wyniki). */
  kind: 'over' | 'today' | 'pend';
  label: string;
  items: ReminderItem[];
  /** Tylko "pend": grupy kategorii ze zwijanym nagłówkiem .vild-rem-cat-head + .vild-rem-cat-rows. */
  groups?: { label: string; color: string; bg: string; collapsed?: boolean; items: ReminderItem[] }[];
}

/** Karta „Przypomnienia" — <div class="vild-rem-inline"><div class="vild-rem-card">…</div></div>. */
export interface ReminderCardProps {
  /** Tytuł w <h2 class="vild-rem-ttl">; w aplikacji zawsze "Przypomnienia". */
  title: string;
  /** Liczba w pigułce .vild-rem-chip; pomijana w stanie pustym. */
  count?: number;
  sections: ReminderSection[];
  /** Stan pusty (.vild-rem-empty): ikona ✓, tytuł "Brak przypomnień na dziś", podpis "Nic nie wymaga teraz Twojej uwagi." */
  empty?: { title: string; subtitle: string };
  /** Tekst przycisku stopki .vild-rem-all, np. "Pokaż wszystkie (4) →". */
  showAllLabel?: string;
  /** Sekcja „Zaległe" zwinięta — klasa vrc-overdue-collapsed na <html>. */
  overdueCollapsed?: boolean;
}
export declare const ReminderCard: (props: ReminderCardProps) => HTMLDivElement;

/** Okno szczegółów zdarzenia — .vild-rem-dlg-ov (nakładka fixed) > .vild-rem-dlg. */
export interface ReminderDialogProps {
  /** Pigułka kategorii .vild-rem-dlg-cat; kolor i tło w atrybucie style. */
  category: { label: string; color: string; bg: string };
  name: string;
  title?: string;
  text?: string;
  /** Wiersze .vild-rem-dlg-row: <b>etykieta</b> wartość. */
  rows?: { label: string; value: string }[];
  /** Przyciski .vild-rem-dlg-acts > button; klasy: (brak) | "vild-rem-dlg-pri" | "vild-rem-dlg-destr" | "vild-rem-dlg-ghost". */
  actions: { label: string; variant?: 'default' | 'pri' | 'destr' | 'ghost' }[];
}
export declare const ReminderDialog: (props: ReminderDialogProps) => HTMLDivElement;
