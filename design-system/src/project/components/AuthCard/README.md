# AuthCard

Pełnoekranowa powłoka logowania i sejfu (`vilda_auth_ui.js`): biały korzeń z dwoma bladymi promienistymi poświatami teal, w którym stoi przezroczysta kolumna 540 px z marką, tytułem ekranu, listą kont, kluczem odzyskiwania i odnośnikami.

## Kiedy używać

- Ekrany konta i sejfu przed odblokowaniem danych: wybór konta („Kto się loguje?"), logowanie hasłem, zakładanie konta w krokach („Krok 1 z 4" … „Krok 4 z 4"), klucz odzyskiwania, import i synchronizacja.
- Wariant osadzony `.vilda-embedded` (ramka w `app.html`): marka znika, korzeń traci górny margines bezpieczny, nakładka ma 14 px od góry.
- Poza ekranami konta nie używaj tych klas; sekcje formularzy w kartach klinicznych mają własne komponenty (`Card`, `FormField`).

## Co dostarcza konsument

- Drzewo budowane w skrypcie: `<div class="vilda-auth-root" aria-live="polite">` → `<div class="vilda-auth-overlay">` → `<div class="vilda-auth-card" role="dialog" aria-modal="true">` → `.vilda-auth-brand` + `.vilda-auth-screen`.
- Marka: `<div class="vilda-auth-brand">` z opcjonalnym `<img class="vilda-auth-logo" src="logo_vilda.webp" width="480" height="293">`, `<h1 class="vilda-auth-brand-name">wagaiwzrost.pl</h1>` i `<p class="vilda-auth-brand-tag">Vilda Clinic</p>`; opcja `noLogo` pomija obraz.
- Ekran: `<div class="vilda-auth-screen vilda-auth-login|vilda-auth-setup|vilda-auth-startup">` z kolejno `.vilda-auth-step` (tylko w krokach), `<h2 class="vilda-auth-title">`, `<p class="vilda-auth-subtitle">`, treścią i `.vilda-auth-links`.
- Lista kont: `<div class="vilda-auth-user-list">` z przyciskami `<button class="vilda-auth-user-card" type="button" title="Zaloguj jako …" data-has-passkey="0|1">` zawierającymi `.vilda-auth-user-avatar` (pierwsza litera nazwy), `.vilda-auth-user-info` (`.vilda-auth-user-name`, opcjonalnie `.vilda-auth-user-passkey-badge` z ikoną kłódki 12 px i nazwą metody, `.vilda-auth-user-meta` „Ostatnio: …") oraz `<span class="vilda-auth-user-arrow" aria-hidden="true">›</span>`.
- Klucz odzyskiwania: `<div class="vilda-auth-recovery-key">` z samym ciągiem klucza. Notatka: `<div class="vilda-auth-info">` z pogrubionym nagłówkiem (styl inline `font-weight:600; color:#08202C; margin-bottom:6px;`) i akapitem `<p class="vilda-auth-side-note">` — w aplikacji stoi na ekranach kopii zapasowych i importu („Masz już zapisaną bazę pacjentów?”), nie pod kluczem odzyskiwania; podgląd łączy ją z ekranem klucza tylko dla pokazania obu bloków. Separator: `<div class="vilda-auth-divider"><span>lub</span></div>`.
- Odnośniki: `<div class="vilda-auth-links"><a class="vilda-auth-link" href="#">← Wybierz inne konto</a></div>`; wariant wyciszony dodaje `vilda-auth-link-muted` („Zapomniałem hasła").
- Stan zajętości: `data-busy="1"` na korzeniu wygasza kartę (`opacity:.6`, bez zdarzeń wskaźnika). Element z atrybutem `hidden` w liście jest ukrywany `!important`.
- Korzeń jest w aplikacji `position:fixed; inset:0; z-index:999999` i pokazywany skryptem przez `style.display`; w podglądzie pozycja jest nadpisana na `relative` (tylko pozycja i `flex:0 0 auto`, żeby kolumna nie przewijała się wewnątrz ramki), `display:block` ustawiony inline tak, jak robi to skrypt, a strona podglądu ma 16 px marginesu, żeby biały korzeń było widać na tle motywu (w aplikacji zakrywa cały ekran).

## Warianty i stany

| Klasa | Wygląd |
| --- | --- |
| `.vilda-auth-root` | tło #fff, Inter, tekst #08202c, przewijanie pionowe, wypełnienie górne/boczne z `env(safe-area-inset-*)` |
| `.vilda-auth-overlay` | kolumna wyśrodkowana, `min-height:100vh`, wypełnienie 56px 24px 48px (≤520px: 32px 18px 28px), dwie poświaty `rgba(0,131,141,.05)` i `.04` na #fff; dolne wypełnienie rośnie o wysokość doku (`--vilda-shell-dock-h`, `--mobile-dock-visible-lift`) |
| `.vilda-auth-card` | szerokość 100%, `max-width:540px`, przezroczysta, bez cienia; z kartą pacjenta `:has(.vilda-auth-patient-card)` 675 px (≥760px) i 880 px (≥1200px) |
| `.vilda-auth-root[data-busy="1"] .vilda-auth-card` | `opacity:.6`, `pointer-events:none` |
| `.vilda-auth-brand` / `.vilda-auth-logo` | kolumna wyśrodkowana, margines dolny 32px; logo do 180 px (≤520px: 140 px), promień 14 px |
| `.vilda-auth-brand-name` | 22px/600 #00838d, `letter-spacing:-.01em` (≤520px: 19px) |
| `.vilda-auth-brand-tag` | 11px/500 #6a8089, wersaliki, `letter-spacing:.18em` (≤520px: 10px/.16em) |
| `.vilda-auth-screen` | kolumna flex z odstępem 18px |
| `.vilda-auth-step` | 11px/600 #00838d, wersaliki, `.18em`, wyśrodkowany, margines dolny -8px |
| `.vilda-auth-title` | 28px/600 #08202c, `line-height:1.2`, `-.015em`, wyśrodkowany (≤520px: 22px) |
| `.vilda-auth-subtitle` | 15px/1.55 #4a6168, `max-width:480px`, wyśrodkowany (≤520px: 14px) |
| `.vilda-auth-info` | tło #f5fafb, obrys 1px #e0eef0, promień 14 px, 13px/1.6 #3b5560, wypełnienie 18px 22px |
| `.vilda-auth-side-note` | akapit w notatce: 12.5px/1.5 #6a8089, bez marginesu |
| `.vilda-auth-user-list` | kolumna z odstępem 10px, margines górny 4px |
| `.vilda-auth-user-card` | biały przycisk, obrys 1.5px #e0eef0, promień 14 px, wypełnienie 14px 16px, odstęp 14px; `:hover` obrys #00838d, tło #f5fafb, cień `0 4px 14px #00838d1f`; `:active` przesunięcie 1 px w dół; `:focus-visible` obwódka 3px `rgba(0,131,141,.3)` z odsunięciem 2px. Reguła `.vilda-auth-root .vilda-auth-user-card` powtarza te wartości z `!important` i wyłącza `backdrop-filter` |
| `.vilda-auth-user-avatar` | koło 44 px, gradient 135° #00838d → #00a4b1, litera 18px/600 biała, wersaliki |
| `.vilda-auth-user-name` / `.vilda-auth-user-meta` / `.vilda-auth-user-arrow` | 15px/600 #08202c z wielokropkiem; 12px #6a8089; „›" 22px/300 #6a8089 |
| `.vilda-auth-user-passkey-badge` | .78rem/500 #00838d, `letter-spacing:.01em`, margines górny 2px |
| `.vilda-auth-recovery-key` | monospace (SF Mono, Menlo, Consolas), tło #f5fafb, obrys `2px dashed #b0d4d8`, promień 14 px, 19px/600 #00838d, `letter-spacing:.1em`, `user-select:all` (≤520px: 15px, 18px, .06em) |
| `.vilda-auth-divider` | linia 1 px `#00838d26` po obu stronach tekstu .82rem #9aafb5, margines 14px 0 10px |
| `.vilda-auth-links` / `.vilda-auth-link` / `.vilda-auth-link-muted` | wiersz wyśrodkowany, margines górny 8px; odnośnik 14px/500 #00838d, `:hover` podkreślenie; wyciszony 13px/400 #6a8089, `:hover` #b00020 |
| `.vilda-embedded …` | marka ukryta, `padding-top:0` na korzeniu, nakładka `padding-top:14px`; na ekranie dotykowym ≤1366px korzeń kończy się 96 px + safe-area nad dolną krawędzią, nakładka `min-height:100%` i `padding-bottom:24px` |

Wysoki kontrast (`body.liquid-ios26.high-contrast-level-1/2/3`): korzeń, nakładka, notatka, klucz odzyskiwania i karty kont przechodzą na `--hc-surface` z rozmyciem `--hc-blur` i cieniem `--hc-shadow`; notatka, klucz i karty dostają obrys `--hc-card-border-width solid --hc-border`; tytuł, korzeń, notatka, karta i nazwa konta tekst `--hc-text`; podpis marki, separator, podtytuł, meta, strzałka i odnośnik wyciszony `--hc-muted`. Szkło (`.liquid-ios26`): brak osobnych reguł dla tych klas; reguła `.vilda-auth-root button` i nadpisanie kart kont wyłączają `backdrop-filter` przycisków.

## Tokeny

Reguły bazowe nie używają tokenów kolorów (wartości literalne). Lokalne zmienne układu: `--vilda-shell-dock-h`, `--mobile-dock-visible-lift` (obie z domyślnym `0px`). Wysoki kontrast: `--hc-surface`, `--hc-blur`, `--hc-shadow`, `--hc-border`, `--hc-card-border-width`, `--hc-text`, `--hc-muted`.

## Zasady

- Rób: jeden ekran na raz w `.vilda-auth-card` — skrypt podmienia `.vilda-auth-screen` w całości; podgląd pokazuje dwa ekrany naraz tylko dla porównania.
- Rób: pisz tytuł jako pytanie lub krótkie zdanie („Kto się loguje?", „Twój klucz odzyskiwania"), a podtytuł jako jedno zdanie z instrukcją.
- Rób: awatar zawsze z pierwszą literą nazwy konta; brak nazwy pokazuj jako „Konto bez nazwy".
- Nie rób: nie wstawiaj kart kont poza `.vilda-auth-root` — bez reguły z `!important` globalne style przycisków i szkło zmienią ich wygląd.
- Nie rób: nie wpisuj w podglądach ani testach prawdziwych kluczy odzyskiwania; używaj jawnie fikcyjnych ciągów.
- Stan wybrany lub zajęty zawsze z tekstem: odznaka passkey ma ikonę i nazwę metody, zajętość widać po wygaszeniu całej karty.
- Kontrast (zmierzony): #08202c na #fff 16.8:1, #4a6168 na #fff 6.6:1, #3b5560 na #f5fafb 7.5:1, #00838d na #fff 4.5:1 (marka, krok, odnośnik, odznaka passkey, biała litera awatara na #00838d). Poniżej 4.5:1 w źródle: #6a8089 na #fff 4.2:1 (meta, podpis marki, notatka poboczna, odnośnik wyciszony), klucz odzyskiwania #00838d na #f5fafb 4.3:1 (tekst 19px/600 — spełnia próg 3:1 dla dużego tekstu), separator „lub” #9aafb5 na #fff 2.3:1, litera awatara na jaśniejszym końcu gradientu #00a4b1 3.0:1. Nie umieszczaj w tych elementach treści krytycznej; wysoki kontrast podnosi je przez `--hc-text`/`--hc-muted`.
- Wysoki kontrast wzmacnia obrysy kart i przyciemnia tekst wyciszony; na szkle karty kont pozostają matowe (bez rozmycia).

Wersja statyczna, przepisana ręcznie z src/css/vilda_auth_ui.css (1-102, 277-294, 377-383, 398-453, 578-590, 629-633, 1208-1226, 1252-1263, 1341-1345, 1384-1394, 1434-1442, 1452-1458, 1468-1471, 1580-1606) oraz vilda_auth_ui.js (znacznik i treści).
