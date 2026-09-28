# CookieBanner

Przypięty do dołu ekranu biały pasek zgody na analitykę (`#consent-banner.cookie-banner`) z cieniem ku górze, akapitem z linkami do ustawień i polityki prywatności oraz dwoma przyciskami: zgody i odmowy.

## Kiedy używać

Tylko jako baner zgody na Google Analytics; buduje go `vilda_chrome.js` (funkcja `Tt`) i dopisuje do `<body>` na stronach z powłoką, pomijając `html.vilda-embedded`. Skrypt pokazuje go (`style.display="block"`), dopóki zgoda nie zostanie zapisana, i chowa po kliknięciu. Nie używaj do innych komunikatów systemowych — od nich jest `Banner`.

## Co dostarcza konsument

- `<div id="consent-banner" class="cookie-banner">` z `<p>` (treść z `<strong>Vilda Clinic</strong>` i linkami `<a href="ustawienia.html">`, `<a href="polityka-prywatnosci.html">`) oraz `<div class="cookie-buttons">` z `<button id="consent-accept">Akceptuję analitykę</button>` i `<button id="consent-decline">Nie zgadzam się</button>`.
- Opcjonalna lista `.cookie-banner ul` (dysk, wcięcie 1.2rem, margines dolny 1rem).
- Wymagane `id`: `consent-banner`, `consent-accept`, `consent-decline` — selektory z `id` zachowano w partialu i w podglądzie.
- Arkusz ukrywa baner (`display:none`); w powłoce osadzonej z otwartym ekranem konta (`.vilda-embedded body.vilda-auth-embedded-open`) jest ukrywany `!important`.

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.cookie-banner` | fixed u dołu, szerokość 100 %, tło #fff, cień 0 -2px 8px #0000001a, wypełnienie 1rem, .9rem, z-index 10000 |
| `.cookie-buttons` | flex, odstęp 1rem, do lewej |
| `.cookie-buttons button` | bez obrysu, .5rem 1rem, promień 4 px, .9rem |
| `#consent-accept` | tło #007c8d (nie `--primary` #00838d), biały tekst |
| `#consent-decline` | tło #e0e0e0, tekst #333 |

Brak reguł `:hover` i `:focus` własnych; przyciski są zwykłymi `<button>`, więc na szkle (zawsze włączonym) globalna reguła `.liquid-ios26 button` zamienia oba w białe pigułki `#fff3` z obrysem `--lg-border`, promieniem 14 px i tekstem #111 — tak wygląda baner w aplikacji, kolory #007c8d/#e0e0e0 są widoczne tylko bez klasy `liquid-ios26`. Poniżej 600 px globalna reguła rozciąga przyciski na 100 % z odstępem górnym .5rem. Wysoki kontrast i ciemne tło: brak osobnych reguł.

## Tokeny

Reguły własne nie używają tokenów (literalne #fff, #0000001a, #007c8d, #e0e0e0, #333). Przez globalne reguły przycisków: `--radius`, `--primary`, `--secondary`, `--shadow`, `--shadow-l`, `--lg-border`.

## Zasady

- Rób: treść po polsku, jedna informacja o celu, anonimizacji i możliwości wycofania zgody; linki do Ustawień i Polityki prywatności.
- Rób: przycisk zgody pierwszy, odmowy drugi; oba jako `<button>` z `id`.
- Nie rób: nie zmieniaj `display` w arkuszu — widocznością steruje skrypt po sprawdzeniu zapisanej zgody.
- Nie rób: nie dodawaj innej pozycji niż dół ekranu; `ios26-ui.js` mierzy wysokość banera, żeby unieść dolny dock.
- Kontrast: tekst .9rem w kolorze `--text` (#333) na białym ≈ 12.6:1; pigułki szkła z tekstem #111 na białym ≈ 18:1.
- W podglądzie baner pokazano w przepływie: nadpisano wyłącznie `position`, a `display:block` ustawiono inline tak, jak robi to skrypt.

Wersja statyczna, przepisana ręcznie z src/css/style.css (3130-3160), src/css/vilda_auth_ui.css (1621) oraz vilda_chrome.js (funkcja Tt: znacznik i treść).
