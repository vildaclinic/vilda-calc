/** Okno pojęć modułu tarczycy — <div id="thyTermModal" class="thy-modal"> w <body>, w środku .thy-modal-inner[role="dialog"] z .thy-modal-header, .thy-modal-body i .thy-modal-footer. Reguły są przypięte do id="thyTermModal". */
export interface ModalProps {
  /** Tytuł w <h3 id="thyTermModalTitle"> (1.15rem, --primary). */
  title: string;
  /** Treść .thy-modal-body — akapity <p> i listy <ul>; przewija się wewnątrz panelu. */
  children: string;
  /** Przyciski stopki — zwykłe <button> ze stylem globalnym (teal; w motywie szkła białe pigułki), np. ["Informacje dodatkowe", "Zamknij"]. */
  actions?: string[];
  /** Otwarte: klasa "is-open" na #thyTermModal i "thy-modal-open" na <body>; zamknięte: display:none. */
  open?: boolean;
}
export declare const Modal: (props: ModalProps) => HTMLDivElement;

/** Okno przypomnienia Terminarza — .vild-rem-dlg-ov > .vild-rem-dlg[role="dialog"] > .vild-rem-dlg-head + .vild-rem-dlg-body + .vild-rem-dlg-acts. Buduje je vilda_auth_ui.js; otwarcie dodaje "nav-ui-temporarily-hidden" na <body>. */
export interface ReminderDialogProps {
  /** Kategoria w pigułce .vild-rem-dlg-cat (kolor i tło ze stylu inline). */
  category: 'Pomiar' | 'Notatka' | 'Obserwacja' | 'Wynik' | 'Lek' | 'Terapia GH';
  /** Nazwisko pacjenta w .vild-rem-dlg-nm. */
  patientName: string;
  /** Tytuł wpisu w .vild-rem-dlg-ttl. */
  title?: string;
  /** Treść w .vild-rem-dlg-txt. */
  body?: string;
  /** Wiersze .vild-rem-dlg-row: <b>etykieta</b><span>wartość</span>, np. Termin, Lek, Dawka, Badanie, Wartość, Status. */
  rows?: Array<{ label: 'Termin' | 'Lek' | 'Dawka' | 'Badanie' | 'Wartość' | 'Wynik' | 'Status'; value: string }>;
  /** Akcje w .vild-rem-dlg-acts — <button class="vilda-auth-btn vilda-auth-btn-small"> z modyfikatorem: "vild-rem-dlg-pri" (teal) | "vild-rem-dlg-destr" (czerwony tekst) | "vild-rem-dlg-ghost" (bez obrysu) | brak (biały). */
  actions: Array<{ label: string; variant?: 'pri' | 'destr' | 'ghost' }>;
}
export declare const ReminderDialog: (props: ReminderDialogProps) => HTMLDivElement;
