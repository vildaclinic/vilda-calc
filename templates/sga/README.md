# SGA/IUGR — kwalifikacja do leczenia hormonem wzrostu

**Wersja 1.0. Autor opracowania: Maciej Flader.** Szablon zawiera 3 etapy i 10 kroków. Treść kliniczna została zaakceptowana przez właściciela aplikacji 9.11.2026 r.; ta akceptacja nie jest deklaracją niezależnej walidacji medycznej.

Plik do importu: [SGA-kwalifikacja-Maciej-Flader.vilda-template.json](SGA-kwalifikacja-Maciej-Flader.vilda-template.json).

Po wdrożeniu [PR #915](https://github.com/vildaclinic/vilda-calc/pull/915):

1. Pobierz plik `.vilda-template.json`.
2. Otwórz **Przypomnienia → Plany opieki → Moje szablony → Importuj szablon**.
3. Sprawdź podgląd, autora, źródła i zasady udostępniania. Zapisz jako nowy szablon.
4. Aby przetestować użycie, wybierz **Użyj u pacjenta** i fikcyjnego pacjenta. Etapy uruchamia lekarz; samo utworzenie planu nie ustala terminów ani nie tworzy faktów wykonania.

## Źródła i wersja

- Minister Zdrowia, **program B.64**, obwieszczenie z **16.09.2026 r.**, wersja obowiązująca od **1.10.2026 r.**: [strona obwieszczenia](https://www.gov.pl/web/zdrowie/obwieszczenie-ministra-zdrowia-z-dnia-16-wrzesnia-2026-r-w-sprawie-wykazu-refundowanych-lekow-srodkow-spozywczych-specjalnego-przeznaczenia-zywieniowego-oraz-wyrobow-medycznych-na-1-pazdziernika-2026-r), [pakiet programów zawierający B.64](https://www.gov.pl/attachment/90e9d77e-cc4a-4fc2-bc65-3ccb29581260).
- Zespół Koordynacyjny ds. Stosowania Hormonu Wzrostu, **formularz wniosku SGA/IUGR VI A i załącznik VI B**: [dokument CZD](https://czd.pl/upload/pages/291/attachments/wzor-wniosku-o-przydzielenie-preparatu-hormonu-wzrostu-w-niskoroslosci-w-nastepstwie-sga-lub-iugr.doc). Przesłany formularz nie podaje jednoznacznej daty wersji.

## Zasady udostępniania

Uzgodniono własne warunki: dozwolone są używanie w praktyce lekarskiej, także odpłatnej, modyfikacje oraz bezpłatne przekazywanie między lekarzami z zachowaniem autorstwa, źródeł i zasad. Sprzedaż szablonu lub jego opracowań oraz publikacja w katalogach/marketplace’ach wymagają osobnej zgody autora. Prywatna biblioteka lekarza w aplikacji nie jest publikacją w katalogu. Pełny tekst jest częścią pliku; nie zastosowano CC BY.

Autorstwo opracowania jest odrębne od autorstwa programu MZ i urzędowego formularza. Warunki nie przypisują autorowi praw do źródłowych programów, formularza, faktów ani metod medycznych.

[Treść szablonu](SGA-kwalifikacja-tresc.md), akceptacja kliniczna właściciela z 9.11.2026 r. oraz testy w `tests/unit/sga-portable-template.test.mjs`. Kontrole obejmują rzeczywisty kodek, import, ponowny eksport i utworzenie planu; nie weryfikują tożsamości autora.
