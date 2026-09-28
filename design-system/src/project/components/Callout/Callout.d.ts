/** Blok objaśniający na stronach informacyjnych i modułowych — <div> (lub <p>) z klasą wariantu. */
export interface CalloutProps {
  /**
   * Wariant i wymagany kontekst:
   * - "about"        → class="about-callout" wewnątrz .about-page (lewy pasek #0891b2)
   * - "hero-note"    → class="hero-note" wewnątrz .about-page (niebieskie tło)
   * - "contact"      → class="contact-callout" wewnątrz .contact-page (tokeny contact-*)
   * - "placeholder"  → <p class="guide-placeholder"> (teal kreskowany)
   * - "module-copy"  → <p class="guide-module-copy">
   * - "helper"       → class="helper-box" (kreskowany --primary, tło #eef4f4)
   * - "diab"         → class="diab-note-box" + opcjonalnie "diab-note-box--accent" | "--warn" | "--danger" | "--soft"
   * - "settings-warn"→ class="settings-note-warn" (bursztyn, waga 600)
   * - "pro-sync"     → class="pro-sync-note" (widoczna tylko przy html.vilda-pro-active)
   * - "pii"          → class="notes-pii" (zamykany, niebieski)
   * - "alert"        → class="notes-alert" (zamykany, czerwony; domyślnie display:none)
   * - "free-notice"  → class="sub-preview__free-notice"
   */
  variant:
    | 'about'
    | 'hero-note'
    | 'contact'
    | 'placeholder'
    | 'module-copy'
    | 'helper'
    | 'diab'
    | 'settings-warn'
    | 'pro-sync'
    | 'pii'
    | 'alert'
    | 'free-notice';
  /** Tylko dla "diab": odcień. Klasy: (brak) | "diab-note-box--accent" | "diab-note-box--warn" | "diab-note-box--danger" | "diab-note-box--soft" */
  tone?: 'neutral' | 'accent' | 'warn' | 'danger' | 'soft';
  /** Tylko "pii" i "alert": emoji lub znak w .notes-pii__icon / .notes-alert__icon (np. "🔒"). */
  icon?: string;
  /** Tylko "pii" i "alert": czy dodać <button class="…__close" aria-label="Zamknij">×</button>. */
  dismissible?: boolean;
  /** Treść po polsku; etykieta wiodąca w <strong> („Ważne:", „Uwaga:"). */
  children: string;
}
export declare const Callout: (props: CalloutProps) => HTMLDivElement | HTMLParagraphElement;
