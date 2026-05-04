# Kompletna paczka — Faza 5+6 (cała aplikacja z Turbo navigator)

**To jest KOMPLETNA aplikacja w stanie po Fazie 5+6** — wszystkie pliki (114), włącznie z nowym `vilda_navigator.js` który dodaje SPA-like nawigację.

Po jej wgraniu kliknięcie w sidebar nie powoduje pełnego reloadu — sidebar i logo zostają, podmienia się tylko treść.

## Co nowego względem Fazy 4

Tylko 17 plików zmienionych względem kompletnej paczki Fazy 4:
- **NOWY:** `vilda_navigator.js` (15 KB) — silnik nawigacji w stylu Turbo/Hotwire/PJAX
- 15 HTML — dodany jeden `<script src="vilda_navigator.js?v=1" defer></script>` zaraz po `vilda_logger.js`
- `service-worker-kalorii.js` — `vilda_navigator.js?v=1` w precache, bump SW `0.9.413` → `0.9.414`

Wszystkie inne pliki są identyczne jak w Fazie 4 (114 plików łącznie z manifest.json, vilda_*.js, style.css, data/, obrazami itd.).

## Jak wdrożyć

### Opcja A (zalecana) — wymiana na świeżo

1. **Backup obecnego stanu repo** na github (jeśli ma cokolwiek wartego zachowania).
2. **Usuń wszystkie pliki z roota repo** `vildaclinic.github.io`.
3. Rozpakuj ZIP. **Wgraj ZAWARTOŚĆ folderu** `wagaiwzrost_complete_faza5_6/` (TYLKO jego zawartość, nie cały folder) do roota repo. Z `data/` jako podkatalog.
4. Commit + push.
5. Poczekaj 1-2 min aż GitHub Pages się zbuduje (status w Actions tab — zielony znaczek).
6. Otwórz `https://vildaclinic.github.io/` w trybie incognito.
7. Hard reload (Ctrl+Shift+R).

### Opcja B — nadpisanie na bazie Fazy 4

Jeśli już masz wgraną kompletną paczkę Fazy 4 i wszystko działa — możesz wgrać tylko 17 zmienionych plików:

| Plik | Status |
|------|--------|
| `vilda_navigator.js` | NOWY |
| `service-worker-kalorii.js` | nadpisany |
| `index.html` | nadpisany |
| `docpro.html` | nadpisany |
| `kalkulator-klirens.html` | nadpisany |
| `cukrzyca.html` | nadpisany |
| `homa-ir.html` | nadpisany |
| `steroidy.html` | nadpisany |
| `ustawienia.html` | nadpisany |
| `kontakt.html` | nadpisany |
| `instrukcja.html` | nadpisany |
| `materialy-edukacyjne.html` | nadpisany |
| `o-aplikacji.html` | nadpisany |
| `genotropin-instrukcja.html` | nadpisany |
| `ngenla-instrukcja.html` | nadpisany |
| `omnitrope-instrukcja.html` | nadpisany |
| `przelicznik-doposilkowy-instrukcja.html` | nadpisany |

Ale dla prostoty i bezpieczeństwa — opcja A (pełna wymiana) jest lepsza.

## Weryfikacja po wgraniu

W przeglądarce (incognito), po hard reload:

### Test 1 — czy SW i navigator działają
- Otwórz https://vildaclinic.github.io/
- DevTools → Console
- **Powinno być:** `[vilda-nav] Aktywny — Turbo-style nawigacja.`
- **Application → Service Workers**: wersja `0.9.414`, status `activated and is running`
- **Network filter `vilda_navigator`**: musi być widoczny (200, 15 KB)

### Test 2 — czy Turbo działa
- Otwórz `https://vildaclinic.github.io/`
- **Otwórz DevTools → Network tab**, zostaw otwarty
- Kliknij „DocPro" w sidebarze
- **Co powinno się wydarzyć:**
  - Cienki turkusowy pasek progresu na górze (przez ~200-500ms)
  - Sidebar i logo **nie znikają i nie migają**
  - Treść w środku się zmienia
  - URL w pasku adresu zmienia się na `docpro.html`
  - W Network: nowy wpis `docpro.html` z **Type: fetch** (nie `Type: document`)
- Jeśli widzisz pełen reload (cała strona biała na chwilę, sidebar miga) — Turbo NIE działa, daj znać.

