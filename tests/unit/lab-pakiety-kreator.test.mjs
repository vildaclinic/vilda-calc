import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// LAB-PAKIETY PR4 (kreator, decyzje właściciela 2026-11-13): własne pakiety lekarza w modelu vilda_lab_packages.js
// na PRAWDZIWYM przeliczniku, prawdziwym adapterze VildaPersistence i prawdziwym sejfie (dwa urządzenia jednego
// konta). Test pilnuje trzech rzeczy: (1) pakiet to wyłącznie lista badań katalogu — bez norm i współczynników;
// (2) badania, które pojedyncze badanie ocenia po swojemu (LH, FSH, inhibina B, testosteron całkowity, AMH), nie
// dostają w pakiecie zakresu katalogu ani zrzutu normy — dokładnie ten sam warunek co przy przypięciu wyniku;
// (3) pakiety należą do konta i przechodzą między jego urządzeniami; (4) na urządzeniu, na którym loguje się
// kilka kont, każde konto widzi tylko swoje pakiety (LAB-PAKIETY PR5). Dane wyłącznie FIKCYJNE.
const win = {};
for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_range_snapshot.js', 'vilda_lab_packages.js']) loadBrowserScript(plik, win);
const Conv = win.LabUnitConverter, Snapshot = win.VildaLabRangeSnapshot, Dane = win.VildaLabPackagesData, Model = win.VildaLabPackages;
const html = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const CHWILA = '2026-06-17T10:00:00.000Z';
const dziewczynka12 = { sex: 'F', age: 12, tanner: null, cycle_phase: null, time_of_day: null, test_protocol: null, method: null, life_stage: 'pediatric' };
const DOJRZEWANIE = { id: 'uabc1234567', name: 'Dojrzewanie', analytes: ['lh', 'fsh', 'estradiol'] };
const zapis = (...packages) => ({ schemaVersion: 1, updatedAtISO: CHWILA, packages });

// Rodzaj własnej oceny badania — z PRAWDZIWEJ strony: wycinek skryptu przelicznika z isPubertySubstance
// i ownAssessmentKind (to o niego pyta pakiet przez VildaLabConverterRuntime.ownAssessmentKind).
const rodzajOceny = (() => {
  const od = html.indexOf('    function isPubertySubstance(substance) {');
  const dokad = html.indexOf('    function readPubertyPatientContext() {');
  expect(od, 'isPubertySubstance w przeliczniku').toBeGreaterThan(-1);
  expect(dokad, 'readPubertyPatientContext w przeliczniku').toBeGreaterThan(od);
  const kontekst = {};
  vm.createContext(kontekst);
  vm.runInContext(html.slice(od, dokad), kontekst);
  return (id) => kontekst.ownAssessmentKind(id ? { id } : null);
})();

describe('które badania pojedyncze badanie ocenia po swojemu (strona przelicznika)', () => {
  it('LH, FSH, inhibina B i testosteron całkowity — ocena pokwitaniowa; AMH — własne odniesienie; reszta — pakiet', () => {
    const wszystkie = win.LabUnitsData.list().map((s) => s.id);
    expect(wszystkie).toHaveLength(34);
    expect(wszystkie.filter((id) => rodzajOceny(id) === 'puberty')).toEqual(['testosterone_total', 'lh', 'fsh', 'inhibin_b']);
    expect(wszystkie.filter((id) => rodzajOceny(id) === 'single')).toEqual(['amh']);
    expect(wszystkie.filter((id) => rodzajOceny(id) === '')).toHaveLength(29);
    expect(rodzajOceny(null)).toBe('');
  });

  it('to ten sam warunek, którym przypięcie wyniku pomija zrzut zakresu katalogu (captureLabRange)', () => {
    const od = html.indexOf('    function captureLabRange(result) {');
    const przypiecie = html.slice(od, html.indexOf('\n    }\n', od));
    expect(przypiecie).toContain("if (isPubertySubstance(currentSubstance) || currentSubstance.id === 'amh') return undefined;");
    const rodzaj = html.slice(html.indexOf('    function ownAssessmentKind(substance) {'), html.indexOf('    function readPubertyPatientContext() {'));
    expect(rodzaj).toContain("if (isPubertySubstance(substance)) return 'puberty';");
    expect(rodzaj).toContain("return substance && substance.id === 'amh' ? 'single' : '';");
  });

  it('strona udostępnia pakietowi rodzaj oceny, pacjenta dla badania i przejście do pojedynczego badania', () => {
    const od = html.indexOf('    window.VildaLabConverterRuntime = {');
    const runtime = html.slice(od, html.indexOf('\n    };', od));
    expect(runtime).toContain('getPackagePatient: function (analyteId) { return getPackagePatient(analyteId); }');
    expect(runtime).toContain('ownAssessmentKind: function (analyteId) { return ownAssessmentKind(analyteId ? { id: String(analyteId) } : null); }');
    expect(runtime).toContain("openSingle: function (analyteId) { applySubstanceDeepLink({ search: '?badanie=' + encodeURIComponent(String(analyteId || '')), hash: '' }); }");
  });
});

