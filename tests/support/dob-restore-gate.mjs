// Steruje wyłącznie momentem przyjęcia DOB. Oryginalne funkcje produkcyjne,
// zdarzenia, zegar, obliczenia i pozostałe timery wykonują się bez zmian.
export function prepareDobRestoreGate() {
  const key = 'e2e-delay-dob-restore';
  let paused = window.sessionStorage.getItem(key) === '1';
  const pending = [];
  const originalTimeout = window.setTimeout;
  window.setTimeout = function (callback, delay, ...args) {
    if (paused && typeof callback === 'function' && callback.name === 'przyjmijIOglos') {
      pending.push(() => callback.apply(window, args));
      return originalTimeout.call(window, () => {}, delay);
    }
    return originalTimeout.call(window, callback, delay, ...args);
  };

  window.__vildaDobRestoreGate = {
    pause() {
      paused = true;
      window.sessionStorage.setItem(key, '1');
    },
    release() {
      paused = false;
      window.sessionStorage.removeItem(key);
      const count = pending.length;
      while (pending.length) pending.shift()();
      return count;
    },
    pending: () => pending.length,
  };
}
