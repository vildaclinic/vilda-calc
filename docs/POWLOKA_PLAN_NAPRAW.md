# Naprawy powłoki: konto, menu i klawiatura

**Status: implementacja punktów 4, 5, 7 i 8.** Dokument wywodzi się z audytu `app.html` z 2026-10-02, commit `a222cd7c1bfa3a2dcd9bd8a4b73cd2d5a55d17a2`. Punkty 1–3 scalono w PR #525. Baza tej partii: `origin/audyt` / `96faeed1`; gałąź: `agent/powloka-konto-menu-klawiatura`.

Numery punktów poniżej odpowiadają kolejności przekazanej właścicielowi; identyfikatory A odnoszą się do audytu. Punkt 7 to A6, a punkt 8 to A7.

| Punkt | Problem | Status |
|---|---|---|
| 1 / A1 | Spóźnione otwieranie karty/listy po nowszej decyzji użytkownika | Scalone w PR #525 |
| 2 / A2 | Zamknięcie nakładki cofa nową trasę powłoki | Scalone w PR #525 |
| 3 / A3 | Utrata wskazania klinicznego w odnośniku do laboratorium | Scalone w PR #525 |
| 4 / A4 | Nazwa/avatar konta opuszcza powłokę | Zaimplementowane w tej partii |
| 5 / A5 | Menu mobilne pozostaje otwarte po wyborze strony | Zaimplementowane w tej partii |
| 6 / A8 | Tryb gościa po zimnym starcie offline | Wyłączony z tej pracy; bez badań i zmian |
| 7 / A6 | Fokus opuszcza otwarte menu | Zaimplementowane w tej partii |
| 8 / A7 | Powłoka przechwytuje Ctrl+klik | Zaimplementowane w tej partii |

Poniżej zachowano zakres i kryteria akceptacji uzgodnione przed implementacją. Wyniki końcowej walidacji oraz odnośnik do draft PR znajdują się w opisie PR i podsumowaniu pracy. Punkt 6 pozostaje wyłączony.

## Granice tej partii

Zmiany dotyczą nawigacji i obsługi menu. Nie obejmują wzorów, progów, jednostek ani interpretacji klinicznych, zapisu/synchronizacji kont i pacjentów, przenoszenia danych między magazynami ani nowych zasad autosave. Robocze pola narzędzi pozostają własnością ich utrzymywanych ramek.

Nie wprowadzać nowego routera ani frameworka. Zachować publiczne API `window.VildaShell` i `window.VildaChrome`, kolejność skryptów oraz pracę stron samodzielnych. Implementację oprzeć na czytelnych fragmentach źródła lub jednoznacznie odtwarzalnym artefakcie, zgodnie z [AGENTS.md](../AGENTS.md).

## Kolejność i zakres

### 1. Punkt 4: konto wewnątrz powłoki

**Problem:** klik nazwy lub avatara konta ustawia obecnie `location.href` na `ustawienia.html#settings-section-account`. Niszczy powłokę i jej ciepłe ramki. Potwierdzony skutek: HOMA z glukozą 90 i insuliną 12 → konto → powrót do HOMA otwiera nowe, puste pola.

**Pliki:** [vilda_chrome.js](../vilda_chrome.js), obsługa nagłówka `y()`; [vilda_shell.js](../vilda_shell.js), przekazanie celu nawigacji; w razie potrzeby wąski adapter otwarcia sekcji w [ustawienia.html](../ustawienia.html) lub jej istniejącym skrypcie inline. Wykorzystać kontrakt query/sekcji wypracowany w punkcie 3, po jego ustabilizowaniu.

**Plan:** w hostowanym widoku kierować do ramki Ustawienia i otworzyć `settings-section-account`, również gdy ramka już istnieje i pokazuje inną sekcję. Nie przeładowywać pozostałych ramek. Na stronie samodzielnej zachować dotychczasowy cel `ustawienia.html#settings-section-account`. Nie zmieniać działania logowania/wylogowania ani blokad sekcji konta.

