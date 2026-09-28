/** Arkusz potwierdzenia modułu konta — <div class="vilda-auth-overlay vilda-auth-overlay-sheet"> w <body>, w środku .vilda-auth-sheet[role="alertdialog"][aria-modal="true"] z h3.vilda-auth-sheet-title, p.vilda-auth-sheet-body i .vilda-auth-sheet-actions. Na telefonie dolny arkusz, od 700 px wyśrodkowana karta 400 px. */
export interface AuthSheetProps {
  /** Tytuł (1.15rem/700, #002830), np. "Chcesz logować się przez Touch ID?". */
  title: string;
  /** Treść (.9rem, #4a6670). */
  body?: string;
  /** Odmiana arkusza. Klasy: (brak) | "vilda-auth-sheet-password" | "vilda-auth-sheet-conflict" | "vilda-auth-sheet-info" — trzy ostatnie ograniczają wysokość (86dvh) i przewijają treść. */
  kind?: 'default' | 'password' | 'conflict' | 'info';
  /** Lista zmian w konflikcie — ul.vilda-auth-conflict-list (tylko kind="conflict"). */
  conflictItems?: string[];
  /** Ostrzeżenie w arkuszu hasła — .vilda-auth-password-warning z <strong> i tekstem (tylko kind="password"). */
  warning?: { title: string; text: string };
  /** Przyciski w pionowym stosie — <button class="vilda-auth-btn vilda-auth-btn-{variant}">; główny pierwszy, rezygnacja ("Nie teraz", "Anuluj") ostatnia. */
  actions: Array<{ label: string; variant: 'primary' | 'ghost' | 'danger'; description?: string }>;
  /** Etykieta dostępności (aria-label) — domyślnie równa tytułowi. */
  ariaLabel?: string;
}
export declare const AuthSheet: (props: AuthSheetProps) => HTMLDivElement;

/** Nakładka wylogowania — .vilda-logout-overlay > .vilda-logout-overlay__spinner + .vilda-logout-overlay__label. */
export interface LogoutOverlayProps {
  /** Etykieta pod spinnerem. Domyślnie "Trwa wylogowywanie…". */
  label?: string;
}
export declare const LogoutOverlay: (props: LogoutOverlayProps) => HTMLDivElement;

/** Dymek wyniku kopiowania — <div class="vilda-copy-summary-toast {ton} show">tekst</div>, position:fixed na dole (bottom z --vilda-dol-wolny). */
export interface CopySummaryToastProps {
  /** Ton. Klasy: "ok" (#065f46 na #ecfdf5) | "err" (#7f1d1d na #fef2f2). */
  ton: 'ok' | 'err';
  /** Widoczny — klasa "show" (opacity 1, translateY(0)). */
  show?: boolean;
  /** Treść, np. "✓ Dane skopiowane do schowka". */
  children: string;
}
export declare const CopySummaryToast: (props: CopySummaryToastProps) => HTMLDivElement;
