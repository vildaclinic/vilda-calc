# Synchronizacja przyrostowa: plan dla właściciela i specyfikacja wdrożenia

Stan dokumentu: projekt do decyzji właściciela, 2026-10-07. Decyzja właściciela z tego samego dnia: najpierw rozwiązania tymczasowe, potem przebudowa według tego planu. Część etapu 0 weszła jako P-SYNC-MOST (gzip pełnej wysyłki przed szyfrowaniem, limit czasu od rozmiaru) i P-SYNC-KURSOR (kursor `/changes`, odstęp po 412); opis i zakres niżej, w „Etap 0”. Pozostałe etapy nie są wdrożone.

Baza kodu: `origin/audyt` po #571 (`d6c32b2`), SW 1.1.183, `vilda_vault.js?v=200`, `vilda_sync.js?v=33`, `vilda_sync_integration.js?v=47`, `vilda_realtime.js?v=7`. Worker: `vilda-source@origin/agent/canonical-vilda-sync-source:vilda-sync-worker/` (wdrożona „v36”, silnie skorelowana z tą gałęzią, bez dowodu byte-for-byte).

Dokument powstał z czterech warstw pracy: analizy M1 (model klienta), M2 (model serwera), M3 (rozmiary i ograniczenia), trzech niezależnych projektów D1, D2, D3, ocen trzech sędziów i czterech ataków adwersarza na projekt, który wygrał ranking. Wszystkie pomiary wykonano na prawdziwych modułach z HEAD i prawdziwym kodzie workera, wyłącznie na danych fikcyjnych. Liczby Cloudflare oznaczone znakiem † pochodzą z pamięci dokumentacji, bo dostęp do `developers.cloudflare.com` był zablokowany; wymagają potwierdzenia przez właściciela.

Numery linii odnoszą się do czytelnych kopii zminifikowanych modułów (vault = ?v=199, różnica wobec HEAD tylko w imporcie pod blokadą). Czytelne kopie to pliki z repozytorium sformatowane narzędziem typu js-beautify; nie leżą w repozytorium, a numery linii są orientacyjne. Stabilnym adresem są nazwy funkcji w artefakcie (`Le`, `Bsl_scalPacjenta`, `Yt`, `ut`, `ps`), które można odszukać w HEAD bez formatowania.

---

## 1. Streszczenie dla właściciela

**Problem.** Każde urządzenie wysyła do chmury cały sejf. To wszyscy pacjenci, wszystkie zapisy, kosz, notatki, listy, klucze dostępu i hasło. Sejf ma dziś 21 do 24 MB. Jedna wysyłka ma limit 30 sekund. Na łączu komórkowym to za mało. Telefon kończy błędem TIMEOUT. Komputer kończy błędem „Failed to fetch”. Chmura jest zamrożona od ostatniej udanej wysyłki. Szybka ścieżka wysyła jednego pacjenta zaraz po zapisie, ale niesie wszystkie zapisy tej karty. Od trzeciego zapisu jest pomijana bez śladu. Druga wizyta zapisana na telefonie nie dociera nigdzie. Nowe urządzenie odtworzone z chmury dostaje stan niepełny.

**Zasada rozwiązania.** Urządzenie wysyła tylko to, co samo zmieniło. Jeden zapis, jeden nagrobek, jedna notatka, jedna preferencja. Każda zmiana to jedno małe zdarzenie, kilka kilobajtów. Serwer dopisuje zdarzenia do numerowanego dziennika. Serwer nigdy ich nie czyta. Pozostałe urządzenia pobierają tylko zdarzenia, których jeszcze nie mają. Pełny stan sejfu wysyła się rzadko i w małych skompresowanych częściach. Służy tylko nowemu urządzeniu i porządkowaniu dziennika. Zmiany czekają w trwałej kolejce na urządzeniu. Ubicie aplikacji, brak zasięgu i uśpienie telefonu niczego nie gubią.

**Co się zmieni w codziennej pracy.** Zapis wychodzi w kilka sekund, nie po minucie. Ustawienia pokażą liczbę zmian czekających na wysłanie, datę ostatniego punktu kontrolnego i ostatni błąd. Przy blokadzie sejfu z niewysłanymi zmianami aplikacja zapyta, co zrobić. Raz na kilka dni komputer zrobi punkt kontrolny. Telefon nigdy nie robi tego sam. Nowe urządzenie odtwarza się z 1,5 do 4 MB zamiast z 22 MB.

**Czego nie zmieniamy.** Szyfrowanie zostaje zero-knowledge. Serwer widzi tylko szyfrogramy, numery i rozmiary. Reguły scalania zostają te same. Zapisy dodają się po identyfikatorze. Poprawka z wyższym numerem wygrywa. Usunięcie wygrywa tylko wtedy, gdy nie było późniejszego zapisu. Kosz, retencja, notatki, listy, klucze i hasło scalają się jak dziś. Eksport wszystkich danych, kopia konta, kod synchronizacji i QR działają jak dotąd.

**Etapy.** Sześć etapów. Każdy to osobny PR. Etap 0 to doraźny most bez zmian serwera. Etap 1 to nowy worker. Etapy 2 i 3 to kolejka zdarzeń i punkty kontrolne. Etapy 4 i 5 to kompresja zdarzeń i porządki.

| Etap | Co daje | Kiedy druga wizyta z telefonu dociera do chmury | Praca agenta |
|---|---|---|---|
| 0 most | sejf 22 MB jedzie jako 1,5 do 4 MB, limit czasu do 180 s, szybka ścieżka mieści około 30 zapisów karty | po włączeniu kompresji na wszystkich urządzeniach, warunek iOS 16.4 lub nowszy | 2 do 3 dni |
| 1 worker v37 | dziennik bez limitu 200 zdarzeń i 3 dni, zdarzenie trwałe przed potwierdzeniem, naprawa dzisiejszych klientów | jak w etapie 0 | 3 do 5 dni, wdraża właściciel |
| 2 kolejka zdarzeń | każdy zapis jako osobne zdarzenie, trwała kolejka na urządzeniu | kilka sekund po zapisie, niezależnie od liczby zapisów karty | 5 do 7 dni |
| 3 punkty kontrolne | koniec pełnej wysyłki, punkty w częściach do 1 MB, nowe urządzenie bez pełnego PUT | jak w etapie 2 | 4 do 5 dni |
| 4 kompresja zdarzeń | zdarzenie 4 razy mniejsze, wiązanie szyfrogramu ze slotem | jak w etapie 2 | 1 do 2 dni |
| 5 porządki | usunięcie starych ścieżek i flag | jak w etapie 2 | 2 dni |

Co właściciel musi zrobić: podjąć decyzje z rozdziału 6, wdrożyć workera po etapie 1, aktualizować urządzenia w kolejności z rozdziału 3.8 i zmierzyć dwie liczby na własnym sejfie z rozdziału 5 etap 0.

---

## 2. Stan dzisiejszy i dlaczego podniesienie limitu nie wystarczy

**Model pełnej wysyłki.** Klient odszyfrowuje cały sejf do JSON, szyfruje go kluczem synchronizacji i wysyła jednym żądaniem `PUT /v1/slots/<slot>/blob` z nagłówkiem `If-Match`. Worker buforuje całe ciało w pamięci, archiwizuje poprzedni blob i zapisuje nowy do R2. Każda udana wysyłka z jednego urządzenia zmusza pozostałe urządzenia do pobrania całego sejfu, odszyfrowania i scalenia wszystkiego. Pełna wysyłka startuje po każdym odblokowaniu, po powrocie sieci i po zmianie karty, nawet gdy dane się nie zmieniły. Plan wysyłki żyje w pamięci jednej ramki. Po ubiciu aplikacji nic nie pamięta, że coś było niewysłane.

**Szybka ścieżka i dziennik.** Po zapisie karty klient buduje deltę jednego pacjenta ze wszystkimi jego zapisami i wysyła ją przez `sendBeacon` do `POST /delta`. Beacon nie widzi odpowiedzi, nie ponawia i ma limit 64 KB na dokument. Klient pomija deltę bez śladu, gdy przekracza 60 000 znaków. Worker nadaje numer i zapisuje deltę do dziennika w R2 po wysłaniu odpowiedzi. Dziennik trzyma 200 ostatnich delt przez 3 dni. Pozostałe urządzenia czytają dziennik od swojego kursora i przesuwają kursor na koniec dziennika także wtedy, gdy serwer zwrócił pustą listę po błędzie. Dla kosza, retencji, list pacjentów, preferencji, kluczy, hasła i importu nie ma żadnej delty. Te zmiany jadą tylko w pełnej wysyłce.

| Wielkość | Wartość | Źródło |
|---|---|---|
| Pacjenci w sejfie właściciela | 623 | eksport właściciela |
| Zapisy w sejfie | ponad 1142 | eksport właściciela |
| Eksport JSON z wcięciami | 29 MB | eksport właściciela |
| Ten sam JSON bez wcięć, czyli rozmiar wysyłki | 21 do 24 MB | M3 |
| Limit workera `MAX_PAYLOAD_BYTES` | 20 MiB, czyli 20,97 MB | wrangler.toml |
| Limit czasu jednego żądania w kliencie | 30 s | vilda_sync.js linia 3 |
| Jeden zapis karty jawnie | około 18 KB | delty właściciela |
| W tym gotowe wyniki obliczeń odtwarzalne z pomiarów | około 16,5 KB, czyli 84,5 % | M3 |
| Próg pominięcia delty pacjenta | 60 000 znaków, czyli 2 zapisy | integracja linie 966, 1000, 1034 |
| Czas wysyłki 22 MB przy 2, 5, 10 Mbit/s | 88 s, 35 s, 17,6 s | M3 |
| Minimalne łącze, by zmieścić 22 MB w 30 s | 5,9 Mbit/s | M3 |
| Dziennik delt na serwerze | 200 delt, 3 dni | delta_log.js linie 18, 19 |
| Żądania na minutę na slot | 40, wspólnie dla wszystkich tras | wrangler.toml |
| Pamięć workera przy PUT | 2 razy rozmiar bloba | upload.js linie 80, 103 |

**Dlaczego sam limit nie wystarczy.** Samo podniesienie `MAX_PAYLOAD_BYTES` nie wystarcza: telefon pada na czasie (TIMEOUT po 30 s, odczyt właściciela z 7.10), komputer kończy bez żadnej odpowiedzi HTTP („Failed to fetch”), a który limit serwera lub brzegu Cloudflare to powoduje, nie jest potwierdzone bez logów workera. Podniesienie limitu czasu do 180 s pozwoli komputerowi na szybkim łączu, ale telefon w tle zostanie uśpiony po kilkunastu sekundach, a 22 MB na 2 Mbit/s to 88 s. Worker trzyma dwa bloby w pamięci, więc przy 50 MB zbliża się do 128 MB†. Telefon przy eksporcie trzyma w pamięci około 130 do 180 MB. Każda pełna wysyłka zmusza pozostałe urządzenia do pełnego pobrania. Szybka ścieżka pada na limicie platformy 64 KB, nie na limicie workera. Dziennik gubi delty po 200 sztukach i 3 dniach niezależnie od wszystkiego. Sejf rośnie co miesiąc, więc każdy limit zostanie przekroczony ponownie. Kompresja kupuje czas i jest mostem. Wysyłanie tylko własnych zmian jest rozwiązaniem trwałym.

---

## 3. Wybrany projekt: hybryda H = dziennik zdarzeń (D3) + most doraźny (D1 etap 0) + przeszczepy

### 3.0 Dlaczego hybryda, a nie zwycięzca rankingu

Ranking sędziów był remisem: D1 132 punkty, D3 131, D2 109. Dwóch z trzech sędziów wskazało D3 jako zwycięzcę jakościowego, jeden D1 z soczewką wykonalności. Następnie cztery ataki adwersarza na D1 dały wynik: 3 z 4 scenariuszy złamane na poziomie krytycznym, jeden na poziomie poważnym. Każde złamanie zostało zmierzone na prawdziwych modułach.

Ataki podzieliły się na dwie grupy.

Grupa A: wady, które D1 dziedziczy po serwerze v36 i kompensuje heurystykami klienta. Delta dostaje numer przed zapisem, więc może zniknąć po potwierdzeniu. Dziennik przycina po 200 i 3 dniach. Kotwica punktu kontrolnego kasuje strażnika u nadawcy nad delta, której odbiorca nie zastosował. Kolejka w pamięci sesji ginie przy blokadzie w trybie chmurowym. Wszystkie te wady D3 usuwa u źródła: numer zdarzenia w tej samej transakcji co zapis, idempotencja po `eid`, brak limitu i TTL, przycinanie wyłącznie poniżej kompletnego punktu kontrolnego, punkt w częściach do 1 MB, treść zdarzenia zamrożona w chwili dopisania do kolejki.

Grupa B: wady każdego projektu „zdarzenie per encja” na obecnych regułach scalania. Zdarzenie jednego zapisu wskrzesza kartę u odbiorcy, u którego nagrobek przegrał, ale tylko z tym jednym zapisem. Nagrobek odbudowany przy wysyłce może dostać nowy znacznik czasu. Zdarzenie nieodszyfrowane u jednego urządzenia może zostać pominięte po cichu. Te wady dotyczą D1, D2 i D3 w równym stopniu. Zamykają je przeszczepy opisane niżej.

Dlatego plan to D3 jako szkielet, etap 0 z D1 jako most działający od razu na v36 i lista przeszczepów z D1, D2 i ataków.

