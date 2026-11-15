import fs from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// P-BADANIA-WEJSCIE (decyzja właściciela 2026-11-15): po „Wczytaj pacjenta i dodaj wyniki” w zakładce „Badania”
// przelicznik otwiera się dopiero po wyborze wizyty, zakończonym wczytaniu i wieku w sesji wspólnej.
// Test wykonuje produkcyjny blok z vilda_auth_ui.js (wycinek, jak w auth-patient-load-authority.test.mjs).
const auth = fs.readFileSync(new URL('../../vilda_auth_ui.js', import.meta.url), 'utf8');
const start = auth.indexOf('var BD_PRZEJSCIE_PIERWSZE_MS=');
const blok = auth.slice(start, auth.indexOf('\n// Capture before a patient read or confirmation.', start));
const PID = 'fikcyjna-pacjentka-b';

function srodowisko({ powloka = true } = {}) {
  const stan = { pacjent: PID, okno: false, wczytywanie: false, wybor: null, wstrzymany: false,
    formularz: { age: '12', ageMonths: '4' }, sesja: { age: '12', ageMonths: '4' }, zdarzenia: [], dymki: [] };
  const navigate = vi.fn(), assign = vi.fn();
  const pole = (id) => ({ value: stan.formularz[id], dispatchEvent(event) {
    stan.zdarzenia.push([id, event.type, event.bubbles]);
    // Zapis pól pacjenta do sesji wspólnej robi userData.js — tylko poza pauzą autozapisu.
    if (!stan.wstrzymany) stan.sesja = { ...stan.formularz };
  } });
  const i = {
    setTimeout, clearTimeout,
    Event: class { constructor(type, init) { this.type = type; this.bubbles = !!(init && init.bubbles); } },
    document: {
      documentElement: { classList: { contains: (nazwa) => powloka && nazwa === 'vilda-embedded' } },
      getElementById: (id) => (id === 'vildaLoadChoiceModal' ? (stan.okno ? {} : null) : id in stan.formularz ? pole(id) : null),
    },
    sessionStorage: { getItem: (klucz) => (klucz === 'vildaLoadChoiceV1' ? stan.wybor : null) },
    VildaDataImportExport: { getPatientLoadPresentation: () => (stan.wczytywanie ? { state: 'loading' } : null) },
    VildaPersistence: { readShared: () => stan.sesja, isAutosaveSuppressed: () => stan.wstrzymany },
    VildaDymek: { pokaz: (tekst, opcje) => stan.dymki.push([tekst, opcje && opcje.ton]) },
    location: { assign },
  };
  i.parent = powloka ? { VildaShell: { navigate } } : i;
  const api = new Function('i', 'bo', `${blok}\nreturn { przejdz: BdPrzejdzPoWczytaniu, zgodna: BdSesjaZgodna };`)(i, (id) => id === stan.pacjent);
  return { stan, navigate, assign, api };
}

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 5, 17, 12)); });
afterEach(() => { vi.useRealTimers(); });

