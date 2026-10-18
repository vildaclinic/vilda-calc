/* Niezmienny rejestr transportowy TT. Bez norm i zależności klinicznych.
 * Zachowuje współczynniki istniejącego przelicznika; kanoniczna jednostka: nmol/L.
 */
(function (root, factory) {
  'use strict';
  var units = factory();
  if (typeof module === 'object' && module.exports) module.exports = units;
  if (root) root.VildaLabTestosteroneUnits = units;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  return Object.freeze({
    id: 'tt-existing-mass-conversions',
    version: '1.0.0',
    canonicalUnit: 'nmol/L',
    factorToCanonical: Object.freeze({
      'nmol/L': 1,
      'ng/dL': 0.03467,
      'ng/mL': 3.467,
      'pg/mL': 0.003467
    })
  });
});