| Element hybrydy | Skąd | Dlaczego |
|---|---|---|
| Dziennik zdarzeń w SQLite istniejącego Durable Object `SlotHub`, numer w transakcji, `eid` unikalny, brak cap i TTL | D3 | zamyka cztery udowodnione drogi cichej utraty po stronie serwera |
| Punkt kontrolny w częściach ≤ 1 MiB, publikowany tylko przez urządzenie w pełni zsynchronizowane | D3 | iPhone nigdy nie wysyła więcej niż 1 MiB jednym żądaniem; pamięć klienta to jedna część |
| Tryb legacy `/changes` z `headSeq` równym ostatniemu zwróconemu numerowi | D3 | dzisiejsze urządzenia przestają gubić delty po samym wdrożeniu workera |
| Etap 0: gzip bloba i delty, limit czasu zależny od rozmiaru, odstęp w pętli 412, kursor do ostatniego zastosowanego numeru | D1 | odmraża chmurę właściciela w 2 do 3 dni bez zmiany serwera |
| Eksport strumieniowy po pacjentach już w etapie 0 | D1, sędzia 2 | bez niego pierwsza skompresowana wysyłka z telefonu ma szczyt pamięci 130 do 180 MB |
| Polling świadomy WebSocketu, budżet żądań, osobny kubełek limitu dla tras częstych | D1, D2 | limit 40 na minutę jest dziś zjadany przez sam polling trzech urządzeń |
| Przegląd kolejki po jawnych polach porządkowych z watermarkiem z `vilda-sync-last-push-ok-v1` | D1 | wyciąga uwięzione karty z telefonu bez ręcznej sztafety |
| Kwarantanna zdarzenia nieodszyfrowanego zamiast cichego pominięcia | D2 | jedyne miejsce, gdzie D1 i D3 nadal gubiły po cichu |
| AAD w AES-GCM wiążące szyfrogram ze slotem i numerem | D2 | serwer nie podmieni zdarzenia między slotami ani części między punktami |
| Manifest encji w części 0 punktu kontrolnego | D2 | deterministyczne wykrycie, czego brakuje w chmurze |
| Kontrola `Content-Length` przed buforowaniem, DELETE czyści stan DO, fail-closed 503 bez DO | D2, gałąź koordynatora | koniec `202 seq:0` i bufora 2 razy 20 MiB |
| Zdarzenie `patient.full` i znacznik `partialSince` | atak 1 | wskrzeszenie karty zawsze całą historią |
| Nagrobki w zdarzeniach wyłącznie ze sklepu nagrobków, nigdy z zegara | atak 3 | ponowna wysyłka nie może wygrać z późniejszym zapisem |
| Kolejka z treścią zaszyfrowaną w chwili dopisania, w IndexedDB także w trybie chmurowym, brama przy blokadzie | atak 3 | tryb chmurowy i ramki powłoki przestają gubić |
| Kopia konta i kod synchronizacji niosą tożsamość slotu, `mergeVaultBackup` z regułami importu | atak 4 | odtworzenie z kopii po rotacji nie trafia w usunięty slot |

Czego nie przeszczepiamy: wierszy-referencji z D1 (treść budowana przy wysyłce), bo łamią idempotencję po `eid` i gubią niewysłany zapis skasowany cudzym nagrobkiem; obiektu per migawka z indeksem HMAC z D2, bo serwer poznaje liczbę i rozmiary obiektów, a klient wymaga dwóch do trzech tygodni pracy bez zysku dla jednego właściciela; argumentu z okien czasowych 36 i 72 godzin jako gwarancji bezpieczeństwa.

### 3.1 Model danych w chmurze

**Gdzie co leży.**

| Miejsce | Treść | Pisze | Czyta | Usuwa |
|---|---|---|---|---|
| DO `SlotHub` SQLite, tabela `ev` | zdarzenia: jeden wiersz = jedno zaszyfrowane zdarzenie | `POST /events`, adapter `POST /delta` | `GET /changes` | `prune` wyłącznie `seq ≤ snapshotSeq` natywnego kompletnego punktu i starsze niż `EVENT_GRACE_DAYS` |
| DO `SlotHub` SQLite, tabela `cp` | rejestr punktów kontrolnych | `checkpoints begin/commit`, `PUT /blob` jako `blob-v1` | `checkpoints/latest`, `/changes` | GC: zostają 2 ostatnie kompletne, niekompletne starsze niż 24 h |
| DO `state.storage` | `headSeq` (istnieje), `snapshotSeq` (istnieje), `oldestSeq`, `prunedAt`, `format` | DO | DO | `DELETE /slot` → `deleteAll()` |
| R2 `<slot>/cp/<seq12>/<part3>` | część punktu kontrolnego: `IV(12) ‖ AES-GCM(syncEncKey, gzip(JSON części))` z AAD | `PUT /checkpoints/:seq/parts/:i` | `GET /checkpoints/:seq/parts/:i` | GC jak wyżej, stronicowanym `list` |
| R2 `<slot>`, `<slot>.prev` | stary pełny blob, tylko dla klientów v36 i etapu 0 | `PUT /blob` starego klienta | `GET /blob` | `DELETE /slot`; po etapie 5 opcjonalnie |
| R2 `<slot>/d/…` | stary log delt | nie pisany od workera v37 | `GET /deltas` przez jedno wydanie | TTL 3 dni jak dziś, prefiks kasowany w etapie 5 |
| KV `<slot>` | `{tokenHash, etag, uploadedAt, updatedAt, size, api}` | jak dziś | jak dziś | jak dziś |

Serwer nie trzyma lustra `headSeq` w KV. KV ma limit około jednego zapisu na sekundę na klucz†, a `/changes` i tak pyta DO.

**Schemat SQLite w `SlotHub`** (klasa jest już `new_sqlite_classes`, migracja `v1-slothub`; tabele tworzy konstruktor w `blockConcurrencyWhile`, bez nowej migracji wranglera):

```sql
CREATE TABLE IF NOT EXISTS ev (
  seq   INTEGER PRIMARY KEY,   -- head_seq + 1 w tej samej transakcji co INSERT; ciągły
  eid   TEXT NOT NULL UNIQUE,  -- UUID v4 nadany przez klienta; ponowienie zwraca istniejący seq
  ts    INTEGER NOT NULL,      -- czas serwera w ms
  bytes INTEGER NOT NULL,
  z     TEXT,                  -- NULL | 'gzip'; serwer nie interpretuje
  aad   INTEGER NOT NULL DEFAULT 0,  -- 0 = bez AAD (etapy 2, 3), 1 = AAD slot/eid (od etapu 4)
  body  TEXT NOT NULL          -- JSON {"iv":…,"data":…}
);
CREATE TABLE IF NOT EXISTS cp (
  seq         INTEGER PRIMARY KEY,  -- stan „po seq”
  kind        TEXT NOT NULL,        -- 'native' | 'blob-v1'
  parts       INTEGER NOT NULL,     -- 0 dla blob-v1
  bytes       INTEGER NOT NULL,
  created_at  INTEGER NOT NULL,
  complete    INTEGER NOT NULL DEFAULT 0,
  lease_until INTEGER
);
```

`headSeq` jest wspólny dla zdarzeń i starych delt, więc numeracja jest ciągła z dzisiejszą bez migracji liczników. `snapshotSeq` = `seq` ostatniego kompletnego punktu `native`. Punkt `blob-v1` jest rejestrowany, ale nigdy nie uruchamia przycinania.

**Koperta zdarzenia widoczna dla serwera:**

```json
{ "eid": "7f1c…-uuid-v4", "iv": "<b64 12 B>", "data": "<b64 szyfrogram>", "z": "gzip", "aad": 1 }
```

Serwer waliduje wyłącznie: `eid` jako UUID, `iv` i `data` jako string, `z ∈ {brak, 'gzip'}`, `aad ∈ {brak, 0, 1}`, `bytes ≤ MAX_EVENT_BYTES`. Nic więcej, tak jak dziś `delta.js` linie 66 do 70.

**Treść zdarzenia po odszyfrowaniu** = koperta sync-payload z jedną encją, dokładnie ten kształt, który dziś czyta `applyEncryptedDelta` i `mergeSyncPayload` (`Le`, 8199 do 8730):

```json
{ "schemaVersion": 2,
  "event": { "kind": "snapshot.upsert", "key": "<patientId>/<snapshotId>", "atISO": "…", "dev": "<deviceId>", "full": null },
  "patients": [ { "patientId": "…", "header": {…}, "createdAtISO": "…", "lastSavedAtISO": "…", "snapshotCount": 4,
                  "headerUpdatedAtISO": "…", "partialSince": null,
                  "snapshots": [ { "snapshotId": "…", "savedAtISO": "…", "rev": 2, "updatedAtISO": "…", "payload": {…} } ] } ],
  "tombstones": [], "passkeys": [], "passkeyTombstones": [], "userPreferences": {}, "notes": [], "noteTombstones": [],
  "patientNotes": [], "patientNoteTombstones": [], "patientLists": [], "patientListTombstones": [], "snapshotTombstones": [] }
```

`Le` ignoruje nieznane klucze (`event`, `headerUpdatedAtISO`, `partialSince`), więc stary klient czyta zdarzenie bez zmian do czasu włączenia kompresji zdarzeń. `snapshotCount` u odbiorcy jest liczony lokalnie (`Bsl_scalPacjenta` 4304 do 4324), więc zdarzenie z jedną wersją nie psuje licznika.

**Szyfrowanie zdarzeń.** Etapy 2 i 3: klucz główny konta przez `V()`/`G()` (`vilda_vault.js` 1609 do 1623), identycznie jak dzisiejsze delty, bez AAD. Od etapu 4: gzip przed szyfrowaniem, `z:'gzip'`, AAD = `utf8(slotId + "/" + eid)`, `aad:1`. Klucz pozostaje kluczem głównym (decyzja D-9 pozwala na `syncEncKey`).

**Część punktu kontrolnego po odszyfrowaniu:**

```json
{ "schemaVersion": 2, "exportedAtISO": "…", "lastMergeAtISO": "…",
  "checkpoint": { "seq": 1240, "part": 0, "parts": 5, "createdAtISO": "…", "by": "<deviceId>", "reason": "auto|manual|migration|rebase|rewind", "ver": "1.1.190",
                  "devices": [ { "dev": "…", "ver": "…", "seenAtISO": "…" } ], "skipped": [ { "kind": "snap", "id": "…" } ] },
  "manifest": [ { "k": "snap", "id": "…", "rev": 2, "u": "<updatedAtISO>" }, … ],
  "patients": [ … ≤ ~300 pacjentów … ], "tombstones": [], … }
```

Część 0 niesie `credential`, `tombstones`, `passkeys`, `passkeyTombstones`, `userPreferences`, `notes`, `noteTombstones`, `patientNotes`, `patientNoteTombstones`, `patientLists`, `patientListTombstones`, `snapshotTombstones` (kosz z treścią ≤ 30 dni) oraz `manifest` wszystkich encji. Gdy część 0 przekroczy limit, jest dzielona tą samą regułą rozmiaru. Każda część jest poprawnym sync-payload, więc odtworzenie = `mergeSyncPayload(część)` po kolei. Format na drucie jak dzisiejszy blob: `IV(12) ‖ AES-GCM(syncEncKey)`, po odszyfrowaniu magic `1F 8B` (gzip) albo `7B` (JSON). AAD części = `utf8(slotId + "/cp/" + seq + "/" + part)` od pierwszego wydania, bo części czyta tylko nowy klient.

`checkpoint.seq` = `appliedUpTo` nadawcy (największy numer taki, że wszystkie zdarzenia o numerze ≤ niego zostały zastosowane albo są własne), nigdy kursor. Przy pustej kwarantannie `appliedUpTo == kursor`.

**Wersjonowanie formatu.** Koperta: `z`, `aad`. Treść: `schemaVersion` 2 bez zmian, `checkpoint.format` gdy zmieni się podział. Czytelnik: sniff `1F 8B` vs `7B` po odszyfrowaniu w `G()` (vault) i po `ut()` (sync); bez zmiany formatu na drucie. Zdolności serwera: `GET /v1/health` → `{ api: 37, features: ['events','changes-paged','checkpoints','aad'] }` i nagłówek `X-Api-Version: 37` (już w `Expose-Headers`).

**Rozmiary.** Zdarzenie jednego zapisu: 18 do 25 KB jawnie, 24 do 34 tysięcy znaków base64 bez kompresji, 6 do 8 tysięcy z gzip. Nagrobek 0,4 KB, notatka ~1 KB, preferencja 0,2 do 3 KB. Punkt kontrolny sejfu właściciela: 21,5 MB JSON → 1,5 do 4 MB po gzip → 2 do 5 części po ≤ 1 MiB.

### 3.2 Kolejka zmian na urządzeniu

**Magazyn.** Nowy sklep `outbox` w bazie `vilda_user_<userId>` (IndexedDB, wersja 5 → 6 w `Sa()`, `vilda_vault.js` 190 do 260), `keyPath:'eid'`, indeksy `byState`, `byEntity` na `[kind, entityKey]`. Drugi nowy sklep `syncQuarantine`, `keyPath:'seq'`. Adapter pamięciowy `Ze` (418 do 770) dostaje te same sklepy. Tryb chmurowy: `outbox` i `syncQuarantine` leżą w IndexedDB `vilda_user_<userId>` razem z `userMeta` (tam już są), nie w `sessionStorage` z prefiksem `veph:`; `kn()` → `ur()` i `v()` ich nie kasują. Tryb efemeryczny: wyłącznie w pamięci, z bramą przy blokadzie (niżej).

**Wiersz kolejki:**

```json
{ "eid": "uuid-v4", "createdAtISO": "…", "seqLocal": 1234, "kind": "snap", "entityKey": "<patientId>/<snapshotId>",
  "env": { "iv": "…", "data": "…", "z": "gzip", "aad": 1 }, "bytes": 7900,
  "state": "pending|inflight|oversize|unreadable", "attempts": 0, "lastError": null, "lastAttemptAtISO": null, "inflightAtISO": null }
```

Treść jest szyfrowana w chwili dopisania. Wiersz nie zależy od późniejszego stanu lokalnego. Zdalny nagrobek, który skasuje encję przed wysyłką, nie kasuje wiersza. Wiersz znika wyłącznie po `accepted` z serwera albo po jawnej decyzji użytkownika w Ustawieniach.