describe('P-BADANIA-WEJSCIE: przejście do przelicznika po wczytaniu pacjenta z zakładki „Badania”', () => {
  it('wycinek produkcyjny istnieje', () => {
    expect(start).toBeGreaterThan(-1);
    expect(blok).toContain('function BdPrzejdzPoWczytaniu(');
  });

  it('bez okna wyboru i z wiekiem w sesji: przelicznik otwiera się po pierwszym sprawdzeniu — trasa „lab” powłoki z adresem badania albo bez', async () => {
    const z = srodowisko();
    z.api.przejdz(PID, 'przelicznik-jednostek.html?badanie=tsh');
    expect(z.navigate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(80);
    expect(z.navigate.mock.calls).toEqual([['lab', true, 'przelicznik-jednostek.html?badanie=tsh']]);
    const bez = srodowisko();
    bez.api.przejdz(PID, null);
    await vi.advanceTimersByTimeAsync(80);
    expect(bez.navigate.mock.calls).toEqual([['lab', true]]);
    // Po przejściu nic już nie tyka.
    await vi.advanceTimersByTimeAsync(10_000);
    expect(bez.navigate).toHaveBeenCalledOnce();
    expect(bez.stan.zdarzenia).toEqual([]);
  });

  it('poza powłoką: zwykły adres strony', async () => {
    const z = srodowisko({ powloka: false });
    z.api.przejdz(PID, 'przelicznik-jednostek.html?badanie=ft4');
    await vi.advanceTimersByTimeAsync(80);
    expect(z.assign.mock.calls).toEqual([['przelicznik-jednostek.html?badanie=ft4']]);
    const bez = srodowisko({ powloka: false });
    bez.api.przejdz(PID, null);
    await vi.advanceTimersByTimeAsync(80);
    expect(bez.assign.mock.calls).toEqual([['przelicznik-jednostek.html']]);
  });

  it('okno „Co chcesz zrobić?”: czeka bez limitu; po wyborze wizyty i końcu wczytywania otwiera przelicznik', async () => {
    for (const wybor of ['new', 'restore']) {
      const z = srodowisko();
      z.stan.okno = true; z.stan.wczytywanie = true;
      z.api.przejdz(PID, null);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(z.navigate).not.toHaveBeenCalled();
      z.stan.okno = false; z.stan.wybor = wybor;
      await vi.advanceTimersByTimeAsync(600);
      expect(z.navigate, 'wczytywanie jeszcze trwa').not.toHaveBeenCalled();
      z.stan.wczytywanie = false;
      await vi.advanceTimersByTimeAsync(150);
      expect(z.navigate.mock.calls).toEqual([['lab', true]]);
    }
  });

  it('okno zamknięte bez wyboru kończy zamiar: przelicznik się nie otwiera, także po późniejszym wyborze', async () => {
    const z = srodowisko();
    z.stan.okno = true;
    z.api.przejdz(PID, null);
    await vi.advanceTimersByTimeAsync(500);
    z.stan.okno = false;
    await vi.advanceTimersByTimeAsync(300);
    z.stan.wybor = 'restore';
    await vi.advanceTimersByTimeAsync(20_000);
    expect(z.navigate).not.toHaveBeenCalled();
    expect(z.stan.zdarzenia).toEqual([]);
  });

  it('inny pacjent albo nikt w formularzu (kolejne wczytanie, wyczyszczenie, blokada) kończy zamiar', async () => {
    const z = srodowisko();
    z.stan.okno = true;
    z.api.przejdz(PID, null);
    await vi.advanceTimersByTimeAsync(400);
    z.stan.pacjent = 'fikcyjny-inny-pacjent'; z.stan.okno = false; z.stan.wybor = 'new';
    await vi.advanceTimersByTimeAsync(20_000);
    expect(z.navigate).not.toHaveBeenCalled();
  });

  it('nowy zamiar zastępuje poprzedni: otwiera się tylko ostatni adres', async () => {
    const z = srodowisko();
    z.stan.okno = true;
    z.api.przejdz(PID, 'przelicznik-jednostek.html?badanie=tsh');
    await vi.advanceTimersByTimeAsync(300);
    z.api.przejdz(PID, 'przelicznik-jednostek.html?badanie=ft4');
    z.stan.okno = false; z.stan.wybor = 'new';
    await vi.advanceTimersByTimeAsync(1000);
    expect(z.navigate.mock.calls).toEqual([['lab', true, 'przelicznik-jednostek.html?badanie=ft4']]);
  });

  it('sesja wspólna jeszcze bez wieku: czeka na zapis aplikacji i otwiera przelicznik, gdy tylko przyjdzie — sama niczego nie wysyła', async () => {
    const z = srodowisko();
    z.stan.sesja = {}; z.stan.wybor = 'new';
    expect(z.api.zgodna()).toBe(false);
    z.api.przejdz(PID, null);
    await vi.advanceTimersByTimeAsync(2000);
    expect(z.navigate).not.toHaveBeenCalled();
    expect(z.stan.dymki).toEqual([['Za chwilę otworzą się Jednostki lab.', 'info']]);
    z.stan.sesja = { age: '12', ageMonths: '4' };
    await vi.advanceTimersByTimeAsync(150);
    expect(z.navigate.mock.calls).toEqual([['lab', true]]);
    expect(z.stan.zdarzenia).toEqual([]);
  });

  // P-WIEK-NOWY-POMIAR: przyczyna naprawiona u źródła („Nowy pomiar” zapisuje wiek do sesji od razu), więc dawne
  // obejście — ponowienie zdarzenia change na polu wieku — zostało usunięte. Zostaje sam strażnik z limitem.
  it('zapis nie przyszedł: żadnego zdarzenia na polach formularza; po 3 s przelicznik otwiera się z tym, co jest', async () => {
    const z = srodowisko();
    z.stan.sesja = {}; z.stan.wybor = 'new';
    z.api.przejdz(PID, 'przelicznik-jednostek.html?badanie=tsh');
    await vi.advanceTimersByTimeAsync(2900);
    expect(z.navigate).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(400);
    expect(z.navigate.mock.calls).toEqual([['lab', true, 'przelicznik-jednostek.html?badanie=tsh']]);
    expect(z.stan.zdarzenia).toEqual([]);
    expect(z.stan.sesja).toEqual({});
    expect(z.stan.dymki).toHaveLength(1);
    expect(blok).not.toContain('dispatchEvent');
  });

  it('BdSesjaZgodna: puste pola i brak kluczy są równe; strona bez pól wieku albo bez modułu sesji nie wstrzymuje przejścia', () => {
    const z = srodowisko();
    z.stan.formularz = { age: '', ageMonths: '' }; z.stan.sesja = {};
    expect(z.api.zgodna()).toBe(true);
    z.stan.formularz = { age: '12', ageMonths: '0' }; z.stan.sesja = { age: 12, ageMonths: ' 0 ' };
    expect(z.api.zgodna()).toBe(true);
    z.stan.sesja = { age: '12', ageMonths: '4' };
    expect(z.api.zgodna()).toBe(false);
    z.stan.formularz = {};
    expect(z.api.zgodna()).toBe(true);
  });
});
