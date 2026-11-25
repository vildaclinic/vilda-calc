// E3-PR0e2b (P-SYNC-WLASCICIEL) — części wydania, które testy sprawdzają osobno; każdą wyłącza się jednym ruchem.
//
// Wydanie: „Scal pacjentów” zapisuje chwilę przypisania wersji do karty (assignedAtISO; decyzje właściciela 2a i 3a
// z 2026-11-23, potwierdzenie z 2026-11-24, że wszystkie urządzenia mają SW 1.1.586). Dwie części są osobne:
//   - KOSZ_PAMIETA_PRZYPISANIE — wpis Kosza pamięta chwilę przypisania wersji do karty wpisu (decyzja właściciela
//     z 2026-11-24: ta sama wersja aplikacji, osobna, osobno sprawdzana część; gdyby pokazała błąd, którego nie da się
//     wyjaśnić — wydzielić ją do osobnego wydania);
//   - POPRAWKA_PO_KOSZU_W_KARCIE_SCALONEJ — wizyta przeniesiona „Scal pacjentów”, leżąca w Koszu karty scalonej,
//     poprawiona albo oznaczona gwiazdką w starej karcie na urządzeniu bez wiedzy o scaleniu później niż Kosz, wychodzi
//     z Kosza w karcie scalonej, a stara karta nie wraca z jej powodu (decyzja właściciela 2b z 2026-11-25); stoi na
//     pamięci wpisu Kosza, więc bez pierwszej części jest wyłączona.
// Wyłączenie części (osobne wydanie): false w stałej. Testy tej części (osobne pliki i bloki) są wtedy pomijane,
// a literały istniejących testów, które ta część zmienia, wracają do wyniku sprzed niej (wybór literału przy stałej).
export const KOSZ_PAMIETA_PRZYPISANIE = true;
export const POPRAWKA_PO_KOSZU_W_KARCIE_SCALONEJ = KOSZ_PAMIETA_PRZYPISANIE && true;