**Co jest zdarzeniem.** Jedna encja plus operacja, zgodnie z tabelą 3.5. Builder nigdy nie bierze całego pacjenta poza `patient.full`. `buildSnapshotEvent(patientId, snapshotId)` = nagłówek + jedna wersja. Nagrobki: `deletedAtISO` czytane wyłącznie ze sklepu nagrobków (`tombstones`, `patientNoteTombstones`, `noteTombstones`, `patientListTombstones`, `userMeta.snapshotTombstones`, `passkeyTombstones`); brak nagrobka w sklepie → builder zwraca `null` i wiersz nie powstaje. Żaden builder nagrobka nie wywołuje `new Date()`. Test źródłowy pilnuje tej reguły.

**Dopisanie.** W emiterach sejfu (`Vn` 8757, `ws`, `Qr`, `qr`, `Ps` 8865, `Yn`, `Qe2`, `jn`) przed wywołaniem słuchaczy, plus brakujące miejsca z tabeli 3.5. Ładunki hooków `onPatientSaved` i pozostałych bez zmian poza dodaniem `snapshotId` przy `isSnapshotDelete`. Scalanie z chmury (`Le`, `ps`) nigdy nie dopisuje do kolejki, więc nie ma pętli. Importy (`importPatientFromEnvelope` 7276, `mergeVaultBackup` 7668, `restoreVaultBackup` 7513, `importLegacyJsonPatient`) dopisują po jednym zdarzeniu na wersję, notatkę i listę w jednej transakcji; powyżej 2000 wpisów na komputerze zamiast zdarzeń wychodzi punkt kontrolny z `reason:'rebase'`, na iOS zawsze zdarzenia partiami.

**Koalescencja.** Nowy wpis o tym samym `kind + entityKey` zastępuje poprzedni tylko w stanie `pending`. Wpis `inflight` zostaje, nowy dochodzi obok. Różne `kind` tej samej encji nie łączą się.

**Przegląd `sweepOutbox()`.** Przy odblokowaniu i co 24 h: porównanie jawnych pól `lastSavedAtISO`, `savedAtISO`, `updatedAtISO`, `deletedAtISO` rekordów IndexedDB z `userMeta.syncWatermarkISO − 10 min`. Rekordy nowsze bez wpisu w kolejce dostają wpis. Encje scalone z chmury w tej sesji są wykluczone (zbiór `fromCloud` w pamięci). Pierwszy watermark na istniejącym urządzeniu = `vilda-sync-last-push-ok-v1` (P-SYNC-SLAD), w razie braku `userMeta.lastSyncMergeAtISO`, w razie braku wszystko. Bez odszyfrowania, dla 1142 wersji milisekundy. Kolejność przy odblokowaniu: `sweepOutbox` → `flushOutbox` → `drainChanges`. Przegląd przed pobraniem, żeby encje z chmury nie wróciły jako własne.

**Nadawca.** Jeden na konto w przeglądarce: okno nadrzędne powłoki `app.html` albo strona samodzielna, pod Web Lock `vilda-outbox-sender:<userId>` braną per partia, nigdy na czas punktu kontrolnego. Ramki tylko dopisują do IndexedDB i pingują przez istniejący `BroadcastChannel('vilda-sync-data')`. Nadawca co 20 s zapisuje `senderHeartbeatAtMs` w stanie sync; okno, które widzi bicie starsze niż 90 s, przejmuje blokadę przez `steal:true`. To zamyka zamrożony dokument trzymający blokadę.

**Pętla wysyłki `flushOutbox()`.**
1. Warunki: sync włączona, sejf odblokowany, brak `AUTH_FAILED`, brak pauzy 429, `features.events` obecne. Przy `registered:false` najpierw `syncPull`; `POST /register` wyłącznie gdy `/status` daje 404 dla naprawdę nowego slotu. Nigdy rejestracja pełnym blobem z telefonu.
2. Pobierz `pending` FIFO po `seqLocal`, do 200 wpisów i ≤ 1 MiB ciała, oznacz `inflight` z `inflightAtISO`.
3. `POST /v1/slots/<slot>/events`, `Authorization: Bearer`, `Content-Type: application/json`, limit czasu 30 s, jedno żądanie w locie.
4. Odpowiedź `200 {accepted:[{eid,seq,dup}], rejected:[{eid,code}], headSeq, ts}`: `accepted` → wiersze usunięte, `syncWatermarkISO := now`, ostatnie 500 `eid` do pierścienia `ownEids` w stanie sync, ślad `sync.push.ok {rows, bytes, seq}`; `rejected: oversize` → stan `oversize`, widoczny w Ustawieniach, nigdy cicho; `rejected: invalid` → dziennik i komunikat.
5. Błędy: sieć, TIMEOUT, 5xx, 503 → `attempts++`, odstęp 2, 4, 8, 16, 30, 60 s, potem przy każdym ticku lidera i przy `online`; 429 → `Retry-After` do `vilda-sync-rl-until-v1`, bez `attempts`; 401 i `SLOT_AUTH_MISMATCH` → stop do odblokowania, wiersze zostają.
6. Debounce 1,5 s po zdarzeniu, w trybie chmurowym 300 ms. Budżet 20 żądań `/events` na minutę na urządzenie.
7. `ts` serwera z odpowiedzi porównany z `Date.now()`: różnica > 60 s → `vilda:sync-clock-skew` tym samym kanałem co dziś `Gcs`.

**Chowanie, ubicie, zamrożenie.** Przy `visibilitychange:hidden`, `freeze`, `pagehide`, `blur`: `flushKeepalive()` wysyła pierwsze wpisy FIFO o łącznym ciele ≤ 60 000 B przez `fetch keepalive`, w fallbacku `sendBeacon` na `/events` z `{token}` w ciele i `Content-Type: text/plain`. Limit 65 536 B w locie na dokument zmierzony sondą. Wpisy stają się `inflight`. Odpowiedź może nie dotrzeć. Po wznowieniu wpisy `inflight` starsze niż 60 s wracają do `pending` i są wysyłane ponownie; serwer dedupuje po `eid`, a scalanie u odbiorcy jest idempotentne. Reszta czeka w IndexedDB na następny start. iOS nie ma Background Sync, więc pierwszą czynnością po starcie i odblokowaniu jest `sweepOutbox` → `flushOutbox`.

**Blokada sejfu jako brama.** `lock()`, wylogowanie i blokada po bezczynności przy `pending > 0`: w trybie lokalnym nic nie ginie, więc blokada przechodzi od razu. W trybie chmurowym wiersze leżą w IndexedDB i przeżywają; blokada przechodzi, a ekran blokady pokazuje „N zmian czeka na wysłanie”. W trybie efemerycznym kolejka żyje w pamięci: blokada czeka na wysyłkę bez limitu czasu, pokazuje liczbę zmian, a przy braku sieci, pauzie 429 lub błędzie oferuje „Wyślij ponownie”, „Eksportuj kopię .wiw”, „Odrzuć zmiany”. Blokada po bezczynności jest odraczana, dopóki kolejka efemeryczna jest niepusta. Nigdy cichego wyczyszczenia.

**Kwarantanna.** Zdarzenie z `/changes`, którego `ps` nie potrafi odszyfrować lub sparsować, trafia do `syncQuarantine` jako `{seq, eid, ts, iv, data, z, aad, reason, firstSeenAtISO}`. Kursor idzie dalej, `appliedUpTo` zatrzymuje się przed najniższym numerem w kwarantannie. Klauzule: `eid` w pierścieniu `ownEids` → rozwiązane; po aktualizacji aplikacji każde zdarzenie w kwarantannie jest próbowane ponownie, sukces → usunięcie; ręczne „Zwolnij” w Ustawieniach z ostrzeżeniem. Urządzenie z niepustą kwarantanną publikuje punkt kontrolny z `checkpoint.seq = appliedUpTo`, więc dziennik nigdy nie przytnie zdarzenia z kwarantanny, dopóki któreś urządzenie go nie zastosuje.

**Wskrzeszenie całą kartą.** Nowy hook sejfu `onPatientTombstoneRejected({patientId, deletedAtISO})` emitowany w `Le` dla nagrobków z ładunku, które nie weszły do zbioru `N` (8231 do 8241), i w `Bsl_usunPacjenta` przy `return 0` (4419). Integracja dopisuje `patient.full` = nagłówek + wszystkie wersje, dzielone na zdarzenia po ≤ `MAX_EVENT_BYTES`, każde z `event.full = {setId, i, n}` i aktualnym `snapshotCount`. Dedup po `patientId + deletedAtISO` w stanie sync. Odbiorca, który tworzy kartę z ładunku przy przegrywającym lokalnym nagrobku (`Bsl_scalPacjenta` gałąź `w.nowy` z `Bpu_n`), zapisuje w rekordzie jawne pole `partialSince`, gdy `F.snapshotCount` z ładunku jest większy niż liczba wersji w ładunku. Pole jest eksportowane w zdarzeniach i punktach. Urządzenie, które scala pacjenta z `partialSince` i ma lokalnie wersje nieobecne w ładunku, dopisuje `patient.full`. `partialSince` jest zdejmowane, gdy po scaleniu `patient.full` lokalna liczba wersji ≥ `snapshotCount` z tego zdarzenia. Karta z `partialSince` pokazuje w UI „historia może być niepełna, czekam na pełny stan”. Lista takich kart jest w Ustawieniach.

### 3.3 Pobieranie i scalanie

**Kontrakt `GET /v1/slots/<slot>/changes?since=S&limit=L`** (L 1 do 500, nowy klient zawsze podaje `limit=200`; brak `limit` = tryb legacy):

```json
{ "deltas": [ { "seq": 1201, "eid": "…", "payload": { "iv": "…", "data": "…", "z": "gzip", "aad": 1 } } ],
  "count": 200, "headSeq": 1534, "nextSince": 1400, "truncated": true,
  "snapshotSeq": 1240, "oldestSeq": 900, "requiresBase": false,
  "checkpoint": { "seq": 1240, "kind": "native", "parts": 5, "bytes": 2890112 } }
```

Nazwy `deltas` i `payload` zachowane dla starego klienta. Tryb legacy: do 2000 zdarzeń i 8 MiB; przy obcięciu `headSeq := seq ostatniego zwróconego`, więc dzisiejszy `Yt` (`vilda_sync.js` 554 do 567) przesuwa kursor dokładnie na to, co zastosował.

**Algorytm `drainChanges()`** (zastępuje `Yt`):
1. Polling lidera co 10 s, a przy otwartym WebSocket z `pong` młodszym niż 45 s co 60 s. Jedno żądanie `/changes` = 1 KV + 1 DO, odpowiedź bez zmian ~200 B. `/status` nie jest potrzebny do pollingu.
2. `requiresBase` (serwer liczy `S + 1 < oldestSeq`) albo `S == 0` z punktem `native` → `restoreFromCheckpoint(checkpoint.seq)`: części po kolei → sniff → `mergeSyncPayload` → `kursor := checkpoint.seq`, `appliedUpTo := checkpoint.seq` → wróć do 1. Punkt `blob-v1` → stary `GET /blob` + `ut()` + sniff, kursor i `appliedUpTo := cp.seq`.
3. Ciągłość: `deltas[i].seq == prev + 1`. Numery są ciągłe, bo przydzielane w transakcji z INSERT. Dziura → traktuj jak `requiresBase`, ślad `sync.gap`, kursor bez zmian.
4. Zastosuj partię przez `wt()`: `MERGE_BUSY` → przerwij, kursor bez zmian (P-SYNC-STRAZNIK bez zmian); zdarzenie nieczytelne → kwarantanna, licznik, ślad `sync.event.unreadable`; własne `eid` → pomiń bez scalania; liczniki `wt()` rozszerzone o listy, preferencje, klucze, kosz, żeby `vilda:sync-merged` odświeżał UI po każdym rodzaju zdarzenia.
5. `kursor := nextSince`; `appliedUpTo := kursor`, jeśli kwarantanna pusta, inaczej `min(kwarantanna) − 1`. `truncated` → od razu następna strona. Po dojściu do `headSeq`: `userMeta.lastSyncMergeAtISO := now` (`markSyncCaughtUp()`), `vilda:sync-merged`.
6. Kolejność push/pull: `sweepOutbox` → `flushOutbox` → `drainChanges`. Przemienność scalania sprawia, że kolejność nie zmienia wyniku, a trwałość własnych zmian ma pierwszeństwo.
7. Po pobraniu punktu kontrolnego, którego `checkpoint.seq < stan.lastCheckpointSeq` (cofnięcie chmury przez `restore-prev` albo stary punkt), wyzwalacz `rewind`: watermark cofnięty do `checkpoint.createdAtISO`, `sweepOutbox`, `flushOutbox`, a komputer publikuje nowy punkt z `reason:'rewind'`.

**Manifest.** Po scaleniu części 0 klient porównuje `manifest` z własnym stanem po jawnych polach: encja lokalna nieobecna w manifeście albo nowsza (`rev`, `updatedAtISO`, `lastSavedAtISO`) → wpis do kolejki. To deterministycznie wyciąga karty, które nigdy nie przeszły progu 60 000 znaków, bez polegania na watermarku.

**Realtime** (`vilda_realtime.js` 142 do 158): `{type:'delta', payload, seq, eid}` → `applyDelta`; `seq == kursor + 1` → kursor i `appliedUpTo` idą o jeden; własne `eid` ignorowane. `{type:'changed'}` od `PUT /blob` starego klienta → `drainChanges` i sprawdzenie `checkpoints/latest`, nie pełne pobranie. DO rozgłasza tylko po zapisie w transakcji.

**Tryby.** Lokalny: kursor w `localStorage['vilda-sync-cursor-v1:<slot>']` bez zmian, stan w `vilda-sync-state-v1:<slot>` rozszerzony o `api, appliedUpTo, lastCheckpointSeq, lastCheckpointAtISO, lastFlushOkAtISO, senderHeartbeatAtMs, ownEids`. Chmurowy: każda sesja = `restoreFromCheckpoint` w częściach do adaptera pamięciowego + `/changes` od `cp.seq`; kolejka w IndexedDB; pierwszy flush sesji wymaga udanego pobrania w tej sesji (`vilda-sync-pulled-v1`). Efemeryczny: jak chmurowy, kolejka w pamięci, brama przy blokadzie.

