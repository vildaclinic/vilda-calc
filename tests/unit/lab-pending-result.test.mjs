import { describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { loadBrowserScript } from '../support/load-browser-script.mjs';
import { atrapaDokumentu, teksty } from '../support/atrapa-dom-lekka.mjs';

// P-OCZEKUJACE-WYNIKI (decyzje właściciela 2026-11-15): oczekujący wynik w Jednostkach lab.
// Prawdziwy moduł VildaLabPendingResult (drugi moduł pliku lab_pin_result.js — bez osobnego pliku, żeby nie
// dokładać żądania przy instalacji aplikacji), prawdziwy model VildaLabHistory i prawdziwy konwerter
// na atrapie DOM i atrapie sejfu. Dane wyłącznie FIKCYJNE.
const PID = 'fikcyjny-pacjent';
const ADRES = 'https://fikcja.test/przelicznik-jednostek.html';
const czekajacy = (id, title, extra = {}) => ({ id, patientId: PID, title, body: '', category: 'wynik-badania', dueDateISO: '2026-06-16', ...extra });

function sejf(notes, opcje = {}) {
  const vault = {
    notes,
    isUnlocked: () => opcje.zablokowany !== true,
    getPatientNote: vi.fn(async (id) => structuredClone(notes.find((n) => n.id === id) || null)),
    completePatientNote: vi.fn(async (id) => {
      if (opcje.bladZamkniecia) throw new Error('fikcyjny błąd zapisu');
      Object.assign(notes.find((n) => n.id === id), { completedAtISO: '2026-06-17T10:00:00.000Z', noShowAtISO: null });
    }),
    uncompletePatientNote: vi.fn(async (id) => { Object.assign(notes.find((n) => n.id === id), { completedAtISO: null, noShowAtISO: null }); }),
    zmien: (id, zmiany) => Object.assign(notes.find((n) => n.id === id), zmiany),
  };
  return vault;
}

// Strona przelicznika w miniaturze: pasek w nagłówku karty, toast, sesja z wczytanym pacjentem i adres.
function strona(opcje = {}) {
  const doc = atrapaDokumentu();
  const strip = doc.body.appendChild(doc.createElement('div'));
  strip.id = 'labPendingStrip';
  strip.hidden = true;
  const toast = doc.body.appendChild(doc.createElement('div'));
  toast.id = 'labToast';
  if (opcje.wPowloce) doc.documentElement.classList.add('vilda-embedded');
  const sluchacze = new Map();
  const zmiany = [];
  const adres = new URL(ADRES + (opcje.cel ? '?oczekujacy=' + opcje.cel : ''));
  const win = {
    document: doc, setTimeout, clearTimeout,
    sessionStorage: { getItem: (k) => (k === 'vildaCurrentPatientId' ? win.pacjent : null) },
    pacjent: opcje.pacjent === undefined ? PID : opcje.pacjent,
    location: adres,
    history: { state: null, replaceState: vi.fn((_stan, _tytul, url) => { win.location = new URL(url, ADRES); }) },
    CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
    addEventListener: (typ, fn) => { if (!sluchacze.has(typ)) sluchacze.set(typ, []); sluchacze.get(typ).push(fn); },
    zdarzenie: (typ, detail) => (sluchacze.get(typ) || []).forEach((fn) => fn({ type: typ, detail })),
    VildaVault: opcje.vault,
  };
  doc.defaultView = win;
  doc.addEventListener('vilda:lab-pending-result-changed', (event) => zmiany.push(event.detail));
  for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'lab_pin_result.js', 'vilda_lab_history.js']) loadBrowserScript(plik, win);
  return { win, doc, strip, toast, zmiany, api: win.VildaLabPendingResult };
}
const podpiety = (env) => vi.waitFor(() => expect(env.api.current()).not.toBeNull());
const przyciski = (korzen) => korzen.querySelectorAll('button').map((b) => b.textContent);
const przycisk = (korzen, tekst) => korzen.querySelectorAll('button').find((b) => b.textContent === tekst);

