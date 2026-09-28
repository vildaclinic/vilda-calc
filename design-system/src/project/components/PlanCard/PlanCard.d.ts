/** Karta planu subskrypcji — <div class="sub-plan" role="listitem"> w <div class="sub-plans" role="list"> (strona subskrypcja.html, <body> bez liquid-ios26). */
export interface PlanCardProps {
  /** Plan PRO — klasa "sub-plan--pro" (fioletowy obrys 2px, pro-glow, gradient) i wstążka <span class="sub-plan__badge">. */
  pro?: boolean;
  /** Tekst wstążki, np. "★ Polecany" (tylko pro). */
  badge?: string;
  /** aria-label karty, np. "Plan Bezpłatny" | "Plan Vilda PRO". */
  ariaLabel: string;
  /** Nazwa w <div class="sub-plan__name">; w PRO opakowana w <span class="sub-plan__name-pro"> z gwiazdą SVG. */
  name: string;
  /** Cena w <div class="sub-plan__price">, np. "49 zł"; okres w <span>, np. "/ mies.". */
  price: string;
  period: string;
  /** <p class="sub-plan__price-trial"> (pro-dark, 700), np. "Pierwsze 30 dni bezpłatnie". */
  trial?: string;
  /** <p class="sub-plan__price-note"> (#5a7274, .82rem). */
  note?: string;
  /** Cechy w <ul class="sub-plan__features">; znacznik <span class="sub-plan__check sub-plan__check--teal|--pro"> ze znakiem SVG. */
  features: string[];
  /** Status próbny w <div class="sub-trial-status sub-trial-status--…" role="status" aria-live="polite">; pusty tekst ukrywa element. */
  status?: { kind: 'success' | 'warn' | 'info' | 'error'; text: string };
  /** CTA: "secondary" → <a class="sub-plan__cta sub-plan__cta--secondary">, "pro" → <button type="button" class="sub-plan__cta sub-plan__cta--pro">; "active" dokłada "sub-plan__cta--active" po aktywacji. */
  cta: { kind: 'secondary' | 'pro'; label: string; href?: string; active?: boolean; disabled?: boolean };
  /** <p class="sub-login-note"> z odnośnikiem <a>. */
  loginNote?: string;
}
export declare const PlanCard: (props: PlanCardProps) => HTMLDivElement;

/** Siatka planów: <div class="sub-plans" role="list"> — dwie kolumny, ≤640px jedna. */
export declare const PlanGrid: (props: { children: HTMLDivElement[] }) => HTMLDivElement;