### Test 3 — Back button
- Po nawigacji DocPro → klikinij strzałkę wstecz w przeglądarce
- Powinno wrócić na index bez pełnego reloadu, sidebar nie miga.

### Test 4 — funkcje aplikacji
- Wpisz dane dziecka na index → BMI/percentyl liczy?
- Klik DocPro → wróć → przelicza BMI?
- Klik Klirens → wpisz dane → eGFR liczy?

## ⚠️ Ważne ograniczenie — moduły z `{ once: true }`

Aplikacja ma dziesiątki modułów (cukrzyca.js, bp_module.js, gh_igf_therapy.js, antibiotic_therapy.js, …) używających `document.addEventListener('DOMContentLoaded', initX, { once: true })`. Po Turbo nav DOMContentLoaded nie wystrzela się ponownie, więc taki moduł **nie wie** o nowym DOM po podmianie.

W praktyce: pierwsza wizyta na podstronie zawsze działa. Ale po klik X→Y→X (drugie wejście) niektóre interaktywne elementy mogą nie działać (przyciski nie reagują, formularze nie przeliczają).

**Mechanizmy bezpieczeństwa (escape hatches):**

1. **Per-link wyłączenie:** dodaj `data-no-turbo="true"` do `<a>` — kliknięcie zrobi pełen reload zamiast Turbo.

2. **Per-strona wyłączenie:** dodaj `<meta name="vilda-no-turbo">` w `<head>` problematycznej strony — wejście na nią robi pełen reload, ale nawigacja stamtąd dalej Turbo.

3. **Per-moduł naprawa:** dodaj listener `vilda:navigated` w module:
   ```javascript
   document.addEventListener('vilda:navigated', () => {
     if (location.pathname.endsWith('/cukrzyca.html')) initCukrzyca();
   });
   ```

## Procedura testów drugiego wejścia

Każdy test = **dwa kliknięcia** (X→Y→X) żeby wykryć regresje:

1. **index → docpro → index** — czy index dalej liczy BMI po powrocie?
2. **index → klirens → index → klirens** — czy klirens liczy eGFR po drugim wejściu?
3. **index → cukrzyca → index → cukrzyca** — czy moduł cukrzycy generuje zadania po drugim wejściu?
4. **index → steroidy → index → steroidy**
5. **index → homa-ir → index → homa-ir** — czy liczy po drugim wejściu?
6. **index → ustawienia → index → ustawienia** — czy preferencje zapisują się?
7. **Back/Forward** — strzałki przeglądarki działają płynnie?

**Jeśli któryś test wykryje regresję** — daj znać konkretnie:
- Która strona, który element nie działa
- Czy przy pierwszym wejściu czy dopiero po powrocie

Wtedy decydujemy: quick fix przez `<meta name="vilda-no-turbo">`, czy refaktoryzacja modułu.

## Quick fix dla regresji

Jeśli np. cukrzyca.html nie działa po nawigacji powrotnej, **najszybsza tymczasowa naprawa**:

Otwórz `cukrzyca.html` w repo, znajdź `<head>`, dodaj jedną linijkę:

```html
<meta name="vilda-no-turbo">
```

Wejście na cukrzyca będzie pełnym reload (jak przed Fazą 6), ale nawigacja **z** cukrzyca **na inne strony** dalej będzie Turbo. Sidebar dalej nie miga przy normalnej nawigacji między pozostałymi stronami.

## Spodziewany efekt UX

| Scenariusz | Przed | Po |
|------------|-------|-----|
| Klik w sidebar do nowej strony | 0.5–2 s, miganie | 100–500 ms, sidebar nieruchomy |
| Powrót do odwiedzonej strony | 0.3–1 s, miganie | 50–200 ms, instant feel |
| Back/Forward | pełen reload | natychmiastowy switch |

## Podsumowanie

- **Paczka kompletna**: 114 plików, ~2.3 MB
- **Faza 5+6 dodaje**: tylko 17 zmienionych plików nad Fazą 4
- **Główny zysk**: brak migania sidebar/logo przy nawigacji
- **Główne ryzyko**: moduły z `{ once: true }` mogą wymagać `<meta name="vilda-no-turbo">` quick fix

Daj znać po wgraniu czy:
1. `[vilda-nav] Aktywny` jest w konsoli
2. Test 2 pokazuje `Type: fetch` (Turbo) zamiast `Type: document` (reload)
3. Które strony mają regresje przy drugim wejściu (jeśli mają)
