/** Ton komunikatu → data-ton na pojemniku; ustala kolor krawędzi, tła i znak: ok ✓ #15803d, uwaga ● #b45309, blad ✕ #c62828, info ℹ #00838d, nowy ＋ #6d28d9. */
export type StatusBarTone = 'ok' | 'uwaga' | 'blad' | 'info' | 'nowy';

/** Brakujące pole → <button type="button" class="vilda-status-link"> wstawiony w miejsce etykiety w tekście; klik przewija do pola o podanym id. */
export interface StatusBarField {
  /** id pola formularza (np. "age", "weight", "height", "lastName"). */
  id: string;
  /** Etykieta szukana w tekście komunikatu, np. "wiek", "masę ciała", "wzrost", "imię i nazwisko". */
  etykieta: string;
}

/** Pasek statusu zapisu — <div id="vildaStatusForm"|"vildaStatusSide" data-vilda-status role="status" aria-live="polite" data-ton="…">
 *  <span class="vilda-status-znak" aria-hidden="true">✓</span>
 *  <span class="vilda-status-tresc"><span class="vilda-status-tekst">…</span><span class="vilda-status-meta">14:32</span></span></div>.
 *  Stylowanie po [data-vilda-status]; id decydują tylko o widoczności na progu 700px (Form <700px, Side ≥700px). */
export interface StatusBarProps {
  /** Pojemnik: "vildaStatusForm" (góra formularza, <700px) | "vildaStatusSide" (prawa kolumna, ≥700px). */
  id?: 'vildaStatusForm' | 'vildaStatusSide';
  /** Ton; nieznany zamieniany na "info". */
  ton: StatusBarTone;
  /** Treść komunikatu, np. "Nie zapisano — uzupełnij: wiek, masę ciała i wzrost." */
  tekst: string;
  /** Pola, których etykiety w tekście zamieniają się w odnośniki .vilda-status-link. */
  pola?: StatusBarField[];
  /** Godzina w .vilda-status-meta (pl-PL, HH:MM); pominięta przy bezCzasu. */
  czas?: string;
  /** Atrybut hidden → display:none!important. */
  hidden?: boolean;
}
export declare const StatusBar: (props: StatusBarProps) => HTMLDivElement;
