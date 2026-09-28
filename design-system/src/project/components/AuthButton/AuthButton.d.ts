/** Przycisk ekranów konta — <button class="vilda-auth-btn vilda-auth-btn-<wariant>" type="button">, zwykle wewnątrz .vilda-auth-actions w .vilda-auth-root. */
export interface AuthButtonProps {
  /**
   * Wariant. Klasy: "vilda-auth-btn-primary" | "vilda-auth-btn-ghost" | "vilda-auth-btn-biometric" | "vilda-auth-btn-subtle" | "vilda-auth-btn-danger".
   * danger w aplikacji występuje jako "vilda-auth-btn-ghost vilda-auth-btn-danger": w .vilda-auth-root wypełniony #b00020, poza nim biały z tekstem #9f1239.
   */
  variant: 'primary' | 'ghost' | 'biometric' | 'subtle' | 'danger';
  /** Klasa "vilda-auth-btn-small": padding 10px 16px, 13px, promień 10px. */
  small?: boolean;
  /** Atrybut disabled (globalne button:disabled → opacity .45). */
  disabled?: boolean;
  /** Klasa "settings-backup-btn" (ustawienia.html): min-width 175px; w aplikacji razem z variant "primary" i small. */
  settingsBackup?: boolean;
  /** Etykieta, np. "Tak, włącz synchronizację", "Nie teraz", "Zaloguj przez Touch ID". */
  children: string;
}
export declare const AuthButton: (props: AuthButtonProps) => HTMLButtonElement;

/** Wiersz akcji: <div class="vilda-auth-actions [vilda-auth-actions-end | vilda-auth-actions-center]">; poniżej 520 px column-reverse. */
export interface AuthActionsProps {
  /** (brak) = przyciski flex:1 | "end" = do prawej, min-width 140px | "center" = środek, min-width 200px. */
  align?: 'end' | 'center';
  children: HTMLButtonElement[];
}
export declare const AuthActions: (props: AuthActionsProps) => HTMLDivElement;

/** Przycisk usunięcia pacjenta: klasy "vilda-auth-btn vilda-auth-btn-ghost vilda-patient-delete-btn", tylko w .vilda-auth-root. */
export declare const PatientDeleteButton: (props: { children: string }) => HTMLButtonElement;

/** Fioletowy przycisk kopiowania podsumowania: klasy "vilda-auth-btn vilda-copy-summary-btn" w <div class="vilda-copy-summary-row">. */
export declare const CopySummaryButton: (props: { children: string }) => HTMLButtonElement;

/** Pigułka wylogowania przypięta w rogu ekranu: <button class="vilda-auth-logout"><span class="vilda-auth-logout-icon">⏻</span><span>Wyloguj się</span></button>; JS ustawia display. */
export interface AuthLogoutProps {
  /** "⏻" dla wylogowania, "→" dla wejścia z trybu gościa. */
  icon: '⏻' | '→';
  /** "Wyloguj się" | "Zaloguj się". */
  children: string;
}
export declare const AuthLogoutButton: (props: AuthLogoutProps) => HTMLButtonElement;
