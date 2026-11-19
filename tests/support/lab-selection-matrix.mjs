// P-E2-MENARCHE: macierz „pacjenci × badania katalogu poza estradiolem” do regresji „inne badania bez zmian”.
// Ten sam kod liczy skróty dla bieżącego przelicznika (test) i dla przelicznika z bazy `origin/audyt`
// (wzorzec tests/fixtures/lab-selection-inne-badania-baza.json, wygenerowany z plików `git show origin/audyt:…`).
// Wyłącznie fikcyjne konteksty pacjentów; żadnych norm ani reguł — tylko wywołania LabUnitConverter.
import { createHash } from 'node:crypto';

export const WYLACZONE_BADANIE = 'estradiol';

const PLEC = ['F', 'M', null];
// Wiek dziesiętny jak z danych pacjenta (lata + miesiące/12), wokół granic danych i 18 lat; null = brak wieku.
const WIEK = [null, 0.02, 0.3, 3, 8, 10, 12.5, 15, 16, 17.99, 18, 30, 65];
const TANNER = [null, 1, 3, 5];
const FAZA = [null, 'follicular', 'ovulation', 'luteal', 'postmenopause', 'pregnancy_t1', 'pregnancy_t2', 'pregnancy_t3'];
// Nowe pole pacjenta (wiek menarche) nie może zmienić doboru w żadnym innym badaniu.
const MENARCHE = [undefined, 10];
const PORA = [null, 'morning'];

// Etap życia tak, jak liczy go strona (getEffectivePatient): z wieku, bez wieku ze stadium, inaczej dorosły.
function etapZycia(age, tanner) {
  if (typeof age === 'number') return age >= 18 ? 'adult' : 'pediatric';
  if (typeof tanner === 'number') return tanner >= 5 ? 'adult' : 'pediatric';
  return 'adult';
}

export function pacjenciMacierzy() {
  const pacjenci = [];
  for (const sex of PLEC) for (const age of WIEK) for (const tanner of TANNER) for (const cycle_phase of FAZA) {
    for (const menarche of MENARCHE) for (const time_of_day of PORA) {
      const patient = { sex, age, tanner, cycle_phase, time_of_day, test_protocol: null, method: null,
        life_stage: etapZycia(age, tanner) };
      if (menarche !== undefined) patient.menarche_age_years = menarche;
      pacjenci.push(patient);
    }
  }
  return pacjenci;
}

// Stabilny zapis wyniku: klucze w porządku alfabetycznym, undefined pominięte.
function zapis(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value === undefined ? null : value);
  if (Array.isArray(value)) return '[' + value.map(zapis).join(',') + ']';
  return '{' + Object.keys(value).filter((key) => value[key] !== undefined).sort()
    .map((key) => JSON.stringify(key) + ':' + zapis(value[key])).join(',') + '}';
}

// { idBadania: { wybory: liczba, skrot: sha256 } } — dobór zakresu (selectRange) i ocena (evaluate) dla każdego
// pacjenta macierzy. Oceniana wartość 1,5 w pierwszej jednostce badania nie ma znaczenia klinicznego — ważne,
// że jest ta sama przed zmianą i po niej.
export function skrotyDoboru(converter) {
  const pacjenci = pacjenciMacierzy();
  const out = {};
  for (const { id } of converter.list()) {
    if (id === WYLACZONE_BADANIE) continue;
    const substance = converter.find(id);
    const unit = substance.units[0].symbol;
    const hash = createHash('sha256');
    for (const patient of pacjenci) {
      const input = JSON.parse(JSON.stringify(patient));
      hash.update(zapis(converter.selectRange(substance, input)));
      hash.update('\n');
      hash.update(zapis(converter.evaluate(id, { value: 1.5, unit, patient: input })));
      hash.update('\n');
    }
    out[id] = { wybory: pacjenci.length, skrot: hash.digest('hex') };
  }
  return out;
}

