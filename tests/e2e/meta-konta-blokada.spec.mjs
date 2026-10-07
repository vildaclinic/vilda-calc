import { expect, test } from '@playwright/test';

// P-META-KONTA (zlecenie właściciela 2026-10-07, przegląd „co dalej po #518”, punkt A12) — zapisy metadanych konta pod
// jedną blokadą, na prawdziwych Web Locks w dwóch kartach przeglądarki.
//
// Karta A trzyma blokadę metadanych konta (ta sama nazwa co dotychczasowa blokada kosza, `vilda-note-kosz-zapisow` —
// tak trzyma ją też karta ze starszą wersją aplikacji w trakcie zapisu kosza). Karta B:
//   - „Usuń do kosza” czeka i kończy się po zwolnieniu blokady;
//   - zmiana hasła po limicie odmawia (META_BUSY) i niczego nie zmienia; po zwolnieniu blokady przechodzi.
// Przed zmianą zmiana hasła nie czekała na nic i zapisywała kopię metadanych z odczytu sprzed PBKDF2 (drugi przypadek
// czerwony na `audyt` 74c5803). Pierwszy przypadek to kontrola zgodności ze starszą wersją aplikacji: kosz brał tę
// blokadę już wcześniej, więc jest zielony także przed zmianą — pilnuje, żeby nazwa blokady się nie rozjechała.
//
// Własne, fikcyjne konto sejfu w efemerycznym profilu przeglądarki; dane wyłącznie FIKCYJNE.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#MetaKonta!2026aa';
const NOWE = 'E2e#MetaKontaNowe!26bb';

async function regulamin(page) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
}

async function gotowa(page) {
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => !document.documentElement.classList.contains('vilda-auth-locked'));
  await page.waitForFunction(() => Boolean(window.VildaAuthUI));
  await page.waitForTimeout(1200); // kaskady odtwarzania po starcie strony
}

async function pierwszaKarta(page) {
  await regulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  const { userId } = await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO);
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  return userId;
}

async function kolejnaKarta(context, userId) {
  const page = await context.newPage();
  await regulamin(page);
  await page.goto('/index.html', { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(async (a) => window.VildaVault.unlockUser(a.userId, a.pw), { userId, pw: HASLO });
  await page.reload({ waitUntil: 'load' });
  await gotowa(page);
  return page;
}

/* Karta A bierze blokadę metadanych konta i trzyma ją do window.__zwolnij(). */
async function trzymajBlokade(page) {
  await page.evaluate(() => {
    window.__zwolnij = null;
    navigator.locks.request('vilda-note-kosz-zapisow', () => new Promise((r) => { window.__zwolnij = r; }));
  });
  await page.waitForFunction(() => typeof window.__zwolnij === 'function');
}

test.describe('P-META-KONTA — metadane konta pod jedną blokadą w dwóch kartach', () => {
  test('„Usuń do kosza” w drugiej karcie czeka na blokadę metadanych i kończy się po jej zwolnieniu', async ({ page, context }) => {
    const userId = await pierwszaKarta(page);
    const b = await kolejnaKarta(context, userId);
    const { pid, sid } = await b.evaluate(async () => {
      const V = window.VildaVault;
      const pomiar = (m) => ({ uid: `m-${m}`, ageMonths: m, ageYears: m / 12, height: 90 + m / 2, weight: 12 + m / 6 });
      const rekord = (wieki) => ({
        name: 'Testowy Olek',
        user: { lastName: 'Testowy', firstName: 'Olek', sex: 'M', age: 6, ageMonths: 2, height: 127, weight: 24 },
        advanced: { data: { measurements: wieki.map(pomiar) } },
      });
      const a = await V.savePatient(rekord([60]), { dedup: false });
      await V.savePatient(rekord([60, 66]), { patientId: a.patientId, dedup: false });
      await V.savePatient(rekord([60, 66, 72]), { patientId: a.patientId, dedup: false });
      const r = await V.getPatient(a.patientId);
      return { pid: a.patientId, sid: r.snapshots[1].snapshotId };
    });
    await trzymajBlokade(page);

    await b.evaluate((a) => {
      window.__kosz = { koniec: false };
      window.VildaVault.moveSnapshotToTrash(a.pid, a.sid)
        .then(() => { window.__kosz.koniec = true; }, (e) => { window.__kosz.koniec = true; window.__kosz.blad = String(e && e.message); });
    }, { pid, sid });
    await b.waitForTimeout(1500);
    expect(await b.evaluate(() => window.__kosz.koniec), 'kosz czeka na blokadę metadanych z karty A').toBe(false);

    await page.evaluate(() => window.__zwolnij());
    await b.waitForFunction(() => window.__kosz.koniec, null, { timeout: 15_000 });
    expect(await b.evaluate(() => window.__kosz.blad || null)).toBeNull();
    const wKoszu = await b.evaluate(async () => (await window.VildaVault.listTrashedSnapshots()).map((e) => e.snapshotId));
    expect(wKoszu).toEqual([sid]);
  });

  test('zmiana hasła przy zajętej blokadzie: po limicie META_BUSY bez zmian; po zwolnieniu przechodzi', async ({ page, context }) => {
    const userId = await pierwszaKarta(page);
    const b = await kolejnaKarta(context, userId);
    await trzymajBlokade(page);

    const odmowa = await b.evaluate(async (a) => {
      let czekal = false;
      try {
        await window.VildaVault.changePassword(a.stare, a.nowe, { lockTimeoutMs: 1500, onLockWait: () => { czekal = true; } });
        return { czekal, kod: null };
      } catch (e) {
        return { czekal, kod: e && e.code, komunikat: String(e && e.message) };
      }
    }, { stare: HASLO, nowe: NOWE });
    expect(odmowa.czekal, 'sygnał czekania').toBe(true);
    expect(odmowa.kod).toBe('META_BUSY');
    expect(odmowa.komunikat).toContain('Nic nie zmieniono');

    await page.evaluate(() => window.__zwolnij());
    await b.evaluate(async (a) => { await window.VildaVault.changePassword(a.stare, a.nowe); }, { stare: HASLO, nowe: NOWE });

    // Karta A: blokuje sejf i otwiera go nowym hasłem; stare już nie działa.
    const wynik = await page.evaluate(async (a) => {
      const V = window.VildaVault;
      V.lock();
      let stare = true;
      try { await V.unlockUser(a.userId, a.stare); } catch { stare = false; }
      if (stare) V.lock();
      await V.unlockUser(a.userId, a.nowe);
      return { stare, otwarty: V.isUnlocked() };
    }, { userId, stare: HASLO, nowe: NOWE });
    expect(wynik).toEqual({ stare: false, otwarty: true });
  });
});
