/** Górny pasek aplikacji — <header data-vilda-chrome-mounted="1"> z <div data-vilda-chrome-wrap> zawierającym <div class="chrome-strip"> i <div class="chrome-mobile-brand-bar">. Wymaga na <body> klas "liquid-ios26 has-vilda-chrome has-sidebar". */
export interface ChromeStripProps {
  /** Nazwa marki w <span class="chrome-brand-name"> i w pasku marki na telefonie; w aplikacji zawsze "wagaiwzrost.pl". */
  brandName: string;
  /** Tagline w <span class="chrome-brand-tagline"> (wersaliki); w aplikacji "Vilda Clinic". */
  brandTagline: string;
  /** Źródło <img class="chrome-brand-logo" width="38" height="38">; w aplikacji "logo_vilda.webp". */
  logoSrc: string;
  /** Adres <a class="chrome-brand">; w aplikacji "index.html". */
  brandHref: string;
  /** Slot <div class="chrome-chips">: ProBadge, SyncButton, RemindersButton, PatientChip, UserChip — w tej kolejności. */
  chips: HTMLElement[];
  /** Przycisk menu (MobileTopNav) na początku paska; widoczny tylko ≤991px. */
  menuButton: HTMLButtonElement;
}
export declare const ChromeStrip: (props: ChromeStripProps) => HTMLElement;
