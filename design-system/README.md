# Producent design systemu Vilda

Ten katalog odbudowuje design system Vilda (artefakt „Vilda Design System”, typ Design System na claude.ai) ze stylów aplikacji jednym poleceniem. Design system jest osobnym artefaktem, nie częścią aplikacji: nic stąd nie jest ładowane przez strony ani przez service worker.

```bash
npm run design-system                 # odbudowa → design-system/out/ + design-system/out/SYNC-REPORT.md
npm run design-system -- --update     # jak wyżej, a odświeżone tokens.json i partiale trafiają też do src/
npm run design-system -- --strict     # kod wyjścia 1, gdy style rozjechały się ze src/ (kontrola w CI)
npm run design-system:check           # renderuje każdy podgląd w Chromium i sprawdza wysokości, przewijanie, błędy
```

## Co jest generowane, a co kuratorowane

`src/` jest źródłem prawdy w repozytorium, `out/` jest wynikiem (ignorowany przez git).

| Ścieżka | Rola | Skąd się bierze |
| --- | --- | --- |
| `src/project/tokens.json` | tokeny: nazwy, rodziny, motywy, style tekstu, polskie opisy | kuratorowane; **wartości** tokenów odświeża `build.mjs` z własności `--nazwa` w stylach |
| `src/partials/00-base.css`, `G01.css`…`G17.css` | reguły komponentów skopiowane ze stylów aplikacji, po grupach | kuratorowane selektory i kolejność; **deklaracje** odświeża `build.mjs` |
| `src/project/README.md`, `src/project/guidelines/*.md` | brand book i sekcje | kuratorowane |
| `src/project/components/<Nazwa>/README.md`, `preview.html`, `<Nazwa>.d.ts` | karta komponentu: opis, statyczny podgląd, typy dokumentacyjne | kuratorowane |
| `src/project/components/Cover/preview.html` | okładka | kuratorowana |
| `src/project/assets/<Grupa>/README.md`, `assets/Icons/*.svg` | opisy grup zasobów; 65 ikon Lucide używanych w aplikacji | kuratorowane (ikony wyciągnięte z `lucide.min.js`) |
| `src/system.json` | tytuł, przestrzeń nazw, data utworzenia, identyfikatory zasobów w magazynie artefaktu | kuratorowane |
| `out/project/components/bundle.css` | sklejone partiale z selektorami motywów przepisanymi na `[data-theme="…"]` | generowane |
| `out/project/components/index.d.ts` | sklejone typy komponentów | generowane |
| `out/project/design-system.json` | indeks systemu (zasoby, `lastChange` z SHA commitu) | generowane |
| `out/build/tokens.css` | tokeny skompilowane jak na stronie, do lokalnych renderów | generowane |
| `out/publish-files-map.json` | mapa plików do publikacji | generowane |
| `out/SYNC-REPORT.md` | co się zmieniło i czego producent nie umiał dopasować | generowane |

## Jak działa odświeżanie

1. `lib/css.mjs` parsuje wszystkie arkusze aplikacji w kanonicznej kolejności ładowania (`ios26-v2.css`, `style.css`, `sidebar.css`, `vilda_chrome.css`, …), bloki `<style>` każdej strony HTML i style wstrzykiwane z JS (`<style>…</style>` w literałach, np. `vilda_terminarz.js`).
2. `lib/cascade.mjs` liczy efektywną wartość każdej własności `--nazwa` w siedmiu motywach systemu przy klasach body ustawianych przez `ios26-ui.js` (`liquid-ios26` zawsze, `glass-level-N`, `high-contrast-level-N`, `dark-bg-level-N`), oknie 1200 px i jasnym schemacie systemowym; wygrywa `!important`, potem swoistość, potem kolejność. Wartości z `calc()`, `env()`, `clamp()`, `color-mix()`, gradienty z `var()` i nazwy kolorów nie są tokenami i trafiają do raportu.
3. `lib/tokens.mjs` podmienia wartości tokenów, których nazwa jest zadeklarowana w źródłach. Tokeny opisane jako „Wartość zaobserwowana …” (skala odstępów, promieni, cieni i kolorów bez zmiennej w źródle) nie są ruszane. Nowe własności `--nazwa` bez tokenu trafiają do raportu do ręcznego opisania.
4. `lib/partials.mjs` rozpoznaje każdą regułę partiala w źródłach (ten sam kontekst `@media`, selektory partiala zawarte w liście selektorów reguły źródłowej, zbieżny zestaw właściwości) i podmienia jej deklaracje; `@keyframes` po nazwie. Reguł, których nie umie dopasować, nie zmienia i wypisuje je w raporcie.
5. `lib/assemble.mjs` skleja partiale w `bundle.css` z przepisaniem selektorów motywów, składa `index.d.ts` i kompiluje `tokens.css`.

## Po zmianie stylów aplikacji

1. `npm run design-system -- --update`, potem `git diff design-system/src` — diff pokazuje dokładnie, które wartości i reguły się zmieniły.
2. Przejrzyj `design-system/out/SYNC-REPORT.md`: nowe własności bez tokenu wymagają wpisu w `tokens.json` z opisem po polsku; reguły nieodnalezione w źródłach wymagają ręcznej korekty partiala; nowy komponent wymaga nowej karty (README, podgląd, typy) i nowej grupy w partialu.
3. `npm run design-system:check` i obejrzyj zrzuty (`--shots <katalog>`), gdy raport zgłasza przycięcie albo pusty pas.
4. Opublikuj `out/` do artefaktu z Claude Code: narzędzie Artifact, `url` z `src/system.json`, `root` = `design-system/out`, `file_path` = `design-system/out/project/design-system.json`, `files` = zawartość `out/publish-files-map.json`. Obrazy pod `assets/` są już w magazynie artefaktu i nie są wysyłane ponownie; nowy plik ikony trzeba wgrać jako zasób i dopisać do `src/system.json`.

Publikacja jest krokiem osobnym od odbudowy, bo artefakt nie ma publicznego API do zapisu z CI. `--strict` w CI wykrywa rozjazd stylów ze `src/` bez publikowania.

## Granice narzędzia

- Producent odświeża wartości i deklaracje, nie pisze prozy: opisy tokenów, README kart, podglądy i brand book zmienia człowiek albo agent w Claude Code.
- Dopasowanie reguł partiali jest heurystyczne (próg zbieżności właściwości 0,5). Gdy w aplikacji zmieni się selektor, reguła trafia do listy nieodnalezionych i wymaga ręcznej aktualizacji partiala.
- Kaskada jest liczona dla desktopu przy 1200 px; wartości z zapytań `max-width` dla telefonów nie są brane pod uwagę (podglądy kart mają 960 px szerokości).
- Dane w podglądach są syntetyczne i oznaczone (Testowa, Testowy, Próbna), zgodnie z `docs/DATA_PROTECTION.md`.