**Nowe urządzenie.** `probeNewDevice` → nakładka „Pobierz dane z serwera” → `GET /checkpoints/latest` → części po kolei (każda ≤ 1 MiB, własny limit 30 s, pamięć jednej części) → `mergeSyncPayload` per część z paskiem postępu → `/changes?since=cp.seq&limit=200` stronicowo → gotowe. Bez `PUT`. Ścieżka „Pomiń” nie prowadzi do rejestracji pełnym blobem. Bez punktu `native` i z `blob-v1`: stary czytelnik `GET /blob`. Bez żadnego punktu: replay od `since=0`, tylko małe sloty.

**Rotacja tożsamości** (`za` 1553 do 1575, `$t` 868 do 900): `flushOutbox` na stary slot, jeśli online → `register-identity` nowego slotu → `publishCheckpoint` na nowy slot (części) → `DELETE` starego slotu. Stan sync nowego slotu startuje od zera; wiersze kolejki nie są związane ze slotem (szyfrowane kluczem głównym) i wychodzą do nowego. Na rotującym urządzeniu flaga `AUTH_FAILED` jest zerowana po rotacji. Na odciętym urządzeniu 401 zostawia wiersze `pending` i pokazuje „N zmian czeka, urządzenie odłączone, sparuj ponownie i scal konto”.

### 3.4 Konflikty i usunięcia

Reguły scalania pozostają dokładnie regułami `Le` i `Bsl_scalPacjenta`. Zmienia się jednostka transportu. Testem własnościowym (3.10) dowodzimy, że suma zdarzeń daje ten sam stan co pełny blob.

| Przypadek | Zachowanie w hybrydzie | Zmiana wobec dziś |
|---|---|---|
| Dwa urządzenia offline zapisują nową wersję tej samej karty | dwa `snapshot.upsert` z różnymi `snapshotId`; po wymianie obie wersje u obu; bieżąca = późniejsza `savedAtISO` (`yr` 4444) | bez zmian |
| Oba poprawiają tę samą wersję w miejscu, oba `rev+1` | równy `rev` → wygrywa późniejszy `updatedAtISO`; przegrana poprawka ginie bez kopii | bez zmian; „wersja konfliktowa” to decyzja D-7 |
| Usunięcie pacjenta kontra zapis na innym urządzeniu | nagrobek wygrywa, gdy `deletedAtISO ≥ max(lastSavedAtISO)`; przegrany nagrobek zdejmowany | bez zmian w regule; nowość: przegrany nagrobek emituje `onPatientTombstoneRejected` → `patient.full` |
| Karta wskrzeszona u odbiorcy z przegrywającym nagrobkiem | powstaje z wersji w zdarzeniu, dostaje `partialSince`, czeka na `patient.full` | nowość; dziś dzisiejsza delta niesie całą kartę, pełny blob też |
| Poprawka pomiaru, usunięcie wiersza, przypięcie (`preserveSavedAt`, `Bzw_aktualizujWersje` 4588) kontra nagrobek pacjenta | dziś `lastSavedAtISO` karty nie rośnie, więc nagrobek z wcześniejszej godziny kasuje kartę poprawioną później | decyzja D-4: `lastSavedAtISO := max(stare, teraz)` |
| Kosz najnowszej wersji (`Bkz_przebudujNaglowek` 3096) kontra nagrobek pacjenta | dziś `lastSavedAtISO` cofa się do poprzedniej wersji, więc starszy nagrobek wygrywa | decyzja D-5: `lastSavedAtISO` nigdy nie maleje |
| Kosz z treścią z innego urządzenia kontra lokalna nowsza poprawka tej wersji | nagrobek wygrywa, gdy `deletedAtISO ≥ updatedAtISO`; dziś do kosza trafia treść z ładunku (starsza) | decyzja D-6: kosz trzyma nowszą treść lokalną |
| Kosz i retencja | `snapshot.tombstone` z treścią (kosz) albo bez (`powod:'retencja'`); `Bkz_scalStart`, `Bkz_pomin`, `Bkz_scalKoniec` bez zmian; przywrócenie = `snapshot.upsert` z `rev+1` | nowość: kosz propagowany zdarzeniem, nie tylko pełnym blobem |
| Przypięcie kontra kosz tej samej wersji na dwóch urządzeniach | obie strony czasu i obie kolejności dają ten sam wynik, zmierzone | bez zmian |
| `deleteSnapshot` bez nagrobka (wewnętrzne) | nie propaguje się nigdzie | decyzja D-8 |
| Nagłówek karty zmieniony w miejscu | `patient.header` z `headerUpdatedAtISO`; `Bsl_scalPacjenta` zapisuje nagłówek także przy `nowe == 0`, gdy zdalny `headerUpdatedAtISO` późniejszy | decyzja D-3; dziś nie przenosi tego nawet blob |
| Notatki pacjenta, listy | rev-gated LWW + nagrobki z `rev`; pola częściowe zachowują lokalne (`hasOwnProperty`) | bez zmian; listy dostają builder |
| Preferencje | LWW po `updatedAtISO`; mapy `wlsched`, `wllists`, `advHistoryCollapsed` per wpis (`Ak` 6600); zdarzenie niesie cały klucz | bez zmian w regule; `Aj` zaczyna emitować |
| Klucze dostępu | nagrobek zawsze usuwa; opakowanie klucza nie opuszcza urządzenia | bez zmian |
| Hasło | `Gc1`: przyjmij przy późniejszym `updatedAtISO` lub lokalnym `null` | bez zmian; opis w UI dla kont z kodu, QR, kopii |
| Ponowne dostarczenie, zła kolejność, powtórka po keepalive | idempotencja i monotoniczność `rev`, `updatedAtISO`, `deletedAtISO`; serwer dedupuje po `eid` | nowość: `eid` |
| Zegar | `ts` serwera z `/events` i `/changes` kontra `Date.now()`; punkt niesie `exportedAtISO` jak blob | zamiast `exportedAtISO` z rzadkich PUT |
| Nagrobki starsze niż 365 dni | kasowane przy budowie punktu, jak dziś w eksporcie | bez zmian |

### 3.5 Pokrycie 100 % mutacji

Zasada: zdarzenie = jedna encja + klucze wersji. Każda mutacja z pomiaru M1 ma wiersz. Nic nie jedzie „tylko w pełnym blobie”, bo blobu nie ma; punkt kontrolny jest sumą zdarzeń.

| # | `kind` | `entityKey` | Sekcja sync-payload | Builder | Gdzie dopisać (dziś) | Brakująca emisja |
|---|---|---|---|---|---|---|
| 1 | `snap` (`snapshot.upsert`) | `patientId/snapshotId` | `patients[{nagłówek, snapshots:[jedna]}]` | `buildSnapshotEvent` nowy; `ds` zostaje dla legacy | `Bpz_zapis` 2745, `Bzw_aktualizujWersje` 4593, `Bkz_przywroc` 3329, `Bkz_poImporcie`, `restoreSnapshotAsNew`, importy | — |
| 2 | `phdr` (`patient.header`) | `patientId` | `patients[{nagłówek, headerUpdatedAtISO, snapshots:[]}]` | `buildPatientHeaderEvent` nowy | `Bpz_zapis`, `Bzw_usunWersje` 4791, `Bkz_przebudujNaglowek`, `Ja`, `migratePatientNamesSplit` 1834, `ns/ss/as`, `Bsc_podBlokada` | `migratePatientNamesSplit`, `Ja`, `ns/ss/as` |
| 3 | `pfull` (`patient.full`) | `patientId` | `patients[{nagłówek, snapshots:[wszystkie]}]` w porcjach, `event.full` | `buildPatientFullEvents` nowy | `onPatientTombstoneRejected`, scalanie pacjenta z `partialSince` | nowy hook |
| 4 | `ptomb` (`patient.tombstone`) | `patientId` | `tombstones[]` | `us` istnieje | `Bpu_usun` 4855 | — |
| 5 | `stomb` (`snapshot.tombstone`) | `snapshotId` | `snapshotTombstones[]` z `payload` dla kosza, bez dla retencji | `buildSnapshotTombstoneEvent` nowy | `Bkz_doKosza` 3108, `Bkz_przytnij` / `pruneSnapshotsForPatient`, opcjonalnie `Bzw_usunWersje` | `Bkz_doKosza` (dziś bez zdarzenia), `snapshotId` w `isSnapshotDelete` |
| 6 | `snap` (untrash) | `patientId/snapshotId` | jak 1, `rev+1` | jak 1 | `Bkz_przywroc`, `Bkz_poImporcie` | — |
| 7 | `pnote` | `id` | `patientNotes[]` | `cs` istnieje | `Ad` 5599, `Eb` 7154, `qa`, `Bsc_podBlokada` | — |
| 8 | `pnotetomb` | `id` | `patientNoteTombstones[]` | `ls` istnieje | `Eb` | — |
| 9 | `note` | `id` | `notes[]` | `Qb0` istnieje | `po` 4959 | — |
| 10 | `notetomb` | `id` | `noteTombstones[]` | `Qb1` istnieje | `fo` 4989 | `deletedAtISO` w ładunku hooka |
| 11 | `plist` | `id` | `patientLists[]` | `buildPatientListEvent` nowy | `on` 6204, `mergePatients`, `Bsc_podBlokada` | builder |
| 12 | `plisttomb` | `id` | `patientListTombstones[]` | `buildPatientListTombstoneEvent` nowy | `Lo` 6236 | builder |
| 13 | `pref` | klucz | `userPreferences{klucz:{value, updatedAtISO}}`, mapy cały klucz | `buildPreferenceEvent` nowy | `Ps` 8865 klucze `cloud-synced`, `Aj` 6578 | `Aj` (dziś bez zdarzenia) |
| 14 | `pk` | `credentialId` | `passkeys[]` bez opakowania | `buildPasskeyEvent` nowy | `_s` 8996, `xs` 9404 | builder; `Yn` bez `syncPush()` |
| 15 | `pktomb` | `credentialId` | `passkeyTombstones[]` | `buildPasskeyTombstoneEvent` nowy | `Cs` 9110 | builder |
| 16 | `cred` | `"cred"` | `credential{…}` | `buildCredentialEvent` nowy z `Gc5` 8149 | `Ra` 1519, `Da` 1535 | builder |
| 17 | import, kopia, legacy | per encja | 1, 2, 7, 11 partią | `enqueueImportEvents` | `ns` 7276, `ss` 7668, `as` 7513, `importLegacyJsonPatient` | nowy hook `onBulkChange({reason, count})` |

Świadomie lokalne, jak dziś: `seq` wersji, `encryptedMasterByRecovery`, `recoverySalt`, opakowania passkeys, rejestr, dziennik dostępu, preferencje `local` i `local-persistent`, stan sync, `clinicalScrubDoneV1`. Nowość: `encryptedSisByMaster` wchodzi do kopii konta i kodu synchronizacji (3.9), nie do chmury. Zdarzenia `merge*` i `password-changed-remotely` nadal bez emisji.

### 3.6 Limity i iPhone

| Element | Wartość | Skąd |
|---|---|---|
| Zdarzenie jednego zapisu bez kompresji | 24 do 34 tysięcy znaków base64 | M3 |
| Zdarzenie jednego zapisu z gzip | 6 do 8 tysięcy znaków | M3 |
| Zdarzenie nagrobka, notatki, preferencji | 0,4 do 3 KB | M1 |
| `MAX_EVENT_BYTES` | 256 KiB | zapas 7 razy na wersję z dużą historią |
| Partia `POST /events` | ≤ 200 zdarzeń, ≤ 1 MiB; typowo 1 do 5 zdarzeń | projekt |
| `keepalive`, `sendBeacon` | ≤ 60 000 B ciała; limit 65 536 B w locie na dokument | sonda M3 |
| Część punktu kontrolnego | ≤ 1 MiB docelowo, twardy limit 4 MiB; 2 do 5 części dla sejfu właściciela | M3 |
| Czas części 1 MiB przy 1, 2, 5 Mbit/s | 8, 4, 1,6 s; limit 30 s na część | M3 |
| CPU gzip 21 MB JSON | 0,2 do 0,3 s w Node; iPhone niezmierzony, szacunek poniżej 2 s | M3 |
| Pamięć klienta przy punkcie kontrolnym | jedna część jawna plus skompresowana, poniżej 10 MB | eksport strumieniowy |
| Pamięć klienta dziś przy pełnej wysyłce | 130 do 180 MB szacunek | M3 |
| Pamięć workera | zdarzenie ≤ 256 KiB, partia ≤ 1 MiB, część ≤ 4 MiB; koniec 2 razy 20 MiB | projekt |
| Żądania na minutę na slot | tras częstych 120, tras ciężkich 40; typowo poniżej 10 na urządzenie przy WS | projekt |
| `CompressionStream` | Safari i iOS 16.4, Chrome 80, Firefox 113; brak → `z` puste, zdarzenie jawne | BCD 8.1.4 |
| Web Locks | Safari 15.4, Chrome 69 | BCD |
| Tło iOS | brak Background Sync; kolejka w IndexedDB, `keepalive` przy chowaniu, flush przy wznowieniu | BCD |
| Automatyczny punkt kontrolny z iOS | nigdy; tylko z przycisku z ostrzeżeniem | atak 2, atak 3 |
| Nowe urządzenie | 2 do 5 części plus ogon zdarzeń; 1 do 2 min na iPhonie łącznie ze scaleniem 1142 wersji w IndexedDB | szacunek |
| Twardy sufit odtworzenia na iPhonie | gdy sumaryczny rozmiar jawny punktu > 48 MB albo brak `DecompressionStream`, nakładka odmawia i kieruje na komputer | atak 2 |

### 3.7 Zmiany serwera: worker v37

