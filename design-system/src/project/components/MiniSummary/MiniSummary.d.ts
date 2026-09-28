/** Wiersz skrótu — <div class="ms-chip ms-chip--<tone>"><div class="ms-chip-icon">W</div><div class="ms-chip-main"><span class="ms-chip-label"/><span class="ms-chip-value"/></div>[<div class="ms-chip-badge"/>]</div> w .ms-chips. */
export interface MiniSummaryChipProps {
  /** Etykieta: "Waga" | "Wzrost" | "BMI" | "Pow. ciała". */
  label: string;
  /** Litera w kole 22px: "W" | "H" | "B" | "S". */
  icon: 'W' | 'H' | 'B' | 'S';
  /** Wartość z przecinkiem i cienką spacją przed jednostką, np. "27,5 kg", "18,8", "0,96 m²". */
  value: string;
  /** Ton z centyla. Klasy: "ms-chip--normal" | "ms-chip--borderline" | "ms-chip--alert" | "ms-chip--neutral". */
  tone: 'normal' | 'borderline' | 'alert' | 'neutral';
  /** Plakietka centyla (.ms-chip-badge), np. "55 centyl", "<1 centyla"; brak dla Pow. ciała. */
  badge?: string;
}

/** Skrót danych pacjenta — <div id="miniSummary" class="mini-summary" style="display:block"><div id="miniSummaryContent">…</div><div id="miniShortcutsContainer" class="mini-shortcuts"/></div>; w .sidebar-extras paska bocznego, w .decor-sidebar albo samodzielnie (sidebar.css). */
export interface MiniSummaryProps {
  /** Kontekst decydujący o tle: "sidebar" (karta #ffffffd9 w aside.sidebar-v2) | "decor" (przezroczysty w .decor-sidebar) | "legacy" (biały blok z górną kreską #d0dede). */
  context?: 'sidebar' | 'decor' | 'legacy';
  /** Tekst wieku w pigułce .ms-patient-chip, np. "8 lat i 3 miesiące"; plakietka .ms-avatar-wiek zawsze "Wiek". */
  age?: string;
  /** Wiersze w kolejności Waga, Wzrost, BMI, Pow. ciała. */
  chips: MiniSummaryChipProps[];
  /** false → blok bez style="display:block" pozostaje ukryty (display:none). */
  visible?: boolean;
}
export declare const MiniSummary: (props: MiniSummaryProps) => HTMLDivElement;
