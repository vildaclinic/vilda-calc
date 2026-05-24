# Wdrożenie płatnej subskrypcji PRO (49 zł / mc) — przewodnik (klient + serwer)

Status na dziś: **istnieje wyłącznie 30‑dniowy trial PRO**. Płatnej subskrypcji
NIE MA. Ten dokument opisuje, co dołożyć, żeby ją uruchomić, oraz jak uniknąć
pułapek, które już zidentyfikowaliśmy w obecnej architekturze.

---

## 1. Jak PRO działa DZIŚ (punkt wyjścia)

### Serwer (Cloudflare Worker `vilda-sync-worker`)
- Jedyny mechanizm: **trial** keyowany `slotId` w KV pod kluczem `trial:<slotId>`.
  Wartość: `{ plan: "pro", validUntil, activatedAt }`, **bez TTL**.
- Endpointy: `POST /v1/slots/:slotId/trial` (aktywuj/zwróć), `GET /v1/slots/:slotId/trial` (odczyt).
- Autoryzacja: Bearer `authToken` (= HKDF(masterKey)); serwer trzyma tylko `SHA‑256(authToken)`.
- `slotId` = HKDF(masterKey). **To jest pułapka:** uprawnienie jest przywiązane do
  klucza głównego — zmiana mastera (rotacja / „wyloguj wszystkie urządzenia")
  zmienia `slotId` i osierada wpis PRO.

### Klient
- `vilda_pro_access.js`: `hasAccess()` SYNCHRONICZNIE czyta cache
  `localStorage['vilda-pro-plan-v1:<userId>']` = `{ plan, validUntil, activatedAt, userId, cachedAt }`.
  PRO = `plan==='pro' && validUntil > teraz`.
- `setPlan(plan, validUntil, activatedAt)` zapisuje cache i odpala `vildaProAccessChanged`.
- Warstwa 3 (w `vilda_auth_ui.js`, onUnlock): fire‑and‑forget `GET /trial`, na sukcesie
  woła `setPlan(...)`. **404/401 jest CICHO ignorowane — nigdy nie degraduje PRO.**

---

## 2. ZŁOTA ZASADA dla subskrypcji

**Nie wiąż uprawnienia PRO ze `slotId` ani z kluczem głównym.**
Subskrypcja musi być keyowana po **stabilnej tożsamości rozliczeniowej** (`billingId`),
niezależnej od mastera/slotu — wtedy rotacja klucza („wyloguj wszystkie urządzenia")
jest dla PRO całkowicie obojętna, a webhook płatności po prostu odświeża `validUntil`.

`billingId`:
- losowy, trwały identyfikator (np. 16–32 B base64url) generowany raz dla konta,
- przechowywany lokalnie (w meta usera / vault) i NIEZALEŻNY od masterKey,
- mapowany u dostawcy płatności na `customerId`/`subscriptionId`.

---

## 3. Wybór dostawcy płatności (PLN, 49 zł/mc)

Opcje: **Stripe** (obsługuje PLN, najprostsze API + webhooki + Customer Portal),
**Przelewy24 / Tpay / PayU** (popularne w PL, BLIK). Rekomendacja na start: Stripe
(Subscriptions + Billing Portal — gotowe zarządzanie subskrypcją, faktury, anulowanie).
Reszta dokumentu jest pisana provider‑agnostycznie; przykłady odnoszą się do modelu
„subscription + webhook + portal".

---

## 4. Zmiany po stronie SERWERA (worker)

### 4.1 Nowy magazyn uprawnień (KV), keyowany billingId
- Klucz KV: `entitlement:<billingId>` → `{ plan: "pro", status: "active|past_due|canceled", validUntil, updatedAt, provider, customerId, subscriptionId }`.
- **Niezależny od `slotId`** — przeżywa rotację mastera.

### 4.2 Webhook dostawcy płatności
- `POST /v1/billing/webhook` (bez auth Bearer — weryfikacja **podpisu** dostawcy, np.
  `Stripe-Signature`, sekret w `env`).
- Na zdarzenia `invoice.paid` / `customer.subscription.updated` / `...deleted`:
  zaktualizuj `entitlement:<billingId>` (ustaw `validUntil`, `status`).
- Mapowanie `customerId → billingId`: zapisz przy tworzeniu subskrypcji (metadata
  Stripe `billingId`, albo osobny wpis KV `cust:<customerId> → billingId`).

### 4.3 Start checkout / portal
- `POST /v1/billing/checkout` (auth: Bearer slotu albo lekka tożsamość) → tworzy/zwraca
  sesję checkout dostawcy z `metadata.billingId` i ceną 49 zł/mc. Zwraca URL do redirectu.
- `POST /v1/billing/portal` → URL do Customer Portal (zarządzanie/anulowanie).

### 4.4 Odczyt uprawnienia przez klienta
- `GET /v1/billing/entitlement` z nagłówkiem `X-Billing-Id: <billingId>` **i** dowodem
  posiadania (np. podpis HMAC z sekretu wyprowadzonego z masterKey, lub po prostu
  Bearer slotu + mapping). Zwraca `{ plan, status, validUntil }`.
  - Uwaga bezpieczeństwa: `billingId` sam w sobie nie powinien wystarczać do odczytu
    (to nie sekret klasy authToken) — dodaj prosty dowód posiadania, żeby cudzy
    `billingId` nie ujawniał statusu. Najprościej: trzymaj `entitlementToken` =
    HKDF(masterKey, "billing") obok billingId i wymagaj go (hash w KV, jak przy slocie).

### 4.5 Routing/limity/CORS
- Dodaj trasy w `src/worker.js` (wzór: istniejące `ROUTES`), rate‑limit `'none'` dla
  webhooka (chroniony podpisem) i `'slot'`/dedykowany dla pozostałych.
- Webhook MUSI być wykluczony z CORS‑origin restrykcji (przychodzi od dostawcy, nie z przeglądarki).
- Nowe handlery: `src/handlers/billing_webhook.js`, `billing_checkout.js`,
  `billing_portal.js`, `billing_entitlement.js`. Sekrety w `wrangler.toml [vars]` /
  `wrangler secret put` (klucz API dostawcy, webhook signing secret).

### 4.6 Współistnienie z trialem
- `hasAccess` na kliencie: PRO = trial‑aktywny **LUB** subskrypcja‑aktywna.
- Przy starcie subskrypcji można zignorować/zostawić trial — liczy się max(validUntil).

---

## 5. Zmiany po stronie KLIENTA

### 5.1 `vilda_vault.js`
- Wygeneruj i utrwal `billingId` + `entitlementToken` w meta usera (raz; przeżywa
  rotację mastera, bo jest osobny). Eksponuj `getBillingMaterial()`.
  - WAŻNE przy rotacji: `billingId` zostaje, `entitlementToken` jeśli = HKDF(masterKey)
    to po rotacji się zmieni → wtedy trzeba zaktualizować jego hash na serwerze w ramach
    rotacji. Prościej: `entitlementToken` losowy i trwały (jak billingId), niezależny od mastera.

### 5.2 `vilda_pro_access.js`
- Rozszerz źródła PRO: cache obejmuje też subskrypcję; `setPlan` wołane po
  `GET /v1/billing/entitlement`. Rozważ: na `status==='canceled'`/wygasłe **degraduj**
  (w przeciwieństwie do dzisiejszego „nigdy nie degraduj" dla triala — dla płatności
  trzeba odzwierciedlać wygaśnięcie, z rozsądnym grace period i obsługą offline:
  degraduj dopiero gdy serwer potwierdzi wygaśnięcie, nie przy zwykłym braku sieci).

### 5.3 `vilda_auth_ui.js` (warstwa 3) + UI Ustawień
- Dołóż odpytanie `GET /v1/billing/entitlement` obok `GET /trial`.
- UI w `ustawienia.html`: „Subskrypcja PRO — 49 zł/mc", przyciski „Kup/Zarządzaj"
  (redirect do checkout/portalu), status i `validUntil`.

### 5.4 Koordynacja wersji (jak zawsze)
- Bump `?v` zmienianych plików + wpisy w shell SW; `SW_VERSION`; synchronizacja testów.
  Worker: deploy `wrangler deploy` + ustawienie sekretów dostawcy.

---

## 6. Interakcja z „wyloguj wszystkie urządzenia" (rotacja klucza głównego)

- Jeśli PRO jest keyowane `billingId` (stabilny) → **rotacja nie rusza subskrypcji**.
  Webhook dalej odświeża `entitlement:<billingId>`; klient po rotacji nadal czyta to
  samo uprawnienie. To główny powód, żeby NIE keyować PRO slotId.
- TRIAL (keyowany slotId) — przy rotacji trzeba go zmigrować na nowy slot (patrz plan
  rotacji), albo po wdrożeniu subskrypcji uznać trial za drugorzędny.
- `entitlementToken`: jeśli wyprowadzany z masterKey, rotacja musi zaktualizować jego
  hash na serwerze (część flow rotacji). Dlatego rekomendacja: token billing **losowy,
  trwały**, niezależny od mastera — zero sprzężenia z rotacją.

---

## 7. Checklist wdrożenia (kolejność)

1. Konto u dostawcy płatności, produkt „PRO 49 zł/mc", klucze API + webhook secret.
2. Worker: magazyn `entitlement:<billingId>`, webhook, checkout, portal, entitlement‑read; deploy + sekrety.
3. Klient: `billingId`/`entitlementToken` w vault; rozszerzenie `vilda_pro_access` (źródła + degradacja); warstwa 3; UI Ustawień.
4. Współistnienie trial + subskrypcja w `hasAccess` (max validUntil; degradacja tylko po potwierdzeniu serwera).
5. Testy: webhook (podpis, idempotencja zdarzeń), entitlement‑read (dowód posiadania), degradacja po anulowaniu, offline‑grace, interakcja z rotacją mastera.
6. Koordynacja wersji + deploy.

---

## 8. Pułapki do uniknięcia (skrót)

- ❌ Keyowanie PRO `slotId`/masterKey → łamie się przy rotacji. ✅ `billingId` stabilny.
- ❌ `billingId` jako jedyny „klucz" do odczytu statusu → dodaj dowód posiadania.
- ❌ Degradacja PRO przy zwykłym 404/offline → ryzyko fałszywego odbierania dostępu.
  ✅ Degraduj tylko na potwierdzone wygaśnięcie/anulowanie + grace period.
- ❌ Webhook bez weryfikacji podpisu → podszywanie. ✅ Weryfikuj `Signature` sekretem.
- ❌ Brak idempotencji webhooka → podwójne zdarzenia psują stan. ✅ Klucz idempotencji / porównanie `updatedAt`.