**Akceptacja i regresje:**

- Klik nazwy i klik avatara, desktop i mobile: URL pozostaje w `app.html`, widoczna jest tylko ramka Ustawienia, sekcja konta jest otwarta i dostępna w jej obszarze przewijania.
- Sprawdzić nową ramkę oraz wcześniej otwarte Ustawienia z inną sekcją. Każde zwykłe przejście dodaje jeden logiczny krok historii; Wstecz/Dalej zachowują zgodność hashu i widocznej ramki.
- HOMA `#glucose=90`, `#insulin=12`, wybrana jednostka i wynik → Steroidy → HOMA zachowuje stan jako kontrola dodatnia. Następnie konto → HOMA przez menu i przez Wstecz zachowuje te same wartości, wynik oraz **ten sam obiekt ramki**. Nie ratować pól przez kopiowanie ich do globalnego storage.
- Samodzielne HOMA/index/DocPro nadal otwierają samodzielne Ustawienia z sekcją konta. Kontrolki nagłówka zachowują działanie z klawiatury.

### 2. Punkty 5 i 7 razem: zamykanie menu oraz focus

**Problem:** `Wt()` w powłoce zatrzymuje propagację kliknięcia, więc nawigacja pomija zamknięcie szuflady w Chrome. `nt()` otwiera dialog bez przeniesienia fokusu; Tab może wejść do zasłoniętej ramki, gdzie Escape nie dociera do dokumentu hosta.

**Pliki:** [vilda_chrome.js](../vilda_chrome.js), `nt()`, `ee()`, obsługa kliknięć/klawiatury i markup dialogu; [vilda_shell.js](../vilda_shell.js), `Wt()` oraz wąskie uzgodnienie obsłużonej nawigacji. [vilda_chrome.css](../vilda_chrome.css) tylko jeśli potrzebna jest widoczna obwódka fokusu lub obsługa tła.

**Plan:** ustanowić jeden kontrakt zamknięcia drawer, z którego korzystają przycisk zamykania, Escape, tło i skutecznie obsłużona nawigacja. Uzgodnić jawne zamknięcie z powłoki przez małe API Chrome albo taki przepływ zdarzenia, który wykonuje obie czynności dokładnie raz. Nie opierać poprawności na czasie animacji.

Na otwarciu zapamiętać element wywołujący i przenieść focus do widocznej kontrolki dialogu. Ograniczyć Tab/Shift+Tab do dostępnych kontrolek. Czasowo wyłączyć interakcję i tabulację tła, w tym iframe, przywracając wcześniejsze atrybuty po zamknięciu. Zachować istniejącą semantykę dialogu i poprawne `aria-expanded`/`aria-hidden`; blokada tła nie może objąć samego dialogu. Przy braku wsparcia `inert` potrzebny jest sprawdzony wariant zastępczy, który również chroni granicę iframe.

**Akceptacja i regresje:**

- Mobile: menu → Ustawienia oraz menu → Jednostki lab. Zmienia się właściwa trasa, szuflada kończy z `aria-hidden=true` i `hidden=true`, klasa otwarcia znika, a wybrany panel jest dostępny pod palcem. Sprawdzić również ponowny wybór bieżącej trasy, szybkie zamknięcie/otwarcie oraz `prefers-reduced-motion`.
- Otwarcie menu, wielokrotny Tab i Shift+Tab: focus zawsze należy do widocznego dialogu, nigdy do nagłówka pod nim ani pól HOMA/Start w iframe. Escape zamyka menu; przy Escape, przycisku zamykania i kliknięciu tła focus wraca do wywołującego przycisku.
- Po wybraniu trasy focus trafia do widocznego panelu/jego ramki bez skoku przewijania; nie pozostaje w ukrytej szufladzie. Akcja otwierająca inny modal oddaje focus jego istniejącemu managerowi zamiast odbierać go przywróceniem do przycisku menu.
- Niedostępna akcja nadal wyjaśnia blokadę; menu nie zamyka się wskutek samego ostrzeżenia. Zapis, lista i karta pacjenta z drawer wykonują się raz, bez dodatkowego cofnięcia historii.
- Po każdym sposobie zamknięcia wszystkie wcześniejsze `inert`, `tabindex` i atrybuty dostępności tła są przywrócone. Można ponownie kliknąć/edytować pola HOMA, a ich wartości i wynik pozostają bez zmian.
- Sprawdzić powłokę oraz samodzielne strony, telefon 393 px i 320 px, mysz oraz rzeczywistą klawiaturę. Brak poziomego przewijania i brak kolizji z istniejącymi modalami ramek/dockiem.