describe('pacjent dla badania w pakiecie (getPackagePatient strony)', () => {
  // Prawdziwe funkcje strony: getEffectivePatient (pojedyncze badanie) i getPackagePatient (pakiet) oraz
  // rozdzielczość wieku lifespanLegacyAge/lifespanAgeFor z prawdziwym silnikiem VildaLabPuberty.
  const adapter = html.slice(html.indexOf('    function getEffectivePatient()'), html.indexOf('    var RZYMSKIE'));
  const wiek = html.slice(html.indexOf('    function lifespanLegacyAge(source)'), html.indexOf('    function lifespanContraindicated(source'));
  const odMetod = html.indexOf('    var METHOD_OPTIONS = {');
  const metody = html.slice(odMetod, html.indexOf('    // ─', odMetod));
  const silnik = loadBrowserScript('vilda_lab_puberty.js');
  function strona({ shared, source, override = {}, wybrane = 'tsh' }) {
    const czytania = [];
    const kontekst = {
      window: silnik, Conv, syncPatientIdentity() {}, readPatientFromShared: () => shared,
      localOverride: override, measurementCtx: {}, currentSubstance: Conv.find(wybrane),
      overrideAgeEl: { value: override.age == null ? '' : String(override.age) }, overrideAgeMonthsEl: { value: '' },
      describePatient: () => ({ text: 'opis', missing: false }),
      // Odczyt kontekstu zapamiętuje, które badanie było wtedy „wybrane” w pojedynczym badaniu.
      readPubertyPatientContext: () => { czytania.push(kontekst.currentSubstance && kontekst.currentSubstance.id); return source; },
    };
    vm.createContext(kontekst);
    vm.runInContext(metody + wiek + adapter, kontekst);
    return { kontekst, czytania };
  }
  const zrodlo = { sourceStatus: 'ready', sex: 'F', ageYears: 12, ageMonths: 3 };
  const zKarty = { sex: 'F', age: 12.25, tanner: 2 };

  it('17-OHP: metoda domyślna pojedynczego badania (immunochemiczna); inne badania — bez metody', () => {
    const { kontekst } = strona({ shared: zKarty, source: zrodlo });
    expect(kontekst.packageMethod('oh17_progesterone')).toBe('immunoassay_pl');
    expect(kontekst.getPackagePatient('oh17_progesterone').patient).toMatchObject({ method: 'immunoassay_pl', time_of_day: null, test_protocol: null, cycle_phase: null });
    for (const id of ['cortisol', 'acth', 'testosterone_free', 'tsh', 'estradiol', undefined]) {
      expect(kontekst.getPackagePatient(id).patient, String(id)).toMatchObject({ method: null, time_of_day: null, test_protocol: null });
    }
    // Ta sama wartość, którą pojedyncze badanie ustawia jako domyślną metodę 17-OHP.
    expect(html).toContain("var defaultMethod = DEFAULT_METHOD[substance.id] || (mOpts[0] && mOpts[0].value) || null;");
  });

  it('estradiol: ten sam nośnik wieku co pojedyncze badanie bez nadpisań (przedział z danych pacjenta)', () => {
    const pakiet = strona({ shared: zKarty, source: zrodlo, wybrane: 'lh' });
    const e2 = pakiet.kontekst.getPackagePatient('estradiol').patient;
    const pojedyncze = strona({ shared: zKarty, source: zrodlo, wybrane: 'estradiol' }).kontekst.getEffectivePatient();
    for (const pole of ['sex', 'age', 'ageUpperYears', 'ageUpperInclusive', 'tanner', 'life_stage', 'cycle_phase', 'time_of_day', 'test_protocol', 'method']) {
      expect(e2[pole], pole).toEqual(pojedyncze[pole]);
    }
    expect(e2).toMatchObject({ sex: 'F', age: 12.25, tanner: 2, life_stage: 'pediatric' });
    expect(e2.ageUpperYears).toBeGreaterThan(e2.age);
    // Kontekst czytany jak przy wybranym estradiolu; wybór pojedynczego badania (LH) zostaje nietknięty.
    expect(pakiet.czytania).toEqual(['estradiol']);
    expect(pakiet.kontekst.currentSubstance.id).toBe('lh');
    // Ocena estradiolu w pakiecie = ocena pojedynczego badania dla tej samej pacjentki.
    const ocena = (patient) => Conv.evaluate('estradiol', { value: '60', unit: 'pmol/L', patient });
    expect(ocena(e2)).toEqual(ocena(pojedyncze));
    expect(ocena(e2).status).toBe('within');
  });

  it('estradiol: lokalne nadpisanie wieku i płci w przeliczniku nie wchodzi do pakietu', () => {
    const { kontekst } = strona({ shared: zKarty, source: zrodlo, override: { sex: 'M', age: 30 }, wybrane: 'estradiol' });
    expect(kontekst.getEffectivePatient()).toMatchObject({ sex: 'M', age: 30 });
    expect(kontekst.getPackagePatient('estradiol').patient).toMatchObject({ sex: 'F', age: 12.25, _has_override: false });
  });

  it('estradiol: bez gotowego źródła danych pacjenta wiek nie jest pożyczany z karty', () => {
    const { kontekst } = strona({ shared: zKarty, source: { sourceStatus: 'unavailable' } });
    const e2 = kontekst.getPackagePatient('estradiol').patient;
    expect(e2.age).toBeNull();
    expect(e2).not.toHaveProperty('ageUpperYears');
    // Pozostałe badania pakietu dalej liczą się z wieku karty.
    expect(kontekst.getPackagePatient('tsh').patient.age).toBe(12.25);
  });
});

