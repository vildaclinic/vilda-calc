# PlanCard

Karta planu na stronie subskrypcji: dwie kolumny (`.sub-plans`) z kartą planu bezpłatnego (`.sub-plan`) i wyróżnioną kartą PRO (`.sub-plan--pro`) — nazwa, cena z sufiksem okresu, separator, lista cech z okrągłymi znacznikami i wezwanie do działania na całą szerokość.

## Kiedy używać

Wyłącznie na stronie `subskrypcja.html` do porównania planu bezpłatnego i Vilda PRO. Fioletowy zestaw `--pro-*` należy do funkcji PRO; nie używaj go do wyróżniania treści klinicznych. Do przycisków PRO w aplikacji użyj ProButton, do banerów zachęty Banner.

## Co dostarcza konsument

- `<div class="sub-plans" role="list">` z dwiema kartami `<div class="sub-plan" role="listitem" aria-label="Plan …">`; karta PRO dodaje klasę `sub-plan--pro` i `<span class="sub-plan__badge">★ Polecany</span>` jako pierwsze dziecko.
- Nagłówek `<div class="sub-plan__header">`: `<div class="sub-plan__name">` (w PRO gwiazda SVG i `<span class="sub-plan__name-pro">`), `<div class="sub-plan__price">49 zł <span>/ mies.</span></div>` (`id="subProPrice"` aktualizuje skrypt), opcjonalnie `<p class="sub-plan__price-trial">` i `<p class="sub-plan__price-note">`.
- `<hr class="sub-plan__sep">`, potem `<ul class="sub-plan__features">` z `<li>`: `<span class="sub-plan__check sub-plan__check--teal|--pro" aria-hidden="true">` z SVG znacznika (10×10, `viewBox 0 0 12 10`) i tekst cechy.
- Status próbny: `<div id="subTrialStatus" class="sub-trial-status" role="status" aria-live="polite">` z modyfikatorem `--success|--warn|--info|--error`; pusty element jest ukryty (`:not(:empty)` go pokazuje).
- CTA: `<a class="sub-plan__cta sub-plan__cta--secondary">` (plan bezpłatny) lub `<button type="button" class="sub-plan__cta sub-plan__cta--pro">`; po aktywacji skrypt dodaje `sub-plan__cta--active`. Pod CTA opcjonalny `<p class="sub-login-note">` z odnośnikiem.
- `subskrypcja.html` nie ma klasy `liquid-ios26` na `<body>`, więc szkło przycisków nie dotyczy CTA; działa natomiast globalna reguła `button` (`font:inherit`, hover z uniesieniem i cieniem `shadow-l`).

## Warianty i stany

