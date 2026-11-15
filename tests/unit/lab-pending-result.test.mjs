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
    // Etap 2: lista notatek pacjenta i nasłuch zmian notatek (sejf nie ma wypisania z nasłuchu).
    listPatientNotesForPatient: vi.fn(async (pid) => {
      if (opcje.bladListy) throw new Error('fikcyjny błąd odczytu');
      return structuredClone(notes.filter((n) => n.patientId === pid));
    }),
    sluchacze: [],
    onPatientNoteChanged: vi.fn((fn) => { vault.sluchacze.push(fn); }),
    oglos: (zmiana) => vault.sluchacze.forEach((fn) => fn(zmiana)),
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
    VildaSession: { getPatient: () => ({ name: 'Fikcyjny Pacjent', sex: opcje.plec || '' }) },
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
    expect(history.version).toBe('1.6.0');
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

  it('bez podpiętego wpisu i bez wczytanego pacjenta znacznika nie ma', () => {
    const env = strona({ vault: sejf([]), pacjent: null });
    expect(env.api.choice(env.doc.body, null, {})).toBeNull();
    expect(env.api.choice(null, null, {})).toBeNull();
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

// Etap 2 (decyzja właściciela 2026-11-15): wynik wpisany bez wejścia z „Badań”. Okno przypięcia i pakiet pokazują
// oczekujące wyniki wczytanego pacjenta; domyślnie nic się nie zamyka.
describe('VildaLabHistory.pendingItems: oczekujące wyniki pacjenta w kolejności „Badań”', () => {
  const win = {};
  for (const plik of ['lab_units_data.js', 'lab_unit_converter.js', 'vilda_lab_history.js']) loadBrowserScript(plik, win);
  const { VildaLabHistory: history, LabUnitConverter: converter } = win;

  it('od najbliższego terminu, wpisy bez terminu na końcu; te same pozycje i kolejność co lista pending widoku', () => {
    const notes = [
      czekajacy('pozny', 'Kontrola IGF-1', { dueDateISO: '2026-06-20' }),
      czekajacy('bez-terminu', 'Czekam na wynik', { dueDateISO: null, recheckDays: 7 }),
      czekajacy('wczesny', 'Kontrola TSH', { dueDateISO: '2026-06-16' }),
      czekajacy('ten-sam-dzien', 'Wynik: TSH (tyreotropina)', { dueDateISO: '2026-06-16' }),
      czekajacy('wykonany', 'Kontrola LH', { completedAtISO: '2026-06-10T08:00:00.000Z' }),
      czekajacy('z-wynikiem', 'Kontrola FSH', { labResult: { testKey: 'fsh', value: '2,1', valueNum: 2.1, unit: 'IU/L' } }),
      czekajacy('notatka', 'Kontrola', { category: 'followup' }),
    ];
    const lista = history.pendingItems(notes, converter, { patientId: PID });
    expect(lista.map((p) => p.noteId)).toEqual(['wczesny', 'ten-sam-dzien', 'pozny', 'bez-terminu']);
    expect(lista.map((p) => p.seriesKey)).toEqual([null, 'tsh', null, null]);
    const zWidoku = history.buildHistoryView([], { converter, notesById: Object.fromEntries(notes.map((n) => [n.id, n])), treatment: [], nowISO: '2026-06-17' }).pending;
    expect(lista).toEqual(zWidoku);
  });

  it('tylko wpisy wskazanego pacjenta, każdy raz; błędne dane dają pustą listę', () => {
    const notes = [
      czekajacy('a', 'Kontrola TSH'), czekajacy('a', 'Kontrola TSH — powtórzony odczyt'),
      czekajacy('cudzy', 'Kontrola TSH', { patientId: 'inny-fikcyjny' }), null, 'tekst', { patientId: PID, title: 'bez id', category: 'wynik-badania', dueDateISO: '2026-06-16' },
    ];
    expect(history.pendingItems(notes, converter, { patientId: PID }).map((p) => p.noteId)).toEqual(['a']);
    expect(history.pendingItems(notes, converter).map((p) => p.noteId)).toEqual(['a', 'cudzy']);
    expect(history.pendingItems(null, converter, { patientId: PID })).toEqual([]);
    expect(history.pendingItems([czekajacy('a', 'Kontrola TSH')], null)).toMatchObject([{ noteId: 'a', seriesKey: null }]);
  });
});

describe('VildaLabPendingResult: lista oczekujących wyników pacjenta (etap 2)', () => {
  const TRZY = () => [
    czekajacy('igf', 'Kontrola IGF-1', { dueDateISO: '2026-06-20' }),
    czekajacy('bacc', 'Wynik: Biopsja tarczycy (BACC)', { dueDateISO: '2026-07-02' }),
    czekajacy('tsh', 'Kontrola TSH', { dueDateISO: '2026-06-16' }),
  ];
  async function zLista(notes, opcje = {}) {
    const vault = sejf(notes, opcje.sejf);
    const env = strona({ vault, plec: opcje.plec, pacjent: opcje.pacjent });
    const okno = env.doc.body.appendChild(env.doc.createElement('div'));
    const data = okno.appendChild(env.doc.createElement('div'));
    const wybor = env.api.choice(okno, data, Object.assign({ id: 'labPinPendingClose', testKeys: ['tsh'], names: ['TSH'] }, opcje.wybor));
    await vi.waitFor(() => expect(vault.listPatientNotesForPatient.mock.results.length).toBeGreaterThan(0));
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    return { env, vault, okno, data, wybor };
  }
  const opcje = (okno) => teksty(okno, '.lab-pending-list-option');
  const pola = (okno) => okno.querySelectorAll('.lab-pending-choice-input');
  // Atrapa DOM nie ma semantyki grupy radio: wybór jednej opcji odznacza pozostałe tutaj.
  const wybierz = (okno, n) => { pola(okno).forEach((pole, i) => { pole.checked = i === n; }); pola(okno)[n].dispatch('change'); };
  const pomoc = (okno) => teksty(okno, '.lab-pending-choice-help');
  const DOMYSLNIE = 'Domyślnie nic się nie zamyka: nazwy wpisów są wpisane odręcznie, więc aplikacja nie zgaduje, którego badania dotyczą.';

  it('listDefault: zaznacza tylko wtedy, gdy dokładnie jeden wpis ma badanie z listy równe zapisywanemu', () => {
    const { api } = strona({ vault: sejf([]) });
    const odreczny = { noteId: 'a', seriesKey: null }, tsh = { noteId: 'b', seriesKey: 'tsh' }, tsh2 = { noteId: 'c', seriesKey: 'tsh' }, ft4 = { noteId: 'd', seriesKey: 'ft4' };
    expect(api.listDefault([odreczny, tsh, ft4], ['tsh'])).toBe(tsh);
    expect(api.listDefault([odreczny, tsh, ft4], ['ft3'])).toBeNull();
    expect(api.listDefault([odreczny], ['tsh'])).toBeNull();
    // Dwa pasujące wpisy (ten sam klucz albo dwa badania pakietu): aplikacja nie rozstrzyga.
    expect(api.listDefault([tsh, tsh2], ['tsh'])).toBeNull();
    expect(api.listDefault([tsh, ft4], ['tsh', 'ft4'])).toBeNull();
    expect(api.listDefault([tsh, ft4], ['tsh', 'ft3'])).toBe(tsh);
    expect(api.listDefault([tsh], [])).toBeNull();
    expect(api.listDefault([tsh], [null])).toBeNull();
    expect(api.listDefault(null, ['tsh'])).toBeNull();
    expect(api.listDefault([null, tsh], null)).toBeNull();
  });

  it('listVisible: do trzech wszystkie; ponad trzy — trzy pierwsze, a zaznaczony zawsze wśród nich, w kolejności listy', () => {
    const { api } = strona({ vault: sejf([]) });
    const [a, b, c, d, e] = ['a', 'b', 'c', 'd', 'e'].map((noteId) => ({ noteId }));
    expect(api.listVisible([a, b, c], null)).toEqual([a, b, c]);
    expect(api.listVisible([a, b, c, d, e], null)).toEqual([a, b, c]);
    expect(api.listVisible([a, b, c, d, e], b)).toEqual([a, b, c]);
    expect(api.listVisible([a, b, c, d, e], e)).toEqual([a, b, e]);
    expect(api.listVisible([a, b, c, d, e], { noteId: 'spoza' })).toEqual([a, b, c]);
    expect(api.listVisible(null, null)).toEqual([]);
  });

  it('pacjent bez oczekujących wyników: okno jak dotąd, zapis niczego nie zamyka', async () => {
    const { env, vault, okno, data, wybor } = await zLista([czekajacy('cudzy', 'Kontrola TSH', { patientId: 'inny-fikcyjny' })]);
    expect(wybor).toMatchObject({ list: true, pending: null, patientId: PID, element: null });
    expect(okno.children).toEqual([data]);
    expect(wybor.checked()).toBe(false);
    await expect(env.api.commit(wybor, vault)).resolves.toEqual({ closed: false });
    expect(vault.completePatientNote).not.toHaveBeenCalled();
    expect(env.strip.hidden).toBe(true);
  });

  it.each([
    ['sejf zablokowany', { zablokowany: true }],
    ['błąd odczytu notatek', { bladListy: true }],
  ])('%s: bloku nie ma i nic się nie zamyka', async (_, opcjeSejfu) => {
    const vault = sejf(TRZY(), opcjeSejfu);
    const env = strona({ vault });
    const okno = env.doc.body.appendChild(env.doc.createElement('div'));
    const wybor = env.api.choice(okno, null, { id: 'labPinPendingClose', testKeys: ['tsh'] });
    await new Promise((resolve) => { setTimeout(resolve, 0); });
    expect(okno.children).toEqual([]);
    expect(wybor.checked()).toBe(false);
    await expect(env.api.commit(wybor, vault)).resolves.toEqual({ closed: false });
  });

  it('jeden wpis: odznaczony znacznik nad datą badania; zaznaczony zamyka wpis; „Cofnij zamknięcie” nie podpina wpisu', async () => {
    const { env, vault, okno, data, wybor } = await zLista([czekajacy('zl-1', 'Kontrola TSH')]);
    expect(okno.children).toEqual([wybor.element, data]);
    expect(wybor.element.classList.contains('lab-pending-list')).toBe(false);
    const pole = okno.querySelector('#labPinPendingClose');
    expect(pole.type).toBe('checkbox');
    expect(pole.checked).toBe(false);
    expect(pole.getAttribute('aria-describedby')).toBe('labPinPendingCloseHelp');
    expect(teksty(okno, '.lab-pending-choice-text')).toEqual(['Zamknij oczekujący wynik: Kontrola TSH · termin 16.06.26']);
    expect(pomoc(okno)).toEqual(['Pacjent ma oczekujący wynik. Zaznacz, jeśli ten wynik go dotyczy.']);
    // Odznaczony: zapis niczego nie zamyka.
    await expect(env.api.commit(wybor, vault)).resolves.toEqual({ closed: false });
    expect(vault.completePatientNote).not.toHaveBeenCalled();

    pole.checked = true; pole.dispatch('change');
    expect(wybor.checked()).toBe(true);
    expect(pomoc(okno)).toEqual(['Po zapisie „Kontrola TSH” zostanie oznaczony jako wykonany: zniknie z oczekujących i przestanie wracać w Przypomnieniach.']);
    await expect(env.api.commit(wybor, vault)).resolves.toEqual({ closed: true });
    expect(vault.completePatientNote).toHaveBeenCalledExactlyOnceWith('zl-1');
    expect(env.api.current()).toBeNull();
    expect(env.strip.getAttribute('role')).toBe('status');
    expect(teksty(env.strip, '.lab-pending-text')).toEqual(['Oczekujący wynik „Kontrola TSH” oznaczony jako wykonany.']);
    expect(przyciski(env.strip)).toEqual(['Cofnij zamknięcie', 'Otwórz Badania →', '×']);
    // Wpis z listy nie pochodził z adresu strony: adres zostaje, jak był.
    expect(env.win.history.replaceState).not.toHaveBeenCalled();

    przycisk(env.strip, 'Cofnij zamknięcie').click();
    await vi.waitFor(() => expect(env.toast.textContent).toBe('Cofnięto — oczekujący wynik „Kontrola TSH” znów czeka.'));
    expect(vault.uncompletePatientNote).toHaveBeenCalledExactlyOnceWith('zl-1');
    expect(env.api.current()).toBeNull();
    expect(env.strip.hidden).toBe(true);
  });

  it('płeć żeńska z sesji: „Pacjentka”; pakiet: „te wyniki”', async () => {
    const { okno } = await zLista([czekajacy('zl-1', 'Kontrola TSH')], { plec: 'F', wybor: { scope: 'package', id: 'labPkgPendingClose' } });
    expect(pomoc(okno)).toEqual(['Pacjentka ma oczekujący wynik. Zaznacz, jeśli te wyniki go dotyczą.']);
  });

  it('kilka wpisów: grupa opcji od najbliższego terminu, „Nie zamykaj żadnego” zaznaczone; wybrany wpis zamyka się sam jeden', async () => {
    const { env, vault, okno, data, wybor } = await zLista(TRZY(), { plec: 'F' });
    expect(okno.children).toEqual([wybor.element, data]);
    const grupa = okno.querySelector('#labPinPendingClose');
    expect(grupa).toBe(wybor.element);
    expect(grupa.getAttribute('role')).toBe('radiogroup');
    expect(grupa.getAttribute('aria-labelledby')).toBe('labPinPendingCloseLegend');
    expect(grupa.getAttribute('aria-describedby')).toBe('labPinPendingCloseHelp');
    expect(okno.querySelector('#labPinPendingCloseLegend').textContent).toBe('Pacjentka ma oczekujące wyniki. Zamknąć któryś tym wynikiem?');
    expect(opcje(okno)).toEqual(['Nie zamykaj żadnego', 'Kontrola TSH · termin 16.06.26', 'Kontrola IGF-1 · termin 20.06.26', 'Wynik: Biopsja tarczycy (BACC) · termin 02.07.26']);
    expect(pola(okno).map((pole) => [pole.type, pole.name, pole.value, pole.checked])).toEqual([
      ['radio', 'labPinPendingCloseOption', '', true], ['radio', 'labPinPendingCloseOption', 'tsh', false],
      ['radio', 'labPinPendingCloseOption', 'igf', false], ['radio', 'labPinPendingCloseOption', 'bacc', false],
    ]);
    expect(pomoc(okno)).toEqual([DOMYSLNIE]);
    expect(przyciski(okno)).toEqual([]);
    expect(wybor.checked()).toBe(false);
    expect(wybor.selected()).toBeNull();

    wybierz(okno, 1);
    expect(wybor.checked()).toBe(true);
    expect(wybor.selected()).toEqual({ noteId: 'tsh', title: 'Kontrola TSH', dueDateISO: '2026-06-16', seriesKey: null, patientId: PID });
    expect(teksty(okno, '.is-selected')).toEqual(['Kontrola TSH · termin 16.06.26']);
    expect(pomoc(okno)).toEqual(['Po zapisie „Kontrola TSH” zostanie oznaczony jako wykonany: zniknie z oczekujących i przestanie wracać w Przypomnieniach. Pozostałe wpisy dalej czekają.']);
    // Powrót do „Nie zamykaj żadnego”.
    wybierz(okno, 0);
    expect(wybor.checked()).toBe(false);
    expect(pomoc(okno)).toEqual([DOMYSLNIE]);
    await expect(env.api.commit(wybor, vault)).resolves.toEqual({ closed: false });

    wybierz(okno, 2);
    await expect(env.api.commit(wybor, vault)).resolves.toEqual({ closed: true });
    expect(vault.completePatientNote).toHaveBeenCalledExactlyOnceWith('igf');
    expect(teksty(env.strip, '.lab-pending-text')).toEqual(['Oczekujący wynik „Kontrola IGF-1” oznaczony jako wykonany.']);
    expect(vault.notes.filter((n) => n.completedAtISO).map((n) => n.id)).toEqual(['igf']);
  });

  it('aplikacja zaznacza wpis sama tylko przy badaniu z listy przelicznika; update zmienia to zaznaczenie, wyboru lekarza nie', async () => {
    const notes = [czekajacy('odreczny', 'Kontrola TSH', { dueDateISO: '2026-06-10' }), czekajacy('z-listy', 'Wynik: TSH (tyreotropina)')];
    const { okno, wybor } = await zLista(notes);
    expect(wybor.selected()).toMatchObject({ noteId: 'z-listy', seriesKey: 'tsh' });
    expect(pola(okno).map((pole) => pole.checked)).toEqual([false, false, true]);
    expect(pomoc(okno)).toEqual(['Zaznaczono, bo ten wpis dotyczy TSH. Zmień, jeśli to inny wynik.']);
    // Pakiet: inne wpisane badania — zaznaczenie aplikacji znika i wraca.
    wybor.update(['ft4']);
    expect(wybor.selected()).toBeNull();
    expect(pola(okno).map((pole) => pole.checked)).toEqual([true, false, false]);
    expect(pomoc(okno)).toEqual([DOMYSLNIE]);
    wybor.update(['ft4', 'tsh']);
    expect(wybor.selected()).toMatchObject({ noteId: 'z-listy' });
    // Wybór lekarza zostaje przy kolejnych zmianach wpisanych badań.
    wybierz(okno, 1);
    wybor.update(['ft4']);
    wybor.update(['tsh']);
    expect(wybor.selected()).toMatchObject({ noteId: 'odreczny' });
    wybierz(okno, 0);
    wybor.update(['tsh']);
    expect(wybor.selected()).toBeNull();
  });

  it('jeden wpis z badaniem z listy równym przypinanemu: znacznik zaznaczony z wyjaśnieniem', async () => {
    const { okno, wybor } = await zLista([czekajacy('z-listy', 'Wynik: TSH (tyreotropina)')]);
    expect(okno.querySelector('#labPinPendingClose').checked).toBe(true);
    expect(wybor.checked()).toBe(true);
    expect(pomoc(okno)).toEqual(['Zaznaczono, bo ten wpis dotyczy TSH. Odznacz, jeśli to inny wynik.']);
  });

  it('więcej niż trzy wpisy: trzy z najbliższym terminem i „Pokaż pozostałe”; po kliknięciu wszystkie, fokus na pierwszym odsłoniętym', async () => {
    const notes = ['a', 'b', 'c', 'd', 'e'].map((id, n) => czekajacy(id, 'Kontrola ' + id.toUpperCase(), { dueDateISO: '2026-06-1' + n }));
    const { env, okno, wybor } = await zLista(notes);
    expect(opcje(okno)).toEqual(['Nie zamykaj żadnego', 'Kontrola A · termin 10.06.26', 'Kontrola B · termin 11.06.26', 'Kontrola C · termin 12.06.26']);
    expect(przyciski(okno)).toEqual(['Pokaż pozostałe (2)']);
    // Wybór sprzed rozwinięcia zostaje.
    wybierz(okno, 2);
    przycisk(okno, 'Pokaż pozostałe (2)').click();
    expect(opcje(okno)).toHaveLength(6);
    expect(przyciski(okno)).toEqual([]);
    expect(pola(okno).map((pole) => pole.checked)).toEqual([false, false, true, false, false, false]);
    expect(env.doc.activeElement).toBe(pola(okno)[4]);
    expect(wybor.selected()).toMatchObject({ noteId: 'b' });
  });

  it('wpis zaznaczony przez aplikację jest widoczny od razu, także z najdalszym terminem', async () => {
    const notes = ['a', 'b', 'c', 'd'].map((id, n) => czekajacy(id, 'Kontrola ' + id.toUpperCase(), { dueDateISO: '2026-06-1' + n }))
      .concat(czekajacy('z-listy', 'Wynik: TSH (tyreotropina)', { dueDateISO: '2026-06-30' }));
    const { okno } = await zLista(notes);
    expect(opcje(okno)).toEqual(['Nie zamykaj żadnego', 'Kontrola A · termin 10.06.26', 'Kontrola B · termin 11.06.26', 'Wynik: TSH (tyreotropina) · termin 30.06.26']);
    expect(pola(okno).map((pole) => pole.checked)).toEqual([false, false, false, true]);
    expect(przyciski(okno)).toEqual(['Pokaż pozostałe (2)']);
  });

  it('pakiet: pytanie o pakiet; wybrany wpis zamyka się po zapisaniu wszystkich wyników', async () => {
    const { okno } = await zLista(TRZY(), { wybor: { scope: 'package', id: 'labPkgPendingClose', testKeys: [] } });
    expect(okno.querySelector('#labPkgPendingCloseLegend').textContent).toBe('Pacjent ma oczekujące wyniki. Zamknąć któryś tym pakietem?');
    wybierz(okno, 1);
    expect(pomoc(okno)).toEqual(['Po zapisaniu wyników „Kontrola TSH” zostanie oznaczony jako wykonany. Zamyka się dopiero, gdy zapiszą się wszystkie wpisane wyniki.']);
  });

  it('zapis notatki pacjenta w sejfie: zdarzenie zmiany, a update czyta listę ponownie — wybór lekarza zostaje, dopóki wpis czeka', async () => {
    const { env, vault, okno, wybor } = await zLista(TRZY());
    expect(vault.onPatientNoteChanged).toHaveBeenCalledTimes(1);
    wybierz(okno, 1);
    // Zmiana notatki innego pacjenta nie dotyczy listy.
    vault.oglos({ patientId: 'inny-fikcyjny' });
    expect(env.zmiany).toEqual([]);
    wybor.update(['tsh']);
    expect(vault.listPatientNotesForPatient).toHaveBeenCalledTimes(1);

    vault.notes.push(czekajacy('nowy', 'Kontrola kortyzolu', { dueDateISO: '2026-06-01' }));
    vault.oglos({ patientId: PID });
    expect(env.zmiany).toEqual([{ attached: false }]);
    wybor.update(['tsh']);
    await vi.waitFor(() => expect(opcje(okno)).toContain('Kontrola kortyzolu · termin 01.06.26'));
    expect(przyciski(okno)).toEqual(['Pokaż pozostałe (1)']);
    // Cztery wpisy: trzy widoczne, a wybrany przez lekarza wśród nich.
    expect(opcje(okno)).toEqual(['Nie zamykaj żadnego', 'Kontrola kortyzolu · termin 01.06.26', 'Kontrola TSH · termin 16.06.26', 'Kontrola IGF-1 · termin 20.06.26']);
    expect(wybor.selected()).toMatchObject({ noteId: 'tsh' });
    expect(vault.onPatientNoteChanged).toHaveBeenCalledTimes(1);

    // Wybrany wpis zamknięto gdzie indziej: znika z listy, a wybór wraca do domyślnego.
    vault.zmien('tsh', { completedAtISO: '2026-06-17T09:00:00.000Z' });
    vault.oglos({ patientId: PID });
    wybor.update(['tsh']);
    await vi.waitFor(() => expect(opcje(okno)).not.toContain('Kontrola TSH · termin 16.06.26'));
    expect(wybor.selected()).toBeNull();
    expect(pola(okno)[0].checked).toBe(true);
  });

  it('wpis zmieniony przed zamknięciem albo zmiana pacjenta: niczego nie zamyka', async () => {
    const stary = await zLista(TRZY());
    wybierz(stary.okno, 1);
    stary.vault.zmien('tsh', { completedAtISO: '2026-06-17T09:00:00.000Z' });
    await expect(stary.env.api.commit(stary.wybor, stary.vault)).resolves.toEqual({ closed: false, stale: true });
    expect(stary.vault.completePatientNote).not.toHaveBeenCalled();
    expect(teksty(stary.env.strip, '.lab-pending-text')).toEqual(['Wynik zapisany. Oczekujący wynik „Kontrola TSH” został już zamknięty albo zmieniony gdzie indziej — sprawdź go w Przypomnieniach.']);

    const inny = await zLista(TRZY());
    wybierz(inny.okno, 1);
    inny.env.win.pacjent = 'inny-fikcyjny';
    await expect(inny.env.api.commit(inny.wybor, inny.vault)).resolves.toEqual({ closed: false });
    expect(inny.vault.completePatientNote).not.toHaveBeenCalled();
    expect(inny.env.strip.hidden).toBe(true);
  });

  it('błąd zamknięcia nie odrzuca: komunikat bez „Cofnij zamknięcie”', async () => {
    const { env, vault, okno, wybor } = await zLista(TRZY(), { sejf: { bladZamkniecia: true } });
    wybierz(okno, 1);
    await expect(env.api.commit(wybor, vault)).resolves.toEqual({ closed: false, error: true });
    expect(teksty(env.strip, '.lab-pending-text')).toEqual(['Wynik zapisany, ale nie udało się oznaczyć oczekującego wyniku „Kontrola TSH” jako wykonanego — zrób to w Przypomnieniach.']);
    expect(przyciski(env.strip)).toEqual(['Otwórz Badania →', '×']);
  });

  it('wpis podpięty z „Badań” (etap 1) ma pierwszeństwo: znacznik tego wpisu, bez listy', async () => {
    const vault = sejf(TRZY());
    const env = strona({ vault, cel: 'tsh' });
    await podpiety(env);
    const okno = env.doc.body.appendChild(env.doc.createElement('div'));
    const znacznik = env.api.choice(okno, null, { id: 'labPinPendingClose', testKeys: ['tsh'], names: ['TSH'] });
    expect(znacznik.list).toBeUndefined();
    expect(znacznik.pending).toBe(env.api.current());
    expect(okno.querySelector('#labPinPendingClose').checked).toBe(true);
    expect(vault.listPatientNotesForPatient).not.toHaveBeenCalled();
    expect(env.api.version).toBe('1.1.0');
  });
});