Gałąź od `origin/agent/canonical-vilda-sync-source`, katalog `vilda-sync-worker/`. Wszystkie ścieżki v36 zachowują semantykę dla starego klienta. Gałąź koordynatora jest ortogonalna; przydział numeru w transakcji daje tę samą własność bez drugiego DO. Zalecenie: najpierw v37, koordynator osobno.

**DO `src/durable/slot_hub.js`** (ten sam binding `SLOT_HUB`):
- konstruktor: `CREATE TABLE IF NOT EXISTS ev …`, `cp …` w `blockConcurrencyWhile`; `oldestSeq`, `format` w `state.storage`;
- `POST /append {events:[{eid,iv,data,z,aad}]}` → `transactionSync`: `SELECT seq FROM ev WHERE eid=?` → istnieje → `{eid, seq, dup:true}`; inaczej `head_seq+1`, `INSERT`, `state.storage.put('headSeq')`; po transakcji broadcast `{type:'delta', payload:{iv,data,z,aad}, seq, eid, ts}`; zwraca `{accepted, headSeq, ts}`;
- `GET /range?since&limit&maxBytes` → `SELECT … WHERE seq>? ORDER BY seq LIMIT ?` z sumowaniem `bytes` do `maxBytes` (1 MiB); zwraca pola z 3.3; tryb legacy bez `limit`: 2000 i 8 MiB, `headSeq := ostatni zwrócony` przy obcięciu;
- `/meta` rozszerzone o `oldestSeq`, `checkpoint` (ostatni `complete=1`), `format`;
- `POST /checkpoint-begin {seq, parts, kind, reason}` → 409 gdy `seq ≤ snapshotSeq` albo inny `lease_until > now`; `POST /checkpoint-commit {seq, parts, bytes}` → `complete=1`, `snapshotSeq=seq` tylko dla `native`; `POST /checkpoint-legacy {seq}` z `PUT /blob` (`kind='blob-v1'`);
- `POST /prune` → `DELETE FROM ev WHERE seq ≤ snapshotSeq AND ts < now − EVENT_GRACE_DAYS`, aktualizuje `oldestSeq`; wołane w `waitUntil` po commicie i przez `alarm()` raz na dobę; nigdy dla `blob-v1`, nigdy bez kompletnego punktu `native`;
- `POST /wipe` z `DELETE /slot`: `DELETE FROM ev; DELETE FROM cp; storage.deleteAll()`;
- `/notify-delta` (stary `POST /delta`) → to samo co `/append` z jednym zdarzeniem, `eid` losowy po stronie serwera, zapis przed odpowiedzią.

**Handlery `src/handlers/`:**
- nowy `events.js`: `POST /v1/slots/:s/events`; auth Bearer albo `{token}` w ciele (`authenticateWithToken`, jak `delta.js` 62); `Content-Type` `application/json` lub `text/plain`; kontrola `Content-Length` przez istniejący `parseContentLength` (`validation.js` 129) przed `text()`; ciało ≤ `MAX_EVENTS_BODY_BYTES`, ≤ `MAX_EVENTS_PER_BATCH` zdarzeń, każde ≤ `MAX_EVENT_BYTES`; walidacja koperty z 3.1; brak DO → `503 {error:'hub_unavailable'}` zamiast `202 seq:0` (fail-closed); odpowiedź `200 {ok, accepted:[{eid,seq,dup}], rejected:[{eid,code}], headSeq, ts}`;
- `delta.js`: zapis przez DO przed `202`; koniec `persistDelta` i `pruneDeltaLog` do R2;
- `changes.js`: `since`, `limit` 1 do 500 → DO `/range`; odpowiedź z 3.3; legacy bez `limit`;
- nowy `checkpoints.js`: `POST /v1/slots/:s/checkpoints` (begin), `PUT …/checkpoints/:seq/parts/:i` (Bearer, `Content-Length` przed `arrayBuffer()`, ≤ `MAX_CP_PART_BYTES`, R2 `put('<slot>/cp/<seq12>/<i3>')`, `customMetadata {seq, part, bytes}`), `POST …/checkpoints/:seq/commit {parts, bytes}` (R2 `head` każdej części, `parts ≤ MAX_CP_PARTS`; 409 `wipe_guard` gdy suma `bytes` nowego punktu < 1/4 poprzedniego, a poprzedni ≥ 16 384 B, chyba że `confirmWipe:true` po jawnym potwierdzeniu właściciela; wariant po bajtach, bez jawnej liczby pacjentów), `GET …/checkpoints/latest` → `{seq, kind, parts, bytes, createdAt}` albo `{kind:'blob-v1', seq}`, `GET …/checkpoints/:seq/parts/:i` (buforowane jak `download.js` 76, `Content-Length`); GC starszych punktów (`CP_KEEP`) i niekompletnych starszych niż 24 h w `waitUntil` ze stronicowanym `list`;
- `upload.js` (`PUT /blob`, stary klient): `Content-Length` przed `arrayBuffer()`; po `KV.put` → `checkpoint-legacy(headSeq)`; bez innych zmian; `restore_prev.js` tak samo z `Content-Length`;
- `status.js`: dodać `api:37`, `headSeq`, `snapshotSeq`, `format`;
- `remove.js`: DO `/wipe`; prefiksy `<slot>/cp/` i `<slot>/d/` stronicowanym `list`;
- `worker.js`: trasy `events`, `checkpoints*`; `GET /v1/health` → `{ok, api:37, features:['events','changes-paged','checkpoints','aad']}`; `security.js` `X-Api-Version: 37`;
- `ratelimit.js`: drugi kubełek `rl:sync:<slot>` z `RATE_LIMIT_SYNC_RPM` dla `/events`, `/changes`, `/status`, `/socket`, `/delta`; `rl:slot:<slot>` 40/min zostaje dla `/blob`, `/checkpoints*`, `/register*`, `DELETE`, `/trial`, `/entitlement`;
- `deltas_list.js`: zostaje przez jedno wydanie, potem usunięcie.

**`wrangler.toml [vars]`:** `MAX_EVENT_BYTES=262144`, `MAX_EVENTS_BODY_BYTES=1048576`, `MAX_EVENTS_PER_BATCH=200`, `MAX_CP_PART_BYTES=4194304`, `MAX_CP_PARTS=40`, `EVENT_GRACE_DAYS=30`, `CP_KEEP=2`, `RATE_LIMIT_SYNC_RPM=120`. Bez nowych bindingów, bez nowej migracji DO. CORS bez zmian: Bearer i `Content-Type` już dozwolone, `since` i `limit` to query.

**Warunek wstępny do potwierdzenia przez właściciela:** produkcyjny `SlotHub` jest klasą SQLite (migracja `v1-slothub new_sqlite_classes` na canonical). Jeśli nie, potrzebna nowa klasa i migracja licznika `headSeq`.

**Pamięć i limity:** `/changes` = 1 KV + 1 DO zamiast 1 `R2.list` + N `R2.get`; `/events` = 1 KV + 1 DO; commit = 1 KV + ≤ 40 `R2.head` + 1 DO (plan Free: 50 subrequestów†); PUT części ≤ 4 MiB zamiast 2 razy 20 MiB.

**Zgodność z v36 dla starego klienta po wdrożeniu v37:** `/delta` trwała przed 202, `/changes` legacy bez cap i TTL z `headSeq` równym ostatniemu zwróconemu, `PUT /blob` i `GET /blob` jak dziś plus rejestracja `blob-v1`, `/status`, `/socket`, typy `delta` i `changed` bez zmian.

### 3.8 Migracja urządzeń właściciela

Wszystkie urządzenia należą do właściciela. Dane fikcyjne tylko w testach. Migrację prawdziwego sejfu wykonuje właściciel.

| Krok | Kto | Co | Efekt |
|---|---|---|---|
| 0a | właściciel | pomiar gzip własnego eksportu bez wcięć i liczba kart z deltą powyżej 60 000 znaków, skryptem lokalnym z etapu 0 | liczby zamiast szacunków |
| 0b | właściciel | potwierdzenie klasy SQLite `SlotHub` na produkcji, planu Cloudflare, wersji iOS urządzeń | decyzje D-10, D-11 |
| 1 | agent, właściciel | etap 0 na wszystkich urządzeniach (w P-SYNC-MOST jedno wydanie: czytelnik i zapis od progu 4 MiB razem, bez przełącznika — zob. „Etap 0”) | chmura odmrożona, 22 MB → 1,5 do 4 MB |
| 2 | właściciel | wdrożenie workera v37; weryfikacja `GET /v1/health` → `api:37`; `GET /changes?since=0` tokenem właściciela, `headSeq` ciągły | stare klienty przestają gubić delty |
| 3 | agent, właściciel | etapy 2 i 3 na `audyt`; SW aktualizuje się przy otwarciu; właściciel sprawdza `SW_VERSION` w Ustawieniach na każdym urządzeniu | kolejka i zdarzenia aktywne po wykryciu `features.events` |
| 4 | właściciel | sztafeta punktów kontrolnych w kolejności: komputer główny, potem iPhone, potem pozostałe komputery | każde urządzenie ma sumę stanów |
| 5 | właściciel | włączenie kompresji zdarzeń w Ustawieniach po potwierdzeniu listy urządzeń i wersji z ostatniego punktu | zdarzenia 4 razy mniejsze |

**Sztafeta punktów kontrolnych, na każdym urządzeniu po kolei:**
1. Odblokowanie. Klient wykrywa `features.events`. `sweepOutbox` z watermarkiem `vilda-sync-last-push-ok-v1` dokłada zmiany lokalne od ostatniej udanej wysyłki, w tym karty uwięzione progiem 60 000 znaków. `flushOutbox` wysyła je jako zdarzenia, partiami, w budżecie 20 na minutę. Potem dotychczasowy pull: `GET /blob` jako `blob-v1` i `/changes` legacy od kursora.
2. Komputer główny: Ustawienia → „Utwórz punkt kontrolny z tego urządzenia”. 2 do 5 części po ≤ 1 MiB. Serwer rejestruje `cp(native, seq)`.
3. iPhone: odblokowanie → sweep → flush zaległych kart jako zdarzeń → „Pobierz punkt kontrolny” → manifest wskazuje encje, których chmura nie ma → kolejne zdarzenia. iPhone nie tworzy punktu. Komputer dostaje `delta` przez WS i je scala.
4. Pozostałe komputery: jak 1, potem „Utwórz punkt kontrolny”.
5. Na końcu każde urządzenie raz „Pobierz punkt kontrolny”. Od tej chwili nowy klient nie robi `PUT /blob`.

Koszt na urządzenie: do 4 MB w dół, zdarzenia zaległe w górę, bez ponownego wysyłania 1142 wersji.

**Urządzenie na starej wersji po wdrożeniu v37 i etapów 2, 3:** jego `PUT /blob` działa po etapie 0 (skompresowany), rejestruje `blob-v1`; jego `/delta` trafia do dziennika i jest czytana przez nowe klienty; ono czyta zdarzenia nowych klientów przez `/changes` legacy, dopóki zdarzenia nie są kompresowane i nie mają AAD. Dlatego etap 4 włącza się dopiero po potwierdzeniu wersji na wszystkich urządzeniach, a serwer tego nie wymusza.

**Rollback:**
- klient: flaga `vilda-event-log-v1=0` → stara ścieżka na tym urządzeniu; kolejka zostaje w IndexedDB i wysyła się po powrocie flagi; w P-SYNC-MOST wyłącznik `vilda-sync-gzip-v1=0` → zapis bloba bez kompresji (w PWA na iPhonie dostępny tylko przez Web Inspector; realny tryb awaryjny to wydanie z wysokim progiem);
- worker: powrót do v36 → klient wykrywa brak `features` i wraca na starą ścieżkę sam; zdarzenia w SQLite i punkty w R2 nie giną, ale v36 ich nie widzi; przed rollbackiem workera jedno urządzenie robi pełny `PUT /blob` po `restoreFromCheckpoint`, co po etapie 0 jest wykonalne (1,5 do 4 MB);
- punkt kontrolny: 2 ostatnie w R2 plus `.prev` starego bloba; `restore-prev` cofa treść i uruchamia wyzwalacz `rewind` u klientów.

**Pliki i wersje (AGENTS § 6):** nowe pliki `vilda_sync_outbox.js?v=1` ręcznie (`?v=`, precache, tablice SW); pozostałe `?v=`, `SW_VERSION`, precache, pin w `tests/unit/klirens-ui-model.test.mjs` i `tests/fixtures/wersje-zasobow.json` przez `npm run podbij-wersje` jako ostatni krok każdego PR; scenariusz offline PWA po każdej zmianie SW.

### 3.9 Bezpieczeństwo

**Zero-knowledge zachowane.** Worker i DO widzą tylko `{eid, iv, data, z, aad, bytes, ts}` oraz metadane punktów `{seq, parts, bytes}`. Nie parsują treści, jak dziś `delta.js` 63 do 66 i `slot_hub.js` 88. Kompakcja po stronie klienta oznacza, że serwer nie zna kluczy per pacjent. Pola `event`, `checkpoint.by`, `devices`, `manifest`, `headerUpdatedAtISO`, `partialSince` są wewnątrz szyfrogramu.

**Co serwer widzi więcej niż dziś:** liczbę i rytm zdarzeń (dziś to samo przy deltach i PUT), klasę encji po rozmiarze (zapis ~25 KB kontra nagrobek ~0,4 KB). Środek: wypełnienie `_pad` losowymi bajtami wewnątrz JSON przed gzip do kubełków po 4 KiB, nigdy za strumieniem gzip, bo `DecompressionStream` może odrzucać dane po końcu członu†. Decyzja D-12, domyślnie włączone od etapu 4. Rozmiar punktu ≈ rozmiar sejfu po kompresji, czyli mniej informacji niż dzisiejsze `size`.

**AAD.** Zdarzenia: `utf8(slotId + "/" + eid)` od etapu 4, bramkowane razem z gzip (stary `ps` nie zna ani gzip, ani AAD). Części punktu: `utf8(slotId + "/cp/" + seq + "/" + part)` od etapu 3. Serwer albo osoba z dostępem do R2 nie podmieni zdarzenia między slotami ani części między punktami; tag GCM odrzuci.