describe('VildaLabHistory.pendingItem: pojedynczy wpis jako oczekujący wynik', () => {
  const win = {};
  for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_history.js']) loadBrowserScript(plik, win);
  const { VildaLabHistory: history, LabUnitConverter: converter } = win;

  it('te same warunki i ta sama postać co lista pending widoku „Badań”', () => {
    const notes = [
      czekajacy('odreczny', 'Kontrola TSH'),
      czekajacy('z-kluczem', 'Kontrola', { labResult: { testKey: 'ft4' } }),
      czekajacy('z-listy', 'Wynik: TSH (tyreotropina)'),
      czekajacy('procedura', 'Wynik: Biopsja tarczycy (BACC)'),
      czekajacy('co-n-dni', 'Czekam na wynik', { dueDateISO: null, recheckDays: 7 }),
      czekajacy('wykonany', 'Kontrola IGF-1', { completedAtISO: '2026-06-10T08:00:00.000Z' }),
      czekajacy('niestawienie', 'Kontrola LH', { noShowAtISO: '2026-06-10T08:00:00.000Z' }),
      czekajacy('z-wynikiem', 'Kontrola FSH', { labResult: { testKey: 'fsh', value: '2,1', valueNum: 2.1, unit: 'IU/L' } }),
      czekajacy('bez-terminu', 'Opis badania', { dueDateISO: null }),
      czekajacy('inna-kategoria', 'Kontrola', { category: 'followup' }),
    ];
    const pojedynczo = notes.map((note) => history.pendingItem(note, converter)).filter(Boolean);
    const zWidoku = history.buildHistoryView([], { converter, notesById: Object.fromEntries(notes.map((n) => [n.id, n])), treatment: [], nowISO: '2026-06-17' }).pending;
    const klucz = (a, b) => a.noteId.localeCompare(b.noteId);
    expect(pojedynczo.slice().sort(klucz)).toEqual(zWidoku.slice().sort(klucz));
    expect(Object.fromEntries(pojedynczo.map((p) => [p.noteId, p.seriesKey]))).toEqual({
      odreczny: null, 'z-kluczem': 'ft4', 'z-listy': 'tsh', procedura: null, 'co-n-dni': null,
    });
  });

  it('nie zgaduje badania z nazwy wpisanej odręcznie; brak wpisu i błędne dane dają null', () => {
    expect(history.pendingItem(czekajacy('a', 'TSH'), converter).seriesKey).toBeNull();
    expect(history.pendingItem(czekajacy('b', 'Wynik: TSH'), converter).seriesKey).toBeNull();
    expect(history.pendingItem(null, converter)).toBeNull();
    expect(history.pendingItem('tekst', converter)).toBeNull();
    expect(history.pendingItem(czekajacy('c', 'Kontrola TSH'), null)).toMatchObject({ noteId: 'c', seriesKey: null });
    expect(history.version).toBe('1.5.0');
  });
});

describe('VildaLabPendingResult: model', () => {
  const { api } = strona({ vault: sejf([]) });

  it('targetNoteId: ?oczekujacy= albo #oczekujacy=; pusty, zbyt długi i ze spacją — null', () => {
    expect(api.targetNoteId({ search: '?oczekujacy=abc-1', hash: '' })).toBe('abc-1');
    expect(api.targetNoteId({ search: '?badanie=tsh&oczekujacy=abc-1', hash: '' })).toBe('abc-1');
    expect(api.targetNoteId({ search: '', hash: '#oczekujacy=abc-2' })).toBe('abc-2');
    expect(api.targetNoteId({ search: '?badanie=tsh', hash: '' })).toBeNull();
    expect(api.targetNoteId({ search: '?oczekujacy=', hash: '' })).toBeNull();
    expect(api.targetNoteId({ search: '?oczekujacy=a%20b', hash: '' })).toBeNull();
    expect(api.targetNoteId({ search: '?oczekujacy=' + 'x'.repeat(201), hash: '' })).toBeNull();
    expect(api.targetNoteId(null)).toBeNull();
  });

  it('defaultChoice: zaznaczony; odznaczony tylko gdy wpis ma badanie z listy, a zapisywane wyniki są inne', () => {
    expect(api.defaultChoice({ seriesKey: null }, ['tsh'])).toEqual({ checked: true, mismatch: false });
    expect(api.defaultChoice({ seriesKey: 'tsh' }, ['tsh'])).toEqual({ checked: true, mismatch: false });
    expect(api.defaultChoice({ seriesKey: 'tsh' }, ['ft4', 'tsh'])).toEqual({ checked: true, mismatch: false });
    expect(api.defaultChoice({ seriesKey: 'tsh' }, ['ft4'])).toEqual({ checked: false, mismatch: true });
    // Bez żadnego wyniku do zapisu (pusty pakiet) niczego nie rozstrzyga.
    expect(api.defaultChoice({ seriesKey: 'tsh' }, [])).toEqual({ checked: true, mismatch: false });
    expect(api.defaultChoice({ seriesKey: 'tsh' }, [null])).toEqual({ checked: true, mismatch: false });
    expect(api.defaultChoice(null, ['tsh'])).toEqual({ checked: true, mismatch: false });
  });
});

