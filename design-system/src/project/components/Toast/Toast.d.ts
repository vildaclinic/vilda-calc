/** Dymek potwierdzenia na dole ekranu — <div class="vilda-dymek vilda-dymek--{ton}" role="status" aria-live="polite">tekst</div>. Tworzy go VildaDymek.pokaz() z vilda_dymek.js; jeden naraz, id="vildaDymek". */
export interface ToastProps {
  /** Ton dymka. Klasy: "vilda-dymek--ok" (turkus #00838d) | "vilda-dymek--info" (#0f2b33) | "vilda-dymek--blad" (biała karta, czerwona krawędź #d32f2f). Domyślnie "ok". */
  ton?: 'ok' | 'info' | 'blad';
  /** Pozycja: środek dołu (bez klasy) lub prawy dolny róg — klasa "vilda-dymek--prawo". Domyślnie "srodek". */
  poz?: 'srodek' | 'prawo';
  /** Czas w ms do zniknięcia; 0 = zostaje do VildaDymek.schowaj(). Domyślnie 2500. */
  czas?: number;
  /** Treść — pełne zdanie po polsku, tylko tekst (textContent). */
  children: string;
}
/** Zwraca element dymka albo null, gdy nie ma dokumentu. */
export declare const Toast: (props: ToastProps) => HTMLDivElement | null;

/** Klasa pomocnicza dla innych elementów pływających nad dockiem (baner synchronizacji itp.): nadaje tylko `bottom` liczone z --vilda-dol-wolny. Klasa: "vilda-dol-kotwica". */
export declare const VILDA_DOL_KOTWICA: 'vilda-dol-kotwica';