describe('własne pakiety: zapis, lista wyboru, walidacja', () => {
  it('limity i klucz preferencji konta', () => {
    expect(Model.CUSTOM_KEY).toBe('labCustomPackages');
    expect({ ...Model.LIMITS }).toEqual({ name: 30, analytes: 10, packages: 12 });
  });

  it('normalizeCustom przyjmuje tylko poprawne wpisy i porządkuje nazwę oraz badania', () => {
    expect(Model.normalizeCustom(null)).toEqual({ schemaVersion: 1, updatedAtISO: null, packages: [] });
    expect(Model.normalizeCustom({ schemaVersion: 2, packages: [DOJRZEWANIE] }).packages).toEqual([]);
    const wynik = Model.normalizeCustom({
      schemaVersion: 1, updatedAtISO: CHWILA, obce: 'pole',
      packages: [
        { id: 'uabc1234567', name: '  Dojrzewanie   dziewcząt ', analytes: ['lh', 'fsh', 'lh', 'ESTRADIOL', 7, 'estradiol'], extra: 1 },
        { id: 'uabc1234567', name: 'Powtórzony identyfikator', analytes: ['tsh'] },
        { id: 'uabc7654321', name: 'dojrzewanie DZIEWCZĄT', analytes: ['tsh'] },
        { id: 'thyroid', name: 'Zły identyfikator', analytes: ['tsh'] },
        { id: 'uabc0000001', name: '', analytes: ['tsh'] },
        { id: 'uabc0000002', name: 'Bez badań', analytes: [] },
        { id: 'uabc0000003', name: 'x'.repeat(31), analytes: ['tsh'] },
        'tekst', null,
        { id: 'uabc0000004', name: 'Nadnercza', analytes: ['cortisol', 'acth'] },
      ],
    });
    expect(wynik).toEqual({ schemaVersion: 1, updatedAtISO: CHWILA, packages: [
      { id: 'uabc1234567', name: 'Dojrzewanie dziewcząt', analytes: ['lh', 'fsh', 'estradiol'] },
      { id: 'uabc0000004', name: 'Nadnercza', analytes: ['cortisol', 'acth'] },
    ] });
    // Limity: najwyżej 12 pakietów i 10 badań w pakiecie.
    const wiele = zapis(...Array.from({ length: 15 }, (_, i) => ({ id: `uabc00000${10 + i}`, name: `Pakiet ${i}`, analytes: ['tsh'] })));
    expect(Model.normalizeCustom(wiele).packages).toHaveLength(12);
    const dlugi = zapis({ id: 'uabc1234567', name: 'Długi', analytes: win.LabUnitsData.list().map((s) => s.id) });
    expect(Model.normalizeCustom(dlugi).packages[0].analytes).toHaveLength(10);
  });

  it('lista wyboru: pakiet wbudowany, potem własne; własny pakiet znajduje się po identyfikatorze', () => {
    const lista = Model.listPackages(Dane, zapis(DOJRZEWANIE));
    expect(lista).toEqual([
      { id: 'thyroid', slug: 'tarczyca', label: 'Tarczyca', analytes: ['tsh', 'ft4', 'ft3'], builtin: true },
      { id: 'uabc1234567', slug: 'uabc1234567', label: 'Dojrzewanie', analytes: ['lh', 'fsh', 'estradiol'], builtin: false },
    ]);
    expect(Model.listPackages(Dane, null).map((p) => p.id)).toEqual(['thyroid']);
    expect(Model.findPackage(lista, 'uabc1234567')).toBe(lista[1]);
    expect(Model.findPackage(lista, 'tarczyca')).toBe(lista[0]);
    expect(Model.findPackage(lista, 'dojrzewanie')).toBeNull();
    // Wiersze formularza własnego pakietu pochodzą z katalogu przelicznika, w kolejności pakietu.
    expect(Model.describeAnalytes(lista[1], Conv, rodzajOceny).map((w) => [w.id, w.short, w.canonicalUnit, w.own])).toEqual([
      ['lh', 'LH', 'IU/L', 'puberty'], ['fsh', 'FSH', 'IU/L', 'puberty'], ['estradiol', 'Estradiol', 'pmol/L', ''],
    ]);
    // Badanie, którego przelicznik nie zna, nie dostaje wiersza.
    expect(Model.describeAnalytes({ analytes: ['lh', 'nie_ma_takiego'] }, Conv).map((w) => w.id)).toEqual(['lh']);
  });

  it('walidacja kreatora: nazwa, skład i limity — komunikaty z makiety', () => {
    const sprawdz = (opcje) => Model.validatePackage({ data: Dane, converter: Conv, custom: zapis(DOJRZEWANIE), ...opcje });
    expect(sprawdz({ name: 'Nadnercza', analytes: ['cortisol', 'acth'] })).toEqual({ ok: true, errors: {}, package: { id: null, name: 'Nadnercza', analytes: ['cortisol', 'acth'] } });
    expect(sprawdz({ name: '   ', analytes: ['tsh'] }).errors).toEqual({ name: 'Podaj nazwę pakietu.' });
    expect(sprawdz({ name: 'x'.repeat(31), analytes: ['tsh'] }).errors).toEqual({ name: 'Nazwa pakietu może mieć najwyżej 30 znaków.' });
    // Nazwa nie może powtarzać innego pakietu — własnego ani wbudowanego, bez względu na wielkość liter i odstępy.
    for (const nazwa of ['Dojrzewanie', ' dojrzewanie ', 'TARCZYCA', 'tarczyca']) {
      expect(sprawdz({ name: nazwa, analytes: ['tsh'] }).errors, nazwa).toEqual({ name: 'Masz już pakiet o tej nazwie.' });
    }
    expect(sprawdz({ name: 'Pusty', analytes: [] }).errors).toEqual({ analytes: 'Dodaj co najmniej jedno badanie.' });
    expect(sprawdz({ name: 'Obce', analytes: ['tsh', 'kreatynina'] }).errors).toEqual({ analytes: 'Pakiet może zawierać tylko badania z przelicznika.' });
    const jedenascie = win.LabUnitsData.list().slice(0, 11).map((s) => s.id);
    expect(sprawdz({ name: 'Za duży', analytes: jedenascie }).errors).toEqual({ analytes: 'Pakiet może mieć najwyżej 10 badań.' });
    expect(sprawdz({ name: 'W sam raz', analytes: jedenascie.slice(0, 10) }).ok).toBe(true);
    expect(sprawdz({ name: '', analytes: [] }).errors).toEqual({ name: 'Podaj nazwę pakietu.', analytes: 'Dodaj co najmniej jedno badanie.' });
    // Edycja: pakiet może zachować własną nazwę; limit 12 dotyczy tylko nowego pakietu.
    expect(sprawdz({ id: 'uabc1234567', name: 'dojrzewanie', analytes: ['lh'] })).toEqual({ ok: true, errors: {}, package: { id: 'uabc1234567', name: 'dojrzewanie', analytes: ['lh'] } });
    const dwanascie = zapis(...Array.from({ length: 12 }, (_, i) => ({ id: `uabc00000${10 + i}`, name: `Pakiet ${i}`, analytes: ['tsh'] })));
    expect(Model.validatePackage({ data: Dane, converter: Conv, custom: dwanascie, name: 'Trzynasty', analytes: ['tsh'] }).errors).toEqual({ limit: 'Możesz mieć najwyżej 12 własnych pakietów.' });
    expect(Model.validatePackage({ data: Dane, converter: Conv, custom: dwanascie, id: 'uabc0000010', name: 'Zmieniony', analytes: ['ft4'] }).ok).toBe(true);
  });

  it('zapis pakietu: nowy na końcu z własnym identyfikatorem, edytowany w miejscu, usunięty znika', () => {
    const start = zapis(DOJRZEWANIE);
    const losowe = [0.1, 0.5, 0.9, 0.3, 0.7, 0.2, 0.4, 0.6, 0.8, 0.05];
    let i = 0;
    const dodany = Model.savePackage({ data: Dane, converter: Conv, custom: start, name: ' Nadnercza ', analytes: ['cortisol', 'acth', 'oh17_progesterone'], random: () => losowe[i++ % losowe.length] });
    expect(dodany.ok).toBe(true);
    expect(dodany.id).toMatch(/^u[a-z0-9]{10}$/);
    expect(dodany.custom.packages).toEqual([DOJRZEWANIE, { id: dodany.id, name: 'Nadnercza', analytes: ['cortisol', 'acth', 'oh17_progesterone'] }]);
    // Wejściowa lista zostaje nietknięta.
    expect(start.packages).toEqual([DOJRZEWANIE]);
    const zmieniony = Model.savePackage({ data: Dane, converter: Conv, custom: dodany.custom, id: 'uabc1234567', name: 'Pokwitanie', analytes: ['estradiol', 'lh'] });
    expect(zmieniony).toMatchObject({ ok: true, id: 'uabc1234567' });
    expect(zmieniony.custom.packages.map((p) => [p.id, p.name, p.analytes])).toEqual([
      ['uabc1234567', 'Pokwitanie', ['estradiol', 'lh']], [dodany.id, 'Nadnercza', ['cortisol', 'acth', 'oh17_progesterone']],
    ]);
    const bledny = Model.savePackage({ data: Dane, converter: Conv, custom: start, name: 'Tarczyca', analytes: ['tsh'] });
    expect(bledny).toEqual({ ok: false, errors: { name: 'Masz już pakiet o tej nazwie.' }, custom: Model.normalizeCustom(start), id: null });
    expect(Model.removePackage(zmieniony.custom, 'uabc1234567').packages.map((p) => p.name)).toEqual(['Nadnercza']);
    expect(Model.removePackage(zmieniony.custom, 'nie-ma').packages).toHaveLength(2);
    // Każdy zapisany pakiet przechodzi z powrotem przez normalizację bez zmian.
    expect(Model.normalizeCustom({ ...zmieniony.custom, updatedAtISO: CHWILA }).packages).toEqual(zmieniony.custom.packages);
  });

  it('katalog kreatora: 34 badania przelicznika w jego 12 grupach i kolejności, z oznaczeniem własnej oceny', () => {
    const katalog = Model.catalog(win.LabUnitsData, rodzajOceny);
    expect(katalog.map((g) => g.label)).toEqual(win.LabUnitsData.groups());
    expect(katalog).toHaveLength(12);
    expect(katalog.flatMap((g) => g.items.map((b) => b.id))).toEqual(win.LabUnitsData.list().map((s) => s.id));
    const os = katalog.find((g) => g.label === 'Oś podwzgórze-przysadka-gonady');
    expect(os.items.map((b) => [b.short, b.own])).toEqual([['LH', 'puberty'], ['FSH', 'puberty'], ['Inhibina B', 'puberty'], ['AMH', 'single'], ['SHBG', '']]);
    expect(Model.catalog(null)).toEqual([]);
    expect(Model.searchKey('  Testosteron  CAŁKOWITY ')).toBe('testosteron calkowity');
    expect(Model.searchKey('Wit. D₃')).toBe('wit. d₃');
  });
});

