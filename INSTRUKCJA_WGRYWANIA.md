# Faza 5+6 v2 — naprawa rozjechanych stron

Po wdrożeniu Fazy 5+6 część stron (docpro, klirens, cukrzyca, steroidy, ustawienia) wyglądała wizualnie nieprawidłowo. **Diagnostyka i naprawa.**

## Co było źle

Dwa problemy nakładające się:

**Problem 1 — `<body class>` nie był synchronizowany.**

Strony aplikacji mają różne klasy na `<body>` które aktywują specyficzne style:

| Strona | body class |
|--------|-----------|
| index.html | (brak) |
| homa-ir.html | `js-loading liquid-ios26 has-sidebar` |
| materialy-edukacyjne.html | `js-loading liquid-ios26 has-sidebar edu-page` |
| docpro.html | (brak — ale ma duże inline style) |
| cukrzyca.html | `js-loading liquid-ios26 page-cukrzyca has-sidebar` |
| ustawienia.html | `js-loading liquid-ios26 page-settings has-sidebar` |
| steroidy.html | `js-loading liquid-ios26 has-sidebar` |
| kalkulator-klirens.html | `js-loading liquid-ios26 has-sidebar` |

Po Turbo nawigacji navigator podmieniał `.main-content` ale **nie ruszał** `<body>` ani jego klasy. Czyli po klik index → cukrzyca, body dalej miał `class=""` zamiast `class="page-cukrzyca has-sidebar"`. Reguły CSS typu `.page-cukrzyca .X { ... }` nie matchowały, strona traciła swój wygląd.

**Problem 2 — duże inline `<style>` bloki specyficzne dla strony.**

| Strona | inline `<style>` |
|--------|------------------|
| index.html | 3.2 KB |
| homa-ir.html | 5.6 KB |
| docpro.html | **33 KB** |
| ustawienia.html | 18 KB |
| kalkulator-klirens.html | **46 KB** |
| cukrzyca.html | **102 KB** |

Te bloki są w `<head>` strony — navigator ich nie podmieniał. Po klik index (3.2 KB inline) → cukrzyca, brakowało 102 KB stylów cukrzycy w head, więc strona „się rozjechała".

**Dlaczego index/homa/edu wyglądały OK:** te trzy strony nie mają specyficznej klasy `page-X` ani dużego inline `<style>` (tylko podstawowe critical CSS). Reszta wymaga.

## Co naprawiłem

W `vilda_navigator.js` dodałem dwie nowe funkcje synchronizujące, wywoływane przy każdej Turbo nawigacji:

**`syncBodyClass(newDoc)`:**
- Czyta klasy z `<body>` nowej strony
- Usuwa stare klasy z obecnego `<body>` (oprócz `js-loading` która jest dynamiczna)
- Dodaje nowe klasy
- Synchronizuje też atrybuty `data-*` z body

**`syncInlineStyles(newDoc)`:**
- Przy starcie aplikacji robi „snapshot" inline `<style>` w head (sygnatury 200 znaków)
- Te oryginalne style są chronione — nie usuwane
- Style dodane przez navigator z poprzedniej nawigacji są usuwane (oznaczone `data-vilda-nav-owned`)
- Nowe style z nowej strony są dodawane (jeśli ich sygnatura nie pokrywa się z istniejącymi)

Czyli zamiast nadmiarowego dublowania CSS przy każdej nawigacji, navigator zarządza tylko „swoimi" inline-style, oryginalne zostawia w spokoju.

## Lista zmienionych plików w paczce v2

Względem poprzedniej kompletnej paczki Fazy 5+6:

- `vilda_navigator.js` — wersja `?v=1` → `?v=2`. Dodane `syncBodyClass` i `syncInlineStyles`. Rozmiar: 15 KB → 19 KB.
- 15× HTML — bump `vilda_navigator.js?v=1` → `?v=2` (cache buster).
- `service-worker-kalorii.js` — bump `vilda_navigator.js?v=2` w precache, `SW_VERSION` `0.9.414` → `0.9.415`.

Wszystkie inne 96 plików identyczne jak w poprzedniej paczce 5+6.

## Jak wdrożyć

Wgraj **całą zawartość folderu** `wagaiwzrost_complete_faza5_6_v2/` (TYLKO zawartość, nie cały folder) do roota repo `vildaclinic.github.io`, nadpisując wszystko. Z `data/` jako podkatalog.

Commit + push. Poczekaj 1-2 min na build. Hard reload incognito.

## Weryfikacja po wgraniu

1. **Console:** `[vilda-nav] Aktywny — Turbo-style nawigacja.`
2. **Application → Service Workers:** wersja `0.9.415`
3. **Network filter `vilda_navigator`:** musi być `vilda_navigator.js?v=2` (nie `v=1`)

### Test wizualny (najważniejszy)

Każdy z 5 wcześniej rozjechanych testów:

1. **index → docpro** — czy DocPro wygląda jak przy bezpośrednim wejściu na URL?
2. **index → klirens** — czy klirens wygląda dobrze?
3. **index → cukrzyca** — czy cukrzyca wygląda dobrze (102 KB inline style)?
4. **index → steroidy** — czy steroidy wygląda dobrze?
5. **index → ustawienia** — czy ustawienia wygląda dobrze?

**Test referencyjny:** otwórz tę samą stronę bezpośrednim URL w nowej karcie incognito (bez Turbo). Wygląd powinien być **identyczny** jak po Turbo nawigacji.

### Test drugiego wejścia

Dodatkowo sprawdź:
- index → cukrzyca → index → cukrzyca — czy dalej wygląda dobrze?
- index → klirens → docpro → klirens — czy klirens po przeskoku przez docpro dalej wygląda dobrze?

## Co jeśli któraś strona dalej się rozjeżdża

Daj znać konkretnie:
- Która strona
- Co dokładnie wygląda inaczej (screenshot pomocny)
- W DevTools → Elements: jaka jest klasa `<body>` po nawigacji vs przy direct load
- W DevTools → Elements → `<head>`: czy są duplikaty `<style>` lub ich brak

Z tej informacji znajdę dokładny powód.

## Co dalej

Jak wszystkie strony wyglądają OK — to koniec planowanego scope (Faza 6 zakończona).

Zostaje jeszcze potencjalnie test funkcjonalny **drugiego wejścia** dla logiki JS (czy moduły działają po nawigacji powrotnej). Jeśli któryś moduł będzie miał problem (np. cukrzyca nie generuje zadań po drugim wejściu), wtedy quick fix przez `<meta name="vilda-no-turbo">` w head problematycznej strony.
