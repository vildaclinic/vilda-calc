# Icons

The app's icon system is Lucide (ISC licence, some Feather-derived icons MIT; the licence text is in the repository's `THIRD_PARTY_NOTICES.md`). Pages load `lucide.min.js` and mark an element `data-lucide="<name>"`; the chrome, sidebar and drawer inline the same 24-grid glyphs as `<svg>` with `stroke="currentColor"`.

This group holds the 65 icons the app actually uses, extracted from the bundled Lucide file. Four sidebar glyphs (`calendar`, `settings`, `save`, `sticky-note`) are hand-drawn inline in `vilda_chrome.js` and are not part of this set. Each file is the 24 × 24 grid, stroke width 2, round caps and joins, no fill. Ink: the files are single-ink and carry `primary` (#00838d) as their stroke, because an `<img>` cannot inherit `color`; in the app the glyphs take the text colour of their parent (`primary` in the sidebar and chrome, `text` in body copy, white on the active dock tile).

Sizes the app draws them at: 18 px in sidebar links (22 × 22 slot), 22 px in the hamburger and drawer icons, 16 px in chrome chips and drawer actions, 14 px in inline meta text, 17 px for the card icon in the patient chip, 1.2 rem in the mobile dock (`.mobile-bottom-dock__icon`), 20 px in `.btn-icon`, 1 rem inside marketing badges and chips. One drawer action uses stroke width 2.4 for emphasis; everything else keeps 2.

Most-used names, in order of frequency: play, stethoscope, activity, book-open, arrow-up, zap, eraser, chevron-left, calculator, syringe, mail, file-text, eye, arrow-right, x-circle, sliders-horizontal, home. Status glyphs are icons, never emoji: `triangle-alert` for warnings, `x-circle` for errors, `check` and `shield-check` for confirmed states, `info` for hints.

Rules: pick from this set before adding a new Lucide icon; never mix in another icon family or emoji; keep stroke width 2 and the round caps; pair every icon that carries meaning with text or an `aria-label`.
