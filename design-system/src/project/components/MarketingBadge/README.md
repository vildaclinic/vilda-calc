# MarketingBadge

Odznaki i pigułki stron informacyjnych (O aplikacji, Kontakt, Instrukcja, Subskrypcja): promień 999px, waga 700–800, ikona Lucide 1rem z odstępem `.45rem`; domyślnie półprzezroczysta biel z bladym turkusowym obrysem `rgba(0,168,181,.16)` i cieniem `0 8px 24px rgba(15,45,42,.05)`, a warianty z 12% turkusem, 7% bursztynem, tintem fioletu lub pełnym gradientem.

## Kiedy używać

Do nieklikalnych wyróżnień w hero i w treści marketingowej: cechy aplikacji (`.about-badge`), tematy strony kontaktu (`.contact-badge`), nazwa pola w tekście (`.inline-label`), zastrzeżenia „czego aplikacja nie robi” (`.disclaimer-chip`), oznaczenie modułu PRO w nagłówku (`.pro-tag`), kicker roli autora (`.contact-kicker`), odbiorca modułu instrukcji (`.guide-module-badge-*`), licznik modułów (`.guide-tile-count`), pigułka promocyjna hero subskrypcji (`.sub-hero__pill`) i wstęga „Polecany” na karcie planu (`.sub-plan__badge`). Do chipów w kartach klinicznych użyj Chip, do stron edukacyjnych EduChip.

## Co dostarcza konsument

- Strona „O aplikacji” wymaga `body.about-page` (reguły są zagnieżdżone pod `.about-page`), strona kontaktu `.contact-page`. Odznaki instrukcji i subskrypcji są bezkontekstowe.
- `.about-badges` / `.contact-badges` → `<span class="about-badge|contact-badge"><span class="sidebar-icon">[SVG]</span> Tekst</span>`; `.about-chip-list` → `.about-chip` (ta sama reguła co `.about-badge`). Kontener `.sidebar-icon` ma 1rem×1rem, SVG wypełnia 100%.
- `.inline-label` to `<span>` w zdaniu (`nowrap`, `padding:.14rem .45rem`); `.pro-tag` to `<span>` na końcu `<h2>` (`vertical-align:middle`, `margin-left:.35rem`).
- `.disclaimer-chips` → `.disclaimer-chip` z ikoną `x-circle` 13px w kolorze `#c2410c`.
- `.contact-kicker` to `<p>` z ikoną i `<span>`; ma `margin:0 0 .9rem`.
- `.guide-module-meta` → `.guide-module-badge` z modyfikatorem `-user | -doctor | -shared` (skrypt wstawia `guide-module-badge-${audienceType}`); `.guide-tile-count` stoi obok tytułu kafelka.
- `.sub-plan__badge` jest pozycjonowana absolutnie (`top:-13px`, wyśrodkowana) — rodzic (`.sub-plan`) musi mieć `position:relative`; podgląd daje mu własną ramkę.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.about-page .about-badge`, `.about-chip` | `inline-flex`, `gap:.45rem`, `padding:.5rem .8rem`, tło `rgba(255,255,255,.88)`, obrys `1px solid rgba(0,168,181,.16)`, tekst `#0f4b48` 700, cień `0 8px 24px rgba(15,45,42,.05)`, `transition` transform/box-shadow .2s. |
| `.about-badge:hover`, `.about-chip:hover` | `translateY(-1px)`, cień `0 12px 24px rgba(15,45,42,.08)`. |
| `.about-page .inline-label` | `padding:.14rem .45rem`, tło `rgba(0,168,181,.12)`, obrys `rgba(0,168,181,.22)`, tekst `#0a6261` 700, `nowrap`. |
| `.about-page .disclaimer-chip` | Promień 100px, `padding:.28rem .8rem .28rem .6rem`, tło `rgba(180,83,9,.07)`, obrys `rgba(180,83,9,.18)`, tekst `#92400e` .79rem/500, ikona 13px `#c2410c`. |
| `.about-page .pro-tag` | Gradient `135deg #0284c7→#0891b2`, biały .72rem/700, `letter-spacing:.06em`, `padding:.22rem .65rem`, promień 100px. |
| `.contact-page .contact-badge` | `padding:.52rem .82rem`, tło `--contact-badge-bg`, obrys `1px solid --contact-badge-border`, tekst `--contact-text-action`, cień `--contact-card-shadow`, `backdrop-filter:--contact-control-backdrop`. |
| `.contact-page .contact-kicker` | `padding:.38rem .7rem`, tło `--contact-pill-bg`, obrys `--contact-pill-border`, tekst `--contact-pill-text` .88rem/800, cień `--contact-card-shadow`. |
| `.guide-module-badge` | `min-height:1.7rem`, `padding:.22rem .62rem`, .76rem/800, `letter-spacing:.01em`, biel, obrys `rgba(0,131,141,.14)`, tekst `#31585b`. |
| `.guide-module-badge-user` / `-doctor` / `-shared` | `rgba(0,176,166,.08)`/`#0b6b72`; `rgba(153,0,255,.08)`/`#7b2cbf`; `rgba(0,131,141,.06)`/`#31585b`. |
| `.guide-tile-count` | `min-height:2rem`, `padding:.28rem .65rem`, biel, obrys `rgba(0,131,141,.15)`, tekst `primary` .82rem/800. |
| `.sub-hero__pill` | Tło `--pro-light`, tekst `--pro-dark`, obrys `--pro-border`, .78rem/700 wersaliki `.03em`, `padding:.28rem .9rem`, `::before` „★” .7rem. |
| `.sub-plan__badge` | `position:absolute; top:-13px; left:50%; translateX(-50%)`, gradient `90deg --pro-dark→--pro-color`, biały .72rem/700 wersaliki `.07em`, cień `0 2px 8px rgba(153,0,255,.35)`. |
| `≤640px` | `.about-badge`, `.about-chip`, `.contact-badge` → `width:100%; justify-content:center`. |
| Wysoki kontrast (`body.about-page.high-contrast-level-N.liquid-ios26`) | `.about-badge`, `.about-chip`, `.inline-label`: tło `--hc-button-bg`, tekst `--hc-text`, obrys `--hc-card-border-width solid --hc-input-border`, cień `0 6px 18px #0000000f`, bez `backdrop-filter` (`!important`). |
| Wysoki kontrast (`body.high-contrast-level-N.liquid-ios26`) | `.guide-module-badge`, `.guide-tile-count`: tło `--hc-button-bg`, obrys `--hc-input-border`, cień `0 4px 12px #0000000f`; `.guide-module-badge` tekst `--hc-muted`; `-user` `#00b0a61f`/`#0b5e65`, `-doctor` `#9900ff1a`/`#5f3388`, `-shared` `#00838d14` obrys `#07363e2e`. |
| Wysoki kontrast / szkło (tokeny) | `.contact-*` przez `--contact-badge-bg` (`.82` light → `.96` glass-4 → `--hc-button-bg`), `--contact-badge-border`→`--hc-input-border`, `--contact-card-shadow`. `.sub-*` przez `--pro-*`. |

