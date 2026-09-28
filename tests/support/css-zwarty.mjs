// P-STYLE rata 1 (decyzja właściciela 2026-09-28): arkusze aplikacji są w repozytorium SFORMATOWANE.
// Część testów jednostkowych sprawdza konkretne reguły, cytując je w postaci zwartej
// (`.a{b:c;d:e}`), jak w dawnych zminifikowanych plikach. Zamiast przepisywać każdy taki cytat
// na wersję z wcięciami — i wiązać go z układem białych znaków — test czyta arkusz przez
// zwartyCss(): poza łańcuchami i komentarzami ciąg białych znaków staje się jedną spacją,
// a spacje przy `{ } ; : ,` znikają. To ta sama postać, którą miał plik zminifikowany, więc
// cytaty w testach nie zależą od formatowania. Białe znaki wewnątrz nawiasów zostają
// (`calc(a + b)`, `grid-column:1 / -1`).

export function zwartyCss(tekst) {
  let wynik = '';
  let i = 0;
  const n = tekst.length;
  while (i < n) {
    const c = tekst[i];
    if (c === '/' && tekst[i + 1] === '*') {
      const koniec = tekst.indexOf('*/', i + 2);
      const dalej = koniec < 0 ? n : koniec + 2;
      wynik += tekst.slice(i, dalej);
      i = dalej;
      continue;
    }
    if (c === '"' || c === "'") {
      let k = i + 1;
      while (k < n && tekst[k] !== c) { if (tekst[k] === '\\') k++; k++; }
      wynik += tekst.slice(i, Math.min(k + 1, n));
      i = k + 1;
      continue;
    }
    if (/\s/.test(c)) {
      let k = i;
      while (k < n && /\s/.test(tekst[k])) k++;
      const przed = wynik[wynik.length - 1];
      const po = tekst[k];
      if (wynik && po !== undefined && !'{};:,'.includes(przed) && !'{};:,'.includes(po)) wynik += ' ';
      i = k;
      continue;
    }
    wynik += c;
    i++;
  }
  return wynik.trim();
}
