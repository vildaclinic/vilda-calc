/** Pasek tożsamości pacjenta w kalkulatorze klirensu — <div id="clcrIdentityBar" class="clcr-ident-bar"> wstawiany do .patient-card przed <fieldset id="patientSet">. */
export interface ClcrIdentBarBadge {
  /** Tekst odznaki: wiek („12 lat 3 mies.”), wzrost („148 cm”) lub masa („Masa 41,5 kg · dziś”). */
  text: string;
  /** Klasy: "clcr-ident-badge" | "clcr-ident-badge clcr-ident-badge--mass" (bursztynowa odznaka masy). */
  variant?: 'default' | 'mass';
}

export interface ClcrIdentBarProps {
  /** Inicjały w kole .clcr-ident-avatar (dwie litery, „•” bez nazwy). */
  initials: string;
  /** Imię i nazwisko w .clcr-ident-name (domyślnie „Pacjent”). */
  name: string;
  /** Wiek i płeć w .clcr-ident-sub, rozdzielone „ · ”, np. „8 mies. · kobieta”; pominięte, gdy brak. */
  sub?: string;
  /**
   * Stan zwinięty: klasa "clcr-ident-collapsed" na .patient-card (chowa #patientSet),
   * odznaki w .clcr-ident-badges i etykieta przycisku „Dane pacjenta ▾”; rozwinięty: bez odznak, etykieta „Zwiń ▲”.
   */
  collapsed: boolean;
  /** Odznaki pomiarów pokazywane tylko w stanie zwiniętym. */
  badges?: ClcrIdentBarBadge[];
  /** Atrybut hidden na pasku (brak pacjenta). */
  hidden?: boolean;
}

/** Notka daty pomiaru masy — <span id="clcrWeightMeasuredNote" class="clcr-weight-note"> po <input id="weight">. */
export interface ClcrWeightNoteProps {
  /** Tekst: „nowy pomiar: dziś 28.09.2026” | „ostatni pomiar: 14.03.2026 — nadpisz, jeśli pacjent był ważony dziś.” | „podaj masę zmierzoną na tej wizycie.” */
  text: string;
  /** Klasa "fresh" (zielony #147a64) dla pomiaru z dzisiaj; domyślnie bursztynowy #8a5400. */
  fresh?: boolean;
  hidden?: boolean;
}

export declare const ClcrIdentBar: (props: ClcrIdentBarProps) => HTMLDivElement;
export declare const ClcrWeightNote: (props: ClcrWeightNoteProps) => HTMLSpanElement;