**Tokeny.** Bearer w nagłówku dla `fetch`; `{token}` w ciele tylko dla ścieżki beacon `text/plain`, jak dziś `/delta`. Stałego identyfikatora urządzenia nie wysyłamy jawnie; `deviceId` (`localStorage['vilda-sync-device-v1']`, 8 znaków losowych, w trybie efemerycznym per sesja) jest wewnątrz szyfrogramu. `eid` jest UUID v4.

**Rotacja i kopie.** Kopia konta (`rs` 7442) i kod synchronizacji niosą `encryptedSisByMaster`; `restoreVaultBackup` (`as`) ustawia `it`; `Qe()` przestaje domyślnie ustawiać `sis := dek`, gdy pole istnieje. `POST /register` na koncie oznaczonym `restoredFromSyncCode` lub z kopii wymaga jawnego potwierdzenia „to utworzy nowy, osobny slot”. Dziś odtworzenie z kopii po rotacji trafia w usunięty slot i cicho zakłada drugi (zmierzone). Tryb efemeryczny i konta z QR po rotacji liczą stary slot; QR powinien przesyłać pęczek `dek + sis` jak kod synchronizacji (decyzja D-13).

**Kopia konta i import.** `mergeVaultBackup` (`ss` 7668) dostaje reguły P-IMPORT-NAGROBEK z `ns`: karta nieobecna lokalnie → `lastSavedAtISO = teraz`, zdjęcie nagrobka pacjenta i notatek; wewnętrzne `Le` w `ss` nie może usuwać kart właśnie zapisanych. Dziś po usunięciu karty i scaleniu kopii licznik mówi „dodano 1”, a rekordów jest 0 (zmierzone).

**Rekord nieczytelny lokalnie.** `exportSyncPayloadParts` pomija rekordy, których `G()` nie odszyfruje, wpisuje je do `checkpoint.skipped[]` i do trwałego ostrzeżenia w Ustawieniach. Wiersz kolejki dostaje stan końcowy `unreadable` bez ponowień. Dziś jeden uszkodzony rekord blokuje cały eksport.

**Serwer złośliwy lub uszkodzony.** Pominięcie zdarzeń → wykrywalne (ciągłość `seq`). Ponowne dostarczenie starych → nieszkodliwe (monotoniczność). Podmiana treści → odrzucona tagiem GCM i AAD. Cofnięcie punktu → wyzwalacz `rewind`. Brak podpisu nadawcy per zdarzenie, jak dziś, poza modelem zagrożeń.

**RODO.** `DELETE /slot` kasuje dziennik, punkty, stare delty i stan DO. Dziś stan DO zostaje.

**AES-GCM z losowym IV 12 B** pod jednym kluczem: limit 2^32 szyfrowań; przy około 2000 zdarzeń rocznie bez znaczenia.

### 3.10 Testy

Wszystkie jednostkowe na prawdziwych modułach przez `tests/support/load-browser-script.mjs` i `VildaVault.createInMemoryAdapter()`, wzór `tests/unit/synchronizacja-straznik.test.mjs` i `tests/unit/delta-biblioteki-szablonow.test.mjs`. Dane wyłącznie fikcyjne. Node 20 ma `CompressionStream`.

| Plik | Co pilnuje |
|---|---|
| `tests/unit/sync-kompresja-format.test.mjs` (etap 0) | blob i delta w obu formatach czytane przez prawdziwe `Y()` i `ps`; stary format zapisany starym builderem czytany nowym czytelnikiem; WIPE_GUARD w jednostkach skompresowanych; `limitCzasu(bajty)`; eksport strumieniowy daje ten sam JSON co `exportSyncPayload` |
| `tests/unit/sync-kursor-luki.test.mjs` (etap 0, w P-SYNC-KURSOR) | `Yt` z atrapą `/changes`: pusta partia przy `headSeq > kursor` → kursor stoi (bez `syncPull({force:true})`, uzasadnienie w ALGORITHMS); kursor := najwyższa zwrócona delta; `MERGE_BUSY` i blokada sejfu bez przesunięcia; odstęp 1 s i 3 s z rozrzutem w pętli 412; keepalive w kolejce; wylogowanie wszystkich urządzeń w trakcie odstępu |
| `tests/unit/sync-dziennik-outbox.test.mjs` | wpis przy każdej z 17 mutacji; koalescencja tylko `pending`; `inflight` > 60 s → `pending`; `oversize` nie znika; `sweepOutbox` dokłada rekord bez wpisu i wyklucza `fromCloud`; kolejność sweep → flush → drain; nagrobek z zegara zabroniony (grep źródła builderów); 429 bez `attempts`; 503 jak sieć; 401 zostawia wiersze |
| `tests/unit/sync-dziennik-drenaz.test.mjs` | `requiresBase`, dziura w `seq`, `MERGE_BUSY`, własne `eid`, liczniki `wt()` dla list, preferencji, kluczy, kosza; `appliedUpTo` przy kwarantannie; `lastSyncMergeAtISO` po dojściu do `headSeq` |
| `tests/unit/sync-dziennik-wlasnosciowy.test.mjs` | losowa sekwencja 50 do 200 mutacji na A i B, zdarzenia zastosowane w losowej kolejności, dwukrotnie, z przeplotem → `exportSyncPayload(A) ≡ exportSyncPayload(B)` modulo `seq` i `snapshotCount`; porównanie z referencją „pełny blob” |
| `tests/unit/sync-pokrycie-mutacji.test.mjs` | przeniesiony pomiar M1: dla każdego wiersza tabeli 3.5 `diff(A.post, B) = {}`; wariant odbiorcy z nagrobkiem starszym (pełna historia) i nowszym (karta nieobecna, wiersze nadawcy zostają) |
| `tests/unit/sync-wskrzeszenie-calej-karty.test.mjs` | scenariusz trzech urządzeń z ataku 1 w obu kolejnościach: po drenażu C i B mają wszystkie wersje A; `partialSince` ustawiane i zdejmowane; `patient.full` w porcjach niezależnie od kolejności; dedup po `deletedAtISO` |
| `tests/unit/sync-kwarantanna.test.mjs` | zdarzenie z innego slotu → kwarantanna; własne `eid` → rozwiązane; ponowna próba po „aktualizacji” czytelnika; `checkpoint.seq = appliedUpTo` przy niepustej kwarantannie |
| `tests/unit/sync-punkt-kontrolny-czesci.test.mjs` | generator części ≤ limit; część 0 z sekcjami i manifestem; round-trip gzip + AES + AAD; zła AAD → odrzucenie; odtworzenie part-by-part ≡ blob; `skipped[]` dla rekordu nieczytelnego; manifest wykrywa brakującą encję |
| `tests/unit/sync-rotacja-outbox.test.mjs` | flush przed rotacją; wiersze wychodzą do nowego slotu; stan nowego slotu od zera; 401 nie gubi `pending`; `AUTH_FAILED` zerowane po rotacji |
| `tests/unit/kopia-konta-po-rotacji.test.mjs` | dziś czerwony: slot z kopii == stary; po zmianie == nowy; `register` z kopii wymaga potwierdzenia |
| `tests/unit/kopia-konta-nagrobek.test.mjs` | dziś czerwony: `addedPatientCount 1`, rekordów 0; po zmianie karta istnieje |
| `tests/unit/sync-ios-tryby.test.mjs` | tryb chmurowy: `lock("idle")` z `pending > 0` i `route.abort` → wiersze przeżywają, po odblokowaniu dociera; tryb efemeryczny: brama blokady; ramka dopisuje, `top` wysyła tę treść; `registered:false` nie woła `/register` przed pobraniem; UA iOS → zero automatycznych punktów |
| `tests/unit/sync-haslo-w-trakcie.test.mjs` | LWW `cred`; stary `Le` czyta; konto z `passwordUpdatedAtISO:null` nie wysyła poświadczenia |
| `tests/unit/sync-restore-prev-cofniecie.test.mjs` | `checkpoint.seq < lastCheckpointSeq` → `rewind` → sweep z cofniętym watermarkiem |
| `tests/unit/blokada-usuwania-scalania.test.mjs`, `kosz-zapisow.test.mjs`, `retencja-nagrobki.test.mjs` (istniejące) | po decyzjach D-4, D-5, D-6 przypadki syntetyczne; bez decyzji testy dokumentujące obecne zachowanie z komentarzem |
| `tests/e2e/sync-dwa-urzadzenia-zdarzenia.spec.mjs` | dwa konteksty + atrapa workera v37 przez `page.route`: wizyta A → B bez pełnego PUT; kosz A → B; offline, `context.close()` w trakcie flusha, nowy kontekst → kolejka nietknięta → flush; trzeci kontekst usuwa pacjenta w trakcie offline → liczba wersji zgodna na trzech; `pagehide` → jeden `keepalive` ≤ 60 000 B; throttling 2 Mbit/s |
| `tests/e2e/sync-powloka-ramki.spec.mjs` | `app.html` tryb lokalny i chmurowy: zapis w ramce → zdarzenie z tą treścią na atrapie; przejęcie blokady po bezczynności nadawcy |
| `tests/e2e/sync-nowe-urzadzenie-punkt.spec.mjs` | nakładka „Pobierz dane z serwera” → części → zero `PUT /blob`; ścieżka „Pomiń” → zapis → zero `POST /register`; widok mobilny bez poziomego przewijania przy liczniku „N zmian czeka” |
| `tests/support/atrapa-workera-sync.mjs` | wierna atrapa v36 i v37: 409, 412, 428, 413, 202 + seq, cap i TTL dla v36; `/events` z dedup `eid`, `/changes` z `limit`, `requiresBase`, legacy, `/checkpoints`, kubełki limitu, 503 bez DO |
| worker `vilda-sync-worker/test/` (`node:test`, atrapy R2, KV, DO; SQLite przez atrapę `sql.exec` nad `better-sqlite3` albo Miniflare) | dedup `eid`; ciągłość `seq`; strona `limit`; legacy `headSeq = ostatni zwrócony`; `oldestSeq`, `requiresBase`; prune nigdy ponad `snapshotSeq`, nigdy dla `blob-v1`, nigdy bez punktu; commit 409 `wipe_guard` po bajtach; `Content-Length` → 413 bez buforowania; 503 bez DO; `DELETE` czyści DO i prefiksy; kubełek `rl:sync` osobny |
| pomiary właściciela, poza CI | `tests/scripts/pomiar-gzip-eksportu.mjs <plik>` lokalnie; przycisk „Pomiar kompresji” w Ustawieniach: gzip + AES części 1 MiB i pełnego eksportu na iPhonie, parse + scalanie, szczyt pamięci gdzie dostępny |

---

## 4. Ataki adwersarza i jak projekt je przeżywa

Cztery ataki na D1 dały 3 wyniki krytyczne i 1 poważny. Tabela pokazuje każde znalezisko, mechanizm hybrydy, który je zamyka, i test strażnika.

