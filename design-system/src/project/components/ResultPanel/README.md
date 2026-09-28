# ResultPanel

Panel z głównym wynikiem obliczenia: biała powierzchnia w ramce 2 px w kolorze marki, wspólny promień 12 px, lekki cień i wyśrodkowana liczba 1.75rem o wadze 600; interpretacja kliniczna przebarwia wyłącznie ramkę i liczbę (pomarańcz #c75d00 — ostrzeżenie, czerwień `--danger` — zagrożenie).

## Kiedy używać

- Wynik pojedynczego kalkulatora na karcie pacjenta: BMI i centyl (`#bmiResult`), ciśnienie (`#bpResult`), WHR (`#whrInfo`), obliczenia wzrostowe (`#basicGrowthResults`), parametry dorosłych (`#adultVitalsResult`).
- Karta wyniku z tytułem i dużą liczbą z jednostką: „Szacowane spożycie energii” (`#intakeCard.result-card` + `.result-number`), karty planu (`.plan-result-card`).
- Blok zaawansowanych wyników (`#advResults`) i wartość BSA (`.bsa-info`).

Nie używaj do tabel z wieloma wierszami (`DataTable`), do zestawień etykieta–wartość (`SummaryGrid`) ani do komunikatów bez liczby (`Notice`).

## Co dostarcza konsument

- `.result-box` — `<div>` z treścią; wartość w `<span class="result-val">`, etykieta w `<strong>`, opis pomocniczy w `<small>` lub `<br>`.
- `.result-card` — `<section>` z `<h2 class="intake-title">` i `<div class="result-number">1850<small>kcal</small></div>`; opcjonalna klasa `--pulse` uruchamia jednorazowy błysk tła (`::after`, animacja `pulseBG` 1 s).
- Wariant WHR wewnątrz `.result-box`: `.whr-result` > `.whr-topline` (`.whr-label`, `.whr-number`), `.whr-badges` (`.whr-badge` z opcjonalnym `<small>`), `.whr-status` z klasą `ok` / `warn` / `bad`.
- Wariant spożycia: `.intake-result-card` z akapitami `<p>` (etykieta w `<strong>`), `#intakeResults .intake-alert.warn|.danger`.
- Stany PRO (klasy dodawane przez skrypt): `.pro-hidden-border` na `.result-box` / `.result-card` (ramka przezroczysta, bez cienia), `.result-val.pro-warning` / `.pro-danger`.
- Wymagane `id` ze źródła: `#intakeCard` (nadpisania szkła i wysokiego kontrastu karty), `#bpResult` (modyfikatory `.rr-warning` / `.rr-danger`), `#advResults`, `#intakeResults`, `#idealWeightInfo`, `#adultVitalsResult`. Podgląd używa `#bmiResult`, `#intakeCard` i `#whrInfo`.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.result-box` | ramka 2 px `--brand` (#00838d), promień `--radius` (12 px), wypełnienie 1rem, margines 12px 0, 1.75rem, tło `--card-bg` (#ffffff), tekst wyśrodkowany, cień `--shadow-s` |
| `.result-val` | tekst `--primary` (#00838d), 1.75rem, waga 600 |
| `.result-card` | tło `--card-bg`, ramka 2 px `--brand`, promień `--radius`, cień `--shadow-s`, wypełnienie 1.25rem 1.5rem, `overflow:hidden` |
| `.result-card.--pulse` | `::after` z tłem `--brand-light` (#00b0a6), animacja `pulseBG` 1 s od krycia .15 do 0 |
| `.result-number` | `600 1.75rem/1 Inter`, `letter-spacing:-.02em`, kolor `--brand`, `inline-flex` do dołu; `small` .65em, #444, odstęp .1em |
| `#advResults` | dwie definicje w kaskadzie — obowiązuje późniejsza: ramka 2 px `--brand`, tło `--card-bg`, promień `--radius`, cień `--shadow-s`; z pierwszej zostaje wypełnienie 1rem i rozmiar tekstu 1.25rem |
| `.plan-result-card` | wyśrodkowana; `h3` 1.75rem 600, `.result-number` 2rem, `small` 1.5rem |
| `.bsa-info` | 1.35rem, 600, `--primary`, odstęp 6px |
| `.whr-number` | `600 1.75rem/1 Inter`, `--primary`; `.whr-badge` — ramka 1 px #d0dede, tło #fff, promień 6px, 1rem |
| `.whr-status.ok` / `.warn` / `.bad` | 600; `--primary` / #c75d00 / `--danger` (#c62828) |
| `.result-box.bmi-warning` / `.whr-warning` / `#bpResult.rr-warning` / `.adult-vitals-warning` | ramka #c75d00 `!important`; `.result-val`, `.whr-number`, `.whr-status` #c75d00 |
| `.result-box.bmi-danger` / `.whr-danger` / `#bpResult.rr-danger` / `.adult-vitals-danger` | ramka `--danger` `!important`; liczba i status `--danger` |
| `.result-box.pro-hidden-border` / `.result-card.pro-hidden-border` | ramka 2 px przezroczysta `!important`, bez cienia; `.result-val.pro-warning` `--notice-orange` (#c75d00), `.pro-danger` `--danger` |
| `.adult-vitals-result-box` | odmiana wyrównana do lewej, 1rem, odstęp .85rem, `overflow:visible` |
| `.intake-result-card` | ramka 1 px #d0dede, tło #fff, promień `--radius`, wypełnienie .7rem .85rem; `p` 1.05rem; `p strong` `--primary` |
| `#intakeResults .intake-alert` | 1.2rem, 600; `.warn` #c75d00, `.danger` `--danger` |

Stany dynamiczne: pierścienie `.pulse-warning-*` / `.pulse-danger-*` na `#bpResult` i `#adultVitalsResult` opisuje karta `Pulse`. Na szkle (`.liquid-ios26`) `.result-box` dostaje tło #ffffff8c, ramkę `--lg-accent` i cień 0 2px 10px #00000014; `.result-card` i `#intakeCard` przechodzą na recepturę szkła (tło `--lg-surface-light`, ramka 1 px `--lg-border`, promień `--lg-radius` 18 px, cień `--lg-shadow`, rozmycie 14 px) — dlatego w trybie jasnym karta traci teal ramkę. `.result-number small` na szkle ma krycie .8.

## Tokeny

`--brand`, `--brand-light`, `--primary`, `--danger`, `--notice-orange`, `--card-bg`, `--bg`, `--radius`, `--shadow-s`; na szkle `--lg-accent`, `--lg-surface-light`, `--lg-border`, `--lg-shadow`, `--lg-radius`; w wysokim kontraście `--hc-result-bg`, `--hc-text`, `--hc-surface`, `--hc-border`, `--hc-card-border-width`, `--hc-shadow`, `--hc-blur`, `--hc-muted`.

## Zasady

- Rób: etykieta w `<strong>` przed liczbą („BMI:", „WHR:", „Ciśnienie:"), liczba z przecinkiem dziesiętnym, jednostka w `<small>` przy `.result-number`.
- Rób: interpretację zawsze podawaj słowami (centyl, „w normie", „warto obserwować") — kolor ramki i liczby jest tylko wzmocnieniem.
- Nie rób: nie mieszaj modyfikatorów `bmi-*`, `whr-*`, `rr-*` na jednym panelu i nie dodawaj tła koloru ostrzeżenia — wypełnienie zostaje białe.
- Nie rób: nie zmieniaj `font-size` `.result-box` lokalnie; odmiana lewostronna to `.adult-vitals-result-box`.
- Kontrast (zmierzony): teal #00838d na bieli 4.53:1 (AA spełnione); #c75d00 na bieli 4.20:1 — poniżej progu AA 4.5:1 dla zwykłego tekstu, ale `.result-val`, `.whr-number` i `.whr-status` w `.result-box` mają 1.75rem przy wadze 600, czyli są dużym tekstem (próg 3:1 spełniony); wartość ze źródła, nie zmieniaj jej lokalnie. #c62828 5.62:1; `#444` w `.result-number small` 9.74:1.
- Wysoki kontrast: `.result-box` — tło `--hc-result-bg`, tekst `--hc-text`, cień 0 6px 18px #00000017; `.result-card`/`#intakeCard` — tło `--hc-surface`, ramka `--hc-card-border-width` `--hc-border`, cień `--hc-shadow`; `small` przechodzi na `--hc-muted` z kryciem 1. Ciemne tło: bez reguł własnych.

Wersja statyczna, przepisana ręcznie z src/css/style.css (525-537, 637-642, 664-695, 923-930, 956-961, 1263-1273, 1640-1644, 2329-2333, 2447-2461, 2472-2480, 2512-2572, 2904-2908, 4866-4872, 5157-5166, 5193-5195, 5414-5423), src/css/ios26-v2.css (74-84, 193-194).
