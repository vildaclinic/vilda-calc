import { readFileSync } from 'node:fs';
import { parse } from 'acorn';
import { describe, expect, it } from 'vitest';

// Invoke the actual production submit closure, including its asynchronous read
// and immediately-before-writer checks. This harness does not copy its DTO,
// authorization implementation or any medical interpretation.
const source = readFileSync(new URL('../../vilda_lab_history_tab.js', import.meta.url), 'utf8');
const tree = parse(source, { ecmaVersion: 'latest', sourceType: 'script' });
let submitSource;
function walk(node) {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'FunctionDeclaration' && node.id?.name === 'submit') {
    const body = source.slice(node.start, node.end);
    if (body.includes('vault.saveReminderOutcome(request)')) {
      if (submitSource) throw Error('Ambiguous native pending-result submit');
      submitSource = body;
    }
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object') walk(value);
  }
}
walk(tree);
if (!submitSource) throw Error('Missing actual native pending-result submit');
function harness({ callerGuard = true } = {}) {
  let release;
  const state = { current: true, writes: [], reads: 0, fail: [], closed: 0, changes: 0, atName: null };
  const pending = new Promise(resolve => { release = resolve; });
  const run = new Function('state', 'pending', `
    var busy = false,
      options = ${callerGuard ? '{isCurrent:function(){return state.current},onChanged:function(){state.changes++}}' : '{onChanged:function(){state.changes++}}'},
      area = {value:'Fikcyjny opis',focus:function(){}}, date = {value:'2026-11-17'},
      describeDialog = {}, item = {noteId:'fictional-order',title:'Fikcyjne zlecenie'}, signature = null, op = 'fictional-operation',
      instance = {alive:function(){return state.current}}, text = function(v){return String(v||'').trim()},
      fail = function(v){state.fail.push(v)}, setBusy = function(v){busy=v},
      vault = {getPatientNote:function(){state.reads++;return pending},saveReminderOutcome:function(dto){state.writes.push(dto);return Promise.resolve({saved:true})}},
      stillPending = function(){return true}, userError = function(message){var e=new Error(message);e.forUser=true;return e},
      pendingTestName = function(){if(state.atName)state.atName();return 'Fikcyjne badanie'}, operationId = function(){return 'second-operation'},
      closeDescribe = function(){state.closed++;describeDialog=null}, schedule = function(){};
    ${submitSource}
    return {submit:submit,replace:function(){describeDialog={}},destroy:function(){describeDialog=null}};
  `)(state, pending);
  return { state, run, release: () => release({ id: 'fictional-order', patientId: 'fictional-patient', rev: 7, updatedAtISO: '2026-11-17T12:00:00Z' }) };
}
const settled = () => new Promise(resolve => { setImmediate(resolve); });

describe('home patient: optional native pending-result lifetime guard', () => {
  it('refuses submission before reading after the caller owner expires', () => {
    const h = harness(); h.state.current = false; h.run.submit();
    expect(h.state.reads).toBe(0); expect(h.state.writes).toHaveLength(0);
  });
  it('does not write when patient/account/load changes during the actual async read', async () => {
    const h = harness(); h.run.submit(); h.state.current = false; h.release(); await settled();
    expect(h.state.writes).toHaveLength(0); expect(h.state.closed).toBe(0);
  });
  it('does not write after the exact opened modal has been destroyed', async () => {
    const h = harness(); h.run.submit(); h.run.destroy(); h.release(); await settled();
    expect(h.state.writes).toHaveLength(0);
  });
  it('does not borrow authorization from a replacement modal', async () => {
    const h = harness(); h.run.submit(); h.run.replace(); h.release(); await settled();
    expect(h.state.writes).toHaveLength(0);
  });
  it('rechecks ownership immediately before calling the native writer', async () => {
    const h = harness(); h.state.atName = () => { h.state.current = false; };
    h.run.submit(); h.release(); await settled(); expect(h.state.writes).toHaveLength(0);
  });
  it('keeps one explicit native write, identity, optimistic revision and operation ID', async () => {
    const h = harness(); h.run.submit(); h.release(); await settled();
    expect(h.state.writes).toHaveLength(1); expect(h.state.closed).toBe(1); expect(h.state.changes).toBe(1);
    expect(h.state.writes[0]).toMatchObject({ id: 'fictional-order', patientId: 'fictional-patient', baseRev: 7,
      baseUpdatedAtISO: '2026-11-17T12:00:00Z', action: 'result', dateISO: '2026-11-17',
      text: 'Fikcyjny opis', test: 'Fikcyjne badanie', operationId: 'fictional-operation' });
    expect(Object.keys(h.state.writes[0])).toEqual(['id', 'patientId', 'baseRev', 'baseUpdatedAtISO', 'action', 'dateISO', 'text', 'baseNote', 'test', 'operationId']);
  });
  it('preserves the original native path for callers without the optional UI guard', async () => {
    const h = harness({ callerGuard: false }); h.state.current = false;
    h.run.submit(); h.release(); await settled(); expect(h.state.writes).toHaveLength(1);
  });
});