| Atak i znalezisko | Mechanizm w hybrydzie | Test strażnik |
|---|---|---|
| A1 Trzy urządzenia, nagrobek przegrywa: zdarzenie jednej wersji wskrzesza kartę u odbiorcy z 1 z 5 wersji; nowe urządzenie dziedziczy ucięty wywiad | `onPatientTombstoneRejected` → `patient.full`; `partialSince` u odbiorcy, eksportowane w zdarzeniach i punktach; urządzenie z pełną historią reaguje na `partialSince` | `sync-wskrzeszenie-calej-karty` |
| A1 Wiersz-referencja gubi niewysłany zapis, gdy cudzy nagrobek skasuje kartę przed wysyłką | treść zamrożona i zaszyfrowana w chwili dopisania; wiersz znika tylko po `accepted`; kolejność sweep → flush → drain | `sync-dziennik-outbox`, `sync-pokrycie-mutacji` wariant z nagrobkiem |
| A1 Brak zbieżności po wskrzeszeniu częściowym: punkt kontrolny utrwala mniejszy zbiór | punkt eksportuje `partialSince`; każde urządzenie z brakującymi wersjami dopisuje `patient.full`; lista kart niepełnych w Ustawieniach | `sync-wskrzeszenie-calej-karty`, e2e trzech kontekstów |
| A1 Odziedziczone wejścia reguły: poprawka i przypięcie nie podnoszą `lastSavedAtISO`; kosz najnowszej wersji cofa `lastSavedAtISO`; kosz z innego urządzenia zastępuje nowszą poprawkę | decyzje D-4, D-5, D-6 jako zmiany reguły scalania z wpisem w ALGORITHMS | istniejące testy kosza, retencji, blokady usuwania |
| A2 Kotwica punktu nad pominiętą deltą: wyścig `persist` po 202, TTL bez nikogo online, delta nieodszyfrowana → strażnik u nadawcy skasowany, encja osierocona | `seq` w transakcji z INSERT; `eid`; brak cap i TTL; `accepted` jest dowodem trwałości; prune tylko ≤ `snapshotSeq` kompletnego punktu po 30 dniach; `checkpoint.seq = appliedUpTo` | worker `prune`, `sync-kwarantanna`, `sync-dziennik-drenaz` |
| A2 `reconcile` po pullu dokłada setki cudzych encji → T3 → pełny PUT z telefonu | sweep przed pierwszym pullem sesji; wykluczenie `fromCloud`; iOS nigdy nie robi punktu automatycznie; import na iOS partiami | `sync-dziennik-outbox` scenariusz „10 dni offline” |
| A2 Nowe urządzenie: „Pomiń” → `register` → 409 → pełny PUT z telefonu; świeży iPhone pierwszy ocenia próg punktu | `register` tylko po `/status` 404; brak automatycznych punktów na iOS i przez 15 min po odtworzeniu; części ≤ 1 MiB; sufit 48 MB z odmową | e2e `sync-nowe-urzadzenie-punkt` |
| A2 Nowe urządzenie: pamięć 170 do 200 MB przy parsowaniu 32 MB JSON | części po ≤ 1 MiB scalane po kolei; pamięć jednej części | `sync-punkt-kontrolny-czesci`, pomiar na iPhonie |
| A3 iOS tryb lokalny: ubicie, zamrożenie w trakcie wysyłki, 429 | IndexedDB; `inflight` + `eid` dedup; 429 → `Retry-After` bez `attempts`; kubełek 120/min; odstęp reconnect WS 10 s | `sync-ios-tryby`, e2e `context.close()` |
| A3 Nagrobek odbudowany przy wysyłce z `new Date()` kasuje późniejszy zapis | nagrobki wyłącznie ze sklepu nagrobków; treść zamrożona; test źródłowy na `new Date()` w builderach | `sync-dziennik-outbox` |
| A3 Tryb chmurowy: `lock()` po bezczynności kasuje kolejkę w `veph:*` | kolejka w IndexedDB `vilda_user_<userId>`, poza prefiksem `veph:`; ekran blokady pokazuje liczbę zmian | `sync-ios-tryby` |
| A3 Tryb efemeryczny: kolejka w pamięci | brama przy blokadzie bez limitu czasu z trzema wyjściami; odraczanie blokady po bezczynności | `sync-ios-tryby` |
| A3 Zapis w ramce powłoki w trybie chmurowym: `top` odbudowuje treść, której nie ma | treść w wierszu, IndexedDB wspólna, `top` wysyła wiersz ramki | e2e `sync-powloka-ramki` |
| A3 `registered:false` po ubiciu sesji chmurowej → rejestracja pełnym blobem | pierwszy flush sesji wymaga udanego pobrania; `register` tylko po 404 | `sync-ios-tryby` |
| A3 Telefon jako nadawca punktu przy 2 Mbit/s: pętla ubicia w trakcie eksportu | iOS nigdy automatycznie; części ≤ 1 MiB; eksport strumieniowy od etapu 0 | `sync-ios-tryby` UA iOS |
| A3 Budżet 40/min zjadany przez reconnect WS i `pullNow` po `onopen` | osobny kubełek 120/min; polling 60 s przy WS; odstęp reconnect od 10 s | atrapa workera z licznikiem |
| A4 Brak AAD: delta przesadzona między slotami → `null` → kursor dalej → kotwica nad dziurą | AAD w zdarzeniach od etapu 4 i w częściach od etapu 3; kwarantanna; `appliedUpTo` | `sync-kwarantanna`, `sync-punkt-kontrolny-czesci` |
| A4 Stary klient dziedziczy kursor nad delty gz, których nie zastosował, i publikuje punkt | kompresja zdarzeń włączana dopiero po potwierdzeniu wersji wszystkich urządzeń z `checkpoint.devices`; pierwszy start nowego klienta: `appliedUpTo := max(0, kursor − 200)` i jednorazowy drenaż od tego miejsca przed pierwszym punktem | `sync-migracja-stary-klient` |
| A4 Rotacja: wiersze `sent` ze starym `seq`, flusher 401 na rotującym urządzeniu, kopia po rotacji trafia w usunięty slot i zakłada drugi | wiersze bez `seq` i bez slotu; flush przed rotacją; zerowanie `AUTH_FAILED`; kopia i kod niosą `sis`; `register` z kopii za potwierdzeniem | `sync-rotacja-outbox`, `kopia-konta-po-rotacji` |
| A4 Zmiana hasła w trakcie | bez zmian: LWW `cred`, brak pętli | `sync-haslo-w-trakcie` |
| A4 Rekord nieczytelny lokalnie blokuje każdy punkt z komputera | eksport pomija rekord, `skipped[]`, ostrzeżenie; wiersz `unreadable` bez ponowień | `sync-punkt-kontrolny-czesci` |
| A4 `mergeVaultBackup` kasuje kartę zaraz po jej dodaniu | reguły P-IMPORT-NAGROBEK w `ss` | `kopia-konta-nagrobek` |
| A4 `restore-prev` cofa punkt, urządzenia już skasowały strażników | wiersze kasowane tylko po `accepted`, nie po punkcie; wyzwalacz `rewind` | `sync-restore-prev-cofniecie` |
| A4 Zero-knowledge: klasa zdarzenia widoczna po rozmiarze | `_pad` do kubełków 4 KiB od etapu 4, decyzja D-12 | `sync-rozmiar-kubelki` |

**Otwarte ryzyka po przeszczepach:**

| Ryzyko | Skutek | Mitygacja |
|---|---|---|
| Limity Cloudflare z pamięci†: wiersz i wynik zapytania SQLite w DO, kwoty DO na planie Free, 50 subrequestów, 128 MB | strona `/changes` lub część punktu może wymagać zmniejszenia | etap 0b potwierdza w dokumentacji; wszystkie limity są zmiennymi |
| Produkcyjny `SlotHub` może nie być klasą SQLite | nowa klasa DO i migracja `headSeq` | właściciel sprawdza w dashboardzie przed etapem 1 |
| Transakcyjność kolejki: wpis w osobnej transakcji niż mutacja | okno milisekund „dane są, wpisu nie ma” | `sweepOutbox` po jawnych polach; manifest punktu; później `putWithOutbox` w jednej transakcji |
| Mutacja bez zmiany `updatedAtISO` (do sprawdzenia: `setSnapshotPinned`) | sweep jej nie znajdzie | audyt builderów w etapie 2; wpis dopisywany w emiterze, nie tylko przez sweep |
| Konflikt poprawki tej samej wersji: LWW nadpisuje bez kopii | częstsza synchronizacja uwidoczni konflikty, które dziś ginęły w nieudanych PUT | decyzja D-7 „wersja konfliktowa”, poza tym planem |
| Wydajność iPhone: gzip, AES, scalanie 600 kart w IndexedDB, Web Locks w tle | niezmierzone; Chromium i Node to nie WebKit | pomiar przyciskiem w Ustawieniach przed etapem 3; sufit 48 MB |
| Wersja iOS poniżej 16.4 | brak gzip; zdarzenia jawne 4 razy większe; punkt z telefonu i tak nie jest robiony | decyzja D-11 |
| Rollback workera do v36 po etapie 3 | wymaga pełnego PUT, po etapie 0 wykonalnego | realnie: naprawa v37 w miejscu |
| Tryb chmurowy: zrzut całego sejfu do `sessionStorage` po każdej zmianie, limit ~5 MB, zapis w `catch` | nierozwiązane tym planem | osobna decyzja; punkt w częściach tylko skraca start |
| Tryb efemeryczny i QR po rotacji liczą stary slot | urządzenie trafia w usunięty slot | decyzja D-13 |
| Konsumenci hooków poza integracją | ładunki hooków bez zmian; `Yn` przestaje wołać `syncPush()` | grep po `onPatientSaved` przed etapem 2 |
| Równoległe PR-y na `vilda_vault.js`, `vilda_sync*.js`, ALGORITHMS | konflikty wersji | jeden wątek na obszar, AGENTS § 9 |
| Metadane dla serwera: liczba i rytm zdarzeń | akceptacja właściciela | `_pad`, decyzja D-12 |

---

## 5. Etapy wdrożenia

Każdy etap to osobny PR do `audyt` z gałęzi `agent/sync-…`, draft, bez scalania przez agenta. Każdy PR: `npm ci`, `npm test`, `npx playwright install chromium`, `npm run test:e2e`, scenariusz offline PWA, desktop i widok mobilny, `npm run podbij-wersje` na końcu, zielone CI dla aktualnego SHA. Etap 1 to PR w `vilda-source` i wdrożenie przez właściciela.

### Etap 0: most doraźny, bez zmian serwera

**Wykonane jako P-SYNC-MOST (2026-10-07):** czytelnik gzip ze sniffem po odszyfrowaniu bloba, zapis gzip pełnej wysyłki od progu 4 MiB z wyłącznikiem `vilda-sync-gzip-v1=0` (bez flagi włączającej i bez dwóch wydań: mniejsze sejfy nie zmieniają formatu, a stary czytelnik na blobie gzip zatrzymuje się na `PARSE_FAILED` bez scalenia i bez wysyłki), limit czasu 30 s + 1 s/100 kB do 180 s dla żądań z ciałem bloba i dla pobrania bloba (od `size` z `/status`), rozmiar w komunikacie TIMEOUT i w wyniku wysyłki; P-SYNC-MOST-STOPKA: zapis przyjmuje tylko kompletny gzip (magic i ISIZE), bo Safari/iOS 16.4–16.5 ucina strumień. Po stronie serwera właściciel podnosi `MAX_PAYLOAD_BYTES`. **Wykonane jako P-SYNC-KURSOR (2026-10-08):** kursor `/changes` na najwyższej zwróconej delcie zamiast na `headSeq`; odstęp 1 s i 3 s z rozrzutem ×0,5–1,5 przed ponownym pobraniem po 412; keepalive sumowany w kolejce pełnej wysyłki. Bez `syncPull({force:true})` przy pustej partii, bo przy tym samym ETagu pobranie nie przynosi brakującej delty (uzasadnienie w `docs/clinical/ALGORITHMS.md`). **Jeszcze nie:** kompresja delt, eksport strumieniowy, przyciski w Ustawieniach, skrypt pomiaru.

| Pozycja | Treść |
|---|---|
| Zakres | czytelnik gzip ze sniffem `1F 8B` vs `7B` po `ut()` (`vilda_sync.js` 10 do 19) i w `G()` (`vilda_vault.js` 1618); zapis gzip bloba i delty za flagą (w P-SYNC-MOST: zapis bloba od progu 4 MiB z wyłącznikiem `vilda-sync-gzip-v1`, bez kompresji delt); eksport strumieniowy `exportSyncPayloadParts` po pacjentach do `CompressionStream`, jeden PUT; `limitCzasu(bajty) = 30 s + bajty / 100 kB/s`, pułap 180 s, tylko na pierwszym planie, dla `PUT` i `GET /blob`; WIPE_GUARD i ślad `bytes` w jednostkach po kompresji; odstęp 1, 3, 9 s z rozrzutem w pętli 412 (`ht` 403 do 412; w P-SYNC-KURSOR: 1 s i 3 s, bo prób jest 3); `Yt`: kursor := max zastosowanego `seq`, pusta partia przy `headSeq > kursor` → `syncPull({force:true})` (w P-SYNC-KURSOR: kursor na najwyższej zwróconej delcie, bez wymuszonego pobrania); `RATE_LIMIT_SLOT_RPM` jako zalecenie zmiany var; Ustawienia: przełącznik „Kompresja zapisu”, przyciski „Wyślij pełny stan teraz” i „bez kompresji”, „Pomiar kompresji”; skrypt `tests/scripts/pomiar-gzip-eksportu.mjs` |
| Pliki | `vilda_sync.js`, `vilda_vault.js`, `vilda_sync_integration.js`, `inline_ustawienia_04.js`, `custom-fixes.js`, testy, `docs/clinical/ALGORITHMS.md` (P-SYNC-KOMPRESJA), `docs/ARCHITECTURE.md` § 5 |
| Testy | `sync-kompresja-format`, `sync-kursor-luki`, e2e stary blob czytelny, e2e PUT 4 MB przy throttlingu 2 Mbit/s bez TIMEOUT |
| Kryterium odbioru | na fikcyjnym sejfie 600 kart: PUT po kompresji poniżej 5 MB, odczyt starego i nowego formatu, stary klient na nowym blobie dostaje `PARSE_FAILED` bez PUT; testy zielone; CI zielone |
| Ryzyko | urządzenie bez czytelnika odcięte głośno; czas gzip i pamięć na iPhonie niezmierzone; wydanie dwuetapowe: najpierw czytelnicy na wszystkich urządzeniach, potem zapis |
| Szacunek | 2 do 3 dni |
| Właściciel | aktualizacja wszystkich urządzeń do wydania z czytelnikami; włączenie „Kompresji zapisu” jednego dnia na wszystkich; „Wyślij pełny stan teraz” z komputera; pomiar gzip eksportu i „Pomiar kompresji” na iPhonie; przekazanie wyników |

### Etap 1: worker v37

| Pozycja | Treść |
|---|---|
| Zakres | tabele `ev`, `cp` w `SlotHub`; `/append`, `/range`, `/checkpoint-*`, `/prune`, `/wipe`; `events.js`, `checkpoints.js`; `changes.js` stronicowany i legacy; `delta.js` zapis przed 202; `upload.js` `checkpoint-legacy` i `Content-Length`; `restore_prev.js` `Content-Length`; `status.js`; `remove.js`; `ratelimit.js` kubełek `rl:sync`; `/v1/health` z `features`; `X-Api-Version: 37`; vars w `wrangler.toml` |
| Pliki | `vilda-sync-worker/src/durable/slot_hub.js`, `src/handlers/{events,checkpoints,changes,delta,upload,restore_prev,status,remove}.js`, `src/middleware/ratelimit.js`, `src/worker.js`, `src/middleware/security.js`, `wrangler.toml`, `test/*` |
| Testy | testy workera z 3.10 na prawdziwych modułach z atrapami; Miniflare dla SQLite jeśli dostępne |
| Kryterium odbioru | wszystkie ścieżki v36 zachowują odpowiedzi dla starego klienta; `/changes` legacy przy obcięciu `headSeq` = ostatni zwrócony; `202` dopiero po zapisie; prune nigdy ponad `snapshotSeq`; `DELETE` czyści DO; testy zielone |
| Ryzyko | nowy kod DO SQLite; limity DO†; klasa produkcyjna do potwierdzenia |
| Szacunek | 3 do 5 dni plus wdrożenie |
| Właściciel | potwierdzenie klasy SQLite i planu; `wrangler deploy`; `GET /v1/health` → `api:37`; `GET /changes?since=0` własnym tokenem; obserwacja 2 dni na starych klientach |

### Etap 2: kolejka i zdarzenia jednej encji

