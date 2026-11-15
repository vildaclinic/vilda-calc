// The only network module. Fixed routes, bounded whole-reply deadlines and
// credential omission from errors prevent transport failures leaking material.
import { fail, mapped, workspaceError, encoder, text, fields, dense, integer, hash, MAX_OBJECT_BYTES } from './common.mjs';
import { canonical, inspectGrantStatement, inspectGrantReceipt, inspectState, inspectIntent, inspectReceipt } from './wire.mjs';
import { createDevice, signGrant, signDevice, assertFresh } from './authority.mjs';
import { inspectObjectText } from './crypto.mjs';
export const INTENT_DOMAIN = 'vilda/clinical-workspace/intent/v1\0';
const TIMEOUT = 20000;
async function channel(context, line, action, method, body, signal, guard) {
  const url = context.binding.serviceOrigin + '/clinical-journal/v1/slots/' + context.binding.slotId + '/' + action;
  const controller = new AbortController(); let timer, reader, response, stop;
  const deadline = new Promise((_, reject) => {
    stop = () => { controller.abort(); reject(mapped(null, 'NETWORK')); };
    timer = setTimeout(stop, TIMEOUT);
  });
  signal?.addEventListener('abort', stop, { once: true });
  try {
    guard(); if (signal?.aborted) fail('CLOSED');
    response = await Promise.race([globalThis.fetch(url, { method, headers: {
      ...(method === 'POST' ? { 'Content-Type': 'application/json' } : {}), Authorization: 'Bearer ' + line.authToken,
      'X-Vilda-Clinical-Key-Binding': line.keyBinding }, ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    credentials: 'omit', cache: 'no-store', redirect: 'error', referrerPolicy: 'no-referrer', mode: 'cors', signal: controller.signal }), deadline]);
    guard();
    if (response.url !== url || response.redirected || !['basic', 'cors'].includes(response.type)
      || !/^application\/json(?:;\s*charset=utf-?8)?$/i.test(response.headers.get('content-type') ?? '')) fail('NETWORK');
    const declared = response.headers.get('content-length');
    if (declared !== null && (!/^[0-9]{1,7}$/.test(declared) || Number(declared) > MAX_OBJECT_BYTES)) fail('NETWORK');
    if (!response.body) fail('NETWORK');
    reader = response.body.getReader(); const chunks = []; let size = 0, reads = 0;
    for (;;) {
      if (++reads > MAX_OBJECT_BYTES + 1) fail('NETWORK');
      const { done, value } = await Promise.race([reader.read(), deadline]); guard();
      if (done) break;
      if (!(value instanceof Uint8Array) || value.length > MAX_OBJECT_BYTES - size) fail('NETWORK');
      size += value.length; chunks.push(value);
    }
    const bytes = new Uint8Array(size); let offset = 0;
    for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
    const string = text(bytes, MAX_OBJECT_BYTES);
    if (![200, 201].includes(response.status)) {
      // The actual error body is deliberately not surfaced to application UI.
      if (response.status >= 500) fail('NETWORK');
      if (response.status === 404) fail('MISSING');
      if (response.status === 409) fail('CONFLICT');
      if (response.status === 401 || response.status === 403) fail('NOT_READY');
      if (response.status === 429) {
        let kind = null;
        try {
          const value = fields(JSON.parse(string), ['ok', 'namespace', 'protocol', 'error']);
          value.error = fields(value.error, ['code']);
          if (value.ok === false && value.namespace === 'vilda-clinical-workspace' && value.protocol === 1
            && JSON.stringify(value) === string) kind = value.error.code;
        } catch { /* Malformed replies do not authorize a scheduler hint. */ }
        const retry = response.headers.get('retry-after');
        if (kind === 'JOURNAL_RATE_LIMITED' && /^(?:[1-9]|[1-5][0-9]|60)$/.test(retry ?? ''))
          throw workspaceError('RATE_LIMITED', Number(retry) * 1000);
        if (kind === 'JOURNAL_LIMIT') fail('LIMIT');
        fail('NETWORK');
      }
      if (response.status === 413 || response.status === 507) fail('LIMIT');
      fail('SERVICE_REJECTED');
    }
    return string;
  } catch (error) {
    try { const pending = reader ? reader.cancel() : response?.body?.cancel(); pending?.catch?.(() => {}); } catch { /* Bounded deadline. */ }
    throw mapped(error, 'NETWORK');
  } finally { clearTimeout(timer); signal?.removeEventListener('abort', stop); try { reader?.releaseLock(); } catch { /* Pending native read. */ } }
}
export async function authorizeDevice(context, line, signal, guard) {
  const device = await createDevice(context); guard();
  const challengeText = await channel(context, line, 'grant/challenge', 'POST', device.intent, signal, guard);
  const challenge = canonical(challengeText, input => {
    const value = fields(input, ['ok', 'namespace', 'protocol', 'intentDigest', 'statement']);
    if (value.ok !== true || value.namespace !== 'vilda-clinical-workspace-grant' || value.protocol !== 1
      || value.intentDigest !== device.intentDigest) fail('CORRUPT');
    value.statement = inspectGrantStatement(value.statement, device.intent, device.intentDigest); return value;
  });
  const proof = await signGrant(context, device, challenge.statement, guard); guard();
  let receiptText;
  try { receiptText = await channel(context, line, 'grant/authorize', 'POST', { intent: device.intent, proof }, signal, guard); }
  catch (error) {
    if (error?.code !== 'WORKSPACE_CLIENT_NETWORK') throw error;
    // An accepted owner proof with a lost reply is resumed with its exact
    // device key/session and intent. It is not silently replaced by a second
    // grant or inferred from a read-only recovery result.
    const resumeProof = await signDevice(device, context.binding.slotId, 'grant/resume', device.intent, guard, true);
    receiptText = await channel(context, line, 'grant/resume', 'POST', { intent: device.intent, proof: resumeProof }, signal, guard);
  }
  device.receipt = canonical(receiptText, value => inspectGrantReceipt(value, device.intent, device.intentDigest));
  assertFresh(device.receipt, 3600); return device;
}
export async function readState(context, line, signal, guard) {
  return canonical(await channel(context, line, 'state', 'GET', undefined, signal, guard), value => inspectState(value, context.binding));
}
export async function readReceipt(context, line, intent, digest, signal, guard) {
  const string = await channel(context, line, 'resume', 'POST', { operationId: intent.operationId, intentDigest: digest }, signal, guard);
  return canonical(string, value => inspectReceipt(value, intent, digest));
}
export async function readObject(context, line, digest, signal, guard) {
  const string = await channel(context, line, 'objects/' + digest, 'GET', undefined, signal, guard);
  inspectObjectText(string);
  if (await hash(string) !== digest) fail('CORRUPT'); guard();
  return string;
}
export async function readCurrentReceipt(context, line, state, signal, guard) {
  if (state.headSeq === 0) return null;
  const string = await channel(context, line, 'history', 'POST', { after: state.headSeq - 1, limit: 1 }, signal, guard);
  const value = canonical(string, input => {
    const result = fields(input, ['ok', 'namespace', 'protocol', 'headSeq', 'entries', 'nextAfter']);
    if (result.ok !== true || result.namespace !== 'vilda-clinical-workspace' || result.protocol !== 1
      || !integer(result.headSeq, state.headSeq) || result.nextAfter !== null && !integer(result.nextAfter, state.headSeq)) fail('CORRUPT');
    result.entries = dense(result.entries, 1); if (result.entries.length !== 1) fail('CORRUPT');
    return result;
  });
  const raw = value.entries[0], intent = inspectIntent(raw.intent);
  const digest = await hash(INTENT_DOMAIN + JSON.stringify(intent)); guard();
  const receipt = inspectReceipt(raw, intent, digest);
  if (receipt.status !== 'COMMITTED' || receipt.headSeq !== state.headSeq || receipt.manifestDigest !== state.manifestDigest) fail('CONFLICT');
  return receipt;
}
export async function mutate(context, line, device, action, payload, signal, guard) {
  if (!['reserve', 'objects', 'finalize'].includes(action)) fail();
  const proof = await signDevice(device, context.binding.slotId, action, payload, guard); guard();
  const string = await channel(context, line, action, 'POST', { payload, proof }, signal, guard);
  if (action === 'objects') return canonical(string, input => {
    const value = fields(input, ['ok', 'namespace', 'protocol', 'operationId', 'intentDigest', 'ciphertextDigest', 'stored']);
    if (value.ok !== true || value.namespace !== 'vilda-clinical-workspace' || value.protocol !== 1 || value.stored !== true
      || value.operationId !== payload.operationId || value.intentDigest !== payload.intentDigest) fail('CORRUPT');
    return value;
  });
  return string;
}
export const parseReceipt = (string, intent, digest) => canonical(string, value => inspectReceipt(value, intent, digest));
