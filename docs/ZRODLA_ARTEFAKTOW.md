# Źródła zminifikowanych artefaktów

Stan na 2026-09-29 (`audyt` `d79d9d8`). Ustalenia z przeglądu pełnej historii `vilda-calc` (`audyt`, `main` i 73 gałęzie) oraz prywatnych repozytoriów właściciela dostępnych przez GitHub (P-ZRODLA, polecenie właściciela 2026-09-29).

## Najważniejsze

- **Artefakty w tym repozytorium są dziś jedynym aktualnym stanem kodu.** Ostatnie wgranie plików zbudowanych poza GitHubem to `ad98909a` (2026-07-29, #22 „Add files via upload”; wcześniej `265e9812`, 2026-07-24, „release: wdrożenie zmian lokalnych z 24.07.2026”). Od tego czasu 59 zminifikowanych plików, które istniały w chwili tego wgrania, zmieniło się tu w 616 commitach, a 6 doszło (5 bibliotek zewnętrznych i `vilda_centile_charts.js`) — tabela niżej.
- **Lokalne czytelne źródła, jeżeli istnieją, są nieaktualne.** Zbudowanie z nich artefaktów i wgranie cofnęłoby zmiany z tabeli, także kliniczne. Przed takim buildem każdą zmianę trzeba najpierw przenieść do źródła.
- **W żadnym dostępnym repozytorium GitHub nie ma aktualnego czytelnego źródła.** `vilda-calc`: czytelne wersje tylko w dawnej historii (np. `ios26-ui.js` do 2026-05-29). Prywatne `vilda-source`: kopia artefaktów, nie źródło (jego `ios26-ui.js` to bajt w bajt wersja z `f73cae2a`, 2026-06-29). Prywatne `vildaclinic`: puste.

## `ios26-ui.js`

| Okres | Postać w repozytorium |
|---|---|
| do `e5106bbf` (2026-05-29) | czytelny, ostatnio 2993 linie |
| `621c4cd5` (2026-06-02) – `265e9812` (2026-07-24) | zminifikowany, wgrywany z lokalnego źródła (7 wersji, 52 → 67 kB) |
| `4e3ed7e9` (2026-09-17, #344 P-DYMKI) | zmiana wprost w artefakcie: publikacja `--vilda-dol-wolny` |
| `f632fe0` (2026-09-29, #476 P-SW-PIERWSZA-WIZYTA) | zmiana wprost w artefakcie: bez przeładowania przy pierwszym przejęciu strony przez SW |
| 2026-10-12, P-AKTUALIZACJA-BRAMKA | zmiana wprost w artefakcie: bramka banera aktualizacji (łatka niżej, „Łatka P-AKTUALIZACJA-BRAMKA”) |

Poniżej obie zmiany w czytelnej postaci, jako łatki względem ostatniej czytelnej wersji (`git show e5106bbf:ios26-ui.js`). Nałożone razem dają poprawny składniowo JS (`patch -p1` bez konfliktów, `node --check`).

**Jak zostały sprawdzone.** Każdą łatkę przygotował osobny agent, a dwóch niezależnych recenzentów próbowało ją obalić (zgodność działania oraz przełożenie nazw i miejsca wstawienia). Żaden nie obalił łatki; poprawiono tylko opisy.
- #476: symulacja słuchacza w 6 scenariuszach (start bez i z kontrolerem, 0–3 zdarzenia `controllerchange`, wyjątek migracji, utrata kontrolera) daje te same wywołania migracji i przeładowania oraz te same migawki stanu co artefakt. Trzy łatane funkcje (stan, migawka, słuchacz) mają tę samą strukturę w wersji z 2026-05-29 i we wszystkich buildach do 2026-07-24, więc łatka powinna wejść w lokalne źródło bez konfliktu treści.
- #344: funkcja `updateDockMetrics` ma identyczną strukturę we wszystkich buildach od 2026-06-02 do 2026-07-24. Sprawdzenie ramki powłoki (w artefakcie `Me()`, `?embedded=1`) powstało dopiero 2026-06-25 i jego czytelnej nazwy nie ma w żadnej wersji z historii. W łatce stoi nazwa robocza `isEmbeddedShellFrame()` — przy nakładaniu trzeba ją zamienić na nazwę z lokalnego źródła. Inaczej `ReferenceError` zostanie połknięty przez `try/catch`, a zmienna nigdy się nie opublikuje.

**Po zbudowaniu `ios26-ui.js` z lokalnego źródła z tymi łatkami:**
1. Podbij `?v=` na wszystkich stronach, `SW_VERSION` i precache (AGENTS.md § 6). Zrównaj też tokeny `ios26-ui.js?v=` w `vilda_gh_therapy_resource_audit.js` (strażnik `piny-wersji`).
2. Uruchom `tests/e2e/pwa-pierwsza-wizyta.spec.mjs` (#476) i `tests/e2e/dymki-mobile.spec.mjs` (#344).
3. `tests/unit/dymki.test.mjs` sprawdza dosłowne fragmenty zminifikowanego pliku (np. `if(!Me()){const Sb=document.getElementById("scrollTopBtn")`). Po nowym buildzie nazwy będą inne, więc ten strażnik trzeba przepisać na zachowanie, a nie wyłączyć.

**Ryzyko resztkowe (#476).** Build z 2026-07-24 ma w banerze „Aktualizuj” zapasowe przeładowanie po 2,5 s, gdy nie przyszło przeładowanie z `controllerchange`. Na stronie bez kontrolera (np. po twardym odświeżeniu) z czekającym SW kliknięcie „Aktualizuj” przeładuje więc stronę dopiero po 2,5 s, a nie od razu.

### Łatka #476 (P-SW-PIERWSZA-WIZYTA)

```diff
--- a/ios26-czytelny-2026-05-29.js
+++ b/ios26-czytelny-2026-05-29.js
@@ -2815,6 +2815,8 @@
         controllerchangeListenerRegistered: false,
         controllerchangeHandledCount: 0,
         reloadedAfterControllerChange: false,
+        controllerchangeFirstClaimCount: 0,
+        controllerchangeHadControllerAtStart: null,
         updatefoundRegistrations: createSWClientLifecycleTracker(),
         statechangeWorkers: createSWClientLifecycleTracker(),
         promptedWorkers: createSWClientLifecycleTracker()
@@ -2860,6 +2862,9 @@
       controllerchangeListenerRegistered: !!state.controllerchangeListenerRegistered,
       controllerchangeHandledCount: state.controllerchangeHandledCount || 0,
       reloadedAfterControllerChange: !!state.reloadedAfterControllerChange,
+      controllerchangeFirstClaimCount: state.controllerchangeFirstClaimCount || 0,
+      controllerchangeHadControllerAtStart: state.controllerchangeHadControllerAtStart == null ? null : !!state.controllerchangeHadControllerAtStart,
+      controllerchangeFirstClaimNoReloadGuard: true,
       singletonRegistrationGuard: true,
       duplicateUpdatefoundListenerGuard: true,
       duplicateStatechangeListenerGuard: true,
@@ -2939,8 +2944,24 @@
     const state = getSWClientLifecycleState();
     if (state.controllerchangeListenerRegistered) return;
     state.controllerchangeListenerRegistered = true;
+    // P-SW-PIERWSZA-WIZYTA (#476): pamiętamy, czy strona ma kontrolera. Przejęcie strony,
+    // która kontrolera nie miała (clients.claim() przy pierwszej wizycie, po wyczyszczeniu
+    // danych albo po jego utracie), nie przeładowuje strony — dokument i tak przyszedł
+    // z sieci, a przeładowanie trafiałoby w pracę użytkownika.
+    let hasController = !!container.controller;
+    state.controllerchangeHadControllerAtStart = hasController;
     container.addEventListener('controllerchange', () => {
+      const hadControllerBeforeChange = hasController;
+      hasController = !!container.controller;
       state.controllerchangeHandledCount += 1;
+      if (!hadControllerBeforeChange) {
+        // Bez kontrolera → kontroler: tylko migracja stanu, bez przeładowania.
+        state.controllerchangeFirstClaimCount = (state.controllerchangeFirstClaimCount || 0) + 1;
+        try { migrateIfNeeded(); } catch (error) { state.lastError = error && error.message ? error.message : String(error || 'migration-error'); }
+        return;
+      }
+      // Kontroler → nowy kontroler (np. po „Aktualizuj”): migracja i jedno
+      // przeładowanie, jak dotąd.
       if (state.reloadedAfterControllerChange) return;
       state.reloadedAfterControllerChange = true;
       try { migrateIfNeeded(); } catch (error) { state.lastError = error && error.message ? error.message : String(error || 'migration-error'); }
```

### Łatka #344 (P-DYMKI)

```diff
--- a/ios26-czytelny-2026-05-29.js
+++ b/ios26-czytelny-2026-05-29.js
@@ -2276,6 +2276,35 @@
       document.body.classList.toggle('has-mobile-bottom-dock-visible', canMeasureDock && nextVisibleLift > 0);
       rootStyle.setProperty('--mobile-dock-visible-lift', `${Math.max(0, nextVisibleLift)}px`);
       rootStyle.setProperty('--scroll-top-btn-bottom', `${Math.max(0, nextScrollTopBottom)}px`);
+
+      // P-DYMKI: jeden dół dla dymków. Publikujemy, ile pikseli od dołu okna zajmują pasek
+      // bezpieczeństwa, dock i strzałka "na górę" — dymki (.vilda-dymek w style.css) stawiają się
+      // tuż nad tą linią. Strzałkę rezerwujemy ZAWSZE, gdy jej ustawienie jest włączone i przycisk
+      // istnieje (nie tylko, gdy akurat widać): inaczej dymek skakałby przy każdym
+      // pokazaniu/schowaniu strzałki, a przez chwilę przed odświeżeniem geometrii i tak by pod nią
+      // wjeżdżał. Poza trybem docka zmienna znika — na komputerze dymek stoi tam, gdzie stał.
+      // W ramce powłoki (embedded=1) nie publikujemy: tam dół zna vilda_shell.js.
+      try {
+        if (!isEmbeddedShellFrame()) {
+          const scrollTopButton = document.getElementById('scrollTopBtn');
+          const reservedArrowHeight = shouldShowNavigationArrowByPreference() && scrollTopButton
+            ? Math.max(scrollTopButton.offsetHeight || 0, 4 * getRemSizeInPx())
+            : 0;
+          const freeBottomOffset = enabled
+            ? Math.max(0, nextScrollTopBottom) + (reservedArrowHeight > 0 ? reservedArrowHeight + 4 : 0)
+            : 0;
+
+          if (freeBottomOffset > 0) {
+            rootStyle.setProperty('--vilda-dol-wolny', `${Math.round(freeBottomOffset)}px`);
+          } else {
+            rootStyle.removeProperty('--vilda-dol-wolny');
+          }
+        }
+      } catch (e) {
+        if (typeof globalThis !== 'undefined' && typeof globalThis.vildaLogSwallowedCatch === 'function') {
+          globalThis.vildaLogSwallowedCatch('ios26-ui.js', e, { feature: 'dymki:dol-wolny' });
+        }
+      }
     }
 
     function bindScrollTarget(target) {
```

## Zminifikowane pliki zmienione po ostatnim wgraniu (2026-07-29)

Plik uznany za zminifikowany, gdy ma ponad 4 kB i średnio ponad 300 znaków na linię. Część pozycji to moduły z danymi (np. `bayley_pinneau_data.js`, `rwt_data.js`), a biblioteki zewnętrzne nie pochodzą z lokalnego źródła. „Commity” liczą każdy commit na `audyt` od `ad98909a` zmieniający plik (także podbicia wersji i scalenia).

| Plik | Commity po wgraniu | Rozmiar | W chwili wgrania | PR-y (pierwsze) |
|---|---:|---:|---|---|
| `vilda_auth_ui.js` | 102 | 585 KB | istniał | #25, #35, #36, #37, #38, #42, #43, #44, #45, #46, #48, #49 … |
| `vilda_advanced_growth.js` | 57 | 175 KB | istniał | #32, #33, #34, #40, #64, #65, #66, #68, #69, #71, #75, #80 … |
| `app.js` | 39 | 335 KB | istniał | #61, #62, #98, #111, #120, #121, #122, #125, #247, #248, #282, #295 … |
| `vilda_diet_plan_ui.js` | 38 | 115 KB | istniał | #119, #126, #127, #128, #129, #130, #135, #261, #262, #263, #274, #275 … |
| `vilda_data_import_export.js` | 37 | 142 KB | istniał | #92, #135, #208, #209, #222, #229, #232, #233, #237, #244, #245, #263 … |
| `vilda_summary_cards.js` | 35 | 62 KB | istniał | #33, #60, #61, #62, #133, #136, #138, #139, #140, #147, #151, #152 … |
| `vilda_vault.js` | 29 | 219 KB | istniał | #24, #166, #170, #171, #172, #175, #176, #184, #196, #197, #199, #201 … |
| `vilda_update_prep.js` | 25 | 218 KB | istniał | #120, #121, #122, #123, #127, #131, #135, #152, #276, #318, #319, #326 … |
| `vilda_epicrisis.js` | 17 | 34 KB | istniał | #72, #73, #75, #76, #144, #218, #219, #220, #312, #318, #327, #331 … |
| `vilda_epicrisis_ui.js` | 16 | 52 KB | istniał | #72, #74, #75, #77, #186, #220, #312, #318, #319, #327, #330, #336 … |
| `custom-fixes.js` | 13 | 70 KB | istniał | #152, #244, #299, #318, #324, #327, #330, #347, #352, #353, #354, #355 … |
| `vilda_terminarz.js` | 12 | 315 KB | istniał | #166, #167, #168, #169, #170, #171, #172, #173, #174, #252, #344, #356 |
| `inline_index_03.js` | 11 | 25 KB | istniał | #88, #93, #94, #95, #96, #97, #98, #99, #100, #317, #319 |
| `vilda_patient_summary_copy.js` | 11 | 11 KB | istniał | #304, #312, #316, #318, #319, #327, #330, #331, #336, #337, #349 |
| `growth-basic-module.js` | 10 | 30 KB | istniał | #62, #64, #66, #68, #69, #219, #311, #318, #348, #431 |
| `inline_index_07.js` | 9 | 20 KB | istniał | #80, #88, #89, #92, #93, #94, #96, #97, #98 |
| `vilda_growth_prediction_validation.js` | 9 | 39 KB | istniał | #24, #31, #41, #219, #306, #307, #310, #344, #451 |
| `nutrition_norms.js` | 8 | 75 KB | istniał | #115, #116, #118, #119, #248, #418, #433, #475 |
| `vilda_chrome.js` | 8 | 64 KB | istniał | #175, #177, #178, #344, #353, #354, #467, #468 |
| `gh_therapy_monitor.js` | 7 | 76 KB | istniał | #226, #314, #318, #349, #352, #357, #443 |
| `obesity_therapy_monitor.js` | 7 | 21 KB | istniał | #219, #288, #289, #328, #330, #364, #443 |
| `vilda_professional_module.js` | 7 | 31 KB | istniał | #186, #319, #329, #330, #331, #336, #337 |
| `vilda_sync_integration.js` | 7 | 16 KB | istniał | #194, #195, #196, #197, #201, #202, #353 |
| `bp_module.js` | 6 | 19 KB | istniał | #159, #161, #162, #163, #164, #319 |
| `inline_index_04.js` | 6 | 36 KB | istniał | #94, #95, #96, #97, #98, #99 |
| `vilda_deps.js` | 6 | 183 KB | istniał | #319, #320, #330, #333, #344, #410 |
| `inline_notatki_00.js` | 5 | 11 KB | istniał | #189, #190, #191, #192, #193 |
| `vilda_persist_runtime.js` | 5 | 50 KB | istniał | #92, #320, #324, #347, #452 |
| `circumference_module.js` | 4 | 45 KB | istniał | #146, #148, #151, #340 |
| `hypertension_therapy.js` | 4 | 45 KB | istniał | #248, #319, #329, #330 |
| `inline_index_05.js` | 4 | 4 KB | istniał | #98, #99, #155, #338 |
| `inline_ustawienia_04.js` | 4 | 45 KB | istniał | #175, #199, #202, #358 |
| `vilda_session_bridge.js` | 4 | 4 KB | istniał | #353, #354, #467, #468 |
| `vilda_shell.js` | 4 | 25 KB | istniał | #344, #345, #353, #454 |
| `advanced_growth_kowd.js` | 3 | 25 KB | istniał | #257, #260, #453 |
| `gh_igf_therapy.js` | 3 | 68 KB | istniał | #212, #299, #344 |
| `obesity_response_criteria.js` | 3 | 9 KB | istniał | #328, #373, #376 |
| `vilda_anorexia_risk.js` | 3 | 8 KB | istniał | #329, #330, #402 |
| `vilda_persistence_adapter.js` | 3 | 22 KB | istniał | #182, #199, #200 |
| `vilda_sync.js` | 3 | 17 KB | istniał | #175, #195, #358 |
| `flu_therapy.js` | 2 | 29 KB | istniał | #153, #460 |
| `inline_docpro_03.js` | 2 | 4 KB | istniał | #155, #338 |
| `ios26-ui.js` | 2 | 67 KB | istniał | #344, #476 |
| `nutrition_micros.js` | 2 | 288 KB | istniał | #329, #330 |
| `vilda_estimated_intake_ui.js` | 2 | 4 KB | istniał | #473, #475 |
| `vilda_gh_therapy_resource_audit.js` | 2 | 86 KB | istniał | #467, #476 |
| `vilda_save_status_indicator.js` | 2 | 11 KB | istniał | #299, #302 |
| `bayley_pinneau_data.js` | 1 | 56 KB | istniał | #259 |
| `bisphos_therapy_monitor.js` | 1 | 9 KB | istniał | #219 |
| `cukrzyca.js` | 1 | 140 KB | istniał | #299 |
| `html2canvas.min.js` (biblioteka zewnętrzna) | 1 | 194 KB | nowy po lipcu | #410 |
| `inline_docpro_05.js` | 1 | 21 KB | istniał | #99 |
| `jspdf.umd.min.js` (biblioteka zewnętrzna) | 1 | 355 KB | nowy po lipcu | #410 |
| `jszip.min.js` (biblioteka zewnętrzna) | 1 | 95 KB | nowy po lipcu | #74 |
| `lab_clinical_panels.js` | 1 | 1141 KB | istniał | #453 |
| `obesity_therapy.js` | 1 | 30 KB | istniał | #373 |
| `pdfmake.min.js` (biblioteka zewnętrzna) | 1 | 1355 KB | nowy po lipcu | #283 |
| `pdfmake_vfs_fonts.js` (biblioteka zewnętrzna) | 1 | 765 KB | nowy po lipcu | #283 |
| `reinehr_cdgp_data.js` | 1 | 5 KB | istniał | #260 |
| `rwt_data.js` | 1 | 19 KB | istniał | #259 |
| `sga_birth_module.js` | 1 | 36 KB | istniał | #223 |
| `vilda_app_helpers.js` | 1 | 22 KB | istniał | #344 |
| `vilda_centile_charts.js` | 1 | 20 KB | nowy po lipcu | #100 |
| `vilda_file_export.js` | 1 | 11 KB | istniał | #186 |
| `vilda_unsaved_guard.js` | 1 | 12 KB | istniał | #299 |

## Łatka P-GH-EDYCJA-LISTA (`gh_therapy_monitor.js` 49 → 50, 2026-10-06)

Zmiana wprost w artefakcie, opisana tu w czytelnej postaci do przeniesienia do lokalnego źródła. Nazwy w nawiasach to nazwy z artefaktu (`x` — id edytowanego punktu, `q()` — usunięcie notki edycji, `D()` — wczytanie listy z pamięci modułu, `F()` — tabela, `B()` — komunikat, `O()` — otwarcie edycji, `He()` — zapis W/K/Z, `re()` — usunięcie, `Ve()`/`Ue()` — `captureState`/`restoreState`). Wszystkie miejsca mają komentarz `P-GH-EDYCJA-LISTA`; opis działania: `docs/clinical/ALGORITHMS.md`, wpis o tej samej nazwie.

```js
let edycjaPacjent = null;                       // (Gep) znacznik pacjenta przy otwarciu edycji
function biezacyPacjent() {                     // (Gpid) jak w P-PRZEJECIE-MODULY
  try { return sessionStorage.getItem('vildaCurrentPatientId') || window._vildaCurrentPatientId || null; }
  catch { return window._vildaCurrentPatientId || null; }
}
function edycjaAktualna() {                     // (Gea)
  if (x == null) return true;
  const lista = Array.isArray(window.ghTherapyPoints) ? window.ghTherapyPoints : [];
  if (!lista.some((p) => p && String(p.id) === String(x))) return false;
  const teraz = biezacyPacjent();
  return !(edycjaPacjent && teraz && String(edycjaPacjent) !== String(teraz));
}
function koniecEdycji() {                       // (Gek) tylko stan edycji: bez listy, modułu, kanału i bazy
  x = null; edycjaPacjent = null;
  q();
  schowajFormularzEdycji();                     // (Gsch) ta sama funkcja chowa formularz po udanym zapisie edycji w He()
  zamknijNakladke('#ghEditOverlay');            // przycisk „Rozumiem”, potem usunięcie węzła
}

// D(): po wczytaniu listy
edycjaAktualna() || koniecEdycji();
// re(id): po filter + L() + F() + J('gh-point-deleted')
edycjaAktualna() || koniecEdycji();
// O(id): przy x = id
edycjaPacjent = biezacyPacjent();
// He(typ): na początku
const byla = x != null;
D();
if (byla && x == null) { F(); B(NIE_ZAPISANO); return; }
// He(typ), gałąź edycji: brak punktu o id x na liście (zamiast dopisania nowego obiektu)
else { koniecEdycji(); F(); B(NIE_ZAPISANO); return; }
// Ve(): po dotychczasowym warunku widoczności formularza
if (!edycjaAktualna()) return null;
// Ue(stan): po O(stan.currentEditingId)
if (x == null || String(x) !== String(stan.currentEditingId)) return true;   // wynik jak dotąd, bez wpisywania pól

const NIE_ZAPISANO = 'Nie zapisano zmian: edytowany punkt nie należy do bieżącej listy punktów. Otwórz edycję ponownie.';
```

Uzupełnienie P-GH-EDYCJA-PACJENT (`gh_therapy_monitor.js` 50 → 51): w nasłuchu `storage` monitora, zaraz po obsłudze `vilda:gh-jump`:

```js
if (klucz === 'vildaCurrentPatientId') { edycjaAktualna() || koniecEdycji(); return; }   // (Gea / Gek)
```

## Łatka P-GH-PUNKTY-API rata 2 (`gh_therapy_monitor.js`, 2026-10-07)

Klej monitora do czytelnego modułu `vilda_gh_punkty.js` (`window.VildaGhPunkty`). Zmiana wprost w artefakcie, w czytelnej postaci do przeniesienia do lokalnego źródła; miejsca mają komentarz `P-GH-PUNKTY-API rata 2`. Nazwy z artefaktu jak wyżej, a ponadto: `L()` — zapis listy, `Y()` — komunikat kanału `gh-therapy-sync` z `tabId`, `J()` — wskaźnik zapisu, `p()` — dziennik diagnostyczny, `Gsch()` — schowanie formularza edycji. Bez modułu, przy innej wersji API niż 2 (np. plik raty 1 z pamięci przeglądarki) albo przy module dawki bez funkcji `preparat` każde miejsce wykonuje **dosłownie stary kod**. Opis działania i dowód braku zmiany: `docs/clinical/ALGORITHMS.md`, P-GH-PUNKTY-API rata 2. Skrypt nałożenia łatki z kotwicami występującymi raz trzymamy poza repozytorium; łatkę nakłada się na wersję 52. *(Od raty 3 zapasu nie ma — sekcja niżej.)*

```js
function apiPunktow() {                         // (Gpa) bramka przy każdym zapisie
  try {
    const A = window.VildaGhPunkty, E = window.VildaGhDawka;
    return A && A.wersja === 2 && !(E && typeof E.preparat !== 'function') ? A : null;
  } catch { return null; }
}
function wartosc(id, zapas) {                   // (Gpv)
  const el = document.getElementById(id); return el ? el.value : zapas;
}

// He(typ) — zapis W/K/Z. Pierwszy krok bez zmian: blok P-GH-EDYCJA-LISTA (D(), edycja zakończona → F(), komunikat).
const A = apiPunktow();
if (A) {
  const r = A.sprawdzRodzaj(window.ghTherapyPoints, typ, { pomin: x });   // klucz pomin zawsze, także przy x == null
  if (!r.ok) { B(r.komunikat); return; }
  if (x) { edycjaPrzezApi(typ, A); return; }
} else { /* dotychczasowe dwa sprawdzenia some(...) */ }
// ... nowy punkt z karty: odczyty pól, wynik karty i Gmcalc bez zmian, a z modułem:
s = A ? A.jednostkaDawki(lek) : (dotychczasowe /^Ngenla/);
if (A) {
  dni = A.dniIgf(igf1, dni, s);
  ({ lata, miesiace } = A.normalizujWiek(lata, miesiace));
  const w = A.sprawdzWartosci({ lata, miesiace, masa, wzrost, dawka, preparat, program }, 'karta');
  if (!w.ok) { B(w.komunikat); return; }
} else { /* dotychczasowa normalizacja wieku i oba sprawdzenia */ }

function edycjaPrzezApi(typ, A) {               // (Gph) pola formularza edycji czytane jak w starym kodzie
  const w = A.polaZPodawanej({ typ, lata: wartosc('ghEditAge'), miesiace: wartosc('ghEditAgeMonths'),
    masa: wartosc('ghEditWeight'), wzrost: wartosc('ghEditHeight'), wiekKostny: wartosc('ghEditBoneAge', ''),
    podawana: wartosc('ghEditDose'), preparat: wartosc('ghEditDrug', null), program: wartosc('therProg', null),
    igf1: wartosc('ghEditIgf1'), dniIgf: wartosc('ghEditIgfDays') }, 'karta');
  if (!w.ok) { B(w.komunikat); return; }
  if (!A.zmienWMiejscu(window.ghTherapyPoints, x, w.pola).ok) {   // = dotychczasowa gałąź else
    koniecEdycji(); F(); B(NIE_ZAPISANO); return;
  }
  x = null; q(); Gsch(); L(); F(); J('gh-point-saved');
}

// ghAddRetroPoint — po D() i odczycie rodzaju z #ghRetroType:
const A = apiPunktow();
if (A) {
  const r = A.sprawdzRodzaj(window.ghTherapyPoints, rodzaj);       // bez klucza pomin, jak dotąd
  if (!r.ok) { B(r.komunikat); return; }
  const w = A.polaZPodawanej({ typ: rodzaj, /* pola #ghRetro* jak w starym kodzie, lek i program „|| null” */ }, 'wsteczny');
  if (!w.ok) { B(w.komunikat); return; }
  window.ghTherapyPoints.push(A.punkt(String(Date.now() + Math.random()), w.pola));   // id nadaje monitor, jak dotąd
  L(); F(); J('gh-retro-point-added'); window.ghCancelRetroForm();
  return;
}

// L() — zapis listy:
const A = apiPunktow();
if (A) {
  A.zapisz(window.ghTherapyPoints, { nadaj: (m) => Y(m, 'saveTherapyPoints:update'), blad: (e) => p(OSTRZEZENIE, e) });
  return;
}
```

Bez zmian: `D()`, `F()`, `O()`, `re()` (filtr bez zmian, zapis przez `L()`), `Q()`, nakładki, `Ve()`/`Ue()`, nasłuch `storage`.

## Łatka P-GH-PUNKTY-API rata 3, D5 (`gh_therapy_monitor.js` 53 → 54, 2026-10-07)

Koniec zapasu z raty 2: stary kod reguł punktu usunięty, a bez zgodnego modułu monitor odmawia zapisu. Zmiana wprost w artefakcie, miejsca mają komentarz `P-GH-PUNKTY-API rata 3 (D5)`. Bramka `apiPunktow()` (`Gpa`), `wartosc()` (`Gpv`) i `edycjaPrzezApi()` (`Gph`) bez zmian względem raty 2. Usunięte: gałęzie `else` z raty 2 (stary kod zapisu W/K/Z i edycji w `He`, punktu wstecznego i `L()`) oraz funkcje `Gmt` (dawka dobowa z podawanej; zastępuje ją `polaZPodawanej` w API) i `ve` (zapis do pamięci modułu; zastępuje go `zapisz`). Monitor sprzed API (wersja 52) zostaje w repozytorium jako wyrocznia testów: `tests/fixtures/gh-monitor-przed-api.js.txt`. Opis działania: `docs/clinical/ALGORITHMS.md`, P-GH-PUNKTY-API rata 3. Łatkę nakłada się na wersję 53.

```js
function odmowaBezModulu() {                    // (Gpn)
  B('Nie zapisano: aplikacja nie wczytała się w całości. Odśwież stronę i spróbuj ponownie.');
}

// He(typ) — zapis W/K/Z. Pierwszy krok bez zmian: blok P-GH-EDYCJA-LISTA (także bez modułu).
const A = apiPunktow();
if (!A) { odmowaBezModulu(); return; }
const r = A.sprawdzRodzaj(window.ghTherapyPoints, typ, { pomin: x });
if (!r.ok) { B(r.komunikat); return; }
if (x) { edycjaPrzezApi(typ, A); return; }
// ... nowy punkt z karty: odczyty pól, wynik karty i Gmcalc bez zmian; reguły wyłącznie z API:
s = A.jednostkaDawki(lek);
dni = A.dniIgf(igf1, dni, s);
({ lata, miesiace } = A.normalizujWiek(lata, miesiace));
const w = A.sprawdzWartosci({ lata, miesiace, masa, wzrost, dawka, preparat, program }, 'karta');
if (!w.ok) { B(w.komunikat); return; }

// ghAddRetroPoint — po D() i odczycie rodzaju z #ghRetroType:
const A = apiPunktow();
if (!A) { odmowaBezModulu(); return; }
// ... dalej jak w racie 2 (sprawdzRodzaj → polaZPodawanej('wsteczny') → punkt(id) → L(), F(), J, ghCancelRetroForm)

// re(id) — usunięcie, przed filtrem listy:
if (!apiPunktow()) { odmowaBezModulu(); return; }

// L() — zapis listy wyłącznie przez API (każde miejsce, które woła L(), sprawdziło bramkę wcześniej):
const A = apiPunktow();
if (A) A.zapisz(window.ghTherapyPoints, { nadaj: (m) => Y(m, 'saveTherapyPoints:update'), blad: (e) => p(OSTRZEZENIE, e) });
```

Bez zmian: `D()`, `F()`, `O()`, `Gmpod` (etykiety i tabela), `Gmcalc`, `Q()`, nakładki, `Ve()`/`Ue()`, nasłuch `storage`.

## Łatka P-GH-PUNKTY-USZKODZONE (`gh_therapy_monitor.js` 54 → 55, 2026-10-07)

Uszkodzony wpis listy punktów (nie obiekt: null, liczba, napis, true/false). Zmiana wprost w artefakcie, miejsca mają komentarz `P-GH-PUNKTY-USZKODZONE`. Bramka `apiPunktow()` (`Gpa`) wymaga teraz `wersja === 3`. Lista w oknie zostaje surowa (zapis stanu DocPro odtwarza z niej pamięć modułu); pomijają ją tylko widoki. Opis działania: `docs/clinical/ALGORITHMS.md`, P-GH-PUNKTY-USZKODZONE. Łatkę nakłada się na wersję 54.

```js
function punktyDoWidoku() {                     // (Gpo) to samo kryterium co VildaGhPunkty.uszkodzone
  return Array.isArray(window.ghTherapyPoints) ? window.ghTherapyPoints.filter((c) => Object(c) === c) : [];
}
function wstrzymajPrzyUszkodzonych(A) {         // (Gpg) true = odmowa pokazana
  const n = A.uszkodzone(window.ghTherapyPoints).length;
  if (n) komunikatUszkodzonych(A, n);
  return n > 0;
}
function komunikatUszkodzonych(A, n) {          // (Gpz) komunikat monitora B() z dodatkowym przyciskiem
  const k = A.komunikatyUszkodzonych(n);       // naglowek, tresc, przycisk
  B(k.tresc, k.naglowek);                       // #ghInfoOverlay; jego „OK” staje się „Anuluj” (bez btn-accent)
  // + <button id="ghDamagedRemoveBtn" class="gh-uszkodzone-napraw">k.przycisk</button>: zamyka (klik „Anuluj”)
  //   i woła naprawUszkodzone(). Style w klasach inline_docpro_00.css, bez stylów wpisanych w elementy.
}
function naprawUszkodzone() {                   // (Gpx)
  const A = apiPunktow();
  if (!A) { odmowaBezModulu(); return; }
  D();                                          // lista z pamięci modułu na nowo (zmiany z innej ramki zostają)
  window.ghTherapyPoints = A.bezUszkodzonych(window.ghTherapyPoints);
  L(); F(); J('gh-damaged-entries-removed');
}
function ostrzezenieNadTabela(tbody) {          // (Gpu) #ghTherapyDamagedNote przed .gh-monitor-tablewrap
  const n = (window.ghTherapyPoints || []).length - punktyDoWidoku().length;
  // n > 0 i zgodne API: <div class="gh-uszkodzone-ostrzezenie" role="status"> z "⚠ " + A.komunikatyUszkodzonych(n).ostrzezenie;
  // inaczej usunięty
}

// He (W/K/Z i edycja), ghAddRetroPoint, re (usunięcie) — zaraz za bramką modułu z PR-5:
if (!A) { odmowaBezModulu(); return; }
if (wstrzymajPrzyUszkodzonych(A)) return;

// Widoki: F (licznik, ostrzeżenie, pusta lista, wiersze), ae i Pe (wyniki monitorowania), ue (lustro w karcie
// zaawansowanej), O (otwarcie edycji) — window.ghTherapyPoints zastąpione przez punktyDoWidoku().
```

## Łatka P-GH-DAWKA-BEZ-MODULU, D6 (`gh_therapy_monitor.js` 55 → 56, 2026-10-07)

Zmiana kliniczna: bez modułu dawki (`window.VildaGhDawka` z funkcją `preparat`) monitor nie zapisuje żadnego punktu i prosi o odświeżenie strony. Dotąd brak modułu przepuszczał zapis (Increlex z połową dawki, nowy punkt Ngenla z karty z dawką tygodniową jako dobową). Zmiana wprost w artefakcie, miejsce ma komentarz `P-GH-DAWKA-BEZ-MODULU`. Opis działania i przypadki: `docs/clinical/ALGORITHMS.md`, P-GH-DAWKA-BEZ-MODULU. Łatkę nakłada się na wersję 55.

```js
function apiPunktowBezWarunkuDawki() {          // (Gpb) dawna bramka Gpa; korzysta z niej tylko ostrzeżenie Gpu
  try {
    const A = window.VildaGhPunkty, E = window.VildaGhDawka;
    return A && A.wersja === 3 && !(E && typeof E.preparat !== 'function') ? A : null;
  } catch { return null; }
}
function apiPunktow() {                         // (Gpa) bramka każdego zapisu: dochodzi warunek modułu dawki
  try {
    const A = apiPunktowBezWarunkuDawki(), E = window.VildaGhDawka;
    return A && E && typeof E.preparat === 'function' ? A : null;
  } catch { return null; }
}

// ostrzezenieNadTabela (Gpu): apiPunktow() → apiPunktowBezWarunkuDawki() (ostrzeżenie niczego nie zapisuje).
```

Bez zmian: miejsca wołające `apiPunktow()` (He, ghAddRetroPoint, re, naprawUszkodzone, L) i `odmowaBezModulu()` — bez modułu dawki dostają `null` i pokazują komunikat z PR-5.

## Łatka P-GH-EDYCJA-ODCISK (`gh_therapy_monitor.js` 56 → 57, 2026-10-07)

Uzupełnienie P-GH-EDYCJA-LISTA: przy pustym znaczniku pacjenta sesji karty (przy otwarciu edycji albo przy wczytaniu listy) edycja trwa tylko przy niezmienionym punkcie. Zmiana wprost w artefakcie, miejsca mają komentarz `P-GH-EDYCJA-ODCISK`. Opis działania: `docs/clinical/ALGORITHMS.md`, P-GH-EDYCJA-ODCISK. Łatkę nakłada się na wersję 56.

```js
let odciskEdycji = null;                        // (Gefp) obok znacznika pacjenta edycji (Gep)
function odcisk(punkt) {                        // (Gpfp) JSON z kluczami posortowanymi (także w obiektach zagnieżdżonych)
  try {
    return punkt && typeof punkt === 'object'
      ? JSON.stringify(punkt, (k, v) => (v && typeof v === 'object' && !Array.isArray(v)
        ? Object.keys(v).sort().reduce((o, K) => { o[K] = v[K]; return o; }, {}) : v))
      : null;
  } catch { return null; }
}

function edycjaAktualna() {                     // (Gea) wołane w D() i przy zapisie edycji
  if (x == null) return true;
  const lista = Array.isArray(window.ghTherapyPoints) ? window.ghTherapyPoints : [];
  if (!lista.some((t) => t && String(t.id) === String(x))) return false;      // P-GH-EDYCJA-LISTA
  const teraz = znacznikPacjenta();                                            // (Gpid)
  if (Gep && teraz) return String(Gep) === String(teraz);                     // jak dotąd
  if (odciskEdycji == null) return true;                                       // P-GH-EDYCJA-ODCISK
  return odcisk(lista.find((t) => t && String(t.id) === String(x))) === odciskEdycji;
}

// O(id) — otwarcie edycji (także z restoreState):  x = id; Gep = znacznikPacjenta(); odciskEdycji = odcisk(punkt);
// Gek() — koniec edycji:                           x = null; Gep = null; odciskEdycji = null;
```

## Łatka P-GH-SESJA-LISTA (`vilda_data_import_export.js` 98 → 99, 2026-10-06)

Zmiana wprost w artefakcie, w czytelnej postaci do przeniesienia do lokalnego źródła. W `saveMainSessionNow` (w artefakcie `oe`), zaraz po bloku scalania z poprzednią sesją (`Et`, P-SESJA-OBCA) i przed `writeMainSession`. Nazwy z artefaktu: `r` — okno, `i` — adapter `VildaPersistence`, `n` — zapisywana sesja, `l` — log połkniętego błędu. Opis działania: `docs/clinical/ALGORITHMS.md`, wpis o tej samej nazwie.

```js
// P-GH-SESJA-LISTA: na stronie bez #intakePal listę punktów GH w sesji wyznacza pamięć modułu, gdy klucz istnieje
try {
  const doc = window.document;
  const tabelaSpozycia = doc && doc.getElementById && doc.getElementById('intakePal');
  if (!tabelaSpozycia && typeof persistence.readModuleJSON === 'function') {
    const zModulu = persistence.readModuleJSON('GH_THERAPY_POINTS', null);
    if (Array.isArray(zModulu)) sesja.ghTherapyPoints = zModulu;   // także []
  }
} catch (e) { logBledu('vilda_data_import_export:saveMainSessionNow:gh-module', e); }
```

## Łatka P-NOWE-URZADZENIE (`vilda_sync_integration.js` 47 → 48, 2026-10-12)

Zmiana wprost w artefakcie, w czytelnej postaci do przeniesienia do lokalnego źródła. Dotyczy słuchacza odblokowania w `bindVault` (w artefakcie `G()` → wewnętrzne `r()`), pobrania w trybie chmurowym (`J()`) i eksportu `VildaSyncIntegration`. Nazwy z artefaktu: `n` — okno, `e` — `VildaSync`, `c` — wstrzymanie po błędzie uwierzytelnienia, `q` — klucz `vilda-new-device-restore-shown-v1`, `f()` — synchronizacja włączona, `lt` — 600 ms. Opis działania: `docs/clinical/ALGORITHMS.md`, wpis P-NOWE-URZADZENIE.

```js
// P-NOWE-URZADZENIE: licznik kroków startu synchronizacji (bramka banera aktualizacji czyta isStartupSyncInProgress)
let krokiStartu = 0, ostatniKrok = 0;
function startKrok() { krokiStartu++; ostatniKrok = Date.now(); }
function koniecKroku() { if (krokiStartu > 0) krokiStartu--; }
function trzymajDo(obietnica) {                 // w artefakcie Qn3
  startKrok();
  return Promise.resolve(obietnica).then((v) => { koniecKroku(); return v; }, (e) => { koniecKroku(); throw e; });
}
function isStartupSyncInProgress() {            // w artefakcie Qn4; sufit 5 min od ostatniego kroku
  return krokiStartu > 0 && Date.now() - ostatniKrok < 300000;
}

// w słuchaczu odblokowania (tryb lokalny, dokument najwyższego poziomu):
if (!isEmbeddedShellFrame()) {                  // w artefakcie T()
  startKrok();
  setTimeout(() => {
    try {
      if (authFailed) return;                   // c
      /* … odstęp po 429 bez zmian … */
      if (session.getItem(KLUCZ_ODPOWIEDZI)) { if (syncEnabled()) trzymajDo(sync.syncFull()).catch(() => {}); return; }
      if (session.getItem('vilda-probe-done-v1') || typeof sync.probeNewDevice !== 'function') {
        if (syncEnabled()) trzymajDo(sync.syncFull()).catch(() => {});
        return;
      }
      // DAWNIEJ: session.setItem('vilda-probe-done-v1', '1') tutaj, przed sondą
      trzymajDo(sync.probeNewDevice().then((wynik) => {
        if (authFailed) return;
        if (wynik && wynik.isNewDevice) {
          // DAWNIEJ: session.setItem(KLUCZ_ODPOWIEDZI, '1') tutaj — teraz stawia go okno po odpowiedzi
          document.dispatchEvent(new CustomEvent('vilda:new-device-restore-available', { detail: { lastModified: wynik.lastModified || null } }));
        } else {
          // tylko pewne „nie” odhacza sondę; wynik z inconclusive (błąd sieci, przerwane żądanie) — nie
          if (!(wynik && wynik.inconclusive)) session.setItem('vilda-probe-done-v1', '1');
          if (syncEnabled() && !authFailed) trzymajDo(sync.syncFull()).catch(() => {});
        }
      })).catch(() => { if (syncEnabled() && !authFailed) trzymajDo(sync.syncFull()).catch(() => {}); });
    } finally { koniecKroku(); }
  }, 600);
}

// tryb chmurowy (J): startKrok() na wejściu; pobranie (forcePullForCloudOnly) owinięte w trzymajDo;
// odstęp po 429 trzyma krok do ponownego wejścia; łańcuch canWarmStartCloudOnly kończy się .then(koniecKroku, koniecKroku).

// eksport: VildaSyncIntegration.isStartupSyncInProgress = isStartupSyncInProgress
```

## Łatka P-NOWE-URZADZENIE w sondzie (`vilda_sync.js` 37 → 38, 2026-10-12)

Zmiana wprost w artefakcie, tylko w `probeNewDevice` (w artefakcie `Xt`). Pewne „nie” zostaje bez zmian; wynik bez rozstrzygnięcia dostaje pole `inconclusive: true`, żeby integracja nie odhaczała sondy (`vilda-probe-done-v1`) po błędzie. Nazwy z artefaktu: `I()` — odblokowany sejf (rzuca `VAULT_LOCKED`), `m(slot)` — stan slotu w magazynie, `Brv_jest` — znacznik slotu obróconego w innej karcie, `f` — `fetch` z limitem czasu, `j()` — adres workera. Opis działania: `docs/clinical/ALGORITHMS.md`, wpis P-NOWE-URZADZENIE.

```js
async function probeNewDevice() {
  const niepewny = { isNewDevice: false, lastModified: null, inconclusive: true };   // w artefakcie Pn0
  let vault, material;
  try { vault = requireUnlockedVault(); } catch { return niepewny; }                // DAWNIEJ: pewne „nie”
  try { material = await vault.getSyncMaterial(); } catch { return niepewny; }     // DAWNIEJ: pewne „nie”
  const slot = material.slotId;
  if (loadSyncState(slot).registered || isRevokedSlot(slot)) return { isNewDevice: false, lastModified: null };
  try {
    const odp = await fetchWithTimeout(`${workerUrl()}/v1/slots/${slot}/status`, { method: 'GET', headers: { Authorization: `Bearer ${material.authToken}` } });
    if (odp.status === 404) return { isNewDevice: false, lastModified: null };     // serwer nie ma slotu — pewne „nie”
    if (!odp.ok) return niepewny;                                                   // DAWNIEJ: każde !ok = pewne „nie”
    const st = await odp.json();
    return { isNewDevice: true, lastModified: st.lastModified || st.updatedAt || null };
  } catch { return niepewny; }   // sieć, timeout, żądanie przerwane (przeładowanie karty) — DAWNIEJ: pewne „nie”
}
```

## Łatka P-NOWE-URZADZENIE etap 2 w pobieraniu (`vilda_sync.js` 38 → 39, 2026-10-13)

Zmiana wprost w artefakcie, w `syncPull` (w artefakcie `Y()`) i nowych funkcjach pomocniczych przed nim (`Bnd_*`). Blob jest czytany strumieniem z postępem i limitem czasu bez postępu, a wynik `not-registered` niesie kod HTTP. Bajty, odszyfrowanie, rozpakowanie i scalanie się nie zmieniają. Nazwy z artefaktu: `o` — okno, `Mt` — 30 000 ms, `A` — odpowiedź `GET /blob`, `w` — JSON z `/status`, `ut` — odszyfrowanie, `l` — odpowiedź `/status` urządzenia bez slotu, `P()` — znacznik pobrania w sesji. Opis działania: `docs/clinical/ALGORITHMS.md`, wpis P-NOWE-URZADZENIE etap 2.

```js
function zglosPostep(detail) {                                  // Bnd_zglos
  document.dispatchEvent(new CustomEvent('vilda:sync-download-progress', { detail, bubbles: false }));
}
function opisBajtow(n) {                                        // Bnd_mb (jak komunikat TIMEOUT w f())
  return n >= 1048576 ? (n / 1048576).toFixed(1) + ' MB' : Math.ceil(n / 1024) + ' kB';
}
function nastepnaPorcja(czytnik, pobrano, razem) {              // Bnd_krok: limit bez postępu = Mt (30 s)
  return new Promise((ok, blad) => {
    const zegar = setTimeout(() => {
      czytnik.cancel().catch(() => {});
      const e = new Error(`VildaSync: timeout pobierania danych — brak postępu przez 30 s (pobrano ${opisBajtow(pobrano)}${razem > 0 ? ' z ' + opisBajtow(razem) : ''}).`);
      e.code = 'TIMEOUT'; e.loaded = pobrano; e.total = razem;
      blad(e);
    }, 30000);
    czytnik.read().then((r) => { clearTimeout(zegar); ok(r); }, (e) => { clearTimeout(zegar); blad(e); });
  });
}
async function czytajBlob(odpowiedz, rozmiarZeStatusu) {         // Bnd_czytaj
  let razem;
  try { razem = parseInt(odpowiedz.headers.get('Content-Length'), 10) || 0; } catch { razem = 0; }
  if (!(razem > 0)) razem = rozmiarZeStatusu > 0 ? rozmiarZeStatusu : 0;
  let czytnik;
  try { czytnik = odpowiedz.body && typeof odpowiedz.body.getReader === 'function' ? odpowiedz.body.getReader() : null; } catch { czytnik = null; }
  if (!czytnik) {                                               // bez strumieni: jak dotąd
    const caly = await odpowiedz.arrayBuffer();
    zglosPostep({ phase: 'download', loaded: caly.byteLength, total: Math.max(razem, caly.byteLength) });
    return caly;
  }
  const porcje = []; let pobrano = 0, ostatnio = 0;
  zglosPostep({ phase: 'download', loaded: 0, total: razem });
  for (;;) {
    const { done, value } = await nastepnaPorcja(czytnik, pobrano, razem);
    if (done) break;
    if (!value || !value.byteLength) continue;
    porcje.push(value); pobrano += value.byteLength;
    if (Date.now() - ostatnio >= 100) { ostatnio = Date.now(); zglosPostep({ phase: 'download', loaded: pobrano, total: Math.max(razem, pobrano) }); }
  }
  zglosPostep({ phase: 'download', loaded: pobrano, total: Math.max(razem, pobrano) });
  const wynik = new Uint8Array(pobrano); let przesuniecie = 0;
  for (const p of porcje) { wynik.set(p, przesuniecie); przesuniecie += p.byteLength; }
  return wynik.buffer;
}

// w syncPull, urządzenie bez slotu, /status !ok:
//   DAWNIEJ: { action: 'not-registered' }
const wynik = { action: 'not-registered', httpStatus: odpowiedzStatusu.status };
// w syncPull, po sprawdzeniu odpowiedzi GET /blob:
//   DAWNIEJ: const bajty = await odpowiedzBloba.arrayBuffer();
const bajty = await czytajBlob(odpowiedzBloba, typeof stanSlotu.size === 'number' ? stanSlotu.size : 0);
zglosPostep({ phase: 'decrypt' });
// dalej bez zmian: odszyfrowanie, rozpakowanie gzip, JSON, mergeSyncPayload z vilda:vault-merge-progress
```

Wyłączność pierwszego pobrania (czerwony E2E odłamek 1/3 w CI #652). Dawne ciało `Y()` przeszło bez zmian do `Bpw_pull()`, a `Y` (eksport `syncPull`, wołane też przez `syncFull`, wysyłkę i `restorePrevBlob`) jest teraz opakowaniem. Kolejność kroków samego pobrania się nie zmienia.

```js
const NAZWA = 'vilda-sync-pierwsze-pobranie-v1';                // Bpw_N
let pierwszeWDokumencie = null;                                 // Bpw_w: obietnica trwającego pierwszego pobrania
function blokady() {                                            // Bpw_lk: Web Locks albo null
  try { const l = window.navigator && window.navigator.locks; return l && typeof l.request === 'function' ? l : null; } catch { return null; }
}
function wylacznie(pobierz) {                                   // Bpw_wylacznie
  const l = blokady();
  let ruszylo = false;
  const start = () => { ruszylo = true; return pobierz(); };
  const p = Promise.resolve(l
    ? Promise.resolve().then(() => l.request(NAZWA, { mode: 'exclusive' }, start))
      .catch((e) => { if (ruszylo) throw e; return pobierz(); }) // błąd samej blokady: pobranie i tak rusza
    : start());
  pierwszeWDokumencie = p;
  const sprzataj = () => { if (pierwszeWDokumencie === p) pierwszeWDokumencie = null; };
  p.then(sprzataj, sprzataj);
  return p;
}
function bariera(l) {                                           // Bpw_bariera: czeka tylko na pierwsze pobranie
  const tutaj = pierwszeWDokumencie ? pierwszeWDokumencie.then(() => {}, () => {}) : Promise.resolve();
  return l ? tutaj.then(() => l.request(NAZWA, { mode: 'shared' }, () => {})).then(() => {}, () => {}) : tutaj;
}
function syncPull(opcje) {                                      // Y
  if (opcje && opcje.pierwszePobranie === true) return wylacznie(pobierzTeraz);
  const l = blokady();
  return !pierwszeWDokumencie && !l ? pobierzTeraz() : bariera(l).then(pobierzTeraz);
}
async function pobierzTeraz() { /* Bpw_pull: dawne ciało Y() bez zmian */ }
```

W integracji `pullForNewDevice` (niżej) woła `sync.syncPull({ pierwszePobranie: true })` zamiast `sync.syncPull()`.

## Łatka P-NOWE-URZADZENIE etap 2 w integracji (`vilda_sync_integration.js` 48 → 49, 2026-10-13)

Zmiana wprost w artefakcie. Start po odblokowaniu (w artefakcie wewnętrzne `r()` w `G()`) najpierw pyta moduł nowego urządzenia, a eksport dostaje `pullForNewDevice`. Nazwy z artefaktu: `n` — okno, `h()` — `VildaSync`, `p` — flaga trwającego pobrania integracji (sprawdzają ją `U()`, `S()` i `ot()`), `O` — czas ostatniego pobrania (interwał tła pobiera najwcześniej 12 s po nim), `c` — wstrzymanie po błędzie uwierzytelnienia, `y()` — pozostały odstęp po 429. Opis działania: `docs/clinical/ALGORITHMS.md`, wpis P-NOWE-URZADZENIE etap 2.

```js
function modulPrzejmujeStart() {                                 // Qd2
  try {
    const m = window.VildaNoweUrzadzenie;
    return !!(m && typeof m.przejmujeStart === 'function' && m.przejmujeStart());
  } catch { return false; }                                      // wyjątek modułu: start jak dotąd
}

function pullForNewDevice() {                                    // Qd0
  const sync = window.VildaSync;
  if (!sync || typeof sync.syncPull !== 'function') {
    const e = new Error('Moduł synchronizacji niedostępny.'); e.code = 'SYNC_NO_API';
    return Promise.reject(e);
  }
  return new Promise((ok, blad) => {
    (function sprobuj() {
      if (pobieranieWToku) { setTimeout(sprobuj, 250); return; } // czeka na pobranie integracji już w toku (p)
      pobieranieWToku = true; ostatniePobranie = Date.now();     // p = true, O = teraz: U/S/ot nie pobierają równolegle
      // { pierwszePobranie: true }: vilda_sync.js trzyma blokadę wyłączną — inne pobrania (arkusz przypomnień,
      // ramki paneli, inne karty) czekają na koniec tego pobrania.
      Promise.resolve().then(() => sync.syncPull({ pierwszePobranie: true })).then(
        (w) => { pobieranieWToku = false; ostatniePobranie = Date.now(); ok(w); },
        (e) => { pobieranieWToku = false; ostatniePobranie = Date.now(); blad(e); },
      );
    })();
  });
}

// w słuchaczu odblokowania (tryb lokalny, dokument najwyższego poziomu), w setTimeout(…, 600):
if (!authFailed) {
  if (modulPrzejmujeStart()) return;            // NOWE: czeka pierwsze pobranie tego konta — sondę i syncFull pomija
  /* … dalej bez zmian: odstęp po 429, znacznik odpowiedzi, znacznik sondy, sonda, syncFull … */
}

// eksport: VildaSyncIntegration.pullForNewDevice = pullForNewDevice
```

## Łatka P-AKTUALIZACJA-BRAMKA (`ios26-ui.js` 44 → 45, 2026-10-12)

Zmiana wprost w artefakcie. W funkcji, która pokazuje baner czekającego SW (w artefakcie `Mt(registration, worker, reason)`), wywołanie banera (`zn(...)`) idzie przez bramkę; reszta bez zmian. Nazwy z artefaktu: `D()` — stan `window.__vildaServiceWorkerClientLifecycle`, `zn` — budowa banera, `At` — `SKIP_WAITING`. Opis działania: `docs/clinical/ALGORITHMS.md`, wpis P-NOWE-URZADZENIE.

```js
// P-AKTUALIZACJA-BRAMKA
const LIMIT = 600000, SPOKOJ = 1500, TAKT = 1000;
let pokaz = null, pokazany = false, wymuszony = false, wolneOd = 0, zamknieteOd = 0, zegar = 0;

function widoczny(el) { try { return !!el && getComputedStyle(el).display !== 'none'; } catch { return false; } }
function powodyWstrzymania() {
  const p = [];
  const html = document.documentElement;
  if (html.classList.contains('vilda-auth-locked') || widoczny(document.querySelector('.vilda-auth-root'))) p.push('logowanie');
  else for (const ramka of Array.from(window.frames)) {          // ramki powłoki (same-origin)
    try { if (ramka.document.body.classList.contains('vilda-auth-embedded-open')) { p.push('logowanie'); break; } } catch {}
  }
  if (window.VildaSyncIntegration?.isStartupSyncInProgress?.()) p.push('start-synchronizacji');
  if (window.VildaNoweUrzadzenie?.czyAktywne?.()) p.push('nowe-urzadzenie');
  if (widoczny(document.getElementById('vildaCloudOnlyLoading'))) p.push('tryb-chmurowy');
  return p;
}
function stop() { clearInterval(zegar); zegar = 0; pokaz = null; pokazany = false; wymuszony = false; wolneOd = 0; zamknieteOd = 0; }
function krok() {
  const stan = getSWClientLifecycleState(), teraz = Date.now(), p = powodyWstrzymania();
  const baner = document.getElementById('sw-update-banner');
  stan.updateBannerDeferReasons = p.slice();
  if (p.length) { wolneOd = 0; zamknieteOd ||= teraz; } else { zamknieteOd = 0; wymuszony = false; wolneOd ||= teraz; }
  if (pokazany) {
    if (!baner || stan.updateBannerPendingReload) return stop();        // „Później” albo „Aktualizuj”
    if (p.length && !wymuszony) {                                        // proces ruszył — schowaj, wróci po nim
      baner.remove(); stan.updateBannerActive = false;
      stan.updateBannerDeferredHideCount = (stan.updateBannerDeferredHideCount || 0) + 1; pokazany = false;
    }
    return;
  }
  if (!pokaz) return stop();
  if (p.length) {
    if (teraz - zamknieteOd < LIMIT) return;
    wymuszony = true; stan.updateBannerDeferLimitCount = (stan.updateBannerDeferLimitCount || 0) + 1;
  } else if (teraz - wolneOd < SPOKOJ) return;
  try { pokaz(); } catch (e) { stan.lastError = e?.message || String(e); }
  pokazany = !!document.getElementById('sw-update-banner');
  if (!pokazany) stop();
}
function zglosBaner(fn) {                                                // w artefakcie Bab_zglos
  const stan = getSWClientLifecycleState();
  pokaz = fn; stan.updateBannerGateRequestCount = (stan.updateBannerGateRequestCount || 0) + 1;
  if (powodyWstrzymania().length) stan.updateBannerDeferredCount = (stan.updateBannerDeferredCount || 0) + 1;
  if (pokazany && document.getElementById('sw-update-banner')) return;
  pokazany = false; krok();
  if (!zegar && pokaz) zegar = setInterval(krok, TAKT);
}
window.VildaServiceWorkerClientLifecycle.updateBannerGateReasons = powodyWstrzymania;

// w Mt, zamiast bezpośredniego showUpdateBanner(...):
zglosBaner(() => showUpdateBanner(() => postSkipWaiting(registration, reason), { reason, notes }, onDismissShowIndicator));
```

## Łatka P-PRZYPOMNIENIA-ECHO (`vilda_auth_ui.js` 485 → 486, 2026-10-13)

Zmiana wprost w artefakcie, jedno wyrażenie w funkcji podpinającej kartę „Przypomnienia” (w artefakcie `Wr()`). Nasłuch kanału `vilda-notes` używa obiektu, którym karta wysyła ping samonaprawy licznika. Nazwy z artefaktu: `kn` — kanał nadawczy modułu, `Tr` — ping samonaprawy po renderze, `xe` — przebudowa karty w następnej klatce. Opis działania: `docs/clinical/ALGORITHMS.md`, wpis P-PRZYPOMNIENIA-ECHO.

```js
// P-PRZYPOMNIENIA-ECHO, w Wr():
// było: const nasluch = new BroadcastChannel('vilda-notes');
const nasluch = kanalNadawczy || new BroadcastChannel('vilda-notes');   // kn: ten sam obiekt, którym Tr() wysyła ping
nasluch.onmessage = (e) => {                                            // bez zmian
  if (e && e.data && e.data.type === 'note-changed') przebudujWNastepnejKlatce();   // xe()
};
```

## Łatka P-WIEK-POMIARU-2 (wołający rdzenia centyli, 2026-10-14)

Zmiana wprost w artefaktach: same wywołania rdzenia, `app.js` bez zmian. Kontrakt rdzenia dał P-WIEK-POMIARU (#671): ostatni argument `{wiekMies}` — liczba to dokładny wiek pomiaru w miesiącach, `null` to pełne miesiące, a brak obiektu oznacza pomiar z formularza (bramka DOB-AGE-4). Rejestr: `docs/clinical/ALGORITHMS.md`, P-WIEK-POMIARU-2.

```js
// gh_therapy_monitor.js — r(): hSDS punktu GH (punkt nie ma dnia pomiaru)
calcPercentileStats(wzrost, plec, wiekLat, 'HT', { wiekMies: null });

// vilda_auth_ui.js — Karta pacjenta
En(wzrost, plec, wiekLat, 'HT', zrodlo, { wiekMies: null });            // ci(): żetony hSDS punktów GH
En(wzrostDocelowy, plec, 18, 'HT', zrodlo, { wiekMies: null });          // MPH na 18 lat
getChildLMS(plec, miesiac / 12, 'HT' /* i 'WT' */, { wiekMies: null });  // krzywe odniesienia wykresów

// vilda_growth_prediction_validation_model.js — hSds() punktu walidacji (czytelne źródło)
f(wzrost, plec, wiekLat, 'HT', { wiekMies: null });

// vilda_professional_module.js — wiersz wsadu; Ce = doby od urodzenia do daty pomiaru wiersza / 30,4375
calcPercentileStats(masa, plec, wiekLat, 'WT', { wiekMies: Ce });
calcPercentileStats(wzrost, plec, wiekLat, 'HT', { wiekMies: null });   // zapas, gdy silnik nie policzy wieku dokładnego (np. 216,016 mies.)

// custom-fixes.js — mini-podsumowanie powłoki; A(…, w) przekazuje w do calcPercentileStats
A(masa, plec, wiekLat, 'WT', zrodlo, ramkaNieaktualna ? { wiekMies: null } : undefined);   // Gq5s

// inline_index_04.js, inline_index_07.js — wzrost rodziców na 18 lat
calcPercentileStats(wzrostDocelowy, plec, 18, 'HT', { wiekMies: null });
```

## Łatka P-WIEK-POMIARU-3 (karta porównania, masa poniżej 3 lat przy OLAF, wiek kostny, 2026-10-14)

Zmiana wprost w artefaktach. Rejestr: `docs/clinical/ALGORITHMS.md`, P-WIEK-POMIARU-3. Nazwy z artefaktów: `q` — `__pickLastMeasurement`, `Se` — budowa kolumny „Poprzednio”, `En` — centyl kafelka Karty, `I` — centyl wiersza schowka.

```js
// vilda_summary_cards.js — karta porównania
function q(rekord) { /* … */ info.wiekMies = Sw_wiekPomiaru(rekord, info.ageMonths); return info; }   // wiek z doby pomiaru albo null
function Sw_wiekDzis(wiekLat) { return lmsNiemowleWiek(Math.round(wiekLat * 12)); }                  // bramka DOB-AGE-4 formularza; null = pełne miesiące
function Sw_masaPal(wiekLat) { return bmiSource === 'PALCZEWSKA' || (bmiSource === 'OLAF' && wiekLat < OLAF_DATA_MIN_AGE); }
masa = Sw_masaPal(r) ? calcPercentileStatsPal(kg, plec, r, 'WT') : calcPercentileStats(kg, plec, r, 'WT', { wiekMies: Pw });  // Se()
vildaPorownanieZPoprzednim({ ...poprzedni, wiekMies: prevMeasurementInfo.wiekMies },
  { ageMonths: A * 12, wiekMies: Sw_wiekDzis(A), /* … */ }, opt);                                     // updatePrevSummaryDiff()
// w modelu: wA, wB = wiek dokładny albo pełne miesiące
stat('HT', wzrost, wA); oc(bmi, wA); B.cole({ /* … */ wiekMies: wA });
statW(masa, aM, wA);   // pełne miesiące; na siatce WHO poniżej 36 mies. — wiek dokładny

// app.js — advHistoryGetChildLMSForSource(): masa WHO 0–35 mies.
lmsNiemowle(LMS_INFANT_WEIGHT_X, Math.round(wiekLat * 12), { wiekMies: Math.round(wiekLat * 12 * 1e3) / 1e3 });  // było: wiersz [Math.round(…)]

// vilda_auth_ui.js — En(); vilda_patient_summary_copy.js — I()
var zr = zrodloZapisu || bmiSource;
if (param !== 'HT' && (zr === 'PALCZEWSKA' || (zr === 'OLAF' && wiekLat < 3))) return calcPercentileStatsPal(wartosc, plec, wiekLat, param);

// vilda_advanced_growth.js — heightSdsForBoneAge (u = calcPercentileStats)
calcPercentileStats(wzrost, plec, wiekKostnyLat, 'HT', { wiekMies: null });
```

## Łatka P-GRANICA-URODZIN (granice pełnych miesięcy, 2026-10-14)

Zmiana wprost w artefaktach `app.js` i `vilda_professional_module.js`. Silniki (`vilda_sds_wzrostu.js`, `vilda_bmi.js`: dane `GRANICE`) i karta zespołu Downa (`vilda_down_syndrome.js`) są czytelnymi źródłami i zmieniły się wprost w nich. Reguła: siatkę wybierają pełne miesiące, wiek dokładny tylko interpoluje; noworodek według dób. Rejestr: `docs/clinical/ALGORITHMS.md`, P-GRANICA-URODZIN.

```js
// app.js — nowa funkcja przed lmsNiemowleWiek (w artefakcie jedna linia)
function vildaWiekDoSiatek(wiek, pelne, populacja) {
  if (typeof wiek !== 'number' || !isFinite(wiek) || wiek < 0) return wiek;
  const p = pelne == null || pelne === '' ? NaN : Number(pelne);
  if (!isFinite(p) || p < 0 || Math.floor(p) !== p) return wiek;      // brak pełnych miesięcy: bez zmian
  const r = wiek - p;
  if (!(r > -0.5 && r < 1.5)) return wiek;                             // para nie z tego samego dnia: bez zmian
  const W = typeof window !== 'undefined' ? window : globalThis;
  let lo = -Infinity, hi = Infinity;
  [W.VildaSdsWzrostu, W.VildaBmi].forEach(function (S) {
    if (!S || !S.GRANICE) return;
    let pop;
    try { pop = populacja != null ? S.normPopulacja(populacja) : S.populacjaZOpcji({}); } catch (e) { pop = 'OGOLNA'; }
    const g = S.GRANICE[pop];
    if (!g) return;
    g.od.forEach(function (b) { if (b <= p) lo = Math.max(lo, b); else hi = Math.min(hi, b - 1e-6); });
    g.do.forEach(function (b) { if (b >= p) hi = Math.min(hi, b); });
  });
  return Math.min(Math.max(wiek, lo), hi);
}

// app.js — lmsNiemowleWiek(a, wp), ścieżka formularza (DOB-AGE-4); a = pełne miesiące formularza
return t >= 0 ? (typeof vildaWiekDoSiatek === 'function' ? vildaWiekDoSiatek(t, a) : t) : null;

// app.js — vildaWiekPomiaruMies(r, iso, pelne); pełne miesiące z dnia pomiaru
return m >= 0 ? (typeof vildaWiekDoSiatek === 'function' ? vildaWiekDoSiatek(m, w.totalMonths) : m) : null;

// vilda_professional_module.js — wiersz wsadu; p: data urodzenia, dpD/dpOk: data pomiaru, Ce = doby / 30,4375, re = Ce / 12
const Pm = VildaDobAge.ageFromDobISO(lokalnaDataISO(p), dpOk ? dpD : new Date()).totalMonths;   // null bez modułu albo przy |Ce − Pm| ≥ 1,5
const Cs = Pm != null ? vildaWiekDoSiatek(Ce, Pm, 'OGOLNA') : Ce;
const Rp = Pm != null ? Pm / 12 : re;
// Palczewska: masa calcPercentileStatsPal(P, r, Rp, 'WT'); wzrost Zw(ae, r, Cs / 12, 'PALCZEWSKA'),
//             zapas calcPercentileStatsPal(ae, r, Rp, 'HT'); BMI Zb(Je, r, Cs, 'PALCZEWSKA')
// OLAF/WHO:   masa calcPercentileStats(P, r, Rp, 'WT', { wiekMies: Cs }); wzrost Zw(ae, r, Cs / 12, t),
//             zapas calcPercentileStats(ae, r, Rp, 'HT', { wiekMies: null }); BMI Zb(Je, r, Cs, t)
```

## Łatka P-LAB-TREND-CONVERT (`vilda_auth_ui.js` 491 → 492, 2026-10-14)

Zmiana wprost w artefakcie, w funkcji, która z serii sejfu buduje punkty wykresu wyników (w artefakcie `yi()`). Wołają ją „Trend wyników” w Historii (`Jl()`), nakładki wyników na siatkach centylowych i eksport siatek do PDF (`Gl()`). Nazwy z artefaktu: `t` — seria z `listPatientLabSeries`, `r` — jednostka serii (najczęstsza w serii), `s` — `window.LabUnitConverter`, `point()` — budowa punktu wykresu. Opis działania: `docs/clinical/ALGORITHMS.md`, wpis LAB-TREND-CONVERT.

```js
// P-LAB-TREND-CONVERT, w yi(); konwerter = window.LabUnitConverter, seria = t, wpis = punkt serii
// było: if (konwerter && seria.testKey && typeof konwerter.convert === 'function' && wpis.unit) {
//         const wynik = konwerter.convert(seria.testKey, wpis.valueNum, wpis.unit);   // zawsze „Nie znaleziono substancji.”
if (konwerter && seria.testKey && typeof konwerter.convertAll === 'function' && wpis.unit) {
  const wynik = konwerter.convertAll({ substanceId: seria.testKey, value: wpis.valueNum, fromUnit: wpis.unit });
  // dalej bez zmian: wartość z wynik.results o symbolu równym jednostce serii; brak takiej → „pominięto”
}

// point(wpis, wartosc, przeliczony)
// było: norm: wpis.norm || null
norm: przeliczony ? null : (wpis.norm || null),   // tekstowa norma wpisu jest w jednostce zapisu, nie serii
```

Część 2: żadna strona z kartą pacjenta nie ładuje `lab_unit_converter.js` statycznie. Start (`index.html`) doładowuje go w czasie bezczynności albo przy pierwszym dotknięciu lub klawiszu, pozostałe (DocPro, Notatki, Terminarz, Ustawienia, Klirens, Subskrypcja, powłoka) dopiero przez `ja()` (sprostowanie z P-LAB-TREND-CONVERT-2; pierwotny opis wyłączał Start). „Trend wyników” (`Jl()`) i nakładki na siatki (`Kl()`) wołały `yi()` przed jego doładowaniem, a późniejszy render odświeżał tylko strzałki, więc punkt w innej jednostce nadal znikał. Nowe funkcje stoją tuż za `yi()`; obie strony wołają `await LtcCzekajNaKonwerter(serie)` zaraz po odczycie serii z sejfu. Eksport siatek do PDF (`Yl()` → `Gl()`) czekał na `ja()` już wcześniej.

```js
// P-LAB-TREND-CONVERT, część 2 (nazwy z artefaktu: ja — leniwe ładowanie konwertera, i — window)
function LtcSeriaWielujednostkowa(serie) {          // czy któraś seria ma wpisy w więcej niż jednej jednostce
  return (serie || []).some((s) => new Set(((s && s.points) || []).map((p) => (p && p.unit) || '?')).size > 1);
}
async function LtcCzekajNaKonwerter(serie) {
  if (!LtcSeriaWielujednostkowa(serie) || typeof ja !== 'function'
      || (window.LabUnitConverter && typeof window.LabUnitConverter.convertAll === 'function')) return;
  try {
    await Promise.race([new Promise((gotowe) => ja(() => gotowe())), new Promise((gotowe) => setTimeout(gotowe, 5000))]);
  } catch {}
}
// Jl(): po `o = await r.listPatientLabSeries(a)` → await LtcCzekajNaKonwerter(o);
// Kl(): po odczycie serii i okresów leczenia → await LtcCzekajNaKonwerter(d);
```

## Łatka P-LAB-TREND-CONVERT-2 (`vilda_auth_ui.js` 492 → 493, 2026-10-14)

Poprawka po scaleniu P-LAB-TREND-CONVERT (przegląd PR0); wyniki, jednostki i strzałki bez zmian. Dwie zmiany w artefakcie, opis w `docs/clinical/ALGORITHMS.md`, wpis P-LAB-TREND-CONVERT-2.

Pierwsza: `LtcSeriaWielujednostkowa()` liczy jednostki tylko dokładnych wyników (skończone `valueNum`, niepusta jednostka) i pomija serie z kluczem zawierającym „:” (klirens `clcr:…`, którego konwerter nie zna). Dawniej czekanie uruchamiały też wpis bez jednostki (`'?'`), wpis bez liczby i seria klirensu w kilku jednostkach, choć `yi()` i tak by ich nie przeliczyło.

```js
// P-LAB-TREND-CONVERT-2; było: new Set(((s && s.points) || []).map((p) => (p && p.unit) || '?')).size > 1
function LtcSeriaWielujednostkowa(serie) {   // seria z dokładnymi wynikami w więcej niż jednej jednostce
  return (serie || []).some((s) => {
    if (!s || String(s.testKey || '').includes(':')) return false;
    const jednostki = new Set();
    (s.points || []).forEach((p) => {
      if (p && typeof p.valueNum === 'number' && isFinite(p.valueNum) && p.unit) jednostki.add(p.unit);
    });
    return jednostki.size > 1;
  });
}
```

Druga: znacznik pokolenia na kontenerze w `Kl()` (nakładki na siatki, kontener `Qt`, ponownie wołane przez `we()`) i w `Xl()` (Historia, która czeka na `Jl()`; kontener `ca`, ponownie wołane przez `Ue()`). Czekanie na konwerter (do 5 s) poszerzyło okno, w którym drugie wywołanie czyści kontener i rysuje od nowa, a pierwsze po przebudzeniu dopisywało swoją sekcję: dwa wiersze chipów nakładek albo dwie listy „Historia pacjenta”. `Xl()` sprawdza znacznik także po odczycie zdarzeń osi czasu i pacjenta, bo za nim dopisuje listę zdarzeń wprost do kontenera; to krótsze okno istniało przed P-LAB-TREND-CONVERT.

```js
// P-LAB-TREND-CONVERT-2
// Kl(t, …): const pokolenie = t ? (t._vildaLtcGenKl = (t._vildaLtcGenKl || 0) + 1) : 0;
//           … po await LtcCzekajNaKonwerter(d): if (t && t._vildaLtcGenKl !== pokolenie) return;
// Xl(t, …): const pokolenie = t ? (t._vildaLtcGenXl = (t._vildaLtcGenXl || 0) + 1) : 0;
//           … po try { await Jl(d, a, n) } catch { oe(d) }: if (t && t._vildaLtcGenXl !== pokolenie) return;
//           … po odczycie zdarzeń (await l.listPatientTimelineEvents) i pacjenta (await l.getPatient),
//             czyli po `} catch { z = null }`, przed listą .vilda-patient-timeline-list: ten sam warunek
```

## Łatka P-LAB-WARTOSC-BEZ-JEDNOSTKI (`vilda_vault.js` 211 → 212, 2026-10-14)

Zmiana wprost w artefakcie: funkcja `vo()`, która w `listPatientLabSeries` (w artefakcie `Po()`) czyta liczbę i jednostkę z tekstu `labResult.value` notatki bez `valueNum` (punkt `legacy: true`). W artefakcie stoi teraz w czytelnej postaci z komentarzem, tuż przed `Cr()`. Opis działania: `docs/clinical/ALGORITHMS.md`, wpis P-LAB-WARTOSC-BEZ-JEDNOSTKI.

```js
// było: var e = /^\s*(\d+(?:[.,]\d+)?)\s*([^\s=]+)/.exec(String(t || ""));   // „15” → 1 i „5”
//       … return { num: n, unit: e[2] };
function vo(t) {
  var tekst = String(t || "");
  var liczba = /^\s*(\d+(?:[.,]\d+)?)/.exec(tekst);                     // zachłannie: cała liczba, bez cofania
  if (!liczba) return null;
  var n = parseFloat(liczba[1].replace(",", "."));
  if (!isFinite(n) || n < 0) return null;
  var jednostka = /^\s*([^\s=]*)/.exec(tekst.slice(liczba[0].length))[1];   // może być pusta
  return { num: n, unit: jednostka || null };                              // Po(): unit = lab.unit || parsed.unit (bez zmian)
}
```

## Łatki P-BADANIA (`vilda_auth_ui.js` 493 → 494, `vilda_auth_ui.css` 78 → 79, 2026-10-14)

Piąta zakładka karty pacjenta „Badania” (LAB-HISTORIA PR2). Widok rysuje czytelny moduł `vilda_lab_history_tab.js` (+ `vilda_lab_history_tab.css`) na modelu `vilda_lab_history.js`; w artefakcie są tylko punkty wpięcia. Opis działania: `docs/clinical/ALGORITHMS.md`, wpis „LAB-HISTORIA PR2”; projekt: `docs/LAB_HISTORIA_WYNIKOW_PLAN.md`, 3.2. Nazwy z artefaktu: `se()` — karta pacjenta, `t` — id pacjenta, `e()` — budowa elementu, `at()` — ikona z etykietą zakładki, `ua()` — przełączenie zakładki, `ia()` — wpis nawigacji, `ga()` — edytor notatki, `Mr()` — arkusz przypomnień, `Xo`/`da()` — Notatki, `Xl`/`Ue()` — Historia, `ue`/`Ae` — flagi „narysowane”, `xa` — pamięć karty.

Strażnik kolizji (plan 3.2, K16): nowe nazwy w `se()` mają prefiks `Gd`. Przed edycją żadna nie występowała w pliku:

```bash
git show origin/audyt:vilda_auth_ui.js | grep -o -w -E 'GdLabTab|GdLabHost|GdLabOnce|GdLabRender|GdIkonaKolby|GdModul|GdO|GdData|GdLista|__vildaLabTrend' | sort | uniq -c   # pusto
```

```js
// P-BADANIA, w se(): ikona kolby i przycisk piątej zakładki, dopisane na końcu listy
GdIkonaKolby = '<path d="M9 3h6"/>…';                          // obok ikon _t, It, Pt, Mt
GdLabTab = e('button', { class: 'vilda-patient-tab', type: 'button', html: at(GdIkonaKolby, 'Badania'), 'data-tab': 'lab' });
Ft = e('div', { class: 'vilda-patient-tabs', role: 'tablist' }, [Et, Bt, pt, kt, GdLabTab]);   // było: [Et, Bt, pt, kt]

// kontener i leniwy render (za Ue(), jak Notatki i Historia)
var GdLabHost = e('div', { class: 'vilda-patient-tab-content vilda-patient-tab-content--hidden vilda-patient-lab-section', 'data-tab': 'lab' });
var GdLabOnce = false;
function GdLabRender() {
  var modul = window.VildaLabHistoryTab;
  if (!modul) { /* „Zakładka Badania nie jest dostępna — odśwież stronę.” */ return; }
  modul.render(GdLabHost, t, {
    openEditor(o) {                         // + Dodaj wynik, Wpisz wynik, klik w wartość
      ga({ patientId: t, note: o.note || null, template: o.template, anchor: o.anchor, onSaved: o.onSaved });
      if (o.anchor === 'date') document.querySelector('.b3-clinical-date')?.focus();   // tylko widoczne pole
    },
    openReminders(lista) { Mr(lista, {}); },
    onChanged() { ue ? da() : (Ae = false); },   // Notatki od nowa; Historia przy następnym otwarciu
  });
}
// ua(): [Et, Bt, pt, kt, GdLabTab] i [Nt, Ct, sa, ca, GdLabHost]
// klik: GdLabTab → ua('lab'), ia({ screen: 'card', patientId: t, tab: 'lab' }), GdLabOnce || (GdLabOnce = true, GdLabRender())
// r.activeTab === 'lab': render i ua('lab'); „lab” w białej liście; xa.restoreTab('lab') tak samo
// lista dzieci karty (Cs): …, sa, ca, GdLabHost, e('div', { class: 'vilda-auth-actions vilda-patient-actions' }, …)
```

```js
// P-BADANIA-EDYTOR, w ga(t): szablon i kotwica na życzenie wołającego (zakładka „Badania”)
// za wyborem szablonu z zapisanej notatki (w = 'none' | 'med-…' | 'lab'):
if (t && t.template === 'lab' && w === 'none') w = 'lab';        // szablon „Wynik badania”, kategoria Badanie
// za wyborem kotwicy (Bt = 'date' | 'visit' | 'general'):
if (t && t.anchor === 'date' && Bt === 'general') Bt = 'date';   // „Wpisz datę zdarzenia”; wizyta i data zostają
```

```js
// P-BADANIA-TREND-HISTORIA, w Xl(): bez „Trendu wyników” (decyzja 6.12)
// było: var d = e('div', { class: 'vilda-lab-trend-host' }); t.appendChild(d);
//       try { await Jl(d, a, n) } catch { oe(d) }
//       if (t && t._vildaLtcGenXl !== LtcGen) return;
var d = e('div', { class: 'vilda-lab-trend-host' }); t.appendChild(d);   // bez await Jl; Jl() zostaje w pliku bez zmian
// … po odczycie zdarzeń i pacjenta, za znacznikiem pokolenia z P-LAB-TREND-CONVERT-2:
if ((S || []).some((f) => f && f.type === 'note' && f.labResult && (f.labResult.test || f.labResult.value) && !f.medication && f.category !== 'wynik-klirens')) {
  d.appendChild(e('p', { class: 'vilda-lab-trend-link' }, [e('button', {
    type: 'button', class: 'vilda-auth-btn vilda-auth-btn-small vilda-auth-btn-ghost',
    text: 'Trend i porównanie wyników są w zakładce Badania →',
    onclick() { document.querySelector('.vilda-auth-patient-card button[data-tab="lab"]')?.click(); },
  })]));
}
```

```js
// P-BADANIA-EKSPORT, w IIFE tuż przed `i.VildaAuthUI = zs` — poza zakresami wycinanymi przez testy
window.__vildaLabTrend = Object.freeze({ render: Nl, assessments: Lh3TrendAssessments, parseNorm: Dl, formatAge: eo, loadConverter: ja });
// celowo bez vi() i Jl(): dzisiejsze normy nie dostają nowych konsumentów
```

Plan 3.2 wymieniał w eksporcie także `wa`, `In` i `Tl`; zakładka ich nie używa (własne chipy, data z modelu), więc eksport jest węższy.

`vilda_auth_ui.css`: w `@media(max-width:1024px)` piąta zakładka zajmuje obie kolumny siatki (`.vilda-patient-tabs>.vilda-patient-tab:nth-child(5){grid-column:1/-1}`), a w `@media(max-width:1200px)` zakładki w wierszu mają szerokość wg treści (`flex:1 1 auto`). W oknie 1025–1200 px karta ma ok. 675 px i przy równych szerokościach „Siatki centylowe” się ucinały (K24); do 1024 px zakładki stoją w siatce, więc reguła działa tylko w wierszu. Bez nowego progu.

## Łatki P-BADANIA-CHROME (`vilda_session_bridge.js` 66 → 67, `vilda_chrome.js` 142 → 143, 2026-10-14)

Oba leniwe stosy auth (lista `V` mostu sesji i lista `d` w `vilda_chrome.js`) dostały trzy wpisy za `vilda_hormone_reference_ui.js`, a warunki „wszystko już jest” (`w()`, `I()` w moście, `u()` w chrome) — dwa globale. Strony z tagami statycznymi (osiem stron z kartą) nic nie doładowują; strona bez tagów (np. przelicznik po `ensureAuthLoaded`) dostaje moduły razem z kartą. Zgodność obu list pilnuje `tests/unit/lab-history-tab-loading.test.mjs`.

```js
// za {type:"script",src:"vilda_hormone_reference_ui.js?v=1",…}
{ type: 'script', src: 'vilda_lab_history.js?v=1', ready: () => !!window.VildaLabHistory },
{ type: 'css',    src: 'vilda_lab_history_tab.css?v=1', ready: () => false },
{ type: 'script', src: 'vilda_lab_history_tab.js?v=1', ready: () => !!window.VildaLabHistoryTab },
// w(), I() (most) i u() (chrome): … && VildaHormoneReferenceUI && VildaLabHistory && VildaLabHistoryTab && …
```

## Łatki P-POKWITANIE-KONTRAKT (`vilda_data_import_export.js`, 2026-10-14)

Logika nowego pola jest czytelna w `vilda_puberty_assessment.js` (odczyt schematu)
i `vilda_puberty_assessment_state.js` (kopia aktywnego formularza). Artefakt nie
został przebudowany ze starszych źródeł ani ponownie zminifikowany. Dodano siedem
wąskich punktów integracji, bez zmiany dotychczasowych pól i funkcji obliczeń.

Czytelny odpowiednik hooków (nazwy lokalne odpowiadają bieżącemu artefaktowi):

```js
// collectUserData: po zbudowaniu user=S i kontekstu wieku kostnego, przed payloadem.
if (r.VildaPubertyAssessmentState)
  r.VildaPubertyAssessmentState.applyToUser(S);

// saveMainSessionNow: dotychczasowe Et(n,p) scala brakujące pola sesji DocPro/klirensu.
// JSON oceny jest atomowy; stara sesja nie może uzupełnić świadomie pustego G/Th/P
// ani przywrócić całego klucza nieobecnego w aktualnym kolektorze.
if (r.VildaPubertyAssessmentState)
  r.VildaPubertyAssessmentState.mergeSession(n, p, Et);
else Et(n, p);

// restoreMainSessionIfAny (Fe): po sprawdzeniu formatu sesji i wersji 1,
// w istniejącej gałęzi early-exit dla wypełnionego formularza bez wybranego pacjenta.
// Jednorazowo, przed rzeczywistą edycją, z niezmienionej sesji tej samej karty
// odczytanej przy starcie. Bez wymaganego nazwiska; dostępne pola wetują sprzeczność.
// Nie nadpisuje zainicjalizowanego carrier ani jawnego czyszczenia.
if (r.VildaPubertyAssessmentState)
  r.VildaPubertyAssessmentState.restoreSessionIfUninitialized(i);

// clearAllData oraz początek jawnego applyLoadedData: wyczyść starą kopię
// w tym samym miejscu co dotychczasowe dane pokwitania formularza.
if (r.VildaPubertyAssessmentState) r.VildaPubertyAssessmentState.clear();

// applyLoadedData: po odtworzeniu pól, przed kolejnym przeliczeniem.
// m oznacza porównanie; samo oglądanie porównania nie zmienia aktywnej oceny.
if (!m && r.VildaPubertyAssessmentState)
  r.VildaPubertyAssessmentState.load(e, { restore: a.isSessionRestore === true });

// restoreLoadedState: jawne odtworzenie zapisanej wizyty, przy hooku wieku kostnego.
if (a.VildaPubertyAssessmentState)
  a.VildaPubertyAssessmentState.load(u, { restore: true });
```

Należy zachować ich położenie wewnątrz rzeczywistych funkcji; samo opakowanie
`window.collectUserData` pomijałoby wewnętrznych klientów kolektora. Nowe skrypty
są ładowane przed importerem. Regresje wywołują produkcyjne collect/apply/restore,
zapis sesji i odczyt w drugim panelu, także dla pustego i nieobsługiwanego JSON.

## Łatka P-POWLOKA-KARTA-ZAKLADKA (`vilda_shell.js` 63 → 64, 2026-10-14)

Karta pacjenta otwierana z powłoki od razu na wskazanej zakładce (LAB-HISTORIA PR3, plan 3.4, decyzja 6.15): pasek „Poprzednie wyniki” w przeliczniku wywołuje `VildaShell.openPatientCardInStart(pid, { activeTab: 'lab' })`. Nazwy z artefaktu: `Ht` — `openPatientCardInStart`, `Sn_openPatient` — czytelny dopisek (#454) czekający na gotową ramkę Start, `win.VildaAuthUI.showPatientCard` — `se()` z `vilda_auth_ui.js` (czwarty argument `{activeTab}` istniał wcześniej; biała lista zakładek z P-BADANIA zawiera „lab”).

```js
// było: function Ht(t){if(t)Sn_openPatient("card",t)}
function Ht(t, opts) { if (t) Sn_openPatient('card', t, null, opts && typeof opts.activeTab === 'string' && opts.activeTab ? opts.activeTab : null); }
// Sn_openPatient(kind, id, onTimeout, tab) — nowy czwarty parametr; w retry():
// było: showPatientCard(String(id))
tab ? win.VildaAuthUI.showPatientCard(String(id), null, null, { activeTab: tab }) : win.VildaAuthUI.showPatientCard(String(id));
```

Wywołanie bez zakładki jest dosłownie takie jak dotąd, więc testy powłoki porównujące tablice argumentów `showPatientCard` (`powloka-intencja-historia.test.mjs`, `chip-karta-pacjenta.test.mjs`) zostają bez zmian; wariant z zakładką sprawdza `tests/unit/powloka-karta-zakladka.test.mjs`. Starsza powłoka z cache SW zignoruje drugi argument i otworzy kartę na zakładce domyślnej.

Przelicznik (`przelicznik-jednostek.html`, czytelny skrypt strony) dostał w tym samym PR hook `window.VildaLabConverterRuntime = { getSubstanceId }` i zdarzenie `vilda:lab-substance-changed` z `applySubstance()` (decyzja 6.16) — poza zakresami wycinanymi przez testy (`powloka-wskazanie-kliniczne`, `lab-inhibin-b-ui`, `lab-puberty-*`, `hormone-lifespan-converter-adapter`).

## Łatki P-POKWITANIE-PANEL (2026-10-15)

Czytelne źródła tej partii: `vilda_puberty_assessment.js` (kwalifikacja osi),
`vilda_puberty_assessment_state.js` (aktywny wpis i znacznik wizyty),
`vilda_puberty_assessment_context.js` (chroniony odczyt między kartami),
`vilda_puberty_assessment_ui.js/.css` (wspólny edytor). Nie przebudowano
artefaktów ze starszych źródeł i nie zminifikowano ich ponownie.

Wąskie punkty integracji:

- `vilda_data_import_export.js`: istniejące hooki#687 przenoszą ocenę i znacznik
  atomowo. `xe()`/`Re()` uwzględniają obecny carrier jako dane formularza/sesji;
  wpis bez nazwiska, antropometrii i ogólnego Tannera nie ginie przy F5.
- `inline_index_02.js`: ta sama istniejąca sekcja i przycisk; ogólny
  `#tannerStage` pozostaje ukrytym nośnikiem legacy. Nowe osie nie są do niego
  przepisywane. Wiersze/ściągi tworzy czytelny moduł UI, a wywiad jest opcjonalny.
- `growth-basic-module.js`: `Bba(rows)` pobiera `VildaPubertalStatus.kontekstWzrastania()`
  i dodaje dotychczasowy kontekstBA; usunięto dwa bezpośrednie odczyty scalara.
- `vilda_advanced_growth.js`: `Ka()` przekazuje profilowi `etapRodzaj`, wiek
  obserwacji oraz jawne `gonadalCurrent`; kontekst trajektorii pochodzi z tego
  samego adaptera. Nasłuch wspólnej zmiany invaliduje istniejący cache.
- `vilda_auth_ui.js`: w istniejącym hooku karty `_cx9` stary `parseInt(m.tannerStage)`
  zastępuje `VildaPubertyAssessment.gonadalContext(m,{sex,currentAgeMonths,measuredAtISO,scope:'growth'})`.
  Rodzaj i wiek są z konkretnej obserwacji, a pełne `readUser(m)` służy narracji.
  Części edycji/scalania notatek i list pozostają w swojej dotychczasowej logice.
- `vilda_summary_cards.js`: czytelny helper `qGonadalGrowth()` zastępuje odczyt
  ogólnego Tannera z DOM. Jawny brak osi w produkcyjnym kontekście nie wraca do
  `opt.tanner`. Niskopoziomowe funkcje zachowują deklarowany przez caller numer
  dla zgodności, a jawnyP/unspecified lub niezgodna płeć są odrzucane.
- `vilda_chrome.js` oraz `vilda_session_bridge.js`: oba leniwe stosy auth ładują
  model przed `vilda_auth_ui.js`; odpowiadające warunki gotowości wymagają modelu.
  Dzięki temu karta otwarta poza formularzem też czyta typowane obserwacje.

Czytelne moduły statusu/profilu/tempa/trajektorii i narracji zachowują wzory,
progi oraz dane referencyjne; zmieniono kwalifikację rodzaju i czasu obserwacji.
Przelicznik montuje ten sam komponent edytora przez istniejące `VildaLabPubertyUI`.
Kontrakt `buildInput` dla dawnych próbek pozostaje; tabele/silniki hormonów nie
zostały scalone z rendererem ani zmienione. Wpływ kliniczny i źródła:
`docs/clinical/ALGORITHMS.md`, P-POKWITANIE-PANEL.

## Łatka P-IMPORT-STATUS — kolejność importu i wskaźnika zapisu (2026-10-15)

`vilda_data_import_export.js` i `vilda_save_status_indicator.js` zachowują istniejący
model globalnych skryptów. Wąska, czytelna część wskaźnika zastępuje 500 ms
rozpoznawaniem konkretnej operacji:

- `getApplyLoadedDataSequence()` zwraca rosnący licznik RAM dokumentu. Każde
  poprawne `applyLoadedData()` zwiększa go; błędny argument nie zwiększa.
- Istniejące asynchroniczne `vilda:json-imported` dostaje `detail.applySequence`.
  Odtworzenie sesji zwiększa granicę operacji, ale nadal nie emituje importu JSON.
- Istniejące `vilda:patient-loaded` z `source:'save'` dostaje numer uchwycony
  na wejściu `saveUserData()`. Zakończenie wcześniejszego zapisu nie potwierdza
  nowszego importu. Wczytanie z kartoteki potwierdza bieżącą operację także wtedy,
  gdy wywołujący nie podał opcji `applyLoadedData`.
- Wskaźnik ignoruje zdarzenia potwierdzone, unieważnione przez clear/lock albo
  zastąpione nowszym apply. Jego odroczone publikacje wymagają zgodnej generacji,
  numeru operacji i docelowego PID. Unlock nie potwierdza importu.

Numer jest metadanymi wyłącznie zdarzenia i nie trafia do rekordu, eksportu,
`sharedUserData`, sesji ani innego magazynu. Nie zmieniono modułu sejfu,
autoryzacji ani strażnika niezapisanych zmian. Odtwarzalny test produkcyjnego
importera i wskaźnika: `tests/unit/save-status-import-order.test.mjs`.
Opis odtworzenia CI/CPU i zakresu: `docs/clinical/ALGORITHMS.md`, P-IMPORT-STATUS.

## Integracja LAB-TT-MAYO — testosteron całkowity, etap 3 (2026-10-15)

Nowe czytelne moduły `vilda_lab_testosterone_data.js` (źródła/polityki),
`vilda_lab_testosterone.js` (czysta ocena) i `vilda_lab_testosterone_units.js`
(niezmienny rejestr dotychczasowych konwersji) nie pochodzą z dawnego buildu.
Nie przebudowano z nieaktualnych źródeł żadnego artefaktu.

Wąskie punkty integracji w istniejących plikach:

- `lab_units_data.js`: tylko rekord `testosterone_total` jest zapisany czytelnie.
  Usunięto męskie wiersze, ogólny męski fallback oraz dawną notę przypisującą
  samemu progowi rozpoznanie LOH. Żeńskie wiersze i wszystkie jednostki/faktory
  pozostają dotychczasowe. Nowe męskie tabele żyją wyłącznie w nowym module danych.
- `lab_unit_converter.js`: `U()`/`selectRange()` zwraca brak zakresu dla TT
  bez jawnej płci F. Pozostałe anality i konwersje nie zmieniają się.
- `vilda_auth_ui.js`: `vi()` nie oblicza dzisiejszego zakresu dla historycznego
  `testosterone_total`, analogicznie do istniejącego AMH. Jawna norma wpisu
  i liczba pozostają. Nie zmieniono edycji, scalania ani układu historii/trendu.
- `vilda_chrome.js` i `vilda_session_bridge.js`: mały rejestr Units ładuje się
  przed Snapshot; warunki gotowości wymagają obu. Normy ani silnik TT nie są
  zależnością odczytu historii. Statyczne entrypointy zachowują tę samą kolejność.

`przelicznik-jednostek.html` kieruje M/nieznaną płeć TT do wspólnego formularza
i nowego silnika, F do dotychczasowych zakresów. Resolver wspólnego formularza
rozstrzyga płeć również po jej zmianie bez ponownego wyboru analitu. Zapisana
ocena jest kanoniczna; wyświetlanie w innej jednostce projektuje osobny widok.
Snapshot i przypięcie zachowują oryginalną parę wartość–jednostka. Wszystkie
te hooki mają regresje wykonujące rzeczywiste funkcje produkcyjne; szczegóły
kliniczne i syntetyczne przypadki w `docs/clinical/TESTOSTERONE.md` oraz
`docs/clinical/ALGORITHMS.md`, LAB-TT-MAYO.

## Łatki LAB-HISTORIA 6.3 — zakres zapisany przy przypięciu (`lab_pin_result.js` 8 → 9, `vilda_vault.js` 214 → 215, `vilda_session_bridge.js` 75 → 76, `vilda_chrome.js` 151 → 152, 2026-10-15)

Nowy czytelny moduł `vilda_lab_range_snapshot.js` (schemat, unieważnianie, opis dla widoków) nie pochodzi z dawnego buildu. W artefaktach są tylko punkty wpięcia, wszystkie w postaci czytelnej, na wzór odniesienia AMH (#677). Opis działania: `docs/clinical/ALGORITHMS.md`, „LAB-HISTORIA 6.3”; projekt: `docs/LAB_HISTORIA_WYNIKOW_PLAN.md`, „Uzupełnienie z wdrożenia 6.3”.

`lab_pin_result.js` — czytelny blok `Rr*` przed `/* PR3: modal shows the same detached assessment…`; w zminifikowanej części trzy wywołania:

```js
var RrRangeProvider = null;                     // a.VildaLabPinResult.setRangeProvider(fn) — ustawia przelicznik
function RrCaptureRange(result) { … }           // kopia z dostawcy → result.range; result.valueNum = range.measurement.sourceValue
function RrPinRange(result, host) { … }         // #labPinRange („Zapisze się z wynikiem: …”) i #labPinRangeDateNote (data ≠ dziś)
// V():  Lh2CaptureAssessment(t), HrCaptureReference(t,e), RrCaptureRange(t), t.sampleDateISO = …
// V():  … HrPinReference(t,o), RrPinRange(t,o), s.addEventListener("click", …)
// A():  … hormoneReference …, Object.prototype.hasOwnProperty.call(t,"range") && a.VildaLabRangeSnapshot
//         && (p.labResult.range = a.VildaLabRangeSnapshot.normalize(t.range)), …
```

Wygląd linii i uwagi: klasy `vilda-lab-pin-range*` w `vilda_lab_assessment_ui.css` (bez stylów wpisywanych na elementy).

`vilda_vault.js` — czytelna część przy `LhHasAssessment`/`HrHasReference`: `RrHasRange`, `RrMissingRange`, `RrNormalizeRange`, `RrReconcileRange`; `LabReconcileSnapshots` woła kolejno ocenę, odniesienie AMH i zakres; `kt()` sanityzuje `labResult.range`; `listPatientLabSeries` kopiuje `point.range` z `forSeries`. Brak modułu przy zapisie notatki z zakresem — błąd z prośbą o odświeżenie; przy odczycie — `range_transport_unavailable` (wpis bez oceny).

`vilda_session_bridge.js` (lista `V`) i `vilda_chrome.js` (lista `d`): wpis za `vilda_hormone_reference_snapshot.js`, a w warunkach „wszystko już jest” (`w()`, `I()` w moście, `u()` w chrome) — globalny `VildaLabRangeSnapshot`:

```js
{ type: 'script', src: 'vilda_lab_range_snapshot.js?v=1', ready: () => !!window.VildaLabRangeSnapshot },
// w(), I(), u(): … && VildaHormoneReferenceSnapshot && VildaLabRangeSnapshot && VildaHormoneReferenceUI && …
```

Tag statyczny `vilda_lab_range_snapshot.js?v=1` obok `vilda_hormone_reference_snapshot.js` na ośmiu stronach z kartą i w `przelicznik-jednostek.html`; wpis precache w `service-worker-kalorii.js`. `przelicznik-jednostek.html` (czytelny skrypt strony): `captureLabRange` i `setRangeProvider` za rejestracją dostawcy odniesienia AMH. Zgodność list pilnuje `tests/unit/hormone-reference-loading.test.mjs` i `lab-history-tab-loading.test.mjs`.

## Łatka LAB-HISTORIA 6.30 — zakres ogólny u dziecka bez oceny (`lab_pin_result.js` 9 → 10, 2026-10-15)

Zmiana tylko w czytelnym bloku `Rr*` w `lab_pin_result.js` (`RrPinRange`): dla opisu `status: 'general'` z `VildaLabRangeSnapshot.describe` (wiersz domyślny przelicznika przy etapie życia dziecka) linia okna brzmi „Zapisze się z wynikiem: zakres ogólny {granice} — bez oceny dla dziecka”, a kontekst „bez zakresu dla: {dla kogo}” zamiast „dobrano dla: …”. Zminifikowana część bez zmian. Reguła i opis działania: `vilda_lab_range_snapshot.js` 1.1.0 (`describe`), `docs/clinical/ALGORITHMS.md`, „LAB-HISTORIA 6.30”.

## Jak odtworzyć

```bash
git fetch --depth=5000 origin audyt main
git log origin/audyt --format='%h %ad %s' --date=short -- ios26-ui.js     # wersje pliku
git log origin/audyt --format='%h %s' ad98909a..origin/audyt -- <plik>     # zmiany po ostatnim wgraniu
```