| Pozycja | Treść |
|---|---|
| Zakres | `vilda_sync_outbox.js` nowy; IDB 5 → 6 ze sklepami `outbox`, `syncQuarantine` w `Sa()` i `Ze`; 17 builderów i emisji z tabeli 3.5 w tym `patient.full`, `onPatientTombstoneRejected`, `onBulkChange`, `partialSince`; `detectApi()`, `pushEvents`, `drainChanges` z `requiresBase`, ciągłością, kwarantanną, `appliedUpTo`, `ownEids`; `sweepOutbox`; nadawca z Web Lock i biciem serca; `flushKeepalive`; brama blokady w trybie efemerycznym; kolejka chmurowa w IndexedDB; `markSyncCaughtUp`; integracja: sześć ścieżek `sendBeacon` → `scheduleFlush`, `m()/Pt()/Qw*` → debounce 1,5 s, `I()` → `attempts` w wierszu, `Qw5` → `count()`; `vilda_realtime.js` `eid` i kursor; polling 60 s przy WS; UI „N zmian czeka”, kwarantanna, karty niepełne; ślady P-SYNC-SLAD `sync.push.ok`, `sync.event.unreadable`, `sync.gap`; flaga `vilda-event-log-v1` włączona tylko przy `features.events`; pełny PUT zostaje jako ścieżka legacy; `mergeVaultBackup` z regułami importu; kopia i kod z `sis` |
| Pliki | `vilda_sync_outbox.js?v=1`, `vilda_vault.js`, `vilda_sync.js`, `vilda_sync_integration.js`, `vilda_realtime.js`, `custom-fixes.js`, `inline_ustawienia_04.js`, `vilda_save_status_indicator.js`, SW, `docs/clinical/ALGORITHMS.md` (P-DZIENNIK-ZDARZEN), `docs/ARCHITECTURE.md` |
| Testy | `sync-dziennik-outbox`, `sync-dziennik-drenaz`, `sync-dziennik-wlasnosciowy`, `sync-pokrycie-mutacji`, `sync-wskrzeszenie-calej-karty`, `sync-kwarantanna`, `sync-rotacja-outbox`, `kopia-konta-po-rotacji`, `kopia-konta-nagrobek`, `sync-ios-tryby`, `sync-haslo-w-trakcie`, `sync-migracja-stary-klient`, e2e `sync-dwa-urzadzenia-zdarzenia`, `sync-powloka-ramki`, atrapa workera |
| Kryterium odbioru | test własnościowy A ≡ B; pokrycie 17 mutacji z pustą różnicą; scenariusz trzech urządzeń z ataku 1 zbieżny w obu kolejnościach; e2e ubicia kontekstu; mobilny widok bez poziomego przewijania; CI zielone |
| Ryzyko | zasięg zmian w sejfie; zabezpieczenie: ładunki hooków bez zmian, `Le` bez zmian, testy pokrycia i zbieżności; decyzje D-3 do D-8 wpływają na zakres |
| Szacunek | 5 do 7 dni |
| Właściciel | decyzje D-1 do D-9 przed startem; aktualizacja urządzeń; sprawdzenie `SW_VERSION` w Ustawieniach na każdym |

### Etap 3: punkty kontrolne w częściach, koniec pełnej wysyłki

| Pozycja | Treść |
|---|---|
| Zakres | `exportSyncPayloadParts` z manifestem, `skipped[]`, `devices[]`; `publishCheckpoint` z begin, częściami, commit; `restoreFromCheckpoint`; nowe urządzenie z punktu bez PUT, nakładka i „Pomiń” bez rejestracji; tryb chmurowy z punktu; rotacja przez punkt; planowanie automatyczne tylko na nie-iOS: `headSeq − snapshotSeq ≥ 500` lub 7 dni, lider, karta widoczna, kolejka pusta; wyzwalacz `rewind`; manifest → kolejka; AAD części; przyciski „Utwórz punkt kontrolny z tego urządzenia”, „Pobierz punkt kontrolny”; sufit 48 MB na iOS; `syncFull` = flush + drain bez PUT |
| Pliki | `vilda_vault.js`, `vilda_sync.js`, `vilda_sync_integration.js`, `inline_index_10.js`, `inline_ustawienia_04.js`, SW, dokumentacja |
| Testy | `sync-punkt-kontrolny-czesci`, `sync-restore-prev-cofniecie`, e2e `sync-nowe-urzadzenie-punkt`, pomiar na iPhonie |
| Kryterium odbioru | nowe urządzenie z 3 części plus ogon bez PUT; part-by-part ≡ blob; iOS nie robi punktu automatycznie; rotacja przez punkt; CI zielone |
| Ryzyko | pamięć i czas na iPhonie; `parts ≤ 40` przy planie Free†; rollback workera wymaga PUT |
| Szacunek | 4 do 5 dni |
| Właściciel | sztafeta punktów z 3.8 w kolejności komputer, iPhone, reszta; „Pomiar kompresji” na iPhonie przed włączeniem części; obserwacja panelu w Ustawieniach |

### Etap 4: kompresja zdarzeń, AAD, wypełnienie

| Pozycja | Treść |
|---|---|
| Zakres | `z:'gzip'` w kopercie, gzip przed `V()`; AAD `slot/eid` z `aad:1`; `_pad` do 4 KiB; sniff w `ps`; flaga `vilda-event-gzip-v1` włączana w Ustawieniach po pokazaniu listy urządzeń i wersji z ostatniego punktu; opcjonalny rekey na `syncEncKey` wg D-9 |
| Pliki | `vilda_vault.js`, `vilda_sync.js`, `inline_ustawienia_04.js` |
| Testy | `sync-rozmiar-kubelki`, rozszerzenie `sync-kompresja-format` o zdarzenia i AAD, stary `ps` na zdarzeniu gz → kwarantanna u nowego, `null` u starego |
| Kryterium odbioru | zdarzenie zapisu poniżej 8 tysięcy znaków; AAD odrzuca szyfrogram z innego slotu; CI zielone |
| Ryzyko | stary klient na zdarzeniu gz pomija je po cichu; serwer tego nie wymusi |
| Szacunek | 1 do 2 dni |
| Właściciel | potwierdzenie listy urządzeń i włączenie flagi |

### Etap 5: porządki

| Pozycja | Treść |
|---|---|
| Zakres | usunięcie sześciu ścieżek `sendBeacon` i `buildPatientDelta` z integracji, `/deltas` i prefiksu `<slot>/d/`, flagi `vilda-incr-sync-v1`, STALE_DEVICE_GUARD i WIPE_GUARD w starej formie (zostaje `wipe_guard` commitu), `PUT /blob` dla nowych klientów; `GET /blob` jako czytelnik `blob-v1` przez 6 miesięcy; `putWithOutbox` w jednej transakcji IDB; dokumentacja końcowa; wpis o koordynatorze slotu jako osobnej decyzji |
| Pliki | klient i worker |
| Testy | regresja całości; usunięte testy legacy zastąpione testami nowej ścieżki bez zmniejszania liczby asercji |
| Kryterium odbioru | brak odwołań do usuniętych ścieżek; CI zielone |
| Ryzyko | niskie |
| Szacunek | 2 dni |
| Właściciel | wdrożenie workera v38 z usunięciem `/deltas` |

Łącznie 17 do 24 dni pracy agenta w 6 PR-ach, z czego etap 1 w `vilda-source`.

---

## 6. Decyzje właściciela

| Nr | Pytanie | Rekomendacja | Skutek braku decyzji |
|---|---|---|---|
| D-1 | Hybryda H zamiast czystego D1 z rankingu? | tak; D1 broni danych oknami czasowymi, hybryda zamyka utratę u źródła | plan nie rusza |
| D-2 | Etap 0 od razu, przed workerem? | tak; 2 do 3 dni i chmura odmrożona; format części punktu jest ten sam | chmura zamrożona do etapu 3 |
| D-3 | Nagłówek karty przy zmianie w miejscu: `headerUpdatedAtISO` i zapis nagłówka także bez nowych wersji? | tak; dziś nie przenosi tego nawet pełny blob; zmiana reguły scalania, wpis ALGORITHMS, test, akceptacja | zmiana nazwiska lub daty urodzenia w miejscu nie dociera na inne urządzenia |
| D-4 | Poprawka pomiaru, usunięcie wiersza i przypięcie podnoszą `lastSavedAtISO` karty? | tak; inaczej nagrobek z wcześniejszej godziny kasuje kartę poprawioną później | utrata poprawek przy usunięciu z innego urządzenia |
| D-5 | `lastSavedAtISO` nigdy nie maleje po koszu najnowszej wersji? | tak | starszy nagrobek wygrywa z kartą, na której pracowano później |
| D-6 | Kosz z innego urządzenia kontra lokalna nowsza poprawka: kosz trzyma nowszą treść lokalną? | tak | „Przywróć” oddaje starszą treść, poprawka ginie |
| D-7 | Konflikt poprawki tej samej wersji na dwóch urządzeniach: nadpisanie jak dziś czy „wersja konfliktowa”? | zostawić LWW w tym planie, osobna decyzja później | bez zmian wobec dziś |
| D-8 | `deleteSnapshot` wołane wewnętrznie: lokalne czy nagrobek? | lokalne z wpisem w ALGORITHMS | bez zmian wobec dziś |
| D-9 | Klucz zdarzeń: klucz główny jak dziś czy `syncEncKey`? | klucz główny; zgodność ze starym klientem w etapach 2 i 3 | brak |
| D-10 | Plan Cloudflare Free czy Paid; potwierdzenie limitów † | sprawdzić przed etapem 1 | zbyt duże strony lub części |
| D-11 | Wersje iOS urządzeń; czy wymagać 16.4 dla kompresji? | sprawdzić; bez gzip zdarzenia jawne nadal działają | telefon bez kompresji pełnego stanu |
| D-12 | Wypełnienie `_pad` do 4 KiB i akceptacja metadanych: liczba i rytm zdarzeń | włączyć | serwer rozróżnia klasę zdarzenia po rozmiarze |
| D-13 | QR i tryb efemeryczny po rotacji: QR przesyła pęczek `dek + sis` jak kod synchronizacji? | tak | sesje QR po rotacji trafiają w usunięty slot |
| D-14 | Tryb chmurowy: kolejka zaszyfrowana w IndexedDB, czyli dane w spoczynku do czasu wysłania? | tak | niewysłane zmiany giną z sesją |
| D-15 | Nieczytelne zdarzenie w kwarantannie: kursor idzie dalej, punkt przy `appliedUpTo`, ręczne „Zwolnij”? | tak | urządzenie zawisa albo gubi po cichu |
| D-16 | Retencje: kosz 30 dni w chmurze jak dziś, dziennik 30 dni po punkcie, 2 punkty w zapasie | tak | brak |
| D-17 | Koordynator slotu: razem z v37 czy osobno? | osobno, po etapie 3 | zależność każdej partii od drugiego DO |
| D-18 | Po etapie 5: `GET /blob` jako czytelnik `blob-v1` przez 6 miesięcy? | tak | brak |
| D-19 | Odchudzenie zapisu z gotowych wyników, 84,5 % migawki | poza tym planem; zmiana kliniczna; kompresja daje większość zysku | brak |
| D-20 | Kolejność i termin migracji urządzeń | komputer główny, iPhone, pozostałe; po etapie 3 | brak |

---

## 7. Odrzucone warianty

| Wariant | Dlaczego odrzucony |
|---|---|
| Tylko podniesienie `MAX_PAYLOAD_BYTES` lub limitu czasu | wysyłka pada na czasie i pamięci, nie na limicie; każda pełna wysyłka zmusza inne urządzenia do pełnego pobrania; sejf rośnie |
| Czysty D1: delty per zdarzenie i punkty na workerze v36 bez zmian serwera | 3 z 4 ataków krytyczne: strażnik u nadawcy kasowany kotwicą punktu nad pominiętą deltą, 202 bez trwałości, cap i TTL dziennika, kolejka w sesji trybu chmurowego; obrona oknami 36 i 72 godzin zamiast gwarancji |
| D2: obiekt per migawka w R2 z indeksem HMAC w DO | najszerszy zasięg zmian w sejfie i serwerze; serwer poznaje liczbę i rozkład rozmiarów obiektów; przełącznik `upgrade` odcina stary klient także z odczytu; 5 do 7 tygodni |
| Wiersze-referencje w kolejce | treść budowana przy wysyłce gubi niewysłany zapis skasowany cudzym nagrobkiem i pozwala nagrobkowi dostać nowy znacznik; łamie idempotencję po `eid` |
| Dziennik delt nadal w R2 | 1 `list` i N `get` na każde pobranie; na planie Free pada powyżej około 44 delt; stronicowanie `list` nieobsługiwane |
| Punkt kontrolny jednym PUT z każdego urządzenia | iPhone przy 2 Mbit/s i w tle; pamięć; dlatego części ≤ 1 MiB i nigdy automatycznie z iOS |
| Multipart R2 dla punktu | części punktu po kompresji mają poniżej 5 MiB†, multipart nic nie daje |
| Strumieniowe ciało `fetch` | brak w Safari, iOS i Firefox |
| Background Sync i Periodic Sync | brak w Safari i iOS |
| Kompresja za strumieniem gzip jako wypełnienie | `DecompressionStream` może odrzucać dane po końcu członu†; wypełnienie wewnątrz JSON |
| Przejście zdarzeń na `syncEncKey` w etapie 2 | niezgodność ze starym klientem bez zysku; możliwe w etapie 4 |
| Lustro `headSeq` w KV do pollingu | limit około 1 zapisu na sekundę na klucz†; `/changes` i tak pyta DO |
| Odchudzenie migawki z gotowych wyników jako element planu | zmiana kliniczna wymagająca osobnej akceptacji; kompresja daje 17 razy bez niej |
| Koordynator slotu jako warunek | numer w transakcji daje tę samą własność; koordynator fail-closed dodaje drugi DO na ścieżce każdej partii |
| Blokowanie punktu kontrolnego przy jakimkolwiek `partialSince` | bez górnego ograniczenia czasu zablokowałoby wszystkie urządzenia, gdy posiadacz pełnej historii jest offline; zamiast tego punkt eksportuje `partialSince`, a posiadacz reaguje |
