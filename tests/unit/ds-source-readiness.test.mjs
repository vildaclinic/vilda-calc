import { describe, expect, it } from 'vitest';
import { loadBrowserScript } from '../support/load-browser-script.mjs';

// Native source with controlled vault replies. All identities are fictional.
function setup() {
  const requests = [], locks = [], signals = [];
  const values = new Map();
  let unlocked = true;
  const win = new EventTarget();
  win.document = new EventTarget();
  win.document.readyState = 'loading';
  win.CustomEvent = CustomEvent;
  win.sessionStorage = { getItem: key => values.get(key) || null };
  win.VildaVault = {
    isUnlocked: () => unlocked,
    onLock: callback => locks.push(callback),
    getPatient: id => new Promise((resolve, reject) => { requests.push({ id, resolve, reject }); }),
  };
  win.document.addEventListener('vilda:ds-source-state', event => signals.push(event.detail));
  loadBrowserScript('vilda_ds_source.js', win);
  const source = win.VildaDsSource;
  return {
    win, source, requests, signals, values,
    load(id) {
      values.set('vildaCurrentPatientId', id);
      win.document.dispatchEvent(new CustomEvent('vilda:patient-loaded', { detail: { patientId: id } }));
    },
    refresh() { win.document.dispatchEvent(new Event('vilda:sync-status-changed')); },
    clear() { values.delete('vildaCurrentPatientId'); win.dispatchEvent(new Event('vilda:user-state-cleared')); },
    lock() { unlocked = false; locks.forEach(callback => callback()); },
    unlock() { unlocked = true; },
  };
}
const record = (id, ds) => ({ patientId: id, snapshots: [{ payload: { clinical: { downSyndrome: ds } } }] });
const settle = async () => { for (let turn = 0; turn < 6; turn += 1) await Promise.resolve(); };
async function ready(e, id, ds) {
  e.load(id);
  e.requests.at(-1).resolve(record(id, ds));
  await settle();
}

describe('DS source — owned asynchronous readiness', () => {
  it.each([true, false])('publishes pending then ready for the first fictional patient (DS=%s)', async ds => {
    const e = setup();
    e.load('fictional-a');
    expect(e.source.getState()).toMatchObject({ patientId: 'fictional-a', status: 'pending' });
    e.requests[0].resolve(record('fictional-a', ds));
    await settle();
    expect(e.source.getState()).toEqual({ patientId: 'fictional-a', status: 'ready', population: ds ? 'DS' : 'OGOLNA' });
    expect(e.signals.map(state => state.status)).toEqual(['pending', 'ready']);
  });

  it.each([[true, false], [false, true], [true, true], [false, false]])('new owner closes readiness and completes even for %s → %s', async (first, second) => {
    const e = setup();
    await ready(e, 'fictional-a', first);
    e.signals.length = 0;
    e.load('fictional-b');
    expect(e.source.getState()).toMatchObject({ patientId: 'fictional-b', status: 'pending' });
    e.requests.at(-1).resolve(record('fictional-b', second));
    await settle();
    expect(e.source.getState()).toEqual({ patientId: 'fictional-b', status: 'ready', population: second ? 'DS' : 'OGOLNA' });
    expect(e.signals.map(state => [state.patientId, state.status])).toEqual([
      ['fictional-b', 'pending'], ['fictional-b', 'ready'],
    ]);
  });

  it('same-owner background read retains the accepted population and emits no redundant state', async () => {
    const e = setup();
    await ready(e, 'fictional-a', true);
    e.signals.length = 0;
    e.refresh();
    expect(e.source.getState()).toEqual({ patientId: 'fictional-a', status: 'ready', population: 'DS' });
    expect(e.signals).toEqual([]);
    e.requests.at(-1).resolve(record('fictional-a', true));
    await settle();
    expect(e.signals).toEqual([]);
  });

  it('accepted same-owner change is published atomically without a pending flash', async () => {
    const e = setup();
    await ready(e, 'fictional-a', true);
    e.signals.length = 0;
    e.refresh();
    e.requests.at(-1).resolve(record('fictional-a', false));
    await settle();
    expect(e.signals).toEqual([{ patientId: 'fictional-a', status: 'ready', population: 'OGOLNA' }]);
  });

  it('a failed background refresh preserves the known population for the same owner', async () => {
    const e = setup();
    await ready(e, 'fictional-a', true);
    e.refresh();
    e.requests.at(-1).reject(new Error('fictional read failure'));
    await settle();
    expect(e.source.getState()).toEqual({ patientId: 'fictional-a', status: 'ready', population: 'DS' });
  });

  it('a failed new-owner read is an error; retry reads that owner and becomes ready', async () => {
    const e = setup();
    await ready(e, 'fictional-a', true);
    e.load('fictional-b');
    e.requests.at(-1).reject(new Error('fictional read failure'));
    await settle();
    expect(e.source.getState()).toMatchObject({ patientId: 'fictional-b', status: 'error' });
    e.source.retry();
    expect(e.requests.at(-1).id).toBe('fictional-b');
    expect(e.source.getState()).toMatchObject({ patientId: 'fictional-b', status: 'pending' });
    e.requests.at(-1).resolve(record('fictional-b', false));
    await settle();
    expect(e.source.getState()).toEqual({ patientId: 'fictional-b', status: 'ready', population: 'OGOLNA' });
  });

  it('late A cannot replace B after out-of-order native reads', async () => {
    const e = setup();
    e.load('fictional-a'); e.load('fictional-b');
    e.requests[1].resolve(record('fictional-b', false)); await settle();
    e.requests[0].resolve(record('fictional-a', true)); await settle();
    expect(e.source.getState()).toEqual({ patientId: 'fictional-b', status: 'ready', population: 'OGOLNA' });
    expect(e.win.VildaPopulacjaPacjenta()).toBe('OGOLNA');
  });

  it.each(['clear', 'lock'])('%s invalidates an in-flight read so it cannot restore the outgoing diagnosis', async action => {
    const e = setup();
    e.load('fictional-a');
    e[action]();
    if (action === 'lock') e.unlock();
    e.requests[0].resolve(record('fictional-a', true)); await settle();
    expect(e.source.getState()).toEqual({ patientId: null, status: 'idle', population: 'OGOLNA' });
    expect(e.win.VildaPopulacjaPacjenta()).toBe('OGOLNA');
  });

  it('rejects a vault response labelled with a different patient', async () => {
    const e = setup();
    e.load('fictional-a');
    e.requests[0].resolve(record('fictional-b', true)); await settle();
    expect(e.source.getState()).toMatchObject({ patientId: 'fictional-a', status: 'error' });
    expect(e.win.VildaPopulacjaPacjenta()).toBe('OGOLNA');
  });
});
