/** Chip pacjenta w pasku górnym — <div class="chrome-chip chrome-patient-chip" id="vildaPatientChip" role="button" tabindex="0" aria-haspopup="dialog"> z <span class="chip-icon">, <span class="chip-content"> (<span class="chip-label">Pacjent</span><span class="chip-value" id="vildaPatientValue">) i <span class="chrome-chip-card">. */
export interface PatientChipProps {
  /** Stan pacjenta. Klasy: "is-empty" | "has-patient". */
  state: 'empty' | 'patient';
  /** Stan zapisu — jedna klasa "vilda-save-state--hidden" | "--new_patient" | "--saved" | "--dirty" | "--saving" | "--error" (kolory ikony: SaveStatusIndicator; tinty chipa ≥601px). */
  saveState?: 'hidden' | 'new_patient' | 'saved' | 'dirty' | 'saving' | 'error';
  /** Treść <span class="chip-value">: nazwa pacjenta, "Brak", "—" lub "…". */
  value: string;
  /** title chipa, np. "Status zapisu — kliknij, aby zobaczyć legendę" lub "✓ Dane pacjenta zapisane · 2 min temu · Snapshot #4". */
  title: string;
  /** aria-expanded — czy otwarta jest legenda (SaveStatusPopover). */
  expanded?: boolean;
}
export declare const PatientChip: (props: PatientChipProps) => HTMLDivElement;
