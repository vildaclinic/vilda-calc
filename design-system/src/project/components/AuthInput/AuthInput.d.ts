/** Pole okien konta i kartoteki — <input class="vilda-auth-input"> lub <select class="vilda-auth-input">. */
export interface AuthInputProps {
  /** Rodzaj kontrolki. Klasy: "vilda-auth-input" | "vilda-auth-input vilda-auth-recovery-input" (kod odzyskiwania) | "vilda-auth-search-input" (pole szukania, wewnątrz .vilda-auth-search-wrap). */
  variant?: 'text' | 'password' | 'select' | 'recovery' | 'search';
  /** Polski placeholder z aplikacji, np. "Hasło", "Twoje imię (np. dr Testowa)", "Szukaj pacjenta…", "XXXX-XXXX-XXXX-XXXX-XXXX-XXXX". */
  placeholder?: string;
  /** Opcje dla select. */
  options?: string[];
  /** Dla variant "password": otacza pole w <div class="vilda-auth-pw-wrap"> i dodaje <button class="vilda-auth-pw-toggle" aria-pressed>. */
  showToggle?: boolean;
}

/** Miernik siły hasła: <div class="vilda-auth-meter-wrap"> > .vilda-auth-meter > .vilda-auth-meter-fill[data-strength] + <span class="vilda-auth-meter-label">. */
export interface AuthMeterProps {
  /** Wartość data-strength, decyduje o kolorze wypełnienia. */
  strength: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong' | 'very-strong';
  /** Szerokość wypełnienia w procentach (styl inline width). */
  percent: number;
  /** Tekst etykiety, np. "Siła hasła: dobra" lub "—". */
  label: string;
}

/** Wiersz zgody: <label class="vilda-auth-checkbox-row"><input type="checkbox"><span class="vilda-auth-checkbox-label">…</span></label>. */
export interface AuthCheckboxRowProps {
  label: string;
  checked?: boolean;
}

/** Pole szukania z licznikiem: <div class="vilda-auth-search-wrap"><input class="vilda-auth-search-input" type="search"><div class="vilda-auth-search-counter">…</div></div>; komunikat pustej listy w <div class="vilda-auth-search-empty">. */
export interface AuthSearchProps {
  placeholder?: string;
  counter?: string;
  emptyMessage?: string;
}

export declare const AuthInput: (props: AuthInputProps) => HTMLInputElement | HTMLSelectElement;
export declare const AuthMeter: (props: AuthMeterProps) => HTMLDivElement;
export declare const AuthCheckboxRow: (props: AuthCheckboxRowProps) => HTMLLabelElement;
export declare const AuthSearch: (props: AuthSearchProps) => HTMLDivElement;
