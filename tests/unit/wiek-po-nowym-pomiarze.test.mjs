import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// P-WIEK-NOWY-POMIAR (decyzja właściciela 2026-11-15). Po „Nowy pomiar” wiek pacjenta nie trafiał do sesji wspólnej
// (zdarzenia pól przypadały na pauzę autozapisu), więc Jednostki lab. — które czytają pacjenta z tej sesji —
// traktowały wczytane dziecko jak dorosłego. Dwie naprawy, obie sprawdzane na produkcyjnym kodzie (wycinki):
//  (1) custom-fixes.js: „Nowy pomiar” od razu zapisuje pola nowej wizyty do sesji wspólnej (publishNewVisitFields);
//  (2) przelicznik-jednostek.html: gdy sesja wspólna mimo to nie niesie wieku, przelicznik bierze wiek bieżącej
//      wizyty albo liczy go z daty urodzenia (readLoadedPatientAge), a bez żadnego źródła mówi „brak wieku”.
// Przepływ w przeglądarce: tests/e2e/wiek-po-nowym-pomiarze*.spec.mjs. Dane wyłącznie fikcyjne.
const fixes = fs.readFileSync(new URL('../../custom-fixes.js', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');
const wytnij = (zrodlo, od, doTekstu) => {
  const start = zrodlo.indexOf(od);
  if (start < 0) throw new Error(`brak wycinka: ${od}`);
  const koniec = zrodlo.indexOf(doTekstu, start + od.length);
  if (koniec < 0) throw new Error(`brak końca wycinka: ${doTekstu}`);
  return zrodlo.slice(start, koniec);
};

describe('„Nowy pomiar” zapisuje pola nowej wizyty do sesji wspólnej od razu (custom-fixes.js)', () => {
  const kod = wytnij(fixes, 'function publishNewVisitFields(){', '\nfunction finishLoadChoicePresentation(');
  function uruchom({ pola, sesja, magazyn } = {}) {
    const zapisy = [];
    const store = magazyn === undefined ? {
      updateShared(zmien, opcje) { zmien(sesja, sesja._vildaPersist); zapisy.push(opcje); return sesja; },
    } : magazyn;
    const document = { getElementById: (id) => (pola && id in pola ? { value: pola[id] } : null) };
    new Function('window', 'document', `${kod}\npublishNewVisitFields();`)({ VildaPersistence: store }, document);
    return zapisy;
  }

  it('wiek, miesiące, masa i wzrost z pól formularza — tekstem, na najwyższym poziomie; zapis wymuszony (trwa pauza autozapisu)', () => {
    // Fikcyjna dziewczynka: po „Nowy pomiar” wiek z daty urodzenia 12 l 4 m, masa i wzrost puste (nowa wizyta).
    const sesja = { name: 'Fikcyjna Beata', sex: 'F', nameLocked: true };
    const zapisy = uruchom({ pola: { age: '12', ageMonths: '4', weight: '', height: '' }, sesja });
    expect(sesja).toEqual({ name: 'Fikcyjna Beata', sex: 'F', nameLocked: true, age: '12', ageMonths: '4', weight: '', height: '' });
    expect(zapisy).toEqual([{ force: true }]);
  });

  it('kopia byId dostaje wartość tylko tam, gdzie już ją niesie; inne pola sesji zostają nietknięte', () => {
    const sesja = { name: 'Fikcyjny Antoni', sex: 'M', age: '13', ageMonths: '0', weight: '46', height: '158', advMotherHeight: '165',
      _vildaPersist: { byId: { age: '13', weight: '46', tannerStage: '2' }, globals: { x: 1 } } };
    uruchom({ pola: { age: 13, ageMonths: 5, weight: '', height: '' }, sesja });
    expect(sesja).toMatchObject({ name: 'Fikcyjny Antoni', sex: 'M', age: '13', ageMonths: '5', weight: '', height: '', advMotherHeight: '165' });
    expect(sesja._vildaPersist).toEqual({ byId: { age: '13', weight: '', tannerStage: '2' }, globals: { x: 1 } });
  });

  it('pole, którego strona nie ma, jest pomijane; brak modułu sesji albo jego błąd nie przerywa „Nowy pomiar”', () => {
    const sesja = { age: '9' };
    uruchom({ pola: { ageMonths: '2' }, sesja });
    expect(sesja).toEqual({ age: '9', ageMonths: '2' });
    expect(() => uruchom({ pola: { age: '12' }, magazyn: null })).not.toThrow();
    expect(() => uruchom({ pola: { age: '12' }, magazyn: {} })).not.toThrow();
    expect(() => uruchom({ pola: { age: '12' }, magazyn: { updateShared() { throw new Error('fikcyjny błąd zapisu'); } } })).not.toThrow();
  });

  it('kontrakt obsługi przycisku: zapis po wyliczeniu wieku (L), a przed sygnałem vilda:load-choice-applied', () => {
    const wiek = fixes.indexOf('try{window.sessionStorage.setItem("vildaLoadChoiceV1","new")}catch{}L(),p();');
    const zapis = fixes.indexOf('publishNewVisitFields();', wiek);
    const sygnal = fixes.indexOf('new CustomEvent("vilda:load-choice-applied"', wiek);
    expect(wiek).toBeGreaterThan(-1);
    expect(zapis).toBeGreaterThan(wiek);
    expect(sygnal).toBeGreaterThan(zapis);
    // Jedno wywołanie — tylko w „Nowy pomiar”; „Odtwórz zapisany stan” zapisuje sesję własną drogą.
    expect(fixes.split('publishNewVisitFields();').length - 1).toBe(1);
  });
});

describe('Jednostki lab.: wiek wczytanego pacjenta, gdy sesja wspólna go nie niesie (przelicznik-jednostek.html)', () => {
  const kod = [
    wytnij(html, 'function packageISODate(value) {', '    function packageAgeParts('),
    wytnij(html, 'function readLoadedPatientAge() {', '    function readPatientFromShared() {'),
  ].join('\n');
  const PACJENT = 'fikcyjna-pacjentka';
  function wiek({ identity = PACJENT, aktywny = null, sesjaFormularza = null, sesjaWspolna = null } = {}) {
    const window = aktywny === undefined ? {} : { VildaPubertyAssessmentContext: { readActiveContext: (opcje) => {
      expect(opcje).toEqual({ patientId: identity });
      return aktywny || { available: false, demographics: { sex: null, ageYears: null, ageMonths: null, birthDateISO: null } };
    } } };
    const persistence = { readMainSession: () => sesjaFormularza, readShared: () => sesjaWspolna };
    return new Function('window', 'persistence', 'currentPatientIdentity', `${kod}\nreturn readLoadedPatientAge();`)(window, persistence, () => identity);
  }

  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 17, 12)); });
  afterEach(() => { vi.useRealTimers(); });

  it('bez wczytanego pacjenta nic nie zgaduje — przelicznik zostaje przy danych wpisanych ręcznie', () => {
    expect(wiek({ identity: '', aktywny: { available: true, demographics: { ageYears: 12, ageMonths: 4, birthDateISO: '2014-03-10' } } })).toBeNull();
  });

  it('wiek bieżącej wizyty z żywego formularza (ten sam nośnik co w silnikach LH/FSH): 12 l 4 m', () => {
    expect(wiek({ aktywny: { available: true, demographics: { sex: 'F', ageYears: 12, ageMonths: 4, birthDateISO: '2014-02-10' } } }))
      .toEqual({ age: 12 + 4 / 12, source: 'visit' });
    // Wiek tylko w latach; „0 mies.” i puste miesiące nie zmieniają lat.
    expect(wiek({ aktywny: { available: true, demographics: { ageYears: 7, ageMonths: null, birthDateISO: null } } })).toEqual({ age: 7, source: 'visit' });
    expect(wiek({ aktywny: { available: true, demographics: { ageYears: '0', ageMonths: '5', birthDateISO: null } } })).toEqual({ age: 5 / 12, source: 'visit' });
  });

  it('formularz bez wieku, ale z datą urodzenia: ukończone lata i miesiące na dziś (17.06.2026)', () => {
    // ur. 10.03.2014 → 12 l 3 m; ur. 18.06.2014 → 11 l 11 m (dzień przed urodzinami).
    expect(wiek({ aktywny: { available: true, demographics: { ageYears: null, ageMonths: null, birthDateISO: '2014-03-10' } } }))
      .toEqual({ age: 12 + 3 / 12, source: 'birth-date' });
    expect(wiek({ aktywny: { available: true, demographics: { ageYears: null, ageMonths: null, birthDateISO: '2014-06-18' } } }))
      .toEqual({ age: 11 + 11 / 12, source: 'birth-date' });
  });

  it('bez żywego formularza: sesja formularza tylko wtedy, gdy jej wizyta należy do wczytanego pacjenta', () => {
    const user = { age: 12, ageMonths: 0, dobISO: '2014-06-17' };
    expect(wiek({ sesjaFormularza: { visit: { patientId: PACJENT }, user } })).toEqual({ age: 12, source: 'visit' });
    // Cudza sesja albo sesja bez tożsamości wizyty: nie jest źródłem wieku.
    expect(wiek({ sesjaFormularza: { visit: { patientId: 'fikcyjny-inny' }, user } })).toBeNull();
    expect(wiek({ sesjaFormularza: { user } })).toBeNull();
    // Sesja tego pacjenta bez wieku, z datą urodzenia: wiek na dziś.
    expect(wiek({ sesjaFormularza: { visit: { patientId: PACJENT }, user: { dobISO: '2014-03-10' } } })).toEqual({ age: 12.25, source: 'birth-date' });
    // Strona bez modułu oceny pokwitania działa tak samo.
    expect(wiek({ aktywny: undefined, sesjaFormularza: { visit: { patientId: PACJENT }, user } })).toEqual({ age: 12, source: 'visit' });
  });

  it('ostatnie źródło: data urodzenia w sesji wspólnej; data z przyszłości, błędna albo brak źródeł → brak wieku', () => {
    expect(wiek({ sesjaWspolna: { name: 'Fikcyjna Beata', dobISO: '2019-04-10' } })).toEqual({ age: 7 + 2 / 12, source: 'birth-date' });
    expect(wiek({ sesjaWspolna: { dobISO: '2026-07-01' } })).toBeNull();
    expect(wiek({ sesjaWspolna: { dobISO: 'nie-data' } })).toBeNull();
    expect(wiek({ sesjaWspolna: { name: 'Fikcyjna Beata' } })).toBeNull();
    expect(wiek({})).toBeNull();
  });

  it('kontrakt strony: zabezpieczenie działa tylko przy braku wieku w sesji wspólnej; brak wieku wczytanego pacjenta jest nazwany', () => {
    // Wiek z sesji wspólnej ma pierwszeństwo — zabezpieczenie nie zastępuje go wiekiem z innego źródła.
    expect(html).toContain("var ageSource = (ageNum != null && isFinite(ageNum)) ? 'shared' : null;\n      if (!ageSource) {\n        var loadedAge = readLoadedPatientAge();");
    // Etap życia bez wieku i stadium zostaje „dorosły” — dlatego brak wieku wczytanego pacjenta musi być widoczny.
    expect(html.split("p._age_missing = typeof p.age !== 'number' && !!currentPatientIdentity();").length - 1).toBe(2);
    expect(html).toContain("if (p.age == null && p._age_missing) bits.push('brak wieku');");
    expect(html).toContain('if (patient._age_missing) hints.push(AGE_MISSING_HINT);');
    expect(html).toContain("var AGE_MISSING_HINT = 'Brak wieku pacjenta — zakres nie jest dobrany do wieku. Uzupełnij wiek albo datę urodzenia na stronie głównej albo wpisz wiek w „Zmień ▼\".';");
  });
});
