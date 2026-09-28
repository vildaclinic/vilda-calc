# Notice

Komunikat w obrębie kalkulatora: obramowana karta ostrzegawcza w kolorze zagrożenia albo duży pogrubiony tekst w kolorze ostrzeżenia lub błędu, umieszczany bezpośrednio w kartach wyników na `index.html`.

## Kiedy używać

- Gdy kalkulator nie może policzyć wyniku, bo brakuje danych (`.plan-warning-card`, `#errorBox`).
- Gdy wynik wymaga dodatkowej oceny lub innego wskaźnika (`.notice-orange`, `.centile-monitor-warning`, `.wfl-reminder`).
- Gdy wynik jest poza zakresem lub wymaga diagnostyki (`.diet-warning`, `.centile-warning`, `.gh-test-warning`, `.intake-alert.danger`).
- Gdy model obliczeniowy jest porównawczy i trzeba ostrzec przed nadinterpretacją (`.adv-growth-profile-warning`).

Nie używaj do treści informacyjnych poza kalkulatorem (o aplikacji, kontakt, instrukcja) — tam służy `Callout`. Komunikaty konta i logowania to `AuthBanner`.

## Co dostarcza konsument

- Element blokowy (`<div>` lub `<p>`) z jedną z klas poniżej, wstawiony wewnątrz karty wyników.
- Karty ostrzegawcze są w aplikacji ukryte (`style="display:none"`) i pokazywane przez skrypt po obliczeniu; `#errorBox` ma `display:none` w arkuszu, pokazuje go skrypt.
- Wymagane `id` z arkusza: `#whrSuggest` (wariant pomarańczowy z rozmiarem 1,5 rem), `#errorBox`, `#compareInstruction`, `#infoMessages` (kontener `.card.info-card`), `#intakeResults` (rodzic dla `.intake-alert` i `.intake-reasons`). Selektory z `id` zachowano w partialu i w podglądzie; `#errorBox` pokazano w podglądzie tak jak w `index.html` — wewnątrz `#infoMessages.card.info-card` z inline `padding:0;overflow:hidden` na kontenerze i `padding:1.1rem 1.4rem;margin:0` na komunikacie (wygląd samej karty `.card` daje grupa kart).
- Treść: jedno–dwa zdania po polsku; `<strong>` na nazwie wskaźnika (`<strong>WHR</strong>`); link w `.centile-warning a` dziedziczy kolor i wagę, podkreślony.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.plan-warning-card` | obrys 2 px `--danger` (#c62828), tło #ffeaea, tekst `--danger`, promień `--radius` (12 px), .95rem, wyśrodkowany, waga 600, odstęp dolny 1rem |
| `.plan-warning-card.notice-orange`, `#whrSuggest.plan-warning-card` | jak wyżej, ale obrys i tekst #c75d00 (`--notice-orange`), tło #fff `!important`; `#whrSuggest` dodatkowo 1.5rem (lokalna zmienna `--whr-suggest-font-size`) |
| `.wfl-reminder` | tekst 1.3rem, #c75d00, waga 600, interlinia 1.4, odstęp górny .5rem (w aplikacji ukryty do czasu obliczenia) |
| `#errorBox` | tekst 1.4rem, `--primary`, waga 600, wyśrodkowany, margines 1rem 0; wewnątrz `.info-card` margines górny 0, dolny .5rem |
| `#compareInstruction` | tekst 1.2rem, `--primary`, waga 600, wyśrodkowany; link `--primary`, podkreślony, 1rem |
| `.diet-warning` | tekst 1.5rem, `--danger`, waga 600, interlinia 1.2 |
| `.centile-warning` / `.centile-monitor-warning` | tekst w rozmiarze karty, waga 600, interlinia 1.3; kolor `--danger` / `--notice-orange`; link dziedziczy kolor |
| `.gh-test-warning` | blok 1.25rem, `--danger`, waga 600, odstęp górny 1rem |
| `#intakeResults .intake-alert` (`.warn` / `.danger`) | 1.2rem, waga 600; kolor #c75d00 / `--danger`; lista `.intake-reasons` z wcięciem 1.2rem |
| `.professional-message` | wyśrodkowany, .98rem, waga 600, Inter, kolor #ce0000 |
| `.adv-growth-profile-warning` | panel: promień 14 px, obrys 1 px rgba(199,93,0,.22), gradient #fff9f0fa → #fff5e6fa, tekst #6d4a11, wypełnienie .85rem .95rem |
| `.diet-info-note` | pierwsza definicja (teal na `--card` z 4 px paskiem `--secondary`) jest nadpisana późniejszą regułą i regułą `.liquid-ios26 .diet-info-note`: efektywnie czarny tekst 1rem bez tła i obrysu |

Stany: brak stanów interaktywnych; widoczność steruje skrypt. W wysokim kontraście kontener `.info-card` (z `#errorBox`) dostaje tło `--hc-result-bg`, tekst `--hc-text` i cień `0 6px 18px #00000017`; same komunikaty nie zmieniają kolorów. Na szkle tylko `.diet-info-note` ma osobną regułę.

## Tokeny

`--danger`, `--radius`, `--primary`, `--secondary`, `--card`, `--notice-orange`, `--notice-orange-bg` (zadeklarowany w źródle, nieużywany przez żadną regułę), `--hc-result-bg`, `--hc-text`. Lokalne zmienne spoza tokenów: `--whr-suggest-font-size: 1.5rem`, `--whr-suggest-font-style: "Inter", sans-serif` (wartość nieprawidłowa dla `font-style`, przeglądarka ją ignoruje).

## Zasady

- Rób: jeden komunikat na jedną przyczynę; tekst mówi, co użytkownik ma uzupełnić lub sprawdzić.
- Rób: kolor zawsze z tekstem — czerwień oznacza wartość poza zakresem lub brak danych, pomarańcz sugestię dodatkowej oceny, teal instrukcję.
- Nie rób: nie zmieniaj rozmiarów (1.3–1.5rem są celowe: komunikat ma być czytelny z odległości w gabinecie).
- Nie rób: nie umieszczaj `.plan-warning-card` poza kartą wyników; nie dodawaj ikon — źródło ich nie ma.
- Kontrast (zmierzony): `--danger` #c62828 na #ffeaea 4.9:1; teal `--primary` #00838d na białym 4.5:1; #c75d00 (`--notice-orange`) na białym 4.2:1 — poniżej 4.5:1 dla tekstu zwykłego (wartość źródła, bez zmian); w `.wfl-reminder`, `#whrSuggest` i `.intake-alert.warn` (1.2–1.5rem, waga 600) jest to tekst duży, dla którego wymagane jest 3:1, ale `.centile-monitor-warning` dziedziczy rozmiar karty (1rem), więc tam kontrast pozostaje poniżej progu.
- Wysoki kontrast: kolory komunikatów pozostają; zmienia się tylko kontener `.info-card`. Szkło: brak zmian poza `.diet-info-note`.
- Na szerokości ≤991 px powłoka (`vilda_chrome.css`) ukrywa `#infoMessages`, a `docpro.html` ukrywa `#errorBox` własnym stylem — obu reguł nie ma w partialu.

Wersja statyczna, przepisana ręcznie z src/css/style.css (285-301, 923-935, 1274-1303, 1334-1357, 1741-1766, 2005-2012, 2169-2176, 2276-2282, 2490-2511, 2577-2587, 3020-3021, 3108-3113, 4833-4835, 5163-5166) oraz index.html (znacznik).
