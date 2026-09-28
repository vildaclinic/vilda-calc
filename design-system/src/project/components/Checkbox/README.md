# Checkbox

Pole wyboru w dwóch postaciach: duży własny kwadrat bramki profesjonalnej (`.doctor-checkbox`) oraz natywne pole wewnątrz obramowanego chipu ankiety żywieniowej (`.diet-survey-chip`).

## Kiedy używać

- `.doctor-checkbox` z `.doctor-label` i `.doctor-subtitle`: jedno, ważne potwierdzenie („Jestem lekarzem") odblokowujące moduł profesjonalny.
- `.diet-survey-chip`: listy wielokrotnego wyboru w ankiecie nawyków (siatka `.diet-survey-grid`, dwie kolumny).
- Zgody w oknach konta używają `AuthInput` (`.vilda-auth-checkbox-row`), nie tego komponentu.

## Co dostarcza konsument

- Bramka: `<div class="doctor-wrapper"><label class="doctor-label" for="isDoctor">Jestem lekarzem</label><span class="doctor-subtitle">Zaznacz, aby odblokować moduł profesjonalny</span><input type="checkbox" id="isDoctor" class="doctor-checkbox"></div>`. Kolejność: etykieta, podtytuł, pole — wszystko wyśrodkowane w kolumnie. Modyfikator `.doctor-wrapper.compact` zmniejsza pole i teksty.
- Chip: `<label class="diet-survey-chip"><input type="checkbox" name="habit" value="…"><span>Słodycze codziennie</span></label>` w `<div class="diet-survey-grid">`. Tekst musi być w `<span>`, bo to on dostaje `overflow-wrap:anywhere`.
- Kontener bramki na stronie: `#professionalModule` (obrys `#d0dede`, promień `--radius`, cień `--shadow`) z `.professional-message` i `h3` w czerwieni `#ce0000`; pole numeru PWZ w `#pwzContainer` (etykieta w kolumnie, pole do 320px).
- Stany bez klasy: `:checked` (obie postacie), `:has(input:checked)` na chipie. Brak własnego stylu `:focus` — obowiązuje domyślny pierścień przeglądarki, a w wysokim kontraście `outline` z reguły `input:focus-visible`.
- Uwaga: globalna reguła `input{width:100%}` obejmuje też natywne pola wyboru, dlatego chip wymusza `width:1.05rem!important`.

## Warianty i stany

| Klasa / selektor | Wygląd |
| --- | --- |
| `.doctor-checkbox` | 28×28px, `appearance:none`, obrys `2px solid --primary`, promień 4px, `margin-top:.6rem`, kursor wskazujący |
| `.doctor-checkbox:checked` | wypełnienie `--primary`; ptaszek z `:after` — biały obrys 6×12px (`border-width:0 2px 2px 0`) obrócony o 45°, `left:7px; top:3px` |
| `.doctor-label` | 1.425rem, `--primary`, waga 500, wyśrodkowany, `line-height:1.2` |
| `.doctor-subtitle` | 1.175rem, `--primary`, waga 400, wyśrodkowany |
| `.doctor-wrapper.compact` | pole 24×24px (`margin-top:.4rem`), etykieta 1.175rem, podtytuł .925rem |
| `.diet-survey-chip` | siatka `1.05rem minmax(0,1fr)`, odstęp .45rem, `padding:.48rem .55rem`, obrys `1px solid #dedede`, promień .65rem, biel, tekst .86rem, `line-height:1.25` |
| `.diet-survey-chip input[type=checkbox]` | natywne pole 1.05rem, `accent-color:#9900ff`, `margin:.08rem 0 0` |
| `.diet-survey-chip:has(input:checked)` | obrys `#90f`, tło `#9900ff12` |
| `#dietRecommendationsContent .diet-survey-chip input[type=checkbox]` | `accent-color: --diet-ui-accent` (#9900ff) |
| `#professionalModule`, `.professional-message` | kontener: `margin-top:1.4rem`, obrys `#d0dede`, cień `--shadow`; komunikat: Inter .98rem, waga 600, `#ce0000` |

## Tokeny

`--primary`, `--radius`, `--shadow`, `--diet-ui-accent`. Fiolet chipu (`#9900ff`, `#90f`, `#9900ff12`) i czerwień komunikatu (`#ce0000`) są literałami w źródle.

## Zasady

- Rób: bramkę profesjonalną zawsze z tekstem etykiety i podtytułem — samo pole 28px bez opisu nie mówi, co odblokowuje.
- Rób: w chipie utrzymuj tekst w `<span>` i pozwalaj mu zawijać się w dwóch kolumnach; nie skracaj etykiet nawyków.
- Nie rób: nie stosuj `.doctor-checkbox` do zwykłych zgód ani list — to element jednorazowy o dużej skali.
- Nie rób: nie ustawiaj `display:none` na `.doctor-checkbox` w widoku, który ma być klikalny (strona DocPro ukrywa je celowo, bo zaznacza automatycznie).
- Kontrast (zmierzony, motyw jasny): `.doctor-label`/`.doctor-subtitle` `#00838d` na bieli 4,53:1 (na ciemnym tle 1 `#f5f5f5` 4,16:1 — wartość źródła); tekst chipu `#333` na bieli 12,63:1, na tle zaznaczonym `#9900ff12` 11,16:1. Fiolet `#9900ff` chipu jest kolorem PRO/diety, nie stanem błędu.
- W wysokim kontraście pola wyboru nie mają własnych reguł: obrys i wypełnienie bramki zostają teal, chip zostaje biały z fioletem; pierścień focus pochodzi z globalnej reguły `input:focus-visible` (`--hc-focus-width solid --hc-focus-color`).
- Na szkle brak nadpisań `.liquid-ios26` dla tych pól — wygląd jak w motywie jasnym.
- Selektory z identyfikatorem zachowano: `#professionalModule`, `#pwzContainer`, `#dietRecommendationsContent`; podgląd używa `id="isDoctor"` z aplikacji.

Wersja statyczna, przepisana ręcznie z src/css/style.css (#professionalModule, .professional-message, .doctor-wrapper, .doctor-checkbox, .doctor-label, .doctor-subtitle, .doctor-wrapper.compact, #pwzContainer, .diet-survey-grid, .diet-survey-chip, #dietRecommendationsContent .diet-survey-chip input).
