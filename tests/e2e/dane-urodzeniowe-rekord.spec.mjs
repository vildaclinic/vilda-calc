import { expect, test } from '@playwright/test';

// Dane urodzeniowe w rekordzie pacjenta.
//
// Karta SGA/urodzeniowa stoi TYLKO na docpro.html, a zapis rekordu wychodzi z każdej strony.
// Test jednostkowy pilnuje samej reguły wyboru (karta vs. wartość przeniesiona); tutaj
// sprawdzamy to, czego on nie widzi: że na prawdziwej stronie bez karty rekord przeżywa
// pełen obieg wczytaj → zapisz, a na DocPro karta naprawdę oddaje i przyjmuje te dane.
test.use({ serviceWorkers: 'block' });

const REKORD = {
  version: 1,
  name: 'Testowy Jan',
  user: { lastName: 'Testowy', firstName: 'Jan', sex: 'M', age: 2, ageMonths: 0, height: 86, weight: 11.5 },
  birth: {
    sourceChoice: 'niklasson', sourceKeys: ['niklasson'], sex: 'M',
    weeks: '34', days: '2', weight: '1850', length: '43', head: '31', hasComputed: false,
  },
};

async function otworz(page, strona) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem(
        'vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }),
      );
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto('/' + strona, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.vildaExport)
    && typeof window.vildaExport.collectUserData === 'function'
    && typeof window.applyLoadedData === 'function');
}

test('index.html: zapis ze strony BEZ karty urodzeniowej nie kasuje danych z rekordu', async ({ page }) => {
  await otworz(page, 'index.html');
  // Kontrola pozytywna: na tej stronie karty faktycznie nie ma — inaczej test nie mierzy tego, co ma.
  expect(await page.evaluate(() => Boolean(document.getElementById('sgaBirthCard')))).toBe(false);
  expect(await page.evaluate(() => Boolean(window.vildaSgaBirthPersistApi))).toBe(false);

  const birth = await page.evaluate((rek) => {
    window.applyLoadedData(rek);
    return window.vildaExport.collectUserData().birth;
  }, REKORD);
  expect(birth).toEqual(REKORD.birth);
});

test('docpro.html: karta oddaje dane do rekordu i przyjmuje je z powrotem', async ({ page }) => {
  await otworz(page, 'docpro.html');
  expect(await page.evaluate(() => typeof window.vildaSgaBirthPersistApi?.captureState)).toBe('function');

  // Wczytanie rekordu odtwarza pola karty…
  const poWczytaniu = await page.evaluate((rek) => {
    window.applyLoadedData(rek);
    const v = (id) => (document.getElementById(id) || {}).value;
    return { weeks: v('sgaBirthWeeks'), weight: v('sgaBirthWeight'), length: v('sgaBirthLength'), head: v('sgaBirthHead') };
  }, REKORD);
  expect(poWczytaniu).toEqual({ weeks: '34', weight: '1850', length: '43', head: '31' });

  // …a ręczna zmiana w karcie wygrywa przy kolejnym zapisie.
  const birth = await page.evaluate(() => {
    document.getElementById('sgaBirthWeight').value = '2100';
    return window.vildaExport.collectUserData().birth;
  });
  expect(birth.weight).toBe('2100');
  expect(birth.weeks).toBe('34');
});

test('docpro.html: „Wyczyść wszystkie pola" usuwa też dane urodzeniowe', async ({ page }) => {
  await otworz(page, 'docpro.html');
  const po = await page.evaluate((rek) => {
    window.applyLoadedData(rek);
    window.clearAllData({ skipConfirm: true, confirm: false });
    return {
      birth: window.vildaExport.collectUserData().birth,
      weeks: (document.getElementById('sgaBirthWeeks') || {}).value,
    };
  }, REKORD);
  expect(po.birth).toBeNull();
  expect(po.weeks).toBe('');
});

test('docpro.html: wczytanie pacjenta BEZ danych urodzeniowych nie przenosi ich po poprzednim', async ({ page }) => {
  // Najgroźniejszy błąd tej klasy: dane urodzeniowe jednego dziecka lądujące w rekordzie drugiego.
  await otworz(page, 'docpro.html');
  const po = await page.evaluate((rek) => {
    window.applyLoadedData(rek);
    const drugi = { version: 1, name: 'Testowa Zofia', user: { sex: 'F', age: 5, ageMonths: 0, height: 110, weight: 18 } };
    window.applyLoadedData(drugi);
    return {
      birth: window.vildaExport.collectUserData().birth,
      weeks: (document.getElementById('sgaBirthWeeks') || {}).value,
      weight: (document.getElementById('sgaBirthWeight') || {}).value,
    };
  }, REKORD);
  expect(po.birth).toBeNull();
  expect(po.weeks).toBe('');
  expect(po.weight).toBe('');
});

test('docpro.html: „Wyczyść dane urodzeniowe" usuwa je z rekordu, resztę pacjenta zostawia', async ({ page }) => {
  // Sam przycisk czyścił dotąd tylko pola karty; po dopisaniu sekcji `birth` kolektor
  // przenosiłby zapisaną wartość, więc dane wracałyby przy kolejnym wczytaniu.
  await otworz(page, 'docpro.html');
  const po = await page.evaluate((rek) => {
    window.applyLoadedData(rek);
    // Wzrost wpisany jak przez lekarza — kontrola, że przycisk nie sprząta cudzych pól.
    document.getElementById('height').value = '86';
    document.getElementById('resetSgaBirth').click();
    const zebrane = window.vildaExport.collectUserData();
    return {
      birth: zebrane.birth,
      przeniesione: window.vildaBirthData,
      weeks: (document.getElementById('sgaBirthWeeks') || {}).value,
      weight: (document.getElementById('sgaBirthWeight') || {}).value,
      wzrost: zebrane.user && zebrane.user.height,
      plec: zebrane.user && zebrane.user.sex,
    };
  }, REKORD);
  expect(po.birth, 'dane urodzeniowe znikają z rekordu').toBeNull();
  expect(po.przeniesione, 'przeniesiona wartość też').toBeNull();
  expect(po.weeks).toBe('');
  expect(po.weight).toBe('');
  // Kontrola negatywna: przycisk nie jest „wyczyść wszystko".
  expect(po.wzrost, 'reszta rekordu nietknięta').toBe(86);
  expect(po.plec).toBe('M');
});