describe('VildaLabPendingResult: pasek i podpięcie wpisu', () => {
  it('wpis z adresu strony: pasek z nazwą, terminem i „Odłącz”; zdarzenie zmiany; drugi raz ten sam wpis — bez odczytu', async () => {
    const vault = sejf([czekajacy('zl-1', 'Kontrola TSH')]);
    const env = strona({ vault, cel: 'zl-1' });
    await podpiety(env);
    expect(env.api.current()).toEqual({ noteId: 'zl-1', title: 'Kontrola TSH', dueDateISO: '2026-06-16', seriesKey: null, patientId: PID });
    expect(env.strip.hidden).toBe(false);
    expect(env.strip.getAttribute('role')).toBeNull();
    expect(env.strip.getAttribute('data-note-id')).toBe('zl-1');
    expect(teksty(env.strip, '.lab-pending-title')).toEqual(['Oczekujący wynik: Kontrola TSH · termin 16.06.26']);
    expect(teksty(env.strip, '.lab-pending-sub')).toEqual(['Po przypięciu wyniku ten wpis zostanie oznaczony jako wykonany: zniknie z oczekujących i przestanie wracać w Przypomnieniach.']);
    expect(przyciski(env.strip)).toEqual(['Odłącz']);
    expect(env.zmiany).toEqual([{ attached: true }]);
    const odczyty = vault.getPatientNote.mock.calls.length;
    await env.api.attach('zl-1');
    expect(vault.getPatientNote).toHaveBeenCalledTimes(odczyty);
  });

  it('„Odłącz”: pasek znika, adres strony samodzielnej traci wpis; w ramce powłoki adres zostaje', async () => {
    const env = strona({ vault: sejf([czekajacy('zl-1', 'Kontrola TSH')]), cel: 'zl-1' });
    await podpiety(env);
    przycisk(env.strip, 'Odłącz').click();
    expect(env.api.current()).toBeNull();
    expect(env.strip.hidden).toBe(true);
    expect(env.win.location.search).toBe('');
    expect(env.zmiany).toEqual([{ attached: true }, { attached: false }]);

    const ramka = strona({ vault: sejf([czekajacy('zl-1', 'Kontrola TSH')]), cel: 'zl-1', wPowloce: true });
    await podpiety(ramka);
    ramka.api.detach();
    expect(ramka.win.history.replaceState).not.toHaveBeenCalled();
  });

  it.each([
    ['wpis innego pacjenta', [czekajacy('zl-1', 'Kontrola TSH', { patientId: 'inny-fikcyjny' })]],
    ['wpis już wykonany', [czekajacy('zl-1', 'Kontrola TSH', { completedAtISO: '2026-06-10T08:00:00.000Z' })]],
    ['wpis z wynikiem', [czekajacy('zl-1', 'Kontrola TSH', { labResult: { testKey: 'tsh', value: '2,5', valueNum: 2.5, unit: 'mIU/L' } })]],
    ['wpis nie istnieje', []],
  ])('%s: nie podpina się — komunikat, bez paska, adres bez wpisu', async (_, notes) => {
    const env = strona({ vault: sejf(notes), cel: 'zl-1' });
    await vi.waitFor(() => expect(env.toast.textContent).toBe('Ten oczekujący wynik jest już zamknięty albo nie należy do wczytanego pacjenta.'));
    expect(env.api.current()).toBeNull();
    expect(env.strip.hidden).toBe(true);
    expect(env.win.location.search).toBe('');
    expect(env.zmiany).toEqual([]);
  });

  it('cel od powłoki (vilda:shell-navigate-target): podpina wpis; adres innej strony ignoruje', async () => {
    const vault = sejf([czekajacy('zl-1', 'Kontrola TSH')]);
    const env = strona({ vault, wPowloce: true });
    env.win.zdarzenie('vilda:shell-navigate-target', { href: 'https://fikcja.test/docpro.html?oczekujacy=zl-1' });
    env.win.zdarzenie('vilda:shell-navigate-target', { href: null });
    await Promise.resolve();
    expect(vault.getPatientNote).not.toHaveBeenCalled();
    env.win.zdarzenie('vilda:shell-navigate-target', { href: 'przelicznik-jednostek.html?oczekujacy=zl-1&badanie=tsh' });
    await podpiety(env);
    expect(env.api.current().noteId).toBe('zl-1');
  });

  it('sejf jeszcze nie wrócił z sesji: prośba zostaje i podpina się przy zdarzeniu konta', async () => {
    vi.useFakeTimers();
    try {
      const vault = sejf([czekajacy('zl-1', 'Kontrola TSH')], { zablokowany: true });
      const env = strona({ vault, cel: 'zl-1' });
      await vi.advanceTimersByTimeAsync(6000);
      expect(env.api.current()).toBeNull();
      expect(env.toast.textContent).toBe('');
      vault.isUnlocked = () => true;
      env.doc.dispatchEvent({ type: 'vilda:auth-loaded' });
      await vi.advanceTimersByTimeAsync(200);
      expect(env.api.current()).toMatchObject({ noteId: 'zl-1' });
    } finally { vi.useRealTimers(); }
  });

  it('zmiana pacjenta zdejmuje wpis i komunikat poprzedniego pacjenta', async () => {
    const env = strona({ vault: sejf([czekajacy('zl-1', 'Kontrola TSH')]), cel: 'zl-1' });
    await podpiety(env);
    env.win.pacjent = 'inny-fikcyjny';
    env.doc.dispatchEvent({ type: 'vilda:patient-loaded' });
    expect(env.api.current()).toBeNull();
    expect(env.strip.hidden).toBe(true);
  });
});

