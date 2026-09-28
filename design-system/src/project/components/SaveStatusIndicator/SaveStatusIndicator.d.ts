/** Warstwa stanu zapisu na PatientChip — jedna klasa "vilda-save-state--<state>" na <div class="chrome-chip chrome-patient-chip" id="vildaPatientChip">; koloruje <span class="chip-icon"> (i cały chip ≥601px). */
export interface SaveStatusIndicatorProps {
  /** Stan zapisu: hidden (#e8eded/#9eb8bb, z is-empty) | new_patient (fiolet, puls 2.4s) | saved (zieleń) | dirty (bursztyn, puls 2.4s) | saving (błękit, obrót .9s) | error (czerwień, puls 1.8s). */
  state: 'hidden' | 'new_patient' | 'saved' | 'dirty' | 'saving' | 'error';
  /** title chipa z tekstem stanu, np. "✓ Dane pacjenta zapisane · 2 min temu · Snapshot #4", "● Niezapisane zmiany · od 3 min · Kliknij „Zapisz dane” w menu po lewej", "⟳ Zapisywanie snapshotu…", "⚠ Błąd ostatniego zapisu", "＋ Nowy pacjent — kliknij „Zapisz dane”". */
  title: string;
  /** Element chipa, na którym klasa jest ustawiana (PatientChip). */
  chip: HTMLDivElement;
}
export declare const SaveStatusIndicator: (props: SaveStatusIndicatorProps) => HTMLDivElement;
