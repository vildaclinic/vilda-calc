/** Pełnoekranowa powłoka logowania — <div class="vilda-auth-root"> › .vilda-auth-overlay › .vilda-auth-card (role="dialog") › .vilda-auth-brand + .vilda-auth-screen. */
export interface AuthCardProps {
  /** Ekran w karcie; klasa na .vilda-auth-screen: "login" → "vilda-auth-login", "setup" → "vilda-auth-setup", "startup" → "vilda-auth-startup". */
  screen: 'login' | 'setup' | 'startup';
  /** Marka nad ekranem: z obrazem logo (<img class="vilda-auth-logo">) lub bez (opcja noLogo). Nazwa: <h1 class="vilda-auth-brand-name">wagaiwzrost.pl</h1>, podpis: <p class="vilda-auth-brand-tag">Vilda Clinic</p>. */
  brand?: 'logo' | 'noLogo';
  /** Etykieta kroku nad tytułem (<div class="vilda-auth-step">), np. "Krok 2 z 4"; tylko w zakładaniu konta. */
  step?: string;
  /** Tytuł ekranu (<h2 class="vilda-auth-title">), np. "Kto się loguje?". */
  title: string;
  /** Podtytuł (<p class="vilda-auth-subtitle">), jedno zdanie z instrukcją. */
  subtitle?: string;
  /** Konta na liście (<div class="vilda-auth-user-list">) — każde jako <button class="vilda-auth-user-card" data-has-passkey="0|1">. */
  users?: AuthUserCardProps[];
  /** Klucz odzyskiwania w bloku <div class="vilda-auth-recovery-key"> (monospace, obrys kreskowany). */
  recoveryKey?: string;
  /** Notatka <div class="vilda-auth-info"> pod treścią: pogrubiony nagłówek (styl inline) i akapit <p class="vilda-auth-side-note">. */
  info?: { heading: string; note: string };
  /** Separator <div class="vilda-auth-divider"><span>lub</span></div> między sekcjami. */
  divider?: boolean;
  /** Odnośniki pod treścią — każdy w osobnym <div class="vilda-auth-links">. */
  links?: AuthLinkProps[];
  /** data-busy="1" na korzeniu: karta wygaszona (opacity .6) i nieklikalna. */
  busy?: boolean;
  /** Klasa "vilda-embedded" na przodku (ramka app.html): marka ukryta, mniejsze wypełnienia. */
  embedded?: boolean;
}
/** Karta konta na liście — <button type="button" class="vilda-auth-user-card" title="Zaloguj jako …"> › .vilda-auth-user-avatar + .vilda-auth-user-info (nazwa, odznaka, meta) + <span class="vilda-auth-user-arrow" aria-hidden="true">›</span>. */
export interface AuthUserCardProps {
  /** Nazwa konta (.vilda-auth-user-name); pusta → "Konto bez nazwy". Pierwsza litera trafia do .vilda-auth-user-avatar. */
  label: string;
  /** Odznaka passkey (.vilda-auth-user-passkey-badge, ikona kłódki + nazwa metody: "Touch ID", "Face ID / Touch ID", "Windows Hello", "dane biometryczne"); ustawia data-has-passkey="1". */
  passkey?: string;
  /** Meta pod nazwą (.vilda-auth-user-meta), np. "Ostatnio: 3 dni temu". */
  meta?: string;
  /** Atrybut hidden ukrywa kartę (!important). */
  hidden?: boolean;
}
/** Odnośnik pod formularzem — <a class="vilda-auth-link" href="#">; wariant wyciszony dodaje "vilda-auth-link-muted". */
export interface AuthLinkProps {
  /** "primary" → "vilda-auth-link" (teal, 14px), "muted" → "vilda-auth-link vilda-auth-link-muted" (szary 13px, :hover czerwony). */
  variant: 'primary' | 'muted';
  children: string;
}
export declare const AuthCard: (props: AuthCardProps) => HTMLDivElement;