| Klasa / selektor | Wygląd |
| --- | --- |
| `.sub-plans` | Siatka `1fr 1fr`, `gap 1.25rem`, `margin-bottom 3rem`, `align-items:start`; ≤640px jedna kolumna. |
| `.sub-plan` | Białe tło, obrys `1.5px solid #d0dede`, promień 16px, padding `1.75rem 1.5rem 1.5rem`, kolumna flex z `gap 1.1rem`, `position:relative`; ≤480px padding `1.5rem 1.1rem 1.25rem`. |
| `.sub-plan--pro` | Obrys `2px pro-color` (#9900ff), cień `pro-glow` (`0 0 0 4px rgba(153, 0, 255, 0.10), 0 12px 40px rgba(153, 0, 255, 0.18)`), gradient `180deg #fffaff 0% → #ffffff 60%`; separator `rgba(153, 0, 255, 0.12)`. |
| `.sub-plan__badge` | Wstążka nad górną krawędzią: `top −13px`, wyśrodkowana `translateX(-50%)`, gradient `90deg pro-dark → pro-color`, biały tekst 0.72rem 700, wersaliki, `letter-spacing .07em`, padding `.22rem .9rem`, promień 999px, cień `0 2px 8px rgba(153, 0, 255, 0.35)`. |
| `.sub-plan__name` / `.sub-plan__name-pro` | 1.05rem 700 `#1a2e30`, flex z `gap .35rem`; część PRO w `pro-color`. |
| `.sub-plan__price` | 2rem 700 `#1a2e30`, `line-height 1`, `letter-spacing −0.03em`; `span` okresu 1rem 500 `#5a7274`. |
| `.sub-plan__price-trial` / `.sub-plan__price-note` | Okres próbny 1rem 700 `pro-dark`, bez marginesu, `line-height 1.3`; notatka `.82rem` `#5a7274`, `line-height 1.4` (margines domyślny akapitu). Nagłówek `.sub-plan__header` to kolumna z `gap .35rem`. |
| `.sub-plan__sep` | Linia 1px `#e8eded`, bez marginesu i obrysu. |
| `.sub-plan__features li` | Flex od góry, `gap .5rem`, `.9rem` `#2e4a4c`, `line-height 1.4`; lista bez punktorów, `gap .55rem`, `flex:1`. |
| `.sub-plan__check--teal` / `--pro` | Koło 18px (`margin-top .05rem`): tło `#e0f5f5` z glifem `primary` albo tło `pro-light` z glifem `pro-color`. |
| `.sub-plan__cta` | Blok na całą szerokość, padding `.78rem 1rem`, promień 10px, `.97rem` 700, wyśrodkowany, bez obrysu, przejście `background .15s, transform .1s, opacity .15s`. |
| `.sub-plan__cta--secondary` | Tło `#f0f5f5`, tekst `primary`, obrys `1.5px #d0dede`; hover `#e0eded`. |
| `.sub-plan__cta--pro` | Gradient `135deg pro-dark → pro-color`, biały tekst, cień `0 4px 16px rgba(153, 0, 255, 0.30)`; hover (nie wyłączony) gradient `135deg #6600bb → pro-dark` i `translateY(-1px)` (globalna reguła `button:hover` dokłada cień `shadow-l`); `:active` `translateY(0)`; `:disabled` `opacity .65`, `cursor:default`, bez transformacji. |
| `.sub-plan__cta--active` | Po aktywacji: tło `#e8faf0`, tekst `#00693e`, obrys `1.5px #a3e6c3`, bez cienia, `cursor:default` (wszystko `!important`). |
| `.sub-trial-status--success` / `--warn` / `--info` / `--error` | `.84rem`, wyśrodkowany, padding `.5rem .75rem`, promień 8px: zielony `#e8faf0`/`#00693e`/`#a3e6c3`; bursztynowy `#fff8e6`/`#7a4f00`/`#ffd466`; niebieski `#e8f0fe`/`#1a3a8f`/`#93b4f7`; czerwony `#fde8e8`/`#9e1b1b`/`#f5a5a5`. |
| `.sub-login-note` | `.8rem` `#7a9999`, wyśrodkowany, `line-height 1.45`; odnośnik `primary` 600 bez podkreślenia, hover podkreślony. |

Wysoki kontrast, szkło i ciemne tło: źródło nie ma reguł dla kart planów; kolory `--pro-*` i `--primary` pochodzą z tokenów i nie zmieniają się w motywach.

## Tokeny

`--pro-color`, `--pro-dark`, `--pro-light`, `--pro-border`, `--pro-glow`, `--primary`, `--secondary`, `--radius`, `--shadow`, `--shadow-l`.

## Zasady

- Rób: dokładnie dwie karty, PRO po prawej; cena z sufiksem okresu w `span`; wszystkie cechy PRO zaczynaj od „Wszystko z planu bezpłatnego”.
- Rób: CTA w trybie rozkazującym („Rozpocznij 30 dni za darmo”, „Przejdź do aplikacji”); stan po aktywacji (`--active`) łącz z tekstem („Plan aktywny”) i statusem w `.sub-trial-status`.
- Rób: status próbny zostaw pusty, gdy nie ma komunikatu — element chowa się sam.
- Nie rób: nie mieszaj znaczników (`--teal` w planie bezpłatnym, `--pro` w PRO); nie dodawaj trzeciej karty; nie dodawaj `liquid-ios26` do strony subskrypcji.
- Kontrast: fiolet `#9900ff` służy obrysowi i glifom (5,5:1 na bieli), tekst PRO to `pro-dark` `#7700cc` na jasnym tle (7,7:1); treść cech `#2e4a4c` na bieli (9,6:1), biały tekst CTA PRO na `#7700cc → #9900ff` 7,9–5,5:1. Poniżej 4,5:1 w źródle: `.sub-login-note` `#7a9999` na bieli 3,07:1 oraz `.sub-plan__cta--secondary` `primary` `#00838d` na `#f0f5f5` 4,12:1 — wartości z aplikacji, nie zmieniane; nie umieszczaj w notatce logowania informacji, której nie ma gdzie indziej.
- Na szkle i w wysokim kontraście karta wygląda tak samo jak w motywie domyślnym.

Wersja statyczna, przepisana ręcznie z src/html-styles/subskrypcja.css (121-595, 1532-1541), src/css/style.css (569-583, 631-635, 659-663)
