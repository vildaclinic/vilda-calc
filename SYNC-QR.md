# Vilda QR Transfer — Dokumentacja techniczna

## Cel funkcji

QR Transfer umożliwia zalogowanie się na nowym urządzeniu (np. komputerze) przez zatwierdzenie
żądania z już zalogowanego urządzenia (np. telefonu). Jest to **jedyna metoda cross-device logowania
która nie wymaga ani pliku .wiw, ani kodu synchronizacji, ani ręcznego wpisywania hasła na nowym urządzeniu**.

Główny scenariusz: telefon jako "klucz" do logowania na dowolnym komputerze.

---

## Architektura — model bezpieczeństwa

### Zero-knowledge relay

Serwer (Cloudflare Worker + KV) pełni rolę anonimowego pośrednika.
**Nigdy nie ma dostępu do masterKeyBytes ani do żadnych danych odszyfrowanych.**

Co serwer widzi:
- Klucz publiczny ECDH P-256 komputera (bezpieczny z definicji, publiczny)
- Zaszyfrowany blob: `AES-256-GCM(HKDF(ECDH_shared_secret), masterKeyBytes)` — nieodszyfrowalny bez klucza prywatnego komputera
- transferToken (44 znaki base64url, 256 bitów) — jednorazowy identyfikator sesji

### Kryptografia: ECIES (Elliptic Curve Integrated Encryption Scheme)

```
Komputer generuje:
  compPriv, compPub  = ECDH P-256 keypair

  → compPub wysyłany do serwera (KV)

Telefon pobiera compPub i generuje:
  ephPriv, ephPub    = ECDH P-256 keypair (efemeryczna, jednorazowa)

Obydwa urządzenia niezależnie obliczają ten sam shared_secret:
  shared_secret = ECDH(compPriv, ephPub) = ECDH(ephPriv, compPub)

Telefon wyprowadza klucz szyfrujący:
  aesKey = HKDF-SHA256(
    ikm  = shared_secret,
    salt = 0x00...00 (32 bajty),
    info = "wagaiwzrost.pl:qr-transfer:v1"
  ) → AES-256-GCM key

Telefon szyfruje masterKeyBytes:
  iv, ciphertext = AES-256-GCM(aesKey, masterKeyBytes)

Telefon wysyła do serwera:
  { ephemeralPublicKeyB64u: ephPub, iv, ciphertext }

Komputer pobiera z serwera i odszyfrowuje:
  aesKey = HKDF-SHA256(ECDH(compPriv, ephPub), ...)
  masterKeyBytes = AES-256-GCM.decrypt(aesKey, iv, ciphertext)
```

### Gwarancje bezpieczeństwa

| Zagrożenie | Ochrona |
|---|---|
| Przechwycenie połączenia HTTPS | TLS szyfruje transport; nawet bez TLS blob jest zaszyfrowany |
| Pełny dump KV serwera | Bez compPriv (w pamięci komputera) blob jest nieodszyfrowalny |
| Kradzież transferToken | Token bez compPriv jest bezużyteczny; TTL 120s limituje okno |
| Replay attack (wielokrotne użycie) | Token jest jednorazowy: PUT zmienia status → 'ready', kolejne PUT → 409 |
| Brute force tokenów | 256-bit token: 2^256 przestrzeń, niemożliwe |
| Fałszywy telefon zatwierdza cudzy QR | Tylko zalogowany użytkownik zna swój masterKeyBytes; weryfikacja hasłem |

---

## Przepływ (flow krok po kroku)

### Strona komputera (nowe urządzenie)

