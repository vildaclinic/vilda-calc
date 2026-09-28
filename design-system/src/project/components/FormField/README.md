# FormField

Etykieta blokowa z polem tekstowym, liczbowym lub listą wyboru — podstawowe pole formularzy klinicznych (wiek, płeć, pomiary, dawki).

## Kiedy używać

- Do każdego wpisu danych pacjenta w kartach kalkulatorów: nazwisko, imię, wiek, płeć, wzrost, waga, obwód talii, dawka.
- Do pól wyliczanych z daty urodzenia (wiek w latach i miesiącach, ukończone tygodnie), które użytkownik tylko czyta.
- Gdy trzeba pokazać komunikat pomocniczy lub błąd bezpośrednio pod polem (`.vild-dob-note`, `.vild-dob-error`).
- Nie używać w oknach logowania i kartotece — tam obowiązuje `AuthInput`.

## Co dostarcza konsument

- Znacznik: `<label>Tekst etykiety (jednostka):<input …></label>` lub `<label>Płeć:<select><option>…</select></label>`. Etykieta jest `display:block`, a kontrolka `width:100%`, więc pole zawsze staje pod tekstem. Jednostkę wpisuje się w treść etykiety, np. `Obwód talii (cm):` — nie ma osobnej klasy sufiksu jednostki.
- Typy kontrolek objęte pełnym stylem: `input[type=text]`, `input[type=number]`, `select`. `textarea` dostaje tylko `touch-action` i reguły wysokiego kontrastu.
- Wiersz wieku: `<div class="vild-age-row"><label class="vild-age-years">Wiek (lata):<input class="vild-age-auto" readonly></label><label>Wiek (miesiące):<input class="vild-age-auto" readonly></label></div>`; opcjonalny `<div class="vild-dob-note">` pod wierszem.
- Podgrupa tygodni: `<div class="vild-weeks-row"><label for="ageWeeks">Wiek (ukończone tygodnie):<input type="number"></label><div class="vild-dob-error" role="alert">…</div></div>`.
- Siatki pomiarów: `.measure-row-top` (1fr 1fr 1fr), `.measure-row-bot` (1fr 1fr 34px), `.snack-row`/`.meal-row`/`.food-row` (1fr 100px 34px), separator `.measure-row-sep`, kontener `.flex` z `.half`.
- Wymagane `id`, gdy stan pochodzi z reguły z identyfikatorem: `#name`/`#advName` (wyłączony), `#dobInput` (tylko do odczytu), `#abxDoseInput` (wyłączony oraz `.dose-out-of-range`).
- Stany bez klasy: `:focus`, `[disabled]`, `[readonly]`. Stany z klasą: `.vild-age-auto`, `.vild-pole-z-kartoteki`, `.vild-range-invalid`, `.dose-out-of-range`.

## Warianty i stany

