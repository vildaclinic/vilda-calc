# Callout

Krótki blok objaśniający na stronach informacyjnych i modułowych: promień 12–20 px, cienki barwny obrys i dopasowane półprzezroczyste tło, w odcieniu zależnym od znaczenia (niebieski — informacja, teal kreskowany — podpowiedź lub miejsce w przygotowaniu, bursztyn — ostrożność, czerwień — niepowodzenie).

## Kiedy używać

- Objaśnienie zasady działania lub ważne założenie w treści strony („W praktyce:", „Najważniejsze założenie:").
- Podpowiedź obok formularza (`.helper-box`), miejsce na instrukcję w przygotowaniu (`.guide-placeholder`), opis modułu (`.guide-module-copy`).
- Ostrzeżenie edukacyjne, które można zamknąć (`.notes-pii`), i alert niepowodzenia operacji (`.notes-alert`).
- Notatki dydaktyczne w module cukrzycy (`.diab-note-box` z modyfikatorami) i ostrzeżenia w ustawieniach (`.settings-note-warn`).

Nie używaj do komunikatów w kartach wyników kalkulatora (`Notice`) ani do komunikatów konta (`AuthBanner`).

## Co dostarcza konsument

- `<div>` (lub `<p>` dla `.guide-placeholder`, `.guide-module-copy`) z klasą wariantu i treścią; `<strong>` na etykiecie wiodącej („Ważne:", „Uwaga:").
- Warianty stron wymagają przodka: `.about-callout` i `.hero-note` działają tylko w `.about-page`; `.contact-callout` w `.contact-page`; drabinka `.diab-note-box` na tokenach `diab-*` działa tylko przy `body.page-cukrzyca` (bez niej obowiązuje wygląd bazowy pokazany w podglądzie).
- Wariant zamykany: `.notes-pii` = `.notes-pii__icon` (emoji) + `.notes-pii__body` + `<button class="notes-pii__close" aria-label="Zamknij">×</button>`; analogicznie `.notes-alert` (domyślnie `display:none`, skrypt ustawia `display:flex`).
- `.pro-sync-note` jest ukryta do czasu `html.vilda-pro-active`; sloty `.pro-sync-note__icon` + `<span>` z linkiem.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.about-page .about-callout` | lewy pasek 4 px #0891b2, promień 18 px, tło rgba(255,255,255,0.8), wypełnienie 1rem 1.05rem |
| `.about-page .hero-note` | tło rgba(8,145,178,0.09), obrys 1 px rgba(8,145,178,0.18), promień 20 px, tekst wyjustowany; `<strong>` #0f4b48 |
| `.contact-page .contact-callout` | tło `--contact-callout-bg`, obrys `--contact-callout-border`, tekst `--contact-callout-text` (#0f4b48), cień `--contact-card-shadow`, rozmycie `--contact-control-backdrop`, promień 20 px |
| `.guide-placeholder` | obrys 1 px kreskowany rgba(0,131,141,0.24), tło rgba(0,131,141,0.05), tekst #5a7375, promień 12 px, interlinia 1.55 |
| `.guide-module-copy` | obrys 1 px rgba(0,131,141,0.14), gradient #ffffff → #f7fbfb, tekst #456467, interlinia 1.62 |
| `.helper-box` | .85rem, tekst #555, tło #eef4f4, obrys 1 px kreskowany `--primary`, promień `--radius`, wypełnienie .6rem |
| `.diab-note-box` | obrys 1 px #d7e5e5, tło rgba(255,255,255,0.65), promień `--radius`; `--accent` teal rgba(0,131,141,0.07), `--warn` rgba(255,248,239,0.92) z obrysem rgba(178,107,0,0.22), `--danger` rgba(255,244,244,0.95), `--soft` rgba(248,252,252,0.98) |
| `body.page-cukrzyca .diab-note-box…` | drabinka strony: tło `--diab-surface-1/-accent/-warn/-danger`, obrys `--diab-border-1/-2`, tekst `--diab-text-1/-3`, `#8b5300` (warn), `--danger` (danger); na szkle rozmycie `--diab-card-filter` |
| `.settings-note-warn` | obrys 1 px #b4540033, tło #b454000f, tekst #6e4600, waga 600, promień 12 px |
| `.pro-sync-note` (przy `html.vilda-pro-active`) | flex, tło #f0f7ff, obrys rgba(0,100,220,.15), promień .6rem, .82rem, tekst `--text-2`; link #0064dc → #0050b0 |
| `.notes-pii` | flex, tło #f0f7ff, obrys 1 px rgba(0,100,220,.16), promień 12 px, .85rem, tekst `--text-2` (#44535c); `×` #5a7274 → #0f2b33 |
| `.notes-alert` | jak `.notes-pii`, ale tło #fff5f5, obrys rgba(192,57,90,.24), tekst #8a2338; `×` #8a2338 → #5e1626; domyślnie ukryty |
| `.sub-preview__free-notice` | tło #f5f9f9, obrys kreskowany #c0d0d0, promień 8 px, .78rem, tekst #8aadad, wyśrodkowany |
| wysoki kontrast: `.guide-placeholder`, `.guide-module-copy` | tło `--hc-result-bg`, tekst `--hc-text`, obrys `--hc-card-border-width` `--hc-input-border`, cień 0 6px 18px #00000014, bez rozmycia |
| wysoki kontrast: `.hero-note`, `.about-callout` (tylko gdy `<body>` ma klasę `about-page`, jak w `o-aplikacji.html`) | tło `--hc-result-bg`, tekst `--hc-text`, obrys `--hc-card-border-width` `--hc-input-border`, cień 0 8px 22px #00000014, bez rozmycia |

