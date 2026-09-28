# StepBadge

Numerowany znacznik kroku: krążek 1.6–2rem lub 26px z cyfrą o wadze 500–800. Strony informacyjne generują numer licznikiem CSS na gradientowym dysku `135deg #0891b2→#14b8a6` z kolorowym cieniem; kalkulatory używają płaskich turkusowych tintów, które w stanie aktywnym przechodzą na pełny `#00838d` z halo, a po wykonaniu na zieleń `#1D9E75`.

## Kiedy używać

Gdy treść jest uporządkowaną sekwencją: lista „jak to działa” (`.flow-steps`), kroki wysyłania wiadomości (`.contact-steps`), kreator przelicznika jednostek (`.lab-step` z `.lab-step-num`), plan dnia w module cukrzycy (`.diab-day-step__num`), pigułka „Krok N” na karcie modułu (`.diab-module-card__step`) i indeks akordeonu instrukcji (`.guide-accordion-index`). Do statusów bez kolejności użyj Chip; do nawigacji między sekcjami SegmentedControl.

## Co dostarcza konsument

- Strony informacyjne: `<ol class="flow-steps">` pod `body.about-page` lub `<ol class="contact-steps">` pod `.contact-page` z `<li>` z tekstem; numer rysuje `li::before` z `counter(aboutStep|contactStep)`. Każde `<li>` jest kartą (promień 20px, `padding:1rem 1rem 1rem 3.25rem` / `3.15rem`, dysk absolutnie w `left:1rem; top:1rem`). Żadnych własnych numerów w treści.
- Przelicznik: `<div class="lab-step" id="labStepN"><div class="lab-step-num [is-done|is-active]" id="labStepNNum">N</div><div class="lab-step-body"><div class="lab-step-label">Etykieta</div>…</div></div>`; identyfikatory `labStep1`, `labStep1Num` są wymagane przez skrypt kreatora. `.lab-step.is-hidden` chowa krok. Ostatni `.lab-step` traci dolną linię.
- Cukrzyca: `<div class="diab-day-step"><span class="diab-day-step__num">1</span><div><strong>Wczoraj</strong><p>…</p></div></div>` oraz `<span class="diab-module-card__step">Krok 2</span>`; pod `body.page-cukrzyca` skórka nadpisuje tło, obrys i kolor tokenami `--diab-*` (`!important`), a na szkle dodaje `backdrop-filter:--diab-card-filter`.
- Instrukcja: `<span class="guide-accordion-index">N</span>` w `summary` akordeonu (skrypt wstawia liczbę porządkową).

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.about-page .flow-steps li::before` | 1.6rem koło, gradient `135deg #0891b2→#14b8a6`, biały 800, cień `0 10px 20px rgba(8,145,178,.22)`; `li` tło `rgba(255,255,255,.88)`, obrys `rgba(22,76,71,.1)`, siatka `gap:.9rem`. |
| `.contact-page .contact-steps li::before` | 1.6rem koło, tło `--contact-step-badge-bg`, tekst `--contact-step-badge-text`, cień `--contact-step-badge-shadow`; `li` tło `--contact-surface-elevated`, obrys `--contact-border`, tekst `--contact-text-muted`, `line-height:1.62`, `backdrop-filter`. |
| `.lab-step-num` | 26px koło, .8rem/500, tło `rgba(0,131,141,.08)`, tekst `#7a8587`. |
| `.lab-step-num.is-active` | Tło `#00838d`, biel, halo `0 0 0 4px rgba(0,131,141,.15)`, animacja `lab-step-glow` 2s (opacity .55→1). |
| `.lab-step-num.is-done` | Tło `#1D9E75`, biel. |
| `.lab-step` | Flex, `gap:.85rem`, dolna linia `.5px solid rgba(0,131,141,.10)`, wejście `lab-step-slidein` .3s (przesunięcie 8px); `.lab-step-label` .72rem/600 wersaliki `.05em` `#1a1a1a`. |
| `.diab-day-step__num` | 1.7rem koło, tło `rgba(0,131,141,.12)`, tekst `primary` .9rem/800; karta `.diab-day-step` promień `--radius`, tło `rgba(255,255,255,.82)`, obrys `#d7e5e5`, siatka `auto 1fr`. |
| `.diab-module-card__step` | Pigułka 999px, `padding:.32rem .68rem`, tło `rgba(0,131,141,.10)`, obrys `rgba(0,131,141,.16)`, tekst `primary` .79rem/800. |
| `body.page-cukrzyca …` | `.diab-day-step` tło `--diab-surface-1`, obrys `--diab-border-1`, cień `--diab-shadow-1`; `__num` i `__step` tło `--diab-surface-accent`, obrys `--diab-border-2`, tekst `primary`; `p` `--diab-text-2`. |
| `.guide-accordion-index` | 2rem koło, tło `rgba(0,131,141,.1)`, tekst `primary` .82rem/800. |
| Wysoki kontrast | `.flow-steps li:before` gradient `#00838de6→#14b8a6e0`, cień `#00838d2e` (`!important`); `.lab-step-num` obrys `--hc-card-border-width solid --hc-border` (poziom 2 i 3); `.lab-step-label` `--hc-muted`; `.guide-accordion-index` tło `#ffffffdb`, tekst `--hc-text`, obrys `--hc-input-border`, cień `0 4px 12px #0000000f`; kontakt i cukrzyca przez tokeny `--contact-step-badge-*`, `--diab-*`. |

