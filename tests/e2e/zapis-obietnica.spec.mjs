import { expect, test } from '../support/test-czas.mjs';

// P-ZAPIS-OBIETNICA (zlecenie właściciela 2026-09-14) — `saveUserData()` pozwala poczekać
// na zapis.
//
// Dotąd funkcja odpalała łańcuch zapisu i NATYCHMIAST oddawała payload (`return <łańcuch>, a`).
// `await window.saveUserData()` nie czekał więc na nic; kto zaraz potem czytał sejf, ścigał się
// z zapisem. Potknął się o to test tożsamości pacjenta — rekord ze `snapshotCount: 1` przy
// komplecie danych w kolektorze, bez żadnego komunikatu — ale tak samo potknąłby się import,
// moduł GH i każdy automat, bez sposobu obejścia poza odpytywaniem sejfu.
//
// Ten plik mierzy dokładnie tę własność: PO `await` rekord ma już być zapisany. Bez żadnego
// czekania, odpytywania ani `waitForTimeout` — bo to jest właśnie to, czego nie powinno być
// już potrzeba.
//
// Test zakłada WŁASNE, fikcyjne konto sejfu w efemerycznym profilu przeglądarki.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#Obietnica!26aa';

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
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked()
    && typeof window.saveUserData === 'function');
}

function wpisz(page, pola) {
  return page.evaluate((p) => {
    Object.keys(p).forEach((id) => {
      const e = document.getElementById(id);
      if (!e) throw new Error('brak pola ' + id);
      e.value = p[id];
      e.dispatchEvent(new Event('input', { bubbles: true }));
      e.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, pola);
}

const KOMPLET = {
  lastName: 'Obietnicowa', firstName: 'Zofia', age: '9', ageMonths: '0', weight: '30', height: '130',
};

test.describe('saveUserData() pozwala poczekać na zapis', () => {
  test('zaraz po await rekord jest już w sejfie — bez odpytywania', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    await wpisz(page, KOMPLET);

    const wynik = await page.evaluate(async () => {
      const przed = (await window.VildaVault.listPatients()).length;
      const zwrocone = await window.saveUserData();
      // ŻADNEGO czekania między zapisem a odczytem. To jest cała treść tego testu.
      const po = await window.VildaVault.listPatients();
      return {
        przed,
        po: po.length,
        wersji: po.length ? (await window.VildaVault.getPatient(po[0].patientId)).snapshotCount : 0,
        zwroconeMaNazwe: Boolean(zwrocone && zwrocone.name),
      };
    });

    expect(wynik.przed).toBe(0);
    expect(wynik.po, 'pacjent jest w sejfie natychmiast po await').toBe(1);
    expect(wynik.wersji).toBeGreaterThan(0);
    expect(wynik.zwroconeMaNazwe, 'obietnica rozwiązuje się tym samym payloadem, co dawniej').toBe(true);
  });

  test('drugi zapis też jest domknięty przed powrotem z await', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    await wpisz(page, KOMPLET);
    await page.evaluate(async () => { await window.saveUserData(); });

    await wpisz(page, { weight: '31.5' });
    const wersji = await page.evaluate(async () => {
      await window.saveUserData();
      const lista = await window.VildaVault.listPatients();
      return (await window.VildaVault.getPatient(lista[0].patientId)).snapshotCount;
    });
    expect(wersji, 'druga wizyta dopisana i widoczna od razu').toBeGreaterThan(1);
  });

  test('niekompletny formularz nadal oddaje null, a nie obietnicę udanego zapisu', async ({ page }) => {
    test.setTimeout(120_000);
    await otworzZKontem(page);
    await wpisz(page, { lastName: 'Obietnicowa', firstName: 'Zofia', age: '9', ageMonths: '0' });

    const wynik = await page.evaluate(async () => {
      const zwrocone = await window.saveUserData();
      return { zwrocone, ilu: (await window.VildaVault.listPatients()).length };
    });
    // Wczesne wyjścia zostają synchroniczne — `await` radzi sobie z jednym i z drugim,
    // więc wołający ma jednolity sposób użycia, a „nie zapisano" nadal znaczy null.
    expect(wynik.zwrocone).toBeNull();
    expect(wynik.ilu, 'nic nie trafiło do sejfu').toBe(0);
  });

  test('awaria sejfu nie odrzuca obietnicy — wołający nie dostaje nieobsłużonego błędu',
    async ({ page }) => {
      test.setTimeout(120_000);
      await otworzZKontem(page);

      const odrzucenia = [];
      page.on('pageerror', (e) => odrzucenia.push(String(e)));

      await page.evaluate(() => {
        const prawdziwy = window.VildaVault;
        window.VildaVault = {
          isUnlocked: () => true,
          listPatients: prawdziwy.listPatients.bind(prawdziwy),
          savePatient: async () => { throw new Error('sejf odmówił'); },
        };
      });
      await wpisz(page, KOMPLET);

      const zwrocone = await page.evaluate(async () => {
        const w = await window.saveUserData();
        return Boolean(w && w.name);
      });
      expect(zwrocone, 'obietnica rozwiązuje się mimo awarii').toBe(true);
      expect(odrzucenia, odrzucenia.join('\n')).toEqual([]);
    });
});
