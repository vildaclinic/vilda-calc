/*
 * Vilda — „Jak silne jest szyfrowanie?" — animowany explainer (nakładka).
 *
 * Samodzielny moduł: VildaCryptoStrength.open() / .close().
 * Buduje pełnoekranową nakładkę z 6-scenową, zapętloną animacją (AES-256 →
 * 2^256 kombinacji → atak siłowy z klepsydrą → 600 000× spowolnione hasło →
 * porównanie czasu → tarcza/wniosek).
 * Sterowanie: ← / → zmiana sceny, spacja = pauza/wznowienie, Esc = zamknij,
 * klik w tło lub × = zamknij. Wspiera prefers-reduced-motion. Styl marki (turkus),
 * CSS w pełni zescope'owany pod .vcs-overlay (nie wpływa na resztę aplikacji
 * ani na osobny moduł VildaDataSafety / .vds-overlay).
 */
(function (global) {
  'use strict';
  if (global.VildaCryptoStrength && global.VildaCryptoStrength.__vcs) return;

  var doc = global.document;
  var DUR = 4200;
  var STYLE_ID = 'vcs-style-v1';
  var overlay = null, scenes = [], steps = [], bar = null, playBtn = null;
  var i = 0, timer = null, playing = true, keyHandler = null;
  var reduce = !!(global.matchMedia && global.matchMedia('(prefers-reduced-motion: reduce)').matches);

  var STYLE = [
    '.vcs-overlay{position:fixed;inset:0;z-index:2000001;display:flex;align-items:center;justify-content:center;padding:16px;',
      "font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;}",
    '.vcs-backdrop{position:absolute;inset:0;background:rgba(15,43,51,.55);}',
    '.vcs-panel{position:relative;background:#f4fafb;border-radius:20px;max-width:780px;width:100%;max-height:94vh;overflow:auto;padding:20px 20px 16px;box-shadow:0 20px 60px rgba(15,43,51,.32);}',
    '.vcs-close{position:absolute;top:12px;right:12px;width:34px;height:34px;border-radius:50%;border:1px solid #d7e9ec;background:#fff;color:#0f2b33;font-size:20px;line-height:1;cursor:pointer;display:flex;align-items:center;justify-content:center;}',
    '.vcs-close:hover{background:#eef7f8;}',
    '.vcs-show{color:#0f2b33;}',
    '.vcs-head{text-align:center;margin:0 0 12px;}',
    '.vcs-head h2{margin:0;font-size:22px;font-weight:800;letter-spacing:.2px;color:#0f2b33;}',
    '.vcs-acc{width:60px;height:3.5px;border-radius:2px;background:#00838d;margin:8px auto 0;}',
    '.vcs-head p{margin:8px 0 0;color:#5a6b72;font-size:13.5px;}',
    '.vcs-stage{position:relative;background:#fff;border:1px solid #e9eef1;border-radius:18px;box-shadow:0 10px 34px rgba(15,43,51,.09);overflow:hidden;aspect-ratio:16/10;}',
    '.vcs-scene{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;opacity:0;transform:translateY(16px) scale(.985);transition:opacity .55s ease,transform .55s ease;padding:18px;text-align:center;}',
    '.vcs-scene.active{opacity:1;transform:none;}',
    '.vcs-num{font-size:12px;font-weight:700;letter-spacing:1.5px;color:#00838d;text-transform:uppercase;}',
    '.vcs-scene h3{margin:0;font-size:19px;font-weight:800;color:#0f2b33;}',
    '.vcs-scene p{margin:0;color:#5a6b72;font-size:13.5px;line-height:1.45;max-width:520px;}',
    '.vcs-art{height:170px;display:flex;align-items:center;justify-content:center;}',
    '.vcs-art svg{height:170px;width:auto;overflow:visible;}',
    '.vcs-scene.active .pop{animation:vcsPop .5s both;}',
    '.vcs-scene.active .pop2{animation:vcsPop .5s .25s both;}',
    '.vcs-scene.active .barfill{animation:vcsFill 1.1s .35s both;}',
    '.vcs-scene.active .reelStrip{animation:vcsReelSpin 1.4s steps(10) infinite;transform-box:fill-box;}',
    '.vcs-scene.active .reelStrip.s2{animation-delay:.12s;}',
    '.vcs-scene.active .reelStrip.s3{animation-delay:.24s;}',
    '.vcs-scene.active .reelStrip.s4{animation-delay:.36s;}',
    '.vcs-scene.active .reelStrip.s5{animation-delay:.48s;}',
    '.vcs-scene.active .sandTop{animation:vcsSandDrain 5s ease-in-out infinite;}',
    '.vcs-scene.active .sandBot{animation:vcsSandFill 5s ease-in-out infinite;}',
    '.vcs-scene.active .stream{animation:vcsStreamShow 5s linear infinite;}',
    '@keyframes vcsPop{from{opacity:0;transform:scale(.6)}to{opacity:1;transform:scale(1)}}',
    '@keyframes vcsFill{from{width:0}to{}}',
    '@keyframes vcsReelSpin{from{transform:translateY(0)}to{transform:translateY(-220px)}}',
    '@keyframes vcsSandDrain{0%{transform:scaleY(1)}100%{transform:scaleY(0)}}',
    '@keyframes vcsSandFill{0%{transform:scaleY(0)}100%{transform:scaleY(1)}}',
    '@keyframes vcsStreamShow{0%,5%{opacity:0}12%,90%{opacity:1}96%,100%{opacity:0}}',
    '.vcs-progress{height:4px;background:#e9eef1;border-radius:2px;overflow:hidden;margin-top:14px;}',
    '.vcs-progress>i{display:block;height:100%;width:0;background:#00838d;border-radius:2px;}',
    '.vcs-stepper{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;margin-top:14px;}',
    '.vcs-step{display:flex;align-items:center;gap:7px;border:1px solid #e2e8eb;background:#fff;color:#7d8a90;border-radius:999px;padding:6px 12px 6px 7px;font-size:12.5px;font-weight:600;cursor:pointer;transition:.25s;}',
    '.vcs-step b{display:inline-flex;width:20px;height:20px;border-radius:50%;background:#eef2f4;color:#7d8a90;align-items:center;justify-content:center;font-size:11px;}',
    '.vcs-step.active{border-color:#00838d;color:#00838d;background:#f0f8f9;}',
    '.vcs-step.active b{background:#00838d;color:#fff;}',
    '.vcs-controls{display:flex;gap:10px;justify-content:center;align-items:center;margin-top:12px;flex-wrap:wrap;}',
    '.vcs-controls button{font:inherit;font-size:13px;font-weight:600;border:1px solid #cfe0e3;background:#fff;color:#00838d;border-radius:10px;padding:8px 16px;cursor:pointer;}',
    '.vcs-controls button:hover{background:#f0f8f9;}',
    '.vcs-hint{margin-top:10px;text-align:center;font-size:11.5px;color:#7d8a90;}',
    '@media (prefers-reduced-motion: reduce){.vcs-scene{transition:none;}.vcs-scene *{animation:none !important;}}',
    '@media (max-width:560px){.vcs-panel{padding:16px 12px 12px;}.vcs-head h2{font-size:19px;}.vcs-stage{aspect-ratio:auto;min-height:450px;}.vcs-art{height:140px;}.vcs-art svg{height:140px;}.vcs-scene{padding:16px 14px;}.vcs-num{font-size:13px;}.vcs-scene h3{font-size:19px;}.vcs-scene p{font-size:14.5px;max-width:100%;}.vcs-step{font-size:13px;padding:6px 11px 6px 7px;}.vcs-hint{display:none;}}',
    '@media (max-width:400px){.vcs-stage{min-height:490px;}.vcs-art{height:128px;}.vcs-art svg{height:128px;}}'
  ].join('');

  // Sceny — 6 scen z prezentacja_sila_szyfrowania.html, klasy CSS scena/animacji bez prefiksu .vcs-
  // (pasują do reguł "..vcs-scene.active .pop", "...reelStrip", "...sandTop" itd.)
  var SCENES =
    // 1: AES-256 — kłódka w tarczy
    '<div class="vcs-scene"><div class="vcs-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<path class="pop" d="M150,20 L212,42 V84 C212,120 186,142 150,156 C114,142 88,120 88,84 V42 Z" fill="#eaf6f7" stroke="#00838d" stroke-width="3"/>' +
      '<g transform="translate(150,80)">' +
        '<rect x="-20" y="-2" width="40" height="30" rx="7" fill="#00838d"/>' +
        '<path d="M-12,-2 v-9 a12,12 0 0 1 24,0 v9" fill="none" stroke="#00838d" stroke-width="4.2"/>' +
        '<circle cx="0" cy="13" r="4" fill="#fff"/>' +
      '</g>' +
      '<rect x="108" y="120" width="84" height="22" rx="11" fill="#00838d"/>' +
      '<text x="150" y="135" text-anchor="middle" font-size="12" font-weight="800" fill="#fff">AES-256</text>' +
    '</svg></div><div class="vcs-num">Siła 1/6</div><h3>Szyfrowanie klasy wojskowej</h3><p>Twoje dane chroni AES-256 — ten sam standard, którego używają banki i rządy.</p></div>' +

    // 2: kombinacje — 2^256
    '<div class="vcs-scene"><div class="vcs-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="pop">' +
        '<rect x="44" y="52" width="212" height="74" rx="16" fill="#eef7f8" stroke="#bcdfe3" stroke-width="1.6"/>' +
        '<text x="150" y="92" text-anchor="middle" font-size="30" font-weight="800" fill="#0f2b33">2²⁵⁶</text>' +
        '<text x="150" y="114" text-anchor="middle" font-size="13" fill="#00838d" font-weight="700">≈ 10⁷⁷ możliwych kluczy</text>' +
      '</g>' +
      '<text class="pop2" x="150" y="146" text-anchor="middle" font-size="14" font-weight="800" fill="#00838d">Porównywalnie z liczbą atomów</text>' +
      '<text class="pop2" x="150" y="164" text-anchor="middle" font-size="14" font-weight="800" fill="#00838d">we Wszechświecie</text>' +
    '</svg></div><div class="vcs-num">Siła 2/6</div><h3>256-bitowy klucz</h3><p>Twój klucz to jedna z około 10⁷⁷ kombinacji — liczby tak ogromnej, że trudno ją sobie wyobrazić.</p></div>' +

    // 3: brute force — klepsydra
    '<div class="vcs-scene"><div class="vcs-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<defs>' +
        '<clipPath id="vcsTopGlass"><path d="M116,66 L184,66 L150,110 Z"/></clipPath>' +
        '<clipPath id="vcsBotGlass"><path d="M116,154 L184,154 L150,110 Z"/></clipPath>' +
      '</defs>' +
      '<g class="pop">' +
        '<rect x="78" y="12" width="144" height="28" rx="14" fill="#fbeef0" stroke="#d85a30" stroke-width="1.4"/>' +
        '<text x="150" y="31" text-anchor="middle" font-size="13" font-weight="800" fill="#993c1d">10¹⁸ prób na sekundę</text>' +
      '</g>' +
      '<g class="pop2">' +
        '<rect x="112" y="62" width="76" height="4" rx="1.5" fill="#00838d"/>' +
        '<rect x="112" y="154" width="76" height="4" rx="1.5" fill="#00838d"/>' +
        '<path d="M116,66 L184,66 L150,110 Z" fill="#eef7f8" stroke="#00838d" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<path d="M116,154 L184,154 L150,110 Z" fill="#eef7f8" stroke="#00838d" stroke-width="2.4" stroke-linejoin="round"/>' +
        '<g clip-path="url(#vcsTopGlass)">' +
          '<path class="sandTop" d="M116,66 L184,66 L150,110 Z" fill="#d4a017" style="transform-origin:150px 66px"/>' +
        '</g>' +
        '<g clip-path="url(#vcsBotGlass)">' +
          '<path class="sandBot" d="M116,154 L184,154 L150,110 Z" fill="#d4a017" style="transform-origin:150px 154px"/>' +
        '</g>' +
        '<rect class="stream" x="148.5" y="104" width="3" height="14" rx="1.2" fill="#d4a017"/>' +
      '</g>' +
    '</svg></div><div class="vcs-num">Siła 3/6</div><h3>Zgadywanie klucza po kolei?</h3><p>Nawet superkomputer próbujący miliard miliardów kluczy na sekundę potrzebowałby <strong>więcej czasu, niż istnieje Wszechświat</strong>.</p></div>' +

    // 4: hasło — bębny + pill „600 000× wolniej"
    '<div class="vcs-scene"><div class="vcs-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><clipPath id="vcsReelClip"><rect x="-9" y="-12" width="18" height="24"/></clipPath></defs>' +
      '<g class="pop">' +
        '<rect x="70" y="22" width="160" height="44" rx="11" fill="#fff" stroke="#00838d" stroke-width="2"/>' +
        '<g transform="translate(102,44)" clip-path="url(#vcsReelClip)"><text class="reelStrip s1" font-family="\'SF Mono\',Menlo,Consolas,monospace" font-size="16" font-weight="700" fill="#00838d" text-anchor="middle"><tspan x="0" y="5">A</tspan><tspan x="0" y="27">8</tspan><tspan x="0" y="49">F</tspan><tspan x="0" y="71">9</tspan><tspan x="0" y="93">z</tspan><tspan x="0" y="115">K</tspan><tspan x="0" y="137">2</tspan><tspan x="0" y="159">x</tspan><tspan x="0" y="181">Q</tspan><tspan x="0" y="203">7</tspan><tspan x="0" y="225">A</tspan></text></g>' +
        '<g transform="translate(126,44)" clip-path="url(#vcsReelClip)"><text class="reelStrip s2" font-family="\'SF Mono\',Menlo,Consolas,monospace" font-size="16" font-weight="700" fill="#00838d" text-anchor="middle"><tspan x="0" y="5">3</tspan><tspan x="0" y="27">b</tspan><tspan x="0" y="49">D</tspan><tspan x="0" y="71">7</tspan><tspan x="0" y="93">W</tspan><tspan x="0" y="115">p</tspan><tspan x="0" y="137">5</tspan><tspan x="0" y="159">H</tspan><tspan x="0" y="181">q</tspan><tspan x="0" y="203">N</tspan><tspan x="0" y="225">3</tspan></text></g>' +
        '<g transform="translate(150,44)" clip-path="url(#vcsReelClip)"><text class="reelStrip s3" font-family="\'SF Mono\',Menlo,Consolas,monospace" font-size="16" font-weight="700" fill="#00838d" text-anchor="middle"><tspan x="0" y="5">K</tspan><tspan x="0" y="27">2</tspan><tspan x="0" y="49">0</tspan><tspan x="0" y="71">e</tspan><tspan x="0" y="93">L</tspan><tspan x="0" y="115">x</tspan><tspan x="0" y="137">1</tspan><tspan x="0" y="159">Z</tspan><tspan x="0" y="181">p</tspan><tspan x="0" y="203">M</tspan><tspan x="0" y="225">K</tspan></text></g>' +
        '<g transform="translate(174,44)" clip-path="url(#vcsReelClip)"><text class="reelStrip s4" font-family="\'SF Mono\',Menlo,Consolas,monospace" font-size="16" font-weight="700" fill="#00838d" text-anchor="middle"><tspan x="0" y="5">m</tspan><tspan x="0" y="27">B</tspan><tspan x="0" y="49">7</tspan><tspan x="0" y="71">q</tspan><tspan x="0" y="93">4</tspan><tspan x="0" y="115">L</tspan><tspan x="0" y="137">x</tspan><tspan x="0" y="159">0</tspan><tspan x="0" y="181">e</tspan><tspan x="0" y="203">Y</tspan><tspan x="0" y="225">m</tspan></text></g>' +
        '<g transform="translate(198,44)" clip-path="url(#vcsReelClip)"><text class="reelStrip s5" font-family="\'SF Mono\',Menlo,Consolas,monospace" font-size="16" font-weight="700" fill="#00838d" text-anchor="middle"><tspan x="0" y="5">8</tspan><tspan x="0" y="27">1</tspan><tspan x="0" y="49">Z</tspan><tspan x="0" y="71">p</tspan><tspan x="0" y="93">W</tspan><tspan x="0" y="115">n</tspan><tspan x="0" y="137">4</tspan><tspan x="0" y="159">G</tspan><tspan x="0" y="181">f</tspan><tspan x="0" y="203">t</tspan><tspan x="0" y="225">8</tspan></text></g>' +
      '</g>' +
      '<g class="pop2" style="transform-origin:150px 128px;">' +
        '<rect x="70" y="109" width="160" height="38" rx="19" fill="#e1f5ee" stroke="#0f6e56" stroke-width="1.4"/>' +
        '<text x="150" y="133" text-anchor="middle" font-size="14" font-weight="800" fill="#0f6e56">600 000× wolniej</text>' +
      '</g>' +
    '</svg></div><div class="vcs-num">Siła 4/6</div><h3>Jedyny realny cel: Twoje hasło</h3><p>Klucza nie da się złamać siłą — można jedynie zgadywać hasło. Dlatego aplikacja spowalnia każdą próbę 600 000-krotnie.</p></div>' +

    // 5: porównanie czasu — paski
    '<div class="vcs-scene"><div class="vcs-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<text x="14" y="38" font-size="11.5" font-weight="700" fill="#0f2b33">Słabe</text>' +
      '<rect x="92" y="28" width="56" height="15" rx="7.5" fill="#dfe7ea"/>' +
      '<rect class="barfill" x="92" y="28" width="56" height="15" rx="7.5" fill="#d85a30"/>' +
      '<text x="156" y="40" font-size="11" font-weight="700" fill="#993c1d">godziny</text>' +
      '<text x="14" y="92" font-size="11.5" font-weight="700" fill="#0f2b33">Przeciętne</text>' +
      '<rect x="92" y="82" width="120" height="15" rx="7.5" fill="#dfe7ea"/>' +
      '<rect class="barfill" x="92" y="82" width="120" height="15" rx="7.5" fill="#ba7517"/>' +
      '<text x="220" y="94" font-size="11" font-weight="700" fill="#854f0b">tygodnie</text>' +
      '<text x="14" y="146" font-size="11.5" font-weight="700" fill="#0f2b33">Mocne</text>' +
      '<rect x="92" y="136" width="194" height="15" rx="7.5" fill="#dfe7ea"/>' +
      '<rect class="barfill" x="92" y="136" width="194" height="15" rx="7.5" fill="#1d9e75"/>' +
      '<text x="92" y="170" font-size="11" font-weight="800" fill="#0f6e56">dłużej niż wiek Wszechświata</text>' +
    '</svg></div><div class="vcs-num">Siła 5/6</div><h3>Ile zajmie zgadnięcie hasła?</h3><p>Słabe „haslo123" — godziny. Mocne (kilka losowych słów) — dłużej niż istnieje Wszechświat.</p></div>' +

    // 6: wniosek — tarcza z ptaszkiem
    '<div class="vcs-scene"><div class="vcs-art"><svg viewBox="0 0 300 180" xmlns="http://www.w3.org/2000/svg">' +
      '<g class="pop" style="transform-origin:150px 98px;">' +
        '<circle cx="150" cy="90" r="82" fill="#f4fafb" stroke="#bcdfe3" stroke-width="1.6"/>' +
        '<circle cx="150" cy="90" r="76" fill="none" stroke="#1d9e75" stroke-width="1.2" stroke-dasharray="3 4" opacity=".55"/>' +
        '<path d="M100,36 L200,36 V106 C200,136 176,153 150,160 C124,153 100,136 100,106 Z" fill="#e7f6ef" stroke="#1d9e75" stroke-width="3.4" stroke-linejoin="round"/>' +
        '<circle cx="120" cy="70" r="2.6" fill="#1d9e75"/>' +
        '<circle cx="180" cy="70" r="2.6" fill="#1d9e75"/>' +
        '<circle cx="120" cy="120" r="2.6" fill="#1d9e75"/>' +
        '<circle cx="180" cy="120" r="2.6" fill="#1d9e75"/>' +
        '<path d="M134,97 L147,110 L166,84" fill="none" stroke="#1d9e75" stroke-width="7.5" stroke-linecap="round" stroke-linejoin="round"/>' +
      '</g>' +
    '</svg></div><div class="vcs-num">Siła 6/6</div><h3>Mocne hasło = praktycznie nie do złamania</h3><p>Użyj długiego hasła albo kilku losowych słów — a Twoje dane będą bezpieczne praktycznie w nieskończoność.</p></div>';

  var PANEL =
    '<div class="vcs-backdrop" data-close></div>' +
    '<div class="vcs-panel" role="document">' +
      '<button class="vcs-close" type="button" data-close aria-label="Zamknij">×</button>' +
      '<div class="vcs-show">' +
        '<div class="vcs-head"><h2>Jak silne jest szyfrowanie?</h2><div class="vcs-acc"></div>' +
        '<p>Twoje dane chroni szyfrowanie klasy wojskowej — zobacz, ile zajęłoby złamanie</p></div>' +
        '<div class="vcs-stage">' + SCENES + '</div>' +
        '<div class="vcs-progress"><i></i></div>' +
        '<div class="vcs-stepper">' +
          '<div class="vcs-step"><b>1</b>AES-256</div><div class="vcs-step"><b>2</b>Kombinacje</div>' +
          '<div class="vcs-step"><b>3</b>Atak siłowy</div><div class="vcs-step"><b>4</b>Hasło</div>' +
          '<div class="vcs-step"><b>5</b>Czas złamania</div><div class="vcs-step"><b>6</b>Wniosek</div>' +
        '</div>' +
        '<div class="vcs-controls"><button type="button" data-play>⏸ Pauza</button>' +
        '<button type="button" data-restart>↺ Od początku</button></div>' +
        '<div class="vcs-hint">← → zmiana sceny · spacja: pauza · Esc: zamknij</div>' +
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
    overlay.className = 'vcs-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-label', 'Jak silne jest szyfrowanie');
    overlay.innerHTML = PANEL;
    doc.body.appendChild(overlay);

    scenes = [].slice.call(overlay.querySelectorAll('.vcs-scene'));
    steps = [].slice.call(overlay.querySelectorAll('.vcs-step'));
    bar = overlay.querySelector('.vcs-progress > i');
    playBtn = overlay.querySelector('[data-play]');
    var restart = overlay.querySelector('[data-restart]');

    steps.forEach(function (s, k) { s.addEventListener('click', function () { go(k); if (playing) play(); }); });
    if (playBtn) playBtn.addEventListener('click', function () { if (playing) { pause(); } else { play(); } });
    if (restart) restart.addEventListener('click', function () { go(0); play(); });
    var stage = overlay.querySelector('.vcs-stage');
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

  global.VildaCryptoStrength = { open: open, close: close, __vcs: true };
})(typeof window !== 'undefined' ? window : this);
