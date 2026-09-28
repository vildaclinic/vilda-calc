# SidebarNavLink

Pozycja paska bocznego: wiersz z 22 px ikoną Lucide i etykietą, płaski w spoczynku, po najechaniu z delikatną tealową poświatą, a na bieżącej stronie zamieniony w gradientową pigułkę z białym tekstem.

## Kiedy używać

Wyłącznie w `ul` sekcji `.sidebar-nav` Sidebara — selektory wymagają zagnieżdżenia `.has-vilda-chrome aside.sidebar-v2 .sidebar-nav a`. Każda pozycja to strona (`href`) albo akcja na karcie pacjenta (`role="button"`: Zapisz dane, Dodaj notatkę do wizyty, Pacjenci). Pozycje PRO (DocPro, Notatki, Terminarz) dostają klasę `pro-link` i plakietkę „PRO”. Nie używaj tych klas w treści strony ani w szufladzie mobilnej (tam są `.chrome-drawer-nav a`).

## Co dostarcza konsument

- Znacznik (`Ye()`): `<li><a href="…" class="sidebar-link [pro-link] [auth-only-item]" [id] [role="button"] [aria-disabled="true"] [data-auth-only="true"] [data-tip="…"] [aria-current="page"]><span class="sidebar-icon" data-lucide="home" aria-hidden="true"><svg…></span><span class="sidebar-label">Strona główna</span></a></li>`.
- Ikona: `<span class="sidebar-icon">` z SVG Lucide (`stroke="currentColor"`, `stroke-width="2"`), które CSS skaluje do 18×18 w polu 22×22. Bez Lucide skrypt zostawia pusty `span` (fallback nie jest rysowany).
- Stan bieżącej strony: `aria-current="page"` (skrypt dokłada też `is-active`). Stan wyłączony: `aria-disabled="true"` (skrypt zdejmuje go, gdy dane karty są kompletne). Pozycje `data-auth-only="true"` mają `style="display:none"`, dopóki użytkownik nie jest zalogowany.
- `data-tip` pokazuje `.vilda-tip` (Tooltip) — kopie z aplikacji: „Aby zapisać dane, wprowadź imię, wiek, wzrost i wagę.”, „Zaloguj się, aby przeglądać bazę pacjentów.”.
- Identyfikatory akcji, których szuka skrypt: `#saveDataBtnSidebar`, `#addVisitNoteBtnSidebar`, `#patientsListBtnSidebar`.

## Warianty i stany

| Selektor | Wygląd |
| --- | --- |
| `.sidebar-nav a` (chrome) | `display:flex`, `gap:.6rem`, `padding:.55rem .7rem`, promień 10px, bez podkreślenia, `.93rem`/500, kolor `text` #333, tło przezroczyste, `transition: background .12s, color .12s, transform .08s`, `position:relative`. |
| `.sidebar-icon` | `inline-flex` 22×22, `flex:0 0 auto`, kolor `primary` #00838d; `svg` 18×18. |
| `.sidebar-label` | `flex:1 1 auto`, `line-height:1.2`. |
| `:hover`, `:focus-visible` | Tło `#00838d14`, kolor `text`, `outline:none`. |
| `.pro-link` | Etykieta i ikona w `secondary` #00b0a6, etykieta 700; `::after` z treścią „PRO”: `.62rem`/800, `letter-spacing:.05em`, kolor `secondary`, tło `#00b0a61f`, `padding:.1rem .35rem`, promień 999px, `margin-left:auto`. |
| `[aria-current=page]`, `.is-active` | Tło `chrome-active-bg` (gradient 135° `primary → secondary`) `!important`, kolor `#fff!important`, 700, cień `0 4px 12px #00838d38`; ikona `#fff`; etykieta bez podkreślenia; `.pro-link` — etykieta `#fff`, plakietka `#ffffff40`/`#fff`. |
| `[aria-disabled=true]`, `[disabled]` | Kolor `#9eb8bb!important`, ikona `#9eb8bb`, `cursor:default`, tło przezroczyste i bez cienia `!important`; hover nie zmienia tła. |
| `.sidebar-nav a` legacy (sidebar.css) | `width:100%`, `padding:.75rem 1.5rem`, `.95rem`/600, kolor `primary`; hover/focus i `[aria-current=page]` — tło `secondary`, biały tekst; wyłączony `#9eb8bb`; `.is-active .sidebar-label` 700 z podkreśleniem `text-underline-offset:.18em` (chrome zeruje podkreślenie). |
| `.pro-link` globalny (style.css) | `#90f`/600, hover `#b34af7` z podkreśleniem — w pasku przegrywa specyficznością i nie jest widoczny. |

Szkło, wysoki kontrast i ciemne tło nie mają reguł dla tych linków; kolory wynikają z tokenów `primary`, `secondary`, `text`, które w tych motywach nie zmieniają wartości.

## Tokeny

`--text`, `--primary`, `--secondary`; zmienna lokalna `--chrome-active-bg`.

## Zasady

- Rób: stan zawsze z tekstem — etykieta jest obowiązkowa, ikona tylko ją wspiera (`aria-hidden`); plakietka „PRO” to `::after`, więc jej treść nie trafia do nazwy dostępnej — nazwa pozostaje etykietą.
- Rób: dla akcji (nie stron) używaj `role="button"` z `href="#"` i `aria-disabled`, nie `disabled` — element pozostaje `<a>`, a skrypt obsługuje klik.
- Rób: stan wyłączony zawsze z `data-tip`, żeby użytkownik wiedział, czego brakuje (imię, wiek, wzrost i waga; logowanie).
- Nie rób: nie ustawiaj koloru na `a.pro-link` — źródło koloruje osobno etykietę, ikonę i plakietkę, żeby stan aktywny mógł je odwrócić na biało.
- Nie rób: nie dodawaj własnego `outline` — fokus jest sygnalizowany tłem `#00838d14`, tak jak hover.
- Kontrast: `#9eb8bb` na szkle daje około 2.1:1 — to celowo stan nieaktywny; biały tekst na gradiencie `primary → secondary` ma 4.5:1 przy `primary` i 2.7:1 przy `secondary` (źródło używa go mimo to). Etykieta `.pro-link` w `secondary` #00b0a6 na bieli daje 2,7:1, a plakietka „PRO” #00b0a6 na `#00b0a61f` 2,4:1 — obie pary poniżej 4,5:1 pochodzą ze źródła i nie zostały zmienione; kolor `text` #333 na bieli ma 12,6:1, tytuł sekcji `#5a7274` 5,1:1.
- Podgląd: reguły chrome stoją w źródle w `@media(min-width:992px)`; w partialu zakres zdjęto, bo ramka ma 960 px. Pozycję `sticky` opakowania `aside` nadpisano w podglądzie na `static`. Stanu hover nie da się pokazać statycznie; fokus wygląda identycznie.

Wersja statyczna, przepisana ręcznie z src/css/vilda_chrome.css (823-894), src/css/sidebar.css (28-73, 482-485), src/css/style.css (1702-1708), vilda_chrome.js (funkcja Ye)
