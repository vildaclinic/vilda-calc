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

## Jak odtworzyć

```bash
git fetch --depth=5000 origin audyt main
git log origin/audyt --format='%h %ad %s' --date=short -- ios26-ui.js     # wersje pliku
git log origin/audyt --format='%h %s' ad98909a..origin/audyt -- <plik>     # zmiany po ostatnim wgraniu
```