Ciemne tło: brak reguł (kontakt i cukrzyca zmieniają tylko cienie tokenów). Podgląd wyłącza animacje `lab-step-slidein` i `lab-step-glow` (regułą tylko w `<style>` podglądu), żeby zrzut był stabilny; w aplikacji działają.

## Tokeny

`--primary`, `--radius`, `--contact-step-badge-bg`, `--contact-step-badge-text`, `--contact-step-badge-shadow`, `--contact-surface-elevated`, `--contact-border`, `--contact-text-muted`, `--contact-card-shadow`, `--contact-control-backdrop`, `--diab-surface-1`, `--diab-border-1`, `--diab-shadow-1`, `--diab-text-1`, `--diab-text-2`, `--diab-surface-accent`, `--diab-border-2`, `--diab-card-filter`; w wysokim kontraście `--hc-card-border-width`, `--hc-border`, `--hc-input-border`, `--hc-text`, `--hc-muted`. Literały `#0891b2`, `#14b8a6`, `#1D9E75`, `#00838d`, `#7a8587`, `#1a1a1a`, `#d7e5e5`, `#4f6060`.

## Zasady

- Rób: numeruj licznikiem CSS (`flow-steps`, `contact-steps`) albo daj cyfrę w tekście krążka — czytnik ekranu musi ją usłyszeć; w `.lab-step-num` cyfra jest treścią.
- Rób: dokładnie jeden `.lab-step-num.is-active`; `is-done` tylko dla kroków przed aktywnym.
- Rób: etykietę kroku (`.lab-step-label`, `<strong>` w `.diab-day-step`) zawsze obok krążka — kolor stanu nie wystarcza.
- Nie rób: nie wstawiaj `.flow-steps` poza `body.about-page` ani `.contact-steps` poza `.contact-page` — reguły są zagnieżdżone i nie zadziałają.
- Nie rób: nie zmieniaj `.5px` dolnej linii `.lab-step` na 1px „dla wyrazistości”; w wysokim kontraście krążek dostaje własny obrys.
- Kontrast (zmierzony na białym tle): `.lab-step-num.is-active` biel na `#00838d` 4,5:1; `.lab-step-label` `#1a1a1a` ≥13:1. Poniżej 4,5:1 w źródle i pozostawione bez zmian: biel na gradiencie `.flow-steps li::before` `#0891b2→#14b8a6` 3,7:1 → 2,5:1, `.lab-step-num` nieaktywny `#7a8587` na tincie 8% 3,4:1, `.lab-step-num.is-done` biel na `#1D9E75` 3,4:1, `--primary` w `.diab-day-step__num` 3,9:1, `.diab-module-card__step` i `.guide-accordion-index` 4,0:1 — numer kroku zawsze powtarzaj w etykiecie lub treści obok krążka.

Wersja statyczna, przepisana ręcznie z src/html-styles/o-aplikacji.css (543-593), src/html-styles/kontakt.css (934-1007), src/html-styles/przelicznik-jednostek.css (854-931, 1859-1878, 4547-4555, 4625-4628), src/html-styles/cukrzyca.css (267-330, 6061-6073, 6431-6454, 6485-6504, 6620-6636, 6818-6824), src/html-styles/instrukcja.css (452-463), src/css/style.css (5279-5283, 5355-5358), o-aplikacji.html (809-815), kontakt.html (976-980), przelicznik-jednostek.html (2314-2317), cukrzyca.html (4091, 4251-4257)
