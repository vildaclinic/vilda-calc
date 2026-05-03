(function(global){
  'use strict';

  function ensureIframeMap(doc){
    const d = doc || global.document;
    if (!d) return {};
    const map = {};
    d.querySelectorAll('[data-spa-view] iframe').forEach(function(frame){
      const host = frame.closest('[data-spa-view]');
      if (!host) return;
      const view = host.getAttribute('data-spa-view');
      if (view) map[view] = frame;
    });
    return map;
  }

  function initShellBridge(){
    const doc = global.document;
    if (!doc) return { ok: false, reason: 'missing-document' };
    const frames = ensureIframeMap(doc);
    function handleMessage(ev){
      const data = ev && ev.data;
      if (!data || data.type !== 'vilda:spa:height') return;
      const view = data.view;
      const height = Number(data.height);
      const frame = frames[view];
      if (!frame || !Number.isFinite(height) || height < 200) return;
      frame.style.height = Math.ceil(height) + 'px';
    }
    global.addEventListener('message', handleMessage);
    return { ok: true, dispose: function(){ try { global.removeEventListener('message', handleMessage); } catch (_) {} } };
  }

  global.VildaSpaShellBridge = { initShellBridge: initShellBridge };

  try {
    if (global.document && !global.__vildaSpaShellBridgeInit) {
      global.__vildaSpaShellBridgeInit = initShellBridge();
    }
  } catch (_) {}
})(typeof window !== 'undefined' ? window : globalThis);
