// Repertuar strony kodowej Windows-1250 według dekodera Node (TextDecoder) — wyrocznia NIEZALEŻNA od tabel
// vilda_schowek.js. Testy schowka sprawdzają nią, że tekst wklejony do systemu szpitalnego (HIS), który
// przepuszcza go przez Windows-1250, nie wróci ze znakami „?" (P-SCHOWEK-HIS, P-SCHOWEK-HIS-2).
const dekoder = new TextDecoder('windows-1250');

export const WINDOWS_1250 = (() => {
  const znaki = new Set();
  for (let bajt = 0; bajt < 256; bajt += 1) {
    const znak = dekoder.decode(new Uint8Array([bajt]));
    if (znak !== '\uFFFD') znaki.add(znak);
  }
  return znaki;
})();

/** Znaki tekstu spoza Windows-1250, bez powtórzeń, w kolejności pierwszego wystąpienia. */
export function spozaWindows1250(tekst) {
  return [...new Set([...String(tekst == null ? '' : tekst)].filter((z) => !WINDOWS_1250.has(z)))];
}