Stany: `:hover` tylko na przyciskach zamknięcia i linkach. Przycisk `×` jest zwykłym `<button>`, więc na szkle przyjmuje globalny wygląd pigułki (`#fff3`, obrys `--lg-border`, promień 14 px, tekst #111) — tak wygląda w aplikacji. Poniżej 600 px `.notes-pii__close` wymusza `width:auto` wbrew globalnej regule pełnej szerokości przycisków.

## Tokeny

`--primary`, `--radius`, `--text-2`, `--danger`, `--contact-callout-bg`, `--contact-callout-border`, `--contact-callout-text`, `--contact-card-shadow`, `--contact-control-backdrop`, `--diab-surface-1`, `--diab-surface-accent`, `--diab-surface-warn`, `--diab-surface-danger`, `--diab-border-1`, `--diab-border-2`, `--diab-shadow-1`, `--diab-text-1`, `--diab-text-2`, `--diab-text-3`, `--diab-card-filter`; wysoki kontrast: `--hc-result-bg`, `--hc-text`, `--hc-card-border-width`, `--hc-input-border`; przez globalny przycisk `×`: `--lg-border`, `--shadow`, `--shadow-l`.

## Zasady

- Rób: zaczynaj od etykiety w `<strong>` („Ważne:", „Uwaga:", „W praktyce:"), potem jedno–trzy zdania.
- Rób: odcień według znaczenia — niebieski informuje, bursztyn ostrzega, czerwień zgłasza niepowodzenie, teal kreskowany oznacza podpowiedź lub treść w przygotowaniu.
- Nie rób: nie mieszaj wariantów stron poza ich przodkami (`.about-page`, `.contact-page`, `body.page-cukrzyca`), bo reguły nie zadziałają.
- Nie rób: nie usuwaj `aria-label="Zamknij"` z przycisku `×`.
- Kontrast (zmierzony): #5a7375 na tle `.guide-placeholder` 4.8:1, #456467 na #f7fbfb 6.2:1, #44535c na #f0f7ff 7.4:1, `×` #5a7274 na #f0f7ff 4.8:1; #8aadad na #f5f9f9 (`.sub-preview__free-notice`) 2.3:1 — poniżej 4.5:1 (wartość źródła, bez zmian): celowo wyciszona notka, nie używaj jej do treści istotnych.
- Wysoki kontrast: `.guide-placeholder` i `.guide-module-copy` dostają własną regułę (`--hc-result-bg`, `--hc-text`, obrys `--hc-input-border`); `.hero-note` i `.about-callout` też, ale tylko przy `body.about-page` — w podglądzie `.about-page` jest na `<div>`, więc render kontrastu ich nie zmienia; `.contact-callout` i `.diab-note-box` przechodzą na `hc-*` przez aliasy tokenów strony; pozostałe warianty nie mają reguł kontrastu. Szkło: `.contact-callout` i `.diab-note-box` (na `body.page-cukrzyca`) mają rozmycie tła; reszta jest płaska.

Wersja statyczna, przepisana ręcznie z src/css/style.css (5265-5271, 5307-5313), src/html-styles/o-aplikacji.css (270-296, 434-441), src/html-styles/kontakt.css (842-859), src/html-styles/instrukcja.css (514-522, 604-612), src/html-styles/kalkulator-klirens.css (1687-1704), src/html-styles/cukrzyca.css (184-230, 339, 6430-6503, 6643-6725, 6820-6824), src/css/ustawienia.css (433-440), src/html-styles/ustawienia.css (152-195), src/html-styles/notatki.css (97-197, 705-765; identycznie terminarz.css 99-149), src/html-styles/subskrypcja.css (1311-1320).
