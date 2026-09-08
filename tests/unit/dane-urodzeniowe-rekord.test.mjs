import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// Dane urodzeniowe (masa, długość, obwód głowy, wiek ciążowy) trafiają do rekordu pacjenta.
//
// Karta SGA istnieje TYLKO na docpro.html, a zapis pacjenta jest wywoływany z każdej strony.
// Gdyby kolektor po prostu czytał kartę, zapis z index.html — gdzie karty nie ma — wpisałby
// pustkę i skasował dane urodzeniowe zapisane wcześniej z DocPro. To dokładnie ta klasa
// cichego nadpisania, którą naprawialiśmy w P14.
//
// Rozwiązanie idzie konwencją, którą aplikacja już stosuje dla sekcji wyłącznie DocPro
// (punkty terapii GH, otyłości, bisfosfonianów): applyLoadedData odkłada wartość do globalu
// NIEZALEŻNIE OD STRONY, a kolektor czyta ją stamtąd, gdy karty nie ma albo jest pusta.

function kolektor() {
  const src = fs.readFileSync(path.join(korzen, 'vilda_data_import_export.js'), 'utf8');
  const start = src.indexOf('function Bf1(');
  const end = src.indexOf('function Bf2(', start);
  expect(start, 'znaleziono Bf1 (czy stan karty niesie dane)').toBeGreaterThan(-1);
  expect(end, 'znaleziono koniec bloku po Bf0').toBeGreaterThan(start);
  // r = globalne okno aplikacji, de = głęboka kopia — oba wstrzykiwane, jak w produkcji.
  return (r, de = (x) => JSON.parse(JSON.stringify(x))) =>
    new Function('r', 'de', `${src.slice(start, end)}\nreturn { Bf0, Bf1 };`)(r, de);
}

const STAN_KARTY = {
  sourceChoice: 'niklasson', sourceKeys: ['niklasson'], sex: 'M',
  weeks: '34', days: '2', weight: '1850', length: '43', head: '31', hasComputed: true,
};
const PUSTA_KARTA = {
  sourceChoice: 'niklasson', sourceKeys: ['niklasson'], sex: '',
  weeks: '', days: '0', weight: '', length: '', head: '', hasComputed: false,
};

describe('Zbieranie danych urodzeniowych do rekordu', () => {
  it('karta z danymi wygrywa — lekarz właśnie je wpisał', () => {
    const { Bf0 } = kolektor()({
      vildaBirthData: { weeks: '40', weight: '3400' },
      vildaSgaBirthPersistApi: { captureState: () => STAN_KARTY },
    });
    expect(Bf0()).toEqual(STAN_KARTY);
  });

  it('bez karty na stronie wartość z rekordu jest PRZENOSZONA, nie kasowana', () => {
    // To jest sedno: zapis z index.html nie może zgubić danych z DocPro.
    const { Bf0 } = kolektor()({ vildaBirthData: STAN_KARTY });
    expect(Bf0()).toEqual(STAN_KARTY);
  });

  it('karta obecna, ale pusta — też przenosimy zapisane dane', () => {
    // Karta może być pusta, zanim applyLoadedData zdąży ją odtworzyć; autozapis w tym oknie
    // skasowałby dane urodzeniowe bez śladu.
    const { Bf0 } = kolektor()({
      vildaBirthData: STAN_KARTY,
      vildaSgaBirthPersistApi: { captureState: () => PUSTA_KARTA },
    });
    expect(Bf0()).toEqual(STAN_KARTY);
  });

  it('pusto po obu stronach daje null, a nie pusty obiekt udający dane', () => {
    const { Bf0 } = kolektor()({ vildaSgaBirthPersistApi: { captureState: () => PUSTA_KARTA } });
    expect(Bf0()).toBeNull();
    expect(kolektor()({}).Bf0()).toBeNull();
  });

  it('karta rzucająca wyjątkiem nie kasuje rekordu', () => {
    const { Bf0 } = kolektor()({
      vildaBirthData: STAN_KARTY,
      vildaSgaBirthPersistApi: { captureState: () => { throw new Error('karta nie wstała'); } },
    });
    expect(Bf0()).toEqual(STAN_KARTY);
  });

  it('przenoszona wartość jest kopią — rekord nie dzieli obiektu z globalem', () => {
    const globalne = { vildaBirthData: { ...STAN_KARTY } };
    const { Bf0 } = kolektor()(globalne);
    const wynik = Bf0();
    wynik.weight = '9999';
    expect(globalne.vildaBirthData.weight, 'zmiana kopii nie rusza globalu').toBe('1850');
  });
});

describe('Rozpoznanie, czy stan karty w ogóle niesie dane', () => {
  it('każde pojedyncze pole urodzeniowe wystarczy', () => {
    const { Bf1 } = kolektor()({});
    expect(Bf1({ ...PUSTA_KARTA, weeks: '38' })).toBe(true);
    expect(Bf1({ ...PUSTA_KARTA, weight: '3200' })).toBe(true);
    expect(Bf1({ ...PUSTA_KARTA, length: '52' })).toBe(true);
    expect(Bf1({ ...PUSTA_KARTA, head: '35' })).toBe(true);
    expect(Bf1({ ...PUSTA_KARTA, hasComputed: true })).toBe(true);
  });

  it('kontrola negatywna: sama płeć, źródło norm i białe znaki to nie są dane', () => {
    const { Bf1 } = kolektor()({});
    expect(Bf1(PUSTA_KARTA)).toBe(false);
    expect(Bf1({ ...PUSTA_KARTA, sex: 'M' }), 'płeć idzie z formularza, nie z urodzenia').toBe(false);
    expect(Bf1({ ...PUSTA_KARTA, days: '0' })).toBe(false);
    expect(Bf1({ ...PUSTA_KARTA, weight: '   ' }), 'same spacje to nie dane').toBe(false);
    expect(Bf1(null)).toBe(false);
    expect(Bf1('34')).toBe(false);
  });
});
