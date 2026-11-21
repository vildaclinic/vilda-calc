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

## Łatka P-GH-NOWE-ID-MONITOR (`gh_therapy_monitor.js` 59 → 60, 2026-10-21)

Id nowego punktu z `VildaGhPunkty.noweId()` (P-GH-NOWE-ID) zamiast własnego wzoru monitora, w obu miejscach tworzenia punktu. Zmiana wprost w artefakcie, miejsca mają komentarz `P-GH-NOWE-ID-MONITOR`. `A` (w artefakcie `Gpk`) to moduł z bramki `apiPunktow()` (`Gpa`), sprawdzonej wcześniej w obu miejscach. Opis działania: `docs/clinical/ALGORITHMS.md`, P-GH-NOWE-ID-MONITOR. Łatkę nakłada się na wersję 59.

```js
// He(typ) — nowy punkt z karty, rekord u (reszta rekordu bez zmian):
const u = { id: A.noweId(), type: typ, /* … */ };              // było: id: String(Date.now() + Math.random())

// ghAddRetroPoint — po polaZPodawanej(…, 'wsteczny'):
window.ghTherapyPoints.push(A.punkt(A.noweId(), w.pola));      // było: A.punkt(String(Date.now() + Math.random()), w.pola)
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

## Przypomnienia B2.2 (2026-10-28)

Źródłem prezentacji jest czytelny blok `P-PRZYPOMNIENIA-B22` bezpośrednio
w `vilda_auth_ui.js`, od `remB22Views` do `remB22Styles`, oraz sformatowany
`vilda_reminders.css`. Nie ma osobnego generatora ani kroku minifikacji.
`Mr`, `Br` i `tn` delegują do tego widoku, zachowując dotychczasowe bramki PRO,
widoczności i aktualności odczytu. Stary renderer pozostaje w artefakcie jako
kod historyczny; aktualny kontrakt filtrów zastępuje zwijanie kategorii.
Nie usuwamy dawnych preferencji kategorii z kopii i synchronizacji.

W `vilda_vault.js` czytelny blok `P-PRZYPOMNIENIA-B22` zawiera
`RemB22Context`, `RemB22CheckCommit`, adaptery atomowego zapisu i
`RemB22SaveOutcome` (publiczne `saveReminderOutcome`). Wąskie punkty wpięcia:
`Ad` zachowuje kontekst i wspiera wewnętrzne przygotowanie rekordu bez zapisu;
`Ft` odczytuje kontekst; `Le` przenosi go przy scalaniu synchronizacji;
`VildaOnceClinicalPayload` porównuje termin/czas wyłącznie nowych przypomnień
`reminderContext.kind === 'reminder'`. Publiczne kontrakty zapisów klinicznych
pozostają bez zmian. Adaptery IndexedDB, pamięciowy i hybrydowy udostępniają
`commitReminderForUser`. Nie zmienia się schemat sejfu ani kolejność skryptów.
`tools/patch-vault-existing-note.mjs` uwzględnia wspólny punkt przygotowania rekordu,
porównanie terminu nowych przypomnień i położenie istniejącego bloku przed B2.2;
test odtworzenia nadal wymaga identycznych bajtów artefaktu i idempotencji łatki.
Od E3-PR0b2a (P-KONFLIKT-ZAPISU-NOTATKI) blok niesie też warunek konfliktu po chwili
zapisu (`baseUpdatedAtISO`); łatka i sejf zmieniają się razem, bajt w bajt.

Test `reminders-outcome-vault.test.mjs` uruchamia rzeczywisty sejf i kryptografię;
testy `przypomnienia-b22*` sprawdzają natywną aplikację desktop/mobile, awarię
drugiego zapisu IndexedDB, Kartę Pacjenta i zimny restart PWA offline.

## Blok P-PRZYPOMNIENIA-STAN (2026-10-28)

Czytelne źródło jest bezpośrednio w artefakcie `vilda_auth_ui.js`, od komentarza
`P-PRZYPOMNIENIA-STAN`: funkcje `remReadOwner`, `remReadCurrent`,
`remInlineState`, `remInlineReserved`, `remInlineAllowed`, `remInvalidateInline`,
`remInlineHide`, `remInlineLayout`, `remBadgeRecover` i renderery błędu.
Granice odczytu `Br`, `tn` oraz `H` wewnątrz `Mr` używają tych funkcji, zachowując
natywny renderer wierszy/kategorii. `Rr`, `xe` i `remOdswiez` pozostają punktem
montowania i harmonogramem. Nasłuchy geometrii w `Wr` wywołują
`remInlineLayout`, a zdarzenia danych nadal wywołują `xe`.

W `vilda_chrome.js` licznik `RemBadgeSequence` jest obok `kt`; `E` unieważnia
poprzedni odczyt przy samym planowaniu odświeżenia. `kt` sprawdza numer żądania,
tożsamość konta i sejfu przed zmianą DOM albo licznika pamięci sesji. Brak nowego
bundlera, zależności aplikacji i pliku ładowanego w runtime. Testy
`reminders-read-state.test.mjs` wycinają funkcje przez AST i wykonują ten kod,
bez odrębnej kopii algorytmu. Szczegóły: P-PRZYPOMNIENIA-STAN w ALGORITHMS.md.

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
    openEditor(o) {                         // + Dodaj wynik (do 2026-11-15, P-BADANIA-WEJSCIE), Wpisz wynik, klik w wartość
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

## Łatki P-POKWITANIE-KONSUMENCI — konsumenci starego numeru Tannera (2026-10-15)

Czytelne: `przelicznik-jednostek.html` (skrypt strony: `readTypedGonadal()`,
`stageLabel()`, zmiany w `readPatientFromShared()`, `getEffectivePatient()`,
`renderTannerOverrideState()`, `describePatient()`), `homa-ir.html` (dwa dodatkowe
tagi `<script>` przed `custom-fixes.js`). Artefaktów nie przebudowano; trzy
czytelne łatki w zminifikowanych plikach:

- `custom-fixes.js`, IIFE strony HOMA-IR (po mapach `A` i `a`): funkcja
  `Bhoma_etap(u)` — typowana oś z `VildaPubertyAssessmentContext.readActiveContext().growth`
  (`usableForGrowth`, `kind` G/Th) mapowana mapą `a`; bez typowanej oceny stary
  `u.tannerStage` jak dotąd. W `S(i)` wyrażenie `z=…,H=z?a[z]:""` zastąpione
  `H=Bhoma_etap(u)`. Dodany nasłuch `vilda:auth-loaded` → `S(!1)` (wypełnia tylko
  puste pole).
- `vilda_epicrisis_ui.js`, `Le()`: przed dotychczasowym odczytem `#tannerStage`
  blok `Bep_typ` — gdy `assessmentContext.status !== 'absent'`, G/Th z `growth`
  i P z `axisStates.P.growthUsable` trafiają do `y.answers.clinical`, a stara
  ścieżka (`t9`, `he2`) jest pomijana.
- `vilda_auth_ui.js`, ekran edycji pacjenta, sekcja „Dojrzewanie płciowe”: zmienna
  `Bp6` (tekst z `VildaPubertyAssessment.readUser(c.user)`) i pierwszy element
  `Bp2` — `ve-note` tylko do odczytu. Edycja oceny nadal wyłącznie w panelu formularza.

Testy: e2e `tests/e2e/pokwitanie-konsumenci.spec.mjs`. Wpływ kliniczny i decyzje:
`docs/clinical/ALGORITHMS.md`, P-POKWITANIE-KONSUMENCI.

## Łatka P-POKWITANIE-WIZYTA — ocena z tej wizyty i wskaźnik zapisu (2026-10-15)

Czytelne źródła: `vilda_puberty_assessment.js` (ta sama wizyta = ten sam ukończony
miesiąc wieku) i `vilda_puberty_assessment_state.js` (`anchorToVisit()`,
`ageInMonths()`; obserwacje z `currentAxes` o źródle `clinician-entry` dostają wiek
i datę wizyty przy `capture()` i w `applyToUser()`). Artefaktów nie przebudowano.

Jedyna zmiana w artefakcie: `vilda_save_status_indicator.js`, funkcja `se()`
(rejestracja nasłuchów), bezpośrednio po nasłuchu `vilda:state-restored`:

```js
n.document.addEventListener("vilda:puberty-assessment-changed", function (r) {
  try { r && r.detail && r.detail.reason === "edit" && w({ isTrusted: !0 }); } catch {}
});
```

`w(e)` to istniejący odroczony handler zmiany pola (400 ms → `J()` → `B()`), który
przelicza odcisk formularza z `collectUserData()`; przekazany obiekt omija wyłącznie
jego warunek `isTrusted === false`. Powody `load`/`clear`/`identity`/`visit-change`
nie uruchamiają przeliczenia: wczytanie i zmiana pacjenta mają własne nasłuchy.
Nie zmieniono strażnika niezapisanych zmian (czyta `getState()` wskaźnika) ani
importera. Test produkcyjnego wskaźnika: `tests/unit/save-status-pokwitanie.test.mjs`.
Wpływ kliniczny: `docs/clinical/ALGORITHMS.md`, P-POKWITANIE-WIZYTA.

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


### Dobowe wydalanie wapnia — 28.10.2026

Czytelne źródła bez bundlera: `clcr_ca_dzm.js` (dokładny producent), `clcr_ca_dzm_reference_data.js` (wersjonowane dane), `clcr_ca_dzm_ui.js`/`.css` (formularz i kartaB), `clcr_ca_dzm_persistence.js` (zamrożona ocena, jawna edycja). Integracja pozostaje w czytelnych inline02/inline04, `clcr_ui_workflow.js` i adapterach zapisu. Klinika: `docs/clinical/CA_DZM.md`.

Producent fragmentu sesji: `tools/patch-klirens-ca-dzm-session.mjs`; `node tools/patch-klirens-ca-dzm-session.mjs inline_kalkulator_klirens_07.js` wstawia lub sprawdza dokładny fragment `KLIRENS-CA-DZM-SESSION` i jednoznaczne haki. Poprzednie patchery pozostają idempotentne. Wersje końcowe ustawia `npm run podbij-wersje`.

### Dobowe wydalanie magnezu i wspólny czas zbiórki — 28.10.2026

Czytelne źródła bez bundlera: `clcr_mg_dzm.js` (producent wyniku),
`clcr_mg_dzm_reference_data.js` (wersjonowane źródła i polityka),
`clcr_mg_dzm_ui.js`/`.css` (kontrolki, formularz i karta wyniku) oraz
`clcr_mg_dzm_persistence.js` (odczyt zamrożonej oceny). Wspólny liczbowy czas
zbiórki i pochodzenie 24 h są w `clcr_collection_duration.js`/`.css`.
Integracja kalkulatora pozostaje w czytelnych fragmentach
`inline_kalkulator_klirens_02.js`, `inline_kalkulator_klirens_04.js`,
`clcr_ui_workflow.js` oraz istniejących adapterach zapisu, historii i edycji.
Nie odtwarzano wzoru z dawnego zminifikowanego buildu. Klinika i ograniczenia:
`docs/clinical/MG_DZM.md`, `docs/clinical/DZM_COLLECTION_DURATION.md`.

Producent fragmentu sesji to `tools/patch-klirens-mg-dzm-session.mjs`:

```bash
node tools/patch-klirens-mg-dzm-session.mjs inline_kalkulator_klirens_07.js
```

Polecenie wstawia lub sprawdza dokładny, czytelny fragment
`KLIRENS-MG-DZM-SESSION` i pojedynczy hook materializacji kontrolek przy
przechwytywaniu sesji. Eksportowany `patchMgDzmSessionHooks(source)` odrzuca
niejednoznaczny punkt wpięcia albo rozbieżność z producentem. Adapter dodaje
obsługę Mg, pochodzenia czasu i resetu, zachowując wcześniejsze łatki sesji.
Liczbowy czas dawnej zbiórki pozostaje utrwalonym czasem; niejednoznaczne stare
daty nie są ponownie interpretowane w strefie urządzenia ani zastępowane 24 h.
Regresje uruchamiają rzeczywisty adapter:
`tests/unit/klirens-mg-dzm-session.test.mjs`.

### Czytelne wyniki Klirensu w Notatkach — 28.10.2026

Czytelne źródła bez bundlera: `clcr_notes_view.js`/`.css`. Widok korzysta z
istniejących `ClcrSavedResults.projectPatientNotes` i
`ClcrSavedCalculation.readSaved`; nie przelicza historycznych pomiarów ani nie
zmienia treści zapisanych notatek. `clcr_record_resources.js` udostępnia leniwe
`ensureNotes()`; silniki i edytor są ładowane dopiero po jawnej akcji otwarcia
szczegółów. Kontrakt widoku, komentarzy i kanonicznej edycji/usuwania:
`docs/clinical/KLIRENS_NOTES.md`.

Wąskie podpięcie do zachowanego artefaktu auth odtwarza:

```bash
node tools/patch-klirens-notes-view.mjs
```

Skrypt dotyczy wyłącznie `vilda_auth_ui.js`. Wstawia czytelny blok oznaczony
`KLIRENS-NOTES-VIEW` oraz trzy jednoznaczne warunki dla kategorii
`wynik-klirens`: tytuł `Jo`, karta notatki `h` w `Xo` i wejście ogólnego edytora
`ga`. Pozostałe notatki, przypomnienia i istniejący kod auth pozostają
dotychczasowe. Ponowne wywołanie nie dodaje drugiego bloku ani hooka;
niejednoznaczny lub zmieniony punkt wpięcia zgłasza błąd. Wynik pomiaru trafia
do istniejących `ClcrResultDetails` oraz transakcji tego samego identyfikatora,
bez edytora tekstowego technicznej koperty.

Regresje: `tests/unit/klirens-notes-view.test.mjs`,
`tests/unit/klirens-notes-resources.test.mjs` i
`tests/e2e/klirens-notes-view.spec.mjs`. Dane są jednoznacznie fikcyjne;
załączniki właściciela i dane realnego sejfu nie są źródłem fixture.
Nowe zasoby wymagają jawnych wpisów ładowania/precache; końcowe wersje znanych
zasobów ustawia `npm run podbij-wersje`, bez przebudowy artefaktów z dawnych
źródeł.

## Łatka P-CHIP-NAWIGACJA — odcisk wejść po wczytaniu pacjenta (2026-10-28)

Zmiany są czytelnymi blokami w `vilda_save_status_indicator.js` i w obsłudze
przycisku `#vildaLcmNew` w `custom-fixes.js`; bez ponownej minifikacji artefaktów.

- `normalizeStatusInputs` usuwa z kopii porównawczej wyliczone
  `intake.estKcalPerDay` oraz zwykłe wiersze `intake.history` powtarzające pełną
  krotkę wieku w miesiącach, wzrostu i masy z `user`, `advanced` lub `growthBasic`.
  Niezależne wiersze i dodatkowa treść pozostają porównywane. Rekurencyjna
  normalizacja `M` sortuje klucze obiektów, zachowując kolejność tablic.
- `te` stosuje tę projekcję przed usuwaniem pustych wartości, a `k` przepuszcza
  przez nią również zapisaną referencję starszej wersji. Projekcja nie zapisuje
  zmienionego payloadu do sesji, eksportu ani sejfu.
- Obsługa „Nowy pomiar” po archiwizacji poprzedniego pomiaru, odtworzeniu historii
  i aktualizacji wieku emituje `vilda:load-choice-applied`. Identyfikator pacjenta
  i sekwencja importu pochodzą z chwili otwarcia okna wyboru, a ich aktualność jest
  sprawdzana przed zmianą danych. Wskaźnik przyjmuje tylko `choice: 'new'` z
  bieżącym identyfikatorem i sekwencją, ustanawiając bazę synchronicznie przed
  pierwszą edycją lekarza i zachowując czas oraz numer zapisu.

Regresje wykonujące kod produkcyjny: `tests/unit/save-status-navigation.test.mjs`
i `tests/e2e/patient-chip-navigation.spec.mjs`. Scenariusze przeglądarkowe korzystają
wyłącznie z fikcyjnego sejfu i obejmują oba wybory wczytania, samodzielne strony,
powłokę, nawigację oraz F5 po rzeczywistej edycji.

Kontekst odtworzonej wizyty zachowuje `vilda_persist_runtime.js`:
`comparisonRestorePending` chroni istniejące `loadedComparisonData` przed
usunięciem przy pustym `lastLoadedData` przed pierwszą próbą odtworzenia i podczas
trwających odtworzeń. `restoreSharedStateImmediately` przyjmuje raz zwalidowaną,
sklonowaną bazę przed wpisywaniem pól i wywoływaniem obliczeń; istniejący blok
podsumowania korzysta z tej samej bazy. Dzięki temu wpisanie daty urodzenia przy
starcie strony nie zastępuje wieku i daty dawnej wizyty bieżącym dniem. Jawne
czyszczenie i ochrona przed zapisem kolejki innego pacjenta zachowują swoje reguły.
Test produkcyjnego adaptera, runtime i modułu daty:
`tests/unit/persist-loaded-comparison-order.test.mjs`.

## Łatka P-CHIP-POWLOKA / P-CHIP-KLIRENS (2026-10-29)

Zmiany w `vilda_save_status_indicator.js` i `vilda_shell.js` pozostają
czytelnymi blokami bez ponownej minifikacji pozostałej części artefaktów.

- `normalizeClcrStatusInputs` normalizuje wyłącznie kopie do porównania:
  domyślne kontrolki pustych kalkulatorów i domyślną 24-godzinną zbiórkę
  z pochodzeniem `assumed-24h`. Odmienny lub ręcznie podany czas, pochodzenie
  i wartości badań nadal uczestniczą w porównaniu. Bieżący odcisk i starsza
  referencja przechodzą tę samą projekcję w `te`.
- Protokół referencji rozdziela publikację po zapisie/wczytaniu od odczytu po
  odtworzeniu. `reconcileFromSharedReference` nie zapisuje formularza ani
  magazynu. Publikacja w pamięci wiąże pacjenta, sekwencję i generację,
  a późna ramka w stanie `hidden` nie usuwa referencji. Osobny timer
  uzgodnienia nie anuluje obsługi rzeczywistej
  edycji; gotowość obejmuje odtworzenie, odblokowanie i publikację bazy.
- Powłoka wybiera gotowe źródło stanu właściwego pacjenta również na trasach
  bez własnego wskaźnika. Nagłówek i proxy korzystają z tego samego źródła.
  Usunięto narzucanie `_forceTransition` ukrytym ramkom bez ich referencji.
- `vilda_session_bridge.js` doładowuje wskaźnik na pozostałych stronach po
  modułach auth. Wskaźnik przejmuje tryb tylko do odczytu przed inicjalizacją;
  nie publikuje ani nie usuwa referencji i nie zatwierdza wspólnych edycji po
  zapisie karty. Sprawdzanie istnienia natywnego wskaźnika i klasy hosta
  zachowuje istniejące formularze oraz proxy powłoki.
- `vilda_data_import_export.js`: `readCurrentClcrCarrier` odczytuje i klonuje
  bieżący szkic, `preserveCurrentClcrInMainSession` zachowuje całą jego sekcję
  po scalaniu sesji głównej, a `currentClcrForSessionRestore` wybiera istniejący
  szkic wyłącznie przy odtwarzaniu sesji. Jawny import pacjenta i odtworzenie
  zapisanego rekordu zachowują dotychczasową drogę. Regresje producenta sesji,
  jawnego importu, starszego zapisu i odtworzenia wykonują rzeczywisty importer
  w `tests/unit/main-session-klirens-authority.test.mjs`.
- Importer zachowuje czytelny blok własności pól sesji: kopia świeżo wczytanego
  rekordu jest przypisana do operacji i konsumowana po udanym zapisie.
  Uzupełniane są tylko pola nieposiadane przez stronę; jawne puste wartości
  formularza nie są zastępowane. Blok zachowuje częściowe sekcje, historie,
  wrapper pokwitania i własne pola rozszerzeń. Brakujący PAL starszego rekordu
  korzysta z istniejących API; uzgodnienie po „Nowym pomiarze” obejmuje tylko
  wartość wytworzoną przez tę operację. Regresje:
  `tests/unit/main-session-owned-sections.test.mjs`.
- Reset DOB jawnego importu używa istniejącego `Bdob0`; odtworzenie sesji
  czyści własne skalary przy `null` lub pustym tekście, zachowując brakujące
  klucze starszego formatu i zero. Rzeczywisty moduł DOB oraz importer sprawdza
  `tests/unit/patient-load-dob-reset.test.mjs`.
- Projekcja SSI pomija dokładne ustawienia domyślne pustych kart Start oraz
  trzy techniczne pola rekordu sejfu. Działa symetrycznie na kopiach bieżącej
  sesji i starszej referencji; nie normalizuje PAL i nie zmienia zapisu.
  Regresje: `tests/unit/save-status-main-ui-defaults.test.mjs` oraz
  `tests/e2e/patient-chip-load-origin.spec.mjs` (DocPro → Start → F5).
- `restoreMainSessionClinicalFields` odtwarza obecne własne pola sekcji do
  istniejących kontrolek przed pierwszym zapisem sesji. Zachowuje settery i
  wartości domyślne istniejącego `restoreLoadedState`, bez wywoływania jego
  operacji wizyty i referencji. Osobne testy:
  `tests/unit/main-session-clinical-fields-restore.test.mjs`.
- Własność runtime historii odpowiada kontenerom edytorów oraz istniejącym
  API danych urodzeniowych/adnotacji, a nie samym globalnym `null`/`[]`.
  Regresje rzeczywistego kolektora:
  `tests/unit/main-session-runtime-placeholder.test.mjs`.
- `normalizeIncomingMainSessionHistory` pracuje wyłącznie na klonie świeżego
  rekordu. Używa istniejącego sanitizera obserwacji oraz materializuje brakujący
  widok podstawowy zgodnie z obecną regułą parowania profesjonalnego formularza;
  wymaga braku `growthBasic` lub własnego `data`, `zscore.resultsMode === true`,
  niepustych obserwacji zaawansowanych i skończonego wieku poniżej 18 lat.
  Nie zastępuje jawnie pustych ani niezależnych historii.
- `completeNativeCurrentVisitAge` i `headlessDobAgeWeeks` delegują do istniejących
  publicznych metod DOB. Bieżąca i historyczna wizyta zachowują swoje odrębne
  ścieżki; brakujących pól formularza nie zastępuje nowy wzór ani próg.
- SSI normalizuje na klonach dokładny pusty model BA, automatyczną dietę zgodnie
  z istniejącym kontraktem sejfu oraz indeks DOM równy pozycji obserwacji.
  Nie pomija historii podstawowej. Ręczna dieta, badanie BA i rzeczywista edycja
  pomiaru nadal zmieniają odcisk. Próby pickera Klirensu i istniejącego Restore:
  `tests/e2e/patient-chip-klirens-load-origin.spec.mjs`.
- Autosave sprawdza aktualność panelu przed ścieżką pustego formularza
  prowadzącą do `clearMainSession`. Jest to ten sam kontrakt co istniejąca
  odmowa zapisu przez adapter; sam adapter oraz jawny/globalny reset nie
  otrzymują nowej blokady. Regresja rzeczywistego importera, adaptera i protokołu:
  `tests/unit/main-session-clear-owner.test.mjs`.
- `prepareNewMeasurementBasicArchive` używa najnowszego modelu sesji i istniejącego
  `ensureCurrentMeasurementInHistory` na odłączonej kopii. Jego jednorazowy zapis
  po zwalidowanym wyborze New kończy się przed referencją SSI. Sprawdza także
  niezmienność podstawy transakcji, aby ponowienie po błędzie nie przywróciło
  historii wyczyszczonej w międzyczasie. Test produkcyjnego kolektora, archiwizacji
  i zdarzenia: `tests/unit/new-measurement-basic-archive.test.mjs`.
- `custom-fixes.js`: archiwum podstawowe aktualizuje `window.basicGrowthData`,
  czyli model czytany przez kolektor. Poprzedni alias `growthBasicData` nie był
  jego źródłem; zmianę ograniczono do tego bloku, bez ponownej minifikacji.

