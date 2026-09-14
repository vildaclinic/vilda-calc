import { expect, test } from '../support/test-czas.mjs';

// P-PERINATAL (zgłoszenie właściciela 2026-09-14) — „Dane okołoporodowe" z Karty Pacjenta
// znikały przy pierwszym zapisie z formularza głównego.
//
// Kolektor budował payload z NAZWANYCH sekcji i `perinatal` nie było wśród nich, więc każdy
// zapis oddawał rekord bez tej sekcji. Zmierzone przed poprawką: perinatal w sejfie PRZED
// zapisem, „(BRAK W KOLEKTORZE)" w payloadzie, „(USUNIĘTE)" w sejfie PO zapisie.
//
// Dlaczego to boli: karta „Zaawansowane obliczenia wzrostowe" czyta stamtąd masę urodzeniową
// do prognozy Bluma dla ISS (przez `VildaPerinatalSource.biezace()`), a ta sama sekcja jest
// trzecim źródłem dla zdania o braku catch-upu (SGA) i dla ściągi B.64. Na index.html karty
// SGA nie ma wcale, więc Karta Pacjenta jest tam JEDYNYM miejscem wpisu tych danych.
//
// Test zakłada WŁASNE, fikcyjne konto sejfu w efemerycznym profilu przeglądarki. Nie dotyka
// żadnego prawdziwego sejfu ani prawdziwych danych. Wszystkie dane są jednoznacznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Okoloporodowe!26a';

async function otworzZKontem(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(
    () => typeof window.applyLoadedData === 'function'
      && typeof window.saveUserData === 'function'
      && typeof window.collectUserData === 'function',
  );
}

const OKOLOPORODOWE = { gestationalAgeWeeks: 39, birthWeight: 3200, birthLength: 52, parity: '1' };

function rekord(perinatal) {
  const p = {
    name: 'Fikcyjna Okołoporodowa',
    timestampISO: new Date().toISOString(),
    user: { age: 12, ageMonths: 0, sex: 'F', weight: 40, height: 150, firstName: 'Okołoporodowa', lastName: 'Fikcyjna' },
    advanced: { data: { measurements: [] } },
  };
  if (perinatal) p.perinatal = perinatal;
  return p;
}

/* Zapis „jak z Karty pacjenta": payload wprost do sejfu, z pominięciem formularza. */
function zapiszJakKarta(page, payload) {
  return page.evaluate(
    async (p) => (await window.VildaVault.savePatient(p, { dedup: false })).patientId, payload,
  );
}

async function wczytaj(page, pid) {
  await page.evaluate(async (id) => {
    const x = await window.VildaVault.getPatient(id);
    window.applyLoadedData(x.snapshots[0].payload);
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
  }, pid);
  // Wczytanie przestawia pola formularza ASYNCHRONICZNIE, kaskadą z opóźnieniami (zachowanie
  // sprzed tej zmiany). Wartości wpisane zaraz potem bywały kasowane tuż po wpisaniu i zapis
  // nie dochodził do skutku — stąd migotanie pierwszej wersji tego testu. Czekamy więc, aż
  // formularz się wyciszy: dwa kolejne odczyty w odstępie muszą być identyczne. Nie zakładamy
  // przy tym, JAK się wyciszy — zerowaniem czy wypełnieniem.
  await page.waitForFunction(() => {
    const stan = ['age', 'ageMonths', 'weight', 'height', 'name']
      .map((id) => { const e = document.getElementById(id); return e ? e.value : ''; })
      .join('|');
    const poprzedni = window.__testStanFormularza;
    window.__testStanFormularza = stan;
    return poprzedni === stan;
  }, null, { polling: 400 });
}

/* Zapis z formularza głównego, doprowadzony do skutku.

   `saveUserData()` przy niekompletnym formularzu po cichu zwraca null i tylko pokazuje
   komunikat przy przycisku — pierwsza wersja tego testu przechodziła przez to POZORNIE.
   Do tego formularz po wczytaniu rekordu przestawia pola asynchronicznie, kaskadą
   z opóźnieniami, więc wartości wpisane zaraz potem bywają kasowane tuż po wpisaniu —
   czasem między sprawdzeniem a kliknięciem. Zamiast zgadywać ten moment, powtarzamy cykl
   „wpisz → zapisz → sprawdź, czy rekord urósł", aż zapis naprawdę wejdzie. Tak samo
   zachowałby się lekarz, który widzi, że nic się nie zapisało, i klika ponownie. */