| Klasa / selektor | Wygląd |
| --- | --- |
| `label` | blok, `margin-top:.7rem`, `font-size:.95rem` |
| `input[type=number]`, `input[type=text]`, `select` | biel, tekst 1rem, `padding:.45rem .65rem`, obrys `1px solid #d0d7da`, promień `--radius` (12px); na szkle biel 85 % `#ffffffd9`, obrys `rgba(0,0,0,.12)`, promień 12px |
| `input:focus`, `select:focus` | obrys `--primary`, pierścień `0 0 0 2px #00838d40`, bez `outline` |
| `.user-card input`, `.user-card select` | Inter 1.05rem, `padding:.65rem .85rem`, promień .4rem, obrys `1px solid #c0c8c8` |
| `.vild-age-row input.vild-age-auto`, `input#dobInput[readonly]`, `input.vild-pole-z-kartoteki[readonly]`, `select.vild-pole-z-kartoteki[disabled]` | tło `#eef3f4`, obrys `#cfdcde`, tekst `#5a6f73` (pole tylko do odczytu) |
| `#name[disabled]`, `#advName[disabled]` | tło `#f1f5f5`, tekst `#6b7a7a` |
| `#abxDoseInput:disabled` | tło `#f5f5f5`, tekst `#6b7a7a`, obrys `#ccc`, `cursor:not-allowed` |
| `.vild-range-invalid` | obrys `--primary`, pierścień `0 0 0 3px #00838d24` (wartość poza zakresem siatki) |
| `#abxDoseInput.dose-out-of-range` | obrys `1px solid --danger` (#c62828) |
| `.vild-dob-note` | tekst .78rem `#0f6e56`, `margin-top:5px` |
| `.vild-dob-error` | tekst .78rem `#a32d2d`, `margin-top:5px` |
| `.vild-dob-clear` | przycisk-link .78rem `#00838d`, podkreślony, bez tła i obrysu |
| `.vild-weeks-row` | wyróżniona podgrupa: tło `#eaf4f5`, obrys `1px solid #cfe3e5`, promień 6px, `padding:9px 10px` |
| `.muted` | tekst pomocniczy `#6b7a7a`, .92rem |
| Wysoki kontrast (poziom 1–3) | tło `--hc-input-bg`, obrys `--hc-card-border-width solid --hc-input-border`, tekst `--hc-text`, cień `0 1px #ffffffb8,0 4px 12px #0000000d`; placeholder `--hc-muted`; `:focus-visible` daje `outline: --hc-focus-width solid --hc-focus-color` z odsunięciem 2px |

Responsywność: `.vild-age-row` przechodzi w kolumnę poniżej 360px; `.half` zajmuje 100 % szerokości poniżej 600px.

## Tokeny

`--primary`, `--radius`, `--danger`, `--hc-input-bg`, `--hc-input-border`, `--hc-card-border-width`, `--hc-text`, `--hc-muted`, `--hc-focus-width`, `--hc-focus-color`.

## Zasady

- Rób: zawsze opakowuj kontrolkę w `<label>` z tekstem i jednostką w nawiasie; komunikat błędu wstawiaj jako `.vild-dob-error` z `role="alert"`, a nie samym kolorem obrysu.
- Rób: pola wyliczone oznaczaj `readonly` plus klasą `.vild-age-auto` lub `.vild-pole-z-kartoteki`, żeby dostały szary wygląd i nie były edytowane.
- Nie rób: nie sygnalizuj zakresu wyłącznie kolorem — `.vild-range-invalid` (teal) i `.dose-out-of-range` (czerwień) wymagają tekstu pomocniczego (`.muted`, `.vild-dob-error`).
- Nie rób: nie nadpisuj `width:100%` na pojedynczym polu; szerokość reguluje siatka (`.measure-row-*`, `.vild-age-row`) albo `.half`.
- Kontrast: tekst pola `#333` na bieli; tekst pola tylko do odczytu `#5a6f73` na `#eef3f4`.
- Kontrast (zmierzony, motyw jasny): tekst pola `#333` na bieli 12,63:1; `.vild-dob-note` `#0f6e56` 6,20:1; `.vild-dob-error` `#a32d2d` na `#eaf4f5` 6,31:1; pole tylko do odczytu `#5a6f73` na `#eef3f4` 4,74:1. Poniżej 4,5:1 w źródle: `.muted` `#6b7a7a` na bieli 4,48:1, `#name[disabled]` `#6b7a7a` na `#f1f5f5` 4,08:1, `#abxDoseInput:disabled` `#6b7a7a` na `#f5f5f5` 4,11:1; na ciemnym tle 1 (`#f5f5f5`) `.muted` spada do 4,11:1. Wartości pozostawiono jak w źródle — tekst pomocniczy `.muted` nie może być jedynym nośnikiem informacji klinicznej.
- Wysoki kontrast zastępuje z `!important` tło, obrys i cień pola (także pól tylko do odczytu), więc szary wygląd `.vild-age-auto` znika — stan „tylko do odczytu" musi wynikać z atrybutu `readonly`.
- Na szkle pole nie dostaje rozmycia; promień rośnie do 12px, a obrys to `rgba(0,0,0,.12)`.
- Na szkle skrypt `ios26-ui.js` (glassify) dodatkowo nadaje polom tekstowym i listom styl inline `rgba(255,255,255,0.85)` / `rgba(0,0,0,0.12)` / 12px z `backdrop-filter:none` — te same wartości co reguła `.liquid-ios26` w arkuszu.
- Reguły z identyfikatorem (`#name`, `#advName`, `#dobInput`, `#abxDoseInput`) zachowano bez zmian; podgląd używa tych samych `id`.

Wersja statyczna, przepisana ręcznie z src/css/style.css (label, input/select, .measure-row*, .half, .user-card, #name[disabled], #abxDoseInput, .vild-range-invalid, .muted, high-contrast), src/css/ios26-v2.css (.liquid-ios26 input/select), src/html-styles/index.css (blok #4: .vild-age-row, .vild-age-auto, .vild-pole-z-kartoteki, .vild-dob-note, .vild-dob-error, .vild-dob-clear, .vild-weeks-row).
