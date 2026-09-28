# ObesityBanner

Wbudowana w kartę wyników karta-alert z bursztynowym dyskiem ostrzeżenia i turkusową pigułką wezwania: kieruje do panelu diagnostycznego otyłości u dzieci, gdy BMI pacjenta na to wskazuje.

## Kiedy używać

Tylko w karcie wskaźnika Cole'a na `index.html`, gdy `vilda_update_prep.js` (funkcja `coleObesityKidsBanner`) uzna wynik za otyłość u dziecka. Skrypt buduje znacznik i wstawia go przez `vildaAppSetTrustedHtml`; atrybut `title` wymienia badania pierwszego rzutu dla wieku pacjenta. Nie używaj do innych komunikatów — dla nich są `Notice` i `Callout`.

## Co dostarcza konsument

- `<div class="vilda-obesity-banner" title="…">` z trzema dziećmi w tej kolejności:
  - `<span class="vilda-obesity-banner__icon" aria-hidden="true">` z ikoną trójkąta ostrzegawczego (SVG 24, `stroke-width="2.4"`, `stroke="currentColor"`);
  - `<div class="vilda-obesity-banner__content">` z `<div class="vilda-obesity-banner__title">` i opcjonalnym `<div class="vilda-obesity-banner__sub">`;
  - `<a class="vilda-obesity-banner__btn" href="przelicznik-jednostek.html?wskazanie=obesity_kids">Otwórz panel →</a>`.
- Treść z aplikacji: „Sprawdź informacje o otyłości u dzieci w panelu diagnostycznym"; `title`: „Zalecane badania pierwszego rzutu (wiek 8,3 lat): TSH, 25-OHD, glukoza na czczo, lipidogram, ALT/AST (skrining MASLD)."

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.vilda-obesity-banner` | flex, odstęp 10 px, margines górny .75rem, wypełnienie 8px 12px 8px 10px, tło #fff, promień `--chrome-radius-card` (14 px), obrys 1 px rgba(0,131,141,.18), cień 0 2px 8px #00515814, font systemowy 12.5px/1.4, tekst #1f2937 |
| `.vilda-obesity-banner__icon` | dysk 30 px, gradient 135° #b45309 → #f59e0b, ikona biała 16 px |
| `.vilda-obesity-banner__title` | waga 600, #1f2937 |
| `.vilda-obesity-banner__sub` | 11.5px, #6b7280, margines górny 1 px |
| `.vilda-obesity-banner__btn` | pigułka 999 px, 6px 12px, gradient 135° `--primary` → `--secondary`, biały 12px waga 500, cień 0 1px 3px #00838d2e |
| `__btn:hover` | `translateY(-1px)`, cień 0 2px 6px #00838d40; `:active` wraca do 0 |
| ≤599 px | zawijanie, wyrównanie do góry, wypełnienie 8px 10px; przycisk na 100 % szerokości, wyśrodkowany, margines górny 8 px |
| `prefers-color-scheme: dark` | te same jasne wartości (tło #fff, tekst #1f2937), mocniejszy obrys #00838d40 i cień 0 2px 8px #00000059 — baner celowo nie ciemnieje |
| `prefers-reduced-motion` | bez przejścia i bez uniesienia na `:hover` |

Wysoki kontrast, szkło i ciemne tło: brak osobnych reguł; białe tło i własny obrys czynią go czytelnym na każdym motywie.

## Tokeny

`--chrome-radius-card`, `--primary`, `--secondary`.

## Zasady

- Rób: zostaw ikonę z `aria-hidden`, a znaczenie nieś tytułem; link ma być czasownikiem ze strzałką („Otwórz panel →").
- Rób: pełną listę badań trzymaj w `title` lub w `__sub`, nie w tytule.
- Nie rób: nie zmieniaj gradientu dysku — bursztyn odróżnia go od turkusowego CTA.
- Nie rób: nie zamieniaj `<a>` na `<button>` — globalna reguła szkła zmieniłaby pigułkę w białą.
- Kontrast (zmierzony): #1f2937 na białym 14.7:1; #6b7280 na białym 4.8:1; biały na gradiencie pigułki: 4.5:1 przy końcu #00838d i 2.7:1 przy końcu #00b0a6 — poniżej 4.5:1 (wartość źródła, bez zmian); tekst pigułki jest krótki i ma wagę 500.

Wersja statyczna, przepisana ręcznie z src/css/vilda_obesity_banner.css (cały plik) oraz vilda_update_prep.js (`coleObesityKidsBanner`, znacznik i treści).
