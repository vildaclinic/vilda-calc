# AuthInput

Pola logowania i kartoteki (`vilda_auth_ui`): biały input 16px z promieniem 12px, lista wyboru z własną strzałką, pole kodu odzyskiwania, wiersz zgody z polem wyboru, pole szukania i miernik siły hasła.

## Kiedy używać

- W oknach konta: logowanie, tworzenie konta, zmiana hasła, odtwarzanie z kopii `.wiw`, klucz odzyskiwania.
- W kartotece pacjentów: pole szukania z licznikiem wyników i komunikatem pustej listy.
- Nie używać w kartach kalkulatorów — tam obowiązuje `FormField` (inne wymiary i promień).

## Co dostarcza konsument

- Pole: `<input class="vilda-auth-input" type="text|password|email" placeholder="…">`. Rozmiar 16px zapobiega powiększaniu strony na iOS.
- Lista: `<select class="vilda-auth-input">` — własna strzałka SVG (`data:` URI) po prawej, `padding-right:40px`.
- Kod odzyskiwania: `<input class="vilda-auth-input vilda-auth-recovery-input" placeholder="XXXX-XXXX-XXXX-XXXX-XXXX-XXXX">` — monospace, wielkie litery, wyśrodkowany.
- Hasło z podglądem: `<div class="vilda-auth-pw-wrap" style="position:relative;display:block;margin:inherit"><input class="vilda-auth-input" type="password" style="padding-right:44px"><button class="vilda-auth-pw-toggle" aria-label="Pokaż hasło" aria-pressed="false">…svg…</button></div>`. Pozycję i wymiary przycisku (`position:absolute;right:6px;top:50%;width:40px;height:24px;color:#5b6672`) nadaje skrypt stylem inline; arkusz zeruje tylko tło, obrys, cień i `outline` z `!important`.
- Miernik: `<div class="vilda-auth-meter-wrap"><div class="vilda-auth-meter"><div class="vilda-auth-meter-fill" data-strength="good" style="width:70%"></div></div><span class="vilda-auth-meter-label">Siła hasła: dobra</span></div>`. Szerokość wypełnienia ustawia skrypt (`style="width:N%"`), kolor wynika z `data-strength`.
- Wiersz zgody: `<label class="vilda-auth-checkbox-row"><input type="checkbox"><span class="vilda-auth-checkbox-label">Zapisałem klucz odzyskiwania w bezpiecznym miejscu</span></label>`.
- Szukanie: `<div class="vilda-auth-search-wrap"><input class="vilda-auth-search-input" type="search" placeholder="Szukaj pacjenta…"><div class="vilda-auth-search-counter">…</div></div>`; pusta lista: `<div class="vilda-auth-search-empty">…</div>` (atrybut `hidden` ukrywa z `!important`).
- Stany bez klasy: `:focus`, `::placeholder`, `[hidden]`; wysoki kontrast przez klasę na `body`.

## Warianty i stany

