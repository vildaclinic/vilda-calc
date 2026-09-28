/** Chip konta w pasku górnym — <div class="chrome-chip chrome-user-chip" id="vildaUserChip" aria-live="polite"> z <span class="chip-avatar" id="vildaUserAvatar">, <span class="chip-content"> (<span class="chip-label">Konto</span><span class="chip-value" id="vildaUserValue">) i <button class="chip-action" id="vildaUserAction">. */
export interface UserChipProps {
  /** Stan sesji. Klasy: "is-loading" | "is-guest" | "is-logged-in". */
  state: 'loading' | 'guest' | 'logged-in';
  /** Etykieta konta w <span class="chip-value">: nazwa użytkownika, "Niezalogowany", "Tryb gościa" lub "…". */
  value: string;
  /** Treść awatara: dwuliterowe inicjały (zalogowany), "…" (ładowanie) lub SVG Lucide user 16px (gość). */
  avatar: string | SVGElement;
  /** Akcja przycisku: "logout" → SVG log-out, title/aria-label "Wyloguj się"; "login" → SVG log-in, "Zaloguj się". Przed podmianą ikon: <span class="chrome-icon-fallback chrome-icon-fallback--small">&#x21AA;</span>. */
  action: 'logout' | 'login';
}
export declare const UserChip: (props: UserChipProps) => HTMLDivElement;
