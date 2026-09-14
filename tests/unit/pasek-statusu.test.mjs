import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { beforeEach, describe, expect, it } from 'vitest';

const korzen = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

// P-PASEK-STATUSU (decyzja właściciela 2026-09-14) — stały pasek zamiast dymka gasnącego
// po 2,5 s. Właściciel wybrał wariant D na desktopie (prawa kolumna, tam gdzie aplikacja
// już mówi na stałe) i B na telefonie (góra formularza), tylko na index.html.
//
// Co mierzy ten plik: samą warstwę wyświetlania. Treść trafia do OBU pojemników, bo
// o widoczności rozstrzyga CSS na progu 700 px — nie przenosimy węzła przy zmianie
// szerokości, bo przenoszenie gubi stan i bije się z odczytem dla czytników ekranu.
//
// Najważniejsza własność dla wołającego: `pokaz()` zwraca false, gdy NIE BYŁO GDZIE
// pokazać. Dzięki temu kolektor wie, że musi sięgnąć po dymek albo alert — i strona bez
// paska (DocPro, Klirens) działa dokładnie jak wcześniej.

function udawanyDom() {
  const zarejestrowane = [];

  function wezel(tag) {
    const n = {
      tag,
      dzieci: [],
      atrybuty: {},
      sluchacze: {},
      hidden: false,
      className: '',
      type: '',
      appendChild(d) { n.dzieci.push(d); return d; },
      removeChild(d) {
        const i = n.dzieci.indexOf(d);
        if (i >= 0) n.dzieci.splice(i, 1);
        return d;
      },
      setAttribute(k, v) { n.atrybuty[k] = String(v); },
      getAttribute(k) { return Object.prototype.hasOwnProperty.call(n.atrybuty, k) ? n.atrybuty[k] : null; },
      removeAttribute(k) { delete n.atrybuty[k]; },
      addEventListener(nazwa, fn) { (n.sluchacze[nazwa] = n.sluchacze[nazwa] || []).push(fn); },
      klik() { (n.sluchacze.click || []).forEach((fn) => fn()); },
      focus() { n.ogniskowany = true; },
      scrollIntoView() { n.przewiniety = true; },
    };
    Object.defineProperty(n, 'firstChild', { get: () => n.dzieci[0] || null });
    Object.defineProperty(n, 'textContent', {
      get: () => n.dzieci.map((d) => d.textContent).join(''),
      set: (v) => { n.dzieci = v === '' ? [] : [tekst(String(v))]; },
    });
    return n;
  }

  function tekst(t) {
    const n = { tag: '#text', dzieci: [], textContent: t };
    return n;
  }

  const poId = {};
  const document = {
    createElement: wezel,
    createTextNode: tekst,
    querySelectorAll: (sel) => (sel.indexOf('data-vilda-status') >= 0 ? zarejestrowane.slice() : []),
    getElementById: (id) => poId[id] || null,
    addEventListener() {},
  };

  return {
    document,
    dodajPojemnik() { const n = wezel('div'); zarejestrowane.push(n); return n; },
    dodajPole(id) { const n = wezel('input'); poId[id] = n; return n; },
    wezel,
  };
}

function zbuduj(ilePojemnikow = 1) {
  const dom = udawanyDom();
  const okno = { document: dom.document, addEventListener() {} };
  const pojemniki = [];
  for (let i = 0; i < ilePojemnikow; i += 1) pojemniki.push(dom.dodajPojemnik());
  new Function('window', fs.readFileSync(path.join(korzen, 'vilda_status_bar.js'), 'utf8'))(okno);
  return { okno, P: okno.VildaStatusBar, pojemniki, dom };
}

let z;
beforeEach(() => { z = zbuduj(2); });

describe('Komunikat trafia do obu pojemników', () => {
  it('oba dostają tę samą treść i ton, oba przestają być ukryte', () => {
    expect(z.P.pokaz({ tekst: 'Zapisano (snapshot 5) dla Testowa Zofia.', ton: 'ok' })).toBe(true);
    z.pojemniki.forEach((p) => {
      expect(p.hidden).toBe(false);
      expect(p.getAttribute('data-ton')).toBe('ok');
      expect(p.textContent).toContain('Zapisano (snapshot 5) dla Testowa Zofia.');
    });
  });

  it('kolejny komunikat zastępuje poprzedni, a nie dokleja się do niego', () => {
    z.P.pokaz({ tekst: 'Pierwszy.', ton: 'info' });
    z.P.pokaz({ tekst: 'Drugi.', ton: 'blad' });
    z.pojemniki.forEach((p) => {
      expect(p.textContent).toContain('Drugi.');
      expect(p.textContent).not.toContain('Pierwszy.');
      expect(p.getAttribute('data-ton')).toBe('blad');
    });
  });

  it('nieznany ton nie przemyca się do DOM — wpada na „info"', () => {
    z.P.pokaz({ tekst: 'Coś.', ton: 'katastrofa' });
    expect(z.pojemniki[0].getAttribute('data-ton')).toBe('info');
  });

  it('każdy ton ma swój znak, a znak jest ukryty przed czytnikiem ekranu', () => {
    z.P.pokaz({ tekst: 'Coś.', ton: 'blad' });
    const znak = z.pojemniki[0].dzieci[0];
    expect(znak.className).toBe('vilda-status-znak');
    expect(znak.getAttribute('aria-hidden')).toBe('true');
    expect(znak.textContent).toBe(z.P.ZNAKI.blad);
  });
});