| Klasa / selektor | Wygląd |
| --- | --- |
| `.vilda-auth-input` | biel, `padding:14px 16px`, promień 12px, obrys `1.5px solid #d6dde0`, tekst 16px `#08202c`, `line-height:1.5` |
| `.vilda-auth-input::placeholder` | `#9ca8ad` |
| `.vilda-auth-input:focus` | obrys `#00838d`, pierścień `0 0 0 4px #00838d1f`, bez `outline` |
| `select.vilda-auth-input` | bez natywnej strzałki, własny chevron `#9ca8ad` 16px przy prawej krawędzi (14px), `padding-right:40px` |
| `.vilda-auth-recovery-input` | SF Mono/Menlo/Consolas, `letter-spacing:.08em`, wielkie litery, wyśrodkowanie, 15px |
| `.vilda-auth-search-input` | jak pole, ale `padding:12px 14px`; placeholder `#6c8084`; focus: obrys `#00838d`, pierścień `0 0 0 3px #00838d26` |
| `.vilda-auth-search-counter` | 12px `#6c8084`, wyrównany do prawej, pełna szerokość |
| `.vilda-auth-search-empty` | 14px kursywa `#6c8084`, `padding:28px 16px`, wyśrodkowany |
| `.vilda-auth-checkbox-row` | tło `--vilda-surface-alt` (domyślnie `#f5f7fa`), promień 8px, `padding:12px 14px`, odstęp 10px; pole 18px z `accent-color: --vilda-primary` (#00838d) |
| `.vilda-auth-checkbox-label` | 14px, `line-height:1.4`, `--vilda-text` (#1a1a1a) |
| `.vilda-auth-meter` | tor 6px `#eef2f3`, promień 4px |
| `.vilda-auth-meter-fill[data-strength]` | `very-weak` #b00020, `weak` #e57c2c, `fair` #d4a30b, `good` #5fa84a, `strong` #1f8a3a, `very-strong` #00838d; etykiety w aplikacji: bardzo słaba, słaba, średnia, dobra, silna, bardzo silna |
| `.vilda-auth-meter-label` | 12px `#6a8089`, bez zawijania |
| `.vilda-auth-pw-wrap .vilda-auth-pw-toggle` | tło przezroczyste, bez obrysu i cienia, `transform:translateY(-50%)`; `:focus-visible` daje `outline:2px solid rgba(0,131,141,.35)` do wewnątrz |
| Wysoki kontrast (poziom 1–3) | pole, pole szukania i kod: tło `--hc-input-bg`, obrys `--hc-card-border-width solid --hc-input-border`, tekst `--hc-text`; focus: obrys `#00838da6`, pierścień `0 0 0 --hc-focus-width --hc-focus-color`; miernik i wiersz zgody: tło `--hc-surface`, rozmycie `--hc-blur`, cień `--hc-shadow`; etykieta miernika, licznik i pusta lista: `--hc-muted` |

## Tokeny

`--vilda-surface-alt`, `--vilda-primary`, `--vilda-text` (z wartościami zapasowymi w regule), `--hc-input-bg`, `--hc-input-border`, `--hc-card-border-width`, `--hc-text`, `--hc-muted`, `--hc-focus-width`, `--hc-focus-color`, `--hc-surface`, `--hc-blur`, `--hc-shadow`. Pozostałe kolory (`#d6dde0`, `#9ca8ad`, `#6c8084`, `#eef2f3`, skala siły hasła) są literałami w źródle.

## Zasady

- Rób: zachowuj 16px w polu — mniejszy rozmiar powoduje powiększanie strony na telefonie.
- Rób: sile hasła zawsze towarzyszy tekst (`Siła hasła: dobra`); sam kolor paska nie wystarcza.
- Rób: przycisk podglądu hasła oznaczaj `aria-label` i `aria-pressed`; ikonę oka wstawiaj jako SVG z `stroke="currentColor"`.
- Nie rób: nie mieszaj `.vilda-auth-input` z `FormField` w jednym formularzu — różnią się promieniem (12px vs `--radius`), obrysem (1.5px vs 1px) i rozmiarem tekstu.
- Nie rób: nie usuwaj `.vilda-auth-search-counter` po zerowej liczbie wyników — ma `min-height:1em`, żeby układ nie skakał.
- Kontrast (zmierzony, motyw jasny): tekst pola `#08202c` na bieli 16,76:1; etykieta zgody `#1a1a1a` na `#f5f7fa` 16,22:1. Poniżej 4,5:1 w źródle: placeholder `#9ca8ad` na bieli 2,44:1 (podpowiedź, nie etykieta — etykietę daje kontekst okna), etykieta miernika `#6a8089` 4,15:1, licznik, pusta lista i placeholder pola szukania `#6c8084` 4,15:1; na ciemnym tle 1 (`#f5f5f5`) te szarości spadają do 3,81:1. Wartości pozostawiono jak w źródle; w wysokim kontraście zastępuje je `--hc-muted` (poziom 2: 9,96:1).
- W wysokim kontraście obrys pola grubieje do `--hc-card-border-width`, a pierścień focus przechodzi na `--hc-focus-color`; wiersz zgody i tor miernika dostają powierzchnię `--hc-surface` z cieniem.
- Na szkle pola auth nie mają osobnych nadpisań `.liquid-ios26` — pozostają białe; tylko przycisk podglądu hasła wymusza brak tła i cienia z `!important`, żeby motyw nie zrobił z niego pigułki.

Wersja statyczna, przepisana ręcznie z src/css/vilda_auth_ui.css (.vilda-auth-input, select.vilda-auth-input, .vilda-auth-recovery-input, .vilda-auth-checkbox-row, .vilda-auth-checkbox-label, .vilda-auth-search-*, .vilda-auth-meter*, .vilda-auth-pw-wrap .vilda-auth-pw-toggle, reguły high-contrast) oraz stylów inline z vilda_auth_ui.js dla .vilda-auth-pw-wrap i .vilda-auth-pw-toggle.
