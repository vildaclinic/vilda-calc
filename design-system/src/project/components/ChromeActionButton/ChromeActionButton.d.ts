/** Kafelek synchronizacji w pasku górnym — <a class="chrome-sync-btn is-enabled" id="vildaSyncBtn"> z SVG Lucide cloud-upload 16px. */
export interface SyncButtonProps {
  /** Klasa "is-enabled" — bez niej kafelek jest ukryty (chyba że cloudOnly). */
  enabled?: boolean;
  /** Atrybut data-sync-state: ikona primary z pulsem | #16a34a | #dc2626 | #b45400. */
  syncState?: 'syncing' | 'ok' | 'error' | 'stale';
  /** Atrybut data-cloud-only="true": pełne tło primary, biała ikona. */
  cloudOnly?: boolean;
  /** Atrybut data-offline="true" (tylko z cloudOnly): tło #b45309 z pierścieniem. */
  offline?: boolean;
  /** title (pełne zdanie) i aria-label (krótki status), np. "Synchronizacja między urządzeniami" / "Status synchronizacji". */
  title: string;
  ariaLabel: string;
}
export declare const SyncButton: (props: SyncButtonProps) => HTMLAnchorElement;

/** Dzwonek przypomnień — <button class="chrome-reminders-btn" id="vildaRemindersBtn"> z <span class="chrome-reminders-inner">SVG bell</span> i <span class="chrome-reminders-badge">. */
export interface RemindersButtonProps {
  /** Atrybut data-state: today (plakietka #d97706) | overdue (#dc2626) | loading (pierścień) | empty (wyciszony). */
  state: 'today' | 'overdue' | 'loading' | 'empty';
  /** Atrybut data-count; w plakietce liczba lub "9+" powyżej 9, pusta dla loading/empty. */
  count: number;
  /** title = aria-label: "Przypomnienia" | "Brak przypomnień" | "Wczytywanie przypomnień…". */
  label: string;
}
export declare const RemindersButton: (props: RemindersButtonProps) => HTMLButtonElement;

/** Plakietka planu PRO — <a class="chrome-pro-badge" id="vildaProBadge" href="subskrypcja.html" style="display:inline-flex"> z tekstem "PRO" lub "↑ PRO". */
export interface ProBadgeProps {
  /** Atrybut data-pro-state: active (#ece8fb / #6d4bd8) | upgrade (#e0f2f3 / #00838d, treść "↑ PRO"). */
  proState: 'active' | 'upgrade';
}
export declare const ProBadge: (props: ProBadgeProps) => HTMLAnchorElement;
