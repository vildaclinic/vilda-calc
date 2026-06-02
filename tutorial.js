(()=>{function _(e,t,n){if(!e)return!1;const i=t==null?"":String(t);try{return typeof window<"u"&&window.VildaHtml&&typeof window.VildaHtml.setTrustedHtml=="function"?window.VildaHtml.setTrustedHtml(e,i,{context:n||"tutorial"}):(e.textContent=i,!0)}catch(r){return typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",r,{helper:"tutorialSetTrustedHtml",context:n||""}),!1}}function j(e){if(!e)return!1;try{return typeof window<"u"&&window.VildaHtml&&typeof window.VildaHtml.clearHtml=="function"?window.VildaHtml.clearHtml(e):(e.textContent="",!0)}catch(t){return typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",t,{helper:"tutorialClearHtml"}),!1}}function re(e,t,n){if(!e||!Array.isArray(t))return!1;try{return typeof window<"u"&&window.VildaHtml&&typeof window.VildaHtml.restoreClonedChildren=="function"?window.VildaHtml.restoreClonedChildren(e,t,{context:n||"tutorial:restore-cloned-children"}):(j(e),t.forEach(function(i){i&&typeof i.cloneNode=="function"&&e.appendChild(i.cloneNode(!0))}),!0)}catch(i){return typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",i,{helper:"tutorialRestoreClonedChildren",context:n||""}),!1}}const b="2026-03",f={role:`wwOnboardingRole:${b}`,firstSessionStarted:`wwOnboardingFirstSessionStarted:${b}`,firstSessionActive:`wwOnboardingFirstSessionActive:${b}`,launcherHint:`wwOnboardingLauncherHint:${b}`,launcherResolved:`wwOnboardingLauncherResolved:${b}`},M=new WeakMap,o={page:ae(),role:null,started:!1,overlay:null,sheet:null,dynamicTitle:null,dynamicText:null,dynamicList:null,selectionNote:null,primaryBtn:null,secondaryLink:null,launcher:null,launcherPulseTimer:null,toast:null,bannerObserver:null,helpVisible:!1,formGuideAutoDismissCleanup:null,homeResultsObserver:null,homeResultsStateCleanup:null,homeResultsSyncTimer:null,compareInstructionStateCleanup:null,compareInstructionSyncTimer:null,desktopDockOffsetCleanup:null,desktopDockOffsetRaf:null,desktopDockOffsetTrailTimers:[],observedDesktopDock:null};function ae(){try{if((window.location.pathname||"").toLowerCase().includes("docpro")||(document.title||"").toLowerCase().includes("docpro"))return"docpro"}catch(e){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",e,{line:58})}return"home"}function T(){try{return window.VildaPersistence||null}catch{return null}}function N(e){try{const t=T();return t&&typeof t.readRaw=="function"?t.readRaw("local-persistent",e):null}catch{return null}}function H(e,t){try{const n=T();n&&typeof n.writeRaw=="function"&&n.writeRaw("local-persistent",e,t)}catch(n){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",n,{line:87})}}function C(e){try{const t=T();return t&&typeof t.readRaw=="function"?t.readRaw("session",e):null}catch{return null}}function S(e,t){try{const n=T();n&&typeof n.writeRaw=="function"&&n.writeRaw("session",e,t)}catch(n){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",n,{line:109})}}function se(){return C(f.launcherResolved)==="true"?!1:V()?(S(f.launcherResolved,"true"),!1):N(f.firstSessionStarted)==="true"?!1:(C(f.firstSessionActive)==="true"||(H(f.firstSessionStarted,"true"),S(f.firstSessionActive,"true")),!0)}function Oe(){const e=N(f.role);return e==="personal"||e==="doctor"?e:o.page==="docpro"?"doctor":"personal"}function le(e){H(f.role,e)}function ce(){if(document.getElementById("ww-onboarding-styles"))return;const e=document.createElement("style");e.id="ww-onboarding-styles",e.textContent=`
      :root {
        --ww-help-z: 1201;
        --ww-overlay-bg: rgba(7, 12, 20, 0.42);
        --ww-surface: rgba(255,255,255,0.96);
        --ww-text: #14212b;
        --ww-muted: #50606f;
        --ww-border: rgba(0,0,0,0.08);
        --ww-pro-accent: #9900ff;
        --ww-pro-accent-soft: rgba(153, 0, 255, 0.08);
        --ww-pro-accent-ring: rgba(153, 0, 255, 0.26);
      }

      @keyframes wwHelpPulsePurple {
        0% {
          box-shadow: 0 0 0 0 var(--ww-pro-accent-ring);
        }
        70% {
          box-shadow: 0 0 0 10px var(--ww-pro-accent-soft);
        }
        100% {
          box-shadow: 0 0 0 0 rgba(153, 0, 255, 0);
        }
      }

      .ww-help-launcher {
        position: fixed;
        left: max(var(--mobile-dock-side-gap, 0.75rem), calc(env(safe-area-inset-left, 0px) + 0.35rem));
        bottom: var(--ww-safe-scroll-top-btn-bottom, var(--scroll-top-btn-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem)));
        z-index: var(--ww-help-z);
        display: inline-flex;
        align-items: center;
        justify-content: center;
        width: auto !important;
        inline-size: auto !important;
        max-width: calc(100vw - max(var(--mobile-dock-side-gap, 0.75rem), calc(env(safe-area-inset-left, 0px) + 0.35rem)) - max(var(--mobile-dock-side-gap, 0.75rem), calc(env(safe-area-inset-right, 0px) + 0.35rem)) - 0.5rem);
        margin: 0 !important;
        border: 0;
        border-radius: 999px;
        min-height: 3rem;
        min-width: 0 !important;
        padding: 0.78rem 1.1rem;
        background: var(--primary, #00838d);
        color: #fff;
        box-shadow: 0 12px 28px rgba(0,0,0,0.22);
        box-sizing: border-box;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
        white-space: nowrap;
        overflow: visible;
        isolation: isolate;
        transition: bottom 220ms ease, background 0.2s ease, transform 220ms ease, opacity 220ms ease, box-shadow 120ms ease;
      }

      .ww-help-launcher::after {
        content: "";
        position: absolute;
        inset: 0;
        border-radius: inherit;
        border: 1.5px solid rgba(153, 0, 255, 0.72);
        box-shadow: 0 0 0 0 rgba(153, 0, 255, 0);
        pointer-events: none;
      }

      .ww-help-launcher.ww-help-launcher--pulse::after {
        animation: wwHelpPulsePurple 1.333333s ease-in-out 6;
      }

      body.has-mobile-bottom-dock .ww-help-launcher {
        bottom: var(--ww-safe-scroll-top-btn-bottom, var(--scroll-top-btn-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem))) !important;
      }

      body.mobile-nav-ui-locked .ww-help-launcher {
        bottom: var(--scroll-top-btn-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem)) !important;
        transition: background 0.2s ease, box-shadow 120ms ease, opacity 220ms ease !important;
        transform: none !important;
      }

      body.mobile-nav-ui-locked.has-mobile-bottom-dock-visible .ww-help-launcher {
        bottom: var(--mobile-dock-pinned-scroll-top-bottom, var(--scroll-top-btn-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem))) !important;
      }

      body.mobile-nav-ui-locked .ww-help-launcher:hover,
      body.mobile-nav-ui-locked .ww-help-launcher:focus-visible {
        transform: none !important;
      }

      body.has-mobile-bottom-dock #scrollTopBtn {
        bottom: var(--scroll-top-btn-bottom, 1rem) !important;
      }

      body.mobile-nav-ui-locked.has-mobile-bottom-dock-visible #scrollTopBtn {
        bottom: var(--mobile-dock-pinned-scroll-top-bottom, var(--scroll-top-btn-bottom, 1rem)) !important;
      }

      .ww-help-launcher:hover,
      .ww-help-launcher:focus-visible {
        transform: translateY(-1px);
      }

      .ww-help-launcher__label {
        display: inline-block;
        white-space: nowrap;
      }

      @media (prefers-reduced-motion: reduce) {
        .ww-help-launcher.ww-help-launcher--pulse::after {
          animation: none;
        }
      }

      .ww-close-icon {
        display: block;
        width: 1rem;
        height: 1rem;
        flex: 0 0 auto;
        stroke: currentColor;
        color: inherit;
        overflow: visible;
        pointer-events: none;
      }

      .ww-onboarding-overlay {
        position: fixed;
        inset: 0;
        z-index: calc(var(--ww-help-z) + 1);
        display: none;
        align-items: center;
        justify-content: center;
        padding: 1rem;
        background: var(--ww-overlay-bg);
        backdrop-filter: blur(4px);
      }

      .ww-onboarding-overlay.is-open {
        display: flex;
      }

      .ww-onboarding-sheet {
        width: min(100%, 42rem);
        max-height: min(88vh, 56rem);
        overflow: auto;
        background: var(--ww-surface);
        color: var(--ww-text);
        border-radius: 24px;
        border: 1px solid var(--ww-border);
        box-shadow: 0 24px 64px rgba(0,0,0,0.2);
        padding: 1.2rem 1.2rem calc(1.2rem + env(safe-area-inset-bottom, 0px));
      }

      .ww-onboarding-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 1rem;
        margin-bottom: 1rem;
      }

      .ww-onboarding-eyebrow {
        display: inline-flex;
        align-items: center;
        gap: 0.45rem;
        font-size: 0.85rem;
        font-weight: 700;
        color: var(--primary, #00838d);
        text-transform: uppercase;
        letter-spacing: 0.04em;
      }

      .ww-onboarding-title {
        margin: 0.35rem 0 0;
        font-size: clamp(1.25rem, 1rem + 1vw, 1.8rem);
        line-height: 1.15;
      }

      .ww-onboarding-subtitle {
        margin: 0.6rem 0 0;
        color: var(--ww-muted);
        line-height: 1.5;
      }

      .ww-onboarding-close {
        appearance: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0 !important;
        border: 0 !important;
        background: transparent !important;
        color: #111 !important;
        width: 2.2rem !important;
        min-width: 2.2rem !important;
        max-width: 2.2rem !important;
        height: 2.2rem !important;
        min-height: 2.2rem !important;
        border-radius: 999px;
        box-shadow: none !important;
        cursor: pointer;
        font-size: 0;
        line-height: 1;
        flex: 0 0 auto;
      }

      .ww-onboarding-close:hover,
      .ww-onboarding-close:focus-visible {
        background: rgba(0,0,0,0.06);
        color: var(--ww-text);
      }

      .ww-role-grid {
        display: grid;
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 0.8rem;
        margin: 1rem 0 1.1rem;
      }

      .ww-role-card {
        display: flex;
        flex-direction: column;
        align-items: flex-start;
        gap: 0.45rem;
        width: 100%;
        max-width: 100%;
        min-width: 0;
        min-height: 0;
        box-sizing: border-box;
        margin: 0 !important;
        border: 1px solid var(--ww-border);
        border-radius: 18px;
        padding: 0.95rem;
        background: rgba(255,255,255,0.75);
        cursor: pointer;
        text-align: left;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
        transition: border-color 120ms ease, box-shadow 120ms ease, transform 120ms ease;
      }

      .ww-role-card:hover,
      .ww-role-card:focus-visible {
        transform: translateY(-1px);
      }

      .ww-role-card.is-selected {
        border-color: var(--primary, #00838d);
        box-shadow: 0 0 0 2px rgba(0,131,141,0.18);
      }

      .ww-role-card[data-role="doctor"].is-selected {
        border-color: var(--ww-pro-accent);
        box-shadow: 0 0 0 2px rgba(153,0,255,0.2);
      }

      .ww-role-card:focus-visible {
        outline: 2px solid rgba(0,131,141,0.35);
        outline-offset: 2px;
      }

      .ww-role-card[data-role="doctor"].is-selected:focus-visible {
        outline-color: rgba(153, 0, 255, 0.35);
      }

      .ww-role-card__title {
        display: block;
        font-size: 1rem;
        font-weight: 800;
        margin-bottom: 0.35rem;
        color: var(--ww-text);
      }

      .ww-role-card__desc {
        display: block;
        color: var(--ww-muted);
        line-height: 1.45;
        font-size: 0.95rem;
      }

      .ww-role-card__hint {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        margin-top: auto;
        min-height: 2rem;
        padding: 0.38rem 0.72rem;
        border-radius: 999px;
        background: rgba(0,131,141,0.08);
        color: var(--primary, #00838d);
        font-size: 0.82rem;
        font-weight: 700;
        line-height: 1.2;
        white-space: nowrap;
      }

      .ww-role-card.is-selected .ww-role-card__hint {
        background: rgba(0,131,141,0.14);
      }

      .ww-role-card[data-role="doctor"].is-selected .ww-role-card__hint {
        background: rgba(153, 0, 255, 0.14);
        color: var(--ww-pro-accent);
      }

      .ww-role-grid-note {
        margin: -0.15rem 0 1rem;
        color: var(--ww-muted);
        font-size: 0.92rem;
        line-height: 1.45;
      }

      .ww-dynamic-panel {
        border-radius: 18px;
        border: 1px solid var(--ww-border);
        background: rgba(255,255,255,0.78);
        padding: 1rem;
      }

      .ww-dynamic-panel h3 {
        margin: 0;
        font-size: 1.05rem;
      }

      .ww-dynamic-panel p {
        margin: 0.45rem 0 0;
        color: var(--ww-muted);
        line-height: 1.5;
      }

      .ww-step-list {
        margin: 0.85rem 0 0;
        padding-left: 1.15rem;
      }

      .ww-step-list li {
        margin: 0.35rem 0;
        line-height: 1.45;
      }

      .ww-sheet-footer {
        display: flex;
        flex-wrap: wrap;
        gap: 0.7rem;
        margin-top: 1rem;
      }

      .ww-btn,
      .ww-link-btn {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 2.8rem;
        padding: 0.72rem 1rem;
        border-radius: 14px;
        border: 1px solid transparent;
        text-decoration: none;
        font: inherit;
        font-weight: 700;
        cursor: pointer;
      }

      .ww-btn--primary {
        background: var(--primary, #00838d);
        color: #fff;
        border-color: var(--primary, #00838d);
      }

      .ww-btn--ghost,
      .ww-link-btn {
        background: rgba(255,255,255,0.72);
        color: var(--ww-text);
        border-color: var(--ww-border);
      }

      .ww-inline-guide {
        margin-top: 0.9rem;
        border: 1px solid rgba(0,0,0,0.07);
        box-shadow: 0 14px 30px rgba(0,0,0,0.08);
      }

      .ww-inline-guide--embedded {
        margin-top: 0;
        padding: 0;
        border: 0;
        box-shadow: none;
        background: transparent;
        color: var(--ww-text);
        text-align: left;
      }

      .ww-inline-guide--embedded .ww-inline-guide__head,
      .ww-inline-guide--embedded .ww-inline-guide__desc,
      .ww-inline-guide--embedded .ww-inline-guide__list,
      .ww-inline-guide--embedded .ww-inline-guide__actions {
        text-align: left;
      }

      .ww-info-card-has-guide {
        display: block !important;
      }

      .ww-info-card-has-guide #errorBox {
        display: none !important;
      }

      .ww-compare-guide-host {
        display: block !important;
        margin: 0 !important;
        font-size: 1rem !important;
        font-weight: 400 !important;
        text-align: left !important;
        color: var(--ww-text) !important;
      }

      .ww-compare-guide-host a {
        color: inherit;
        font-size: inherit;
      }

      .ww-compare-instruction-suppressed {
        display: none !important;
      }

      .ww-inline-guide__head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 0.8rem;
      }

      .ww-inline-guide__title {
        margin: 0;
        font-size: 1.05rem;
      }

      .ww-inline-guide__desc {
        margin: 0.35rem 0 0;
        color: var(--ww-muted);
        line-height: 1.5;
      }

      .ww-inline-guide__close {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 0;
        margin: 0 !important;
        border: 0 !important;
        background: transparent !important;
        color: #111 !important;
        width: 2rem !important;
        min-width: 2rem !important;
        max-width: 2rem !important;
        height: 2rem !important;
        min-height: 2rem !important;
        border-radius: 999px;
        box-shadow: none !important;
        font-size: 0;
        line-height: 1;
        cursor: pointer;
        flex: 0 0 auto;
      }

      .ww-inline-guide__close:hover,
      .ww-inline-guide__close:focus-visible {
        background: rgba(0,0,0,0.06);
        color: var(--ww-text);
      }

      .ww-inline-guide__list {
        margin: 0.85rem 0 0;
        padding-left: 1.15rem;
      }

      .ww-inline-guide__list li {
        margin: 0.36rem 0;
        line-height: 1.45;
      }

      .ww-inline-guide__actions {
        display: flex;
        flex-wrap: wrap;
        gap: 0.65rem;
        margin-top: 0.95rem;
      }

      .ww-soft-focus {
        position: relative;
        z-index: 2;
        box-shadow: 0 0 0 3px rgba(255,255,255,0.98), 0 0 0 6px rgba(0,131,141,0.22), 0 14px 28px rgba(0,0,0,0.12);
        border-radius: 14px;
        transition: box-shadow 160ms ease;
      }

      .ww-toast {
        position: fixed;
        left: 50%;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 1rem);
        transform: translateX(-50%) translateY(10px);
        z-index: calc(var(--ww-help-z) + 2);
        min-width: min(92vw, 20rem);
        max-width: min(92vw, 32rem);
        background: rgba(20, 33, 43, 0.96);
        color: #fff;
        padding: 0.85rem 1rem;
        border-radius: 14px;
        box-shadow: 0 18px 32px rgba(0,0,0,0.24);
        opacity: 0;
        pointer-events: none;
        transition: opacity 160ms ease, transform 160ms ease;
        text-align: center;
        line-height: 1.4;
      }

      .ww-toast.is-visible {
        opacity: 1;
        transform: translateX(-50%) translateY(0);
      }

      body.has-mobile-bottom-dock-visible .ww-toast {
        bottom: calc(var(--scroll-top-btn-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem)) + 0.75rem);
      }

      body.mobile-nav-ui-locked.has-mobile-bottom-dock-visible .ww-toast {
        bottom: calc(var(--mobile-dock-pinned-scroll-top-bottom, var(--scroll-top-btn-bottom, calc(env(safe-area-inset-bottom, 0px) + 1rem))) + 0.75rem);
      }

      @media (max-width: 720px) {
        .ww-help-launcher {
          width: auto !important;
          inline-size: auto !important;
          min-width: 0 !important;
          margin-top: 0 !important;
          padding: 0.76rem 1rem;
          border-radius: 18px;
        }

        .ww-onboarding-overlay {
          align-items: flex-end;
          padding: 0;
        }

        .ww-onboarding-sheet {
          width: 100%;
          max-height: min(90vh, 48rem);
          border-radius: 22px 22px 0 0;
          padding: 1rem 1rem calc(1.05rem + env(safe-area-inset-bottom, 0px));
        }

        .ww-role-grid {
          grid-template-columns: 1fr;
        }

        .ww-role-card,
        .ww-role-card:hover,
        .ww-role-card:focus-visible {
          transform: none;
        }

        .ww-onboarding-close,
        .ww-inline-guide__close {
          margin-top: 0 !important;
        }

        .ww-sheet-footer,
        .ww-inline-guide__actions {
          flex-direction: column;
        }

        .ww-btn,
        .ww-link-btn {
          width: 100%;
        }
      }

      /* \u2500\u2500 Welcome screen (Wariant 3) \u2500\u2500 */
      .ww-screen { display: none; flex-direction: column; }
      .ww-screen.is-active { display: flex; }

      .ww-welcome-head {
        background: linear-gradient(135deg, #00838d, #00b0a6);
        padding: 1.75rem 1.6rem 1.5rem;
        text-align: center;
        position: relative;
        flex-shrink: 0;
      }
      .ww-welcome-close {
        position: absolute;
        top: 0.7rem; right: 0.7rem;
        background: rgba(255,255,255,0.2);
        border: none; border-radius: 999px;
        width: 2rem; height: 2rem;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; color: #fff; padding: 0;
      }
      .ww-welcome-close:hover { background: rgba(255,255,255,0.32); }
      .ww-welcome-brand {
        display: inline-flex; flex-direction: column; align-items: center; gap: 8px;
        margin-bottom: 1rem;
      }
      .ww-welcome-logo {
        width: 64px; height: 64px; border-radius: 16px;
        object-fit: contain; flex-shrink: 0;
        background: rgba(255,255,255,0.15);
        padding: 6px;
      }
      .ww-welcome-brand span {
        font-size: 0.82rem; font-weight: 700; color: rgba(255,255,255,0.85); letter-spacing: 0.03em;
      }
      .ww-welcome-title {
        margin: 0 0 0.4rem; font-size: 1.3rem; font-weight: 700;
        color: #fff; line-height: 1.3;
      }
      .ww-welcome-subtitle {
        margin: 0; font-size: 0.82rem;
        color: rgba(255,255,255,0.85); line-height: 1.5;
      }
      .ww-welcome-body { padding: 1.4rem 1.6rem; display: flex; flex-direction: column; gap: 0.55rem; }

      .ww-pill-btn {
        display: flex; align-items: center; justify-content: center; gap: 8px;
        border-radius: 999px; font-size: 0.9rem; font-weight: 700;
        padding: 12px 18px; cursor: pointer; text-decoration: none;
        border: none; font-family: inherit; box-sizing: border-box; width: 100%;
        transition: opacity 0.15s;
      }
      .ww-pill-btn:hover { opacity: 0.88; }
      .ww-pill-btn svg { width: 18px; height: 18px; flex-shrink: 0; }

      .ww-btn-doctor-main { background: #00838d; color: #fff; }
      .ww-btn-pair { display: flex; gap: 0.5rem; }
      .ww-btn-pair .ww-pill-btn { flex: 1; font-size: 0.82rem; padding: 11px 10px; }
      .ww-btn-secondary {
        background: transparent; color: #00838d;
        border: 1.5px solid rgba(0,131,141,0.35);
      }
      .ww-btn-ghost-small {
        background: transparent; color: #8aa4a6;
        font-size: 0.78rem; font-weight: 500; padding: 7px 12px;
        border: none; width: auto; align-self: center;
      }

      .ww-pro-head {
        background: linear-gradient(135deg, #00838d, #00b0a6);
        padding: 1.2rem 1.6rem;
        display: flex; align-items: center; gap: 10px;
        flex-shrink: 0;
      }
      .ww-pro-back {
        background: rgba(255,255,255,0.2); border: none; border-radius: 999px;
        width: 2rem; height: 2rem; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        cursor: pointer; color: #fff; padding: 0;
      }
      .ww-pro-back:hover { background: rgba(255,255,255,0.32); }
      .ww-pro-back svg { width: 16px; height: 16px; }
      .ww-pro-eyebrow {
        margin: 0; font-size: 0.68rem; font-weight: 700;
        color: rgba(255,255,255,0.8); text-transform: uppercase; letter-spacing: 0.05em;
      }
      .ww-pro-title { margin: 0; font-size: 1.05rem; font-weight: 700; color: #fff; }

      .ww-pro-features { padding: 0.25rem 1.6rem; overflow-y: auto; flex: 1; }
      .ww-pro-feature {
        display: flex; align-items: flex-start; gap: 12px;
        padding: 0.75rem 0; border-bottom: 1px solid rgba(0,131,141,0.08);
      }
      .ww-pro-feature:last-child { border-bottom: none; }
      .ww-pro-feature-icon {
        flex-shrink: 0; width: 32px; height: 32px;
        background: #e0f4f4; border-radius: 8px;
        display: flex; align-items: center; justify-content: center;
        margin-top: 1px;
      }
      .ww-pro-feature-icon svg { width: 16px; height: 16px; stroke: #00838d; }
      .ww-pro-feature-title {
        margin: 0 0 2px; font-size: 0.85rem; font-weight: 600; color: #14212b;
      }
      .ww-pro-feature-desc {
        margin: 0; font-size: 0.75rem; color: #5a7274; line-height: 1.4;
      }
      .ww-pro-footer {
        padding: 0.9rem 1.6rem 0.5rem;
        display: flex; flex-direction: column; gap: 0.4rem;
        flex-shrink: 0;
      }

      @media (min-width: 721px) {
        .ww-welcome-title { font-size: 1.45rem; }
        .ww-welcome-subtitle { font-size: 0.88rem; }
        .ww-pill-btn { font-size: 0.95rem; }
        .ww-btn-pair .ww-pill-btn { font-size: 0.88rem; }
        .ww-btn-ghost-small { font-size: 0.83rem; }
        .ww-pro-feature-title { font-size: 0.9rem; }
        .ww-pro-feature-desc { font-size: 0.8rem; }
        .ww-welcome-logo { width: 72px; height: 72px; border-radius: 18px; }
        .ww-welcome-brand span { font-size: 0.88rem; }
      }

      @media (max-width: 720px) {
        .ww-welcome-head { padding: 1.4rem 1.25rem 1.2rem; }
        .ww-welcome-body { padding: 1.2rem 1.25rem; }
        .ww-pro-head { padding: 1rem 1.25rem; }
        .ww-pro-features { padding: 0 1.25rem; }
        .ww-pro-footer { padding: 0.8rem 1.25rem 0.3rem; }
        .ww-btn-pair { flex-direction: column; }
        .ww-btn-pair .ww-pill-btn { font-size: 0.88rem; }
      }
    `,document.head.appendChild(e)}function de(){return`
      <svg class="ww-close-icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 6L18 18M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
      </svg>
    `}function y(e){if(!e)return!1;const t=window.getComputedStyle(e);return t.display!=="none"&&t.visibility!=="hidden"&&!e.hidden}function P(e){const t=document.getElementById(e);if(!t)return 0;const n=typeof t.value=="string"?t.value.replace(",","."):t.value,i=parseFloat(n);return Number.isFinite(i)?i:0}function ue(){try{if(typeof window.getAgeDecimal=="function"){const e=Number(window.getAgeDecimal());if(Number.isFinite(e))return e}}catch(e){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",e,{line:759})}return P("age")}function V(){if(o.page!=="home")return!1;const e=document.getElementById("results");if(!e||!y(e))return!1;const t=ue(),n=P("weight"),i=P("height");return t>0&&n>0&&i>0}function G(e){if(o.launcher){if(e){o.launcher.hidden=!1,o.launcher.removeAttribute("hidden"),o.launcher.removeAttribute("aria-hidden"),o.launcher.style.display="",U();return}o.launcher.hidden=!0,o.launcher.setAttribute("hidden",""),o.launcher.setAttribute("aria-hidden","true"),o.launcher.style.display="none",o.launcher.classList.remove("ww-help-launcher--pulse"),window.clearTimeout(o.launcherPulseTimer)}}function we(){S(f.launcherResolved,"true"),G(!1)}function q(){if(o.page==="home"){if(C(f.launcherResolved)==="true"){G(!1);return}V()&&we()}}function v(){if(o.page!=="home")return;const e=()=>{q()};window.clearTimeout(o.homeResultsSyncTimer),e(),window.requestAnimationFrame(e),o.homeResultsSyncTimer=window.setTimeout(e,140)}function pe(){if(o.page!=="home"||o.homeResultsStateCleanup)return;const e=[],t=document.getElementById("calcForm");if(t){const r=()=>{v()};t.addEventListener("input",r,!0),t.addEventListener("change",r,!0),e.push(()=>{t.removeEventListener("input",r,!0),t.removeEventListener("change",r,!0)})}const n=["results","compareInstruction","errorBox"].map(r=>document.getElementById(r)).filter(Boolean);if(n.length&&typeof MutationObserver<"u"){const r=new MutationObserver(()=>{v()});n.forEach(a=>{r.observe(a,{attributes:!0,attributeFilter:["style","class","hidden"]})}),o.homeResultsObserver=r,e.push(()=>r.disconnect())}const i=()=>{v()};window.addEventListener("pageshow",i),e.push(()=>window.removeEventListener("pageshow",i)),o.homeResultsStateCleanup=()=>{e.forEach(r=>{try{r()}catch(a){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",a,{line:878})}})},v(),window.setTimeout(v,260)}function B(e,t=0){const n=parseFloat(e);return Number.isFinite(n)?n:t}function me(){const e=document.documentElement;if(!e)return 16;const t=parseFloat(window.getComputedStyle(e).fontSize||"16");return Number.isFinite(t)&&t>0?t:16}function fe(){if(!(window.matchMedia instanceof Function))return!1;const e=window.matchMedia("(pointer: coarse)").matches;return window.matchMedia("(pointer: fine)").matches&&!e}function Z(){Array.isArray(o.desktopDockOffsetTrailTimers)&&(o.desktopDockOffsetTrailTimers.forEach(e=>{window.clearTimeout(e)}),o.desktopDockOffsetTrailTimers=[])}function he(){const e=Math.max(12,Math.round(me())),t=document.documentElement?window.getComputedStyle(document.documentElement):null,n=Math.max(e,Math.round(B(t?.getPropertyValue("--scroll-top-btn-bottom"),e)));if(!fe()||!!!(document.body&&document.body.classList.contains("has-mobile-bottom-dock")))return n;const r=document.getElementById("mobileBottomDock");if(!r||r.hidden||r.classList.contains("is-keyboard-hidden"))return n;const a=window.getComputedStyle(r);if(a.display==="none"||a.visibility==="hidden")return n;const s=Math.max(Y(),1),d=r.getBoundingClientRect(),m=Math.max(0,Math.round(B(a.bottom,0))),p=Math.max(0,Math.round(r.offsetHeight||B(a.height,0)||d.height||0)),w=Math.max(0,Math.round(s-d.top)),l=Math.max(0,p+m),u=r.classList.contains("is-hidden")?w:Math.max(l+e,p+m*2),F=Math.max(n,w,u)+6,c=r.classList.contains("is-hidden")?w:Math.max(w,l),Be=Math.max(0,F-c),Re=Math.max(0,Math.round(Be/2));return Math.max(n,c+Re)}function $(){if(!document.documentElement)return;const e=he();document.documentElement.style.setProperty("--ww-safe-scroll-top-btn-bottom",`${Math.max(0,Math.round(e))}px`)}function h({withTrail:e=!1}={}){o.desktopDockOffsetRaf&&window.cancelAnimationFrame(o.desktopDockOffsetRaf),o.desktopDockOffsetRaf=window.requestAnimationFrame(()=>{o.desktopDockOffsetRaf=null,$()}),e&&(Z(),[70,150,240,340].forEach(t=>{const n=window.setTimeout(()=>{$()},t);o.desktopDockOffsetTrailTimers.push(n)}))}function ge(){if(typeof MutationObserver>"u")return()=>{};if(!document.body)return()=>{};let e=null;const t=()=>{const i=document.getElementById("mobileBottomDock");i!==o.observedDesktopDock&&(e&&(e.disconnect(),e=null),o.observedDesktopDock=i||null,i&&(e=new MutationObserver(()=>{h({withTrail:!0})}),e.observe(i,{attributes:!0,attributeFilter:["class","style","hidden"]})))},n=new MutationObserver(i=>{let r=!1;i.forEach(a=>{a.type==="attributes"&&a.target===document.body&&(r=!0),a.type==="childList"&&(r=!0)}),t(),r&&h({withTrail:!0})});return n.observe(document.body,{attributes:!0,attributeFilter:["class"],childList:!0}),t(),()=>{n.disconnect(),e&&e.disconnect(),o.observedDesktopDock=null}}function be(){if(o.desktopDockOffsetCleanup)return;const e=[],t=()=>{h({withTrail:!1})},n=()=>{h({withTrail:!0})},i=a=>{a.target&&a.target.id==="mobileBottomDock"&&n()},r=a=>{a.target&&a.target.id==="mobileBottomDock"&&t()};if(window.addEventListener("resize",n,{passive:!0}),e.push(()=>window.removeEventListener("resize",n)),window.addEventListener("orientationchange",n,{passive:!0}),e.push(()=>window.removeEventListener("orientationchange",n)),window.addEventListener("pageshow",n,{passive:!0}),e.push(()=>window.removeEventListener("pageshow",n)),document.addEventListener("scroll",t,{passive:!0,capture:!0}),e.push(()=>document.removeEventListener("scroll",t,!0)),document.addEventListener("transitionrun",i,!0),e.push(()=>document.removeEventListener("transitionrun",i,!0)),document.addEventListener("transitionstart",i,!0),e.push(()=>document.removeEventListener("transitionstart",i,!0)),document.addEventListener("transitionend",r,!0),e.push(()=>document.removeEventListener("transitionend",r,!0)),window.visualViewport){const a=()=>n(),s=()=>t();window.visualViewport.addEventListener("resize",a,{passive:!0}),e.push(()=>window.visualViewport.removeEventListener("resize",a)),window.visualViewport.addEventListener("scroll",s,{passive:!0}),e.push(()=>window.visualViewport.removeEventListener("scroll",s))}e.push(ge()),o.desktopDockOffsetCleanup=()=>{Z(),o.desktopDockOffsetRaf&&(window.cancelAnimationFrame(o.desktopDockOffsetRaf),o.desktopDockOffsetRaf=null),e.forEach(a=>{try{a()}catch(s){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",s,{line:1128})}}),o.desktopDockOffsetCleanup=null},h({withTrail:!0}),window.setTimeout(()=>h({withTrail:!0}),220),window.setTimeout(()=>h({withTrail:!0}),900)}function U(){o.launcher&&(o.launcher.style.removeProperty("bottom"),h({withTrail:!0}))}function ye(){U()}function ve(){if(o.launcher)return;const e=document.createElement("button");e.type="button",e.className="ww-help-launcher",e.setAttribute("aria-label","Otw\xF3rz pomoc i szybki start"),_(e,`
      <span class="ww-help-launcher__label">Pomoc</span>
    `,"tutorial:btn"),e.addEventListener("click",()=>{ze()}),document.body.appendChild(e),o.launcher=e,window.requestAnimationFrame(()=>{o.launcher&&(o.launcher.classList.add("ww-help-launcher--pulse"),window.clearTimeout(o.launcherPulseTimer),o.launcherPulseTimer=window.setTimeout(()=>{o.launcher&&o.launcher.classList.remove("ww-help-launcher--pulse")},8050))}),ye()}function ke(){if(o.overlay)return;const e='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><path d="M6 6L18 18M18 6L6 18"/></svg>',t='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>',n='<svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',i='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6 6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3"/><path d="M8 15v1a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-4"/><circle cx="20" cy="10" r="2"/></svg>',r='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><line x1="19" y1="8" x2="19" y2="14"/><line x1="22" y1="11" x2="16" y2="11"/></svg>',a='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>',s='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>',d='<svg viewBox="0 0 24 24" fill="none" stroke="#00838d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>',m='<svg viewBox="0 0 24 24" fill="none" stroke="#00838d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21.3 15.3a2.4 2.4 0 0 1 0 3.4l-2.6 2.6a2.4 2.4 0 0 1-3.4 0L2.7 8.7a2.4 2.4 0 0 1 0-3.4l2.6-2.6a2.4 2.4 0 0 1 3.4 0Z"/><path d="m14.5 12.5 2-2"/><path d="m11.5 9.5 2-2"/><path d="m8.5 6.5 2-2"/><path d="m17.5 15.5 2-2"/></svg>',p='<svg viewBox="0 0 24 24" fill="none" stroke="#00838d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 3h6l1 9H8Z"/><path d="M6.5 21a5.5 5.5 0 0 0 11 0c0-2-1.5-4-4-6H9c-2.5 2-4 4-4 6Z"/><line x1="12" y1="3" x2="12" y2="7"/></svg>',w='<svg viewBox="0 0 24 24" fill="none" stroke="#00838d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>',l='<svg viewBox="0 0 24 24" fill="none" stroke="#00838d" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="5" y="2" width="14" height="20" rx="2"/><rect x="2" y="7" width="6" height="13" rx="1"/><line x1="12" y1="18" x2="12" y2="18"/></svg>',u=document.createElement("div");u.className="ww-onboarding-overlay",_(u,`
      <section class="ww-onboarding-sheet" role="dialog" aria-modal="true" aria-labelledby="ww-onboarding-title">

        <!-- EKRAN 1: Powitalny -->
        <div class="ww-screen ww-screen--1 is-active">
          <div class="ww-welcome-head">
            <button type="button" class="ww-welcome-close ww-js-dismiss" aria-label="Zamknij">${e}</button>
            <div class="ww-welcome-brand">
              <img src="" alt="" class="ww-welcome-logo">
              <span>wagaiwzrost.pl</span>
            </div>
            <h2 id="ww-onboarding-title" class="ww-welcome-title">Witaj w aplikacji</h2>
            <p class="ww-welcome-subtitle">Centyle, wska\u017Aniki zdrowia i normy \u2014 dla dzieci i doros\u0142ych.</p>
          </div>
          <div class="ww-welcome-body">
            <button type="button" class="ww-pill-btn ww-btn-doctor-main ww-js-to-screen2">
              ${i} Jestem lekarzem
            </button>
            <div class="ww-btn-pair">
              <a href="subskrypcja.html" class="ww-pill-btn ww-btn-secondary">
                ${r} Zarejestruj si\u0119
              </a>
              <button type="button" class="ww-pill-btn ww-btn-secondary ww-js-login">
                ${a} Zaloguj si\u0119
              </button>
            </div>
            <button type="button" class="ww-pill-btn ww-btn-ghost-small ww-js-dismiss">
              Kontynuuj bez konta ${s}
            </button>
          </div>
        </div>

        <!-- EKRAN 2: PRO dla lekarzy -->
        <div class="ww-screen ww-screen--2">
          <div class="ww-pro-head">
            <button type="button" class="ww-pro-back ww-js-to-screen1" aria-label="Wr\xF3\u0107">${t}</button>
            <div>
              <p class="ww-pro-eyebrow">Plan PRO</p>
              <h2 class="ww-pro-title">Dla lekarzy i klinicyst\xF3w</h2>
            </div>
          </div>
          <div class="ww-pro-features">
            <div class="ww-pro-feature">
              <div class="ww-pro-feature-icon">${d}</div>
              <div><p class="ww-pro-feature-title">Wyniki profesjonalne z Z-score</p><p class="ww-pro-feature-desc">Odchylenie standardowe dla wagi, wzrostu i BMI.</p></div>
            </div>
            <div class="ww-pro-feature">
              <div class="ww-pro-feature-icon">${m}</div>
              <div><p class="ww-pro-feature-title">Siatki centylowe Palczewskiej</p><p class="ww-pro-feature-desc">Polskie siatki referencyjne dla dzieci 0\u201318 lat.</p></div>
            </div>
            <div class="ww-pro-feature">
              <div class="ww-pro-feature-icon">${p}</div>
              <div><p class="ww-pro-feature-title">Modu\u0142y kliniczne DocPro</p><p class="ww-pro-feature-desc">Testy GH, OGTT, ACTH, TRH i antybiotykoterapia.</p></div>
            </div>
            <div class="ww-pro-feature">
              <div class="ww-pro-feature-icon">${w}</div>
              <div><p class="ww-pro-feature-title">Zaszyfrowany vault pacjent\xF3w</p><p class="ww-pro-feature-desc">Historia pomiar\xF3w z szyfrowaniem AES-256.</p></div>
            </div>
            <div class="ww-pro-feature">
              <div class="ww-pro-feature-icon">${l}</div>
              <div><p class="ww-pro-feature-title">Synchronizacja mi\u0119dzy urz\u0105dzeniami</p><p class="ww-pro-feature-desc">Dane dost\u0119pne na telefonie, tablecie i komputerze.</p></div>
            </div>
          </div>
          <div class="ww-pro-footer">
            <a href="subskrypcja.html" class="ww-pill-btn ww-btn-doctor-main">
              ${r} Zarejestruj si\u0119 \u2014 30 dni PRO gratis
            </a>
            <button type="button" class="ww-pill-btn ww-btn-ghost-small ww-js-login">
              Mam ju\u017C konto \u2014 zaloguj mnie
            </button>
          </div>
        </div>

      </section>
    `,"tutorial:overlay");function W(c){u.querySelector(".ww-screen--1").classList.toggle("is-active",c===1),u.querySelector(".ww-screen--2").classList.toggle("is-active",c===2)}u.querySelectorAll(".ww-js-to-screen2").forEach(c=>{c.addEventListener("click",()=>W(2))}),u.querySelectorAll(".ww-js-to-screen1").forEach(c=>{c.addEventListener("click",()=>W(1))}),u.querySelectorAll(".ww-js-dismiss").forEach(c=>{c.addEventListener("click",()=>k({showLauncherHint:!0}))});function F(){k();try{const c=window.VildaAuthUI;if(!c)return;if(typeof c.isGuestMode=="function"&&c.isGuestMode()&&typeof c.exitGuestMode=="function"){c.exitGuestMode();return}if(typeof c.showStartupScreen=="function"){c.showStartupScreen();return}}catch(c){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",c,{fn:"triggerLogin"})}}u.querySelectorAll(".ww-js-login").forEach(c=>{c.addEventListener("click",F)}),u.addEventListener("click",c=>{c.target===u&&k({showLauncherHint:!0})}),document.addEventListener("keydown",c=>{c.key==="Escape"&&o.helpVisible&&k()});try{const c=u.querySelector(".ww-welcome-logo");c&&(c.src=new URL("pwa-icons/icon-192x192.png",window.location.href).href)}catch{}o.overlay=u,o.sheet=u.querySelector(".ww-onboarding-sheet"),o.primaryBtn=u.querySelector(".ww-btn-doctor-main"),o.dynamicTitle=null,o.dynamicText=null,o.dynamicList=null,o.selectionNote=null,o.secondaryLink=null,document.body.appendChild(u)}function K(){return o.page==="docpro"?[{id:"doctor",cardTitle:"Jestem lekarzem",cardDescription:"Strona g\u0142\xF3wna pozostaje dost\u0119pna do kalkulator\xF3w i rozszerzonych wynik\xF3w. Modu\u0142y oraz materia\u0142y DocPro s\u0105 dost\u0119pne po weryfikacji numeru PWZ.",panelTitle:"Jak rozpocz\u0105\u0107 prac\u0119 w DocPro?",panelText:"DocPro udost\u0119pnia modu\u0142y i materia\u0142y profesjonalne po weryfikacji numeru PWZ. Na stronie g\u0142\xF3wnej mo\u017Cesz r\xF3wnolegle korzysta\u0107 z kalkulator\xF3w i rozszerzonych wynik\xF3w po w\u0142\u0105czeniu \u201EWynik\xF3w profesjonalnych\u201D w karcie \u201ECentyle, BMI & Basal Metabolic Rate\u201D.",steps:["Wpisz numer prawa wykonywania zawodu lekarza, aby potwierdzi\u0107 dost\u0119p do DocPro.","Po weryfikacji uzupe\u0142nij podstawowe dane pacjenta.","Na stronie g\u0142\xF3wnej mo\u017Cesz dodatkowo korzysta\u0107 z kalkulator\xF3w i \u201EWynik\xF3w profesjonalnych\u201D w karcie \u201ECentyle, BMI & Basal Metabolic Rate\u201D."],primaryLabel:"Przejd\u017A do weryfikacji PWZ",action:()=>{I("doctor"),D("#pwzNumber",1800,e=>{x(e,{message:"Tutaj rozpoczniesz weryfikacj\u0119 numeru PWZ."})})}},{id:"personal",cardTitle:"Korzystam prywatnie",cardDescription:"Podstawowe obliczenia i wyniki znajdziesz na stronie g\u0142\xF3wnej aplikacji.",panelTitle:"Przejd\u017A do strony g\u0142\xF3wnej",panelText:"Na stronie g\u0142\xF3wnej wpiszesz wiek, wag\u0119 i wzrost, a wyniki pojawi\u0105 si\u0119 automatycznie pod formularzem.",steps:["Otw\xF3rz stron\u0119 g\u0142\xF3wn\u0105 aplikacji.","Wpisz wiek, wag\u0119 i wzrost.","Sprawd\u017A wyniki pod formularzem."],primaryLabel:"Otw\xF3rz stron\u0119 g\u0142\xF3wn\u0105",action:()=>{window.location.href="index.html"}}]:[{id:"personal",cardTitle:"Korzystam prywatnie",cardDescription:"Wprowad\u017A dane, sprawd\u017A wyniki i por\xF3wnuj zapisane pomiary.",panelTitle:"Jak zacz\u0105\u0107?",panelText:"Wpisz wiek, wag\u0119 i wzrost. Wyniki pojawi\u0105 si\u0119 automatycznie poni\u017Cej formularza.",steps:["Wpisz wiek, wag\u0119 i wzrost.","Sprawd\u017A wyniki wy\u015Bwietlone pod formularzem.","Aby wr\xF3ci\u0107 do wcze\u015Bniejszych pomiar\xF3w, zapisz dane i wczytaj je ponownie."],primaryLabel:"Przejd\u017A do formularza",action:()=>{E("personal",{ensureGuide:!0})}},{id:"doctor",cardTitle:"Jestem lekarzem",cardDescription:"Na stronie g\u0142\xF3wnej mo\u017Cesz wprowadzi\u0107 dane pacjenta, korzysta\u0107 z kalkulator\xF3w i podsumowa\u0144, a po wy\u015Bwietleniu wynik\xF3w w\u0142\u0105czy\u0107 \u201EWyniki profesjonalne\u201D. Modu\u0142y DocPro s\u0105 dost\u0119pne po weryfikacji numeru PWZ.",panelTitle:"Jak korzysta\u0107 z aplikacji jako lekarz?",panelText:"Na stronie g\u0142\xF3wnej wprowadzisz dane pacjenta i skorzystasz z kalkulator\xF3w oraz podsumowa\u0144. Po wy\u015Bwietleniu wynik\xF3w mo\u017Cesz w karcie \u201ECentyle, BMI & Basal Metabolic Rate\u201D w\u0142\u0105czy\u0107 \u201EWyniki profesjonalne\u201D. Modu\u0142y i materia\u0142y DocPro s\u0105 dost\u0119pne po weryfikacji numeru PWZ.",steps:["Na stronie g\u0142\xF3wnej wprowad\u017A dane pacjenta i korzystaj z kalkulator\xF3w oraz podsumowa\u0144.","Po wy\u015Bwietleniu wynik\xF3w prze\u0142\u0105cz kart\u0119 \u201ECentyle, BMI & Basal Metabolic Rate\u201D na \u201EWyniki profesjonalne\u201D.","Aby otworzy\u0107 modu\u0142y i materia\u0142y DocPro, przejd\u017A do DocPro i potwierd\u017A numer PWZ."],primaryLabel:"Wprowad\u017A dane pacjenta",action:()=>{E("doctor",{ensureGuide:!0})}}]}function xe(e){return K().find(t=>t.id===e)||K()[0]}function Ie(e){if(o.role=e,le(e),!o.overlay)return;o.overlay.querySelectorAll(".ww-role-card").forEach(s=>{const d=s.dataset.role===e;s.classList.toggle("is-selected",d),s.setAttribute("aria-pressed",String(d));const m=s.querySelector(".ww-role-card__hint");m&&(m.textContent=d?"Wybrano":"Kliknij, aby wybra\u0107")});const t=xe(e),n=o.page==="docpro"?"Wybierz spos\xF3b korzystania z DocPro":"Wybierz spos\xF3b korzystania z aplikacji",i=(o.page==="docpro","Wybierz odpowiedni\u0105 \u015Bcie\u017Ck\u0119 i przejd\u017A dalej."),r=o.overlay.querySelector(".ww-onboarding-title"),a=o.overlay.querySelector(".ww-onboarding-subtitle");r&&(r.textContent=n),a&&(a.textContent=i),o.selectionNote&&(o.selectionNote.textContent=`Wybrano: ${t.cardTitle}. Kliknij inn\u0105 kart\u0119, aby zaktualizowa\u0107 instrukcj\u0119 poni\u017Cej.`),o.dynamicTitle.textContent=t.panelTitle,o.dynamicText.textContent=t.panelText,j(o.dynamicList),t.steps.forEach(s=>{const d=document.createElement("li");d.textContent=s,o.dynamicList.appendChild(d)}),o.primaryBtn.textContent=t.primaryLabel,o.primaryBtn.onclick=s=>{s&&(s.preventDefault(),s.stopPropagation()),k(),t.action()}}function ze(){ke(),o.overlay.classList.add("is-open"),o.helpVisible=!0,requestAnimationFrame(()=>{const e=o.overlay.querySelector(".ww-role-card.is-selected")||o.primaryBtn;try{e&&e.focus()}catch(t){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",t,{line:1413})}})}function k({showLauncherHint:e=!1,renderInlineGuide:t=!1}={}){o.overlay&&(o.overlay.classList.remove("is-open"),o.helpVisible=!1,t&&o.role&&I(o.role),e&&C(f.launcherHint)!=="true"&&(S(f.launcherHint,"true"),J("Pomoc mo\u017Cesz otworzy\u0107 ponownie przyciskiem \u201EPomoc\u201D.")))}function J(e){if(e){if(!o.toast){const t=document.createElement("div");t.className="ww-toast",document.body.appendChild(t),o.toast=t}o.toast.textContent=e,o.toast.classList.add("is-visible"),window.clearTimeout(o.toastTimer),o.toastTimer=window.setTimeout(()=>{o.toast&&o.toast.classList.remove("is-visible")},2600)}}function Y(){return window.visualViewport&&Number.isFinite(window.visualViewport.height)?window.visualViewport.height:window.innerHeight||document.documentElement.clientHeight||document.body.clientHeight||0}function X(){return window.pageYOffset||document.documentElement.scrollTop||document.body.scrollTop||0}function je(){const e=document.activeElement;if(!e||!(e instanceof Element)||!e.matches("input, select, textarea"))return!1;try{return e.blur(),!0}catch{return!1}}function L(e=0){const t=()=>{if(!z())return;if(typeof window.__vildaDockSyncMode=="function")try{window.__vildaDockSyncMode({preserveVisibility:!1});return}catch(i){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",i,{line:1479})}if(typeof window.__vildaDockUpdate=="function")try{window.__vildaDockUpdate("browser-ui-resize")}catch(i){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",i,{line:1487})}const n=document.getElementById("mobileBottomDock");n&&(n.classList.remove("is-keyboard-hidden"),n.classList.remove("is-hidden"),document.body.classList.add("has-mobile-bottom-dock-visible"))};if(e>0){window.setTimeout(t,e);return}t()}function Te(){let e=16;try{const t=document.querySelector("header");if(t){const n=window.getComputedStyle(t);if(n.position==="sticky"||n.position==="fixed"){const i=t.getBoundingClientRect();i.height>0&&i.top<=0&&(e+=Math.ceil(i.height)+8)}}}catch(t){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",t,{line:1522})}return e}function Q(e,{smooth:t=!0}={}){const n=Math.max(0,Number.isFinite(e)?e:0),i=!!(window.matchMedia&&window.matchMedia("(prefers-reduced-motion: reduce)").matches),r=t&&!i?"smooth":"auto";try{window.scrollTo({top:n,left:0,behavior:r})}catch{try{window.scrollTo(0,n)}catch(d){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",d,{line:1537})}}const a=document.scrollingElement||document.documentElement||document.body;a&&typeof a.scrollTop=="number"&&(a.scrollTop=n),document.documentElement&&typeof document.documentElement.scrollTop=="number"&&(document.documentElement.scrollTop=n),document.body&&typeof document.body.scrollTop=="number"&&(document.body.scrollTop=n)}function ee(e){return!e||typeof e.closest!="function"?e:e.matches("input, select, textarea")?e.closest("label")||e:e.closest(".card, fieldset")||e}function te(e,{block:t="center",offset:n=null}={}){const i=ee(e);if(!i)return 0;const r=i.getBoundingClientRect(),a=Math.max(Y(),1),s=X(),d=Math.max(Te(),Number.isFinite(n)?n:0);if(t==="start")return s+r.top-d;const m=Math.max(r.height||0,1),p=Math.min(m,Math.max(48,a-d*2)),w=Math.max(d,(a-p)/2);return s+r.top-w}function Ce(e,{block:t="center",offset:n=null}={}){const i=ee(e);if(!i)return;if(!z()&&typeof i.scrollIntoView=="function")try{i.scrollIntoView({behavior:"smooth",block:t,inline:"nearest"});return}catch(s){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",s,{line:1588})}const r=te(i,{block:t,offset:n});Q(r,{smooth:!0});const a=()=>{const s=te(i,{block:t,offset:n});Math.abs(s-X())>2&&Q(s,{smooth:!1})};window.requestAnimationFrame(a),window.setTimeout(a,180)}function x(e,{message:t="",block:n="center",offset:i=null,focusEditable:r=!0,preserveDock:a=!1}={}){if(!e)return;const s=a&&z();s&&je();const d=e.matches("input, select, textarea")?e:e.querySelector("input, select, textarea");Ce(e,{block:n,offset:i}),e.classList.remove("ww-soft-focus"),e.offsetWidth,e.classList.add("ww-soft-focus"),window.setTimeout(()=>{e.classList.remove("ww-soft-focus")},2200),r&&d&&typeof d.focus=="function"&&window.setTimeout(()=>{try{d.focus({preventScroll:!0})}catch{try{d.focus()}catch(p){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",p,{line:1641})}}},260),t&&J(t),s&&(L(),window.requestAnimationFrame(()=>L()),L(180),L(520))}function z(){try{const e=document.getElementById("calcForm");if(e){const t=e.querySelectorAll(":scope > .half");if(t.length>=2){const n=t[0].getBoundingClientRect(),i=t[1].getBoundingClientRect();if(Math.abs(n.top-i.top)>24)return!0}}return window.matchMedia("(max-width: 700px)").matches}catch{return(window.innerWidth||0)<=700}}function Se(e){return String(e||"").replace(/ /g," ").replace(/\s+/g," ").trim()}function Le(e){if(o.page!=="home"||!e||!z()||e.dataset.wwGuideEmbedded==="true"||e.classList.contains("ww-compare-guide-host"))return!1;const t=Se(e.textContent);return t?t.includes("Uzupe\u0142nij wymagane pola")&&t.includes("podaj imi\u0119")&&t.includes("pojawi si\u0119 por\xF3wnanie aktualnych danych z poprzednimi"):!1}function oe(){const e=document.getElementById("compareInstruction");if(!e)return;const t=Le(e);e.classList.toggle("ww-compare-instruction-suppressed",t)}function g(){const e=()=>{oe()};window.clearTimeout(o.compareInstructionSyncTimer),e(),window.requestAnimationFrame(e),o.compareInstructionSyncTimer=window.setTimeout(e,140)}function Ee(){if(o.page!=="home"||o.compareInstructionStateCleanup)return;const e=document.getElementById("compareInstruction");if(!e)return;const t=[];if(typeof MutationObserver<"u"){const i=new MutationObserver(()=>{g()});i.observe(e,{subtree:!0,childList:!0,characterData:!0,attributes:!0,attributeFilter:["class","style","hidden","data-ww-guide-embedded"]}),t.push(()=>i.disconnect())}const n=()=>{g()};window.addEventListener("resize",n),t.push(()=>window.removeEventListener("resize",n)),window.addEventListener("orientationchange",n),t.push(()=>window.removeEventListener("orientationchange",n)),o.compareInstructionStateCleanup=()=>{t.forEach(i=>{try{i()}catch(r){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",r,{line:1757})}})},g(),window.setTimeout(g,260)}function De(){const e=[{selector:"#age",label:"wiek"},{selector:"#weight",label:"wag\u0119"},{selector:"#height",label:"wzrost"}];for(const t of e){const n=document.querySelector(t.selector);if(!n||!y(n))continue;if(!(typeof n.value=="string"?n.value.trim():String(n.value??"").trim()))return{...t,element:n}}return null}function _e(e,t){return e==="doctor"?`Uzupe\u0142nij pole \u201E${t}\u201D, aby przej\u015B\u0107 dalej do wynik\xF3w pacjenta.`:`Uzupe\u0142nij pole \u201E${t}\u201D, aby wy\u015Bwietli\u0107 wyniki.`}function E(e,{ensureGuide:t=!1}={}){const n=()=>{if(Me(e))return;const i=e==="doctor"?"Wprowad\u017A dane pacjenta, aby wy\u015Bwietli\u0107 wyniki i w razie potrzeby prze\u0142\u0105czy\u0107 na \u201EWyniki profesjonalne\u201D.":"Zacznij od wieku, a nast\u0119pnie wpisz wag\u0119 i wzrost.";D("#age",1200,r=>{x(r,{message:i,block:"start",offset:16})})};if(t){I(e),window.requestAnimationFrame(n);return}n()}function Me(e){if(!z())return!1;const t=De();return t&&t.element?(x(t.element,{message:_e(e,t.label),block:"start",offset:16,focusEditable:!1,preserveDock:!0}),!0):(D(e==="doctor"?"#bmiCard":"#results",1200,i=>{x(i,{block:"start",offset:16,preserveDock:!0,message:e==="doctor"?"Dane s\u0105 ju\u017C kompletne. Wyniki i prze\u0142\u0105cznik \u201EWyniki profesjonalne\u201D znajdziesz poni\u017Cej formularza.":"Dane s\u0105 ju\u017C kompletne. Wyniki znajdziesz poni\u017Cej formularza."})}),!0)}function D(e,t,n){const i=Date.now(),r=()=>{const a=document.querySelector(e);if(a&&y(a)){n(a);return}if(Date.now()-i>t){const s=document.querySelector(e);s&&n(s);return}window.setTimeout(r,120)};r()}function ne(){typeof o.formGuideAutoDismissCleanup=="function"&&(o.formGuideAutoDismissCleanup(),o.formGuideAutoDismissCleanup=null)}function R({restoreInfoCard:e=!0}={}){const t=document.getElementById("wwInlineGuide");t&&t.remove(),ne();const n=document.getElementById("infoMessages");n&&n.classList.remove("ww-info-card-has-guide");const i=document.getElementById("compareInstruction");if(i){if(i.dataset.wwGuideEmbedded==="true"&&(i.classList.remove("ww-compare-guide-host"),delete i.dataset.wwGuideEmbedded,e)){const r=M.get(i)||[];r.length?re(i,r,"tutorial:compareInstruction"):j(i);const a=i.dataset.wwOriginalInlineDisplay||"";if(a?i.style.display=a:i.style.removeProperty("display"),typeof window.updateCompareInstructionVisibility=="function")try{window.updateCompareInstructionVisibility()}catch(s){typeof globalThis<"u"&&typeof globalThis.vildaLogSwallowedCatch=="function"&&globalThis.vildaLogSwallowedCatch("tutorial.js",s,{line:1901})}}g()}}function Pe(){ne();const e=document.getElementById("calcForm");if(!e)return;const t=n=>{const i=n.target;!i||!(i instanceof Element)||document.getElementById("wwInlineGuide")&&i.closest("#calcForm")&&R()};e.addEventListener("input",t,!0),e.addEventListener("change",t,!0),o.formGuideAutoDismissCleanup=()=>{e.removeEventListener("input",t,!0),e.removeEventListener("change",t,!0)}}function O(e){R();const t=document.createElement("section");t.id="wwInlineGuide",t.className=e.embedInInfoCard?"ww-inline-guide ww-inline-guide--embedded":"card ww-inline-guide";const n=document.createElement("div");n.className="ww-inline-guide__head";const i=document.createElement("div"),r=document.createElement("h3");r.className="ww-inline-guide__title",r.textContent=e.title;const a=document.createElement("p");a.className="ww-inline-guide__desc",a.textContent=e.description,i.appendChild(r),i.appendChild(a);const s=document.createElement("button");s.type="button",s.className="ww-inline-guide__close",s.setAttribute("aria-label","Ukryj szybki start"),_(s,de(),"tutorial:closeBtn"),s.addEventListener("click",()=>R()),n.appendChild(i),n.appendChild(s);const d=document.createElement("ol");d.className="ww-inline-guide__list",e.steps.forEach(w=>{const l=document.createElement("li");l.textContent=w,d.appendChild(l)});const m=document.createElement("div");if(m.className="ww-inline-guide__actions",e.actions.forEach(w=>{let l;w.type==="link"?(l=document.createElement("a"),l.href=w.href,l.className="ww-link-btn",l.textContent=w.label):(l=document.createElement("button"),l.type="button",l.className=`ww-btn ${w.variant==="ghost"?"ww-btn--ghost":"ww-btn--primary"}`,l.textContent=w.label,l.addEventListener("click",u=>{u.preventDefault(),u.stopPropagation(),typeof w.onClick=="function"&&w.onClick(u)})),m.appendChild(l)}),t.appendChild(n),t.appendChild(d),t.appendChild(m),e.embedInInfoCard){const w=document.getElementById("infoMessages"),l=document.getElementById("compareInstruction");if(w&&l){M.has(l)||M.set(l,l.childNodes?Array.prototype.slice.call(l.childNodes).map(function(u){return u.cloneNode(!0)}):[]),Object.prototype.hasOwnProperty.call(l.dataset,"wwOriginalInlineDisplay")||(l.dataset.wwOriginalInlineDisplay=l.style.display||""),w.classList.add("ww-info-card-has-guide"),l.classList.add("ww-compare-guide-host"),l.dataset.wwGuideEmbedded="true",l.style.display="block",j(l),l.appendChild(t),e.dismissOnFormInteraction&&Pe(),g();return}}const p=document.querySelector(e.anchorSelector);!p||!p.parentNode||(e.position==="beforebegin"?p.parentNode.insertBefore(t,p):e.position==="afterbegin"?p.insertBefore(t,p.firstChild):p.insertAdjacentElement("afterend",t),g())}function I(e){if(o.page==="docpro"&&e==="doctor"){O({anchorSelector:"#doctorContainer",position:"afterend",title:"DocPro \u2014 dost\u0119p profesjonalny",description:"Po weryfikacji numeru PWZ uzyskasz dost\u0119p do materia\u0142\xF3w i modu\u0142\xF3w DocPro. Na stronie g\u0142\xF3wnej mo\u017Cesz nadal korzysta\u0107 z kalkulator\xF3w oraz \u201EWynik\xF3w profesjonalnych\u201D.",steps:["Wpisz numer PWZ, aby potwierdzi\u0107 uprawnienia i odblokowa\u0107 DocPro.","Po weryfikacji uzupe\u0142nij podstawowe dane pacjenta.","Na stronie g\u0142\xF3wnej w karcie \u201ECentyle, BMI & Basal Metabolic Rate\u201D mo\u017Cesz w\u0142\u0105czy\u0107 \u201EWyniki profesjonalne\u201D dla rozszerzonych wynik\xF3w."],actions:[{type:"button",label:"Wpisz PWZ",onClick:()=>{D("#pwzNumber",1800,t=>{x(t,{message:"Po weryfikacji PWZ odblokujesz tre\u015Bci i modu\u0142y DocPro."})})}},{type:"link",href:"index.html",label:"Strona g\u0142\xF3wna"},{type:"link",href:"instrukcja.html",label:"Pe\u0142na instrukcja"}]});return}if(o.page==="home"&&e==="doctor"){O({embedInInfoCard:!0,dismissOnFormInteraction:!0,title:"Strona g\u0142\xF3wna dla lekarza",description:"Na stronie g\u0142\xF3wnej wprowadzisz dane pacjenta i skorzystasz z kalkulator\xF3w oraz podsumowa\u0144. Po wy\u015Bwietleniu wynik\xF3w mo\u017Cesz w\u0142\u0105czy\u0107 \u201EWyniki profesjonalne\u201D, a modu\u0142y DocPro s\u0105 dost\u0119pne po weryfikacji numeru PWZ.",steps:["Wprowad\u017A dane pacjenta na stronie g\u0142\xF3wnej.","Po wy\u015Bwietleniu wynik\xF3w prze\u0142\u0105cz kart\u0119 \u201ECentyle, BMI & Basal Metabolic Rate\u201D na \u201EWyniki profesjonalne\u201D.","Gdy potrzebujesz materia\u0142\xF3w i modu\u0142\xF3w DocPro, przejd\u017A do DocPro i potwierd\u017A numer PWZ."],actions:[{type:"button",label:"Wprowad\u017A dane pacjenta",onClick:()=>{E("doctor")}},{type:"link",href:"docpro.html",label:"Otw\xF3rz DocPro"},{type:"link",href:"instrukcja.html",label:"Pe\u0142na instrukcja"}]});return}o.page==="home"&&e==="personal"&&O({embedInInfoCard:!0,dismissOnFormInteraction:!0,title:"Pierwsze kroki",description:"Uzupe\u0142nij formularz i sprawd\u017A wyniki pod nim.",steps:["Wpisz wiek, wag\u0119 i wzrost.","Wyniki pojawi\u0105 si\u0119 automatycznie pod formularzem.","Aby por\xF3wna\u0107 wcze\u015Bniejsze pomiary, zapisz dane i wczytaj je ponownie."],actions:[{type:"button",label:"Uzupe\u0142nij dane",onClick:()=>{E("personal")}},{type:"link",href:"instrukcja.html",label:"Pe\u0142na instrukcja"},{type:"link",href:"docpro.html",label:"DocPro dla lekarzy"}]})}function A(){o.started||(o.started=!0,ce(),se()&&ve(),pe(),Ee(),be(),q(),oe(),h({withTrail:!0}))}function ie(){const e=()=>{const t=document.getElementById("consent-banner");if(!t||!y(t)){A();return}const n=a=>{const s=a.target;!s||!s.id||(s.id==="consent-accept"||s.id==="consent-decline")&&(document.removeEventListener("click",n),window.setTimeout(A,50))};document.addEventListener("click",n);let i=0;const r=()=>{if(!o.started){if(!y(t)){document.removeEventListener("click",n),A();return}i+=1,i<30&&window.setTimeout(r,250)}};r()};typeof window.vildaOnReady=="function"?window.vildaOnReady("tutorial:boot",e):document.readyState==="loading"?document.addEventListener("DOMContentLoaded",e,{once:!0}):e()}typeof window.vildaSafeInit=="function"?window.vildaSafeInit("tutorial:init",ie):ie()})();