describe('badanie bez oceny w pakiecie (LH, FSH, inhibina B, testosteron całkowity, AMH)', () => {
  const opcje = { converter: Conv, snapshot: Snapshot, data: win.LabUnitsData, capturedAtISO: CHWILA };
  const pakiet = (wpisy, dodatki = {}) => Model.evaluatePackage({ ...opcje, patientFor: () => dziewczynka12, ownKind: rodzajOceny, ...dodatki }, wpisy);

  it('wartość jest przyjęta i przeliczona, ale wiersz nie dostaje zakresu katalogu ani zrzutu normy', () => {
    const [lh, fsh, inhibina, testosteron, amh] = pakiet([
      { analyteId: 'lh', raw: '2,1', unit: 'IU/L' }, { analyteId: 'fsh', raw: '4,5', unit: 'IU/L' }, { analyteId: 'inhibin_b', raw: '40', unit: 'pg/mL' },
      { analyteId: 'testosterone_total', raw: '25', unit: 'ng/dL' }, { analyteId: 'amh', raw: '3,2', unit: 'ng/mL' },
    ]);
    for (const [wiersz, rodzaj] of [[lh, 'puberty'], [fsh, 'puberty'], [inhibina, 'puberty'], [testosteron, 'puberty'], [amh, 'single']]) {
      expect(wiersz.status, wiersz.analyteId).toBe('ok');
      expect(wiersz.own, wiersz.analyteId).toBe(rodzaj);
      expect(wiersz, wiersz.analyteId).not.toHaveProperty('range');
      expect(wiersz.view, wiersz.analyteId).toEqual({ state: '', text: 'bez oceny w pakiecie', bounds: '', population: '', subject: '', sources: [], marker: null, general: false, own: rodzaj });
    }
    expect([lh.shown, lh.unit, lh.valueNum]).toEqual(['2,1', 'IU/L', 2.1]);
    expect([testosteron.shown, testosteron.unit, testosteron.converted]).toEqual(['25', 'ng/dL', '0,867 nmol/L']);
  });

  it('bez oznaczenia własnej oceny to samo badanie dostałoby stary ogólny zakres katalogu — dlatego pyta się stronę', () => {
    const zwykly = Model.evaluateRow({ ...opcje, patient: dziewczynka12, analyteId: 'lh', raw: '2,1', unit: 'IU/L' });
    expect(zwykly.own).toBe('');
    expect(zwykly).toHaveProperty('range');
    const wlasny = Model.evaluateRow({ ...opcje, patient: dziewczynka12, analyteId: 'lh', raw: '2,1', unit: 'IU/L', own: 'puberty' });
    expect(wlasny).not.toHaveProperty('range');
    // Nieznana wartość znacznika nie włącza trybu „bez oceny”.
    expect(Model.evaluateRow({ ...opcje, patient: dziewczynka12, analyteId: 'tsh', raw: '2', unit: 'mIU/L', own: 'cokolwiek' })).toHaveProperty('range');
  });

  it('zapis: wynik bez zakresu i bez oceny — sama wartość; z normą z wydruku — norma laboratorium', () => {
    const [lh, fsh, e2] = pakiet([
      { analyteId: 'lh', raw: '2,1', unit: 'IU/L' },
      { analyteId: 'fsh', raw: '4,5', unit: 'IU/L', normLow: '0,3', normHigh: '4' },
      { analyteId: 'estradiol', raw: '60', unit: 'pmol/L' },
    ]);
    expect(fsh.view).toMatchObject({ lab: true, own: 'puberty', classification: 'above', text: 'powyżej normy z wydruku', bounds: '0,3–4 IU/L', app: null });
    const plan = Model.planSave({ rows: [lh, fsh, e2], patientId: 'fikcyjny-pacjent', dateISO: '2026-06-17', todayISO: '2026-06-17', snapshot: Snapshot });
    expect(plan.ok).toBe(true);
    const [nLh, nFsh, nE2] = plan.notes.map((n) => n.labResult);
    expect(nLh).toEqual({ test: 'LH (hormon luteinizujący)', value: '2,1 IU/L (SI) = 2,1 IU/L', testKey: 'lh', valueNum: 2.1, unit: 'IU/L' });
    expect(nFsh).toEqual({ test: 'FSH (hormon folikulotropowy)', value: '4,5 IU/L (SI) = 4,5 IU/L', testKey: 'fsh', valueNum: 4.5, unit: 'IU/L', norm: '0,3–4 IU/L' });
    // Estradiol pakiet ocenia sam: wynik niesie zrzut normy aplikacji, jak przy przypięciu.
    expect(Object.keys(nE2)).toEqual(['test', 'value', 'testKey', 'valueNum', 'unit', 'range']);
    expect(nE2.range.measurement.sourceValue).toBe(60);
  });

  it('tekst do schowka: badanie bez oceny to sama wartość; norma z wydruku dopisuje ocenę', () => {
    const rows = pakiet([
      { analyteId: 'lh', raw: '2,1', unit: 'IU/L' },
      { analyteId: 'fsh', raw: '4,5', unit: 'IU/L', normLow: '0,3', normHigh: '4' },
      { analyteId: 'amh', raw: '3,2', unit: 'ng/mL', normLow: '1', normHigh: '6' },
    ]);
    expect(Model.buildCopyText({ rows, dateISO: '2026-06-15', todayISO: '2026-06-17' }).text.split('\n')).toEqual([
      'Badania (pobranie 15.06.2026):',
      'LH: 2,1 IU/L',
      'FSH: 4,5 IU/L — powyżej normy (norma z wydruku 0,3–4)',
      'AMH: 3,2 ng/mL (norma z wydruku 1–6)',
    ]);
  });

  it('wynik, którego silnik nie ocenia bez kontekstu próbki, jest oznaczony — karta odsyła do pojedynczego badania', () => {
    // Estradiol u dorosłej kobiety zależy od fazy cyklu; pakiet nie ma tego pola.
    const kobieta30 = { sex: 'F', age: 30, tanner: null, cycle_phase: null, time_of_day: null, test_protocol: null, method: null, life_stage: 'adult' };
    const silnik = Conv.evaluate('estradiol', { value: '100', unit: 'pmol/L', patient: kobieta30 });
    expect(silnik).toMatchObject({ status: 'no_interpretation', reference_context_required: true });
    const [e2, tsh] = pakiet([{ analyteId: 'estradiol', raw: '100', unit: 'pmol/L' }, { analyteId: 'tsh', raw: '2', unit: 'mIU/L' }], { patientFor: () => kobieta30 });
    expect(e2).toMatchObject({ status: 'ok', own: '', contextRequired: true });
    expect(e2.view).toMatchObject({ state: '', text: 'bez oceny względem zakresu', bounds: '', marker: null });
    expect(e2.view).not.toHaveProperty('classification');
    expect(tsh).not.toHaveProperty('contextRequired');
    // Z fazą cyklu (pojedyncze badanie) ten sam wynik ma ocenę — pakiet jej nie zgaduje.
    expect(Conv.evaluate('estradiol', { value: '100', unit: 'pmol/L', patient: { ...kobieta30, cycle_phase: 'follicular' } }).status).toBe('within');
    expect(Model.buildCopyText({ rows: [e2], dateISO: '2026-06-17', todayISO: '2026-06-17' }).text.split('\n')[1]).toBe('Estradiol: 100 pmol/L');
    // Badanie z własną oceną nie dostaje tego oznaczenia — ma własne łącze.
    expect(pakiet([{ analyteId: 'lh', raw: '2', unit: 'IU/L' }], { patientFor: () => kobieta30 })[0]).not.toHaveProperty('contextRequired');
  });

  it('pakiet pyta o pacjenta osobno dla każdego badania i ocenia jak silnik pojedynczego badania', () => {
    const pytania = [];
    const zMetoda = { ...dziewczynka12, method: 'immunoassay_pl' };
    const pacjentDla = (id) => { pytania.push(id); return id === 'oh17_progesterone' ? zMetoda : dziewczynka12; };
    const wpisy = [
      { analyteId: 'oh17_progesterone', raw: '3', unit: 'nmol/L' }, { analyteId: 'cortisol', raw: '300', unit: 'nmol/L' },
      { analyteId: 'acth', raw: '5', unit: 'pmol/L' }, { analyteId: 'testosterone_free', raw: '10', unit: 'pmol/L' },
    ];
    const rows = pakiet(wpisy, { patientFor: pacjentDla });
    expect(pytania).toEqual(['oh17_progesterone', 'cortisol', 'acth', 'testosterone_free']);
    rows.forEach((row, i) => {
      const patient = wpisy[i].analyteId === 'oh17_progesterone' ? zMetoda : dziewczynka12;
      const silnik = Conv.evaluate(wpisy[i].analyteId, { value: wpisy[i].raw, unit: wpisy[i].unit, patient });
      const zakres = Conv.selectRange(Conv.find(wpisy[i].analyteId), patient);
      expect(row.status, row.analyteId).toBe('ok');
      expect(row.own, row.analyteId).toBe('');
      expect(Boolean(row.range), row.analyteId).toBe(Boolean(zakres));
      if (zakres) expect(row.range.range.id, row.analyteId).toBe(zakres.id);
      if (row.view.classification) expect(row.view.classification, row.analyteId).toBe(silnik.status);
    });
    // 17-OHP: metoda immunochemiczna wybiera inny wiersz norm niż brak metody — stąd pytanie o pacjenta per badanie.
    const ohp = Conv.find('oh17_progesterone');
    expect(Conv.selectRange(ohp, zMetoda).id).not.toBe((Conv.selectRange(ohp, dziewczynka12) || {}).id);
  });
});

