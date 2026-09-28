/** Komunikat w ekranach konta (drzewo .vilda-auth-root) — <div> z jedną klasą wariantu. */
export interface AuthBannerProps {
  /**
   * Wariant → klasa:
   * "banner" → "vilda-auth-banner" (bursztyn, wyśrodkowany)
   * "warning" → "vilda-auth-warning-banner" (bursztyn, do lewej, glif ⚠ z :before)
   * "error" → "vilda-auth-error" (czerwień; pusty = niewidoczny)
   * "error-stable" → "vilda-auth-error vilda-auth-error-stable" z data-empty="1" gdy pusty
   * "password-warning" → "vilda-auth-password-warning" (pomarańcz, w arkuszu)
   * "info" → "vilda-auth-info" (neutralny; wewnątrz <p class="vilda-auth-side-note">)
   * "age-note" → "vilda-patient-age-note"
   * "search-empty" → "vilda-auth-search-empty" (kursywa; atrybut hidden ukrywa)
   */
  variant: 'banner' | 'warning' | 'error' | 'error-stable' | 'password-warning' | 'info' | 'age-note' | 'search-empty';
  /** Tylko "error-stable": "1" zwija element do wysokości 0. */
  dataEmpty?: '0' | '1';
  /** Tylko "search-empty": atrybut hidden. */
  hidden?: boolean;
  /** Dodatkowa klasa "vilda-note-wskazana" — obrys 2px #00838d wskazujący zalecany element. */
  highlighted?: boolean;
  /** Treść po polsku; dozwolone <strong> i <span>. Pusty tekst w "error" ukrywa element. */
  children: string;
}
export declare const AuthBanner: (props: AuthBannerProps) => HTMLDivElement;