describe('VildaLabPendingResult: znacznik „Zamknij oczekujący wynik” i zamknięcie po zapisie', () => {
  async function zeZnacznikiem(note, opcjeSejfu, opcjeZnacznika = { testKeys: ['tsh'], names: ['TSH'] }) {
    const vault = sejf([note], opcjeSejfu);
    const env = strona({ vault, cel: note.id });
    await podpiety(env);
    const okno = env.doc.body.appendChild(env.doc.createElement('div'));
    const data = okno.appendChild(env.doc.createElement('div'));
    const znacznik = env.api.choice(okno, data, Object.assign({ id: 'labPinPendingClose' }, opcjeZnacznika));
    return { env, vault, okno, data, znacznik, pole: okno.querySelector('#labPinPendingClose') };
  }
  const zaznacz = (pole, wartosc) => { pole.checked = wartosc; pole.dispatch('change'); };

  it('bez podpiętego wpisu znacznika nie ma', () => {
    const env = strona({ vault: sejf([]) });
    expect(env.api.choice(env.doc.body, null, {})).toBeNull();
  });

  it('nazwa wpisana odręcznie: zaznaczony, nad datą badania; opis zmienia się po odznaczeniu', async () => {
    const { okno, data, znacznik, pole } = await zeZnacznikiem(czekajacy('zl-1', 'Kontrola TSH'));
    expect(okno.children[0]).toBe(znacznik.element);
    expect(okno.children[1]).toBe(data);
    expect(pole.checked).toBe(true);
    expect(znacznik.checked()).toBe(true);
    expect(teksty(okno, '.lab-pending-choice-text')).toEqual(['Zamknij oczekujący wynik: Kontrola TSH · termin 16.06.26']);
    expect(teksty(okno, '.lab-pending-choice-help')[0]).toContain('oczekujący wynik zostanie oznaczony jako wykonany');
    expect(pole.getAttribute('aria-describedby')).toBe('labPinPendingCloseHelp');
    zaznacz(pole, false);
    expect(znacznik.checked()).toBe(false);
    expect(teksty(okno, '.lab-pending-choice-help')).toEqual(['Oczekujący wynik zostanie otwarty i dalej będzie wracać w Przypomnieniach.']);
    expect(znacznik.element.classList.contains('is-mismatch')).toBe(false);
  });

  it('wpis z badaniem z listy, a przypinany wynik inny: odznaczony z wyjaśnieniem; zaznaczenie przez lekarza zostaje', async () => {
    const { okno, znacznik, pole } = await zeZnacznikiem(czekajacy('zl-1', 'Wynik: TSH (tyreotropina)'), {}, { testKeys: ['ft4'], names: ['fT4'] });
    expect(pole.checked).toBe(false);
    expect(znacznik.element.classList.contains('is-mismatch')).toBe(true);
    expect(teksty(okno, '.lab-pending-choice-help')).toEqual(['Oczekujący wynik dotyczy TSH, a przypinany wynik to fT4. Zaznacz, jeśli mimo to chcesz go zamknąć.']);
    zaznacz(pole, true);
    expect(znacznik.element.classList.contains('is-mismatch')).toBe(false);
    // Pakiet przelicza domyślny stan przy każdej zmianie pól — wybór lekarza nie jest nadpisywany.
    znacznik.update(['ft3']);
    expect(znacznik.checked()).toBe(true);
  });

  it('pakiet: domyślny stan idzie za wpisanymi badaniami, dopóki lekarz nie wybierze sam', async () => {
    const { okno, znacznik } = await zeZnacznikiem(czekajacy('zl-1', 'Wynik: TSH (tyreotropina)'), {}, {});
    expect(znacznik.checked()).toBe(true);
    znacznik.update(['ft4', 'ft3']);
    expect(znacznik.checked()).toBe(false);
    expect(teksty(okno, '.lab-pending-choice-help')).toEqual(['Oczekujący wynik dotyczy TSH, a wśród zapisywanych wyników go nie ma. Zaznacz, jeśli mimo to chcesz go zamknąć.']);
    znacznik.update(['ft4', 'tsh']);
    expect(znacznik.checked()).toBe(true);
  });

  it('zapis z zaznaczonym znacznikiem: completePatientNote, komunikat z „Cofnij zamknięcie” i „Otwórz Badania →”; wpis odpięty', async () => {
    const { env, vault, znacznik } = await zeZnacznikiem(czekajacy('zl-1', 'Kontrola TSH'));
    await expect(env.api.commit(znacznik, vault)).resolves.toEqual({ closed: true });
    expect(vault.completePatientNote).toHaveBeenCalledExactlyOnceWith('zl-1');
    expect(env.api.current()).toBeNull();
    expect(env.strip.getAttribute('role')).toBe('status');
    expect(env.strip.classList.contains('is-closed')).toBe(true);
    expect(teksty(env.strip, '.lab-pending-text')).toEqual(['Oczekujący wynik „Kontrola TSH” oznaczony jako wykonany.']);
    expect(przyciski(env.strip)).toEqual(['Cofnij zamknięcie', 'Otwórz Badania →', '×']);
    expect(env.win.location.search).toBe('');
    expect(env.zmiany.at(-1)).toEqual({ attached: false });
    // Komunikat można ukryć.
    przycisk(env.strip, '×').click();
    expect(env.strip.hidden).toBe(true);
  });

  it('zapis z odznaczonym znacznikiem: wpis zostaje otwarty i podpięty', async () => {
    const { env, vault, znacznik, pole } = await zeZnacznikiem(czekajacy('zl-1', 'Kontrola TSH'));
    zaznacz(pole, false);
    await expect(env.api.commit(znacznik, vault)).resolves.toEqual({ closed: false });
    expect(vault.completePatientNote).not.toHaveBeenCalled();
    expect(env.api.current()).toMatchObject({ noteId: 'zl-1' });
    expect(env.strip.getAttribute('role')).toBeNull();
  });

  it('wpis odpięty przed zapisem („Odłącz” przy otwartym oknie): zapis niczego nie zamyka', async () => {
    const { env, vault, znacznik } = await zeZnacznikiem(czekajacy('zl-1', 'Kontrola TSH'));
    env.api.detach();
    await expect(env.api.commit(znacznik, vault)).resolves.toEqual({ closed: false });
    expect(vault.completePatientNote).not.toHaveBeenCalled();
    await expect(env.api.commit(null, vault)).resolves.toEqual({ closed: false });
  });

  it.each([
    ['wykonany gdzie indziej', { completedAtISO: '2026-06-17T09:00:00.000Z' }],
    ['niestawienie', { noShowAtISO: '2026-06-17T09:00:00.000Z' }],
    ['wynik wpisany gdzie indziej', { labResult: { testKey: 'tsh', value: '0,4', valueNum: 0.4, unit: 'mIU/L' } }],
  ])('wpis zmieniony przed zamknięciem (%s): bez completePatientNote, komunikat z odesłaniem do Przypomnień', async (_, zmiana) => {
    const { env, vault, znacznik } = await zeZnacznikiem(czekajacy('zl-1', 'Kontrola TSH'));
    vault.zmien('zl-1', zmiana);
    await expect(env.api.commit(znacznik, vault)).resolves.toEqual({ closed: false, stale: true });
    expect(vault.completePatientNote).not.toHaveBeenCalled();
    expect(teksty(env.strip, '.lab-pending-text')).toEqual(['Wynik zapisany. Oczekujący wynik „Kontrola TSH” został już zamknięty albo zmieniony gdzie indziej — sprawdź go w Przypomnieniach.']);
    expect(przyciski(env.strip)).toEqual(['Otwórz Badania →', '×']);
  });

  it('błąd zamknięcia nie odrzuca i nie cofa wyniku: komunikat bez „Cofnij zamknięcie”', async () => {
    const { env, vault, znacznik } = await zeZnacznikiem(czekajacy('zl-1', 'Kontrola TSH'), { bladZamkniecia: true });
    await expect(env.api.commit(znacznik, vault)).resolves.toEqual({ closed: false, error: true });
    expect(env.strip.classList.contains('is-close-error')).toBe(true);
    expect(teksty(env.strip, '.lab-pending-text')).toEqual(['Wynik zapisany, ale nie udało się oznaczyć oczekującego wyniku „Kontrola TSH” jako wykonanego — zrób to w Przypomnieniach.']);
    expect(przyciski(env.strip)).toEqual(['Otwórz Badania →', '×']);
    await expect(env.api.commit(znacznik, null)).resolves.toEqual({ closed: false });
  });

  it('„Cofnij zamknięcie”: uncompletePatientNote, wpis znów podpięty', async () => {
    const { env, vault, znacznik } = await zeZnacznikiem(czekajacy('zl-1', 'Kontrola TSH'));
    await env.api.commit(znacznik, vault);
    przycisk(env.strip, 'Cofnij zamknięcie').click();
    await vi.waitFor(() => expect(env.api.current()).toMatchObject({ noteId: 'zl-1' }));
    expect(vault.uncompletePatientNote).toHaveBeenCalledExactlyOnceWith('zl-1');
    expect(env.strip.getAttribute('role')).toBeNull();
    expect(teksty(env.strip, '.lab-pending-title')).toEqual(['Oczekujący wynik: Kontrola TSH · termin 16.06.26']);
    expect(env.toast.textContent).toBe('Cofnięto — oczekujący wynik „Kontrola TSH” znów czeka.');
  });

  it.each([
    ['niestawienie oznaczone później', { completedAtISO: null, noShowAtISO: '2026-06-17T11:00:00.000Z' }],
    ['ponowne zamknięcie z innym czasem', { completedAtISO: '2026-06-17T12:00:00.000Z' }],
    ['przywrócony gdzie indziej', { completedAtISO: null }],
  ])('„Cofnij zamknięcie” po zmianie wpisu gdzie indziej (%s): bez uncompletePatientNote', async (_, zmiana) => {
    const { env, vault, znacznik } = await zeZnacznikiem(czekajacy('zl-1', 'Kontrola TSH'));
    await env.api.commit(znacznik, vault);
    vault.zmien('zl-1', zmiana);
    przycisk(env.strip, 'Cofnij zamknięcie').click();
    await vi.waitFor(() => expect(teksty(env.strip, '.lab-pending-text'))
      .toEqual(['Nie cofnięto: oczekujący wynik „Kontrola TSH” zmienił się w międzyczasie — sprawdź go w Przypomnieniach.']));
    expect(vault.uncompletePatientNote).not.toHaveBeenCalled();
    expect(env.api.current()).toBeNull();
    expect(przyciski(env.strip)).toEqual(['Otwórz Badania →', '×']);
  });
});

