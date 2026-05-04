# Faza 5+6 v5 — naprawa wreszcie

## Co znaleźliśmy

Z Twojego screena DevTools widać:

```html
<div class="main-content"> ... </div> == $0
```

Po Turbo nawigacji `<div class="main-content">` w live DOM był **PUSTY**. Logi v4 mówiły że "main-content REPLACED OK" i "child count: 2", ale to było liczone na elemencie z DOMParser doc. Po `replaceWith()` w live DOM zostawał pusty div — dzieci nie zostały przeniesione.

## Przyczyna

`oldMain.replaceWith(newMain)` gdzie `newMain` pochodzi z `DOMParser` doc, używa wewnętrznie `adoptNode`. W większości przypadków działa, ale w pewnych okolicznościach (zaobserwowane w Twoim Chrome 2026, github.io scope) **dzieci pozostają w document źródłowym**, w live DOM ląduje pusty `<div>`. To nie był js-loading, nie był body class — było `replaceWith` które niedopełniło zadania.

## Naprawa

Zamiast `oldMain.replaceWith(newMain)` używam **`document.importNode(newMain, true)`** — explicit deep clone z DOMParser doc do bieżącego dokumentu, **przed** wstawieniem. Gwarantuje że wszystkie dzieci są w live DOM.

Plus dodatkowy log `live child count` po replace — w Twoich kolejnych testach zobaczysz że jest np. 2 (z `.container` w środku) zamiast nic.

## Lista zmian względem v4

- `vilda_navigator.js` — bump `?v=4` → `?v=5`. Linia ze zmianą jest w funkcji `navigateTo` przy "5. Podmień main-content".
- 15× HTML — bump wersji navigatora
- `service-worker-kalorii.js` — `?v=5` w precache, `SW_VERSION` `0.9.417` → `0.9.418`

## Wgrywanie

Standardowo: usuń wszystko z roota repo `vildaclinic.github.io/vilda-calc/`, wgraj zawartość folderu `wagaiwzrost_complete_faza5_6_v5/`, push, hard reload incognito.

## Weryfikacja

1. Console: `[vilda-nav] Aktywny`
2. SW: `0.9.418`
3. `vilda_navigator.js?v=5` w Network
4. **Test Turbo:** klikaj po sidebar — strony się **ładują** (treść widoczna), bez potrzeby F5

W konsoli powinieneś widzieć log po klik:
```
[vilda-nav] About to replace main-content. New child count: 2
[vilda-nav] After importNode, child count: 2
[vilda-nav] main-content REPLACED OK, live child count: 2
```

Dwa razy "child count: 2" w trakcie + po replace. Wtedy wiemy że treść jest w live DOM.

Daj znać czy działa.
