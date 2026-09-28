# Pulse

Pulsujący pierścień uwagi wokół ramki wyniku: czerwony dla wartości niebezpiecznej, pomarańczowy dla ostrzegawczej, w rytmie 1,25 s bez końca albo jednorazowo przez 2 s; do tego jednorazowy błysk tła i wjazd nowego wyniku.

## Kiedy używać

Gdy wynik przekracza próg kliniczny (ciśnienie tętnicze, BMI, obwód głowy lub klatki, parametry dorosłych) — pierścień pulsuje przy ramce wyniku, a klasa gospodarza (`rr-danger`, `bmi-warning`…) zmienia kolor obrysu. `.--pulse` na `.result-card` podświetla nową wartość, `.animate-in` wsuwa nowy blok wyniku. Nie ma w aplikacji szkieletu ładowania; stan ładowania to `body.js-loading .main-content{visibility:hidden}`.

## Co dostarcza konsument

- Gospodarz: `.result-box` (obrys `2px solid var(--brand)`, promień `var(--radius)`, `padding:1rem`, tło `var(--card-bg)`, tekst `1.75rem` wyśrodkowany) lub `.result-card` (`padding:1.25rem 1.5rem`, `position:relative; overflow:hidden`).
- Klasa pulsu na gospodarzu: `pulse-danger-infinite` | `pulse-warning-infinite` | `pulse-danger-2s` | `pulse-warning-2s`.
- Klasa progu na gospodarzu, żeby obrys zgadzał się z pierścieniem: `rr-danger`/`rr-warning` (`#bpResult`, `#circHeadResult`, `#circChestResult`), `bmi-danger`/`bmi-warning` (`#coleInfo`, `#intakeResults`), `adult-vitals-danger`/`adult-vitals-warning` (`.adult-vitals-result-box`).
- Wymagane `id` gospodarzy, po których źródło rysuje pierścień na nakładce `::after` (`inset:0; border-radius:inherit`): `#bpResult`, `#coleInfo`, `#intakeResults`, `#circHeadResult`, `#circChestResult`, `#adultVitalsResult`; ten sam mechanizm ma `.pro-overlay`. Podgląd używa `#bpResult` i `#coleInfo`.
- Skrypt zdejmuje i nadaje klasę ponownie, gdy wynik zmienia się z powrotem na próg — jednorazowe animacje nie odtwarzają się same.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.pulse-danger-infinite` | `animation:pulseRed 1.25s ease-in-out infinite`, `will-change:box-shadow` |
| `.pulse-warning-infinite` | `animation:pulseOrange 1.25s ease-in-out infinite` |
| `.pulse-danger-2s` / `.pulse-warning-2s` | ta sama animacja `2s ease-in-out 1` |
| `@keyframes pulseRed` | `box-shadow: 0 0 #c628284d` → 70 % `0 0 0 var(--pulse-ring) #c628281a` → `0 0 #c6282800` |
| `@keyframes pulseOrange` | `0 0 #c75d0047` → 70 % `0 0 0 var(--pulse-ring) #c75d001a` → `0 0 #c75d0000` |
| `.rr-danger`, `.bmi-danger` (na `id`), `.adult-vitals-danger` | `border-color:var(--danger)!important` (`#c62828`) |
| `.rr-warning`, `.bmi-warning`, `.adult-vitals-warning` | `border-color:#c75d00!important` |
| `.result-card.--pulse::after` | nakładka `var(--brand-light)` (`#00b0a6`) o kryciu `.15` → `0` przez `pulseBG 1s ease-out forwards`, `z-index:-1` |
| `.animate-in` | `fadeSlideUp .45s cubic-bezier(.4,0,.2,1)`: z `opacity:0; translateY(12px)` do `1; 0` |
| `body.js-loading .main-content` | `visibility:hidden` do czasu inicjalizacji skryptów |
| `prefers-reduced-motion: reduce` | klasy `.pulse-*` na elemencie: `animation:none!important`; nakładki `::after` gospodarzy z `id` (oraz `#adultVitalsResult`) zachowują puls z `!important` — alert kliniczny nie znika; `.pro-overlay` traci puls |

## Tokeny

- `--pulse-ring` (12px), `--danger`, `--brand-light`, `--brand`, `--primary`, `--card-bg`, `--radius`, `--shadow-s`
- wartości wpisane na stałe: `#c628284d`, `#c628281a`, `#c75d0047`, `#c75d001a`, `#c75d00`

## Zasady

- Rób: puls zawsze razem z tekstem wyniku i klasą progu na obrysie — sam pierścień nie niesie znaczenia (po chwili znika, w trybie ograniczonego ruchu klasa na elemencie nie animuje).
- Rób: `infinite` tylko dla wartości, które wymagają reakcji teraz (ciśnienie w zakresie nadciśnienia); dla ostrzeżenia użyj wariantu `2s`.
- Nie rób: nie pulsuj kilku ramek naraz na jednej stronie i nie używaj pulsu do stanów niemedycznych (zapis, synchronizacja) — od tego jest Toast.
- Nie rób: nie zmieniaj czasów ani kolorów pierścienia lokalnie; `--pulse-ring` jest jedyną zmienną.
- Kontrast: kolor niesie tylko `border-color` gospodarza (`#c62828`, `#c75d00` na bieli); pierścień jest półprzezroczysty i celowo subtelny.
- Szkło i wysoki kontrast: źródło nie ma osobnych reguł dla pulsu; pierścień to `box-shadow`, więc rysuje się tak samo na szkle i w wysokim kontraście (gospodarz `.result-box`/`.result-card` zmienia się według własnej karty).
- Podgląd odtwarza jednorazowe animacje co 4 s małym skryptem (zdjęcie i nadanie klasy); w aplikacji robi to logika wyniku.

Wersja statyczna, przepisana ręcznie z src/css/style.css (linie 525–537, 665–710, 731–761, 895–921, 936–985, 1004–1021, 1227–1236, 4741–4742, 4848–4865, 5420–5446).