describe('Kiedy paska nie ma albo nie ma co pokazać', () => {
  it('bez pojemników zwraca false — wołający ma sięgnąć po dymek', () => {
    const bez = zbuduj(0);
    expect(bez.P.dostepny()).toBe(false);
    expect(bez.P.pokaz({ tekst: 'Nie zapisano.', ton: 'blad' })).toBe(false);
  });

  it('pusty tekst nie tworzy pustego paska', () => {
    expect(z.P.pokaz({ tekst: '   ', ton: 'blad' })).toBe(false);
    expect(z.P.pokaz({})).toBe(false);
    expect(z.pojemniki[0].dzieci, 'nic nie zostało narysowane').toHaveLength(0);
    expect(z.pojemniki[0].getAttribute('data-ton')).toBeNull();
  });

  it('„Wyczyść" chowa pasek i opróżnia go', () => {
    z.P.pokaz({ tekst: 'Zapisano.', ton: 'ok' });
    z.P.wyczysc();
    z.pojemniki.forEach((p) => {
      expect(p.hidden).toBe(true);
      expect(p.textContent).toBe('');
      expect(p.getAttribute('data-ton')).toBeNull();
    });
  });
});

describe('Brakujące pola stają się odnośnikami', () => {
  const POLA = [{ id: 'weight', etykieta: 'masę ciała' }, { id: 'height', etykieta: 'wzrost' }];
  const TEKST = 'Nie zapisano — uzupełnij: masę ciała i wzrost.';

  it('treść zdania zostaje nietknięta', () => {
    z.P.pokaz({ tekst: TEKST, ton: 'blad', pola: POLA });
    expect(z.pojemniki[0].textContent).toContain(TEKST);
  });

  it('każde brakujące pole dostaje własny przycisk', () => {
    z.P.pokaz({ tekst: TEKST, ton: 'blad', pola: POLA });
    const linie = z.pojemniki[0].dzieci[1].dzieci[0];
    const linki = linie.dzieci.filter((d) => d.className === 'vilda-status-link');
    expect(linki.map((l) => l.textContent)).toEqual(['masę ciała', 'wzrost']);
  });

  it('klik w odnośnik przewija do pola i ustawia w nim kursor', () => {
    const pole = z.dom.dodajPole('weight');
    z.P.pokaz({ tekst: TEKST, ton: 'blad', pola: POLA });
    const linie = z.pojemniki[0].dzieci[1].dzieci[0];
    linie.dzieci.find((d) => d.className === 'vilda-status-link').klik();
    expect(pole.przewiniety).toBe(true);
    expect(pole.ogniskowany).toBe(true);
  });

  it('pole, którego nazwy nie ma w zdaniu, nie psuje pozostałych', () => {
    const host = z.okno.document.createElement('span');
    z.P._zTekstem(host, 'Nie zapisano — uzupełnij: wzrost.', [
      { id: 'weight', etykieta: 'masę ciała' },
      { id: 'height', etykieta: 'wzrost' },
    ]);
    expect(host.textContent).toBe('Nie zapisano — uzupełnij: wzrost.');
    expect(host.dzieci.filter((d) => d.className === 'vilda-status-link')).toHaveLength(1);
  });

  it('powtórzona nazwa nie jest podmieniana dwa razy w tym samym miejscu', () => {
    const host = z.okno.document.createElement('span');
    z.P._zTekstem(host, 'wzrost i wzrost', [
      { id: 'height', etykieta: 'wzrost' },
      { id: 'height2', etykieta: 'wzrost' },
    ]);
    const linki = host.dzieci.filter((d) => d.className === 'vilda-status-link');
    expect(linki, 'drugie dopasowanie szuka OD miejsca pierwszego').toHaveLength(2);
    expect(host.textContent).toBe('wzrost i wzrost');
  });

  it('bez listy pól zdanie zostaje zwykłym tekstem', () => {
    z.P.pokaz({ tekst: TEKST, ton: 'blad' });
    const linie = z.pojemniki[0].dzieci[1].dzieci[0];
    expect(linie.dzieci.filter((d) => d.className === 'vilda-status-link')).toHaveLength(0);
    expect(linie.textContent).toBe(TEKST);
  });
});

describe('Godzina przy komunikacie', () => {
  it('jest dopisywana domyślnie — po to, żeby dało się poznać, czy to sprzed chwili', () => {
    z.P.pokaz({ tekst: 'Zapisano.', ton: 'ok', kiedy: new Date('2026-09-14T14:09:00') });
    const meta = z.pojemniki[0].dzieci[1].dzieci[1];
    expect(meta.className).toBe('vilda-status-meta');
    expect(meta.textContent).toMatch(/\d{2}[:.]\d{2}/);
  });

  it('da się ją wyłączyć tam, gdzie nie niesie informacji', () => {
    z.P.pokaz({ tekst: 'Zapisano.', ton: 'ok', bezCzasu: true });
    expect(z.pojemniki[0].dzieci[1].dzieci).toHaveLength(1);
  });
});