Szczegóły diagnozy i rozdzielenie obserwacji przeglądarkowych od deterministycznej
regresji wyścigu: `docs/PATIENT_CHIP_NAVIGATION_AUDIT.md`.

## Łatka P-CHIP-AKTUALIZACJA (2026-10-29)

Czytelne źródła nowych bloków znajdują się bezpośrednio w plikach wdrożeniowych;
nie minifikowano ponownie pozostałej treści. Przy odtwarzaniu z zewnętrznych
źródeł należy przenieść następujące funkcje i punkty wywołania:

- `ios26-ui.js`: `reloadForServiceWorkerUpdate(reason)` wybiera koordynator
  własnego hosta albo nadrzędnej powłoki; samodzielna strona zachowuje reload.
  Słuchacz `In` wywołuje go po zmianie istniejącego kontrolera, a funkcja
  zapasowego przeładowania `b` wewnątrz `zn` używa go po czasie oczekiwania.
  Pierwszy claim nadal kończy się przed przeładowaniem. Nieudane żądanie
  pozwala ponowić zapasowe przeładowanie.
- `vilda_shell.js`: `Su_canFlushForAppUpdate`, `Su_reloadForAppUpdate` i
  `Su_isAppUpdateReloadPending` oraz publiczne aliasy
  `reloadForAppUpdate`/`isAppUpdateReloadPending`. Istniejący `Gp_f(c)` zapisuje
  aktywny dokument przed tymczasową blokadą zapisów starych ramek.
  Osobne przygotowanie `Su_prepareForAppReload` służy też `host.pagehide`;
  `pageshow.persisted` resetuje blokadę przed dotychczasowym pokazaniem panelu.
  Nie dodano blokady w `beforeunload`, którą anulowana nawigacja zostawiałaby
  w działającej aplikacji.
- `vilda_panel_pacjent.js`: osobna ocena własności `ocenPacjenta` oraz
  tymczasowa blokada z pamięci rodzica. Własność pacjenta jest oceniana także
  podczas blokady i zachowuje dotychczasowe reguły po jej zdjęciu.
- `vilda_save_status_indicator.js`: `normalizeClcrStatusInputs` obsługuje
  osierocone domyślne pochodzenie czasu starego odcisku, bez zmiany payloadu
  ani utworzenia bieżącej referencji.

`patient-status-pwa-update-lifecycle.test.mjs` odczytuje rzeczywiste funkcje
kontrolera i watchdog z AST oraz wykonuje pełną powłokę i moduły zapisu.
Mała fixture `save-status-pre-823-duration.json` utrwala wynik starych wydanych
modułów wraz z SHA256; test migracji wykonuje obecny model czasu, serializer
i SSI. Zachowanie przeglądarki sprawdza `patient-status-pwa-update.spec.mjs`
z pełnym produkcyjnym service workerem.

## Łatki P-WYNIKI-BADAN — wynik badania ma jedno miejsce pełnej treści (2026-11-11)

