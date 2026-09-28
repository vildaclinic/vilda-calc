/** Popover statusu zapisu — <div class="vilda-save-popover is-visible" role="dialog" aria-label="Status zapisu danych pacjenta"> w <body>, position:fixed pod #vildaPatientChip (top/right/left inline). Buduje go vilda_chrome.js z tabeli stanów. */
export interface SaveStatusPopoverProps {
  /** Bieżący stan — wyznacza kolory (inline), tytuł, podtytuł i ikonę bohatera .vsp-hero; w legendzie jest pomijany. */
  state: 'saved' | 'dirty' | 'new_patient' | 'saving' | 'error' | 'hidden';
  /** Podtytuł bohatera .vsp-hero-sub; dla "saved" skrypt składa "Snapshot #N · czas" albo "Dane są aktualne". Domyślnie opis stanu z tabeli. */
  subtitle?: string;
  /** Pokazuje wiersz <button class="vsp-action" data-vilda-open-card> „Otwórz Kartę pacjenta / wczytany pacjent” — tylko gdy jest wczytany pacjent. */
  showOpenCard?: boolean;
  /** Widoczny — klasa "is-visible" (opacity 1, translateY(0)); atrybut hidden chowa całkiem. */
  visible?: boolean;
}
export declare const SaveStatusPopover: (props: SaveStatusPopoverProps) => HTMLDivElement;

/** Tabela stanów z vilda_chrome.js: c1/c2 (gradient ikony i kropki), name (tytuł), desc (podtytuł), heroBg (tło wiersza bohatera). */
export declare const SAVE_STATUS_STATES: Record<
  'saved' | 'dirty' | 'new_patient' | 'saving' | 'error' | 'hidden',
  { c1: string; c2: string; name: string; desc: string; heroBg: string }
>;