```
1. Użytkownik klika "📱 Zaloguj się przez QR" na ekranie logowania
2. VildaVault.initiateQRLogin()
   a. VildaCrypto.generateECDHKeypair() → { privateKey, publicKeyB64u }
   b. POST /v1/transfer { ecdhPublicKeyB64u } → { transferToken, expiresIn: 120 }
   c. Serializuj privateKey → PKCS#8 base64url → sessionStorage
   d. Zwróć { qrData: "vsc1-qr:{transferToken}", transferToken, privateKeyB64u, expiresIn }
3. Wyświetl QR kod (qrcodejs @ cdnjs)
4. Odliczaj 120s; polling co 3s: VildaVault.pollQRLoginStatus(transferToken)
   → GET /v1/transfer/{token} → { status, encryptedPayload? }
5. Gdy status = 'ready': pokaż formularz "Ustaw hasło dla tego urządzenia"
6. Użytkownik wpisuje hasło i nazwę konta → VildaVault.completeQRLogin(privateKeyB64u, encryptedPayload, { newPassword, label })
   a. Importuj PKCS#8 → CryptoKey (privateKey)
   b. VildaCrypto.decryptFromTransfer(privateKey, encryptedPayload) → masterKeyBytes (32 bajty)
   c. Utwórz nowe konto w IndexedDB z tym samym masterKey (nowy userId, nowe hasło)
   d. adoptMasterBytes() → vault odblokowany → onUnlock → sync probe → interstitial
```

### Strona telefonu (zalogowane urządzenie)

```
1. Użytkownik otwiera Ustawienia → "Zatwierdź logowanie QR" → klika "📷 Skanuj kod QR"
2. Uruchom kamerę (getUserMedia + BarcodeDetector API)
   a. Skanuj klatki w pętli (co 250ms) przez BarcodeDetector.detect()
   b. Gdy znaleziony QR → wyciągnij token (po "vsc1-qr:" prefix)
   c. Fallback: ręczne wklejenie tokenu (gdy brak kamery / BarcodeDetector)
3. Użytkownik wpisuje hasło → klik "Zatwierdź"
4. VildaVault.approveQRLogin(transferToken, password)
   a. Weryfikuj hasło: re-derive klucza + decrypt encryptedMasterByPassword
   b. GET /v1/transfer/{token} → pobierz compPub (ecdhPublicKeyB64u)
   c. VildaCrypto.encryptForTransfer(masterKeyBytes, compPub)
      → generuje ephKeypair, ECDH, HKDF, AES-GCM → { ephemeralPublicKeyB64u, iv, ciphertext }
   d. PUT /v1/transfer/{token} z payloadem
5. Serwer zmienia status → 'ready', TTL redukuje się do 30s
6. UI: "✓ Zatwierdzono! Drugie urządzenie może teraz się zalogować."
```

---

## API serwera (Cloudflare Worker)

### POST /v1/transfer

Tworzy nową sesję QR transfer.

**Request:**
```json
{
  "ecdhPublicKeyB64u": "<87-char base64url — klucz publiczny ECDH P-256 komputera>"
}
```

**Response 201:**
```json
{
  "transferToken": "<43-char base64url>",
  "expiresIn": 120
}
```

**Rate limit:** 5 żądań/minutę per IP (konfigurowalne przez `RATE_LIMIT_TRANSFER_RPM` w `wrangler.toml`)

---

### GET /v1/transfer/:token

Odpytuje status sesji. Używane przez obydwa urządzenia (polling + pobieranie compPub).
Brak wymagania Authorization Bearer — transferToken (256 bit) jest sam w sobie sekretem.

**Response 200 (status pending):**
```json
{
  "status": "pending",
  "ecdhPublicKeyB64u": "<87-char base64url>"
}
```

**Response 200 (status ready):**
```json
{
  "status": "ready",
  "ecdhPublicKeyB64u": "<87-char base64url>",
  "encryptedPayload": {
    "ephemeralPublicKeyB64u": "<87-char base64url>",
    "iv": "<16-char base64url — 12 bajtów>",
    "ciphertext": "<64-char base64url — 48 bajtów: 32 masterKey + 16 GCM tag>"
  }
}
```

**Response 404:** Token nie istnieje lub wygasł.

**Rate limit:** 40 pollów/minutę per token.

---

### PUT /v1/transfer/:token

Telefon dostarcza zaszyfrowany masterKey.

**Request:**
```json
{
  "ephemeralPublicKeyB64u": "<87-char base64url>",
  "iv": "<16-char base64url>",
  "ciphertext": "<64-char base64url>"
}
```