### 3. Punkt 8: natywne otwieranie odnośników

**Problem:** `Wt()` w powłoce przejmuje także Ctrl+klik. Podobna luka statyczna dotyczy `Pt()` w Chrome, które przechwytuje odnośniki wewnątrz ramki oraz część nawigacji standalone.

**Pliki:** [vilda_shell.js](../vilda_shell.js), `Wt()`; [vilda_chrome.js](../vilda_chrome.js), `Pt()`. Uzgodnić wspólne zasady kwalifikowania zdarzenia, bez zmiany realnych `href` ani klinicznych parametrów odnośników.

**Plan:** przejmować tylko zwykłe, nieobsłużone wcześniej kliknięcie podstawowym przyciskiem w odnośnik wewnętrzny, którego cel może być obsłużony w bieżącym widoku. Pozostawić przeglądarce Ctrl/Meta/Shift/Alt, środkowy przycisk, `download` oraz cele otwierane w innym kontekście (`target` inne niż bieżący). Zastosować tę regułę **przed** `preventDefault()`/zatrzymaniem propagacji zarówno w hoście, jak i ramce oraz wariancie standalone. Zachować zachowanie zwykłego Enter na odnośniku.

**Akceptacja i regresje:**

- Ctrl+klik HOMA w sidebar hosta: jedna nowa karta otwiera rzeczywisty `href`; stara karta zachowuje URL, widoczną ramkę, historię i robocze pola. Dla tego odnośnika celem nowej karty może pozostać samodzielne `homa-ir.html`.
- Sprawdzić Meta+klik w odpowiednim środowisku, środkowy przycisk i `target=_blank`. Shift/Alt oraz `download` nie mogą zostać przejęte przez router; rezultat właściwy dla danej przeglądarki należy opisać, nie zasymulować samym wywołaniem `navigate()`.
- Odnośnik do laboratorium w iframe: zwykły klik nadal działa wewnątrz powłoki i przenosi `wskazanie`; zmodyfikowany otwiera natywny cel z pełnym query/hash, bez zmiany wskazania w dotychczasowej ramce.
- Samodzielne strony zachowują natywne otwarcie nowej karty. Zwykłe kliknięcia i Enter nadal przechodzą przez właściwy wariant nawigacji, a menu nie zamyka się ani nie przenosi fokusu starej karty wskutek nieprzejętego zmodyfikowanego kliku.

## Regresje i walidacja

Dodane pliki E2E:

- `tests/e2e/powloka-konto-stan-narzedzi.spec.mjs`: konto, cold/warm Ustawienia, HOMA 90/12, tożsamość iframe, historia i kontrola standalone.
- `tests/e2e/powloka-menu-focus-mobile.spec.mjs`: zamykanie szuflady, Tab/Shift+Tab/Escape, tło/iframe, szerokości 393/320 i akcje otwierające inne modale.
- `tests/e2e/powloka-odnosniki-nowe-karty.spec.mjs`: rzeczywiste modyfikatory, nowe karty i pełne URL; nie tylko asercja `defaultPrevented`.

Ewentualne jednostkowe testy kwalifikowania zdarzeń mają wykonywać rzeczywistą funkcję produkcyjną. Testy E2E powinny używać fikcyjnych kont, rzeczywistych klików i klawiatury; sprawdzać jednocześnie adres, widoczną ramkę, stan dialogu i robocze wartości. Przypadki red/green utrwalić przed zmianą odpowiadającego im handlera.