Decyzja właściciela z 2026-11-11 (makieta https://claude.ai/artifact/YRYrYpHeZpy1EqT8ctwkDT). Opis działania: `docs/LAB_HISTORIA_WYNIKOW_PLAN.md`, „Uzupełnienie z wdrożenia 6.32”. Czytelne moduły: `vilda_lab_history.js` 1.4.0 (`isResultNote`, `recordedWarning`) i `vilda_lab_history_tab.js` 2.2.0 (opcje `focusNoteId`, `deleteNote`; klasy `.vilda-lab-hist-detail-actions`, `.vilda-lab-hist-delete-result` w `vilda_lab_history_tab.css`). W `vilda_auth_ui.js` czytelny blok `Wb*` stoi tuż przed `function Jo(t)` (w wycinku `function Lh3HasAssessment(` … `async function Xo(` czytanym przez testy), a w zminifikowanej części są punkty wpięcia:

```js
// blok przed Jo: WbJestWynikiem (VildaLabHistory.isResultNote), WbSkrot, WbWartosc, WbKomentarz, WbOstrzezenie,
// WbOtworzBadania, WbNotatkiNaglowek (Notatki), WbWynikPomiarowy, WbHistoriaGrupuj, WbHistoriaPigulka,
// WbHistoriaWyniki (Historia; krótki wiersz tylko dla wyniku z liczbą albo zapisaną oceną, wynik opisowy bez zmian)
// Xo (Notatki): „+ Dodaj notatkę” i „Edytuj” — onSaved: t._wbPoZapisie = t._wbStan || null; n()
// Xo: po filtrze ghPointId — WbNotatkiNaglowek(t, c, WbPrzed), t._wbStan = {ids, widoczne}, c bez WbJestWynikiem
//     (całość pod typeof — wycinek Xo w care-plan-auth-ui-boundary.test.mjs nie ma funkcji Wb*)
// $r:  }else if(t.type==="note"){if(t._wbWyniki)return WbHistoriaWyniki(t,a),a; …
// ot, ht (Xl): pigułka kategorii przez WbHistoriaPigulka(pigułka, f) — dopisek „N wyników” (pod typeof)
// Xl: po odnośniku P-BADANIA-TREND-HISTORIA — S = WbHistoriaGrupuj(S, id => mt({type:"note", noteId:id})) (pod typeof)
// se(): po rozstrzygnięciu CareFocus — focusNoteId wyniku → {activeTab:"lab", labFocusNoteId, focusNoteId:null}
// GdLabRender: render(…, {focusNoteId: r.labFocusNoteId (zużywany raz), deleteNote: ({note}) =>
//     CareDeleteCheckedNote(note, t, null, () => GdLabHost.isConnected && remReadCurrent(CareReadOwner)), …})
```

Bez modułu `VildaLabHistory` (stary zasób w pamięci podręcznej) `WbJestWynikiem` zwraca `false`, więc Notatki, Historia i linki działają jak przed zmianą. Edytor notatki (`CareOpenLegacyNoteEditor`) — od 2026-11-12 (P-WYNIKI-BADAN-EDYTOR) jedna zmiana: opis kotwicy „Notatka ogólna” to `x._wbOpis` (`x` — pole kategorii), odświeżany przez `WbOdswiezOpisOgolnej(x)` na końcu `Wt()` (zmiana szablonu) i w nasłuchu `change` pola kategorii; przy „wynik-badania” tekst `WbOpisOgolnegoWyniku`, inaczej dotychczasowy. Odcisk SHA treści edytora w `care-plan-auth-ui-boundary.test.mjs` odświeżony świadomie. Testy: `tests/unit/lab-result-notes-projection.test.mjs` (prawdziwy sejf, zgodność z widokiem Badań), e2e `tests/e2e/wyniki-badan-karta.spec.mjs`.

## Łatka P-GH-PROGRAM-ODBLOKUJ (`gh_therapy_monitor.js` 62 → 63, 2026-11-12)

Pole „Program terapeutyczny” (`#therProg`) w karcie leczenia GH/IGF-1 jest zablokowane, gdy monitor ma punkty leczenia (program wynika z punktu „Włączenie”). Odblokowanie stało na końcu funkcji rysującej listę punktów (`F` w artefakcie, `renderGHTherapyTable`): `else o.disabled=!1`. Przy pustej liście `F` kończy się wcześniej (wiersz „Brak zapisanych punktów leczenia.”), więc ta gałąź nie wykonywała się nigdy. Po „Wyczyść wszystkie pola” (`clearAllData` → `refreshGHTherapyMonitor()` = `D(); F()`), usunięciu ostatniego punktu albo wczytaniu pacjenta bez punktów GH pole zostawało zablokowane do przeładowania strony. Zmiana wprost w artefakcie, w gałęzi pustej listy przed `return`, z komentarzem `P-GH-PROGRAM-ODBLOKUJ`:

```js
// F(), gałąź Gpo().length === 0, po odświeżeniu lustra karty zaawansowanej (ue) i przed return:
try { const program = document.getElementById('therProg'); program && (program.disabled = false); } catch (e) { p('Zignorowany błąd…', e); }
```

Wartość programu, preparat, dawki i obliczenia bez zmian; blokada przy istniejących punktach i przy edycji punktu (`O`) bez zmian. Test: e2e `tests/e2e/gh-program-odblokowanie.spec.mjs` (DocPro: punkt SNP → pole zablokowane → „Wyczyść wszystkie pola” albo usunięcie ostatniego punktu → pole odblokowane).

## Łatka P-KLIRENS-WYCZYSC (2026-11-12, decyzja właściciela)

Przycisk Klirensu `#clearBtn` jest wspólnym sygnałem dla kilkudziesięciu modułów obliczeń. Każdy z nich na jego kliknięciu czyści własne pola i przywraca zachowany kontekst wzoru (`event.clcrPreserved*`). Te listenery zostają bez zmian. Zmiana rozdziela dwa tryby tego samego zdarzenia:

- **zwykłe kliknięcie** (myszą lub klawiaturą) to „Wyczyść dane Klirensu”: czyści badanie i wynik, a pacjent i wzór zostają;
- **pełne czyszczenie pacjenta** niesie znacznik zdarzenia `event.clcrClearPatient === true`. Nadaje go wyłącznie `Cm_clearPatientClick` w `vilda_chrome.js`: menu boczne po decyzji strażnika i echo „clear-all” z innej ramki powłoki. Zdarzenie to syntetyczny `MouseEvent` z realmu ramki.

Czytelne zmiany:
- `inline_kalkulator_klirens_04.js`: listener `#clearBtn` woła `resetApp(false, { keepPatient: !clearPatient })`. Przy pełnym czyszczeniu `clcrResetPatientMemory()` zeruje dane globalne przed `resetApp`, a `clcrResetPatientMemory(true)` czyści moduły po nim (`VildaBoneAge.clear`, `resetState` GH/IGF i SGA), gdy pola są już puste. Po `keepPatient` jest sygnał `VildaSaveStatusIndicator.notifyExternalChange()`, bo wskaźnik pomija programowe zdarzenia pól. `resetApp(e, options)`: `keepPatient` zachowuje `CLCR_PATIENT_IDENTITY_IDS` (pola `#patientSet`), wzór, wersję i kartę poprzedniego wyniku. Wartości wracają dokładnie, także puste. Pozostałe pola, w tym fakty pomiaru, czyści dotychczasowy reset i reguły poszczególnych wzorów.
- `clcr_ui_workflow.js`:
  - bez znacznika pełnego czyszczenia listener `#clearBtn` zawsze przywraca wyczyszczony wzór (`selectFormula(..., { guide:false })`); przy pełnym czyszczeniu zostaje dotychczasowa lista wzorów;
  - `ClcrVisitSave` na kliknięciu `#clearBtn` zdejmuje blokadę pomiaru sprzed zmiany pacjenta, gdy nie ma już wartości pomiaru (ta sama reguła co w `refresh()`; dotąd zdejmowało ją dopiero pełne czyszczenie);
  - `measurementInputControls()` pomija `ktvUrrDurationMinutes`. To tylko widok URR pola `ktvDurationMinutes` (`proxyField` w `clcr_ktv_ui.js`) i po zapisie eKt/V dawało fałszywe „niezapisane obliczenie”, także przy wczytywaniu pacjenta.
- `vilda_unsaved_guard.js`: `VildaGuardRunDecision` ma opcję `clcrOnly` (pyta tylko o niezapisane obliczenie Klirensu, bez zapisu danych pacjenta, tekst z `VildaKlirensGuardCopy(reason, false)`). Przechwycenie `#clearBtn` w Klirensie: znacznik pełnego czyszczenia lub obejście `__vugClearBypass` → przepuść. Kliknięcie nie z ręki użytkownika (`isTrusted === false`), gość lub zamknięty sejf → przepuść bez okna. Niezapisane obliczenie (`VildaKlirensGuardHasPending`) → okno; po „Odrzuć obliczenie i wyczyść” kliknięcie jest ponawiane z obejściem.
- `vilda_chrome.js`: `Cm_clearPatientClick(button)`; `Cm_clearContext` wymaga strażnika także w Klirensie. W Klirensie warunkiem widoczności jest formularz `#clcrForm`, a nie przycisk na stronie, bo workflow chowa przycisk, gdy nie ma wybranego obliczenia, a menu i tak czyści pacjenta (jak na Starcie przy pustym formularzu); `Cm_clearCurrent` zawsze woła `guard.run({reason:"clear"})`. Echo powłoki (`jt`): odbiorca czyści przez `Cm_clearPatientClick`; nadawca pomija `#clearBtn` bez znacznika.
- `kalkulator-klirens.html`, `clcr_tmp_gfr_ui.js`, `clcr_uag_ui.js`: etykieta i odwołania w komunikatach „Wyczyść dane Klirensu”.

Łatki w artefaktach zminifikowanych (każda z komentarzem `P-KLIRENS-WYCZYSC`; warunek `e==="clearBtn"&&!(ev&&ev.clcrClearPatient===!0)` dotyczy tylko `#clearBtn`, który istnieje wyłącznie w Klirensie):

```js
// vilda_persist_runtime.js, fe(e,t) — listener z fazą przechwytywania:
o.addEventListener("click", function (ev) { if (t === "modules") { …; return }
  if (e === "clearBtn" && !(ev && ev.clcrClearPatient === true)) return;   // bez clearUserState
  ht("app.attachClear:" + e) }, true)

// vilda_data_import_export.js, $e(e,t) — czyszczenie sesji głównej:
a.addEventListener("click", ev => { if (e === "clearBtn" && !(ev && ev.clcrClearPatient === true)) return; re(t) }, true)
// vilda_data_import_export.js, init — przyciski wczytaj/zapisz po czyszczeniu:
C.addEventListener("click", function (ev) { if (!(ev && ev.clcrClearPatient === true)) return; … })

// userData.js — czyszczenie pól tożsamości:
r.addEventListener("click", function (ev) { if (e === "clearBtn" && !(ev && ev.clcrClearPatient === true)) return; U() })

// custom-fixes.js — rozgłoszenie lustra pól z clear:true:
var k = b && b.closest && b.closest("#clearAllDataBtn, #clearBtn");
if (!k || k.id === "clearBtn" && o.clcrClearPatient !== true) return; F(true)

// inline_kalkulator_klirens_07.js, listener #clearBtn — wczytany rekord do porównania:
if (event.clcrClearPatient !== true); else /* resetLoadedComparisonUiResidue() albo lastLoadedData = null */
```

Start i DocPro (`#clearAllDataBtn`) bez zmian. Testy: e2e `tests/e2e/klirens-wyczysc-zakres.spec.mjs`, `tests/e2e/sidebar-clear.spec.mjs` (test menu Klirensu).

## Łatka LAB-PAKIETY PR1 — preferencja `labPackageSettings` (`vilda_persistence_adapter.js`, 2026-11-12)

Pakiet badań (`vilda_lab_packages.js`, czytelne źródło) pamięta na urządzeniu jednostki wybrane przy ostatnim zapisie. Adapter przyjmuje tylko klucze z własnego rejestru, więc zminifikowany `vilda_persistence_adapter.js` dostał jeden nowy klucz w trzech miejscach rejestru, tuż za `LAB_ASSAY_PROFILES` (ten sam zakres i klasa):

```js
// MODULE_KEYS (s)
LAB_ASSAY_PROFILES:"labAssayProfiles",LAB_PACKAGE_SETTINGS:"labPackageSettings"
// MODULE_KEY_META (I)
[s.LAB_PACKAGE_SETTINGS]:Object.freeze({scope:"laboratory",kind:"preference",storage:"local-persistent"})
// aliasy nazw (x)
LAB_PACKAGE_SETTINGS:s.LAB_PACKAGE_SETTINGS,labPackageSettings:s.LAB_PACKAGE_SETTINGS
```

Klasa `local-persistent`: preferencja urządzenia, bez synchronizacji z kontem i bez danych pacjenta. Odczyt i zapis, wersja adaptera (`1.7.2`) i pozostałe klucze bez zmian. Test: `tests/unit/lab-pakiety.test.mjs` („klucz jest zarejestrowany w adapterze…”, zapis i odczyt przez prawdziwy adapter).

## Łatka LAB-PAKIETY PR4 — preferencja `labCustomPackages` (`vilda_persistence_adapter.js`, 2026-11-13)

Kreator pakietów (`vilda_lab_packages.js`, czytelne źródło) zapisuje własne pakiety lekarza na koncie. Zminifikowany `vilda_persistence_adapter.js` dostał drugi klucz laboratoryjny w tych samych trzech miejscach rejestru, tuż za `LAB_PACKAGE_SETTINGS`:

```js
// MODULE_KEYS (s)
LAB_PACKAGE_SETTINGS:"labPackageSettings",LAB_CUSTOM_PACKAGES:"labCustomPackages"
// MODULE_KEY_META (I)
[s.LAB_CUSTOM_PACKAGES]:Object.freeze({scope:"laboratory",kind:"preference",storage:"cloud-synced"})
// aliasy nazw (x)
LAB_CUSTOM_PACKAGES:s.LAB_CUSTOM_PACKAGES,labCustomPackages:s.LAB_CUSTOM_PACKAGES
```

Klasa `cloud-synced`: adapter po zapisie zawiadamia sejf (`onPreferenceWrite`), który trzyma wartość w preferencjach konta i wysyła ją w synchronizacji; z drugiej strony sejf wpisuje nowszą wartość przez `applyPreferenceFromCloud`. Żadna z tych dróg nie została zmieniona — klucz korzysta z istniejącego mechanizmu, a `vilda_vault.js` jest nietknięty. Wartość to lista pakietów (nazwa i identyfikatory badań), bez danych pacjenta. Wersja adaptera (`1.7.2`), odczyt, zapis i pozostałe klucze bez zmian. Test: `tests/unit/lab-pakiety-kreator.test.mjs` („klucz jest zarejestrowany w adapterze jako preferencja konta”, zapis i odczyt przez prawdziwy adapter, przejście między dwoma urządzeniami jednego konta przez prawdziwy sejf).

## Łatka LAB-PAKIETY PR5 — osobna kopia preferencji dla każdego konta (`vilda_persistence_adapter.js`, 2026-11-13)

Polecenie właściciela: każde konto widzi tylko swoje pakiety badań. Adapter trzymał kopię tej preferencji pod jednym kluczem dla całego urządzenia. Zminifikowany `vilda_persistence_adapter.js` dostał cechę `perUser` w rejestrze i wybór klucza magazynu dla takiej preferencji:

```js
// MODULE_KEY_META (I): cecha perUser
[s.LAB_CUSTOM_PACKAGES]:Object.freeze({scope:"laboratory",kind:"preference",storage:"cloud-synced",perUser:!0})

// przed readModuleRaw (q): konto i klucz magazynu
function Bpu(){try{const e=i.VildaVault,t=e&&typeof e.getCurrentUser=="function"?e.getCurrentUser():null;
  if(t&&t.userId)return String(t.userId);
  const r=i.sessionStorage?i.sessionStorage.getItem("vilda-vault-session-v2"):null,n=r?JSON.parse(r):null;
  return n&&typeof n.userId=="string"?n.userId:""}catch(e){return""}}
function Bpk(e,t){if(!t||t.perUser!==!0)return e;const r=Bpu();return r?e+"::"+r:""}
```

`Bpk(klucz, meta)` zastępuje sam klucz w sześciu wywołaniach magazynu: `readModuleRaw` (`q`), `writeModuleRaw` (`ee`), `readModuleJSON` (`te`), `writeModuleJSON` (`re`), `applyPreferenceFromCloud` (`De`) i `removeModuleKey` (`Be`). Dla preferencji bez `perUser` zwraca klucz bez zmian, więc pozostałe klucze czytają i piszą dokładnie jak dotąd. Pusty wynik (brak zalogowanego konta) trafia w istniejącą obsługę pustego klucza: odczyt daje wartość domyślną, zapis zwraca `false`.

Konto: użytkownik odblokowanego sejfu (`VildaVault.getCurrentUser()`), a w ramce, w której sejf jeszcze się nie załadował — `userId` z zapisu sesji karty `vilda-vault-session-v2` (ten sam zapis, po którym `vilda_session_bridge.js` poznaje zalogowanie; sejf usuwa go przy wylogowaniu). Hak `onPreferenceWrite` i `applyPreferenceFromCloud` dalej posługują się nazwą preferencji — sejf i format synchronizacji są bez zmian, `vilda_vault.js` nietknięty. `clearModuleState` nie usuwa kopii kont. Wersja adaptera (`1.7.2`) bez zmian. Testy: `tests/unit/lab-pakiety-kreator.test.mjs` („każde konto widzi tylko swoje pakiety”).


## Łatka P-USTAWIENIA-KONTA — pozostałe ustawienia konta osobno dla każdego konta (`vilda_persistence_adapter.js`, 2026-11-13)

Polecenie właściciela (po LAB-PAKIETY PR5): pozostałych 15 preferencji synchronizowanych z kontem ma mieć na urządzeniu osobną kopię dla każdego konta, tak jak pakiety badań. Wszystkie czyta i zapisuje wyłącznie adapter (`readPreference*`, `writePreference*`, `readModuleRaw`, `writeModuleRaw`), więc zmiana jest w jednym pliku. Łatka rozszerza łatkę PR5.

**Rejestr (`MODULE_KEY_META`).** Każda preferencja `cloud-synced` ma `perUser:!0`. Dwie dodatkowe cechy:

| Cecha | Znaczenie | Klucze |
|---|---|---|
| `guest:!0`, `seed:"copy"` | ustawienie widoku: bez konta czyta i pisze kopię urządzenia (sam klucz, jak dotąd); konto przejmuje kopię dotychczasowej wartości urządzenia | `palSmoothPasses`, `palPdfLayout`, `cardVisibility`, `cardCollapseState`, `publicationCharts`, `centileChartLineStyles`, `centileShowHeightLabel`, `centileShowWeightLabel`, `centileShowBandReference`, `ghTherapyViewMode`, `remindersCollapsedCategories`, `remindersOverdueCollapsed` |
| `seed:"single"` (bez `guest`) | klucz z danymi konta: bez konta nie ma odczytu ani zapisu; dotychczasowa wspólna kopia przechodzi na konto tylko wtedy, gdy na urządzeniu jest jedno konto, i znika z kopii urządzenia | `advHistoryCollapsed` (mapa po identyfikatorach pacjentów), `remindersLastShownDate`, `dietRecommendationsRecentMythsV1` |
| sam `perUser` | bez gościa i bez przejęcia w adapterze — starą kopię rozstrzyga sejf (`vilda_lab_packages.js`, `adoptLegacy`) | `labCustomPackages` |

**Kod (czytelny odpowiednik fragmentu przed `readModuleRaw`).**

```js
const Bpm = "vilda-pref-konta-v1::";            // znacznik: konto przejęło ustawienia urządzenia
let Bpb = null, Bpo = null;                      // przejęcie w toku; sejf, u którego zapisano onUnlock
function Bpu() { /* konto: VildaVault.getCurrentUser().userId, a przed załadowaniem sejfu
                    userId z zapisu sesji karty vilda-vault-session-v2; brak konta → "" */ }
// Klucz zapisu: konto → "<klucz>::<userId>"; bez konta kopia urządzenia tylko dla guest, inaczej "".
function Bpk(key, meta) {
  if (!meta || meta.perUser !== true) return key;
  const uid = Bpu();
  return uid ? key + "::" + uid : meta.guest === true ? key : "";
}
// Klucz odczytu: jak Bpk, ale konto bez własnej kopii, które jeszcze nie przejęło ustawień urządzenia,
// czyta kopię urządzenia (nic się nie zeruje). Nie dotyczy sesji jednorazowej (D).
function Bpr(key, meta) {
  const own = Bpk(key, meta);
  if (!meta || !meta.seed || !own || own === key) return own;
  const ls = T("local"), uid = Bpu();
  if (ls && uid && ls.getItem(own) == null && !ls.getItem(Bpm + uid)) {
    Bpa();                                        // sejf odblokowany → przejęcie rusza przy pierwszym odczycie
    if (!D && ls.getItem(key) != null) return key;   // sesja jednorazowa nie sięga po kopię urządzenia
  }
  return own;
}
// Przejęcie: raz na konto, po odblokowaniu sejfu. Zwraca Promise<boolean> (wewnętrznie).
function Bpa() {
  // rejestruje VildaVault.onUnlock(Bpa); bez odblokowanego sejfu albo ze znacznikiem → false
  // n = (await VildaVault.listUsers()).length; konto zmienione w trakcie → false, bez zapisu
  // dla każdego klucza perUser z seed, którego kopia urządzenia istnieje (pomijane w sesji jednorazowej):
  //   seed "copy"  albo n === 1  → gdy konto nie ma własnej kopii: kopia urządzenia → kopia konta
  //   seed "single"              → kopia urządzenia jest usuwana
  // na końcu znacznik Bpm + userId = "1"
}
// zdarzenia dokumentu vilda:auth-loaded, vilda:session-changed, vilda:auth-state-settled → Bpa
```

`Bpr` zastępuje `Bpk` w dwóch odczytach (`readModuleRaw` — `q`, `readModuleJSON` — `te`); zapisy, `applyPreferenceFromCloud`, `removeModuleKey` i `clearModuleState` (`ne`) używają `Bpk`. Publiczne API adaptera jest bez zmian: końcówka pliku od `function le(e){` (czyszczenie danych i eksport API) musi zostać bajt w bajt taka jak w wersji bazowej — pilnuje tego `tests/e2e/header-patient-status-offline.spec.mjs` — więc przejęcie nie ma osobnej funkcji publicznej; rusza samo (`onUnlock` sejfu, zdarzenia sesji, pierwszy odczyt). Preferencje `local-persistent`, dane formularza i dane pacjenta czytają i piszą jak dotąd. Wersja adaptera (`1.7.2`) bez zmian; `vilda_vault.js` nietknięty — hak `onPreferenceWrite` i `applyPreferenceFromCloud` dalej posługują się nazwą preferencji.

Skutki, o których warto pamiętać:

- Przejęcie jest kopią na urządzeniu: niczego nie dopisuje do konta w sejfie ani do synchronizacji.
- Po przejęciu konto czyta już tylko własne kopie; późniejsza zmiana gościa go nie dotyczy, a zmiana konta nie zmienia kopii urządzenia (gość widzi ustawienia urządzenia z chwili aktualizacji i własne późniejsze zmiany).
- Nowe konto założone później zaczyna od ustawień urządzenia (gościa), nie od ustawień innego konta.
- Na urządzeniu, na którym przed aktualizacją logowało się kilka kont, zwinięcia historii pacjentów i data pokazania przypomnień zaczynają od nowa (wspólnej kopii nie da się przypisać).
- Kopie usuniętego konta zostają w pamięci przeglądarki jako nieużywane klucze.

Testy: `tests/unit/ustawienia-konta-na-urzadzeniu.test.mjs` (prawdziwy adapter i sejf: rejestr, gość, przejęcie, dwa konta, sesja jednorazowa, synchronizacja między urządzeniami), e2e `tests/e2e/ustawienia-konta.spec.mjs` (gość, lekarz A, lekarz B i trzecie konto w jednej przeglądarce: „Widoczność kart” w Ustawieniach i jej skutek na stronie głównej).

## Łatka P-BADANIA-WEJSCIE — jedna droga dodawania wyników (`vilda_auth_ui.js`, `vilda_terminarz.js`, 2026-11-15, decyzja właściciela)

Opis działania: `docs/LAB_HISTORIA_WYNIKOW_PLAN.md`, decyzja 6.34 i „Uzupełnienie z wdrożenia 6.34”; `docs/clinical/ALGORITHMS.md`, „LAB-HISTORIA 6.34”. Czytelny moduł: `vilda_lab_history_tab.js` 2.5.0. Poniżej czytelne bloki wstawione do artefaktów, bez ponownej minifikacji.

```js
// vilda_auth_ui.js, w se() przed GdLabHost — jedna droga wczytania pacjenta z karty
var BdWczytajPacjenta = function (BdZastosuj, BdPo) { /* dotychczasowa obsługa „Wczytaj tego pacjenta”, 1:1:
  patientLoadCapture(t) → wo(t, nazwa, Lt) → o.getPatient(t) → patientLoadRun(…, apply, publish);
  apply = BdZastosuj(value, t); publish: vilda:patient-loaded, $t(), a na końcu BdPo() */ };
var BdZastosujNaStronie = function (dane) { applyLoadedData(dane); /* + odświeżenie chipa w ramce i w powłoce */ };
var BdLabWczytaj = typeof i.applyLoadedData == 'function'
  ? function (cel) { BdWczytajPacjenta(typeof a == 'function' ? a : BdZastosujNaStronie,
      function () { BdPrzejdzPoWczytaniu(t, cel && cel.href || null); }); }
  : null;
// przycisk karty:  onclick: function () { BdWczytajPacjenta(a, null) }
// GdLabRender:     render(…, { …, loadPatient: BdLabWczytaj })

// vilda_auth_ui.js, przed patientLoadCapture — przejście do przelicznika po wczytaniu
BdPrzejdzPoWczytaniu(patientId, href)   // bilet {patientId, href, okno, wczytano, od}; pierwsze sprawdzenie po 80 ms
BdPrzejscieSprawdz(bilet)               // co 150 ms: inny pacjent → koniec; #vildaLoadChoiceModal → czekaj;
                                        // getPatientLoadPresentation() loading → czekaj (limit 15 s);
                                        // okno było i vildaLoadChoiceV1 ∉ {new, restore} → koniec (rezygnacja);
                                        // BdSesjaZgodna() → BdOtworzPrzelicznik(href); inaczej czekaj (limit 6 s)
BdSesjaZgodna()                         // readShared().age/ageMonths === wartości pól #age/#ageMonths
BdSesjaOdswiez()                        // raz, po 3,4 s od wczytania i po pauzie autozapisu: change na #age
BdOtworzPrzelicznik(href)               // powłoka: VildaShell.navigate('lab', true[, href]); inaczej location.assign

// vilda_auth_ui.js, w ga(): szablon „Wynik badania” tylko tam, gdzie edytor otwarto z nim
S = [none, med-start, med-change, med-stop];  w === 'lab' && S.push({ value: 'lab', label: 'Wynik badania' });

// vilda_terminarz.js, za wyborem szablonu z zapisanego wpisu (de = #tzNtTpl)
(function () { if (!de || de.value === 'lab') return; /* usuń option[value="lab"] */ })();
```

**Dlaczego przejście czeka na sesję wspólną.** Przelicznik czyta pacjenta z sesji wspólnej (`VildaSession.getPatient()`, klucze `age` i `ageMonths` najwyższego poziomu). Dopisuje je `userData.js` przy zdarzeniu `input`/`change` pól pacjenta, ale nie podczas pauzy autozapisu — a na nią przypadają zdarzenia z wczytania i z „Nowy pomiar”. Zapis następuje, gdy lustro pól w `custom-fixes.js` (`F`) 3,2 s po `vilda:patient-loaded` ponowi `change`. Przejście wcześniej otwierało przelicznik bez wieku. Odtworzenie zapisu („Odtwórz zapisany stan”) wpisuje wiek od razu, więc tam czekania nie ma.

**Znany błąd aplikacji, poza tą łatką — naprawiony 2026-11-15 przez P-WIEK-NOWY-POMIAR (niżej); obejście `BdSesjaOdswiez` usunięte, opis zostaje jako historia** (potwierdzony sondą na `audyt` `28ee1c3e` i na `743dba9a`): w powłoce przy drugim i kolejnym pacjencie wczytanym w tej samej karcie przeglądarki lustro nie ponawia `change` po „Nowy pomiar”, więc wiek nie trafia do sesji wspólnej, dopóki lekarz nie zmieni pola pacjenta; ręczne przejście do Jednostek lab. w ciągu ok. 3,2 s po „Nowy pomiar” ma ten sam skutek także przy pierwszym pacjencie. Droga z zakładki „Badania” obchodzi to jednym zdarzeniem `change` na `#age` (`BdSesjaOdswiez`) — tym samym, które wysyła lustro, w tej samej chwili (po 3,4 s od wczytania); wysłane wcześniej (ok. 1 s po wyborze) w jednym z trzech przebiegów sondy oznaczało pacjenta jako zmienionego, po 3,4 s w sześciu z sześciu nie. Po naprawie przyczyny obejście można usunąć; samo czekanie (`BdSesjaZgodna`) może zostać.

**Granice.** Przycisk „Wczytaj tego pacjenta” działa bez zmian (to samo ciało funkcji, `BdPo = null`). Karta otwarta bez funkcji listy (chip, wyszukiwarka, Terminarz) nadal nie ma tego przycisku; zakładka „Badania” wczytuje wtedy przez `applyLoadedData` — tak jak listy pacjentów w `vilda_chrome.js` i `custom-fixes.js`. Na stronie bez `applyLoadedData` zakładka dostaje `loadPatient: null`. Nic poza zdarzeniem `change` nie zapisuje danych; sejf, synchronizacja i eksport bez zmian. Testy: `tests/unit/lab-history-tab.test.mjs`, `tests/unit/badania-przejscie-po-wczytaniu.test.mjs` (wycinek produkcyjnego bloku przejścia), `tests/unit/auth-patient-load-authority.test.mjs` (wycinek `BdWczytajPacjenta`), `tests/unit/care-plan-auth-ui-boundary.test.mjs` (odcisk treści edytora odświeżony świadomie), e2e `tests/e2e/badania-wczytaj-i-dodaj.spec.mjs`, `tests/e2e/badania-wczytaj-i-dodaj-mobile.spec.mjs`, `tests/e2e/wyniki-badan-karta.spec.mjs`, `tests/e2e/karta-pacjenta-porzadki.spec.mjs`, `tests/e2e/lab-snapshot.spec.mjs`.

## Łatka P-WIEK-NOWY-POMIAR — „Nowy pomiar” zapisuje pola wizyty do sesji od razu (`custom-fixes.js`, `vilda_auth_ui.js`, `przelicznik-jednostek.html`, 2026-11-15, decyzja właściciela)

Opis działania i przypadki: `docs/clinical/ALGORITHMS.md`, „P-WIEK-NOWY-POMIAR”. Czytelne bloki, bez ponownej minifikacji.

```js
// custom-fixes.js — przed finishLoadChoicePresentation
function publishNewVisitFields() {
  // VildaPersistence.updateShared((shared, persisted) => { dla age, ageMonths, weight, height:
  //   shared[id] = String(pole.value); gdy persisted.byId ma już ten klucz — także byId[id] }, { force: true })
}
// obsługa #vildaLcmNew:  …; L(), p();  publishNewVisitFields();  …; dispatch vilda:load-choice-applied

// vilda_auth_ui.js — blok przejścia po wczytaniu (P-BADANIA-WEJSCIE): usunięte BdSesjaOdswiez i BD_PRZEJSCIE_LUSTRO_MS;
// BD_PRZEJSCIE_SESJA_MS 6 s → 3 s; BdSesjaZgodna zostaje jako strażnik.

// przelicznik-jednostek.html — przed readPatientFromShared
function readLoadedPatientAge() { /* tylko dla wczytanego pacjenta: wiek wizyty (VildaPubertyAssessmentContext albo
  sesja formularza z visit.patientId tego pacjenta), inaczej wiek z daty urodzenia na dziś (packageAgeAt) */ }
// readPatientFromShared: wiek z sesji wspólnej ma pierwszeństwo; bez niego readLoadedPatientAge(); wynik niesie ageSource
// getEffectivePatient / getPackagePatient: p._age_missing; describePatient: „brak wieku”; buildClinicalHint: AGE_MISSING_HINT
```

**Przyczyna, ustalona sondami na kodzie produkcyjnym.** Pola pacjenta w sesji wspólnej (`age`, `ageMonths`, `weight`, `height` na najwyższym poziomie) zapisuje `userData.js` przy zdarzeniu `input`/`change` tych pól — ale nie podczas pauzy autozapisu. Po wczytaniu z listy sesja wspólna dostaje nazwisko i płeć; pola wizyty dopisuje dopiero wybór: „Odtwórz zapisany stan” synchronicznie (odtworzenie zapisuje sesję), a „Nowy pomiar” nie zapisywał nic — jego zdarzenia (`L`) przypadają na pauzę. Zapis następował, gdy lustro pól (`F`) 3,2 s po `vilda:patient-loaded` ponawiało `change`.

**Dlaczego przy drugim pacjencie w powłoce lustro nie startuje.** `F` jest wołane na `vilda:patient-loaded`, zanim inny nasłuch `custom-fixes.js` wpisze nowy identyfikator do `vildaCurrentPatientId`. W tej chwili sesja wskazuje jeszcze poprzedniego pacjenta, więc `VildaPanelPacjent.nieaktualny()` jest prawdą, `captureMirrorWriter()` zwraca `null`, a `F` kasuje timery i kończy — bez paczek 180/1000/2600 ms i bez ponowienia po 3,2 s. Przy pierwszym pacjencie w karcie identyfikatora jeszcze nie ma, panel nie jest „nieaktualny” i lustro działa. Lustra **nie zmieniono**: po tej łatce nie ma znanego skutku jego braku (pola wizyty zapisuje wybór, a DocPro i Klirens przejmują pacjenta z sesji formularza — sprawdzone sondą dla obu wyborów), a włączenie paczek dla kolejnych pacjentów zmieniłoby zachowanie między ramkami, na którym opierają się testy przejęcia pacjenta. To osobna decyzja.

**Skutki uboczne sprawdzone.** Zapis do sesji w „Nowy pomiar” nie zmienia stanu wskaźnika zapisu („zapisane” w sondzie i w `tests/e2e/wiek-po-nowym-pomiarze.spec.mjs`; `tests/e2e/patient-chip-navigation.spec.mjs` bez zmian). `force: true` jak w `syncSharedUserDataFromLoadedData`: zapis jest częścią wczytania. Przelicznik niczego nie zapisuje — tylko czyta wiek z dodatkowych źródeł.

**Poza łatką (zgłoszone osobno).** Na stronie samodzielnej pakiet badań nie zna daty urodzenia pacjenta bez znacznika oceny pokwitania (`readPubertyPatientContext` czyta ją z kontekstu oceny albo z `shared.dobISO`, a jest w sesji formularza), więc przy dacie pobrania wstecz zostaje w trybie „bez daty urodzenia”. W powłoce działa.

## Łatka P-OCZEKUJACE-WYNIKI — oczekujący wynik przez Jednostki lab. (`lab_pin_result.js`, 2026-11-15, decyzje właściciela)

Opis działania i przypadki: `docs/clinical/ALGORITHMS.md`, „LAB-HISTORIA 6.35”. Zmiany w czytelnych źródłach (`vilda_lab_history.js` 1.5.0 — `pendingItem`; `vilda_lab_history_tab.js` 2.6.0; `vilda_lab_packages.js` — `drawPending`, `closePending`; pasek `#labPendingStrip` w `przelicznik-jednostek.html`; style w `inline_przelicznik_jednostek_00.css` i `vilda_lab_history_tab.css`) nie wymagają opisu łatki. Łatką jest tylko zminifikowana część `lab_pin_result.js` — trzy podmiany dokładnych ciągów, bez ponownej minifikacji:

```js
// 1. budowa okna (funkcja V): znacznik po podglądach oceny i zakresu
//    było:  RrPinRange(t,o),s.addEventListener("click",…),…,u("labPinSave").addEventListener("click",function(){A(t,e,i)})}}
//    jest:  RrPinRange(t,o);var OwChoice=OwPinChoice(t,o);s.addEventListener("click",…),…,…function(){A(t,e,i,OwChoice)})}}
// 2. nagłówek funkcji zapisu:  function A(t,e,n){…  →  function A(t,e,n,OwChoice){…
// 3. po zapisaniu wyniku:  await r.savePatientNote(p),g();  +
//    if(OwChoice&&a.VildaLabPendingResult&&typeof a.VildaLabPendingResult.commit=="function")try{await a.VildaLabPendingResult.commit(OwChoice,r)}catch{}
```

Czytelne dodatki w tym samym pliku: `OwPinChoice(result, host)` (przed blokiem „PR3: modal shows…”) rysuje znacznik nad datą badania przez `VildaLabPendingResult.choice`; na końcu pliku drugi moduł (własne IIFE) `window.VildaLabPendingResult` — podpięty wpis, pasek, znacznik, zamknięcie i cofnięcie.

**Dlaczego moduł jest w pliku okna przypięcia, a nie w osobnym pliku.** Nowy plik to dodatkowe żądanie przy instalacji aplikacji (budżet żądań service workera, `FRESH_STATIC_ALIAS_PATHS`); ten sam wzorzec co `VildaResultDetailsDialog` w `vilda_lab_result_chart.js` i pakiet badań w jednym pliku.

**Dlaczego wywołanie zamknięcia jest wewnątrz funkcji zapisu `A`.** Testy `search-note-producers`, `lab-snapshot-ui` i `lab-testosterone-snapshot-vault` uruchamiają wycinek `async function A(` … `function I(){` z wolnymi zmiennymi `a, u, T, D, g, h`. Funkcja musi więc zostać samodzielna: bez znacznika (`OwChoice` niezdefiniowane) działa dokładnie jak dotąd, a zapisywana notatka wyniku nie zmienia postaci.

**Granice.** Sejf bez zmian: zamknięcie to istniejące `completePatientNote` / `uncompletePatientNote`, opis słowny — istniejące `saveReminderOutcome` (action „result”), odczyt — `getPatientNote`. Edytor karty (`vilda_auth_ui.js`) i Terminarz bez zmian; zakładka przestała otwierać edytor z szablonem „Wynik badania” przy oczekującym wyniku, więc szablon jest osiągalny tylko przez edycję zapisanego wyniku. W ramce powłoki cel przychodzi zdarzeniem `vilda:shell-navigate-target` (jak `?badanie=` i `?pakiet=`); adres strony samodzielnej traci `oczekujacy` po odpięciu albo zamknięciu (`history.replaceState`), żeby odświeżenie nie podpinało wpisu ponownie.

**Etap 2 (LAB-HISTORIA 6.36, 2026-11-15) — bez nowej łatki.** Lista oczekujących wyników przy wyniku wpisanym bez wejścia z „Badań” zmienia tylko czytelne źródła: drugi moduł `lab_pin_result.js` (`VildaLabPendingResult` 1.1.0 — `listChoice`, `listDefault`, `listVisible`, `listPending`, nasłuch `onPatientNoteChanged`), `vilda_lab_history.js` 1.6.0 (`pendingItems`), `vilda_lab_packages.js` (`drawPending`) i style w `inline_przelicznik_jednostek_00.css`. Trzy podmiany w zminifikowanej części `lab_pin_result.js` zostają bez zmian: `OwPinChoice` woła to samo `choice`, a `A` to samo `commit`. Sejf nadal bez zmian — dochodzi tylko odczyt `listPatientNotesForPatient`.

**Znalezione przy okazji, bez zmiany.** „Dodaj wynik do kartoteki” w Przypomnieniach nie podaje sejfowi nazwy badania, więc dla wpisu „Wynik: Biopsja…” (Terminarz po procedurze) wynik opisowy dostaje tytuł „Wynik: Wynik: Biopsja…”. „Opisz wynik” w zakładce „Badania” podaje nazwę bez prefiksu. Do decyzji właściciela, czy wyrównać Przypomnienia.

## Łatka P-KLIRENS-NOTATKI — wynik Klirensu poza Notatkami (`vilda_auth_ui.js`, 2026-11-15, decyzja właściciela)

Opis działania i przypadki: `docs/clinical/ALGORITHMS.md`, „LAB-HISTORIA 6.37”; `docs/clinical/KLIRENS_NOTES.md`. Zmiany w czytelnych źródłach (`vilda_lab_history.js` — `isClcrResultNote`; `vilda_lab_history_tab.js` 2.7.0 — `focusRequested` dla zapisów Klirensu) nie wymagają opisu łatki. W `vilda_auth_ui.js` zmienia się czytelny blok P-WYNIKI-BADAN i dwa dokładne ciągi w części zminifikowanej, bez ponownej minifikacji:

```js
// Czytelny blok P-WYNIKI-BADAN: dwa nowe predykaty po WbJestWynikiem
function WbJestKlirensem(note) { /* VildaLabHistory.isClcrResultNote, błąd → false */ }
function WbWBadaniach(note) { return WbJestWynikiem(note) || WbJestKlirensem(note); }
// WbNotatkiNaglowek: wyniki = notatki.filter(WbWBadaniach); komunikat po zapisie nadal tylko dla WbJestWynikiem.

// 1. lista Notatek (funkcja Xo), dopisek P-WYNIKI-BADAN-NOTATKI — dwa wystąpienia w jednej instrukcji:
//    było:  c.filter(function(S){return!WbJestWynikiem(S)})
//    jest:  c.filter(function(S){return!WbWBadaniach(S)})
// 2. rozstrzygnięcie linku (showPatientCard), dopisek P-WYNIKI-BADAN-LINK:
//    było:  if(WbCel&&WbJestWynikiem(WbCel))r=Object.assign({},r,{activeTab:"lab",labFocusNoteId:WbCel.id,focusNoteId:null});
//    jest:  if(WbCel&&WbWBadaniach(WbCel))r=Object.assign({},r,{activeTab:"lab",labFocusNoteId:WbCel.id,focusNoteId:null});
```

**Granice.** Punkty podpięcia zwartej karty Klirensu (`ClcrNotesCard`, `ClcrNotesTitle`, `ClcrOpenNoteResult`; `tools/patch-klirens-notes-view.mjs`) zostają bez zmian: karta rysuje się dla zapisu „wynik-klirens” bez pola wyniku, tytuły w Historii i szczegóły z ogólnego edytora działają jak dotąd. Grupowanie wyników w Historii (`WbHistoriaGrupuj`) nadal dotyczy tylko wyników badań — wpis Klirensu w Historii się nie zmienia. Sejf, wyszukiwarka i strona Klirens bez zmian.

## Łatka P-PRZYPIETY-WYNIK — przypięty wynik i blokada duplikatu (`lab_pin_result.js`, 2026-11-17, decyzja właściciela)

Opis działania i przypadki: `docs/clinical/ALGORITHMS.md`, „LAB-HISTORIA 6.38”; `docs/LAB_HISTORIA_WYNIKOW_PLAN.md`, decyzja 6.38 i „Uzupełnienie z wdrożenia 6.38”. Zmiany w czytelnych źródłach (`lab_history_strip.js` 1.4.0 — `pinnedFor` czyta `VildaLabPinResult.pinned()`, `markPinned` usunięte; style w `lab_history_strip.css` i `inline_przelicznik_jednostek_00.css`) nie wymagają opisu łatki. W zminifikowanej części `lab_pin_result.js` są dwie podmiany dokładnych ciągów i jedno wstawienie czytelnego bloku, bez ponownej minifikacji:

```js
// 1. budowa okna (funkcja V): ostrzeżenie o duplikacie po znaczniku oczekującego wyniku
//    było:  var OwChoice=OwPinChoice(t,o);
//    jest:  var OwChoice=OwPinChoice(t,o);PpDialog(t,e,o);
// 2. zapis (funkcja A): świeże sprawdzenie karty tuż przed savePatientNote
//    było:  n&&(p.linkedAgeMonths=n),await r.savePatientNote(p),g();
//    jest:  n&&(p.linkedAgeMonths=n);var Pb=typeof PpBlocked=="function"?await PpBlocked(r,p):null;if(Pb){h(Pb);return}await r.savePatientNote(p),g();
// 3. koniec pierwszego IIFE: czytelny blok między końcem I() a jej uruchomieniem (od nowej linii)
//    było:  …c(),setTimeout(c,1200)}l.readyState==="loading"?l.addEventListener("DOMContentLoaded",I):I()})(window);
//    jest:  …c(),setTimeout(c,1200)}
//           /* Przypięty wynik (P-PRZYPIETY-WYNIK, LAB-HISTORIA 6.38; …) */
//           var PP_PIN_TEXT = …; … function PpStart() { … }
//           a.VildaLabPinResult.pinned = …; a.VildaLabPinResult._internal = Object.freeze({ … });
//           if (l.readyState === "loading") l.addEventListener("DOMContentLoaded", PpStart); else PpStart();
//           l.readyState==="loading"?l.addEventListener("DOMContentLoaded",I):I()})(window);
```

Czytelny blok leży w tym samym domknięciu co część zminifikowana i korzysta z jej `a`, `l`, `u`, `L`, `E`, `D` i `N`: stałe tekstów, stan `PpState`, czyste funkcje reguły (`PpParse`, `PpNums`, `PpNormUnit`, `PpRawIs`, `PpSame`, `PpHolds`, `PpResolve`, `PpDuplicates`), odświeżanie (`PpStart`, `PpRefresh`, `PpApply`, `PpWatch`, `PpClaim`), okno (`PpDialog`, `PpDialogSync`) i sprawdzenie zapisu (`PpBlocked`). Na końcu dopisuje `pinned` i zamrożone `_internal` do obiektu `window.VildaLabPinResult`, który część zminifikowana tworzy z `setAssessmentProvider`.

**Dlaczego sprawdzenie w `A` ma strażnika `typeof`.** Testy `search-note-producers`, `lab-snapshot-ui` i `lab-testosterone-snapshot-vault` uruchamiają wycinek `async function A(` … `function I(){` z wolnymi zmiennymi (jak przy P-OCZEKUJACE-WYNIKI). `PpBlocked` leży poza wycinkiem, więc bez niego zapis działa dokładnie jak dotąd, a zapisywana notatka wyniku nie zmienia postaci.

**Dlaczego blok stoi za `I()`.** Jest poza każdym wycinkiem testów na tym pliku (`var Lh2AssessmentProvider=` … `var s=null;` albo `/* AMH educational reference`, `async function A(` … `function I(){`). `tests/unit/lab-pin-pinned-state.test.mjs` pilnuje, że blok zaczyna się po `I()` i kończy przed jej uruchomieniem, że znaczniki wycinków `A` i `I` są nadal jednoznaczne oraz że `PpDialog` i `PpBlocked` są w części zminifikowanej wołane dokładnie raz.

**Granice.** Bez nowych stylów ustawianych wprost na elementach: ostrzeżenie, komunikat pod datą i stan przycisku mają klasy z arkuszy, więc liczba dla `lab_pin_result.js` w `tests/fixtures/style-elementow.json` zostaje 17. Ciągi kontraktu z `tests/unit/lab-pending-result.test.mjs` (`RrPinRange(t,o);var OwChoice=OwPinChoice(t,o);`, `function(){A(t,e,i,OwChoice)}`, zamknięcie oczekującego wyniku zaraz po `await r.savePatientNote(p),g();`, notatka bez śladu oczekującego wyniku) są bez zmian. Sejf bez zmian: blok tylko czyta (`listPatientNotesForPatient`, `getPatientNote`) i korzysta z istniejących nasłuchów `onPatientNoteChanged` i `onLock` oraz z sygnału sejfu dla innych kart (`BroadcastChannel` „vilda-notes”, klucz `storage` „vilda-note-changed-ping-v1”). Pakiet badań (`vilda_lab_packages.js`) zapisuje wyniki własną drogą i nie jest blokowany.

## Łatka P-PASEK-WARIANT-A — krótszy podpis wiersza przypięcia (`lab_pin_result.js`, 2026-11-17, decyzja właściciela)

Opis: `docs/clinical/ALGORITHMS.md`, „LAB-HISTORIA 6.39”; `docs/LAB_HISTORIA_WYNIKOW_PLAN.md`, decyzja 6.39. Zmiany w czytelnych źródłach (`lab_history_strip.js` 1.5.0, `lab_history_strip.css`, blok `Pp*` w `lab_pin_result.js`: `PP_PIN_SUB` i podpis w `PpApply`) nie wymagają opisu łatki. W zminifikowanej części `lab_pin_result.js` jest jedna podmiana dokładnego ciągu, bez ponownej minifikacji:

```js
// tekst początkowy podpisu wiersza przypięcia (funkcja N)
//    było:  n.id="labPinSub",n.textContent="wynik trafi do karty pacjenta"
//    jest:  n.id="labPinSub",n.textContent="Jeszcze nie w karcie"
```

Tekst jest ten sam co `PP_PIN_SUB` w czytelnym bloku, więc wiersz nie zmienia podpisu, zanim blok go odświeży. `tests/unit/lab-pin-pinned-state.test.mjs` pilnuje, że oba ciągi występują dokładnie raz, a dawnego tekstu nie ma. Bez nowych stylów ustawianych wprost na elementach (liczba dla `lab_pin_result.js` w `tests/fixtures/style-elementow.json` zostaje 17); znaczniki wycinków testów (`var Lh2AssessmentProvider=`, `var s=null;`, `async function A(`, `function I(){`) bez zmian.

## Łatka P-BEZCZYNNOSC-KARTA — bezczynność i koniec sesji liczone dla całej karty (`vilda_auth_ui.js` 567 → 568, `vilda_session_bridge.js` 217 → 218, 2026-11-18, polecenie właściciela)

Opis działania i walidacja: `docs/clinical/ALGORITHMS.md`, „Bezczynność i koniec sesji liczone dla całej karty”. Czytelne bloki wstawione wprost do artefaktów, bez ponownej minifikacji; w części zminifikowanej `vilda_auth_ui.js` zmieniają się trzy dokładne ciągi.

```js
// vilda_auth_ui.js — czytelny blok aktywności (nad „var authBootReady=false;”)
function vildaRecordActivity(event) { /* jak dotąd: Bn = teraz, resetIdleTimer(), refreshPersistedSession();
  nowe: zdarzenie niezaufane zostaje lokalne, a w pozostałych dokumentach karty wołane jest recordPeerActivity() */ }
function vildaRecordPeerActivity() { /* Bn = teraz, resetIdleTimer(); bez zapisu sesji i bez dalszego rozsyłania */ }

// vilda_auth_ui.js — między „function isAuthBootReady(){return authBootReady}” a „async function Ei(){”
function vildaTabPeers() { /* dokument główny (i.top) i jego bezpośrednie ramki, bez własnego okna;
  tylko ten sam origin, każdy dostęp w try/catch */ }
function vildaClearTabWorkState() { /* gdy karta nie ma zapisu sesji sejfu:
  VildaPersistence.clearUserState({ includeSessions: true, source: "auth.tabSessionEnded", dispatchEvent: false })
  i znaczniki wczytanego pacjenta; znacznik pacjenta panelu HOMA-IR (vildaHomaIdentityRefV1) jest opróżniany,
  nie usuwany — pusty nie pasuje do żadnego pacjenta, więc panel nadal czyści swoje pola przy zmianie pacjenta */ }
function vildaEndTabSession(reason) { /* vildaClearTabWorkState(); dla "idle" i "manual": lock(reason)
  w pozostałych odblokowanych dokumentach karty; "manual" zaczęte w ramce: VildaFrameSync.resync() dokumentu głównego */ }

// vilda_auth_ui.js, część zminifikowana — dokładne ciągi, każdy występuje raz:
// 1. nasłuch onLock w Ei
//    było:  var n=dn;dn=null;try{qa("on-lock")}catch{}
//    jest:  var n=dn;dn=null;try{qa("on-lock")}catch{}try{vildaEndTabSession(a)}catch{}
// 2. start zablokowanej strony w Ei
//    było:  if(Io()){Aa(!0,{skipReset:!0}),$t();return}Aa(!1);let Bkr_s=null;
//    jest:  if(Io()){Aa(!0,{skipReset:!0}),$t();return}if(authNeedsCleanup)vildaClearTabWorkState();Aa(!1);let Bkr_s=null;
// 3. publiczne API VildaAuthUI
//    było:  recordActivity:vildaRecordActivity,
//    jest:  recordActivity:vildaRecordActivity,recordPeerActivity:vildaRecordPeerActivity,

// vilda_session_bridge.js — czytelny blok przed „var h=n.document;h&&(h.readyState==="loading"?”
function relayTabActivity(event) { /* zaufane zdarzenie wejścia na stronie w ramce bez czynnego własnego
  modułu konta → top.VildaAuthUI.recordActivity(); tylko gdy karta ma zapis sesji sejfu (l() mostu) */ }
// nasłuch na document: mousedown, keydown, touchstart, scroll, pointerdown (passive)
```

Nazwy z artefaktu użyte w nowym kodzie: `i` — okno, `jt()` — sejf (`VildaVault`), `Bn` — znacznik ostatniej aktywności, `Ot` — zapis błędu modułu konta; w `vilda_session_bridge.js`: `n` — okno, `l()` — czy karta ma zapis sesji sejfu (`hasSessionKey`).

**Granice.** Pomocnicy `vildaTabPeers`, `vildaClearTabWorkState` i `vildaEndTabSession` zostają w wycinku od `var authBootReady=false;` do `function uo(` — ten fragment wycinają uprzęże `tests/unit/auth-boot-readiness.test.mjs` i `tests/unit/sejf-usun-konto-karty-2.test.mjs`. Miejsca wywołań przypina `tests/unit/bezczynnosc-karta.test.mjs` („okablowanie końca sesji karty w plikach produkcyjnych”). `vilda_vault.js`, `vilda_frame_sync.js`, `vilda_shell.js` i kolejność skryptów bez zmian; `vilda_chrome.js` 299 → 300 i lista w `vilda_session_bridge.js` zmieniają tylko `?v=` wstrzykiwanego `vilda_auth_ui.js` (`npm run podbij-wersje`).

## Łatka P-OTYLOSC-WZROST — Kontynuacja bez wzrostu, data każdego punktu, ocena dziecka z ostatniego punktu ze wzrostem (`obesity_therapy_monitor.js` 27 → 28, `vilda_auth_ui.js` 566 → 567, `obesity_response_criteria.js` 4 → 5, 2026-11-18, decyzje właściciela)

Opis działania i przypadki: `docs/clinical/ALGORITHMS.md`, „Leczenie otyłości — etap 1” (P-OTYLOSC-WZROST). Zmiany w czytelnych źródłach (`vilda_cykle_leczenia.js` VERSION 3 — R8, R9, `wzrostWymagany`; `docpro.html`; style w `inline_docpro_01.css`) nie wymagają opisu łatki. W trzech plikach zminifikowanych są podmiany dokładnych ciągów i wstawione czytelne bloki, bez ponownej minifikacji:

```js
// obesity_response_criteria.js — czytelny blok przed obiektem modułu (od nowej linii)
//    było:  …zdanieGrupy(nazwa,wiek){…}var g={CRITERIA:d,…,zdaniaLeku:zdaniaLeku,zdanieGrupy:zdanieGrupy};
//    jest:  …zdanieGrupy(nazwa,wiek){…}
//           /* P-OTYLOSC-WZROST … */ function Pw_ms(t){…} function Pw_mies(p){…} function Pw_bmi(p){…}
//           function tygodnieOceny(start,p){…} function Pw_okno(grupa,tygodnie){…} function punktOceny(kryterium,punkty){…}
//           var g={CRITERIA:d,…,zdanieGrupy:zdanieGrupy,punktOceny:punktOceny,tygodnieOceny:tygodnieOceny};

// obesity_therapy_monitor.js
// 1. vt: wiek i masa obowiązkowe; wzrost opcjonalny przy module cykli, wpisany zły — błąd przy polu
//    było:  if(!isFinite(o)||!(o>0)||!isFinite(r)||!(r>0)||!(s>0)){Cm("err","Uzupe\u0142nij co najmniej wiek, mas\u0119 i wzrost, aby doda\u0107 punkt leczenia.");return}
//    jest:  if(!isFinite(o)||!(o>0)||!(s>0)||!Hc()&&!(isFinite(r)&&r>0)){Cm("err",Hm("doda\u0107 punkt leczenia"));return}var Hz=Hw(J("obesityHeight"));if(Hz.blad){Cm("err",Hz.blad),Hf("obesityHeight");return}r=Hz.wzrost;
// 2. vt: odmowa modułu cykli wskazuje pole
//    było:  Cr.wybor?Cw(Cr):Cm("err",Cr.komunikat);return}
//    jest:  Cr.wybor?Cw(Cr):(Cm("err",Cr.komunikat),Hk(Cr.kod));return}
// 3. Ed (czysta): wzrost opcjonalny, gdy jest moduł cykli (4. argument albo window); bez modułu — „braki” jak dotąd
//    było:  var b=Number(u.weight),p=Number(u.height),M=Math.round(Number(u.ageMonthsTotal));if(!isFinite(b)||!(b>0)||!isFinite(p)||!(p>0)||!isFinite(M)||!(M>0))return{ok:!1,reason:"braki"};
//    jest:  var b=Number(u.weight),p=u.height==null?NaN:Number(u.height),M=…,Hv=arguments.length>3?arguments[3]:typeof window<"u"?window.VildaCykleLeczenia:null;/* … */isFinite(p)&&p>0||(p=null);if(!isFinite(b)||!(b>0)||!isFinite(M)||!(M>0)||p==null&&!(Hv&&typeof Hv.sprawdz=="function"))return{ok:!1,reason:"braki"};
// 4. Eb: wpisany zły wzrost — błąd przy polu
//    było:  if(!Es)return!1;Cc();
//    jest:  if(!Es)return!1;Cc();var Hz=Hw(J("obesityHeight"));if(Hz.blad){Cm("err",Hz.blad),Hf("obesityHeight");return!1}
// 5. Eb: komunikat braków i wskazanie pola
//    było:  b.reason==="braki"?"Uzupe\u0142nij co najmniej wiek, mas\u0119 i wzrost, aby zapisa\u0107 zmiany.":   …   Cm("err",p);return!1}
//    jest:  b.reason==="braki"?Hm("zapisa\u0107 zmiany"):   …   Cm("err",p),Hk(b.reason);return!1}
// 6. Eb: pytanie przy usunięciu wzrostu, który był (obok dawki i daty, OBESITY-EDIT-2)
//    było:  f(Em.dateISO)&&!f(a)&&En.push(
//    jest:  Number(Em.height)>0&&!(Hz.wzrost>0)&&En.push("Usuni\u0119cie wzrostu: …");f(Em.dateISO)&&!f(a)&&En.push(
// 7. Ep: data pomiaru tej wizyty, a gdy nie jest pewna — dzisiejsza
//    było:  Ek("obesityHeight",s),Ek("obesityDate",Et())
//    jest:  Ek("obesityHeight",s),Ek("obesityDate",Hd()||Et())
// 8. podgląd przycisków (CyS, CyE) z wzrostem z formularza, odświeżenie podpowiedzi wzrostu, nasłuch pola wzrostu
//    było:  weight:1,height:1,dateISO:r          jest:  weight:1,height:x("obesityHeight"),dateISO:r
//    było:  n.type=t.type,n.ageYears=t.ageYears,n.ageMonths=t.ageMonths,n.dateISO=t.dateISO
//    jest:  n.type=t.type,n.ageYears=t.ageYears,n.ageMonths=t.ageMonths,n.height=t.height,n.dateISO=t.dateISO
//    było:  function CyS(){                      jest:  function CyS(){typeof Hl=="function"&&Hl();
//    było:  ["obesityDate","obesityAge","obesityAgeMonths"].forEach(…
//    jest:  ["obesityDate","obesityAge","obesityAgeMonths","obesityHeight"].forEach(…
// 9. teksty podpowiedzi Zakończenia (CyZ, CsZ): „masę i wzrost” → „masę (u dziecka także wzrost)”
// 10. czytelny blok przed Ep (od nowej linii): Hc, Hm, Hw, Hf, Hk, Hd, Hl

// vilda_auth_ui.js (Ob_b w Ml)
// 1. wejście oceny z punktu oceny
//    było:  var mt=x!=null&&k!=null&&!s?k-x:null,f=$.evaluate(it,{weeks:Q,massPct:N,bmiPct:H,bmiSdsDelta:mt}),K=null,P="";
//    jest:  var Ob_po=typeof Ob_pkt=="function"?Ob_pkt($,it,o,l,c,a,n,Ob_g,Ob_m,N,u):null;Ob_po&&Ob_po.inny&&(Q=Ob_po.weeks,_=Ob_po.zWieku,H=Ob_po.bmiPct);var mt=Ob_po&&Ob_po.inny?Ob_po.bmiSdsDelta:x!=null&&k!=null&&!s?k-x:null,f=Ob_po&&Ob_po.wstrzymaj?null:$.evaluate(…),K=null,P="";
// 2. kafelek „Wzrost do oceny” za „Próg ChPL”
//    było:  ht.thresholdPct!=null?"%":"",ht.label));var KT=
//    jest:  ht.thresholdPct!=null?"%":"",ht.label)),Ob_po&&Ob_po.kafelek&&ot.push(Ob_po.kafelek);var KT=
// 3. stan wstrzymania albo dopisek o punkcie oceny — po wyborze werdyktu, przed notą o kotwicy nominalnej
//    było:  :gt={cls:"wait",ic:"\u2139\uFE0F",title:"Ocena niedost\u0119pna",desc:""};try{if(gt&&f&&f.anchorMode==="nominalna"
//    jest:  :gt={…};Ob_po&&(Ob_po.wstrzymaj&&Ob_po.stan?gt=Ob_po.stan:Ob_po.inny&&gt&&Ob_po.dopisek&&(gt.desc=(gt.desc?gt.desc+" ":"")+Ob_po.dopisek));try{if(gt&&f&&f.anchorMode==="nominalna"
// 4. kafelek „Redukcja BMI”: podpis, gdy ostatni wpis nie ma wzrostu
//    było:  s?"dodaj punkt kontrolny":null));var V=
//    jest:  s?"dodaj punkt kontrolny":v==null?"ostatni wpis bez wzrostu":null));var V=
// 5. czytelny blok Ob_pkt przed function Ob_css( (od nowej linii)
```

**Dlaczego strażnicy `typeof`.** `tests/unit/monitor-otylosci-r6.test.mjs` uruchamia wycinek monitora z `CyS` bez czytelnego bloku — `CyS` woła `Hl` tylko, gdy istnieje. W `Ob_b` `Ob_pkt` jest wołane przez `typeof`, a przy jego braku albo przy module kryteriów bez `punktOceny` (starsza wersja w pamięci) `Ob_po` jest `null`, czyli ocena jak przed etapem 1.

**Dlaczego `Ed` bez pomocników.** `tests/unit/otylosc-edycja-punktu.test.mjs` wycina `function Ed(t,e,n)` … `function Q(t)` razem z `L` i `f` — reguła wzrostu jest więc w samym `Ed` (moduł cykli z 4. argumentu albo z `window`, jak dotąd w `Cv`).

**Granice.** Znaczniki wycinków testów bez zmian: w monitorze `function L(t,e)`, `var g=""`, `var ft="`, `function R(t)`, `function Ed(t,e,n)`, `function Q(t)`, `function Eh()`, `function Ee(t)`, `function Eo(t)`, `function Et(t)`, `function Ek(t,e)`, `function CyB(t)`, `function z()`, `function CyL(t)`, `function CyG(t,e)`; w Karcie `function Ye(`, `function An(`, `function Ob_ks(`, `function Ob_css(`, `if(Ob_m.bad&&Ob_m.bad.length){`, `/* Zakonczony cykl`. Czytelny blok `Ob_pkt` leży w wycinku `function Ob_ks(` … `function Ob_css(` testów Karty — tylko jako deklaracja, której te testy nie wołają. Bez nowych stylów ustawianych wprost na elementach. Sejf, eksport i import bez zmian.

## Łatka P-OTYLOSC-DZIENNIK — dziennik leczenia otyłości w Karcie i monitorze (`vilda_auth_ui.js` 568 → 569 — po scaleniu z P-BEZCZYNNOSC-KARTA, które zajęło 568; `obesity_therapy_monitor.js` 28 → 29, 2026-11-18, decyzje właściciela)

Opis działania i przypadki: `docs/clinical/ALGORITHMS.md`, „Leczenie otyłości — etapy 3 i 4” (P-OTYLOSC-DZIENNIK). Zmiany w czytelnych źródłach — moduły `VildaDziennikOtylosci` i `VildaDziennikOtylosciUI` dopisane do `vilda_cykle_leczenia.js`, styl sekcji w `vilda_auth_ui.css`, filtr w `vilda_global_search.js`, tekst w `docpro.html` — nie wymagają opisu łatki. **Sejf (`vilda_vault.js`) bez zmian.** W dwóch plikach zminifikowanych są podmiany dokładnych ciągów i wstawione czytelne bloki, bez ponownej minifikacji:

```js
// vilda_auth_ui.js
// 1. Karta: kafelek, sekcja „Wpisy leczenia”, panel i porównanie z dziennika
//    było:  function(){try{return Cl(s.obesityTherapyPoints)}catch{return null}}(),function(){try{return Ml(s.obesityTherapyPoints,S,h)}catch{return null}}(),function(){try{return jl(t,s.obesityTherapyPoints)}catch{return null}}()
//    jest:  function(){try{return Ob_dz(t,s,S,h,GdNotatki,m)}catch(Ob_dzE){Ot("karta dziennik otylosci",Ob_dzE);return null}}()
// 2. panel dostaje stan dziennika (konflikty)
//    było:  function Ml(t,a,n){          jest:  function Ml(t,a,n,Ob_dzs){
// 3. werdykt wstrzymany przy konflikcie w oknie oceny — za blokiem wstrzymania D5, przed zakończonym cyklem
//    było:  /* Zakonczony cykl: … */if(Ob_m.end&&gt){
//    jest:  /* Zakonczony cykl: … */Ob_dzs&&typeof Ob_dzk=="function"&&(gt=Ob_dzk(Ob_dzs,Ob_m,it)||gt);if(Ob_m.end&&gt){
// 4. Notatki: wersje wpisów dziennika schowane za jedną linią
//    po:    c=(c||[]).filter(function(S){return!(S&&S.ghPointId)||!!(options&&options.focusNoteId===S.id)});
//    dochodzi linia:  if(typeof Ob_dzNotatki=="function")c=Ob_dzNotatki(t,c);
// 5. Historia: wpisy „Leczenie otyłości” z dziennika zamiast z migawki
//    było:  var S=[];try{S=await l.listPatientTimelineEvents(a)}catch(f){Ot("listPatientTimelineEvents",f)}
//    jest:  …catch(f){Ot("listPatientTimelineEvents",f)}try{typeof Ob_dzOs=="function"&&(S=await Ob_dzOs(S,a,l))}catch(Ob_dzOsE){Ot("Historia: dziennik leczenia otylosci",Ob_dzOsE)}
// 6. wiersz Historii: masa ze źródłem i podpis dziennika
//    było:  return p&&d.appendChild(s("Dawka",p)),t._prevObDrug
//    jest:  return p&&d.appendChild(s("Dawka",p)),t._obMasa&&d.appendChild(s("Masa",t._obMasa)),t._prevObDrug
//    było:  text:"\u{1F512} z monitora DocPro \u2014 edycja w karcie monitorowania"
//    jest:  text:t._obZDziennika?"\u{1F512} z dziennika leczenia \u2014 poprawka w \u201EWpisy leczenia\u201D":"\u{1F512} z monitora DocPro \u2014 edycja w karcie monitorowania"
// 7. czytelne bloki: Ob_dz, Ob_dzk przed function Ob_pkt(; Ob_dzOs, Ob_dzNotatki przed function WbOtworzBadania(

// obesity_therapy_monitor.js
// 1. vt: po dodaniu punktu — wersja wpisu w dzienniku
//    było:  …:I().push(Cp),T(),l(),q("obesity-point-added"),
//    jest:  …:I().push(Cp),T(),l(),q("obesity-point-added"),typeof Dzz=="function"&&Dzz({rodzaj:"dodaj",dane:Cp}),
// 2. Eb: po poprawce
//    było:  window.obesityTherapyPoints=b.points;T();Ec();l();q("obesity-point-edited");return!0}
//    jest:  …q("obesity-point-edited");typeof Dzz=="function"&&Dzz({rodzaj:"popraw",id:b.point.id,dane:b.point});return!0}
// 3. Q: po usunięciu
//    było:  q("obesity-point-deleted")}     jest:  q("obesity-point-deleted"),typeof Dzz=="function"&&Dzz({rodzaj:"usun",id:t})}
// 4. CyW: masa od pacjenta oznaczona w tabeli
//    było:  P(F(i.weight,1)),              jest:  P(F(i.weight,1)+(i.weightSource==="pacjent"?" (pacjent)":"")),
// 5. czytelny blok Dzs, Dzpid, Dzmig, Dzp, Dzw, Dzstart, Dzdane, Dzz (+ słuchacz vilda:patient-loaded) przed blokiem P-OTYLOSC-WZROST
```

**Dlaczego strażnicy `typeof`.** Testy wycinają fragmenty `Ob_b`, monitora (`Ed`…`Q`, `CyS`) i Notatek; wywołania czytelnych bloków przez `typeof` nie zmieniają działania wycinków bez nich. Wstawka w `Ob_b` stoi za komentarzem „Zakonczony cykl”, czyli poza wycinkiem `if(Ob_m.bad&&Ob_m.bad.length){` … `/* Zakonczony cykl` (`karta-otylosc-r6`).

**Granice.** Znaczniki wycinków testów bez zmian (lista w łatce P-OTYLOSC-WZROST). Nowe style ustawiane wprost na elementach: brak (wiersz Historii używa istniejącego pomocnika `s`). Lint: bez nowych naruszeń w `vilda_auth_ui.js` (limit `no-useless-assignment` z `eslint-suppressions.json` bez zmian).

## Łatka P-PWZ-ODTWORZENIE — odtworzony pacjent nie chowa modułów profesjonalnych (`vilda_professional_module.js` 13 → 14, 2026-11-19)

**Błąd (był już na `audyt` 04fbc4fc).** „Odtwórz zapis” w DocPro (`restoreLoadedStateImmediately`, `vilda_data_import_export.js`) wpisuje do pola PWZ wartość z zapisu (`doctor.pwzNumber`, zwykle `null` — PWZ lekarza leży w `localStorage`, a pole jest puste po jego przyjęciu) i wysyła na nim `input`. Obsługa pola (`Ke`) traktowała puste pole jak niepoprawny PWZ i chowała moduły profesjonalne, w tym pasek `#abxButtonWrapper`. Sekundowe sprawdzenie w `obesity_therapy.js` (`ne`; podobne w `hypertension_therapy.js`) zamykało wtedy otwartą kartę „Leczenie otyłości” — po wczytaniu pacjenta karta zamykała się sama w ciągu sekundy od otwarcia. Wykrył to test DZM-0 (`tests/e2e/otylosc-dziennik-monitor.spec.mjs`); te same kroki na `audyt` bez zmian: karta widoczna zaraz po kliknięciu, po 2,5 s — zamknięta.

```js
// vilda_professional_module.js
//    było:  function Ke(){const n=j.value.trim();if(st(n)){
//    jest:  function Ke(){const n=j.value.trim();/* P-PWZ-ODTWORZENIE … */if(!n&&st(String(fe(X.pwzNumber)||"").trim()))return;if(st(n)){
```

**Granice.** Zmienia się tylko przypadek „puste pole przy zapisanym poprawnym PWZ” (PWZ trafia do `localStorage` dopiero po przyjęciu poprawnego numeru). Wpisywanie numeru, niepoprawny PWZ w polu i brak zapisanego PWZ działają jak dotąd.

## Łatka P-POSTEPY-DZIENNIK — „Postępy” dorosłego z dziennika leczenia (`vilda_auth_ui.js` 569 → 570, 2026-11-19, decyzja właściciela)

Opis działania i przypadki: `docs/clinical/ALGORITHMS.md`, „Postępy dorosłego i listy pacjentów zgodne z dziennikiem leczenia” (P-POSTEPY-DZIENNIK). Zmiany w czytelnych źródłach: `vilda_postepy_doroslego.js` (konflikt wersji wpisu wstrzymuje punkt oceny wg ChPL) i `vilda_cykle_leczenia.js` (`zmianaPrzebiegu`, `POWODY_DOCPRO`, „Poprawka w DocPro” w „Wpisy leczenia”).

```js
// vilda_auth_ui.js
// 1. montaż panelu „Postępy”: punkty z dziennika i rysunek ponawiany po zapisie wpisu
//    było:  …typeof _pdE.scalSerie=="function"){var _pdSer=_pdE.scalSerie({…,punktyLeczenia:s.obesityTherapyPoints}),_pdM=_pdE.analizuj({…,punktyLeczenia:s.obesityTherapyPoints});_pdOk=!!_pdU.renderPanel(Ct,_pdM,{…})}}catch(ct){…}
//    jest:  …typeof _pdE.scalSerie=="function"){/* P-POSTEPY-DZIENNIK … */var _pdRys=function(_pdPkt){var _pdSer=_pdE.scalSerie({…,punktyLeczenia:_pdPkt}),_pdM=_pdE.analizuj({…,punktyLeczenia:_pdPkt});return _pdU.renderPanel(Ct,_pdM,{…})},_pdHost=_pdRys(typeof Ob_dzPunkty=="function"?Ob_dzPunkty(s,GdNotatki):s.obesityTherapyPoints);_pdOk=!!_pdHost;typeof Ob_dzPostepy=="function"&&Ob_dzPostepy(t,Ct,_pdHost,_pdRys)}}catch(ct){…}
// 2. Ob_dz (czytelny blok P-OTYLOSC-DZIENNIK): po ponownym odczycie notatek — powiadomienie słuchaczy
//    było:  rysuj(Dz.zloz(n, migawka));
//    jest:  var nowy = Dz.zloz(n, migawka); rysuj(nowy); Ob_dzPowiadom(t, nowy);
// 3. czytelny blok Ob_dzSluchacze, Ob_dzPunkty, Ob_dzPostepy, Ob_dzPowiadom — za Ob_dz, przed komentarzem Ob_dzk
```

**Granice.** Napisy `_pdE.scalSerie(` i `_pdU.renderPanel(Ct,_pdM,` zostają (pilnuje ich `postepy-doroslego-widok.test.mjs`). Słuchacze zamkniętej karty (kontener odpięty od dokumentu) wypadają przy następnym powiadomieniu. Lint: bez nowych naruszeń (`no-useless-assignment` w limicie).

## Łatka P-TRAJEKTORIA-DZIENNIK — kursy leczenia otyłości z dziennika (`vilda_auth_ui.js` 570 → 571, `vilda_summary_cards.js` 64 → 65, 2026-11-19, decyzja właściciela)

Opis działania i przypadki: `docs/clinical/ALGORITHMS.md`, „Analiza trajektorii i karta porównania z dziennika leczenia” (P-TRAJEKTORIA-DZIENNIK). Czytelne źródło: `vilda_cykle_leczenia.js` (`VildaDziennikOtylosci.punktyWczytanego`, `odswiezWczytanego`, odświeżenie po `zapisz`).

```js
// vilda_auth_ui.js
// 1. pas leczenia otyłości na siatkach Karty
//    było:  ke=function(){var pe=Lt(s.obesityTherapyPoints,"oty\u0142o\u015B\u0107","#b5731a");if(!pe)return null;try{for(var Ga=s.obesityTherapyPoints.filter(
//    jest:  ke=function(){/* P-TRAJEKTORIA-DZIENNIK … */var _dzP=typeof Ob_dzPunkty=="function"?Ob_dzPunkty(s,GdNotatki):s.obesityTherapyPoints,pe=Lt(_dzP,"oty\u0142o\u015B\u0107","#b5731a");if(!pe)return null;try{for(var Ga=_dzP.filter(
// 2. kontekst trajektorii Karty (panel „Analiza trajektorii”, porównanie)
//    było:  _J.buildClinicalContext({ghTherapyPoints:s.ghTherapyPoints,obesityTherapyPoints:s.obesityTherapyPoints,motherHeightCm:_adv.motherHeight
//    jest:  _J.buildClinicalContext({ghTherapyPoints:s.ghTherapyPoints,obesityTherapyPoints:typeof Ob_dzPunkty=="function"?Ob_dzPunkty(s,GdNotatki):s.obesityTherapyPoints,motherHeightCm:_adv.motherHeight

// vilda_summary_cards.js — karta „Porównanie z poprzednim pomiarem”
//    było:  return J.buildClinicalContext({ghTherapyPoints:a.ghTherapyPoints,obesityTherapyPoints:a.obesityTherapyPoints,motherHeightCm:mh?parseFloat(mh.value):NaN,
//    jest:  /* P-TRAJEKTORIA-DZIENNIK … */const _dzP=(function(){try{const Dz=a.VildaDziennikOtylosci;return Dz&&typeof Dz.punktyWczytanego=="function"?Dz.punktyWczytanego():null}catch(e){return null}})();return J.buildClinicalContext({ghTherapyPoints:a.ghTherapyPoints,obesityTherapyPoints:_dzP||a.obesityTherapyPoints,motherHeightCm:mh?parseFloat(mh.value):NaN,
```

**Granice.** `Ob_dzPunkty` i `GdNotatki` — z łatki P-POSTEPY-DZIENNIK (ta sama funkcja Karty). Wywołania przez strażników `typeof`. `window.obesityTherapyPoints` bez zmian.

## Łatka P-WIZYTA-PRZYDZIAL — nadanie wizyty przy otwartym oknie „Niezapisane zmiany” nie jest zmianą formularza (`vilda_save_status_indicator.js` 49 → 50, 2026-11-19)

**Objaw.** Skok z Terminarza do punktu GH pacjenta w DocPro (test `tests/e2e/powloka-panel-obcy-pacjent.spec.mjs`,
„Start z X → skok GH do Y”) co kilka przebiegów kończył się bez wczytania pacjenta. Lekarz odpowiadał w oknie
strażnika „Odrzuć”, a zamiast skoku dostawał „Formularz zmienił się. Wykonaj tę czynność ponownie.”, choć niczego
nie zmieniał.

**Przyczyna.** Decyzja strażnika (`readCurrentDecision`) czyta formularz bez skutków ubocznych
(`captureCurrentUserDataReadOnly`) i nie nadaje wizyty. Autozapis sesji (`vilda_persist_runtime.js`) i sprawdzenia
wskaźnika zapisu wołają zwykłe `collectUserData`, a ono przez `VildaVisitContext.capture` nadaje formularzowi
z danymi pacjenta pierwszą wizytę (`payload.visit`). Gdy to nadanie wypadło po otwarciu okna, odcisk formularza
przy kliknięciu miał dodatkowe `core.visit`. Dokładne porównanie w `isCurrentDecision` uznawało to za zmianę
formularza i strażnik anulował czynność. W DocPro po odtworzeniu sesji nadana wizyta nie ma jeszcze
`patientId`, bo formularz nie jest związany z wczytanym rekordem.

**Zmiana** (czytelny blok, bez ponownej minifikacji): `readCurrentDecision` zapamiętuje chwilę odczytu (`readAt`).
Nowa funkcja `decisionOnlyAllocatedVisit` przyjmuje jedną różnicę i tylko przy spełnieniu wszystkich warunków:

- w decyzji nie było `core.visit`;
- teraz jest wizyta o poprawnym kształcie, `origin: "explicit"`;
- wizyta nie ma pacjenta albo ma pacjenta decyzji;
- wizyta powstała nie wcześniej niż odczyt decyzji;
- po jej usunięciu odcisk jest identyczny.

Używają jej `isCurrentDecision` oraz pierwszy warunek `decisionContentAfterSave`. Pozostałe warunki obu funkcji są
bez zmian: ten sam właściciel, generacja i referencja, a po zapisie — referencja równa bieżącemu odciskowi.
Zmianą formularza pozostają:

- wizyta wczytana (starsza niż decyzja) albo podmieniona;
- wizyta innego pacjenta lub `legacy-inferred`;
- każda edycja pola;
- zmiana konta.

Wyniki, zapis, sesja i sejf bez zmian. Zmienia się tylko to, czy kliknięcie w oknie strażnika jest wykonane, czy
anulowane.

**Regresje.** `tests/unit/save-status-current-decision.test.mjs` uruchamia produkcyjny moduł. Blok
„first visit allocated while the unsaved-changes decision is open” sprawdza:

- przyjęcie nowej wizyty, także bez pacjenta;
- odrzucenie edycji, starszej, obcej i `legacy-inferred` wizyty, podmienionej wizyty, wizyty z pacjentem,
  którego formularz nie ma, oraz zmiany konta;
- zapis z okna po nadaniu.

Bez zmiany trzy przypadki przyjęcia padają. `tests/e2e/powloka-panel-obcy-pacjent.spec.mjs` („skok GH do Y”)
przeszedł lokalnie 48/48 przy 6 równoległych przebiegach. Przed zmianą 2–3 na 12 przebiegów kończyło się
komunikatem „Formularz zmienił się”.

## Łatka P-OTYLOSC-SKOK — z Karty pacjenta prosto do monitora DocPro (`gh_therapy_monitor.js` 63 → 64, `obesity_therapy_monitor.js` 29 → 30, `vilda_cykle_leczenia.js` 7 → 8, `vilda_auth_ui.css` 84 → 85, `inline_docpro_01.css` 5 → 6, 2026-11-19, decyzje właściciela)

Opis działania i przypadki: `docs/clinical/ALGORITHMS.md`, „Leczenie otyłości — etap 2: z Karty pacjenta prosto do
monitora DocPro” (P-OTYLOSC-SKOK). Czytelne źródło Karty: `vilda_cykle_leczenia.js` (`POWODY_KROTKIE`, `powodKrotki`,
`celSkoku`, `doDocPro`; przyciski w `sekcja`). Bez ponownej minifikacji artefaktów.

```js
// gh_therapy_monitor.js — obsługa wpisu vilda:gh-jump (N), czytelne linie
// 1. nowe funkcje przed async function N(): ghJumpObesity(n), ghJumpAsksLoadChoice(n), ghJumpLand(n,loaded)
//    oraz window.vildaGhJumpConsumeSoon=function(){try{setTimeout(N,700)}catch(_){}};
// 2. było:  if(!n||!n.ghPointId){removeExact();return}
//    jest:  if(!n||!n.ghPointId&&!ghJumpObesity(n)){removeExact();return}
// 3. było:  if(!n.patientId){pe(n.ghPointId);removeExact();return}
//    jest:  if(!n.patientId){if(n.ghPointId)pe(n.ghPointId);removeExact();return}
// 4. było:  source:"pick",skipLoadChoice:!0,...operationDetail}
//    jest:  source:"pick",skipLoadChoice:!ghJumpAsksLoadChoice(n),...operationDetail}
// 5. było:  refreshGHTherapyMonitor()}catch{}pe(n.ghPointId)},450)
//    jest:  refreshGHTherapyMonitor()}catch{}ghJumpLand(n,true)},450)
// 6. było:  if(ghJumpCurrent(claim,false))pe(n.ghPointId);
//    jest:  if(ghJumpCurrent(claim,false))ghJumpLand(n,false);

// obesity_therapy_monitor.js — czytelny blok P-OTYLOSC-DZIENNIK
// 1. nowa funkcja Dzprzebieg(id) przed Dzz; w Dzz komunikat po zapisie:
//    było:  Cm("", "Zapisano w dzienniku leczenia — wpis widać w Karcie pacjenta i na innych urządzeniach.");
//    jest:  … + (listy ? " Listy pacjentów zobaczą zmianę po „Zapisz dane”." : "")
// 2. nowy czytelny blok P-OTYLOSC-SKOK przed blokiem P-OTYLOSC-WZROST: Skotworz, Skczekaj, Skpodswietl, Skwypelnij
//    i window.obesityTherapyMonitorSkok(cel) — używa Ee/Ec/Ek/Eg/Cm/Cc/CyS z tego samego zakresu.
```

CSS: w `vilda_auth_ui.css` sekcja `.vdo` (białe tło `--bg`, `.vdo-head > :first-child`, `.vdo .vdo-btn*` z `!important`
przy szczegółowości 0-2-0 — ta sama broń co przyciski Karty przeciw `.liquid-ios26 button` i `.vilda-auth-root
.vilda-auth-btn-*`; odznaki `.vdo-src` i `.vdo-src-pacjent`; telefon ≤ 560 px, przyciski 44 px). W `inline_docpro_01.css`
reguły `.obm-msg.info` i `tr.obm-row-skok` (podświetlenie wiersza klasą, nie stylem na elemencie — P-STYLE krok 5b).
Literały zastąpione tokenami (`--text-strong`, `--line-teal`, `--space-12px`, `--space-14px`; strażnik `css-tokeny`).

**Granice.** Wpis „vilda:gh-jump” bez pola `obesity` działa dokładnie jak dotąd (skok do punktu GH): wyciszone okno
wyboru i `pe(ghPointId)`. Pole `obesity` niesie wyłącznie `{tryb, entryId}` — bez danych klinicznych (zwykły
`sessionStorage` nie przechowuje treści pacjenta; dane usuniętego wpisu monitor czyta z dziennika po `entryId`).
Identyfikator pacjenta w tym wpisie — jak w dotychczasowym skoku do punktu GH (alert CodeQL „Clear text storage”
w PR vildaclinic/vilda-calc#1003 — do decyzji właściciela). Karta na innej stronie niż DocPro zostaje otwarta (jak przy skoku GH); nad DocPro — zamyka się
(`VildaAuthUI.hide`), a skok rusza po `popstate` z jej `history.back()` albo po 600 ms. Sejf i dziennik bez zmian;
`window.obesityTherapyPoints` zmienia się tylko przez zapis lekarza w monitorze.

## Łatka P-OTYLOSC-LEK — Karta porównuje lek jak listy pacjentów (`vilda_cykle_leczenia.js` 8 → 9, `obesity_therapy_monitor.js` 30 → 31, 2026-11-19, decyzja właściciela)

Czytelne źródło: `vilda_cykle_leczenia.js` — `kluczLeku` rozpoznaje lek przez `ObesityResponseCriteria.resolveDrug`
(jak `drugKey` list w sejfie i kryteria ChPL); bez modułu kryteriów — dawny tekst leku i substancji. `zmianaPrzebiegu`
traci parametr `opcje` (i `kluczNazwyLeku`). Opis reguły: `docs/clinical/ALGORITHMS.md`, wpis P-OTYLOSC-LEK.

```
// obesity_therapy_monitor.js — czytelny blok P-OTYLOSC-DZIENNIK, funkcja Dzprzebieg(id)
// było:  return w ? D.zmianaPrzebiegu(Dzs, w, { lekPoNazwie: true }) : null;
// jest:  return w ? D.zmianaPrzebiegu(Dzs, w) : null;
```

**Granice.** Sejf, dziennik i zapis bez zmian. Wersje `?v=`, precache i `SW_VERSION` ustawił `npm run podbij-wersje`.

## Łatka P-OTYLOSC-DAWKA — dawka z przecinkiem i podpowiedzi z ChPL (`vilda_cykle_leczenia.js` 9 → 10, `obesity_therapy_monitor.js` 31 → 32, `obesity_therapy.js` 12 → 13, `vilda_auth_ui.js` 572 → 573, `inline_docpro_01.css` 6 → 7, `docpro.html`, 2026-11-19, decyzja właściciela)

Czytelne źródło: `vilda_cykle_leczenia.js` — `dawkaPL` i `podpowiedziDawek` (eksport `VildaDziennikOtylosci`),
wiersze „Wpisy leczenia”, okno wersji i podstawienie dawki w oknie „+ Kontynuacja”. Opis: `docs/clinical/ALGORITHMS.md`,
wpis P-OTYLOSC-DAWKA.

```
// obesity_therapy.js — fe() (lista leku w monitorze): opcja niesie tabelę zwiększania dawki i częstość
// było:  d.setAttribute("data-substance",s.substanceLabel),g.appendChild(d)
// jest:  d.setAttribute("data-substance",s.substanceLabel),d.setAttribute("data-dawki",JSON.stringify((r.dosing&&
//        r.dosing.escalation||[]).map(function(x){return{label:x.label||"",dose:x.dose||"",note:x.note||""}}))),
//        d.setAttribute("data-czestosc",r.frequency||""),g.appendChild(d)

// obesity_therapy_monitor.js
// 1. nowy czytelny blok P-OTYLOSC-DAWKA przed blokiem P-OTYLOSC-WZROST: Dwpl, Dwzaznacz, Dwinit, Dwpodp;
// 2. było:  function CyS(){typeof Hl=="function"&&Hl();
//    jest:  function CyS(){typeof Hl=="function"&&Hl();typeof Dwpodp=="function"&&Dwpodp();
// 3. kolumna „Dawka” w tabeli punktów — było: P(i.dose?String(i.dose):"\u2014")  jest: P(i.dose?Dwpl(i.dose):"\u2014")

// vilda_auth_ui.js — podsumowanie „Leczenie otyłości” (funkcja Cl)
// 1. przed function Cl(t){…} nowa funkcja Ob_dawka(t) (VildaDziennikOtylosci.dawkaPL, bez modułu — tekst bez zmian);
// 2. było:  p=d.dose!=null&&String(d.dose).trim()!==""?String(d.dose):"\u2014"
//    jest:  p=d.dose!=null&&String(d.dose).trim()!==""?Ob_dawka(d.dose):"\u2014"
```

`docpro.html`: pod siatką pól monitora `<div id="obesityDoseHints" class="obm-dawki" role="group" aria-label="Podpowiedzi
dawki" hidden>`. `inline_docpro_01.css`: reguły `.obm-dawki*` — przyciski z `!important` przy szczegółowości 1-2-0
przeciw `.liquid-ios26 button {…!important}` i regułom przycisków na telefonie (≤ 560 px: 44 px).

**Granice.** Zapis dawki, sejf i dziennik bez zmian; bez stylów ustawianych wprost na elementach (`hidden`, klasy,
`aria-pressed`). Wersje `?v=`, precache i `SW_VERSION` ustawił `npm run podbij-wersje`.

## Łatka P-OTYLOSC-SIATKI — pomiary z dziennika na siatkach i w analizie trajektorii Karty (`vilda_cykle_leczenia.js` 10 → 11, `vilda_trajectory_analysis.js` 45 → 46, `vilda_auth_ui.js` 573 → 574, `vilda_auth_ui.css` 85 → 86, 2026-11-19, decyzje właściciela)

Czytelne źródła: `vilda_cykle_leczenia.js` — `pomiaryDoSiatek` (eksport `VildaDziennikOtylosci`);
`vilda_trajectory_analysis.js` — `buildPoints` (źródło masy i wzrostu punktu), `analyzeMetric` (`odPacjenta`),
`metaStripHtml` (żeton), `patientMetricCardHtml` (podpis), style `.vtap-pac*`; `vilda_auth_ui.js` — czytelny blok
P-OTYLOSC-SIATKI po `Ob_dzPowiadom`: `Ob_dzSiatki`, `Ob_zrMetryki`, `Ob_dzMaPacjenta`, `Ob_dzRysujPunkty`,
`Ob_dzLegendaPac`, `Ob_dzLegenda`, `Ob_dzSiatkiSluchaj`. Opis: `docs/clinical/ALGORITHMS.md`, wpis P-OTYLOSC-SIATKI.

```
// vilda_auth_ui.js — showPatientCard (zakładka „Siatki centylowe”)
// 1. po liście pomiarów H:  …H=(k.measurements||[]).filter(…)} + var GdHWizyty=H,GdDzPunktyAkt=null,GdHSiatki=H;
// 2. było:  function we(){oe(ae),Ht=0;
//    jest:  function we(){var H=…Ob_dzSiatki(GdHWizyty,GdDzPunktyAkt||Ob_dzPunkty(s,GdNotatki),{ageMonths:I,weight:M,
//           height:D,sex:it})…;GdHSiatki=H;Ob_dzLegenda(Ct,H);oe(ae),Ht=0;      (lokalne H — wszystkie użycia w we())
// 3. wiek bieżącego pomiaru: var On=(H||[]).map(…Ma…) → var On=(GdHWizyty||[]).map(…Ma…)
// 4. przed ae._vildaAgeWin=…: Ob_dzSiatkiSluchaj(t,Ct,function(Gs){GdDzPunktyAkt=Gs.punkty;we()});
// 5. _tjm (wejście analizy): …weight:pe.weight} → …weight:pe.weight,zrodloMasy:pe.zrodloMasy,zrodloWzrostu:pe.zrodloWzrostu}
// 6. legenda: " pomiary pacjenta" → " pomiary w gabinecie" + Ob_dzLegendaPac(GdHSiatki)
// vilda_auth_ui.js — yn (siatka)
// 7. H.push({age:E,val:g}) → H.push({age:E,val:g,zr:Ob_zrMetryki(j,t)})
// 8. var ut=Yo(H,y,x)… ut.forEach(zakres) → Yo(H bez „pacjent”)… ut.concat(wt).forEach(zakres)
// 9. return wt.forEach(function(j,E){…circle…}) → return Ob_dzRysujPunkty(f,wt,Q,mt,u)
// 10. _vildaScale.pts: {x,val} → {x,val,zr}
// vilda_auth_ui.js — vildaSiatkaCrosshair (dymek i porównanie)
// 11. po visitVal: nowe visitZr(it,vbx) i pacCmp(a,b); wiersz dymka + odznaka .vilda-tip-pac; nagłówek „◇ od pacjenta”
// 12. statAt: punkt od pacjenta bez tej metryki → null („— brak pomiaru w tym punkcie”, bez wartości z linii)
// 13. panel.innerHTML=head+ctxH+… → head+ctxH+pacCmp(a,b)+…; style .vilda-tip-pac, .vilda-cmp-ctx.vilda-cmp-pac
```

`vilda_auth_ui.css`: `.vilda-patient-legend-item.vilda-legend-pac[hidden]` i odstęp rombu w legendzie.

**Granice.** `H` poza `we()` zostaje listą wizyt: kafelek tempa w „Status” (`hvSdsKafelek`) i PDF siatek bez zmian.
Sejf, dziennik i zapis bez zmian. Wersje `?v=`, precache i `SW_VERSION` ustawił `npm run podbij-wersje`.

## Łatka P-OTYLOSC-STRONA — pomiary od pacjenta w całej aplikacji (temat D; `vilda_cykle_leczenia.js` 11 → 12, `vilda_centile_live_data.js` 8 → 9, `vilda_centile_live_render.js` 5 → 6, `vilda_centile_live_view.js` 5 → 6, `vilda_centile_live_colors.js` 2 → 3, `vilda_centile_live_preview.js` 3 → 4, `vilda_centile_live_panel.css` 7 → 8, `vilda_professional_summary.js` 2 → 3, `vilda_professional_summary.css` 3 → 4, `vilda_adv_history_collapse.js` 2 → 3, `vilda_trajectory_analysis.js` 47 → 48, `vilda_advanced_growth.js` 82 → 83, `vilda_summary_cards.js` 65 → 66, `inline_index_04.js` 29 → 30, `inline_index_00.css` 3 → 4, `style.css` 96 → 97, `index.html`, 2026-11-20, makieta zaakceptowana przez właściciela)

Opis działania, przypadki i wpływ kliniczny: `docs/clinical/ALGORITHMS.md`, wpis P-OTYLOSC-STRONA. Zmiany wprost
w artefaktach; nic nie przebudowano ani nie minifikowano ponownie.

Czytelne źródła:
- `vilda_cykle_leczenia.js` (eksport `VildaDziennikOtylosci`): `pomiaryStrony` (dziennik pacjenta strony →
  `pomiaryDoSiatek`, opcje `patientId`, `doWiekuMies`), `zrodloMetryki`, `pomiaryOdcinka`, `opisMasyOdPacjenta`,
  `opisOdcinka`, `rysujPdf` (romby, kropki i legenda na stronie PDF);
- `vilda_centile_live_data.js` — `reportedMeasurements` (pole migawki `reportedMeasurements`, tylko do rysowania),
  nasłuch `vilda:therapy-points-changed` (`source: 'obesity-dziennik'`);
- `vilda_centile_live_render.js` — `reportedFor` (pole `reported` siatki), `probe` czyta punkt z dziennika w jego wieku;
- `vilda_centile_live_colors.js` — `drawReported`, warstwa pełnoekranowa (`fullLayer`) rysuje romby i omija je etykietą;
- `vilda_centile_live_preview.js` — romby w podglądzie, przeszkody dla etykiety bieżącego pomiaru;
- `vilda_centile_live_view.js` — legenda „dane z gabinetu” / „dane od pacjenta” (licznik ustępuje miejsca), dymek
  „◇ od pacjenta · wiek”, „Waga 74,6 kg”, data; kursor i strzałki przeskakują także na pomiary z dziennika;
- `vilda_professional_summary.js` — `laterPatientWeight`, `reportedWeightNode` (linijka w wierszu „Waga”), odświeżenie
  karty po zmianie dziennika;
- `vilda_cykle_leczenia.js` — trzecia część pliku, `window.VildaAdvDziennik`: bloki tylko do odczytu `.adv-dz-row`
  w `#advMeasurements` (tylko lista z nagłówkiem `#advHistoryToggle`, strona główna). Nie osobny plik: nowy wpis
  precache przekroczyłby budżet instalacji SW (600 żądań, `tests/unit/sw-precache-stron.test.mjs`);
  `vilda_adv_history_collapse.js` — `blokiDziennika` (liczy bloki do nagłówka, ich nie tworzy);
- `vilda_trajectory_analysis.js` — `zDziennikiemStrony`, `analyze` przy `input.dziennikStrony`.

Wstawki w plikach zminifikowanych:

```
// vilda_advanced_growth.js — wejście analizy trajektorii karty zaawansowanej
//    było:  TJ9=window.VildaTrajectoryAnalysis.analyze({measurements:or,
//    jest:  TJ9=window.VildaTrajectoryAnalysis.analyze({dziennikStrony:!0,measurements:or,
// vilda_summary_cards.js — karta „Porównanie z poprzednim pomiarem”
// 1. żetony:  …'<span id="porownanieKontekst" …></span>');
//      jest:  …'<span id="porownanieKontekst" …></span>','<span id="porownaniePacjent" class="porownanie-chip porownanie-chip--pacjent" hidden></span>');
// 2. updatePrevSummaryDiff: kEl=…("porownanieKontekst"),pEl=…("porownaniePacjent"),…;pEl&&(pEl.hidden=!0,pEl.textContent="");
// 3. po pasku „kontekst:”: const Sd_dzOdc=Dz.pomiaryOdcinka([{ageMonths:t.ageMonths,weight:t.weightKg},{ageMonths:A*12,weight:s}],t.ageMonths,A*12),
//    Sd_romb=…; żeton: romb + Dz.opisOdcinka(n)
// 4. wiersz: po podpisie „Dziś” — w.klucz==="masa": span.pt-s.pt-pacjent (romb + Dz.opisMasyOdPacjenta(ostatni))
// inline_index_04.js — buildCentilePageCanvas / generateCentileChart
// 1. parametry:  …legacyLayout:__legacyLayout}){  →  …legacyLayout:__legacyLayout,pomiaryDziennika:__dz04}){
// 2. po serii wagi (przed „wagaiwzrost.pl”): (function(){if(__dz04!==!0)return;…Dz.rysujPdf(n,{minX:e,maxX:t,
//    height:{px:220,py:me+80,pw:ce-220,ph:ue-160,minY:w,maxY:A},weight:{px:220,py:Ge+80,pw:ce-220,ph:Ae-160,minY:M,maxY:u},
//    legend:{x:oe/2,y:le-24},current:{ageMonths:_,weight:X,height:ne},measurements:advancedGrowthData.measurements})})(),
// 3. generateCentileChart: …suppressSummaryBox:!!t}) → …suppressSummaryBox:!!t,pomiaryDziennika:!t})
//    (siatka „zewnętrzna” — inne dane niż pacjent strony — i producenci modelOnly nie rysują dziennika)
```

`index.html`: `<span id="advHistoryPatient" class="porownanie-chip adv-history-patient" hidden>` obok licznika
„Poprzednich pomiarów”. CSS: `vilda_centile_live_panel.css` (klucz kropki i rombu,
data w dymku), `vilda_professional_summary.css` (`.professional-summary-reported`), `inline_index_00.css` (`.adv-dz-*`,
`.adv-history-patient`, `#advResults .vtap-pac-l` schowany jak na makiecie), `style.css` (`.porownanie-chip--pacjent`,
`.vilda-romb-pacjent`, `.pt-s.pt-pacjent`).

**Granice.** Sejf, dziennik, zapis wizyty, autozapis i `collectAdvancedMeasurements()` bez zmian — pomiary z dziennika
są tylko rysowane i pokazywane. Bez zmian: Karta pacjenta (temat C), DocPro, siatka Palczewskiej 1–18 lat i strona
„standardowa” PDF, karta „Obliczenia wzrostowe” (tryb podstawowy). Wersje `?v=`, precache i `SW_VERSION` ustawił
`npm run podbij-wersje`.

## Łatka P-E2-MENARCHE — estradiol poniżej 18 lat: zakresy dorosłych po 5 latach od menarche (`lab_units_data.js` 42 → 43, `lab_unit_converter.js` 10 → 11, `vilda_lab_packages.js` 10 → 11, `inline_przelicznik_jednostek_00.css` 17 → 18, `przelicznik-jednostek.html`, 2026-11-19, decyzje właściciela)

Opis działania, przypadki, dowody i ograniczenia: `docs/clinical/ALGORITHMS.md`, wpis „LAB-E2-MENARCHE”. Zmiany wprowadzono wprost w artefaktach, czytelnymi blokami; żadnego pliku nie przebudowano z dawnych źródeł ani nie minifikowano ponownie.

`lab_units_data.js` — tylko czytelny blok polityki w deskryptorze estradiolu (plik poza nim pozostaje zminifikowany i bez zmian):

```js
reference_selection_policy: {
  id: 'estradiol-matched-reference-only',
  version: '2026-11-19.1',               // było '2026-10-28.1'
  // require_matched, chronological_age, context_pl, adult_female_context — bez zmian
  gynecological_age: {                    // nowy blok: próg, zakres wieku menarche, wybory i teksty jako dane
    id: 'e2-gynecological-age-qualification', when: { sex: 'F' }, menarche_key: 'menarche_age_years',
    menarche_min_years: 2, menarche_max_years: 20, adult_context_after_years: 5,
    adult_context_min_menarche_years: 8,  // R9 (decyzja nr 5): najniższy wiek menarche, od którego reguła działa — osobno od zakresu wpisu 2–20
    contexts_not_applicable_below_adult_age: ['postmenopause'],
    pregnancy_contexts: ['pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3'],
    context_pl: '…', basis_pl: 'Od menarche: {years} lat (≥\u00a0{threshold}) — …', source_note: '…'
  }
}
```

Wiersze `reference_ranges_si`, jednostki, `default_range_si` i `LabUnitsData.version` (2.0.2) są nietknięte — pilnuje tego skrót danych w `tests/fixtures/lab-selection-inne-badania-baza.json`.

`lab_unit_converter.js` — czytelne funkcje dopisane przed `copyContextReference` (część czytelna pliku): `listed`, `knownBelowAdultAge`, `yearsDownText`, `gynecologicalAge`, `gynecologicalBasisText`, `qualifyGynecologicalAge`, `markGynecologicalBasis`, `copyReferenceBasis`, `sharedPhasePolicy`, `referenceContext`; `selectContextReference` dostał trzeci argument `minor`. Stan reguły (`gynecologicalAge`) ma pole `early` — menarche poniżej `adult_context_min_menarche_years` nie kwalifikuje; `referenceContext` oddaje tę granicę i powód braku kwalifikacji (`not_qualified_reason`: `menarche_not_recorded`, `below_gynecological_age`, `menarche_before_min_age`). W zminifikowanym wierszu cztery wstawki:

```js
// U() = selectRange:
//    było:  e=qualifiedAge.patient;var qualifiedContext=selectContextReference(r,e);
//    jest:  e=qualifiedAge.patient;var gynecological=qualifyGynecologicalAge(r,e);e=gynecological.patient;var qualifiedContext=selectContextReference(r,e,gynecological.minor);
// $() = evaluate:
//    było:  copyContextReference(l,o);return o?(
//    jest:  copyContextReference(l,o);copyReferenceBasis(l,o);return o?(
// obiekt API:
//    było:  selectRange:U,rangesForOverride:C,                       …version:"2.0.3"
//    jest:  selectRange:U,referenceContext:referenceContext,rangesForOverride:C,   …version:"2.0.4"
```

Dla każdego badania poza estradiolem `selectRange` i `evaluate` dają wyniki identyczne jak przed zmianą (macierz 33 badań × 4992 kontekstów, `tests/unit/lab-e2-menarche.test.mjs`).

`vilda_lab_packages.js` (czytelne źródło, model 1.7.0 → 1.8.0, widok 1.9.0 → 1.10.0): `evaluateRow` zapamiętuje w `row.contextBasis` zdanie silnika `evaluation.reference_basis_pl`, gdy wynik wymaga kontekstu badania; `drawCard` rysuje je drugą notą `.lab-pkg-card-note` pod zdaniem o kontekście i uwzględnia w podpisie przerysowania karty. Gałąź `if (!view.lab) { … }` dostała klamry, żeby `else if (view.replaced)` nadal należało do niej (nota o zastąpionym badaniu bez zmian).

`przelicznik-jednostek.html` (czytelny skrypt strony):

```js
// markup panelu „zmień”: <label id="labOverrideMenarcheWrap" hidden>Wiek menarche [lata] <input type="text" id="labOverrideMenarcheAge" inputmode="decimal" …>
//                        <p id="labOverrideMenarcheNote" class="lab-override-note" role="status" hidden>
// readPubertyPatientContext: context.menarcheAgeYears — tylko gdy wiek menarche jest wpisany (ta sama kolejność źródeł co początek pokwitania)
// applyMenarcheAge(p, source, local): p.menarche_age_years (pole lokalne > dane), p._shared_menarche, p._menarche_overridden;
//    local: null = pole puste, liczba = wpis, NaN = wpis, który nie jest zwykłą liczbą dziesiętną (zastępuje dane, silnik go nie przyjmie);
//    wołane w bloku estradiolu getEffectivePatient (z localOverride.menarche) i getPackagePatient (bez wpisu lokalnego)
// referenceContextFor(pacjent) → LabUnitConverter.referenceContext(wybrane badanie, pacjent)
// applyReferenceAvailability(p) — ostatni krok getEffectivePatient, jedno miejsce dla wszystkich odbiorców pacjenta:
//    wybór fazy niedostępny wg silnika → p.cycle_phase = null (zapamiętany localOverride.cycle_phase zostaje);
//    p._menarche_applied (wpis dotyczy badania i pacjentki i silnik go przyjął) oraz p._has_override
// localOverride.menarche: czyszczone w resetLocalPatientOverride, przy zmianie płci w updateLifespan i dla płci M w onOverrideChange
// describePatient: CYCLE_PHASE_SUMMARY (ciąża słowami); „menarche 11,0” (formatMenarcheAge) tylko przy p._menarche_applied
// buildClinicalHint: wiersz reference.basis_pl (+ dopisek o „Zmień ▼" przy nieznanej fazie)
// przed renderPatientSummary: overrideNumberTyping, commitCyclePhaseAvailability, renderCyclePhaseOptions, renderMenarcheOverrideState
//    (nota R9 „…menarche przed ukończeniem 8 lat (3,0)…” wybierana po reference.not_qualified_reason; liczba 8 z odpowiedzi silnika)
// renderPatientSummary: commitCyclePhaseAvailability() PRZED wcześniejszym powrotem dla badań z własnym formularzem
//    (LH, FSH, inhibina B, testosteron) — poza odświeżeniem w trakcie wpisywania liczby
// onOverrideChange(event): wpis pola — po obcięciu spacji /^\d+(?:[.,]\d{0,2})?$/ (sam separator na końcu = niedokończony zapis liczby całkowitej), inaczej NaN; zdarzenie „input”
//    ustawia overrideNumberTyping na czas odświeżenia (zapamiętany wybór fazy i jego opcja zostają)
// onOverrideNumberCommitted: „change” i „blur” pól wieku, miesięcy i wieku menarche → tylko renderPatientSummary()
//    (zatwierdza wybór i odświeża opis; nie rysuje wyniku, żeby kliknięcie w wynik po wyjściu z pola nie ginęło)
```

Strona nie ma kopii reguły: próg, granicę wieku, zakres wieku menarche i listę niedostępnych wyborów bierze z odpowiedzi `LabUnitConverter.referenceContext`.

`inline_przelicznik_jednostek_00.css` — jedna reguła, bo etykieta panelu ma własne `display`:

```css
.lab-patient-override label[hidden],
.lab-patient-override .lab-override-note[hidden] { display: none; }
```

**Granice.** Bez nowych stylów ustawianych wprost na elementach (`tests/fixtures/style-elementow.json` bez zmian: nowe pole i nota chowają się atrybutem `hidden`). `vilda_lab_range_snapshot.js` i `vilda_vault.js` bez zmian — format zapisanego zakresu się nie zmienił, a dawne zapisy nie są przeliczane. Wersje `?v=`, precache i `SW_VERSION` ustawił `npm run podbij-wersje`.

## Łatka P-KARTA-LECZENIE, etap 1 — zakładka „Leczenie” i pasek leczenia (`vilda_auth_ui.js` 574 → 575, `vilda_auth_ui.css` 86 → 87, 2026-11-20, decyzje właściciela)

Czytelne źródło: `vilda_auth_ui.js` — nowy czytelny blok P-KARTA-LECZENIE zaraz po funkcji `jl` (przed `function Pl(`):
`Kl_IKONA`, `Kl_zakladka` (biała lista: „leczenie” bez zakładki → „antro”), `Kl_daneGh`, `Kl_daneOb` (części paska
z obiektów wyjściowych bloków), `Kl_kolejnosc` (D2), `Kl_ustaw`/`Kl_miesci`/`Kl_krok`/`Kl_dopasuj` (jedna/dwie linie,
stopnie tekstu klasami `vilda-kl-pasek--r1…r3`, odrzucanie ostatnich części), `Kl_pasek` (przycisk), `Kl_przewin`
(przewinięcie kontenera Karty) i `Kl_leczenie` (zakładka, treść, paski; obserwator rozmiaru pasków). Czytelna `Ob_dz`
dostaje 7. argument `Kl_po`. Gdy blok rzuci wyjątek (`czesci` w `Ob_dz`, `wl`/`kl` w `Kl_leczenie`), jego obiekt
wyjściowy jest czyszczony — pasek nie pokazuje wartości ani oceny bloku, który się nie narysował (`Ob_b` wypełnia
wyjście przed wykresem). Opis: `docs/clinical/ALGORITHMS.md`, wpis P-KARTA-LECZENIE; plan: `docs/KARTA_LECZENIE_PLAN.md`.

```
// vilda_auth_ui.js — wl (podsumowanie GH): obiekt wyjściowy
// 1. function wl(t){ → function wl(t,Kl_wy){
// 2. przed v=e("div",{class:"vilda-gh-summary-head"},…): Kl_odz=s?"Leczony IGF-1 (mekasermina)":"Leczony hormonem wzrostu (rhGH)",
//    Kl_st=o?"leczenie zako\u0144czone":"aktywne", — odznaka i znacznik stanu używają Kl_odz i Kl_st (teksty bez zmian)
// 3. return e("div",{class:"vilda-gh-summary"},…) → return Kl_wy&&(Kl_wy.odznaka=Kl_odz,Kl_wy.stan=Kl_st,
//    Kl_wy.zakonczone=!!o,Kl_wy.dawka=u==="\u2014"?"":u),e("div",{class:"vilda-gh-summary"},…)
// vilda_auth_ui.js — kl (Dane analityczne GH)
// 4. function kl(t,a,n,r,o){ → function kl(t,a,n,r,o,Kl_wy){
// 5. po var z=y!=null&&x!=null?x-y:null; : Kl_wy&&(Kl_wy.czas=Gk&&W>0?W+" mies.":"",
//    Kl_wy.tempo=F!=null&&!(Fo&&Fo.krotki)?qt(F,1)+" cm/rok":"",Kl_wy.dhsds=z!=null?be(z,"",2):"");
// vilda_auth_ui.js — Cl (podsumowanie otyłości)
// 6. function Cl(t){ → function Cl(t,Kl_wy){; Kl_odz/Kl_st przed y=e("div",{class:"vilda-gh-summary-head"},…) jak w 2.;
//    return …[y,x,Ob_h,Ob_z,Ob_u]) → return Kl_wy&&(…,Kl_wy.dawka=p==="\u2014"?"":p),e(…)
// vilda_auth_ui.js — Ml / Ob_b (Dane analityczne — otyłość)
// 7. function Ml(t,a,n,Ob_dzs){ → function Ml(t,a,n,Ob_dzs,Kl_wy){; function Ob_b(Ob_m){var o=… →
//    function Ob_b(Ob_m,Kl_out){var Kl_red=null,Kl_rv,Kl_k,o=…
// 8. kafelek „Redukcja do oceny”: wartość zapamiętana (…"Redukcja do oceny",Kl_rv=K!=null?…), po nim
//    ,Kl_red=ot[ot.length-1],ot.push(fe("","Pr\xF3g ChPL",… (liczba ot.push(fe( bez zmian — strażnik R6)
// 9. werdykty „przed oknem”, „wystarczająca”, „niewystarczająca”: krotko:Kl_k="oce\u0144 po "+L,
//    title:"Przed oknem oceny \u2014 "+Kl_k (analogicznie „kontynuowa\u0107 leczenie”,
//    „wg ChPL odstawi\u0107 i ponownie oceni\u0107”) — tytuły bez zmian, budowane z krótkiej formy
// 10. przed var lt=ot.slice(); : Kl_out&&(Kl_out.czas=Ob_g&&D!=="\u2014"?D+" "+M:"",
//     Kl_out.redukcja=Kl_red&&ot.indexOf(Kl_red)>=0&&K!=null?{miara:P,tekst:Kl_rv}:null,
//     Kl_out.ocena=!Ob_m.end&&gt&&gt.krotko?{cls:gt.cls,ic:gt.ic,tekst:gt.krotko}:null);
// 11. Ob_b(Ob_C[Ob_C.length-1]) → Ob_b(Ob_C[Ob_C.length-1],Kl_wy) (przełącznik cykli woła Ob_b(l) bez wyjścia)
// vilda_auth_ui.js — jl (karta „wg notatek”)
// 12. function jl(t,a){ → function jl(t,a,Kl_n,Kl_wy){; z tablicą notatek Kl_n karta powstaje od razu (wewnętrzna
//     Kl_buduj — dawne ciało .then(function(l){…})), bez niej — jak dotąd po odczycie notatek z sejfu;
//     Kl_odz/Kl_st przed h=e("div",{class:"vilda-gh-summary-head"},…); wyjście: odznaka, stan, zakonczone=!p, dawka
// vilda_auth_ui.js — showPatientCard (se)
// 13. przed Ft=e("div",{class:"vilda-patient-tabs",…}): KlL=Kl_leczenie({patientId:t,rekord:s,plec:S,zaawansowane:y,
//     siatka:h,notatki:GdNotatki,user:m,zakladka:at(Kl_IKONA,"Leczenie")}); lista zakładek [Et,KlL?KlL.zakladka:null,Bt,…]
// 14. ua(): [Et,KlL&&KlL.zakladka,Bt,…].filter(Boolean) i [Nt,KlL&&KlL.tresc,Ct,…].filter(Boolean)
// 15. przed CarePatientTab.addEventListener(…): KlL&&KlL.zakladka.addEventListener("click",function(){ua("leczenie");
//     ia({screen:"card",patientId:t,tab:"leczenie"})});
// 16. biała lista activeTab: …==="antro"||r.activeTab==="leczenie"&&KlL||…; Ka.tab: Kl_zakladka(r&&r.activeTab,KlL)||"antro";
//     xa.restoreTab: ua(Kl_zakladka(ct,KlL)||"antro")
// 17. Cs: trzy wywołania wl/kl/Ob_dz nad Ft → KlL?KlL.paski:null,Ft,Nt,KlL?KlL.tresc:null,Ct,…
// vilda_auth_ui.js — Ob_dzNotatki (czytelne)
// 18. button[data-tab="antro"] → button[data-tab="leczenie"] (zapas: "antro"); sekcja.scrollIntoView(…) → Kl_przewin(sekcja)
```

`vilda_auth_ui.css`: rozdział „P-KARTA-LECZENIE, etap 1” na końcu pliku — `.vilda-kl-paski`/`.vilda-kl-gh`
(`display: contents`), `.vilda-kl-tresc` (kolumna z odstępem 18 px jak Karta), `.vilda-kl-pasek*` i `.vilda-kl-pigulka*`
(kolory podsumowania i pola oceny; `!important` przy szczegółowości 0-2-0 jak `.vilda-gha-btn`), `--dwie` (dwie linie),
`--r1…--r3` (stopnie tekstu), siedem zakładek z zawijaniem w wierszu (`.vilda-patient-tabs:has(>…[data-tab=leczenie])`).

**Granice.** Bez nowego pliku ładowanego przez strony; `vilda_cykle_leczenia.js` i `obesity_response_criteria.js` bez
zmian; sejf, dziennik, zapis i synchronizacja bez zmian; style tylko klasami (bez stylów wpisanych w elementy). Klasy,
których szukają testy i moduły (`.vdo`, `.vilda-gha-btn`, `.vilda-gh-summary`, `.vilda-oba-verdict`, `.vilda-ob-dz`),
bez zmian; pasek ma własne klasy (`.vilda-kl-*`), żeby lokatory bloków nie trafiały w pasek. Wersje `?v=`, precache
i `SW_VERSION` ustawił `npm run podbij-wersje`.

## Łatka P-GH-WZNOWIENIE, część 1 — kursy GH od wznowienia w Karcie (`vilda_auth_ui.js` 575 → 576, `growth-basic-module.js` 24 → 25, 2026-11-20, decyzje właściciela)

Czytelne źródło reguły: `vilda_trajectory_analysis.js` — `ghKursy` (eksport `VildaTrajectoryAnalysis.ghKursy`; z niej
`therapyIntervals`), `kursyZPrzerwa` (dawna reguła, już tylko zapas kursów otyłości). W `vilda_auth_ui.js` nowy czytelny
blok P-GH-WZNOWIENIE zaraz po funkcji `jl` (przed blokiem P-KARTA-LECZENIE): `Gw_BEZ_WLACZENIA`, `Gw_kursy` (kursy
z modułu trajektorii; bez modułu — null), `Gw_biezacy` (bieżący kurs przy > 1 kursie, inaczej null — Karta liczy jak
dotąd), `Gw_znacznik` („kurs k z N”, wygląd „cykl k z N” z `Ob_css`), `Gw_infoW2` (treść ramki W2), `Gw_wgWieku`
(punkty wg wieku, stabilnie), `Gw_pasy` (pas na kurs; jeden kurs — z punktów wg wieku), `Gw_numerKursu` (numer kursu
punktu trendu), `Gw_punktyProgramu` (program trendu z bieżącego kursu; jeden kurs — z punktów wg wieku). Opis:
`docs/clinical/ALGORITHMS.md`, wpis P-GH-WZNOWIENIE, część 1.

```
// vilda_auth_ui.js — wl (podsumowanie GH)
// 1. pętla Włączenia/Zakończenia po posortowanych n (było: po tablicy a); po niej:
//    var Gw=Gw_biezacy(a),Gw_p=Gw?Gw.kurs.punkty:n;Gw&&(r=Gw.kurs.wlaczenie,o=Gw.kurs.b!=null?Gw_p[Gw_p.length-1]:null);
//    var Gs=r;r||(r=Gw_p[0]);                                         (było: var Gs=r;r||(r=n[0]);)
// 2. znacznik stanu: …text:Kl_st})]) → …text:Kl_st}),Gw?Gw_znacznik(Gw):null])
// 3. h("Punkty kontrolne",String(a.length)) → h("Punkty kontrolne",Gw?Gw_p.length+" w kursie ("+a.length+" łącznie)":String(a.length))
// 4. ramka P-GH-BEZ-STARTU: text:"Brak punktu włączenia…" → text:Gw?Gw_infoW2(Gw):"Brak punktu włączenia…"
// vilda_auth_ui.js — kl (Dane analityczne GH)
// 5. pętla Włączenia po posortowanych d (było: po tablicy l); po niej:
//    var Gw=Gw_biezacy(l),Gw_d=d,Gw_w2=!!Gw&&Gw.bezWlaczenia;Gw&&(d=Gw.kurs.punkty.slice(),l=d,c=Gw.kurs.wlaczenie);
// 6. var w=u!=null&&h!=null?h-u:null → var w=!Gw_w2&&u!=null&&h!=null?h-u:null; etykieta „Przyrost od Włączenia”
//    i podpis Gw_BEZ_WLACZENIA przy W2
// 7. var z=y!=null&&x!=null?x-y:null; → var z=!Gw_w2&&y!=null&&x!=null?x-y:null; podpis ΔhSDS Gw_BEZ_WLACZENIA przy W2
// 8. „Wiek kostny (ost.)”: pętla po Gw_d (cała historia, jak dotąd) zamiast d
// 9. createTextNode("Wzrastanie") → createTextNode("Wzrastanie"+(Gw?" — kurs "+Gw.numer+" z "+Gw.liczba:""))
// vilda_auth_ui.js — Pl (Trend leczenia GH), ml i gl (wykresy)
// 10. var l=[] → var l=[],Gw_nr=Gw_numerKursu(a); w punkcie trendu: var Gw_n=Gw_nr(u);Gw_n!==void 0&&(h.Gw_kurs=Gw_n)
// 11. program: pętla po Gw_punktyProgramu(a) zamiast a
// 12. ml: else if(P.Gw_kurs!==t[L-1].Gw_kurs)K+=" M "+… (linia dawki przerwana między kursami)
// 13. gl: if(!(P==null||L==null)) → if(!(P==null||L==null||f.Gw_kurs!==K.Gw_kurs)) (bez odcinka między kursami)
// vilda_auth_ui.js — showPatientCard (siatki)
// 14. Yt=Lt(s.ghTherapyPoints,"GH","#0F6E56") → Yt=Gw_pasy(s.ghTherapyPoints,function(pe){return Lt(pe,"GH","#0F6E56")})
// 15. Ne=[Yt,ke].filter(Boolean) → Ne=[].concat(Yt||[],ke||[])
// 16. _cx9: …,redKursy:ae._vildaCmpCtx.redKursy} → …,redKursy:ae._vildaCmpCtx.redKursy,ghKursy:ae._vildaCmpCtx.ghKursy}
// vilda_auth_ui.js — panel „Porównanie pomiarów” (renderPanel)
// 17. nowa function ctxGhKursy(cx,ovlM) przed renderPanel (suma pokryć cx.ghKursy; bez listy — koperta cx.gh)
// 18. var ghM=cx?ovlM(cx.gh):0, → var ghM=ctxGhKursy(cx,ovlM),

// growth-basic-module.js — kontekst analizy trajektorii (z)
//    było:  k9&&(k9.gh&&(c9.gh=k9.gh),k9.red&&(c9.red=k9.red),typeof k9.mpSds=="number"
//    jest:  k9&&(k9.gh&&(c9.gh=k9.gh),k9.red&&(c9.red=k9.red),/* P-GH-WZNOWIENIE … */k9.ghKursy&&(c9.ghKursy=k9.ghKursy),
//           k9.redKursy&&(c9.redKursy=k9.redKursy),typeof k9.mpSds=="number"      (jak vilda_advanced_growth.js)
```

**Granice.** Jeden kurs (albo brak `VildaTrajectoryAnalysis.ghKursy`) — `Gw_biezacy` daje null i wszystkie gałęzie liczą
jak dotąd; jedyna zmiana przy jednym kursie: „Włączenie” = pierwsze „start” wg wieku, nie wg kolejności tablicy (wynik inny
tylko przy dwóch Włączeniach w otwartym kursie — scalone duplikaty). Punkty trendu jednego kursu nie dostają pola
`Gw_kurs`. Bez nowego pliku ładowanego przez strony i bez nowych stylów (znacznik i ramka mają dotychczasowy wygląd);
DocPro (`gh_therapy_monitor.js`, `vilda_gh_punkty.js`, odcinki, B.64), sejf, Terminarz i Historia bez zmian (część 2).
Wersje `?v=`, precache i `SW_VERSION` ustawił `npm run podbij-wersje`.

## Łatki P-GH-WZNOWIENIE, część 2 — wznowienie leczenia GH w DocPro (`gh_therapy_monitor.js` 64 → 65, `gh_therapy_segments.js` 5 → 6, `gh_igf_therapy.js` 33 → 34, `vilda_auth_ui.js` 576 → 577; czytelne `vilda_gh_punkty.js` 6 → 7, `vilda_gh_punkt_z_wiersza.js` 3 → 4; 2026-11-20, decyzje właściciela)

Czytelne źródło reguły wpisu: `vilda_gh_punkty.js` (wersja 4: `sprawdzRodzaj` z `opcje.wiekM`, `dostepneRodzaje` z kluczem
`continue` i wariantem `{ wsteczny: true }`, `wiekMiesZPol`, `gotowe({ kursy: true })`) i `vilda_gh_punkt_z_wiersza.js`
(`rodzajeWWieku`, `stanPrzycisku` z rodzajami, `przygotujPunkt` z wiekiem wiersza). Reguła kursów: `ghKursy` w
`vilda_trajectory_analysis.js` (część 1, bez zmian). Opis: `docs/clinical/ALGORITHMS.md`, P-GH-WZNOWIENIE, część 2.
Zminifikowane pliki zmienione wprost w artefakcie kotwicami występującymi dokładnie raz (skrypty łatek odtwarzają wynik
z `origin/audyt` 8350126); bez ponownej minifikacji.

```
// gh_therapy_monitor.js — czytelny blok przed function F() (renderGHTherapyTable): GH_PODPOWIEDZ_BEZ_STARTU,
//   GH_PODPOWIEDZ_WZNOWIENIE, ghKursyMonitora (kursy z VildaTrajectoryAnalysis.ghKursy i wiersze tabeli w ich kolejności;
//   wpis spoza kursów w miejscu wg wieku; null bez modułu), ghWiekKursuTekst, ghOpisKursu („Kurs k — wznowienie w wieku …”
//   / „Kurs k — bez Włączenia (…)”), ghWierszKursu (tr.gh-kurs-row), ghSeparatorKursu, ghProgramKursu, ghKursProgramu
//   (przy edycji — kurs edytowanego punktu), ghPodpowiedzKursu, ghGrupyKursow, ghOznaczKurs (Gw_kurs, Gw_naglowek),
//   ghSeparatorMetryki, ghMetrykiBiezacegoKursu, ghWiekNowegoPunktu, ghRodzajeWsteczne (bramka Gpb)
// 1. Gpb:   A&&A.wersja===3&&                      → A&&A.wersja===4&&
// 2. He:    sprawdzRodzaj(window.ghTherapyPoints,e,{pomin:x})  → …,{pomin:x,wiekM:ghWiekNowegoPunktu(Gpk,x)})
// 3. ghAddRetroPoint: sprawdzRodzaj(window.ghTherapyPoints,o) → …,o,{wiekM:Gpk.wiekMiesZPol(#ghRetroAge,#ghRetroAgeMonths)})
// 4. ghRetroSyncTypeOptions (i): przed dawnymi opcjami if(ghRodzajeWsteczne(a,o))return;
// 5. F(): const r={start:0,continue:1,end:2},i=Gpo().sort(…) → const Gwk=ghKursyMonitora(Gpo()),r=…,i=Gwk?Gwk.wiersze.map(…):Gpo().sort(…)
// 6. F(): wiersz programu: …break}Gwk&&Gwk.wiele&&(o=ghProgramKursu(Gwk.biezacy));if(!o&&i[0]…
// 7. F(): i.forEach(o=>{ghSeparatorKursu(t,Gwk,o)&&(a=null);if(a!=null&&o.drug…   (zmiana preparatu w obrębie kursu)
// 8. F(): #therProg: …(l=i[0].program),Gwk&&Gwk.wiele&&(l=ghProgramKursu(ghKursProgramu(Gwk))||l),l&&(o.value=l)…
// 9. F(): #ghTherapyStartHint: tekst i widoczność z ghPodpowiedzKursu (bez modułu — dawny warunek i dawny tekst)
// 10. ae(): po sortowaniu const Gwk=ghKursyMonitora(e),Gwg=Gwk&&Gwk.wiele?ghGrupyKursow(Gwk):[e];
//     baza (e.find start) i pętla metryk w for(const Gwe of Gwg){…Gwe.find…Gwe.forEach(…),Gwk&&Gwk.wiele&&ghOznaczKurs(n,Gwe)}
//     (jeden kurs albo brak modułu — jedna grupa = cała lista, ta sama ścieżka co dotąd)
// 11. de(): e.forEach((i,Gwi)=>{ghSeparatorMetryki(n,i,e[Gwi-1]);…   Bg1(e) → Bg1(ghMetrykiBiezacegoKursu(e))
// 12. arkusz w znaczniku Re(): #ghTherapyMonitorCard tr.gh-kurs-row > td{…} (bez stylów wpisanych w elementy)

// gh_therapy_segments.js — ghSegmentByDrug (_):
//   po filtrze punktów: var Kw=e.poKursach===!1?null:kursyOdcinkow(a);if(Kw)return odcinkiKursow(Kw,r);
//   dawna treść (sortowanie, grupowanie po pełnej nazwie preparatu, tempo z VildaTempoWzrastania.odcinek) przeniesiona
//   bez zmian do function odcinkiPunktow(a,r); nowe kursyOdcinkow (≥ 2 kursy z ghKursy, punkty bez wieku na początek
//   kursu 1) i odcinkiKursow (odcinki każdego kursu, pole kurs, zmiany preparatu w obrębie kursu)

// gh_igf_therapy.js — Qe (wizyta kontrolna):
//   było:  return Array.isArray(e)&&e.length?e[e.length-1]:null
//   jest:  return Array.isArray(e)&&e.length?ghOstatniPunktWgWieku(e):null
//   nowa function ghOstatniPunktWgWieku(e): ostatni punkt ostatniego kursu ghKursy; bez modułu albo kursów — e[e.length-1]

// vilda_auth_ui.js — czytelny blok P-GH-WZNOWIENIE (część 1):
//   Gw_infoW2: „… Czas leczenia, przyrost i ΔhSDS od wznowienia liczymy od punktu „Włączenie leczenia”, którego ten kurs
//   nie ma.” → „… Dopisz punkt „Włączenie leczenia” w DocPro (monitor terapii), by liczyć czas leczenia, przyrost i ΔhSDS
//   od wznowienia.”; komentarz bloku zaktualizowany
//   wl (podsumowanie GH): x.ghSegmentByDrug(a) → x.ghSegmentByDrug(a,{poKursach:!1})  (łańcuch „Preparaty (historia)”
//   z całej historii, jak dotąd)
```

**Granice.** Jeden kurs (albo brak `VildaTrajectoryAnalysis.ghKursy`): metryki, B.64, odcinki i program monitora idą dawną
ścieżką kodu; bez modułu kursów tabela i podpowiedź jak dotąd, a `VildaGhPunkty.sprawdzRodzaj` odmawia zapisu z prośbą
o odświeżenie strony (bez powrotu do dawnej reguły). Nowe pola: wiersze metryk przy ≥ 2 kursach (`Gw_kurs`, `Gw_naglowek`),
odcinki przy ≥ 2 kursach (`kurs`). Bez nowego pliku ładowanego przez strony; style w arkuszu karty monitora (znacznik `Re`),
bez nowych zapisów stylu w elementach. Sejf, Historia, edytor notatki i lista pacjentów bez zmian. Wersje `?v=`, precache
i `SW_VERSION` ustawił `npm run podbij-wersje`.

## Łatka P-KARTA-LECZENIE, etap 2 — karta leczenia otyłości z przełącznikiem (`vilda_auth_ui.js` 577 → 578, `vilda_auth_ui.css` 87 → 88, czytelne `vilda_cykle_leczenia.js` 12 → 13, 2026-11-21, makieta zaakceptowana przez właściciela)

Czytelne źródło: `vilda_auth_ui.js` — nowy czytelny blok P-KARTA-LECZENIE, etap 2 zaraz po bloku etapu 1 (po
`Kl_leczenie`, przed `function Pl(`): `Ko_licznik`, `Ko_widoki` (wybrany widok karty per pacjent), `Ko_CZESTOSC`
(częstość leku jak `products[…].frequency` katalogu `obesity_therapy.js`), `Ko_zapomnij`, `Ko_czestosc` (lek rozpoznany
przez `ObesityResponseCriteria.resolveDrug`), `Ko_dawkaOd` („od DD.MM.RRRR” dawki), `Ko_pierwszeZdanie` (pierwsze zdanie
opisu oceny), `Ko_punkty`, `Ko_kafel`, `Ko_podpisy` (łamanie podpisu kafelka na granicy części), `Ko_kafelki`,
`Ko_werdykt` (linia oceny) i `Ko_karta` (nagłówek z akcjami sekcji, przełącznik, widoki, „Szczegóły oceny”). Czytelne
`Ob_dz`, `Kl_leczenie` i `Ob_dzNotatki` zmienione w miejscu (opis niżej). `vilda_cykle_leczenia.js` (czytelny):
`sekcja(opcje)` z opcją `uklad: 'karta'` i `wyjscie` — addytywnie, bez opcji ten sam DOM co dotąd. Opis:
`docs/clinical/ALGORITHMS.md`, wpis „P-KARTA-LECZENIE, etap 2”; plan: `docs/KARTA_LECZENIE_PLAN.md`. Zminifikowane
miejsca zmienione kotwicami występującymi dokładnie raz; skrypty łatek (Python, `zamien` z licznikiem kotwicy) odtwarzają
wynik z `origin/audyt` e3efa99; bez ponownej minifikacji.

```
// vilda_auth_ui.js — Cl (podsumowanie otyłości): dane „Przeglądu” i „Analizy”; tryb karty bez siatki pól
// 1. return Kl_wy&&(…,Kl_wy.dawka=p==="—"?"":p),e("div",{class:"vilda-gh-summary"},[y,x,Ob_h,Ob_z,Ob_u])
//    → …,Kl_wy.dawka=…,Kl_wy.lek=c,Kl_wy.substancja=s,Kl_wy.punkty=Ob_k.pts.length,Kl_wy.punktyRazem=a.length,
//      Kl_wy.cykle=Ob_C.length,Kl_wy.dawkaOd=Ko_dawkaOd(Ob_k.pts),Kl_wy.glowa=y),
//      e("div",{class:"vilda-gh-summary"},[y,Kl_wy&&Kl_wy.karta?null:x,Ob_h,Ob_z,Ob_u])
// vilda_auth_ui.js — Ml / Ob_b (Dane analityczne — otyłość)
// 2. function Ob_b(Ob_m,Kl_out){var Kl_red=null,Kl_rv,Kl_k,o=… → …Kl_k,Ko_H,Ko_prog=null,o=…
// 3. H=Z!=null&&h>0?Z/h*100:null;T.push( → …:null;Ko_H=H;T.push(   („Redukcja BMI” z kafelka — H nadpisuje potem Ob_pkt)
// 4. ot.push(fe("","Pr\xF3g ChPL",…,ht.label)), → …,ht.label)),Ko_prog=ot[ot.length-1],
// 5. Kl_out.ocena=…:null);var lt=ot.slice(); → Kl_out.ocena=…:null,Kl_out.przeglad={czasK,czasV:D,czasJ:M,
//    wlData:Ob_g?_n(l.dateISO):"",wlWiek:Ob_g?ra(l):"",masaV:u!=null?qt(u,1):"—",masaJ,
//    redMasa:C!=null&&N!=null?be(C,"",1)+" kg ("+be(N,"%",1)+")":"",redMasaCls:z(C),od:Ob_g?"od włączenia":"od 1. punktu",
//    bmiV:v!=null?qt(v,1):"—",redBmi:Ko_H!=null?be(Ko_H,"%",1):"",
//    prog:Ko_prog&&ot.indexOf(Ko_prog)>=0&&ht.thresholdPct!=null?{miara:P,tekst:"≥"+ht.thresholdPct+"%"}:null,
//    werdykt:$&&gt?{cls:gt.cls,ic:gt.ic,tytul:gt.title,opis:gt.desc||""}:null});var lt=ot.slice();
//    (te same zmienne, z których powstają kafelki i pole oceny; liczba ot.push(fe( bez zmian — strażnik R6)
// 6. st=e("div",{class:"vilda-gha-panel",style:"display:none;"},…) → st=e("div",Kl_wy&&Kl_wy.karta?{class:"vilda-gha-panel"}
//    :{class:"vilda-gha-panel",style:"display:none;"},…)
// 7. return rt.addEventListener(…),e("div",{style:"margin:2px 0 2px;"},[rt,st])} → return Kl_wy&&Kl_wy.karta?st:(…)}
//    (tryb karty: panel bez belki, rozwinięty — widok „Analiza”; przełącznik cykli bez zmian)
// vilda_auth_ui.js — Ob_dz (czytelne)
// 8. Ko_uklad, Ko_jest(punkty); czesci(): Cl i Ml z flagą karta, Ko_karta({podsumowanie,sekcja,panel,wy,patientId});
//    karta się nie złożyła (wyjątek, podsumowanie bez rysunku) → null → Ko_uklad=false i rysunek jak w etapie 1
// 9. rysuj(): wy.sekcja; Ui.sekcja({…, uklad: ko ? "karta" : void 0, wyjscie: ko ? wy.sekcja : void 0})
// vilda_auth_ui.js — Kl_leczenie (czytelne): if (o && !o.tlo) Ko_zapomnij(o.patientId);
// vilda_auth_ui.js — showPatientCard (se): Kl_leczenie({…,zakladka:at(Kl_IKONA,"Leczenie")}) → …,tlo:GdTlo})
//    (odświeżenie po synchronizacji tej samej Karty zostawia widok karty leczenia)
// vilda_auth_ui.js — Ob_dzNotatki (czytelne): przed przewinięciem do .vdo — klik „Wpisy” karty leczenia
//    (.vilda-ko-seg [data-widok="wpisy"]), Kl_przewin(karta), fokus na „Wpisy”; bez karty — jak dotąd

// vilda_cykle_leczenia.js — sekcja(opcje), uklad: 'karta' (czytelne, addytywnie)
//    jakRozwiniete (stan łącza per pacjent); msgDodaj (komunikat „+ Kontynuacja”; bez opcji = msg); dawne (akapit
//    „Wpisy z dawnych wizyt…” — w karcie pod łączem); wstep / akcje / podpowiedz jako zmienne (ten sam DOM);
//    karta: o.wyjscie = { akcje (.vdo-head-actions.vdo-zewn), komunikat, liczba }, sekcja .vdo.vdo-karta
//    (aria-label „Wpisy leczenia”) bez .vdo-head, z jakDziala(patientId, [wstep, podpowiedz, dawne]) na początku
```

`vilda_auth_ui.css`: reguły przycisków sekcji (`.vdo .vdo-btn`, `:hover`, `:focus-visible`, `-docpro`, `-add`,
`-add:hover`, telefon 44 px) dostają drugi selektor `.vdo-zewn .vdo-btn…` (akcje nagłówka sekcji oddane karcie stoją
poza `.vdo`); rozdział „P-KARTA-LECZENIE, etap 2” na końcu pliku — nagłówek karty, przełącznik (`.vilda-ko-seg`, wygląd
`.vilda-oba-seg`), kafelki `.vilda-ko-kafel*` (wartości stylu `.vilda-gha-tile`; komputer 1 × 4, telefon ≤ 560 px 2 × 2),
podpisy (`.vilda-ko-sub--stos`), linia oceny `.vilda-ko-werdykt*` (kolory pola oceny), przyciski-łącza `.vilda-ko-link`
i `.vdo-jak` (`!important` przy szczegółowości 0-2-0 jak `.vilda-gha-btn`; telefon — cel dotyku 44 px), `.vdo.vdo-karta`
(sekcja bez własnego pudełka), `.vdo-jak*`, `.vilda-ko-cicha`, panel w „Analizie” bez pudełka.

**Granice.** Bez nowego pliku ładowanego przez strony; `obesity_response_criteria.js`, sejf, dziennik, zapis
i synchronizacja bez zmian; style tylko klasami (`tests/fixtures/style-elementow.json` bez zmian: widoki chowa atrybut
`hidden`). Kafelki i linia mają własne klasy (`.vilda-ko-*`), żeby lokatory kafelków panelu (`.vilda-gha-tile`) i pola
oceny (`.vilda-oba-verdict`) nie trafiały w „Przegląd”. GH, karta „wg notatek” (`jl`) i pacjent bez leczenia otyłości —
bez zmian. Wersje `?v=`, precache i `SW_VERSION` ustawił `npm run podbij-wersje`.

## Trwała tożsamość wizyt — źródło i granica artefaktu sejfu

Zmiana funkcjonalna `P-TRWALE-WIZYTY` ma bazę `audyt` z commita
`40d742d38f4d2924d3ba85a50d746790d0de6644`. Bazowy `vilda_vault.js` ma SHA-256
`4a545ca00de1a48d7c59036a1433be3513d52815dec3a3a78b7f6b5828c2e7a6`.
Reguły tożsamości i zachowania pełnego stanu wizyty opisuje [PATIENT_VISITS.md](PATIENT_VISITS.md).

Czytelny blok funkcji sejfu znajduje się w
`runtime/durable-visits-v1/vault-fragment.js`. Jest włączony do `vilda_vault.js`
między jednoznacznymi znacznikami `BEGIN/END VILDA DURABLE VISITS V1`.
`runtime/durable-visits-v1/manifest.json` zawiera dokładne, nazwane podmiany
punktów wpięcia, skróty ich treści, skrót czytelnego źródła i całego wyniku.
To źródło odtworzenia artefaktu; nie wymaga dodawania skryptu ani biblioteki
do przeglądarki. Moduły kontekstu wizyty i jej widoku są osobnymi czytelnymi
plikami `vilda_visit_context.js` i `vilda_visit_history_ui.js`.

Odtworzenie sejfu z przypiętej bazy:

```bash
git show 40d742d38f4d2924d3ba85a50d746790d0de6644:vilda_vault.js > /tmp/vilda-vault-visits-base.js
node tools/visits-vault-delta.mjs --rebuild /tmp/vilda-vault-visits-base.js /tmp/vilda-vault-visits-built.js
cmp vilda_vault.js /tmp/vilda-vault-visits-built.js
node tools/visits-vault-delta.mjs
```

Od E3-PR0b2a (P-KONFLIKT-ZAPISU-NOTATKI, pierwsza zmiana sejfu po tej integracji)
bazą delty jest obraz sejfu po tej zmianie bez bloku trwałych wizyt: SHA-256
`5d77d03694150d19957de8d42a35083d59dae24391f8b575d679c29bf754f49b`
(`tools/visits-vault-delta.mjs`, manifest). Przepis wyżej z `40d742d3` odtwarza stan
sprzed E3-PR0b2a narzędziem z tamtego stanu (`audyt` `214a44c7`); bieżące narzędzie
odrzuca tamtą bazę („unexpected input artifact”). Bieżącą bazę daje odwrócenie delty
z `vilda_vault.js`:

```bash
node --input-type=module -e "import { readFileSync, writeFileSync } from 'node:fs'; import { restoreDurableVisitsBaseline } from './tools/visits-vault-delta.mjs'; writeFileSync('/tmp/vilda-vault-visits-base.js', restoreDurableVisitsBaseline(readFileSync('vilda_vault.js', 'utf8')));"
node tools/visits-vault-delta.mjs --rebuild /tmp/vilda-vault-visits-base.js /tmp/vilda-vault-visits-built.js
cmp vilda_vault.js /tmp/vilda-vault-visits-built.js
```

Od E3-PR0b2b (P-NOTATKA-POZNIEJSZA) bazą delty jest obraz sejfu po tej zmianie bez bloku trwałych
wizyt: SHA-256 `a9672e38d4890b2516d3afd2f184006ad72ec4443cad8df7663d42abbb5731c4`. Baza z E3-PR0b2a
(`5d77d036…`) odpowiada stanowi sprzed E3-PR0b2b (`audyt` `3c1fc748`); bieżącą bazę daje to samo
odwrócenie delty co wyżej.

Od 2c (P-DOWOD-KROKU, 2026-11-18: nowy blok natywny z repozytorium źródeł modułu i bez haka
`40-visit-metadata`) bazą delty jest SHA-256
`fe4fad0b1119e4e6ee6fdaaca793f12d76614e4cac418328fc38756895c6fe2c`, a wynikiem — bieżący
`vilda_vault.js` (`175fb1ab57b47cf4b58d19369536722edc1177c1c3d7f83311e63727298bff9b`). Bazę daje to
samo odwrócenie delty co wyżej.

Od E3-PR0c (P-ZBIEZNOSC-ZDARZEN, odsyłanie poprawionych wizyt; zmiana tylko w bloku P-DZIENNIK-ZDARZEN) bazą
delty jest obraz sejfu po tej zmianie bez bloku trwałych wizyt: SHA-256
`22f7d1f27f71ea7cb01304cc048b885159d04cc237431d842064ddd3d199e86f`, a wynikiem — bieżący `vilda_vault.js`
(`4ca270bc7461e33d50b791242cd9298da710cfd651ffe1a099b059f80c4acd7a`). Baza z 2c (`fe4fad0b…`) odpowiada
stanowi sprzed E3-PR0c (`audyt` `64fa29dc`); bieżącą bazę daje to samo odwrócenie delty co wyżej.

Od E3-PR0d (P-ZBIEZNOSC-ZDARZEN, odsyłanie wpisów Kosza; zmiana tylko w bloku P-DZIENNIK-ZDARZEN) bazą delty jest
obraz sejfu po tej zmianie bez bloku trwałych wizyt: SHA-256
`417ac2f4df8debc5dcaa7b4cec452397a161f0803f9d4fdaf852ebf48d26115e`, a wynikiem — bieżący `vilda_vault.js`
(`ed2f7832ac7a4c06df08d36029e5700c24603587eb5828311bdc65546c3fabd1`). Baza z E3-PR0c (`22f7d1f2…`) odpowiada
stanowi sprzed E3-PR0d (`audyt` `4bff32aa`); bieżącą bazę daje to samo odwrócenie delty co wyżej.

Każdy punkt wpięcia musi występować dokładnie raz. Narzędzie odrzuca inne
bajty bazy, zmianę źródła bez zgodnego manifestu, niejednoznaczny punkt wpięcia
i wynik różniący się od zapisanego skrótu. Odwrócenie delty musi odtworzyć
pełny plik bazowy bajt w bajt. Oryginalne skróty dowodu granicy natywnej
przestrzeni klinicznej pozostają bez zmian: `check_clinical_workspace_boundary.mjs`
najpierw odwraca dokładną deltę wizyt, następnie dotychczasową deltę Kt/V,
po czym wykonuje wcześniejszy dowód granicy natywnej przestrzeni klinicznej.
Nie usuwa dowolnych funkcji ani nie ignoruje zmian poza znanym blokiem.

Testy `visits-vault-boundary.test.mjs` sprawdzają pełne odtworzenie, zachowanie
starych skrótów oraz odrzucenie zmian w każdym punkcie wpięcia, w źródle
i poza deltą. Dotychczasowe asercje Kt/V nadal sprawdzają niezmienione
jednostki, nazwę badania, tożsamość i warunek podpisanej wartości URR.

### Szyfrowana tożsamość usuniętej wizyty w przestrzeni klinicznej

`snapshotTombstones[].visitCipher` mieści wyłącznie zaszyfrowany obiekt
`{version: 1, visitId}`. Nie przechowuje pomiarów, daty wizyty ani notatek.
Pozwala zachować identyfikację usuniętego zapisu po wygaśnięciu jego pełnej
treści klinicznej. Ten konkretny adres szyfru musi przechodzić przez kodek
przestrzeni klinicznej przy przechwyceniu, kopii i odtworzeniu.

Czytelne źródło rozszerzonego kodeka:
`runtime/durable-visits-v1/workspace-source-codec.mjs`. Jest kopią aktualnego
kodeka z rodziny `e410c8725541`, z ograniczoną zmianą: obsługą nowej ścieżki,
przechwyceniem jej szyfru i kontrolą minimalnego obiektu po odszyfrowaniu.
Inne nowe pola szyfrowane nadal są odrzucane. `visitCipher` nie może wskazywać
na cień pełnej dokumentacji medycznej ani przenosić dodatkowych pól.

`tools/build-visits-workspace-family.mjs` sprawdza pełny skrót bazowego drzewa
`e410c87255418a499356b314d4e2da79abbba5677fadbe5649e352eac0c5a34e`, kopiuje
51 modułów i zastępuje tylko wspomniany kodek. Używa dotychczasowego sposobu
obliczania adresu rodziny oraz formatu archiwum precache. Wynikiem jest rodzina
`67818dc1656f` z 51 modułami; 151 modułów z trzech wcześniejszych rodzin i ich
archiwa pozostają niezmiennymi zasobami historycznymi. Manifest wskazuje nowe
bieżące drzewo. Jego skróty pierwotnego fragmentu natywnego nadal opisują bazę
dowodu; dokładną zmianę adresu importu w sejfie obejmuje delta wizyt.

```bash
node tools/build-visits-workspace-family.mjs --write
node tools/build-visits-workspace-family.mjs
node tools/visits-vault-delta.mjs
```

Generator aktualizuje listę modułów i archiwum w manifeście, dopisuje adresy
nowej rodziny przed `END CLINICAL WORKSPACE PRECACHE V1` oraz odtwarza blok
`CLINICAL_WORKSPACE_PRECACHE_PACK`. Nie zmienia numeru SW ani wersji innych
zasobów. Testy `visits-workspace-codec.test.mjs` sprawdzają rzeczywiste
szyfrowanie, serializację źródła odzyskiwania i ponowne szyfrowanie tożsamości,
starsze dane, izolację sesji, odrzucenie dodatkowych pól i odtworzenie drzewa.
Test precache obejmuje wszystkie 202 adresy modułów, w tym 151 historycznych.

*(2026-11-18, 2c, P-DOWOD-KROKU.)* Kodek z tożsamością usuniętej wizyty ma teraz
źródło w repozytorium źródeł modułu (`vilda-source`,
`client/patient-clinical-workspace-source/codec.mjs`), a aktywną rodzinę modułów
buduje tamtejszy budowniczy (niżej, „Moduł planów z etapami — blok natywny sejfu
i rodzina modułów z repozytorium źródeł modułu”). Kopia
`runtime/durable-visits-v1/workspace-source-codec.mjs` zostaje: jest bajt w bajt
równa modułowi `codec.mjs` aktywnej rodziny (test w
`visits-workspace-codec.test.mjs`). `tools/build-visits-workspace-family.mjs`
zostaje dowodem historycznej rodziny `67818dc1656f`: domyślne uruchomienie
odtwarza ją z rodziny `e410c8725541` i czytelnego kodeka i sprawdza, że jej 51
modułów leży bajt w bajt wśród `historicalFiles`, a sejf jej nie wybiera
(„Visit workspace family: 67818dc1656f… (51 modules; historical bytes
retained).”); `--write` odmawia, gdy aktywna jest inna rodzina, więc nie
przywróci starej. Hak `40-visit-metadata` delty trwałych wizyt (zmiana adresu
importu rodziny wewnątrz fragmentu natywnego) jest usunięty — blok natywny
z budowniczego ma już adres aktywnej rodziny; delta ma 41 haków. Test precache
obejmuje 253 adresy modułów, w tym 202 historyczne. Zdanie wyżej, że skróty
pierwotnego fragmentu w manifeście opisują bazę dowodu, a zmianę adresu importu
obejmuje delta wizyt, dotyczy rodziny `67818dc1656f`. Od 2c `fragmentSHA256`
w manifeście opisuje blok natywny w `vilda_vault.js` taki, jaki jest, a delta
trwałych wizyt bloku nie zmienia.

### Transport trzech zasobów interfejsu wizyt w PWA

`vilda_visit_context.js`, `vilda_visit_history_ui.js` i
`vilda_visit_history_ui.css` pozostają niezależnymi plikami źródłowymi oraz
trzema oddzielnymi adresami offline z `?v=`. Instalacja pobiera ich dokładne
treści w jednym archiwum JSON. `tools/build-visit-ui-precache.mjs` odczytuje
bajty źródeł i bieżące wersje precache, zapisuje archiwum pod adresem z hashem,
manifest `runtime/visit-ui-precache/manifest.json` oraz konfigurację
`VISIT_UI_PRECACHE_PACK` w SW. Nie łączy wykonywanego kodu ani arkuszy stylów.

Worker najpierw sprawdza hash całego archiwum, pełną listę członków i hash
każdej treści. Dopiero wtedy zapisuje odpowiedzi pod trzema oryginalnymi
kluczami. CSS ma typ `text/css`, skrypty `text/javascript`; archiwum nie może
zmienić tych typów. Wspólny mechanizm weryfikacji transportu ma dwie oddzielne
listy dozwolonych zasobów: dotychczasowe moduły przestrzeni klinicznej oraz
dokładnie trzy zasoby wizyt. Nie rozszerza listy akceptowanych adresów
przestrzeni klinicznej. Nieudana weryfikacja przerywa wymaganą instalację.

Po zmianie treści lub numeru `?v=` tych plików, **po** `npm run podbij-wersje`:

```bash
node tools/build-visit-ui-precache.mjs --write
node tools/build-visit-ui-precache.mjs
```

Poprzednie archiwa pozostają niezmienne i trafiają do `historicalPacks`.
Trzy żądania zastępuje jedno. Dodatkowo jawna para bieżących adresów
`obesity_therapy.js` współdzieli świeżą odpowiedź zgodnie z istniejącym
mechanizmem aliasów. Budżety 600 żądań, 40 MB i model pięciu minut instalacji
pozostają bez zmian. Testy `visit-ui-precache-pack.test.mjs` sprawdzają
oryginalne treści, MIME, zakres `/vilda-calc/`, odrzucenie uszkodzeń i błędy
zapisu; `sw-precache-stron.test.mjs` nadal wykonuje rzeczywisty worker,
sprawdza wszystkie wymagane klucze oraz niezmienione budżety.

## Moduł planów z etapami — blok natywny sejfu i rodzina modułów z repozytorium źródeł modułu (2c, 2026-11-18)

Fragment natywny w `vilda_vault.js` (tekst między `/* BEGIN VILDA CLINICAL WORKSPACE NATIVE V1 */`
a `/* END VILDA CLINICAL WORKSPACE NATIVE V1 */`), rodzinę modułów `runtime/clinical-workspace-v1/<12
znaków drzewa>/`, jej archiwum precache, `runtime/clinical-workspace-v1/manifest.json` oraz sekcje
`BEGIN/END CLINICAL WORKSPACE PRECACHE V1` i `CLINICAL_WORKSPACE_PRECACHE_PACK` w
`service-worker-kalorii.js` buduje `tools/build-clinical-workspace-runtime.mjs` w prywatnym
repozytorium źródeł modułu (`vilda-source`). Czytelne źródła są tam w
`client/patient-clinical-workspace*/`. Bieżące artefakty: commit
`f2130f8993aa9f07de8b4ef7970b2cf23127c8dc`, drzewo
`0278bf7106c27008499d80c14acf3e2d733cccb52f3b06debbd91c443874cb25` (51 modułów), `fragmentSHA256`
`f1605482c3466e86c9c7ff94e19859eeaea8a70b5e6ccb0fad4fa302f2101d78`, `integratedVaultSHA256`
`077c76e943710aff8712b87921fd288d12b24d8a30a5c7787a53e89f45c8fb97`, archiwum
`runtime/clinical-workspace-v1/0278bf7106c2/precache-3689c59590e5.json`. Baza sejfu bez zmian:
`44d82633d45bf9db1e964457c69d07f2009b683848a00d21315fc63fdd542499`.

Od E3-PR0c (P-ZBIEZNOSC-ZDARZEN; zmiana sejfu tylko poza blokiem natywnym, w bloku P-DZIENNIK-ZDARZEN) baza sejfu to
`06ea023197d3e70fc30e965d5b2b57744fbbcbc0f638f5baa798e5ce3e209031`, a `integratedVaultSHA256` (obraz pośredni) —
`76214599a49249fc762d29e4eb31f079440ef254149ffc8cde8ecf5e36b77bb2`. Blok natywny, haki natywne, rodzina modułów
`0278bf7106c2`, `fragmentSHA256` i archiwum bez zmian; bieżące wartości są w `runtime/clinical-workspace-v1/manifest.json`.

Od E3-PR0d (P-ZBIEZNOSC-ZDARZEN; zmiana sejfu tylko poza blokiem natywnym, w bloku P-DZIENNIK-ZDARZEN) baza sejfu to
`e0fdbf3504adef9db240a1584231e2f6b5e041172de3da9d39b37e90c9f0ea50`, a `integratedVaultSHA256` (obraz pośredni) —
`d9f5b5e9dc36b0f87f172f925d0235e7c9455fb9aafff0dfbe738d88a8b7e0b0`. Baza z E3-PR0c (`06ea0231…`) odpowiada stanowi
sprzed E3-PR0d (`audyt` `4bff32aa`). Blok natywny, haki natywne, rodzina modułów `0278bf7106c2`, `fragmentSHA256`
i archiwum bez zmian; bieżące wartości są w `runtime/clinical-workspace-v1/manifest.json`.

Warstwy `vilda_vault.js` od środka: baza → blok natywny i 16 haków natywnych (manifest,
`nativeHooks`) → delta Kt/V (`tools/klirens-ktv-vault-delta.mjs`, poza blokiem) → delta trwałych
wizyt (`runtime/durable-visits-v1/`, `tools/visits-vault-delta.mjs`). Budowniczy zna tylko dwie
pierwsze. Jego `vilda_vault.js` nie ma delty Kt/V ani trwałych wizyt — **nie kopiować go do tego
repozytorium.**

Nowe artefakty (budowniczy uruchamiany tylko z `--output` na kopii tego repozytorium, nigdy na samym
repozytorium). Budowniczy importuje parser `acorn`, więc w checkoutcie repozytorium źródeł modułu najpierw
`npm ci`:

```bash
(cd <vilda-source> && npm ci)
node --input-type=module -e "import { readFileSync, writeFileSync } from 'node:fs'; import { reduceClinicalWorkspaceVault } from './tools/check_clinical_workspace_boundary.mjs'; writeFileSync('/tmp/vilda-baza-sejfu.js', reduceClinicalWorkspaceVault(readFileSync('vilda_vault.js', 'utf8')));"
sha256sum /tmp/vilda-baza-sejfu.js   # = baseVaultSHA256 z manifestu i BASE z kontroli granicy
mkdir -p /tmp/vilda-kopia && git archive HEAD | tar -x -C /tmp/vilda-kopia
node <vilda-source>/tools/build-clinical-workspace-runtime.mjs --source-vault /tmp/vilda-baza-sejfu.js --output /tmp/vilda-kopia
```

Z kopii do repozytorium:
1. Katalog nowej rodziny z archiwum precache i `runtime/clinical-workspace-v1/manifest.json` bez zmian.
   Dawne rodziny zostają (manifest przenosi je do `historicalFiles`).
2. W `service-worker-kalorii.js` tylko sekcja `BEGIN/END CLINICAL WORKSPACE PRECACHE V1` (dawne adresy
   zostają) i `CLINICAL_WORKSPACE_PRECACHE_PACK`.
3. W `vilda_vault.js` tylko tekst między znacznikami `BEGIN` i `END VILDA CLINICAL WORKSPACE NATIVE V1`
   — zastąpiony blokiem z `vilda_vault.js` kopii; poza blokiem bajt w bajt.

Kontrola warstw: `restoreKtvVaultBaseline(restoreDurableVisitsBaseline(vilda_vault.js))` ma skrót
`integratedVaultSHA256` z manifestu budowniczego, a budowniczy z `--check` na kopii, w której
`vilda_vault.js` zastąpiono tym obrazem pośrednim, kończy się „Checked 257 clinical workspace runtime
files.” (stan 2c):

```bash
node --input-type=module -e "import { readFileSync, writeFileSync } from 'node:fs'; import { restoreDurableVisitsBaseline } from './tools/visits-vault-delta.mjs'; import { restoreKtvVaultBaseline } from './tools/klirens-ktv-vault-delta.mjs'; writeFileSync('/tmp/vilda-obraz-posredni.js', restoreKtvVaultBaseline(restoreDurableVisitsBaseline(readFileSync('vilda_vault.js', 'utf8'))));"
sha256sum /tmp/vilda-obraz-posredni.js   # = integratedVaultSHA256 z runtime/clinical-workspace-v1/manifest.json
rm -rf /tmp/vilda-kontrola && mkdir -p /tmp/vilda-kontrola && git archive HEAD | tar -x -C /tmp/vilda-kontrola
cp /tmp/vilda-obraz-posredni.js /tmp/vilda-kontrola/vilda_vault.js
node <vilda-source>/tools/build-clinical-workspace-runtime.mjs --source-vault /tmp/vilda-baza-sejfu.js --output /tmp/vilda-kontrola --check
```

Polecenia czytają pliki zatwierdzone w `HEAD`; zmiany jeszcze niezatwierdzone trzeba najpierw zatwierdzić albo
skopiować do kopii.

Potem delta trwałych wizyt: hak, którego tekst zmienił się wewnątrz bloku, usunąć albo przepisać
(w 2c usunięty hak `40-visit-metadata`); bazę delty (odwrócenie delty wyżej, „Trwała tożsamość
wizyt”) zapisać w `runtime/durable-visits-v1/manifest.json` (`baseVaultSHA256`),
`tools/visits-vault-delta.mjs` (`BASE`) i `tests/unit/visits-vault-boundary.test.mjs`, a
`integratedVaultSHA256` = skrót nowego `vilda_vault.js`. Na końcu `node tools/visits-vault-delta.mjs`,
`node tools/check_clinical_workspace_boundary.mjs` i testy rodziny i pamięci offline
(`visits-workspace-codec`, `clinical-workspace-precache-pack`, `sw-precache-stron`). Blok natywny
zmienia się tylko w środku, więc baza sejfu (`baseVaultSHA256`, `BASE`) zostaje, o ile nie zmieniły
się haki natywne.

Adres `vilda_care_plan_mutation.js?v=…` stoi wewnątrz bloku natywnego i ustawia go repozytorium
źródeł modułu; kontrola granicy wymaga, żeby ten adres był w pamięci offline. Po zmianie
`vilda_care_plan_mutation.js`, `vilda_care_plan_model.js` albo `vilda_care_template_model.js` tutaj trzeba
nowych kopii tych plików w testach repozytorium źródeł (pin SHA-256 wszystkich trzech) i nowych artefaktów.

`npm run podbij-wersje` daje zmienionemu `vilda_care_plan_mutation.js` numer o jeden większy niż najwyższy
w `audyt` i przepisuje ten adres we wszystkich skryptach korzenia, także w bloku natywnym. Numer we fragmencie
z repozytorium źródeł modułu musi więc być tym samym numerem (w 2c: `?v=3`, bo `audyt` `fe4f1754` ma najwyżej
`?v=2`). Gdy podbicie zmieni blok, `node tools/check_clinical_workspace_boundary.mjs` (także w `npm test`)
i `node tools/visits-vault-delta.mjs` kończą się błędem — wtedy nowy fragment z tym numerem z repozytorium
źródeł modułu, nie zmiana ręczna.

