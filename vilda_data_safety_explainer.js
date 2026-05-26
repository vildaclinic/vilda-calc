/*
 * Vilda — „Jak chronimy dane?" — animowany explainer (nakładka).
 *
 * Samodzielny moduł: VildaDataSafety.open() / .close().
 * Buduje pełnoekranową nakładkę z 7-scenową, zapętloną animacją (login →
 * badanie → zapis → szyfrowanie → synchronizacja PRO → chmura → inne urządzenie).
 * Sterowanie: ← / → zmiana sceny, spacja = pauza/wznowienie, Esc = zamknij,
 * klik w tło lub × = zamknij. Wspiera prefers-reduced-motion. Styl marki (turkus),
 * CSS w pełni zescope'owany pod .vds-overlay (nie wpływa na resztę aplikacji).
 */
(function (global) {
  'use strict';
  if (global.VildaDataSafety && global.VildaDataSafety.__vds) return;

  var doc = global.document;
  var DUR = 4200;
  var STYLE_ID = 'vds-style-v1';
  var overlay = null, scenes = [], steps = [], bar = null, playBtn = null;
  var i = 0, timer = null, playing = true, keyHandler = null;
  var reduce = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var STYLE = [
    '.vds-overlay{position:fixed;inset:0;z-index:2000001;display:flex;align-items:center;justify-content:center;padding:16px;',
      "font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;}",
    '.vds-backdrop{position:absolute;inset:0;background:rgba(15,43,51,.55);}',
    '.vds-panel{position:relative;background:#f4fafb;border-radius:20px;max-width:780px;width:100%;max-height:94vh;overflow:auto;padding:20px 20px 16px;box-shadow:0 20px 60px rgba(15,43,51,.32);}',
    '.vds-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:1px solid #d7e9ec;background:#fff;color:#0f2b33;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
    '.vds-close:hover{background:#eef7f8;}',
    '.vds-show{color:#0f2b33;}',
    '.vds-head{text-align:center;margin:0 0 12px;}',
    '.vds-head h2{margin:0;font-size:22px;font-weight:800;letter-spacing:.2px;color:#0f2b33;}',
    '.vds-acc{width:60px;height:3.5px;border-radius:2px;background:#00838d;margin:8px auto 0;}',
    '.vds-head p{margin:8px 0 0;color:#5a6b72;font-size:13.5px;}',
    '.vds-stage{position:relative;background:#fff;border:1px solid #e9eef1;border-radius:18px;box-shadow:0 10px 34px rgba(15,43,51,.09);overflow:hidden;aspect-ratio:16/10;}',
    '.vds-scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;opacity:0;transform:translateY(16px) scale(.985);transition:opacity .55s ease,transform .55s ease;padding:18px;text-align:center;}',
    '.vds-scene.active{opacity:1;transform:none;}',
    '.vds-num{font-size:12px;font-weight:700;letter-spacing:1.5px;color:#00838d;text-transform:uppercase;}',
    '.vds-scene h3{margin:0;font-size:19px;font-weight:800;color:#0f2b33;}',
    '.vds-scene p{margin:0;color:#5a6b72;font-size:13.5px;line-height:1.45;max-width:520px;}',
    '.vds-art{height:170px;display:flex;align-items:center;justify-content:center;}',
    '.vds-art svg{height:170px;width:auto;overflow:visible;}',
    '.vds-scene.active .pop{animation:vdsPop .5s both;}',
    '.vds-scene.active .d1{animation:vdsPop .4s .15s both;}.vds-scene.active .d2{animation:vdsPop .4s .35s both;}.vds-scene.active .d3{animation:vdsPop .4s .55s both;}',
    '.vds-scene.active .shackle{animation:vdsUnlock .7s .8s both;}',
    '.vds-scene.active .okmark{animation:vdsPop .5s 1.1s both;}',
    '.vds-scene.active .barfill{animation:vdsFill 1s .35s both;}',
    '.vds-scene.active .saved{animation:vdsPop .5s .8s both;}',
    '.vds-scene.active .plain{animation:vdsFadeOut .5s .5s both;}',
    '.vds-scene.active .cipher{animation:vdsFadeIn .6s 1s both;}',
    '.vds-scene.active .closelock{animation:vdsPop .5s 1.1s both;}',
    '.vds-scene.active .blob{animation:vdsRise 1.15s .35s both;}',
    '.vds-scene.active .safe{animation:vdsPop .55s 1.25s both;}',
    '.vds-scene.active .cloudpop{animation:vdsPop .7s both;}',
    '@keyframes vdsPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}',
    '@keyframes vdsUnlock{from{transform:translateY(0) rotate(0)}to{transform:translateY(-3px) rotate(-26deg)}}',
    '@keyframes vdsFill{from{width:0}to{}}',
    '@keyframes vdsFadeOut{from{opacity:1}to{opacity:0}}',
    '@keyframes vdsFadeIn{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}',
    '@keyframes vdsRise{0%{transform:translateY(46px);opacity:0}40%{opacity:1}100%{transform:translateY(0);opacity:1}}',
    '.vds-progress{height:4px;background:#e9eef1;border-radius:2px;overflow:hidden;margin-top:14px;}',
    '.vds-progress>i{display:block;height:100%;width:0;background:#00838d;border-radius:2px;}',
    '.vds-stepper{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px;}',
    '.vds-step{display:flex;align-items:center;gap:7px;border:1px solid #e2e8eb;background:#fff;color:#7d8a90;border-radius:999px;padding:6px 12px 6px 7px;font-size:12.5px;font-weight:600;cursor:pointer;transition:.25s;}',
    '.vds-step b{display:inline-flex;width:20px;height:20px;border-radius:50%;background:#eef2f4;color:#7d8a90;align-items:center;justify-content:center;font-size:11px;}',
    '.vds-step.active{border-color:#00838d;color:#00838d;background:#f0f8f9;}',
    '.vds-step.active b{background:#00838d;color:#fff;}',
    '.vds-controls{display:flex;gap:10px;justify-content:center;align-items:center;margin-top:12px;flex-wrap:wrap;}',
    '.vds-controls button{font:inherit;font-size:13px;font-weight:600;border:1px solid #cfe0e3;background:#fff;color:#00838d;border-radius:10px;padding:8px 16px;cursor:pointer;}',
    '.vds-controls button:hover{background:#f0f8f9;}',
    '.vds-hint{margin-top:10px;text-align:center;font-size:11.5px;color:#7d8a90;}',
    '@media (prefers-reduced-motion: reduce){.vds-scene{transition:none;}.vds-scene *{animation:none !important;}}',
    '@media (max-width:560px){.vds-panel{padding:16px 12px 12px;}.vds-head h2{font-size:19px;}.vds-stage{aspect-ratio:auto;min-height:450px;}.vds-art{height:140px;}.vds-art svg{height:140px;}.vds-scene{padding:16px 14px;}.vds-num{font-size:13px;}.vds-scene h3{font-size:19px;}.vds-scene p{font-size:14.5px;max-width:100%;}.vds-step{font-size:13px;padding:6px 11px 6px 7px;}.vds-hint{display:none;}}',
    '@media (max-width:400px){.vds-stage{min-height:490px;}.vds-art{height:128px;}.vds-art svg{height:128px;}}'
  ].join('');

  var SCENES =
    '<div class="vds-scene"><div class="vds-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<rect class="pop" x="105" y="14" width="90" height="152" rx="16" fill="#fff" stroke="#00838d" stroke-width="2"/>' +
      '<rect x="115" y="28" width="70" height="124" rx="9" fill="#eef7f8"/>' +
      '<g transform="translate(150,58)"><rect x="-15" y="-2" width="30" height="22" rx="5" fill="#00838d"/>' +
      '<path class="shackle" d="M-9,-2 v-7 a9,9 0 0 1 18,0 v7" fill="none" stroke="#00838d" stroke-width="3.4" style="transform-origin:0px -2px"/>' +
      '<circle cx="0" cy="9" r="3" fill="#fff"/></g>' +
      '<circle class="d1" cx="135" cy="104" r="5" fill="#00838d"/><circle class="d2" cx="150" cy="104" r="5" fill="#00838d"/><circle class="d3" cx="165" cy="104" r="5" fill="#00838d"/>' +
      '<rect x="123" y="124" width="54" height="18" rx="9" fill="#00838d"/><text x="150" y="136.5" text-anchor="middle" font-size="9" fill="#fff" font-weight="700">Zaloguj</text>' +
      '<g class="okmark" transform="translate(212,40)" style="transform-origin:212px 40px"><circle r="16" fill="#1d9e75"/><path d="M-7,0 l5,5 l9,-11" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/></g>' +
      '</svg></div><div class="vds-num">Krok 1</div><h3>Logujesz się hasłem</h3><p>Tylko Ty znasz hasło. Odblokowuje ono Twój klucz szyfrujący — na Twoim urządzeniu.</p></div>' +

    '<div class="vds-scene"><div class="vds-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<rect class="pop" x="70" y="18" width="160" height="144" rx="14" fill="#fff" stroke="#00838d" stroke-width="2"/>' +
      '<rect x="82" y="30" width="136" height="120" rx="9" fill="#eef7f8"/>' +
      '<rect x="92" y="40" width="80" height="14" rx="4" fill="#00838d"/><text x="96" y="50.5" font-size="9" fill="#fff" font-weight="700">Karta pacjenta</text>' +
      '<text x="92" y="76" font-size="11" font-weight="700" fill="#0f2b33">Jan K., 8 lat</text>' +
      '<text x="92" y="96" font-size="9" fill="#7d8a90">wzrost</text><rect x="92" y="100" width="116" height="9" rx="4.5" fill="#dfe7ea"/><rect class="barfill" x="92" y="100" width="92" height="9" rx="4.5" fill="#00838d"/>' +
      '<text x="92" y="124" font-size="9" fill="#7d8a90">masa ciała</text><rect x="92" y="128" width="116" height="9" rx="4.5" fill="#dfe7ea"/><rect class="barfill" x="92" y="128" width="64" height="9" rx="4.5" fill="#00838d"/>' +
      '</svg></div><div class="vds-num">Krok 2</div><h3>Badasz pacjenta</h3><p>Wpisujesz pomiary i dane z wywiadu — wygodnie, na miejscu.</p></div>' +

    '<div class="vds-scene"><div class="vds-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<rect class="pop" x="105" y="16" width="90" height="148" rx="16" fill="#fff" stroke="#00838d" stroke-width="2"/>' +
      '<rect x="115" y="30" width="70" height="120" rx="9" fill="#eef7f8"/>' +
      '<rect x="124" y="40" width="52" height="11" rx="3" fill="#00838d"/><rect x="124" y="58" width="52" height="6" rx="3" fill="#cdd9dd"/><rect x="124" y="70" width="40" height="6" rx="3" fill="#cdd9dd"/><rect x="124" y="82" width="46" height="6" rx="3" fill="#cdd9dd"/>' +
      '<g class="saved" transform="translate(150,118)" style="transform-origin:150px 118px"><rect x="-44" y="-13" width="88" height="26" rx="13" fill="#e7f6ef" stroke="#1d9e75" stroke-width="1.4"/>' +
      '<path d="M-31,0 l5,5 l9,-11" fill="none" stroke="#0f6e56" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<text x="-12" y="4" text-anchor="start" font-size="10.5" font-weight="700" fill="#0f6e56">Zapisano</text></g>' +
      '</svg></div><div class="vds-num">Krok 3</div><h3>Zapisujesz dane</h3><p>Dane lądują najpierw lokalnie, na Twoim urządzeniu.</p></div>' +

    '<div class="vds-scene"><div class="vds-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<rect x="60" y="44" width="180" height="92" rx="14" fill="#fff" stroke="#bcdfe3" stroke-width="1.6"/>' +
      '<g class="plain"><text x="150" y="86" text-anchor="middle" font-size="13" font-weight="700" fill="#0f2b33">Jan K., 8 lat</text><text x="150" y="108" text-anchor="middle" font-size="12" fill="#5a6b72">wzrost 128 cm · 26 kg</text></g>' +
      '<g class="cipher"><text x="150" y="86" text-anchor="middle" font-size="13" font-family="monospace" fill="#9aa6ad">a8F#9zK2x$Lq7</text><text x="150" y="108" text-anchor="middle" font-size="13" font-family="monospace" fill="#9aa6ad">mB7q0eLx#1ZpW</text></g>' +
      '<g class="closelock" transform="translate(150,44)" style="transform-origin:150px 44px"><rect x="-15" y="-2" width="30" height="22" rx="5" fill="#00838d"/><path d="M-9,-2 v-6 a9,9 0 0 1 18,0 v6" fill="none" stroke="#00838d" stroke-width="3.4"/><circle cx="0" cy="9" r="3" fill="#fff"/></g>' +
      '</svg></div><div class="vds-num">Krok 4</div><h3>System szyfruje dane Twoim kluczem</h3><p>Czytelne dane stają się nieczytelnym szyfrogramem.</p></div>' +

    '<div class="vds-scene"><div class="vds-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="pop"><rect x="120" y="12" width="60" height="22" rx="11" fill="#e1f5ee" stroke="#0f6e56" stroke-width="1.3"/>' +
      '<path d="M135,18 l1.8,3.4 3.4,1.8 -3.4,1.8 -1.8,3.4 -1.8,-3.4 -3.4,-1.8 3.4,-1.8 z" fill="#0f6e56"/>' +
      '<text x="156" y="27" text-anchor="middle" font-size="11" font-weight="800" fill="#0f6e56">PRO</text></g>' +
      '<g class="pop"><rect x="40" y="72" width="56" height="80" rx="12" fill="#fff" stroke="#00838d" stroke-width="2"/><rect x="48" y="82" width="40" height="60" rx="6" fill="#eef7f8"/>' +
      '<rect x="55" y="90" width="26" height="8" rx="2" fill="#00838d"/><rect x="55" y="104" width="26" height="5" rx="2.5" fill="#cdd9dd"/><rect x="55" y="114" width="20" height="5" rx="2.5" fill="#cdd9dd"/></g>' +
      '<g class="cloudpop" style="transform-origin:240px 104px"><g fill="#c8e6ea"><circle cx="214" cy="112" r="20"/><circle cx="242" cy="94" r="26"/><circle cx="268" cy="112" r="20"/><rect x="204" y="106" width="72" height="26" rx="13"/></g></g>' +
      '<g transform="translate(241,103)"><rect x="-10" y="-1" width="20" height="15" rx="4" fill="#00838d"/><path d="M-6,-1 v-4 a6,6 0 0 1 12,0 v4" fill="none" stroke="#00838d" stroke-width="2.3"/></g>' +
      '<line x1="104" y1="100" x2="190" y2="100" stroke="#00838d" stroke-width="2.4"/><polygon points="190,95 200,100 190,105" fill="#00838d"/>' +
      '<line x1="190" y1="126" x2="104" y2="126" stroke="#00838d" stroke-width="2.4"/><polygon points="104,121 94,126 104,131" fill="#00838d"/>' +
      '</svg></div><div class="vds-num">Krok 5</div><h3>Synchronizacja (opcja PRO)</h3><p>Opcjonalnie włączasz synchronizację. Bez niej dane zostają tylko na Twoim urządzeniu.</p></div>' +

    '<div class="vds-scene"><div class="vds-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="cloudpop" style="transform-origin:150px 56px"><g fill="#c8e6ea"><circle cx="110" cy="64" r="26"/><circle cx="150" cy="40" r="34"/><circle cx="192" cy="64" r="26"/><rect x="98" y="58" width="104" height="34" rx="17"/></g></g>' +
      '<g class="safe" transform="translate(150,52)" style="transform-origin:150px 52px"><rect x="-13" y="-1" width="26" height="19" rx="5" fill="#00838d"/><path d="M-8,-1 v-5 a8,8 0 0 1 16,0 v5" fill="none" stroke="#00838d" stroke-width="3"/><circle cx="0" cy="8" r="2.6" fill="#fff"/></g>' +
      '<g class="blob"><rect x="116" y="104" width="68" height="40" rx="8" fill="#fff" stroke="#bcdfe3" stroke-width="1.5"/>' +
      '<text x="150" y="122" text-anchor="middle" font-size="10" font-family="monospace" fill="#9aa6ad">a8F#9zK2</text><text x="150" y="136" text-anchor="middle" font-size="10" font-family="monospace" fill="#9aa6ad">mB7q$Lx0</text>' +
      '<path d="M150,100 v-6" stroke="#1d9e75" stroke-width="2.4"/><polygon points="145,96 150,90 155,96" fill="#1d9e75"/></g>' +
      '</svg></div><div class="vds-num">Krok 6</div><h3>Zaszyfrowana kopia w chmurze</h3><p>Gdy synchronizacja jest włączona, na serwer trafia tylko szyfrogram — serwer go przechowuje, ale nie potrafi go odszyfrować.</p></div>' +

    '<div class="vds-scene"><div class="vds-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="cloudpop" style="transform-origin:150px 40px"><g fill="#c8e6ea"><circle cx="124" cy="46" r="18"/><circle cx="150" cy="30" r="24"/><circle cx="176" cy="46" r="18"/><rect x="114" y="42" width="72" height="24" rx="12"/></g></g>' +
      '<g transform="translate(150,40)"><rect x="-9" y="-1" width="18" height="14" rx="4" fill="#00838d"/><path d="M-5.5,-1 v-3.5 a5.5,5.5 0 0 1 11,0 v3.5" fill="none" stroke="#00838d" stroke-width="2.2"/></g>' +
      '<line class="blob" x1="150" y1="74" x2="150" y2="92" stroke="#1d9e75" stroke-width="2.6"/><polygon class="blob" points="145,92 150,100 155,92" fill="#1d9e75"/>' +
      '<g class="pop"><rect x="104" y="104" width="92" height="66" rx="12" fill="#fff" stroke="#00838d" stroke-width="2"/><rect x="114" y="113" width="72" height="48" rx="7" fill="#eef7f8"/>' +
      '<text x="150" y="133" text-anchor="middle" font-size="10" font-weight="700" fill="#0f2b33">Jan K., 8 lat</text><rect x="124" y="140" width="52" height="5.5" rx="2.75" fill="#cdd9dd"/><rect x="124" y="150" width="40" height="5.5" rx="2.75" fill="#cdd9dd"/></g>' +
      '<g class="okmark" transform="translate(188,108)" style="transform-origin:188px 108px"><circle r="12" fill="#1d9e75"/><circle cx="-3" cy="0" r="3.2" fill="none" stroke="#fff" stroke-width="2"/><line x1="0" y1="0" x2="6" y2="0" stroke="#fff" stroke-width="2"/><line x1="4.5" y1="0" x2="4.5" y2="3" stroke="#fff" stroke-width="2"/></g>' +
      '</svg></div><div class="vds-num">Krok 7</div><h3>Te same dane na innym urządzeniu</h3><p>Logujesz się na nowym urządzeniu i pobierasz dane, które są odszyfrowywane dopiero u Ciebie.</p></div>';

  var PANEL =
    '<div class="vds-backdrop" data-close></div>' +
    '<div class="vds-panel" role="document">' +
      '<button class="vds-close" type="button" data-close aria-label="Zamknij">×</button>' +
      '<div class="vds-show">' +
        '<div class="vds-head"><h2>Jak chronimy dane?</h2><div class="vds-acc"></div>' +
        '<p>Od zalogowania, przez badanie i szyfrowanie, po dostęp na innych urządzeniach</p></div>' +
        '<div class="vds-stage">' + SCENES + '</div>' +
        '<div class="vds-progress"><i></i></div>' +
        '<div class="vds-stepper">' +
          '<div class="vds-step"><b>1</b>Logowanie</div><div class="vds-step"><b>2</b>Badanie</div>' +
          '<div class="vds-step"><b>3</b>Zapis</div><div class="vds-step"><b>4</b>Szyfrowanie</div>' +
          '<div class="vds-step"><b>5</b>Synchronizacja</div><div class="vds-step"><b>6</b>Chmura</div>' +
          '<div class="vds-step"><b>7</b>Inne urządzenie</div>' +
        '</div>' +
        '<div class="vds-controls"><button type="button" data-play>⏸ Pauza</button>' +
        '<button type="button" data-restart>↺ Od początku</button></div>' +
        '<div class="vds-hint">← → zmiana sceny · spacja: pauza · Esc: zamknij</div>' +
      '</div>' +
    '</div>';

  function ensureStyle() {
    if (!doc || doc.getElementById(STYLE_ID)) return;
    var s = doc.createElement('style');
    s.id = STYLE_ID;
    s.textContent = STYLE;
    (doc.head || doc.documentElement).appendChild(s);
  }

  function render() {
    for (var k = 0; k < scenes.length; k += 1) {
      scenes[k].classList.toggle('active', k === i);
      if (steps[k]) steps[k].classList.toggle('active', k === i);
    }
    if (bar) {
      bar.style.transition = 'none';
      bar.style.width = '0%';
      void bar.offsetWidth;
      if (playing && !reduce) {
        bar.style.transition = 'width ' + DUR + 'ms linear';
        bar.style.width = '100%';
      } else {
        bar.style.width = (scenes.length ? ((i + 1) / scenes.length * 100) : 0) + '%';
      }
    }
  }
  function go(n) { var L = scenes.length || 1; i = ((n % L) + L) % L; render(); }
  function tick() { go(i + 1); }
  function stopTimer() { if (timer) { clearInterval(timer); timer = null; } }
  function play() { stopTimer(); playing = true; if (!reduce) timer = setInterval(tick, DUR); sync(); render(); }
  function pause() { stopTimer(); playing = false; sync(); render(); }
  function sync() { if (playBtn) playBtn.textContent = playing ? '⏸ Pauza' : '▶ Odtwórz'; }

  function open() {
    if (overlay || !doc || !doc.body) return;
    ensureStyle();
    overlay = doc.createElement('div');
    overlay.className = 'vds-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Jak chronimy dane');
    overlay.innerHTML = PANEL;
    doc.body.appendChild(overlay);

    scenes = [].slice.call(overlay.querySelectorAll('.vds-scene'));
    steps = [].slice.call(overlay.querySelectorAll('.vds-step'));
    bar = overlay.querySelector('.vds-progress > i');
    playBtn = overlay.querySelector('[data-play]');
    var restart = overlay.querySelector('[data-restart]');

    steps.forEach(function (s, k) { s.addEventListener('click', function () { go(k); if (playing) play(); }); });
    if (playBtn) playBtn.addEventListener('click', function () { if (playing) { pause(); } else { play(); } });
    if (restart) restart.addEventListener('click', function () { go(0); play(); });
    var stage = overlay.querySelector('.vds-stage');
    if (stage) stage.addEventListener('click', function () { if (playing) { pause(); } else { play(); } });
    [].slice.call(overlay.querySelectorAll('[data-close]')).forEach(function (el) {
      el.addEventListener('click', close);
    });

    keyHandler = function (e) {
      if (e.key === 'Escape') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); go(i + 1); if (playing) play(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); go(i - 1); if (playing) play(); }
      else if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); if (playing) { pause(); } else { play(); } }
    };
    doc.addEventListener('keydown', keyHandler);

    i = 0;
    if (reduce) { playing = false; sync(); render(); } else { play(); }
  }

  function close() {
    stopTimer();
    if (keyHandler) { doc.removeEventListener('keydown', keyHandler); keyHandler = null; }
    if (overlay && overlay.parentNode) overlay.parentNode.removeChild(overlay);
    overlay = null; scenes = []; steps = []; bar = null; playBtn = null;
  }

  global.VildaDataSafety = { open: open, close: close, __vds: true };
})(typeof window !== 'undefined' ? window : this);
