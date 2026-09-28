# AuthBanner

Komunikat w ekranach konta i synchronizacji (`vilda_auth_ui.js`): miękko tonowany blok z promieniem 10–14 px, obrysem 1 px w tym samym odcieniu i wypełnieniem 12–18 px; bursztyn dla informacji i ostrzeżeń, czerwień dla błędów, pomarańcz dla ostrzeżenia w arkuszu zmiany hasła, neutralny błękit dla notatki informacyjnej.

## Kiedy używać

- `.vilda-auth-banner` — jednozdaniowa informacja o stanie sesji lub konta, wyśrodkowana.
- `.vilda-auth-warning-banner` — ostrzeżenie wymagające działania (kod zapasowy, inne urządzenie); zaczyna się znakiem `⚠` (`content:"\26a0  "`) dodawanym przez `:before`.
- `.vilda-auth-error` — komunikat błędu operacji (logowanie, odzyskiwanie, eksport); pusty element jest niewidoczny.
- `.vilda-auth-password-warning` — ostrzeżenie w arkuszu (zmiana hasła, scalanie danych).
- `.vilda-auth-info` — neutralna notatka z tytułem i treścią (kopie zapasowe, dodatkowe informacje); wewnątrz `.vilda-auth-side-note` jako tekst pomocniczy.
- `.vilda-patient-age-note` — krótka notka przy formularzu pomiaru; `.vilda-note-wskazana` — obrys wskazujący zalecany element.

Komponent żyje wyłącznie w drzewie `.vilda-auth-root` (Inter, tekst #08202c). Poza ekranami konta użyj `Notice` lub `Callout`.

## Co dostarcza konsument

- `<div class="vilda-auth-banner">tekst</div>` — treść z `text` lub `innerHTML` skryptu; dozwolone `<strong>` i `<span>`.
- `.vilda-auth-error` renderowany zawsze, a wypełniany tylko po błędzie (`:empty{display:none}`); wariant `.vilda-auth-error-stable[data-empty="1"]` zwija się do wysokości 0 bez zmiany układu.
- `.vilda-auth-search-empty` z atrybutem `hidden` jest ukrywany `!important`.
- Brak przycisków i ikon poza glifem `⚠` z `:before` na wariancie ostrzegawczym.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.vilda-auth-banner` | tło #fff8e1, tekst #6b4900, obrys #f0d590, promień 12 px, 14px/1.45, wyśrodkowany, wypełnienie 14px 18px |
| `.vilda-auth-warning-banner` | tło #fffbea, tekst #5a3e00, obrys #f0d060, 13px/1.55, do lewej, `:before{content:"\26a0  "}`, margines górny 12px |
| `.vilda-auth-error` | tło #fef2f3, tekst #b00020, obrys #f3cfd2, promień 10 px, 13.5px/1.45; `:empty` ukryty |
| `.vilda-auth-error-stable[data-empty="1"]` | niewidoczny, wysokość 0, bez wypełnienia i obrysu |
| `.vilda-auth-password-warning` | tło #fff7ed, tekst #7c3f04, obrys #fbd5a8, promień 12 px, .86rem/1.5, margines dolny 18px |
| `.vilda-auth-info` | tło #f5fafb, obrys #e0eef0, promień 14 px, 13px/1.6, tekst #3b5560, wypełnienie 18px 22px |
| `.vilda-auth-side-note` | 12.5px/1.5, tekst #6a8089 |
| `.vilda-auth-search-empty` | 14px kursywa, #6c8084, wyśrodkowany, wypełnienie 28px 16px |
| `.vilda-patient-age-note` | .78rem, tekst #5a7274, tło #f3f8f9, lewy pasek 3 px #cfe3e5, promień 0 8px 8px 0 |
| `.vilda-note-wskazana` | obrys 2 px #00838d z odsunięciem 2 px i poświatą rgba(0,131,141,.12) |

Wysoki kontrast: `.vilda-auth-info` przechodzi na `--hc-surface`, obrys `--hc-card-border-width` `--hc-border`, cień `--hc-shadow`, rozmycie `--hc-blur`, tekst `--hc-text`; `.vilda-auth-side-note` i `.vilda-auth-search-empty` na `--hc-muted`. Bursztynowe i czerwone warianty nie mają reguł kontrastu. Szkło: brak osobnych reguł.

## Tokeny

Reguły bazowe nie używają tokenów (kolory zapisane literalnie). Wysoki kontrast: `--hc-surface`, `--hc-border`, `--hc-card-border-width`, `--hc-shadow`, `--hc-blur`, `--hc-text`, `--hc-muted`.

## Zasady

- Rób: pisz komunikat błędu jako pełne zdanie z instrukcją („Spróbuj ponownie lub zaloguj się kodem QR.").
- Rób: ostrzeżenie o innym urządzeniu zaczynaj `<strong>` z sednem, potem szczegóły.
- Nie rób: nie wstawiaj własnego znaku `⚠` do `.vilda-auth-warning-banner` — dodaje go arkusz.
- Nie rób: nie ukrywaj `.vilda-auth-error` przez `display:none` w skrypcie, gdy używasz wariantu `-stable` — od tego jest `data-empty`.
- Kontrast (zmierzony): #6b4900 na #fff8e1 7.7:1, #5a3e00 na #fffbea 9.5:1, #b00020 na #fef2f3 6.7:1, #7c3f04 na #fff7ed 7.7:1, #3b5560 na #f5fafb 7.5:1; `.vilda-auth-side-note` #6a8089 na #f5fafb 3.9:1 — poniżej 4.5:1 (wartość źródła, bez zmian; tekst pomocniczy 12.5px), w wysokim kontraście przechodzi na `--hc-muted`.
- Wysoki kontrast zmienia tylko neutralną notatkę; bursztyn i czerwień zostają, bo niosą znaczenie.

Wersja statyczna, przepisana ręcznie z src/css/vilda_auth_ui.css (94-123, 178-187, 371-378, 497-503, 629-633, 1636-1645, 1712-1723, 1452-1471) oraz vilda_auth_ui.js (znacznik i treści).