// ── Estradiol: to, czego reguła P-E2-MENARCHE nie dotyczy (R8) ────────────────────────────────────────────────
// Grupy opisane populacją, bez kopii reguły (żadnego progu lat od menarche): mężczyźni, płeć nieznana, brak
// wieku, kobiety od 18 lat, pierwsze dni życia, wiek przecinający granicę 18 lat oraz dziewczynki poniżej 18 lat
// BEZ wpisanego wieku menarche i bez wyboru ciąży. W każdej z nich wynik ma być taki sam jak w bazie.
const FAZA_BEZ_CIAZY = FAZA.filter((faza) => !/^pregnancy/.test(faza || ''));
const przedzial = (sex, age, ageUpperYears, ageUpperInclusive) => [undefined, 10].flatMap((menarche) => FAZA.map((cycle_phase) => {
  const patient = { sex, age, ageUpperYears, ageUpperInclusive, tanner: 5, cycle_phase, life_stage: etapZycia(age, 5) };
  if (menarche !== undefined) patient.menarche_age_years = menarche;
  return patient;
}));

export function grupyEstradioluBezZmian() {
  const wszyscy = pacjenciMacierzy();
  return {
    mezczyzni: wszyscy.filter((p) => p.sex === 'M'),
    plecNieznana: wszyscy.filter((p) => p.sex === null),
    kobietyBezWieku: wszyscy.filter((p) => p.sex === 'F' && p.age === null),
    kobietyOd18Lat: wszyscy.filter((p) => p.sex === 'F' && p.age !== null && p.age >= 18),
    dziewczynkiPierwszeDniZycia: wszyscy.filter((p) => p.sex === 'F' && p.age === 0.02),
    wiekPrzecinajacyGranice18Lat: [...przedzial('F', 17, 19, false), ...przedzial('F', 17, 18, true), ...przedzial('M', 17, 19, false)],
    dziewczynkiBezMenarcheIBezCiazy: wszyscy.filter((p) => p.sex === 'F' && p.age !== null && p.age > 0.02 && p.age < 18
      && !('menarche_age_years' in p) && FAZA_BEZ_CIAZY.includes(p.cycle_phase)),
  };
}

// Wynik „brak zakresu” niesie numer wersji polityki (reference_policy_version). Zmiana reguły podbija tę wersję
// z definicji, więc do porównania z bazą numer jest pomijany; wszystko inne w wyniku musi być identyczne.
function bezWersjiPolityki(range) {
  if (!range || typeof range !== 'object') return range;
  const { reference_policy_version: _wersja, ...reszta } = range;
  return reszta;
}

export function skrotyEstradioluBezZmian(converter) {
  const substance = converter.find(WYLACZONE_BADANIE);
  const out = {};
  for (const [grupa, pacjenci] of Object.entries(grupyEstradioluBezZmian())) {
    const hash = createHash('sha256');
    for (const patient of pacjenci) {
      const input = JSON.parse(JSON.stringify(patient));
      hash.update(zapis(bezWersjiPolityki(converter.selectRange(substance, input))));
      hash.update('\n');
      hash.update(zapis(converter.evaluate(WYLACZONE_BADANIE, { value: 150, unit: 'pmol/L', patient: input })));
      hash.update('\n');
    }
    out[grupa] = { wybory: pacjenci.length, skrot: hash.digest('hex') };
  }
  return out;
}

// Stężenia, wiersze, jednostki i dotychczasowe części polityki estradiolu — bez wersji polityki i bez nowego
// bloku reguły. Zmiana P-E2-MENARCHE nie dodaje ani nie zmienia żadnej z tych wartości.
export function skrotDanychEstradiolu(converter) {
  const e2 = converter.find(WYLACZONE_BADANIE);
  const policy = e2.reference_selection_policy;
  return createHash('sha256').update(zapis({
    units: e2.units, precision: e2.precision, default_range_si: e2.default_range_si, reference_ranges_si: e2.reference_ranges_si,
    policy: { id: policy.id, require_matched: policy.require_matched, chronological_age: policy.chronological_age,
      context_pl: policy.context_pl, adult_female_context: policy.adult_female_context },
  })).digest('hex');
}
