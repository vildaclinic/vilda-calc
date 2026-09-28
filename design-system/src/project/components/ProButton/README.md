# ProButton

Rodzina akcentu PRO: biały przycisk w grubej fioletowej ramce `3px #9900ff`, indeks górny „PRO” w `#90f` i szare, zablokowane odpowiedniki dla funkcji niedostępnych w planie.

## Kiedy używać

Do przycisków i etykiet, które otwierają funkcje trybu profesjonalnego (zaawansowane obliczenia wzrostowe, rekomendacje żywieniowe, obwód głowy, wyniki profesjonalne) oraz do oznaczenia, że funkcja jest zablokowana bez subskrypcji. Fiolet `#9900ff`/`#90f` jest w aplikacji zarezerwowany wyłącznie dla PRO; nie używaj go do innych akcentów.

## Co dostarcza konsument

- Przycisk: `<button type="button" id="toggleAdvancedGrowth" class="advanced-growth-btn pro-button"><span>Etykieta</span><sup class="pro-superscript">PRO</sup></button>`. Ramka fioletowa i biel pochodzą wyłącznie z selektora `#toggleAdvancedGrowth.advanced-growth-btn` — sama klasa `advanced-growth-btn` nie ma reguły. Wariant z turkusową ramką: `id="toggleGrowthCalculations"` z klasami `advanced-growth-btn growth-calculations-btn` (bez PRO).
- Blokada: atrybut `disabled` na elemencie z klasą `pro-button` (reguła klasowa, działa bez `id`) albo klasa `disabled` na `#toggleAdvancedGrowth`; w karcie obwodu głowy klasa `is-pro-locked` na `.circ-result-action .circ-action-btn`.
- Etykieta z tagiem: `<span class="label-right pro-label">Wyniki profesjonalne<sup class="pro-tag">PRO</sup></span>` wewnątrz `#resultsModeToggleContainer`; poza nim użyj `<sup class="pro-superscript">PRO</sup>`.
- Pigułka: `<span class="circ-pro-pill">PRO</span>` po tekście etykiety.
- Link: `<a class="pro-link">DocPro</a>` (nawigacja).
- Karta PRO: klasa `pro-summary-card` na karcie podsumowania (ramka 3px) z ukrytą etykietą `.pro-summary-label`, pokazywaną w prawym górnym rogu.
- Przyciski diety: `#generateDietBtn`, `#dietRecommendationsPdfBtn` (ramka 3px), `#dietRecommendationsBtn`; w karcie tarczycy `#thyroidCancerKidsCard .thy-jump-cancer-preop`.

## Warianty i stany

| Klasa / selektor | Wygląd |
| --- | --- |
| `#toggleAdvancedGrowth.advanced-growth-btn` | Tło `#fff`, tekst `#000`, `border:3px solid #9900ff`, promień `radius` 12px, padding `.6rem 1.2rem`, `1rem`/600, `display:block`, `width:100%`, `margin:0 auto` (późniejsza reguła wspólna z przełącznikami sekcji powtarza `margin:0 auto!important`, a poniżej 699 px `margin:0!important`), wyśrodkowany. Pod szkłem te same wartości z `!important`, bez rozmycia i cienia. |
| `#toggleGrowthCalculations.advanced-growth-btn` | Jak wyżej, ale ramka `3px solid primary` #00838d (funkcja bezpłatna). |
| `.pro-button:disabled`, `.advanced-growth-btn.disabled`, `.is-pro-locked` | Tło `#f3f3f3`, tekst `#000`, ramka `3px solid #cccccc`, `cursor:not-allowed`, `pointer-events:none`, `opacity:1` (bez wyszarzenia tekstu); `is-pro-locked` dodatkowo zeruje cień i transformację. |
| `.pro-superscript`, `.adv-pro-tag`, `#resultsModeToggleContainer .pro-label .pro-tag` | Kolor `#90f`, `font-size:.55em`, waga 700, `vertical-align:super`, `margin-left:.1rem`. W stanie zablokowanym pozostaje fioletowy. W przycisku obwodu głowy (`.circ-result-action .circ-action-btn .pro-superscript`) dodatkowo `display:inline`. |
| `#resultsModeToggleContainer .pro-label` | Tekst `#90f`, `position:relative`. |
| `.circ-pro-pill` | `inline-block`, `margin-left:.18rem`, padding `.02rem .35rem`, promień 999px, tło `#6a1b9a`, tekst `#fff`, `.72rem`/700, `letter-spacing:.04em`. |
| `.pro-link` | Tekst `#90f`, waga 600, bez podkreślenia; hover/focus `#b34af7` z podkreśleniem. |
| `.pro-summary-card` | `border:3px solid #9900ff !important` (również pod szkłem); `.pro-summary-label` to fioletowa plakietka `#90f`/`#fff`, `.8rem`, promień 4px, padding `.5rem`, widoczna tylko w karcie (`top:.5rem; right:.5rem`). |
| `#generateDietBtn`, `#dietRecommendationsPdfBtn` | Ramka `3px solid #9900ff`; w panelu rekomendacji blok pełnej szerokości, padding `.55rem 1rem`, `.95rem`/600, promień `radius`; PDF na białym tle z czarnym tekstem. |
| `#thyroidCancerKidsCard .thy-jump-cancer-preop` | Ramka `3px solid #9900ff !important` (baza i szkło). |

Wysoki kontrast i ciemne tło nie mają osobnych reguł dla tej rodziny; wartości są wpisane na stałe z `!important`, więc wyglądają tak samo w każdym motywie.

## Tokeny

`--primary` (ramka wariantu bezpłatnego), `--radius`. Fiolety `#9900ff`, `#90f`, `#b34af7`, `#6a1b9a` oraz szarości `#f3f3f3`, `#cccccc` są w źródle wpisane literalnie.

## Zasady

- Rób: zawsze łącz przycisk PRO z indeksem `PRO` w treści, a zablokowany stan z `disabled` — użytkownik ma rozumieć, dlaczego przycisk jest szary, bez polegania na kolorze.
- Rób: zachowaj `opacity:1` w stanie zablokowanym; czytelność etykiety jest ważniejsza niż konwencja wyszarzenia.
- Nie rób: nie stosuj fioletu do elementów niezwiązanych z planem PRO; nie zmieniaj grubości ramki (3px jest sygnaturą rodziny).
- Nie rób: nie licz na klasę `advanced-growth-btn` bez `id` — źródło styluje po identyfikatorze; w nowym miejscu dodaj regułę na własnym `id` z tymi samymi wartościami albo użyj `pro-button` tylko dla stanu zablokowanego.
- Kontrast (zmierzony): `#000` na `#fff` 21:1 i na `#f3f3f3` 18,9:1; `#90f` na bieli 5,5:1 (spełnia AA), ale przy `.55em` tag jest bardzo mały, dlatego towarzyszy zawsze pełnej etykiecie; `#fff` na `#6a1b9a` (pigułka) 9,4:1.
- Na szkle: rodzina jawnie wyłącza `backdrop-filter` i `box-shadow`, więc pozostaje nieprzezroczysta na każdym poziomie szkła.

Wersja statyczna, przepisana ręcznie z src/css/style.css (1053-1066, 1150-1160, 1702-1722, 1767-1786, 1791-1795, 1799-1831, 1836-1863, 1866-1869, 1872-1899, 1996-2004, 3226-3227, 4825-4826), src/css/ios26-v2.css (118-119)
