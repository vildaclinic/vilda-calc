/** Pigułka nawigacji w obrębie strony „O aplikacji” — <a> wewnątrz <div class="about-quick-links"> pod body.about-page (siatka 4 kolumn). */
export interface QuickLinkProps {
  /** Kotwica sekcji, np. "#jak-to-dziala". */
  href: string;
  /** Wariant ostrzegawczy (zastrzeżenia) — klasa "warning-link". */
  warning?: boolean;
  children: string;
}
export declare const QuickLink: (props: QuickLinkProps) => HTMLAnchorElement;
export declare const QuickLinks: (props: { children: HTMLAnchorElement[] }) => HTMLDivElement;

/** Karta-odnośnik: <a class="about-link-card"> (w .about-link-grid, body.about-page) lub <a class="contact-link-card"> (w .contact-link-grid, przodek .contact-page); dzieci: <span class="sidebar-icon"> ikona, <span> etykieta, <span class="sidebar-icon"> strzałka. */
export interface LinkCardProps {
  page: 'about' | 'contact';
  href: string;
  icon: string;
  children: string;
}
export declare const LinkCard: (props: LinkCardProps) => HTMLAnchorElement;

/** Akcja kontaktowa: <a class="contact-action"> w <div class="contact-actions"> pod .contact-page; ikona w <span class="sidebar-icon">, tekst w <span>. */
export interface ContactActionProps {
  href: string;
  /** Akcja główna — klasa "primary" (gradient contact-primary-bg, biały tekst); jedna na widok. */
  primary?: boolean;
  icon: string;
  /** Odnośnik zewnętrzny: target="_blank" rel="noopener noreferrer". */
  external?: boolean;
  children: string;
}
export declare const ContactAction: (props: ContactActionProps) => HTMLAnchorElement;

/** Karta metody kontaktu: <a class="contact-method"> w <div class="contact-methods"> (2 kolumny) pod .contact-page. */
export interface ContactMethodProps {
  href: string;
  icon: string;
  /** Nazwa w <span class="contact-method-head"> obok ikony. */
  label: string;
  /** Opcjonalna etykieta <span class="contact-method-label">. */
  caption?: string;
  /** Wartość dosłowna (adres, domena) w <span class="contact-method-value">. */
  value: string;
  /** Notatka <span class="contact-method-note">. */
  note?: string;
}
export declare const ContactMethod: (props: ContactMethodProps) => HTMLAnchorElement;