Ponowić regresje obecnej partii 1–3, istniejące `powloka*.spec.mjs`, `odtworzenie-na-zywo-powloka.spec.mjs`, `modale-powloka-mobile.spec.mjs`, `chip-karta-pacjenta.spec.mjs`, `ustawienia-nawigacja.spec.mjs` oraz kalkulację HOMA z `application.spec.mjs`. Po zmianie ładowanych zasobów: jednostkowe/składnia/lint, właściwy zestaw E2E i istniejące PWA instalacja/aktualizacja/aktywacja/offline zgodnie z AGENTS. Bez rozszerzania tych prób o wyłączony punkt 6.

Walidować przypiętym Playwright Chromium, z raportem dokładnych wyników i bez osłabiania asercji. Emulację telefonu opisać jako emulację; przed uznaniem obsługi focus/klawiatury za sprawdzoną na iOS potrzebna jest kontrola Safari i fizycznej klawiatury, jeśli taki wynik ma być deklarowany.

Po zamknięciu implementacji root aktualizuje status tego planu. Wersjonowanie JS/HTML/cache i `npm run podbij-wersje` wykonać jako ostatni etap konkretnej partii względem aktualnego `origin/audyt`; zachować historyczne wpisy cache. Nie scalać ani nie wdrażać w ramach samego planu.


## Wykonanie

- Konto korzysta z pełnego celu `VildaShell.navigate`; samodzielne strony zachowują adres Ustawień. Adapter sekcji w Ustawieniach odbiera cel także dla ciepłej ramki i czeka na istniejące odblokowanie sekcji podczas startu sesji. Nie zmienia uprawnień ani zasad logowania. Jawny cel sekcji przewija natychmiast, aby startowa korekta scrolla na telefonie nie przerywała płynnego przewijania. Samodzielne wejście z HOMA do konta pomija przejście wizualne w źródłowym `pageswap`, z kontrolą pełnego docelowego URL. Zapobiega to potwierdzonej blokadzie renderowania przy przejściu z HOMA; pozostałe nawigacje zachowują animacje.
- Chrome udostępnia `closeDrawer({reason})` i `isPlainNavigationClick`. Zamknięcie kończy blokadę tła synchronicznie. Escape, przycisk i tło zwracają fokus do przycisku menu; nawigacja i przekazanie do modalu pozostawiają fokus nowemu widokowi.
- Nazwy tras są rozstrzygane do stałych kluczy: nierozpoznany tekst lub obiekt nie jest przekazywany do mapy ramek. Znane trasy i dotychczasowy panel domyślny pozostają zachowane.
- Powłoka przenosi fokus dopiero po rzeczywistym pokazaniu załadowanego panelu. Nowsza nawigacja, klawiatura, wskaźnik lub ponowne otwarcie menu unieważnia oczekiwanie, również podczas odroczonego Wstecz.
- Menu cyklicznie obsługuje Tab/Shift+Tab, izoluje tło i iframe oraz przywraca poprzednie atrybuty. Wariant bez natywnego `inert` jest objęty testami rzeczywistych funkcji produkcyjnych.
- Zmienione kliki i cele innej karty pozostają obsługiwane przez przeglądarkę. Testy Ctrl, środkowego przycisku i `_blank` sprawdzają rzeczywiste nowe karty oraz niezmieniony dokument i dane HOMA w karcie źródłowej.

Kontrole przed zmianą wykazały błędy konta dla zimnej i ciepłej ramki, 4/4 nieudane scenariusze menu oraz 5/9 nieudanych scenariuszy natywnego otwierania kart. Dane testowe są fikcyjne. Nie zmieniono wzorów, danych referencyjnych, zaokrągleń ani magazynów pacjentów. Próby mobilne w Chromium są emulacją; nie stanowią weryfikacji fizycznego Safari/iOS.