Szkło (`.liquid-ios26`) nie ma własnych reguł; `.contact-*` mają `backdrop-filter` z tokenu. Ciemne tło: brak reguł.

## Tokeny

`--primary`, `--pro-light`, `--pro-dark`, `--pro-color`, `--pro-border`, `--contact-badge-bg`, `--contact-badge-border`, `--contact-text-action`, `--contact-card-shadow`, `--contact-control-backdrop`, `--contact-pill-bg`, `--contact-pill-border`, `--contact-pill-text`; w wysokim kontraście `--hc-button-bg`, `--hc-text`, `--hc-muted`, `--hc-card-border-width`, `--hc-input-border`. Literały: `#0f4b48`, `#0a6261`, `#92400e`, `#c2410c`, `#0284c7`, `#0891b2`, `#31585b`, `#0b6b72`, `#7b2cbf`.

## Zasady

- Rób: ikona + tekst w `.about-badge`/`.contact-badge`/`.disclaimer-chip`; sam kolor (bursztyn zastrzeżeń, fiolet PRO) nie niesie znaczenia.
- Rób: `.inline-label` tylko dla dosłownych nazw pól i przycisków z interfejsu („Dane użytkownika”).
- Rób: jedna `.sub-plan__badge` na siatkę planów; rodzic z `position:relative` i górnym marginesem ≥13px, żeby wstęga nie ucinała się.
- Nie rób: nie używaj `.about-badge` jako linku — do nawigacji służy `.about-quick-links a` (QuickLink), choć dzieli tę samą regułę bazową.
- Nie rób: nie dopisuj `.pro-tag` do przycisków — w kalkulatorach PRO oznacza `.circ-pro-pill` / `.pro-superscript`.
- Kontrast (zmierzony): `#0f4b48` na ≥82% bieli 9,9:1, `#0a6261` w `.inline-label`/`.contact-kicker` 6,3:1, `#92400e` na bursztynie 7% 6,5:1, `#0b6b72`/`#7b2cbf`/`#31585b` w `.guide-module-badge-*` 5,8–7,3:1, `--primary` w `.guide-tile-count` 4,5:1, `--pro-dark` na `--pro-light` 7,0:1. Poniżej 4,5:1 w źródle i pozostawione bez zmian: biel na gradiencie `.pro-tag` `#0284c7→#0891b2` 4,1:1 → 3,7:1 (tekst .72rem) — nie używaj `.pro-tag` do treści, tylko jako znaku; w wysokim kontraście odznaki tracą efekt hover-cienia i dostają grubszy obrys.

Wersja statyczna, przepisana ręcznie z src/html-styles/o-aplikacji.css (74-79, 101-121, 132-141, 152-156, 170-172, 209-220, 824-851, 862-868, 956-970, 996-1000, 1024-1064), src/html-styles/kontakt.css (403-433, 445-460, 472-476, 1052-1068, 1303-1328), src/html-styles/instrukcja.css (183-195, 532-558, 574-597), src/html-styles/subskrypcja.css (50-66, 81-84, 182-197), src/css/style.css (5258-5264, 5276-5278, 5284-5285, 5289-5299, 5321-5327), o-aplikacji.html (737-741, 944-946, 956), kontakt.html (883-894, 989-992), subskrypcja.html (927, 977)