describe('pakiety należą do konta: prawdziwy adapter i sejf, dwa urządzenia', () => {
  function makeStorage() {
    const m = Object.create(null);
    return {
      getItem: (k) => (k in m ? m[k] : null), setItem: (k, v) => { m[k] = String(v); }, removeItem: (k) => { delete m[k]; },
      key: (i) => Object.keys(m)[i] || null, get length() { return Object.keys(m).length; },
    };
  }
  function loadDevice() {
    const okno = {
      crypto: globalThis.crypto, TextEncoder, TextDecoder, btoa: globalThis.btoa, atob: globalThis.atob,
      localStorage: makeStorage(), sessionStorage: makeStorage(),
      setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis),
      addEventListener() {}, removeEventListener() {}, dispatchEvent() {}, CustomEvent: class {},
      document: { addEventListener() {}, removeEventListener() {}, hidden: false },
    };
    okno.window = okno; okno.self = okno; okno.top = okno;
    loadBrowserScript('vilda_persistence_adapter.js', okno);
    loadBrowserScript('vilda_crypto.js', okno);
    loadBrowserScript('vilda_vault.js', okno);
    const vault = okno.VildaVault;
    vault.setStorageAdapter(vault.createInMemoryAdapter());
    return { vault, prefs: okno.VildaPersistence, okno };
  }
  async function dwaUrzadzenia() {
    const haslo = 'Pakiety#Sync!2026x';
    const A = loadDevice();
    const utworzone = await A.vault.createUser(haslo, { label: 'A', iterations: 10000 });
    const B = loadDevice();
    await B.vault.createUser(haslo, { label: 'B', iterations: 10000, recoveryKey: utworzone.recoveryKey });
    return { A, B };
  }
  const chwila = () => new Promise((r) => { setTimeout(r, 0); });
  const scal = async (Z, Do) => Do.vault.mergeSyncPayload(await Z.vault.exportSyncPayload());

  it('klucz jest zarejestrowany w adapterze jako preferencja konta (cloud-synced)', () => {
    const { prefs } = loadDevice();
    expect(prefs.MODULE_KEYS.LAB_CUSTOM_PACKAGES).toBe('labCustomPackages');
    // perUser (PR5): kopia na urządzeniu jest osobna dla każdego konta.
    expect({ ...prefs.MODULE_KEY_META.labCustomPackages }).toEqual({ scope: 'laboratory', kind: 'preference', storage: 'cloud-synced', perUser: true });
    // Jednostki z ostatniego wpisu zostają preferencją urządzenia.
    expect(prefs.MODULE_KEY_META.labPackageSettings.storage).toBe('local-persistent');
  });

  it('zapis i odczyt przez adapter; bez rejestru klucza nic się nie zapisuje', async () => {
    const { vault, prefs } = loadDevice();
    // Bez zalogowanego konta nie ma czyjej kopii czytać ani pisać.
    expect(Model.writeCustom(prefs, zapis(DOJRZEWANIE))).toBe(false);
    await vault.createUser('Pakiety#Adapter!2026', { label: 'Fikcyjne konto', iterations: 10000 });
    expect(Model.readCustom(prefs)).toEqual({ schemaVersion: 1, updatedAtISO: null, packages: [] });
    expect(Model.writeCustom(prefs, zapis(DOJRZEWANIE), '2026-06-17T11:00:00.000Z')).toBe(true);
    expect(Model.readCustom(prefs)).toEqual({ schemaVersion: 1, updatedAtISO: '2026-06-17T11:00:00.000Z', packages: [DOJRZEWANIE] });
    expect(Model.listPackages(Dane, Model.readCustom(prefs)).map((p) => p.label)).toEqual(['Tarczyca', 'Dojrzewanie']);
    expect(Model.writeCustom(null, zapis(DOJRZEWANIE))).toBe(false);
    expect(Model.writeCustom({ MODULE_KEY_META: {}, writePreferenceJSON: () => true }, zapis(DOJRZEWANIE))).toBe(false);
    expect(Model.readCustom(null).packages).toEqual([]);
    // Adapter, który trzymałby jedną kopię dla wszystkich kont urządzenia (bez perUser), nie jest używany.
    const wspolny = { MODULE_KEY_META: { labCustomPackages: { scope: 'laboratory', kind: 'preference', storage: 'cloud-synced' } },
      readPreferenceJSON: () => zapis(DOJRZEWANIE), writePreferenceJSON: () => true };
    expect(Model.readCustom(wspolny).packages).toEqual([]);
    expect(Model.writeCustom(wspolny, zapis(DOJRZEWANIE))).toBe(false);
  });

  it('pakiet utworzony na urządzeniu A jest po synchronizacji na urządzeniu B tego samego konta', async () => {
    const { A, B } = await dwaUrzadzenia();
    expect(Model.writeCustom(A.prefs, zapis(DOJRZEWANIE), '2026-06-17T11:00:00.000Z')).toBe(true);
    await chwila();
    const wyslane = await A.vault.exportSyncPayload();
    expect(JSON.parse(wyslane.userPreferences.labCustomPackages.value).packages).toEqual([DOJRZEWANIE]);
    expect(Model.readCustom(B.prefs).packages).toEqual([]);
    const wynik = await B.vault.mergeSyncPayload(wyslane);
    expect(wynik.updatedPreferenceCount).toBeGreaterThan(0);
    expect(Model.readCustom(B.prefs).packages).toEqual([DOJRZEWANIE]);
    expect(Model.listPackages(Dane, Model.readCustom(B.prefs)).map((p) => p.label)).toEqual(['Tarczyca', 'Dojrzewanie']);
  });

  it('zmiana i usunięcie pakietu na B wracają na A; przy zmianach z dwóch urządzeń wygrywa późniejsza', async () => {
    const { A, B } = await dwaUrzadzenia();
    Model.writeCustom(A.prefs, zapis(DOJRZEWANIE), '2026-06-17T11:00:00.000Z');
    await chwila();
    await scal(A, B);
    // B zmienia skład i dodaje drugi pakiet.
    const zmiana = Model.savePackage({ data: Dane, converter: Conv, custom: Model.readCustom(B.prefs), id: DOJRZEWANIE.id, name: 'Dojrzewanie', analytes: ['lh', 'fsh', 'estradiol', 'inhibin_b'] });
    const drugi = Model.savePackage({ data: Dane, converter: Conv, custom: zmiana.custom, name: 'Nadnercza', analytes: ['cortisol', 'acth'] });
    await new Promise((r) => { setTimeout(r, 5); });
    expect(Model.writeCustom(B.prefs, drugi.custom)).toBe(true);
    await chwila();
    await scal(B, A);
    expect(Model.readCustom(A.prefs).packages.map((p) => [p.name, p.analytes])).toEqual([
      ['Dojrzewanie', ['lh', 'fsh', 'estradiol', 'inhibin_b']], ['Nadnercza', ['cortisol', 'acth']],
    ]);
    // A usuwa „Dojrzewanie” — pusta albo krótsza lista też jest zapisem i przechodzi na B.
    await new Promise((r) => { setTimeout(r, 5); });
    expect(Model.writeCustom(A.prefs, Model.removePackage(Model.readCustom(A.prefs), DOJRZEWANIE.id))).toBe(true);
    await chwila();
    await scal(A, B);
    expect(Model.readCustom(B.prefs).packages.map((p) => p.name)).toEqual(['Nadnercza']);
    // Starszy stan z B nie cofa nowszego zapisu A.
    await scal(B, A);
    expect(Model.readCustom(A.prefs).packages.map((p) => p.name)).toEqual(['Nadnercza']);
  });

  describe('każde konto widzi tylko swoje pakiety (urządzenie współdzielone, LAB-PAKIETY PR5)', () => {
    const HASLO_A = 'Pakiety#KontoA!2026', HASLO_B = 'Pakiety#KontoB!2026';
    const PAKIET_A = { id: 'uaaaaaaaaaa', name: 'Dojrzewanie (lekarz A)', analytes: ['lh', 'fsh', 'estradiol'] };
    const PAKIET_B = { id: 'ubbbbbbbbbb', name: 'Nadnercza (lekarz B)', analytes: ['cortisol', 'acth'] };
    const naKoncie = async (U) => {
      const wpis = (await U.vault.exportSyncPayload()).userPreferences?.labCustomPackages;
      return wpis ? JSON.parse(wpis.value).packages : null;
    };
    const klucze = (U) => { const out = []; for (let i = 0; i < U.okno.localStorage.length; i += 1) { const k = U.okno.localStorage.key(i); if (k.startsWith('labCustomPackages')) out.push(k); } return out.sort(); };
    // Jedno urządzenie, dwa konta: A tworzy pakiet, wylogowuje się, loguje się B.
    async function dwaKonta() {
      const U = loadDevice();
      const a = (await U.vault.createUser(HASLO_A, { label: 'Lekarz A', iterations: 10000 })).userId;
      expect(Model.writeCustom(U.prefs, zapis(PAKIET_A), '2026-06-17T11:00:00.000Z')).toBe(true);
      await chwila();
      await U.vault.lock();
      const b = (await U.vault.createUser(HASLO_B, { label: 'Lekarz B', iterations: 10000 })).userId;
      return { U, a, b };
    }

    it('drugi lekarz na tym samym urządzeniu nie widzi pakietów pierwszego; każdy zapisuje własne', async () => {
      const { U, a, b } = await dwaKonta();
      expect(a).not.toBe(b);
      // B: pusta lista, tylko pakiet wbudowany.
      expect(Model.readCustom(U.prefs).packages).toEqual([]);
      expect(Model.listPackages(Dane, Model.readCustom(U.prefs)).map((p) => p.label)).toEqual(['Tarczyca']);
      expect(await naKoncie(U)).toBeNull();
      // B tworzy własny pakiet — pakiet A nie trafia ani na listę B, ani na konto B.
      const nowy = Model.savePackage({ data: Dane, converter: Conv, custom: Model.readCustom(U.prefs), name: PAKIET_B.name, analytes: PAKIET_B.analytes });
      expect(Model.writeCustom(U.prefs, nowy.custom)).toBe(true);
      await chwila();
      expect(Model.readCustom(U.prefs).packages.map((p) => p.name)).toEqual([PAKIET_B.name]);
      expect((await naKoncie(U)).map((p) => p.name)).toEqual([PAKIET_B.name]);
      // Wraca A: widzi swój pakiet i tylko swój; konto A jest nietknięte.
      await U.vault.lock();
      await U.vault.unlockUser(a, HASLO_A);
      expect(Model.readCustom(U.prefs).packages).toEqual([PAKIET_A]);
      expect(await naKoncie(U)).toEqual([PAKIET_A]);
      // Na urządzeniu są dwie osobne kopie, po jednej na konto; wspólnej nie ma.
      expect(klucze(U)).toEqual([`labCustomPackages::${a}`, `labCustomPackages::${b}`].sort());
    });

    it('po wylogowaniu nie ma czyich pakietów czytać ani gdzie pisać', async () => {
      const { U } = await dwaKonta();
      await U.vault.lock();
      expect(Model.readCustom(U.prefs).packages).toEqual([]);
      expect(Model.writeCustom(U.prefs, zapis(PAKIET_B))).toBe(false);
      expect(U.prefs.applyPreferenceFromCloud('labCustomPackages', JSON.stringify(zapis(PAKIET_B)))).toBe(false);
    });

    it('zanim sejf się załaduje, konto wskazuje zapis sesji karty — pakiety są od razu tego samego konta', async () => {
      const { U, a } = await dwaKonta();
      await U.vault.lock();
      await U.vault.unlockUser(a, HASLO_A);
      // Druga ramka tej samej karty: ten sam magazyn, adapter bez załadowanego sejfu.
      const ramka = { localStorage: U.okno.localStorage, sessionStorage: U.okno.sessionStorage, addEventListener() {}, removeEventListener() {}, dispatchEvent() {},
        setTimeout: setTimeout.bind(globalThis), clearTimeout: clearTimeout.bind(globalThis) };
      ramka.window = ramka; ramka.self = ramka; ramka.top = ramka;
      loadBrowserScript('vilda_persistence_adapter.js', ramka);
      expect(ramka.VildaVault).toBeUndefined();
      expect(Model.readCustom(ramka.VildaPersistence).packages).toEqual([PAKIET_A]);
      // Po wylogowaniu zapis sesji znika, a z nim dostęp do kopii.
      await U.vault.lock();
      expect(Model.readCustom(ramka.VildaPersistence).packages).toEqual([]);
    });

    it('synchronizacja wpisuje pakiety do kopii zalogowanego konta i tylko jego', async () => {
      const { U, a } = await dwaKonta();
      // B jest zalogowany; z chmury przychodzą pakiety konta B (z jego innego urządzenia).
      expect(U.prefs.applyPreferenceFromCloud('labCustomPackages', JSON.stringify(zapis(PAKIET_B)))).toBe(true);
      expect(Model.readCustom(U.prefs).packages).toEqual([PAKIET_B]);
      await U.vault.lock();
      await U.vault.unlockUser(a, HASLO_A);
      expect(Model.readCustom(U.prefs).packages).toEqual([PAKIET_A]);
    });

    describe('stara wspólna kopia urządzenia (wersja 1.3.0) trafia do właściwego konta', () => {
      // Stan sprzed poprawki: pakiety konta A w sejfie A, a na urządzeniu jedna kopia pod wspólnym kluczem.
      async function zeStaraKopia() {
        const stan = await dwaKonta();
        const { U, a } = stan;
        const kopiaA = U.okno.localStorage.getItem(`labCustomPackages::${a}`);
        U.okno.localStorage.removeItem(`labCustomPackages::${a}`);
        U.okno.localStorage.setItem('labCustomPackages', kopiaA);
        return { ...stan, kopiaA };
      }

      it('obce konto: pakiety ze starej kopii nie są pokazane ani przejęte; kopia czeka na właściciela', async () => {
        const { U, kopiaA } = await zeStaraKopia();
        // Zalogowany B. Sama stara kopia nie jest niczyimi pakietami.
        expect(Model.readCustom(U.prefs).packages).toEqual([]);
        expect(Model.legacyPending(U.prefs)).toBe(true);
        expect(await Model.adoptLegacy({ persistence: U.prefs, vault: U.vault })).toBe('empty');
        expect(Model.readCustom(U.prefs).packages).toEqual([]);
        expect(Model.legacyPending(U.prefs)).toBe(false);
        expect(U.okno.localStorage.getItem('labCustomPackages')).toBe(kopiaA);
        // Rozstrzygnięcie niczego nie dopisuje do konta B.
        await chwila();
        expect(await naKoncie(U)).toBeNull();
        // Drugi raz nie ma czego rozstrzygać.
        expect(await Model.adoptLegacy({ persistence: U.prefs, vault: U.vault })).toBe('own');
      });

      it('właściciel: dostaje swoje pakiety z konta, stara kopia znika', async () => {
        const { U, a, b } = await zeStaraKopia();
        await Model.adoptLegacy({ persistence: U.prefs, vault: U.vault });
        await U.vault.lock();
        await U.vault.unlockUser(a, HASLO_A);
        expect(Model.readCustom(U.prefs).packages).toEqual([]);
        expect(Model.legacyPending(U.prefs)).toBe(true);
        expect(await Model.adoptLegacy({ persistence: U.prefs, vault: U.vault })).toBe('account');
        expect(Model.readCustom(U.prefs).packages).toEqual([PAKIET_A]);
        expect(klucze(U)).toEqual([`labCustomPackages::${a}`, `labCustomPackages::${b}`].sort());
        expect(await naKoncie(U)).toEqual([PAKIET_A]);
      });

      it('konto z własnymi pakietami w sejfie, a stara kopia cudza: dostaje swoje, cudzej nie rusza', async () => {
        const { U, a, kopiaA } = await zeStaraKopia();
        // B ma pakiety na koncie (zapis przed poprawką szedł do sejfu), ale na urządzeniu nie ma jego kopii.
        expect(Model.writeCustom(U.prefs, zapis(PAKIET_B), '2026-06-17T12:00:00.000Z')).toBe(true);
        await chwila();
        U.okno.localStorage.removeItem(`labCustomPackages::${U.vault.getCurrentUser().userId}`);
        expect(Model.readCustom(U.prefs).packages).toEqual([]);
        expect(await Model.adoptLegacy({ persistence: U.prefs, vault: U.vault })).toBe('account');
        expect(Model.readCustom(U.prefs).packages).toEqual([PAKIET_B]);
        expect(U.okno.localStorage.getItem('labCustomPackages')).toBe(kopiaA);
        await U.vault.lock();
        await U.vault.unlockUser(a, HASLO_A);
        expect(await Model.adoptLegacy({ persistence: U.prefs, vault: U.vault })).toBe('account');
        expect(Model.readCustom(U.prefs).packages).toEqual([PAKIET_A]);
        expect(U.okno.localStorage.getItem('labCustomPackages')).toBeNull();
      });

      it('bez starej kopii sejf nie jest czytany; zablokowany sejf i błąd odczytu niczego nie zapisują', async () => {
        const { U, a } = await dwaKonta();
        let odczyty = 0;
        const liczacy = { isUnlocked: () => U.vault.isUnlocked(), getCurrentUser: () => U.vault.getCurrentUser(), exportSyncPayload: () => { odczyty += 1; return U.vault.exportSyncPayload(); } };
        expect(await Model.adoptLegacy({ persistence: U.prefs, vault: liczacy })).toBe('none');
        expect(odczyty).toBe(0);
        U.okno.localStorage.setItem('labCustomPackages', JSON.stringify(zapis(PAKIET_A)));
        const zepsuty = { ...liczacy, exportSyncPayload: () => Promise.reject(new Error('fikcyjny błąd odczytu')) };
        expect(await Model.adoptLegacy({ persistence: U.prefs, vault: zepsuty })).toBe('unresolved');
        expect(Model.legacyPending(U.prefs)).toBe(true);
        // Konto zmienione w trakcie odczytu sejfu: wynik odczytu nie trafia do kopii innego konta.
        const zmienny = { ...liczacy, exportSyncPayload: async () => { const ladunek = await U.vault.exportSyncPayload(); await U.vault.lock(); await U.vault.unlockUser(a, HASLO_A); return ladunek; } };
        expect(await Model.adoptLegacy({ persistence: U.prefs, vault: zmienny })).toBe('unresolved');
        expect(U.okno.localStorage.getItem(`labCustomPackages::${a}`)).not.toBeNull();
        expect(Model.readCustom(U.prefs).packages).toEqual([PAKIET_A]);
        await U.vault.lock();
        expect(await Model.adoptLegacy({ persistence: U.prefs, vault: U.vault })).toBe('unresolved');
      });
    });
  });

  it('ostatnio wybrany pakiet i jednostki pamięta urządzenie (labPackageSettings), nie konto', () => {
    const { prefs } = loadDevice();
    expect(Model.readSettings(prefs)).toEqual({ schemaVersion: 1, units: {} });
    expect(Model.rememberPackage(prefs, 'uabc1234567')).toBe(true);
    expect(Model.rememberUnits(prefs, { lh: 'IU/L' })).toBe(true);
    expect(Model.readSettings(prefs)).toEqual({ schemaVersion: 1, units: { lh: 'IU/L' }, lastPackage: 'uabc1234567' });
    expect(Model.rememberPackage(prefs, 'thyroid')).toBe(true);
    expect(Model.readSettings(prefs).lastPackage).toBe('thyroid');
    expect(Model.normalizeSettings({ schemaVersion: 1, units: {}, lastPackage: 'Zły identyfikator!' })).toEqual({ schemaVersion: 1, units: {} });
  });
});