async function zapiszZFormularza(page, pid, waga) {
  const ile = () => page.evaluate(
    async (id) => (await window.VildaVault.getPatient(id)).snapshotCount, pid,
  );
  const przed = await ile();

  for (let proba = 0; proba < 12; proba += 1) {
    await page.evaluate((w) => {
      const set = (id, v) => {
        const e = document.getElementById(id);
        if (e) {
          e.value = v;
          e.dispatchEvent(new Event('input', { bubbles: true }));
          e.dispatchEvent(new Event('change', { bubbles: true }));
        }
      };
      set('age', '12'); set('ageMonths', '0'); set('weight', w); set('height', '150');
    }, waga);

    const d = await page.evaluate(() => window.collectUserData() || {});
    const komplet = d.user && d.user.weight === Number(waga) && d.user.age === 12
      && String(d.name || '').trim() !== '';
    if (komplet) {
      await page.evaluate(async () => { await window.saveUserData(); });
      if (await ile() > przed) return;
    }
    await page.waitForTimeout(250);
  }
  throw new Error('zapis z formularza nie doszedł do skutku mimo powtórzeń');
}

function zSejfu(page, pid) {
  return page.evaluate(async (id) => {
    const x = await window.VildaVault.getPatient(id);
    const pl = x.snapshots[0].payload;
    return {
      snapshotCount: x.snapshotCount,
      waga: pl.user ? pl.user.weight : null,
      perinatal: pl.perinatal === undefined ? null : pl.perinatal,
    };
  }, pid);
}

test.describe('Dane okołoporodowe przeżywają zapis z formularza głównego', () => {
  test('sekcja zostaje w rekordzie po zwykłym zapisie pomiaru', async ({ page }) => {
    test.setTimeout(150_000);
    await otworzZKontem(page);

    const pid = await zapiszJakKarta(page, rekord(OKOLOPORODOWE));
    expect((await zSejfu(page, pid)).perinatal).toEqual(OKOLOPORODOWE);

    await wczytaj(page, pid);
    const wKolektorze = await page.evaluate(() => {
      const d = window.collectUserData() || {};
      return d.perinatal === undefined ? null : d.perinatal;
    });
    expect(wKolektorze, 'kolektor niesie sekcję okołoporodową').toEqual(OKOLOPORODOWE);

    await zapiszZFormularza(page, pid, '41');
    const po = await zSejfu(page, pid);
    expect(po.snapshotCount, 'zapis naprawdę się wykonał').toBeGreaterThan(1);
    expect(po.waga).toBe(41);
    expect(po.perinatal, 'sekcja okołoporodowa nietknięta').toEqual(OKOLOPORODOWE);
  });

  test('pacjent bez danych okołoporodowych nie dostaje pustej sekcji', async ({ page }) => {
    test.setTimeout(150_000);
    await otworzZKontem(page);

    const pid = await zapiszJakKarta(page, rekord(null));
    await wczytaj(page, pid);
    await zapiszZFormularza(page, pid, '41');

    const po = await zSejfu(page, pid);
    expect(po.snapshotCount).toBeGreaterThan(1);
    // Przenoszenie nie może wymyślać sekcji, której nigdy nie było.
    expect(po.perinatal).toBeNull();
  });

  test('skasowanie sekcji w Karcie pacjenta nie jest cofane przez przenoszenie', async ({ page }) => {
    test.setTimeout(150_000);
    await otworzZKontem(page);

    const pid = await zapiszJakKarta(page, rekord(OKOLOPORODOWE));
    // Karta pacjenta kasuje sekcję i zapisuje; formularz dostaje świeży rekord.
    await page.evaluate(async (id) => {
      const x = await window.VildaVault.getPatient(id);
      const pl = JSON.parse(JSON.stringify(x.snapshots[0].payload));
      delete pl.perinatal;
      await window.VildaVault.savePatient(pl, { patientId: id, dedup: false });
    }, pid);
    await wczytaj(page, pid);

    await zapiszZFormularza(page, pid, '42');
    const po = await zSejfu(page, pid);
    expect(po.waga).toBe(42);
    expect(po.perinatal, 'skasowane zostaje skasowane').toBeNull();
  });
});
