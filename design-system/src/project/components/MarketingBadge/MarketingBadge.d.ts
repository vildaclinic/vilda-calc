/** Odznaka strony informacyjnej — <span> (lub <p> dla contact-kicker) z ikoną w <span class="sidebar-icon"> i tekstem. Rodziny "about-*" wymagają body.about-page, "contact-*" przodka .contact-page. */
export interface MarketingBadgeProps {
  /** Klasa: "about-badge" | "about-chip" | "inline-label" | "disclaimer-chip" | "pro-tag" | "contact-badge" | "contact-kicker" | "guide-module-badge" | "guide-tile-count" | "sub-hero__pill" | "sub-plan__badge". */
  variant:
    | 'about-badge' | 'about-chip' | 'inline-label' | 'disclaimer-chip' | 'pro-tag'
    | 'contact-badge' | 'contact-kicker'
    | 'guide-module-badge' | 'guide-tile-count'
    | 'sub-hero__pill' | 'sub-plan__badge';
  /** Odbiorca modułu (tylko guide-module-badge): klasa "guide-module-badge-user" | "guide-module-badge-doctor" | "guide-module-badge-shared". */
  audience?: 'user' | 'doctor' | 'shared';
  /** Nazwa ikony Lucide (about-badge, about-chip, disclaimer-chip, contact-badge, contact-kicker), np. "sparkles", "users", "x-circle", "mail", "stethoscope". */
  icon?: string;
  /** Tekst, np. "Dla rodzin i lekarzy", "Dane użytkownika", "nie stanowi rozpoznania", "DocPro", "Dla lekarza", "6 modułów", "Pierwsze 30 dni bezpłatnie", "★ Polecany". */
  children: string;
}
export declare const MarketingBadge: (props: MarketingBadgeProps) => HTMLSpanElement | HTMLParagraphElement;
/** Kontenery wierszy: <div class="about-badges"> | "about-chip-list" | "disclaimer-chips" | "contact-badges" | "guide-module-meta" (flex-wrap, gap .45–.55rem). */
export declare const MarketingBadgeRow: (props: { kind: 'about-badges' | 'about-chip-list' | 'disclaimer-chips' | 'contact-badges' | 'guide-module-meta'; children: HTMLElement[] }) => HTMLDivElement;
