import fs from 'node:fs';
import { webcrypto } from 'node:crypto';

const source = fs.readFileSync(new URL('../../vilda_ui_intents.js', import.meta.url), 'utf8');

// These existing native-consumer specs isolate their UI/load boundaries. The
// real transport owns the contract; an opaque in-memory cipher fake isolates
// asynchronous AES, which is covered against native Vault in ui-intents.test.
export function installUiIntentFixture(window, vault) {
  const encrypted = new Map();
  window.crypto = webcrypto;
  window.VildaPersistence.getTabId ||= () => window.sessionStorage.getItem('vildaTabIdV1') || 'fictional-tab-a';
  vault.encryptPayloadForCurrentUser = async value => {
    const cipher = { iv: webcrypto.randomUUID(), data: webcrypto.randomUUID() };
    encrypted.set(cipher.iv + ':' + cipher.data, JSON.parse(JSON.stringify(value)));
    return cipher;
  };
  vault.decryptPayloadForCurrentUser = async (iv, data) => {
    const value = encrypted.get(iv + ':' + data);
    if (!value) throw new Error('fictional invalid ciphertext');
    return JSON.parse(JSON.stringify(value));
  };
  new Function('window', 'globalThis', source)(window, window);
  return async (kind, value) => (await window.VildaUiIntents.prepare(kind, value)).raw;
}
