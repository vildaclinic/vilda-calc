/** Kategoria notatki — etykieta .note-cat z modyfikatorem i filtr .notes-filter[data-cat]. */
export type NoteCategory = 'badanie' | 'zalecenia' | 'wywiad' | 'wlasne';

/** Kafelek notatki — <div class="note-card"> w siatce .notes-grid. */
export interface NoteItemProps {
  /** Klasa etykiety: "note-cat--badanie" (Badanie) | "note-cat--zalecenia" (Zalecenia) | "note-cat--wywiad" (Wywiad) | "note-cat--wlasne" (Własne). */
  category: NoteCategory;
  /** Tekst etykiety kategorii, np. "Badanie". */
  categoryLabel: string;
  /** Tytuł w <p class="note-card__title">; pusty tytuł aplikacja zastępuje "(bez tytułu)". */
  title: string;
  /** Treść w <p class="note-card__body"> (zachowane łamanie wierszy, ucięcie do 4 linii). */
  body?: string;
  /** Przypięta: karta dostaje .is-pinned, pinezka .is-on i title="Odepnij" / aria-label="Odepnij notatkę". */
  pinned?: boolean;
  /** Stan przycisku „Kopiuj": po skopiowaniu .note-act--copy dostaje .is-done, etykieta "Skopiowano". */
  copied?: boolean;
}
export declare const NoteItem: (props: NoteItemProps) => HTMLDivElement;

/** Pasek nad siatką — <div class="notes-toolbar"> z szukajką i filtrami. */
export interface NotesToolbarProps {
  /** Placeholder pola .notes-search input, w aplikacji "Szukaj w notatkach…". */
  searchPlaceholder: string;
  /** Filtry .notes-filter[data-cat]: "all" | NoteCategory, z etykietami "Wszystkie", "Opisy badań", "Zalecenia", "Wywiad", "Własne". */
  filters: { cat: 'all' | NoteCategory; label: string }[];
  /** Aktywny filtr dostaje klasę .is-active. */
  active: 'all' | NoteCategory;
}
export declare const NotesToolbar: (props: NotesToolbarProps) => HTMLDivElement;

/** Edytor notatki — .note-editor-overlay(.is-open) > .note-editor (panel wysuwany z prawej). */
export interface NoteEditorProps {
  open: boolean;
  /** Tytuł w .note-editor__head h2, np. "Nowa notatka" / "Edytuj notatkę". */
  heading: string;
  /** Pola .note-field: <label> + input | select | textarea. */
  fields: { label: string; control: 'input' | 'select' | 'textarea' }[];
  /** Komunikat .note-editor__err; widoczny z .is-shown. */
  error?: string;
  /** Etykiety stopki: .notes-btn-primary (zapis) i .note-btn-ghost (anuluj). */
  saveLabel: string;
  cancelLabel: string;
}
export declare const NoteEditor: (props: NoteEditorProps) => HTMLDivElement;