**Response 200:** `{ "ok": true }`

**Response 409:** Token już był użyty (idempotency guard).

**Response 404:** Token wygasł.

---

## KV schema

```
klucz:   "transfer:{transferToken}"
TTL:     120s (pending) → 30s (ready, po PUT)

wartość (pending):
{
  "ecdhPublicKeyB64u": "...",
  "status": "pending",
  "encryptedPayload": null,
  "createdAt": "2026-05-09T12:00:00.000Z"
}

wartość (ready):
{
  "ecdhPublicKeyB64u": "...",
  "status": "ready",
  "encryptedPayload": {
    "ephemeralPublicKeyB64u": "...",
    "iv": "...",
    "ciphertext": "..."
  },
  "createdAt": "2026-05-09T12:00:00.000Z"
}
```

Rate limit keys: `"rl:transfer:{ip}"`, `"rl:tpoll:{token}"` — TTL 120s, analogicznie do istniejącego rate limitera.

---

## API klienta JavaScript

### VildaCrypto

| Funkcja | Opis |
|---|---|
| `generateECDHKeypair()` | Generuje parę kluczy ECDH P-256. Klucz prywatny jest extractable (do serializacji). Zwraca `{ privateKey: CryptoKey, publicKeyB64u: string }` |
| `exportECDHPrivateKey(privateKey)` | Serializuje klucz prywatny do PKCS#8 base64url (do sessionStorage) |
| `importECDHPrivateKey(b64u)` | Deserializuje klucz prywatny z PKCS#8 base64url |
| `encryptForTransfer(masterKeyBytes, peerPublicKeyB64u)` | ECIES szyfrowanie masterKeyBytes. Generuje ephemeralKeypair, ECDH, HKDF, AES-256-GCM. Zwraca `{ ephemeralPublicKeyB64u, iv, ciphertext }` |
| `decryptFromTransfer(privateKey, payload)` | Odszyfrowuje masterKeyBytes z payloadu `{ ephemeralPublicKeyB64u, iv, ciphertext }` |

### VildaVault

| Funkcja | Opis |
|---|---|
| `initiateQRLogin()` | Strona komputera (vault ZABLOKOWANY). Generuje keypair, rejestruje token. Zwraca `{ qrData, transferToken, privateKeyB64u, expiresIn }` |
| `pollQRLoginStatus(transferToken)` | Sprawdza czy telefon zatwierdził. Zwraca `null` (pending) lub `encryptedPayload` (ready) |
| `completeQRLogin(privateKeyB64u, encryptedPayload, options)` | Strona komputera (vault ZABLOKOWANY). Odszyfrowuje masterKey i tworzy konto. `options`: `{ newPassword, label }`. Zwraca `{ userId, label, recoveryKey }` |
| `approveQRLogin(transferToken, password)` | Strona telefonu (vault ODBLOKOWANY). Weryfikuje hasło, szyfruje masterKey, wysyła na serwer. Zwraca `{ ok: true }` |

### VildaAuthUI

| Funkcja | Opis |
|---|---|
| `showQRLoginScreen()` | Pełny ekran QR login po stronie komputera. Obsługuje Fazę 1 (QR + polling) i Fazę 2 (formularz hasła). |

---

## Pliki zmienione

| Plik | Zmiany |
|---|---|
| `vilda_crypto.js` (v=6) | +7 funkcji ECDH: `generateECDHKeypair`, `exportECDHPrivateKey`, `importECDHPrivateKey`, `importECDHPublicKey`, `deriveAESFromSharedSecret`, `encryptForTransfer`, `decryptFromTransfer` |
| `vilda_vault.js` (v=13) | +4 funkcje QR: `initiateQRLogin`, `pollQRLoginStatus`, `completeQRLogin`, `approveQRLogin` |
| `vilda_auth_ui.js` (v=29) | +`showQRLoginScreen()`, przycisk "📱 Zaloguj się przez QR" w pickerze |
| `ustawienia.html` | +Sekcja "Zatwierdź logowanie QR" z kamerą (BarcodeDetector) i fallback ręcznym |
| `vilda-sync-worker/src/handlers/transfer.js` | Nowy plik: handlery POST/GET/PUT /v1/transfer |
| `vilda-sync-worker/src/worker.js` | +3 trasy transfer, +import transfer.js, refactor matchRoute() |

