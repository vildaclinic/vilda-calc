# ClcrIdentBar

Pasek tożsamości pacjenta w kalkulatorze klirensu: awatar z inicjałami, imię i nazwisko, wiek z płcią, odznaki pomiarów i przycisk zwijający blok danych pacjenta.

## Kiedy używać

Na stronie `kalkulator-klirens.html`, gdy pacjent jest wczytany z karty. Skrypt `clcr_ui_workflow.js` (`buildBar`/`renderBar`) wstawia pasek do `.patient-card` przed `#patientSet` i pokazuje go tylko dla pacjenta z danymi (`hidden` bez pacjenta). Pasek zwinięty streszcza wiek, wzrost i masę w odznakach; pasek rozwinięty zostawia tylko tożsamość, a pod polem `#weight` pojawia się notka daty pomiaru masy (`.clcr-weight-note`).

## Co dostarcza konsument

- Kontener `<div id="clcrIdentityBar" class="clcr-ident-bar">` wewnątrz `.patient-card`; atrybut `hidden` chowa pasek.
- Lewa część `.clcr-ident-id`: `<span class="clcr-ident-avatar">` z inicjałami (pierwsza litera pierwszego i ostatniego członu nazwy, jedno słowo = dwie litery, brak nazwy = „•”), `<span class="clcr-ident-who">` z `.clcr-ident-name` i opcjonalnym `.clcr-ident-sub` (wiek i płeć rozdzielone „ · ”, np. „12 lat 3 mies. · mężczyzna”, „8 mies. · kobieta”, „14 dni · donoszony”).
- Odznaki `.clcr-ident-badges` tylko w stanie zwiniętym: wiek, „148 cm” i masa jako `.clcr-ident-badge--mass` („Masa 41,5 kg · dziś” lub „· 14.03.2026”); liczby z przecinkiem dziesiętnym.
- Przycisk `<button type="button" class="clcr-ident-toggle" data-ident-act="toggle">` z etykietą „Dane pacjenta ▾” (zwinięty) albo „Zwiń ▲” (rozwinięty).
- Stan zwinięty = klasa `clcr-ident-collapsed` na `.patient-card`; reguła `.patient-card.clcr-ident-collapsed > #patientSet` chowa fieldset danych pacjenta (wymagane `id="patientSet"`).
- Notka masy: `<span id="clcrWeightMeasuredNote" class="clcr-weight-note">` po polu `#weight`; klasa `fresh` dla „nowy pomiar: dziś 28.09.2026”; bez klasy dla „ostatni pomiar: 14.03.2026 — nadpisz, jeśli pacjent był ważony dziś.” i „podaj masę zmierzoną na tej wizycie.”.

## Warianty i stany

| Klasa / stan | Wygląd |
| --- | --- |
| `.clcr-ident-bar` | flex, zawijanie, odstęp 12px, padding 12px 14px, margines dolny 12px, tło `#fff`, obrys 1px `#e3ecec`, promień 14px, cień `0 6px 18px rgba(18, 72, 77, 0.05)` |
| `.clcr-ident-bar[hidden]` | `display: none` |
| `.clcr-ident-avatar` | koło 40px, tło `#00838d`, biały tekst 14px/800, odstęp liter 0.02em |
| `.clcr-ident-name` / `.clcr-ident-sub` | 16px/800 `#15363a`, interlinia 1.15 / 12.5px/600 `#557074` |
| `.clcr-ident-badge` | pigułka 999px, tło `#f4fafa`, obrys `#e3ecec`, 12.5px/700 `#006b73`, cyfry tabelaryczne |
| `.clcr-ident-badge--mass` | tło `#fff8e7`, obrys `#ead6a8`, tekst `#8a5400` |
| `.clcr-ident-toggle` | `margin-left: auto`, pigułka 999px, obrys 1px `#d0dede`, tło `#fff`, tekst `#006b73` 13px/750, min. wysokość 36px; `:hover` tło `#f4fafa` |
| `.clcr-weight-note` | blok, 12px/650, `#8a5400`; `.fresh` = `#147a64`; `[hidden]` = `display: none` |
| `.patient-card.clcr-ident-collapsed > #patientSet` | `display: none !important` |

W aplikacji `<body class="liquid-ios26">` nakłada na każdy `<button>` regułę szkła z `!important` (`ios26-v2.css`): przycisk `.clcr-ident-toggle` ma wtedy tło `#fff3`, obrys 1px `--lg-border`, tekst `#111`, promień 14px, cień `0 4px 12px #0000001a` i rozmycie tła; własny obrys, kolor i promień 999px są przez nią nadpisane. Tak wygląda przycisk w podglądzie.

## Tokeny

Blok jest poza zakresem `html[data-clcr-workflow-ui]`, więc używa literałów: `#00838d` (= `--clcr-primary`), `#006b73` (= `--clcr-primary-dark`), `#d0dede` (= `--clcr-border`), `#e3ecec` (= `--clcr-border-soft`), `#147a64` (= `--clcr-success`), `#15363a`, `#557074`, `#f4fafa`, `#fff8e7`, `#ead6a8`, `#8a5400`, `rgba(18, 72, 77, 0.05)`. Przycisk w szkle: `--lg-border`. Tło podglądu: `--bg`.

## Zasady

- Rób: pokazuj pasek tylko dla wczytanego pacjenta; w stanie zwiniętym zawsze dołącz odznaki wieku, wzrostu i masy, bo zastępują ukryte pola.
- Rób: masę z dzisiejszego pomiaru oznaczaj w odznace tekstem („· dziś”), a pod polem notką `.fresh`; kolor nie jest jedynym nośnikiem stanu.
- Nie rób: nie chowaj pól pacjenta atrybutem `hidden` na polach; zwijanie to wyłącznie klasa `clcr-ident-collapsed` na `.patient-card`, żeby logika widoczności sekcji per formuła (czyta `.hidden`) nie ukryła całej karty.
- Nie rób: nie zmieniaj `id="clcrIdentityBar"` ani `id="patientSet"`; skrypt i selektor zwijania używają tych identyfikatorów.
- Kontrast: tekst odznak `#006b73` i `#8a5400` na jasnych tłach spełnia AA; sub-linia `#557074` na bieli spełnia AA. W wysokim kontraście i na ciemnym tle pasek nie ma własnych reguł motywu: tło pozostaje `#fff`, obrys `#e3ecec`; przycisk przejmuje `--hc-focus-color` tylko dla `:focus-visible`.

Wersja statyczna, przepisana ręcznie z clcr_ui_workflow.css (2756–2897), clcr_ui_workflow.js (buildBar, renderBar, renderWeightNote), ios26-v2.css (85–93).
