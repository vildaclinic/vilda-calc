# Krok 6 — Testy regresyjne i hardening (iteracja 1)

## Wdrożone elementy

1. **Aktualizacja smoke regression suite**
   - zaktualizowano wersję smoke suite,
   - dodano oczekiwany wpis `vilda_gh_therapy_sync.js?v=1`,
   - zaktualizowano oczekiwaną wersję `app.js` do `v=151`.

2. **Guardrail rozmiaru `app.js`**
   - dodano skrypt `scripts/check_appjs_size.sh`,
   - domyślny limit: `MAX_LINES=21000` (nadpisywalny przez env).

3. **Checklista PR**
   - dodano `docs/process/appjs_pr_checklist.md`,
   - checklista wymusza kontrolę modularności, wydajności, persistence i smoke-checków.

## Cel

- zmniejszenie ryzyka regresji przy kolejnych refaktorach,
- formalizacja jakości zmian wokół monolitu `app.js`.