---

## Ograniczenia i kompatybilność

### BarcodeDetector API (skaner QR po stronie telefonu)

| Przeglądarka | Wsparcie |
|---|---|
| Chrome / Edge 83+ | ✅ Pełne |
| Safari iOS 17+ / macOS Sonoma | ✅ Pełne |
| Firefox | ❌ Brak |
| Chrome Android | ✅ Pełne |

Fallback: ręczne wklejenie tokenu QR (widoczny w UI, działa zawsze).

### Kamera (getUserMedia)

Wymagane: HTTPS i uprawnienie użytkownika. `vildaclinic.github.io` spełnia oba warunki.
Fallback: gdy kamera niedostępna, UI automatycznie przełącza na tryb ręczny.

### QRCode.js (generowanie QR po stronie komputera)

Biblioteka: `cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js` (ładowana lazy).
Rozmiar: ~17KB minified. Ładowana tylko gdy użytkownik klika "Zaloguj się przez QR".

### ECDH P-256 (Web Crypto API)

Dostępne we wszystkich nowoczesnych przeglądarkach (Chrome 37+, Firefox 35+, Safari 11+, Edge 12+).
Aplikacja nie może działać bez Web Crypto — jest wymagane już przez podstawowy vault.

---

## Scenariusze użycia

### Scenariusz 1: komputer → telefon (logowanie na nowym komputerze z użyciem telefonu)

1. Na komputerze: ekran logowania → "📱 Zaloguj się przez QR" → QR wyświetlony
2. Na telefonie: Ustawienia → "Zatwierdź logowanie QR" → "📷 Skanuj kod QR"
3. Kamera skanuje QR → podaj hasło → "Zatwierdź"
4. Na komputerze: "✓ Zatwierdzono! Ustaw hasło…" → podaj nowe hasło dla nowego konta
5. Komputer zalogowany z tym samym masterKey → sync interstitial pojawia się automatycznie

### Scenariusz 2: telefon → tablet, telefon → drugi telefon

Identyczny jak Scenariusz 1. Jedno urządzenie wyświetla QR (komputer/tablet/drugi telefon),
drugie skanuje (zalogowany telefon). Role mogą być odwrócone — każde urządzenie może pełnić obie role.

### Scenariusz 3: oba komputery (bez kamery)

Komputer A (stary, zalogowany): Ustawienia → "Zatwierdź logowanie QR" → "📷 Skanuj kod QR"
→ brak kamery → tryb ręczny: "Wklej token QR ręcznie"

Komputer B (nowy): "📱 Zaloguj się przez QR" → wyświetla QR i token (widoczny pod kodem)

Użytkownik kopiuje token z komputera B do komputera A → wpisuje hasło → "Zatwierdź"

*Uwaga: w tym scenariuszu kod tekstowy synchronizacji (sync code) jest wygodniejszy.*

---

## Porównanie metod cross-device

| Metoda | Wymaga | Nie wymaga | Najlepsza dla |
|---|---|---|---|
| Plik .wiw | Plik .wiw + hasło | — | Pełny backup |
| Kod synchronizacji | Wygenerowanego kodu + hasło | — | Komp→komp, brak kamery |
| **QR Transfer** | Zalogowanego urządzenia + hasło | Żadnych plików / kodów | Telefon→komp, codzienne użycie |
| Passkey / biometria | Zarejestrowanego passkey | — | Szybkie logowanie na TYM samym urządzeniu |

---

## Konfiguracja wrangler.toml

Opcjonalne zmienne środowiskowe workera:

```toml
[vars]
RATE_LIMIT_TRANSFER_RPM = "5"   # max nowych sesji QR/minutę per IP (domyślnie: 5)
```

Pozostałe stałe (TTL tokenów, limity rozmiaru payloadu) są hardcoded w `transfer.js`.
