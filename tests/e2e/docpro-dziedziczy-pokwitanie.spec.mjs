import { expect, test } from '../support/test-czas.mjs';

// P-DOCPRO-POKWITANIE (zgłoszenie właściciela 2026-09-14) — DocPro ma kartę „Zaawansowane
// obliczenia wzrostowe", ale nie ma ANI JEDNEGO pola pokwitaniowego: ani etapu Tannera,
// ani objętości jąder, ani wywiadu o rodzinnym opóźnieniu pokwitania, ani wykluczenia
// przyczyn wtórnych. Ten sam pacjent dostawał tam więc uboższy wynik niż na stronie głównej.
//
// Kierunek właściciela: nie mnożyć pól ani obliczeń — strona, która czegoś potrzebuje, ma
// to WZIĄĆ z tego samego miejsca, co strona główna. Tym miejscem jest rekord pacjenta.
//
// Ten plik mierzy to, czego nie da się zmierzyć testem jednostkowym: czy wartości z rekordu
// naprawdę dochodzą do KARTY, a nie tylko do modułu statusu. Obserwujemy zatwierdzony
// wynik karty (`window.advancedGrowthData`), a nie stan pośredni.
//
// Test zakłada WŁASNE, fikcyjne konto sejfu w efemerycznym profilu przeglądarki. Nie dotyka
// żadnego prawdziwego sejfu ani prawdziwych danych. Wszystkie dane są jednoznacznie fikcyjne.
test.use({ serviceWorkers: 'block' });

const HASLO = 'E2e#DocProPokwit!26a';

const REKORD = {
  name: 'Fikcyjny Dokprowy',
  user: {
    firstName: 'Dokprowy', lastName: 'Fikcyjny', sex: 'M',
    age: 12, ageMonths: 0, height: 141, weight: 34, tannerStage: '3',
  },
  // Sekcja faktów trwałych — rekord ma ją niezależnie od „stanu na dziś". Dzięki niej
  // testy mogą poczekać na odczyt z sejfu tym samym sposobem przed zmianą i po niej.
  puberty: { onsetAgeYears: 11 },
  advanced: {
    name: 'Fikcyjny Dokprowy',
    boneAgeYears: 10.5, motherHeight: 163, fatherHeight: 180,
    testicularVolume: '4to6', familyDelayedPuberty: 'yes', growthExclusion: 'no',
    data: {
      measurements: [
        { ageMonths: 120, ageYears: 10, height: 132, weight: 29 },
        { ageMonths: 144, ageYears: 12, height: 141, weight: 34 },
      ],
    },
  },
};

async function otworzZKontem(page, url) {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('vilda-terms-accepted-v1',
        JSON.stringify({ version: 1, acceptedAtISO: new Date().toISOString() }));
    } catch (_) { /* brak storage — pomiń */ }
  });
  await page.goto(url, { waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault));
  await page.evaluate(
    async (pw) => window.VildaVault.createUser(pw, { label: 'e2e', iterations: 10000 }), HASLO,
  );
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => Boolean(window.VildaVault) && window.VildaVault.isUnlocked());
  await page.waitForFunction(() => typeof window.applyLoadedData === 'function'
    && typeof window.collectUserData === 'function');
}

/* Wczytanie pacjenta dokładnie tą drogą, którą chodzi Karta Pacjenta: rekord ląduje w sejfie,
   formularz dostaje payload, a moduł źródłowy budzi się na `vilda:patient-loaded`. */
async function wczytajPacjenta(page) {
  const pid = await page.evaluate(async (r) => {
    const zapis = await window.VildaVault.savePatient(JSON.parse(JSON.stringify(r)), { dedup: false });
    window.applyLoadedData(JSON.parse(JSON.stringify(r)));
    document.dispatchEvent(new CustomEvent('vilda:patient-loaded',
      { detail: { patientId: zapis.patientId } }));
    return zapis.patientId;
  }, REKORD);
  // Odczyt z sejfu jest asynchroniczny — czekamy, aż moduł źródłowy zapamięta rekord.
  // Czekamy na sekcję faktów trwałych, nie na nową pamięć stanu: drugi test ma być
  // strażnikiem BRAKU zmiany na stronie głównej, więc musi dać się uruchomić także
  // przeciw wersji sprzed tej poprawki.
  await page.waitForFunction(() => Boolean(window.VildaPubertySource
    && window.VildaPubertySource.zKartyPacjenta()));
  return pid;
}

function policz(page) {
  return page.evaluate(() => {
    window.calculateGrowthAdvanced();
    const a = window.advancedGrowthData || {};
    return {
      testicularVolume: a.testicularVolume,
      familyDelayedPuberty: a.familyDelayedPuberty,
      growthExclusion: a.growthExclusion,
      profilJest: Boolean(a.pubertyProfile),
    };
  });
}

test('docpro.html: karta bierze etap i jądra z rekordu, bo własnych pól nie ma', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page, '/docpro.html');

  // Kontrola pozytywna: tych pól na DocPro naprawdę nie ma — inaczej test mierzyłby co innego.
  const polaIstnieja = await page.evaluate(() => ['tannerStage', 'advTesticularVolume',
    'advFamilyDelayedPuberty', 'advGrowthExclusion'].map((id) => Boolean(document.getElementById(id))));
  expect(polaIstnieja).toEqual([false, false, false, false]);

  await wczytajPacjenta(page);

  const status = await page.evaluate(() => window.VildaPubertalStatus.dane({ plec: 'M', wiekLat: 12 }));
  expect(status.etap, 'etap z rekordu, bo pola nie ma').toBe(3);
  expect(status.etapZrodlo, 'źródło nazwane uczciwie').toBe('rekord');
  expect(status.jadra).toBe('4to6');

  const wynik = await policz(page);
  expect(wynik.testicularVolume, 'karta dostaje objętość jąder').toBe('4to6');
  expect(wynik.familyDelayedPuberty).toBe('yes');
  expect(wynik.growthExclusion).toBe('no');
  expect(wynik.profilJest, 'profil pokwitania powstaje, a nie jest pomijany').toBe(true);
});

test('index.html: pole opróżnione przez lekarza nadal wygrywa z rekordem', async ({ page }) => {
  test.setTimeout(120_000);
  await otworzZKontem(page, '/index.html');

  // Kontrola pozytywna: na stronie głównej te pola istnieją.
  const polaIstnieja = await page.evaluate(() => ['tannerStage', 'advTesticularVolume',
    'advFamilyDelayedPuberty', 'advGrowthExclusion'].map((id) => Boolean(document.getElementById(id))));
  expect(polaIstnieja).toEqual([true, true, true, true]);

  await wczytajPacjenta(page);

  await page.evaluate(() => {
    for (const id of ['tannerStage', 'advTesticularVolume', 'advFamilyDelayedPuberty',
      'advGrowthExclusion']) {
      const el = document.getElementById(id);
      if (el) { el.value = ''; el.dispatchEvent(new Event('change', { bubbles: true })); }
    }
  });

  const status = await page.evaluate(() => window.VildaPubertalStatus.dane({ plec: 'M', wiekLat: 12 }));
  expect(status.etap, 'puste pole to odpowiedź „dziś nie oceniono", nie brak odpowiedzi').toBeNull();
  expect(status.jadra).toBe('');

  const wynik = await policz(page);
  expect(wynik.testicularVolume, 'rekord nie wskrzesza wyczyszczonego pola').toBe('');
  expect(wynik.familyDelayedPuberty).toBe('');
  expect(wynik.growthExclusion).toBe('');
});
