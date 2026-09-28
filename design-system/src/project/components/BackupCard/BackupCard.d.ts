/** Przycisk akcji karty — <button class="vilda-auth-btn vilda-auth-btn-small …"> w div.settings-card-toggle-row lub div.settings-backup-controls-row. */
export interface BackupCardButtonProps {
  /** Klasa wariantu: "vilda-auth-btn-primary" | "vilda-auth-btn-ghost" | "settings-danger-btn". Na szkle wszystkie stają się białą pigułką (.liquid-ios26 button). */
  variant: 'primary' | 'ghost' | 'danger';
  /** Klasa szerokości: "settings-backup-btn" (min 175px) | "settings-backup-run-btn" (min 140px) | brak. */
  size?: 'backup' | 'run';
  id?: string;
  children: string;
}

/** Podsekcja karty kopii — <div class="settings-backup-section">; kolejne rozdziela <div class="settings-backup-sep" role="separator">. */
export interface BackupSectionProps {
  /** h3.settings-control-title */
  title: string;
  /** span.settings-tag; klasa "settings-tag--danger" dla wariantu danger. Teksty z aplikacji: „brak”, „Pobrane”, „wymaga logowania”, „Backup”, „—”, „Nieodwracalne”. */
  tag?: { text: string; danger?: boolean };
  /** p.settings-control-desc (może zawierać <code>, <strong>, <i>). */
  description: string;
  /** Przyciski wiersza akcji (div.settings-card-toggle-row.settings-backup-btn-row). */
  actions?: BackupCardButtonProps[];
  /** Wiersz sterowania: checkbox „Włączony” (input.settings-backup-checkbox), etykieta odstępu z select.vilda-auth-input.settings-backup-select, przycisk. */
  controls?: { checkboxLabel: string; checked?: boolean; intervalLabel?: string; intervalOptions?: string[]; button?: BackupCardButtonProps };
  /** p.settings-inline-note.settings-backup-note */
  note?: string;
  /** p.settings-inline-note.settings-backup-note.settings-note-warn — ostrzeżenie bursztynowe. */
  warning?: string;
}

/** Karta sterująca ustawień — <div class="settings-control-card …"> w div.settings-control-grid (siatka auto-fit 280px, gap 1rem). Wiersz akcji może mieć też klasę "settings-inline-actions" (notatka + przyciski, space-between) i kopię "settings-card-toggle-copy" (flex:1 1 220px) obok przełącznika. */
export interface BackupCardProps {
  /** Wariant: (brak) — pojedyncza karta z jedną sekcją bez klasy sekcji; "settings-backup-card" — sekcje z separatorami; "settings-danger-card" — różowy gradient. */
  variant?: 'control' | 'backup' | 'danger';
  /** Dodaje "settings-control-card--wide" (grid-column: 1 / -1). */
  wide?: boolean;
  id?: string;
  /** Jedna sekcja (control/danger) albo kilka (backup). */
  sections: BackupSectionProps[];
  /** Tylko danger: pole hasła input.vilda-auth-input.settings-danger-input (placeholder „Wpisz hasło, aby potwierdzić”) i status p.settings-inline-note.settings-danger-status. */
  passwordPlaceholder?: string;
}

export declare const BackupCard: (props: BackupCardProps) => HTMLDivElement;
