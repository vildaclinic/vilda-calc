# Faza 5+6 v4 — wersja diagnostyczna

**Ta wersja nie naprawia bug'a — dodaje szczegółowe logi do konsoli.** Po wgraniu i kliknięciu w sidebar w konsoli zobaczymy DOKŁADNIE w którym kroku navigator coś robi źle (lub nic nie robi).

## Co dodałem

W każdym kroku `navigateTo()` w `vilda_navigator.js` dodany `console.log` z prefiksem `[vilda-nav]`. Każdy try/catch loguje błąd. Znajdziemy precyzyjnie:
- Czy kliknięcie jest przechwytywane
- Czy fetch leci i jaką odpowiedź zwraca
- Czy parsing HTML się udaje
- Czy `.main-content` jest znalezione
- Czy podmiana DOM się udaje
- Czy są błędy w którymś kroku

## Jak wdrożyć

Standardowo: usuń wszystko z roota repo, wgraj zawartość folderu `wagaiwzrost_complete_faza5_6_v4/`, push, hard reload incognito.

## Co zrobić po wgraniu — KRYTYCZNE

1. Otwórz `https://vildaclinic.github.io/` w incognito
2. **DevTools → Console**, włącz "Preserve log" (checkbox u góry konsoli)
3. Kliknij "DocPro" w sidebarze (lub dowolną stronę z 5 problematycznych)
4. **Skopiuj cały log** z konsoli — wszystkie linie z prefixem `[vilda-nav]`
5. Wyślij mi screenshot lub tekst tego logu

## Czego oczekujemy w logu (przy działającej nawigacji)

```
[vilda-nav] START navigateTo: https://.../docpro.html
[vilda-nav] FETCH start: https://.../docpro.html
[vilda-nav] FETCH response: 200 OK
[vilda-nav] FETCH body length: 350000
[vilda-nav] PARSE OK, title: DocPro – Waga i wzrost
[vilda-nav] main-content lookup: new=true old=true
[vilda-nav] Stylesheets sync OK
[vilda-nav] Inline styles sync OK
[vilda-nav] Body class sync OK, body class now: liquid-ios26 has-sidebar
[vilda-nav] About to replace main-content. New child count: 35
[vilda-nav] main-content REPLACED OK
[vilda-nav] executeScripts done
[vilda-nav] loadMissingScripts done
[vilda-nav] DONE navigateTo: https://.../docpro.html
```

## Czego się spodziewam zobaczyć (jakaś jedna z poniższych anomalii)

**Scenariusz A — fetch nie kończy się:**
```
[vilda-nav] START navigateTo
[vilda-nav] FETCH start
... (nic więcej, log się urywa)
```
Oznacza że Service Worker nie odpowiada lub blokuje request.

**Scenariusz B — błąd w środku:**
```
[vilda-nav] START
[vilda-nav] FETCH OK
[vilda-nav] PARSE OK
[vilda-nav] Error in syncBodyClass: ...
```
Pokaże gdzie pęka.

**Scenariusz C — wszystko OK, ale strona dalej nie działa:**
```
[vilda-nav] DONE navigateTo
... ale wygląda jakby nic się nie zmieniło
```
Oznacza że content się podmienił, ale coś go zaraz nadpisuje (np. inny moduł pisze do DOM-a).

## Po Twoim raporcie

Z konkretnym logiem ze screenu/tekstu od razu zlokalizuję bug i wyślę finalną naprawę.

**Plik z całą diagnostyką nazywa się `vilda_navigator.js?v=4` — sprawdź w Network że to TEN się ładuje.**