describe('okno przypięcia i pakiet: wołania modułu oczekującego wyniku (kontrakt źródła)', () => {
  const pin = readFileSync(new URL('../../lab_pin_result.js', import.meta.url), 'utf8');
  const pakiet = readFileSync(new URL('../../vilda_lab_packages.js', import.meta.url), 'utf8');
  const strona_ = readFileSync(new URL('../../przelicznik-jednostek.html', import.meta.url), 'utf8');

  it('okno przypięcia: znacznik po podglądach oceny i zakresu, zamknięcie dopiero po zapisaniu wyniku', () => {
    expect(pin).toContain('RrPinRange(t,o);var OwChoice=OwPinChoice(t,o);');
    expect(pin).toContain('function(){A(t,e,i,OwChoice)}');
    const zapis = pin.indexOf('await r.savePatientNote(p),g();');
    const zamkniecie = pin.indexOf('if(OwChoice&&a.VildaLabPendingResult&&typeof a.VildaLabPendingResult.commit=="function")try{await a.VildaLabPendingResult.commit(OwChoice,r)}catch{}');
    expect(zapis).toBeGreaterThan(-1);
    expect(zamkniecie).toBe(zapis + 'await r.savePatientNote(p),g();'.length);
    // Funkcja zapisu zostaje samodzielna (inne testy uruchamiają jej wycinek): bez znacznika działa jak dotąd.
    const funkcja = pin.slice(pin.indexOf('async function A('), pin.indexOf('function I(){'));
    expect(funkcja).not.toMatch(/OwPinChoice|OwPinCommit/);
    // Zapis samego wyniku się nie zmienia: wpis oczekujący nie trafia do zapisywanej notatki.
    const notatka = pin.slice(pin.indexOf('p={patientId:e,title:'), zapis);
    expect(notatka).not.toMatch(/OwChoice|pending|oczekuj/i);
  });

  it('pakiet: znacznik nad paskiem zapisu, zamknięcie po zapisaniu wszystkich wyników, przed komunikatem', () => {
    expect(pakiet.indexOf("parts.pendingSlot = add(results, 'div', 'lab-pkg-pending');")).toBeLessThan(pakiet.indexOf("parts.save = add(results, 'div', 'lab-pkg-save');"));
    const lancuch = pakiet.slice(pakiet.indexOf('var saved = [], usedVault = null;'), pakiet.indexOf("toast('✓ Zapisano w karcie: ' + names);"));
    expect(lancuch.indexOf('return vault.savePatientNote(note);')).toBeLessThan(lancuch.indexOf('return closePending(usedVault);'));
    expect(lancuch.indexOf('return closePending(usedVault);')).toBeLessThan(lancuch.indexOf('state.done = {'));
    expect(pakiet).toContain("'vilda:lab-pending-result-changed'");
  });

  it('strona: pasek w nagłówku karty; moduł w pliku okna przypięcia, bez osobnego skryptu, przed pakietem', () => {
    const naglowek = strona_.slice(strona_.indexOf('<div class="lab-card-head">'), strona_.indexOf('id="labFormPane"'));
    expect(naglowek).toContain('<div class="lab-pending-strip" id="labPendingStrip" hidden></div>');
    expect(pin).toContain('root.VildaLabPendingResult = api;');
    expect(strona_).not.toContain('vilda_lab_pending_result');
    expect(strona_.indexOf('lab_pin_result.js?v=')).toBeGreaterThan(-1);
    expect(strona_.indexOf('lab_pin_result.js?v=')).toBeLessThan(strona_.indexOf('vilda_lab_packages.js?v='));
  });
});
