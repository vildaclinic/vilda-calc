// Build-proof compatibility for the separately reviewed signed-URR sanitizer.
// Only this exact delta is reversed; the immutable base hashes are unchanged.
const BASE = "  // AG is a signed difference, not a concentration. Keep its canonical signed\n  // value through save/edit; unrelated laboratory concentrations stay nonnegative.\n  const signedSerumGap = test === \"Luka anionowa surowicy (bez K)\" && unit === \"mmol/L\";\n  const valueNum = typeof t.valueNum === \"number\" && isFinite(t.valueNum) && (t.valueNum >= 0 || signedSerumGap) ? t.valueNum : null;\n";
const REVIEWED = "  // AG and URR describe signed changes, not concentrations. Keep signed\n  // canonical measurements; unrelated laboratory concentrations stay nonnegative.\n  const signedSerumGap = test === \"Luka anionowa surowicy (bez K)\" && unit === \"mmol/L\";\n  const signedUrr = test === \"URR — wskaźnik redukcji mocznika\" && unit === \"%\" && testKey === \"urrwskaznikredukcjimocznika\";\n  const valueNum = typeof t.valueNum === \"number\" && isFinite(t.valueNum) && (t.valueNum >= 0 || signedSerumGap || signedUrr) ? t.valueNum : null;\n";
export function restoreKtvVaultBaseline(source) {
  if (!source.includes('const signedUrr =')) return source;
  if (source.split(REVIEWED).length !== 2) throw new Error('Unrecognized KTV signed-URR integration delta');
  return source.replace(REVIEWED, BASE);
}
