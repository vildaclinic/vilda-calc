/* Educational lifespan visualization. Approved source/display data are separate
 * from the clinical reference engine. This module never classifies a result,
 * infers puberty/menopause, writes patient data, or normalizes zoom views anew.
 * Context updates are atomic; an opaque identity token stays inside the closure.
 */
(function (root) {
  "use strict";
  let instanceSequence = 0;

  function mount(options) {
    const opts = options || {};
    const host = opts.host;
    if (!host || !host.ownerDocument)
      throw new TypeError("Lifespan host is required");
    const document = host.ownerDocument;
    const window = document.defaultView || root;
    const data = opts.data || root.VildaHormoneLifespanData;
    const panel = document.createElement("section");
    panel.className = "vilda-hormone-lifespan";
    panel.setAttribute("aria-label", "Poglądowy wykres zmian hormonów");
    panel.hidden = true;
    host.append(panel);
    if (
      !data ||
      !data.referenceData ||
      !data.lifespanData ||
      !Array.isArray(data.maleHormones)
    ) {
      return {
        update: () => false,
        clear: () => {
          panel.hidden = true;
        },
        destroy: () => panel.remove(),
        getState: () => ({ visible: false, selected: [] }),
      };
    }
    // This HTML is static. All context values are written only with textContent.
    panel.innerHTML = `<div class="vhl-header"><h3 class="vhl-title" data-lifespan="title">Hormony w ciągu życia</h3><button type="button" class="vhl-expand" aria-haspopup="dialog" aria-expanded="false"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><path class="vhl-expand-icon" d="M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5"/><path class="vhl-close-icon" d="m6 6 12 12M6 18 18 6"/></svg><span>Powiększ</span></button></div>

<div class="vhl-toolbar"><nav class="vhl-views" aria-label="Zakres wykresu"><button type="button" data-view="life" aria-pressed="true">Całe życie</button><button type="button" data-view="mini" aria-pressed="false">Minipuberty</button><button type="button" data-view="puberty" aria-pressed="false">Pokwitanie</button></nav><button class="vhl-compare-toggle" type="button" aria-pressed="false" hidden>Porównaj płcie</button></div>
<div class="vhl-legend" role="group" aria-label="Wybierz hormony do porównania — można zaznaczyć kilka"></div>
<div class="vhl-sex-key" hidden><span><i class="vhl-female-key"></i>Dziewczynki</span><span><i class="vhl-male-key"></i>Chłopcy</span></div>
<div class="vhl-chart-heading"><span class="vhl-axis-label">Przebieg zmian</span><button class="vhl-reset" type="button" hidden>Tylko LH</button></div>
<div class="vhl-chart-wrap"><div class="vhl-stage-nav" role="group" aria-label="Wyróżnij etap życia"></div><svg data-lifespan="chart" role="img" aria-labelledby="chart-title chart-desc"><title data-lifespan="chart-title">Schemat zmian hormonów w ciągu życia mężczyzny</title><desc data-lifespan="chart-desc">Krzywe przedstawiają poglądowo czas i kierunek zmian. Każdy hormon ma własną skalę. Oś życia jest podzielona na etapy o różnej skali czasu. To nie są stężenia ani zakresy referencyjne.</desc></svg></div>
<p data-lifespan="population-note" class="vhl-population-note" hidden></p>
<p class="vhl-chart-caption"><svg viewBox="0 0 16 16" fill="none" aria-hidden="true"><circle cx="8" cy="8" r="6" stroke="currentColor"/><path d="M8 7v4M8 4.5v.5" stroke="currentColor" stroke-linecap="round"/></svg><span data-lifespan="scale-note">Schemat — każdy hormon ma własną skalę.</span></p>
<div class="vhl-insight" aria-live="polite"><span class="vhl-insight-symbol" aria-hidden="true"><svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 16c4 0 3-9 7-9s4 12 8 12h3M3 19c4 0 7-7 10-7s5 3 8 3"/></svg></span><div><h2 data-lifespan="insight-title">Hormony w ciągu życia</h2><p data-lifespan="insight-text">Wybierz etap, aby przyjrzeć się przebiegowi zmian.</p><div data-lifespan="cycle-panel" class="vhl-cycle-panel" hidden><svg data-lifespan="cycle-chart" role="img" aria-labelledby="cycle-title cycle-desc"><title data-lifespan="cycle-title">Poglądowy przebieg estradiolu w cyklu miesiączkowym</title><desc data-lifespan="cycle-desc">Oś pozioma przedstawia dni przykładowego cyklu 28-dniowego, a pionowa poziom względny. Widoczny jest większy szczyt okołoowulacyjny i mniejszy w fazie lutealnej. To schemat na podstawie median faz, nie pomiary poszczególnych dni ani przewidywanie owulacji pacjentki.</desc></svg><p class="vhl-cycle-note">Przykładowy cykl 28-dniowy. Długość cyklu i czas owulacji są zmienne.</p></div></div></div>
<details class="vhl-sources"><summary>O wykresie i źródła</summary><div class="vhl-source-copy" data-lifespan="source-copy"></div></details>
`;
    const observationsHost = document.createElement("div");
    observationsHost.className = "vhl-observations";
    observationsHost.dataset.lifespan = "observations";
    observationsHost.hidden = true;
    panel.querySelector(".vhl-insight > div").append(observationsHost);
    const uid = "vilda-lifespan-" + ++instanceSequence + "-";
    const byId = (name) =>
      panel.querySelector('[data-lifespan="' + name + '"]');
    panel.querySelectorAll("[data-lifespan]").forEach((node) => {
      node.id = uid + node.dataset.lifespan;
    });
    for (const prefix of ["chart", "cycle"]) {
      byId(prefix === "chart" ? "chart" : "cycle-chart").setAttribute(
        "aria-labelledby",
        uid + prefix + "-title " + uid + prefix + "-desc",
      );
    }
    const { maleAges, maleHormones, maleStages, referenceData, lifespanData } =
      data;
    const infant = referenceData.femaleInfantMedians;
    const comparisonHormones = () =>
      view === "puberty"
        ? ["lh", "fsh", "amh", "inhb"]
        : ["amh", "inhb"];
    const femaleDefinitions = [
      {
        id: "lh",
        name: "LH",
        color: "#7842b0",
        copy: "LH wzrasta w pokwitaniu i ponownie w okresie menopauzy. Niemowlęce stężenia u dziewczynek są dużo niższe; ich przebieg widać w powiększeniu minipuberty.",
      },
      {
        id: "fsh",
        name: "FSH",
        color: "#a77905",
        copy: "FSH w niemowlęctwie i wieku rozrodczym ma podobny rząd wielkości. Znacznie wyższe wartości pojawiają się po menopauzie.",
      },
      {
        id: "e2",
        name: "Estradiol",
        color: "#b84d85",
        copy: "Estradiol wzrasta w pokwitaniu. W wieku rozrodczym zmienia się w cyklu. Po menopauzie jego poziom jest znacznie niższy.",
      },
      {
        id: "amh",
        name: "AMH",
        color: "#ce6049",
        copy: "AMH wzrasta ku młodej dorosłości, a potem maleje. Dokładny przebieg w dzieciństwie jest mniej pewny.",
      },
      {
        id: "inhb",
        name: "Inhibina B",
        color: "#34865c",
        copy: "Inhibina B wzrasta w niemowlęctwie i pokwitaniu. Później maleje; po menopauzie jest niska lub niewykrywalna.",
      },
    ];
    const femaleHormones = femaleDefinitions.map((h) => {
      const points = infant.hormones[h.id].points,
        max = Math.max(...points.map((p) => p.median));
      const life = lifespanData.hormones[h.id];
      return {
        ...h,
        segments: life.displaySegments,
        life,
        miniValues: points.map((p) => p.median / life.normalizationMaximum),
        comparisonValues: points.map((p) => p.median / max),
        miniAges: points.map((p) => p.ageYears),
      };
    });
    const femaleStages = [
      {
        min: 0,
        max: 1,
        width: 0.2,
        name: "Niemowlęctwo",
        short: "Niemowlę",
        color: "#eaf5f2",
        title: "Minipuberty · aktywność jajników",
        text: "AMH i inhibina B odzwierciedlają aktywność pęcherzyków jajnikowych. Przebieg różni się między dziewczynkami.",
      },
      {
        min: 1,
        max: 10,
        width: 0.16,
        name: "Dzieciństwo",
        short: "Dziecko",
        color: "#f0f5f8",
        title: "Dzieciństwo · względne wyciszenie osi",
        text: "LH i estradiol pozostają niskie. AMH i inhibina B nadal odzwierciedlają aktywność pęcherzyków.",
      },
      {
        min: 10,
        max: 20,
        width: 0.16,
        name: "Pokwitanie",
        short: "Pokwitanie",
        color: "#edf4f9",
        title: "Pokwitanie · dojrzewanie osi",
        text: "Rosną estradiol, gonadotropiny i inhibina B. AMH nie wykazuje typowego dla chłopców gwałtownego spadku.",
      },
      {
        min: 20,
        max: 45,
        width: 0.2,
        name: "Wiek rozrodczy",
        short: "Dorosła",
        color: "#f3f6ee",
        title: "Wiek rozrodczy · rytm cyklu",
        text: "W wieku rozrodczym stężenia zależą od fazy cyklu miesiączkowego.",
      },
      {
        min: 45,
        max: 55,
        width: 0.16,
        name: "Przejście menopauzalne",
        short: "Przejście",
        color: "#faf0e8",
        title: "Przejście menopauzalne · indywidualny czas",
        text: "AMH i inhibina B maleją, FSH rośnie, a estradiol może silnie się wahać. Wiek i tempo przejścia są indywidualne.",
      },
      {
        min: 55,
        max: 75,
        width: 0.12,
        name: "Po menopauzie",
        short: "Po menop.",
        color: "#f2eef8",
        title: "Po menopauzie · zmiana profilu hormonalnego",
        text: "AMH i inhibina B są niskie lub niewykrywalne, estradiol niski, a gonadotropiny podwyższone. Pokazujemy ogólny stan, nie prognozę dla konkretnego wieku.",
      },
    ];
    const analyteHormones = Object.freeze({
      lh: "lh",
      fsh: "fsh",
      testosterone_total: "t",
      amh: "amh",
      inhibin_b: "inhb",
      insl3: "insl3",
      estradiol: "e2",
    });

    let sex = null,
      currentAnalyte = null,
      patientAgeYears = null,
      patientAgeLabel = "";
    let sourceStatus = "unavailable",
      preterm = "unknown",
      identityKey;
    let patientContext = null,
      patientPoint = null,
      renderedPoint = null,
      renderedObservation = null;
    let view = "life",
      compare = false,
      compareHormone = null,
      insightMode = "hormone";
    let activeStage = null,
      sectorFrame = 0,
      resizeFrame = 0,
      destroyed = false,
      fullscreen = null;
    const selected = new Set();
    const svg = byId("chart"),
      legend = panel.querySelector(".vhl-legend");
    const stageNav = panel.querySelector(".vhl-stage-nav");
    const toggle = panel.querySelector(".vhl-compare-toggle"),
      reset = panel.querySelector(".vhl-reset"),
      expand = panel.querySelector(".vhl-expand");
    const motionPreference = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    );
    const requestAnimationFrame = window.requestAnimationFrame.bind(window);
    const cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
    const performance = window.performance;
    let sourcesKey = null;
    const fullscreenActivityEvents = [
      "pointerdown", "mousedown", "keydown", "touchstart", "touchmove", "wheel",
    ];
    // A modal in the child frame cannot cover the app shell. Move this same
    // panel to the highest same-origin document; its controls and state survive.
    // Native dialog also works on iOS without the element Fullscreen API.
    function openFullscreen() {
      if (fullscreen || destroyed || panel.hidden) return;
      let target = document;
      const frames = [];
      try {
        let current = window;
        while (current.parent !== current && current.parent.document.body) {
          frames.push(current.frameElement);
          target = current.parent.document;
          current = current.parent;
        }
      } catch {
        // Cross-origin embedding is limited to the accessible viewport.
      }
      if (frames.some((frame) => !frame?.isConnected || frame.hidden)) return;
      target.defaultView.VildaChrome?.closeDrawer?.({ reason: "handoff" });
      const dialog = target.createElement("dialog");
      dialog.className = "vhl-fullscreen-dialog";
      dialog.setAttribute("aria-labelledby", byId("title").id);
      let stylesheet = null;
      if (target !== document) {
        // Copy the already loaded, versioned component CSS. No new request is
        // needed, including offline; unrelated styles and patient DOM stay put.
        const sheet = [...document.styleSheets].find((item) =>
          item.href && /\/vilda_hormone_lifespan\.css(?:\?|$)/.test(item.href),
        );
        try {
          if (!sheet) return;
          stylesheet = target.createElement("style");
          stylesheet.textContent = [...sheet.cssRules].map((rule) => rule.cssText).join("\n");
          target.head.append(stylesheet);
        } catch {
          return;
        }
      }
      const placeholder = document.createComment("hormone-chart-position");
      panel.before(placeholder);
      const scrollPositions = [...new Set([window, target.defaultView])].map((view) =>
        ({ view, left: view.scrollX, top: view.scrollY }));
      const scrollLocks = [...new Set([document, target])].flatMap((doc) =>
        [doc.documentElement, doc.body].map((node) => ({
          node,
          alreadyLocked: node.classList.contains("vhl-scroll-locked"),
        })),
      );
      fullscreen = { dialog, placeholder, stylesheet, scrollLocks, scrollPositions, frames };
      for (const { node } of scrollLocks)
        node.classList.add("vhl-scroll-locked");
      dialog.append(panel);
      target.body.append(dialog);
      panel.classList.add("vhl-expanded");
      expand.setAttribute("aria-expanded", "true");
      expand.querySelector("span").textContent = "Zamknij";
      const close = () => closeFullscreen();
      fullscreen.close = close;
      const resize = () => onResize();
      fullscreen.resize = resize;
      // The panel can live in the app shell while its session belongs to the
      // converter frame. Forward real input, never resize or automatic scroll.
      const activity = (event) => {
        if (destroyed || fullscreen?.dialog !== dialog || !event.isTrusted ||
          !dialog.open || !dialog.isConnected || !host.isConnected || panel.hidden ||
          document.visibilityState !== "visible" || target.visibilityState !== "visible" ||
          frames.some((frame) => !frame?.isConnected || frame.hidden ||
            frame.getAttribute("aria-hidden") === "true")) return;
        if (typeof opts.onActivity === "function")
          opts.onActivity(event, target.defaultView);
      };
      fullscreen.activity = activity;
      for (const type of fullscreenActivityEvents)
        dialog.addEventListener(type, activity, { capture: true, passive: true });
      dialog.addEventListener("cancel", (event) => {
        event.preventDefault();
        close();
      });
      dialog.addEventListener("close", close);
      window.addEventListener("pagehide", close);
      target.defaultView.addEventListener("resize", resize);
      const frameObserver = new window.MutationObserver(() => {
        if (!host.isConnected || frames.some((frame) =>
          !frame?.isConnected || frame.hidden || frame.getAttribute("aria-hidden") === "true"))
          closeFullscreen(false);
      });
      for (const frame of frames) {
        frameObserver.observe(frame, { attributes: true, attributeFilter: ["hidden", "aria-hidden"] });
        if (frame.parentElement) frameObserver.observe(frame.parentElement, { childList: true });
      }
      fullscreen.frameObserver = frameObserver;
      try {
        dialog.showModal();
        expand.focus({ preventScroll: true });
        render();
      } catch {
        closeFullscreen(false);
      }
    }
    function closeFullscreen(restoreFocus = true) {
      if (!fullscreen) return;
      const { dialog, placeholder, stylesheet, scrollLocks, scrollPositions, close, resize, activity, frameObserver, frames } = fullscreen;
      fullscreen = null;
      frameObserver.disconnect();
      window.removeEventListener("pagehide", close);
      dialog.ownerDocument.defaultView.removeEventListener("resize", resize);
      dialog.removeEventListener("close", close);
      for (const type of fullscreenActivityEvents)
        dialog.removeEventListener(type, activity, true);
      if (dialog.open) dialog.close();
      if (placeholder.parentNode) placeholder.replaceWith(panel);
      else host.append(panel);
      panel.classList.remove("vhl-expanded");
      expand.setAttribute("aria-expanded", "false");
      expand.querySelector("span").textContent = "Powiększ";
      dialog.remove();
      stylesheet?.remove();
      for (const { node, alreadyLocked } of scrollLocks)
        if (!alreadyLocked) node.classList.remove("vhl-scroll-locked");
      for (const { view, left, top } of scrollPositions)
        view.scrollTo({ left, top, behavior: "instant" });
      if (restoreFocus && host.isConnected && !panel.hidden &&
        frames.every((frame) => frame.isConnected && !frame.hidden) && host.getClientRects().length)
        expand.focus({ preventScroll: true });
      onResize();
    }
    function chartHeight(normal) {
      return fullscreen
        ? Math.max(normal, Math.min(720, Math.round(fullscreen.dialog.clientHeight * 0.58)))
        : normal;
    }
    const NS = "http://www.w3.org/2000/svg";
    const hormones = () =>
      sex === "female" ? femaleHormones : sex === "male" ? maleHormones : [];
    const stages = () =>
      sex === "female" ? femaleStages : sex === "male" ? maleStages : [];
    const isSupported = () =>
      sourceStatus === "ready" &&
      Object.prototype.hasOwnProperty.call(analyteHormones, currentAnalyte) &&
      hormones().some((h) => h.id === analyteHormones[currentAnalyte]);
    const fmt = (n) =>
      new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 }).format(n);
    const canShowAgeMarker = () =>
      patientAgeYears !== null && (patientAgeYears >= 1 || preterm === "no");
    const compactAgeLabel = () =>
      patientAgeYears < 2
        ? fmt(patientAgeYears * 12) + " mies."
        : fmt(patientAgeYears) + " lat";
    function el(tag, attrs = {}, content) {
      const n = document.createElementNS(NS, tag);
      for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, String(v));
      if (content !== undefined) n.textContent = content;
      return n;
    }
    function text(x, y, label, attrs = {}) {
      return el(
        "text",
        { x, y, fill: "#597780", "font-size": 11, ...attrs },
        label,
      );
    }
    function ageLabel() {
      if (patientAgeYears === null) return "";
      const months = patientAgeYears * 12;
      return (
        patientAgeLabel ||
        (months < 24 ? fmt(months) + " mies." : fmt(patientAgeYears) + " lat")
      );
    }
    function xFraction(age) {
      if (view === "mini") return age;
      if (view === "puberty") return (age - 8) / 12;
      let offset = 0;
      for (const s of stages()) {
        if (age <= s.max)
          return offset + ((age - s.min) / (s.max - s.min)) * s.width;
        offset += s.width;
      }
      return 1;
    }
    function interpolator(xs, v) {
      const n = xs.length,
        h = [],
        d = [],
        m = [];
      for (let i = 0; i < n - 1; i++) {
        h[i] = xs[i + 1] - xs[i];
        d[i] = (v[i + 1] - v[i]) / h[i];
      }
      m[0] = d[0];
      m[n - 1] = d[n - 2];
      for (let i = 1; i < n - 1; i++) {
        if (d[i - 1] * d[i] <= 0) m[i] = 0;
        else {
          const a = 2 * h[i] + h[i - 1],
            b = h[i] + 2 * h[i - 1];
          m[i] = (a + b) / (a / d[i - 1] + b / d[i]);
        }
      }
      return (x) => {
        let i = 0;
        while (i < n - 2 && x > xs[i + 1]) i++;
        const t = Math.max(0, Math.min(1, (x - xs[i]) / h[i])),
          t2 = t * t,
          t3 = t2 * t;
        return Math.max(
          0,
          Math.min(
            1,
            (2 * t3 - 3 * t2 + 1) * v[i] +
              (t3 - 2 * t2 + t) * h[i] * m[i] +
              (-2 * t3 + 3 * t2) * v[i + 1] +
              (t3 - t2) * h[i] * m[i + 1],
          ),
        );
      };
    }
    function series(h) {
      const xs = h.miniAges || h.ages || maleAges;
      const vs = h.miniValues || h.values;
      const positions = xs.map((age) => xFraction(age));
      return {
        at: interpolator(positions, vs),
        min: Math.max(0, positions[0]),
        max: Math.min(1, positions[positions.length - 1]),
      };
    }
    function basisPath(points) {
      const pair = (p) => p.map((v) => v.toFixed(3)).join(","),
        mix = (a, b, wa, wb) =>
          a.map((v, j) => (wa * v + wb * b[j]) / (wa + wb));
      let d =
        "M" + pair(points[0]) + "L" + pair(mix(points[0], points[1], 5, 1));
      for (let i = 2; i <= points.length; i++) {
        const a = points[i - 2],
          b = points[i - 1],
          c = points[Math.min(i, points.length - 1)];
        d +=
          "C" +
          pair(mix(a, b, 2, 1)) +
          " " +
          pair(mix(a, b, 1, 2)) +
          " " +
          pair(a.map((v, j) => (v + 4 * b[j] + c[j]) / 6));
      }
      return d + "L" + pair(points[points.length - 1]);
    }
    function curvePath(h, left, width, y, fromAge, toAge) {
      const s = series(h),
        min =
          fromAge === undefined ? s.min : Math.max(s.min, xFraction(fromAge)),
        max = toAge === undefined ? s.max : Math.min(s.max, xFraction(toAge));
      if (max <= min) return null;
      return basisPath(
        Array.from({ length: 97 }, (_, i) => {
          const f = min + ((max - min) * i) / 96;
          return [left + width * f, y(s.at(f))];
        }),
      );
    }
    function displaySpline(h, fraction = xFraction, tangentOverrides = []) {
      const nodes = [];
      for (const segment of h.segments)
        for (const p of segment.points) {
          if (!nodes.length || p.ageYears !== nodes[nodes.length - 1].ageYears)
            nodes.push(p);
        }
      const xs = nodes.map((p) => fraction(p.ageYears)),
        v = nodes.map((p) => p.relative),
        dx = [],
        d = [],
        m = [];
      for (let i = 0; i < xs.length - 1; i++) {
        dx[i] = xs[i + 1] - xs[i];
        d[i] = (v[i + 1] - v[i]) / dx[i];
      }
      m[0] = d[0];
      m[xs.length - 1] = d[d.length - 1];
      for (let i = 1; i < xs.length - 1; i++) {
        if (d[i - 1] * d[i] <= 0) m[i] = 0;
        else {
          const a = 2 * dx[i] + dx[i - 1],
            b = dx[i] + 2 * dx[i - 1];
          m[i] = (a + b) / (a / d[i - 1] + b / d[i]);
        }
      }
      for (const tangent of tangentOverrides) {
        const index = nodes.findIndex((point) => point.ageYears === tangent.ageYears);
        if (index >= 0 && Number.isFinite(tangent.slope)) m[index] = tangent.slope;
      }
      const at = (x) => {
        let i = 0;
        while (i < xs.length - 2 && x > xs[i + 1]) i++;
        const t = Math.max(0, Math.min(1, (x - xs[i]) / dx[i])),
          t2 = t * t,
          t3 = t2 * t;
        return {
          value:
            (2 * t3 - 3 * t2 + 1) * v[i] +
            (t3 - 2 * t2 + t) * dx[i] * m[i] +
            (-2 * t3 + 3 * t2) * v[i + 1] +
            (t3 - t2) * dx[i] * m[i + 1],
          slope:
            ((6 * t2 - 6 * t) * v[i]) / dx[i] +
            (3 * t2 - 4 * t + 1) * m[i] +
            ((-6 * t2 + 6 * t) * v[i + 1]) / dx[i] +
            (3 * t2 - 2 * t) * m[i + 1],
        };
      };
      return { xs, at };
    }
    function segmentPath(segment, left, width, y, spline) {
      const min = Math.max(0, xFraction(segment.points[0].ageYears)),
        max = Math.min(
          1,
          xFraction(segment.points[segment.points.length - 1].ageYears),
        );
      if (max <= min) return null;
      const cuts = [min, ...spline.xs.filter((x) => x > min && x < max), max];
      const pair = (x, v) =>
        (left + width * x).toFixed(4) + "," + y(v).toFixed(4);
      let path = "M" + pair(min, spline.at(min).value);
      for (let i = 0; i < cuts.length - 1; i++) {
        const a = cuts[i],
          b = cuts[i + 1],
          va = spline.at(a),
          vb = spline.at(b),
          step = (b - a) / 3;
        // Exact Hermite-to-Bezier conversion keeps both position and tangent shared
        // across solid/dashed joins; no resampling kink or invented overshoot.
        path +=
          "C" +
          pair(a + step, va.value + step * va.slope) +
          " " +
          pair(b - step, vb.value - step * vb.slope) +
          " " +
          pair(b, vb.value);
      }
      return path;
    }
    function rebuildControls() {
      legend.replaceChildren();
      legend.setAttribute(
        "aria-label",
        compare
          ? "Wybierz hormon do porównania płci"
          : "Wybierz hormony do porównania — można zaznaczyć kilka",
      );
      const list = compare
        ? femaleHormones.filter((h) => comparisonHormones().includes(h.id))
        : hormones();
      for (const h of list) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.hormone = h.id;
        b.setAttribute(
          "aria-label",
          (compare ? "Porównaj płcie: " : "Wyróżnij: ") + h.name,
        );
        const line = document.createElement("span");
        line.className = "vhl-swatch" + (h.dash ? " vhl-dashed" : "");
        line.setAttribute("aria-hidden", "true");
        b.append(line, document.createTextNode(h.name));
        legend.append(b);
      }
      stageNav.replaceChildren();
      for (const [i, s] of stages().entries()) {
        const b = document.createElement("button");
        b.type = "button";
        b.dataset.stage = i;
        b.textContent = s.short;
        b.setAttribute("aria-label", "Wyróżnij etap: " + s.name);
        b.setAttribute(
          "aria-controls",
          byId("chart").id + " " + byId("insight-text").id,
        );
        stageNav.append(b);
      }
    }
    function moveSectorHighlight(animate = true) {
      cancelAnimationFrame(sectorFrame);
      sectorFrame = 0;
      stageNav
        .querySelectorAll("button")
        .forEach((b) =>
          b.setAttribute(
            "aria-pressed",
            String(Number(b.dataset.stage) === activeStage),
          ),
        );
      svg
        .querySelectorAll("[data-sector]")
        .forEach(
          (n) =>
            (n.dataset.active = String(
              Number(n.dataset.sector) === activeStage,
            )),
        );
      const frame = svg.querySelector("[data-sector-highlight]"),
        sector = svg.querySelector(`[data-sector="${activeStage}"]`);
      if (!sector) return;
      if (!frame) {
        render();
        return;
      }
      frame.dataset.sectorHighlight = activeStage;
      const from = {
          x: Number(frame.getAttribute("x")),
          width: Number(frame.getAttribute("width")),
        },
        to = {
          x: Number(sector.getAttribute("x")) + 0.8,
          width: Number(sector.getAttribute("width")) - 1.6,
        };
      const set = (p) => {
        for (const key of ["x", "width"])
          frame.setAttribute(key, from[key] + (to[key] - from[key]) * p);
      };
      if (!animate || motionPreference.matches) {
        set(1);
        return;
      }
      const started = performance.now();
      const tick = (now) => {
        const p = Math.max(0, Math.min(1, (now - started) / 460));
        set(p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);
        sectorFrame = p < 1 ? requestAnimationFrame(tick) : 0;
      };
      sectorFrame = requestAnimationFrame(tick);
    }
    function render() {
      if (destroyed) return;
      cancelAnimationFrame(sectorFrame);
      sectorFrame = 0;
      panel.hidden = !isSupported();
      if (!isSupported()) return;
      panel.dataset.sex = sex;
      const populationNote = byId("population-note");
      populationNote.hidden = !(
        patientAgeYears !== null &&
        patientAgeYears < 1 &&
        preterm !== "no"
      );
      populationNote.textContent = populationNote.hidden
        ? ""
        : "Schemat minipuberty dotyczy dzieci urodzonych o czasie; nie odnosimy do niego wieku tego niemowlęcia.";
      const available = [...selected].find(
        (id) => comparisonHormones().includes(id),
      );
      toggle.hidden = !compare && selected.size > 0 && !available;
      toggle.setAttribute("aria-pressed", String(compare));
      toggle.textContent = compare ? "Zakończ porównanie" : "Porównaj płcie";
      panel.querySelector(".vhl-sex-key").hidden = !compare;
      panel
        .querySelectorAll("[data-view]")
        .forEach((b) =>
          b.setAttribute("aria-pressed", String(b.dataset.view === view)),
        );
      legend.querySelectorAll("button").forEach((b) => {
        const active = compare
          ? b.dataset.hormone === compareHormone
          : selected.has(b.dataset.hormone);
        b.setAttribute("aria-pressed", String(active));
        b.dataset.dim = String(!active);
      });
      const current = hormones().find(
        (h) => h.id === analyteHormones[currentAnalyte],
      );
      reset.hidden =
        compare || (selected.size === 1 && selected.has(current.id));
      reset.textContent = "Tylko " + current.name;
      svg.querySelectorAll(":scope > g").forEach((n) => n.remove());
      renderedPoint = null;
      byId("scale-note").removeAttribute("data-current-source");
      if (compare) renderComparison();
      else renderSchematic();
      updateInsight();
      explainUnavailablePoint();
      updateSources();
    }
    function drawAgeMarker(
      group,
      { W, mobile, left, right, top, bottom, px, comparison = false },
    ) {
      const label = mobile
        ? compactAgeLabel()
        : "Wiek pacjenta · " + ageLabel();
      const labelWidth = Math.min(
        W - left - right,
        mobile
          ? Math.max(67, label.length * 5.7 + 16)
          : Math.max(156, label.length * 6 + 16),
      );
      const center = Math.max(
        left + labelWidth / 2,
        Math.min(W - right - labelWidth / 2, px),
      );
      const markerAttribute = comparison
        ? "data-comparison-age-marker"
        : "data-patient-age-marker";
      const labelTop = top - (comparison ? 32 : 29);
      group.append(
        el("line", {
          x1: px,
          x2: px,
          y1: top - 5,
          y2: comparison ? bottom : bottom + 1,
          stroke: comparison ? "#547a85" : "#365b66",
          "stroke-width": 1.2,
          "stroke-dasharray": "3 4",
          [markerAttribute]: patientAgeYears,
        }),
        el("rect", {
          x: center - labelWidth / 2,
          y: labelTop,
          width: labelWidth,
          height: comparison ? 22 : 21,
          rx: 6,
          fill: "#e6f0f1",
          stroke: "#d1e3e5",
          "stroke-width": 0.8,
        }),
        text(center, labelTop + 15, label, {
          "text-anchor": "middle",
          "font-size": mobile ? 9.5 : 10.5,
          fill: "#3c626c",
          "font-weight": 550,
          ...(label.length > (mobile ? 16 : 35)
            ? { textLength: labelWidth - 12, lengthAdjust: "spacingAndGlyphs" }
            : {}),
        }),
      );
    }

    const pointEngine = () => opts.referenceEngine || root.VildaHormoneLifespanReference;
    const displayEngine = opts.displayEngine || root.VildaHormoneLifespanDisplay;
    const inhibinDisplay = displayEngine?.buildMaleInhibin(data, pointEngine());
    const testosteroneDisplay = displayEngine?.buildMaleTestosterone?.(data, pointEngine());
    const maleLifeFraction = (age) => {
      let offset = 0;
      for (const stage of maleStages) {
        if (age <= stage.max)
          return offset + (age - stage.min) / (stage.max - stage.min) * stage.width;
        offset += stage.width;
      }
      return 1;
    };
    const stableCurves = new Map([inhibinDisplay, testosteroneDisplay].filter(Boolean).map((display) => {
      const segment = { points: display.points.map((point) => ({
        ageYears: point.ageYears, relative: point.value / display.divisor / display.ceiling,
      })) };
      const tangents = (display.tangentOverrides || []).map((tangent) => {
        const step = Math.max(1, Math.abs(tangent.ageYears)) * 1e-5;
        const timeScale = (maleLifeFraction(tangent.ageYears + step) - maleLifeFraction(tangent.ageYears - step)) / (2 * step);
        return { ageYears: tangent.ageYears,
          slope: tangent.slopePerYear / display.divisor / display.ceiling / timeScale };
      });
      return [display.id, { display, segment, spline: displaySpline({ segments: [segment] }, maleLifeFraction, tangents) }];
    }));
    const stableVisible = (id) => !compare && sex === "male" && stableCurves.has(id) && selected.has(id);
    const stableInhibinVisible = () => stableVisible("inhb");
    const stableTestosteroneVisible = () => stableVisible("t");
    const stableStudyVisible = () => stableInhibinVisible() || stableTestosteroneVisible();
    const pointNumber = (value, significantDigits = 6) => new Intl.NumberFormat("pl-PL", {
      maximumSignificantDigits: significantDigits,
      ...(value !== 0 && (Math.abs(value) >= 1e7 || Math.abs(value) < 0.0001)
        ? { notation: "scientific" } : {}),
    }).format(value);
    function visibleAgeDomain() {
      return view === "mini" ? [0, 1] : view === "puberty" ? [8, 20]
        : [stages()[0].min, stages()[stages().length - 1].max];
    }
    function patientDotModel() {
      const engine = pointEngine();
      const id = analyteHormones[currentAnalyte];
      const [minAge, maxAge] = visibleAgeDomain();
      if (!engine || patientPoint?.status !== "ready" ||
          !canShowAgeMarker() || patientAgeYears < minAge || patientAgeYears > maxAge ||
          (compare ? compareHormone !== id : !selected.has(id))) return null;
      let profiles = [patientPoint.profile];
      const stableDisplay = !compare && sex === "male" ? stableCurves.get(id)?.display : null;
      if (stableDisplay) profiles = stableDisplay.profiles;
      if (compare) {
        // This view compares ages, not matched Tanner stages. The other sex
        // has no patient observation, so do not invent its gonadal context.
        if (profiles[0].requiredGonadalStage != null) return null;
        const other = engine.selectProfile(data.patientPointData, {
          ...patientContext, sex: sex === "female" ? "male" : "female",
          puberty: null,
        });
        if (other.status !== "ready" || other.profile.unit !== profiles[0].unit ||
            other.profile.requiredGonadalStage != null ||
            !Number.isFinite(engine.referenceAt(other.profile, patientAgeYears))) return null;
        profiles.push(other.profile);
      }
      const curves = profiles.map((profile) => {
        const ages = new Set([
          ...engine.sampleProfile(profile, 400).map((point) => point.ageYears),
          ...profile.points.map((point) => point.ageYears),
          patientAgeYears,
          Math.max(minAge, profile.minAge), Math.min(maxAge, profile.maxAge),
          ...stages().map((stage) => stage.min),
        ]);
        const points = [...ages].filter((age) => age >= profile.minAge && age <= profile.maxAge)
          .sort((a, b) => a - b).map((ageYears) => ({
            ageYears, value: engine.referenceAt(profile, ageYears),
          })).filter((point) => Number.isFinite(point.value) && point.value >= 0);
        return { profile, points, color: compare
          ? (profile.sex === "female" ? "#b15786" : "#2b7491")
          : hormones().find((h) => h.id === id).color };
      });
      // The divisor covers the complete source profile, not the zoom viewport.
      // Divide before applying headroom so even a finite 1e308 remains finite.
      const divisor = stableDisplay?.divisor || Math.max(patientPoint.value,
        ...curves.flatMap((curve) => curve.points.map((point) => point.value))) || 1;
      return { ...patientPoint, id, curves, divisor, ceiling: stableDisplay?.ceiling || 1.25, minAge, maxAge, stableDisplay };
    }
    function referencePath(curve, model, x, y) {
      return curve.points.filter((point) => point.ageYears >= model.minAge && point.ageYears <= model.maxAge)
        .map((point, index) => `${index ? "L" : "M"}${x(point.ageYears)},${y(point.value / model.divisor / model.ceiling)}`)
        .join(" ");
    }
    function drawReferenceCurves(group, model, { x, y, mobile }) {
      for (const curve of model.curves) {
        const d = referencePath(curve, model, x, y);
        if (!d) continue;
        group.append(el("path", {
          d, fill: "none", stroke: curve.color,
          "stroke-width": mobile ? 3.2 : 3.7,
          "stroke-linecap": "round", "stroke-linejoin": "round",
          "stroke-dasharray": compare && curve.profile.sex === "male" ? "9 6" : "none",
          "data-reference-line": model.id, "data-profile": curve.profile.id,
          "data-reference-sex": curve.profile.sex,
          ...(compare ? { "data-comparison-curve": model.id,
            "data-comparison-sex": curve.profile.sex, "data-comparison-period": view } : {}),
        }));
      }
    }
    function stableReferencePath(stable, left, width, y) {
      const { display, segment: sourceSegment, spline } = stable;
      if (view === "life") return segmentPath(sourceSegment, left, width, y, spline);
      const [minAge, maxAge] = visibleAgeDomain();
      // Zoom samples the same full-life display spline. It never refits the
      // source transitions to a new time scale or to a patient's measurement.
      const ages = new Set(Array.from({ length: 801 }, (_, index) =>
        minAge + (maxAge - minAge) * index / 800));
      for (const point of display.points)
        if (point.ageYears >= minAge && point.ageYears <= maxAge) ages.add(point.ageYears);
      const segment = { points: [...ages].sort((a, b) => a - b).map((ageYears) => ({
        ageYears, relative: spline.at(maleLifeFraction(ageYears)).value,
      })) };
      return segmentPath(segment, left, width, y, displaySpline({ segments: [segment] }));
    }
    function drawPatientDot(group, model, { W, mobile, left, right, top, bottom, px, y }) {
      const offscale = !!model.stableDisplay && model.value / model.divisor > model.ceiling;
      const py = offscale ? top + 5 : y(model.value / model.divisor / model.ceiling);
      const my = y(model.referenceValue / model.divisor / model.ceiling);
      const unit = model.profile.unit;
      const person = sex === "female" ? "pacjentki" : "pacjenta";
      const medianLabel = model.profile.statistic === "group-median" ? "Mediana grupy" : "Mediana";
      const medianContext = model.profile.statistic === "group-median"
        ? `Mediana grupy ${model.profile.ageGroup.label}` +
          (model.profile.requiredGonadalStage != null ? `, Tanner ${model.profile.requiredGonadalStage}` : "")
        : "Mediana dla wieku";
      const a11y = (offscale ? "Wynik powyżej skali; strzałka nie oznacza dokładnego położenia stężenia. " : "") + `Wynik ${person}: ${pointNumber(model.value)} ${unit}. ${medianContext}: około ${pointNumber(model.referenceValue, 3)} ${unit}. Czerwony punkt oznacza wynik, nie jego klasyfikację.`;
      const dot = el("g", {
        "data-patient-concentration": model.id, "data-value": model.value,
        "data-median": model.referenceValue, "data-profile": model.profile.id,
        "data-divisor": model.divisor, "data-ceiling": model.ceiling,
        "data-plot-top": top, "data-plot-bottom": bottom,
        ...(offscale ? { "data-offscale": "above" } : {}),
        "data-age-lower": patientAgeYears, "data-age-upper": patientContext.ageUpperYears ?? patientAgeYears,
        role: "img", "aria-label": a11y, class: "vhl-patient-point",
      });
      dot.append(el("title", {}, a11y));
      dot.append(el("line", {
        x1: px, x2: px, y1: py, y2: my, stroke: "#8ba6ad",
        "stroke-width": 1.5, "stroke-dasharray": "3 4",
      }));
      const medianColor = model.curves.find((curve) => curve.profile.sex === sex).color;
      dot.append(el("circle", { cx: px, cy: my, r: 4.2, fill: "white",
        stroke: medianColor, "stroke-width": 2, "data-median-point": "" }));
      if (offscale) {
        dot.append(el("path", { d: `M${px},${top + 16}V${top + 2}M${px - 5},${top + 7}L${px},${top + 2}L${px + 5},${top + 7}`,
          fill: "none", stroke: "#d52d43", "stroke-width": 2.5,
          "stroke-linecap": "round", "stroke-linejoin": "round", "data-result-overflow": "above" }));
      } else {
        dot.append(el("circle", { cx: px, cy: py, r: 11, fill: "#d52d43", opacity: 0.12 }));
        dot.append(el("circle", { cx: px, cy: py, r: mobile ? 6.5 : 7,
          fill: "#d52d43", stroke: "white", "stroke-width": 2.5, "data-result-point": "" }));
      }
      const canvas = document.createElement("canvas"), context = canvas.getContext("2d");
      const font = mobile ? 11 : 12;
      const label = (message, yy, color, weight, kind) => {
        if (context) context.font = `${weight} ${font}px system-ui, sans-serif`;
        const measured = context ? context.measureText(message).width : message.length * font * 0.6;
        const width = Math.min(W - left - right, measured + 16);
        let xx = px + 13;
        if (xx + width > W - right) xx = px - width - 13;
        xx = Math.max(left, Math.min(W - right - width, xx));
        const labelGroup = el("g", { "data-dot-label": kind });
        labelGroup.append(el("rect", { x: xx, y: yy, width, height: 23, rx: 6,
          fill: "white", "fill-opacity": 0.96, stroke: kind === "result" ? "#f1cbd0" : "#dce7e9" }));
        labelGroup.append(text(xx + 8, yy + 16, message, {
          "font-size": font, "font-weight": weight, fill: color,
          ...(measured > width - 16 ? { textLength: width - 16, lengthAdjust: "spacingAndGlyphs" } : {}),
        }));
        dot.append(labelGroup);
      };
      const limit = (position) => Math.max(top + 3, Math.min(bottom - 25, position));
      let resultTop = limit(py - 27), medianTop = limit(my + 8);
      if (py > my + 44) { resultTop = limit(py - 20); medianTop = limit(my - 27); }
      if (Math.abs(resultTop - medianTop) < 27) {
        resultTop = limit(Math.min(py, my) - 51);
        medianTop = limit(resultTop + 27);
      }
      if (model.stableDisplay && py !== my) {
        // Keep the labels in the same vertical order as their markers, even
        // when the fixed scale puts the two markers close together.
        if (py > my) {
          medianTop = limit(my - 27);
          resultTop = limit(py + 8);
        } else {
          resultTop = limit(py - 27);
          medianTop = limit(my + 8);
        }
        // Very low childhood concentrations can put both markers near the
        // baseline. Separate their labels without swapping their vertical order.
        if (py > my) {
          resultTop = limit(Math.max(resultTop, medianTop + 27));
          medianTop = limit(Math.min(medianTop, resultTop - 27));
        } else {
          medianTop = limit(Math.max(medianTop, resultTop + 27));
          resultTop = limit(Math.min(resultTop, medianTop - 27));
        }
      }
      const personLabel = sex === "female"
        ? (patientAgeYears < 18 ? "Dziewczynka" : "Kobieta")
        : (patientAgeYears < 18 ? "Chłopiec" : "Mężczyzna");
      label(`${compare ? personLabel + " · " : ""}${offscale ? "↑ " : ""}${pointNumber(model.value)} ${unit}`, resultTop, "#b51e33", 700, "result");
      label(`${medianLabel} ≈${pointNumber(model.referenceValue, 3)} ${unit}`, medianTop, "#365b66", 550, "median");
      group.append(dot);
      model.a11y = a11y;
    }
    function pointDescription(model) {
      if (!model) return;
      renderedPoint = model;
      const name = hormones().find((h) => h.id === model.id).name;
      panel.querySelector(".vhl-axis-label").textContent = name + (model.stableDisplay ? " · wynik na tle badań" : " · wynik na tle mediany");
      const groupLabel = model.profile.statistic === "group-median"
        ? ` grupy ${model.profile.ageGroup.label}` +
          (model.profile.requiredGonadalStage != null ? `, Tanner ${model.profile.requiredGonadalStage}` : "")
        : "";
      const transition = model.stableDisplay?.transitions.some((part) =>
        patientAgeYears >= part.minAge && patientAgeYears <= part.maxAge);
      byId("scale-note").textContent = (model.stableDisplay
        ? "Linia: poglądowy przebieg na podstawie badań. Kropka: wynik."
        : `Kropka: wynik. Linia: mediana${groupLabel}, nie granica normy.`) +
        (transition ? " Mediana źródłowa jest oznaczona osobno." : "") +
        (model.stableDisplay && model.value / model.divisor > model.ceiling ? " ↑ Wynik powyżej skali." : "") +
        (compare ? " Obie płcie we wspólnej skali stężeń." : "") +
        (patientContext.ageUpperYears > patientAgeYears ? " Pozycja wieku przybliżona." : "");
      byId("scale-note").setAttribute("data-current-source", model.profile.id);
      byId("chart-desc").textContent = model.a11y +
        " Wynik i mediana używają tej samej skali stężeń. " +
        (model.stableDisplay
          ? "Linia jest syntezą badań z wygładzonymi przejściami, a nie jedną medianą populacji. Przejścia nie wyznaczają wartości odniesienia pacjenta. " : "") +
        (compare ? "Obie płcie są pokazane w tej samej jednostce i skali; źródła mogą stosować różne metody oznaczenia."
          : "Pozostałe hormony zachowują własne skale poglądowe. Nie porównujemy liczbowo wysokości różnych hormonów.");
    }
    function explainUnavailablePoint() {
      if (renderedObservation?.patientPoint?.status === "ready") return;
      const measurement = patientContext?.measurement;
      const id = analyteHormones[currentAnalyte];
      const [minAge, maxAge] = visibleAgeDomain();
      if (renderedPoint || !canShowAgeMarker() || patientAgeYears < minAge || patientAgeYears > maxAge ||
          (compare ? compareHormone !== id : !selected.has(id)) ||
          !measurement || !Number.isFinite(measurement.value) || measurement.value < 0 ||
          (measurement.operator != null && measurement.operator !== "" && measurement.operator !== "=")) return;
      if (compare && ["missing-puberty-stage", "incompatible-puberty-stage"].includes(patientPoint?.reason)) {
        byId("scale-note").textContent = "Porównanie poglądowe — brak dopasowanych median obu płci do umieszczenia wyniku.";
        return;
      }
      const messages = {
        "unsupported-age": "Dla tego wieku brak mediany pozwalającej nanieść wynik.",
        "ambiguous-age": "Podany przedział wieku wykracza poza dostępny profil mediany.",
        "ambiguous-profile": "Brak jednoznacznie dopasowanej mediany do naniesienia wyniku.",
        "reference-unavailable": "W tym wieku źródło nie pozwala wiarygodnie nanieść wyniku.",
        "incompatible-specimen": "Mediana nie dotyczy materiału tej próbki.",
        "incompatible-assay": "Brak mediany dla potwierdzonej metody tej próbki.",
        "unsupported-unit": "W tej jednostce nie można nanieść wyniku na medianę.",
        "contraindicated": "Dla tego kontekstu badania nie nanosimy wyniku na medianę populacji.",
        "missing-puberty-stage": "Ta mediana dotyczy dzieci przed pokwitaniem. Uzupełnij stadium w danych pacjenta.",
        "incompatible-puberty-stage": "Dostępna mediana wymaga zgodnej oceny przed pokwitaniem (Tanner 1).",
      };
      const message = messages[patientPoint?.reason];
      if (message) byId("scale-note").textContent = message + " Krzywe pozostają poglądowe.";
    }

    function renderSchematic() {
      const W = svg.clientWidth || 1040,
        mobile = W < 640,
        full = view === "life",
        H = chartHeight(full ? (mobile ? 300 : 353) : mobile ? 334 : 393),
        left = mobile ? 26 : 49,
        right = mobile ? 12 : 25,
        top = full ? (mobile ? 38 : 36) : mobile ? 72 : 76,
        bottom = H - 40,
        pw = W - left - right,
        ph = bottom - top;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("height", H);
      stageNav.hidden = !full;
      stageNav.classList.toggle("vhl-compact", mobile);

      stageNav
        .querySelectorAll("button")
        .forEach((b) =>
          b.setAttribute(
            "aria-pressed",
            String(Number(b.dataset.stage) === activeStage),
          ),
        );
      const g = el("g");
      svg.append(g);
      const dotModel = patientDotModel();
      const x = (age) => left + xFraction(age) * pw,
        y = (value) => bottom - value * ph;
      const segments = full
        ? stages()
        : view === "mini"
          ? [{ min: 0, max: 1, color: "#ecf7f5" }]
          : [{ min: 8, max: 20, color: "#edf4f9" }];
      for (const [i, s] of segments.entries())
        g.append(
          el("rect", {
            x: x(s.min),
            y: top,
            width: x(s.max) - x(s.min),
            height: ph,
            fill: s.color,
            "data-sector": full ? i : view,
            "data-active": String(full && i === activeStage),
          }),
        );
      if (full && activeStage !== null) {
        const s = stages()[activeStage];
        g.append(
          el("rect", {
            x: x(s.min) + 0.8,
            y: top - 3,
            width: x(s.max) - x(s.min) - 1.6,
            height: ph + 6,
            rx: 5,
            fill: "#dcefeb",
            stroke: "#228c91",
            "stroke-width": 1.6,
            "pointer-events": "none",
            "data-sector-highlight": activeStage,
          }),
        );
      }
      for (const val of [0, 0.25, 0.5, 0.75, 1])
        g.append(
          el("line", {
            x1: left,
            x2: W - right,
            y1: y(val),
            y2: y(val),
            stroke: "#d9e5e8",
            "stroke-width": 0.7,
            "stroke-dasharray": val === 0 ? "0" : "3 5",
          }),
        );
      g.append(
        text(left - 7, top + 4, "wyżej", {
          "text-anchor": "end",
          "font-size": mobile ? 8.5 : 10,
          fill: "#82979e",
        }),
        text(left - 7, bottom, "niżej", {
          "text-anchor": "end",
          "font-size": mobile ? 8.5 : 10,
          fill: "#82979e",
        }),
      );
      if (full)
        for (const s of stages().slice(1))
          g.append(
            el("line", {
              x1: x(s.min),
              x2: x(s.min),
              y1: top,
              y2: bottom,
              stroke: "#d5e3e7",
              "stroke-width": 1,
              "stroke-dasharray": "3 5",
            }),
          );
      const ordered = selected.size
        ? [
            ...hormones().filter((h) => !selected.has(h.id)),
            ...hormones().filter((h) => selected.has(h.id)),
          ]
        : [];
      if (dotModel && !dotModel.stableDisplay) {
        const clip = el("clipPath", { id: uid + "patient-source-outside" });
        // Keep the schematic only in the complement of all displayed sources.
        // Adjacent source domains never become a pair of interpolation nodes.
        const covered = dotModel.curves.map(({ profile }) => [
          Math.max(dotModel.minAge, profile.minAge),
          Math.min(dotModel.maxAge, profile.maxAge),
        ]).filter(([from, to]) => to > from).sort((a, b) => a[0] - b[0]);
        let cursor = dotModel.minAge;
        for (const [from, to] of covered) {
          if (from > cursor) clip.append(el("rect", {
            x: x(cursor), y: top, width: x(from) - x(cursor), height: ph,
          }));
          cursor = Math.max(cursor, to);
        }
        if (cursor < dotModel.maxAge) clip.append(el("rect", {
          x: x(cursor), y: top, width: x(dotModel.maxAge) - x(cursor), height: ph,
        }));
        const defs = el("defs");
        defs.append(clip);
        g.append(defs);
      }
      for (const h of ordered) {
        const referenceBackground = dotModel?.id === h.id && !dotModel.stableDisplay;
        const active = selected.has(h.id),
          style = {
            fill: "none",
            stroke: h.color,
            "stroke-width": active ? (mobile ? 3.2 : 3.7) : mobile ? 2.6 : 3,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            opacity: active ? 1 : 0.15,
            class: "vhl-curve",
            ...(referenceBackground ? {
              opacity: 0.24, "stroke-dasharray": "5 5",
              "clip-path": `url(#${uid}patient-source-outside)`,
              "data-reference-background": h.id,
            } : {}),
          };
        if (sex === "male" && stableCurves.has(h.id)) {
          const stable = stableCurves.get(h.id);
          g.append(el("path", { ...style, d: stableReferencePath(stable, left, pw, y),
            "data-line": h.id, "data-stable-reference-line": h.id,
            "data-divisor": stable.display.divisor, "data-ceiling": stable.display.ceiling,
            "data-plot-top": top, "data-plot-bottom": bottom,
          }));
        } else if (sex === "female" && view !== "mini") {
          const spline = displaySpline(h);
          for (const segment of h.segments) {
            const d = segmentPath(segment, left, pw, y, spline);
            if (!d) continue;
            const schematic = segment.kind === "schematic";
            g.append(
              el("path", {
                ...style,
                d,
                "stroke-dasharray": referenceBackground || schematic ? "5 5" : "none",
                [schematic ? "data-illustrative-line" : "data-line"]: h.id,
                "data-segment-kind": segment.kind,
                "data-age-from": segment.points[0].ageYears,
                "data-age-to":
                  segment.points[segment.points.length - 1].ageYears,
              }),
            );
          }
        } else {
          const path = el("path", {
            ...style,
            d: curvePath(h, left, pw, y),
            "data-line": h.id,
          });
          if (h.dash) path.setAttribute("stroke-dasharray", h.dash);
          g.append(path);
        }
      }
      if (dotModel && !dotModel.stableDisplay) drawReferenceCurves(g, dotModel, { x, y, mobile });
      const lifeTicks =
        sex === "female"
          ? [
              [0, "0"],
              [1, "1 rok"],
              [10, "10 lat"],
              [20, "20 lat"],
              [40, "40 lat"],
              [75, "Później"],
            ]
          : [
              [0, mobile ? "0" : "Urodzenie"],
              [1, "1 rok"],
              [10, "10 lat"],
              [20, "20 lat"],
              [60, "60 lat"],
              [90, "90 lat"],
            ];
      const ticks = full
        ? lifeTicks
        : view === "mini"
          ? W < 325
            ? [
                [0, "0"],
                [0.25, "3"],
                [0.5, "6"],
                [0.75, "9"],
                [1, "12 mies."],
              ]
            : [
                [0, "0"],
                [1 / 12, "1"],
                [0.25, "3"],
                [0.5, "6"],
                [0.75, "9"],
                [1, "12 mies."],
              ]
          : [
              [8, "8"],
              [10, "10"],
              [12, "12"],
              [14, "14"],
              [16, "16"],
              [18, "18"],
              [20, "20 lat"],
            ];
      for (const [age, label] of ticks) {
        const px = x(age);
        g.append(
          el("line", {
            x1: px,
            x2: px,
            y1: bottom,
            y2: bottom + 5,
            stroke: "#bdcfd5",
          }),
          text(
            px,
            bottom + 21,
            mobile && full
              ? label.replace(" lat", "").replace("1 rok", "1 r.")
              : label,
            {
              "text-anchor":
                xFraction(age) > 0.97
                  ? "end"
                  : xFraction(age) < 0.02
                    ? "start"
                    : "middle",
              "font-size": mobile ? 10 : 11,
            },
          ),
        );
      }
      const fraction = xFraction(patientAgeYears),
        withinLifeAxis =
          !full || patientAgeYears <= stages()[stages().length - 1].max;
      if (
        canShowAgeMarker() &&
        withinLifeAxis &&
        fraction >= 0 &&
        fraction <= 1
      ) {
        drawAgeMarker(g, {
          W,
          mobile,
          left,
          right,
          top,
          bottom,
          px: x(patientAgeYears),
        });
      }
      if (dotModel) drawPatientDot(g, dotModel, {
        W, mobile, left, right, top, bottom, px: x(patientAgeYears), y,
      });
      panel.querySelector(".vhl-axis-label").textContent = "Przebieg zmian";
      byId("scale-note").textContent =
        sex === "female" && view === "mini"
          ? "Ta sama skala co w „Całym życiu” — powiększona jest tylko oś czasu."
          : sex === "female"
            ? "Każdy hormon ma własną skalę. Przerywane fragmenty są poglądowe."
            : "Schemat — każdy hormon ma własną skalę. " +
              (full
                ? "Etapy życia pokazano w różnej skali czasu."
                : "Porównuj czas i kierunek zmian.");
      byId("chart-title").textContent =
        "Poglądowy przebieg hormonów: " +
        (sex === "female" ? "dziewczynki i kobiety" : "chłopcy i mężczyźni");
      byId("chart-desc").textContent =
        "Każdy hormon ma własną skalę względną. To nie są normy ani proporcje stężeń różnych hormonów. Etapy całego życia pokazano w różnej skali czasu.";
      if (stableInhibinVisible()) {
        byId("scale-note").textContent = "Inhibina B: poglądowy przebieg na podstawie badań. Każdy hormon ma własną skalę.";
        byId("chart-desc").textContent += " Inhibina B zachowuje stały przebieg i skalę. Przejścia między źródłami oraz okres płodowy i wiek powyżej 80 lat są poglądowe.";
      }
      if (stableTestosteroneVisible()) {
        byId("scale-note").textContent = (stableInhibinVisible() ? "Testosteron i inhibina B" : "Testosteron") +
          ": poglądowy przebieg na podstawie badań. Każdy hormon ma własną skalę.";
        byId("chart-desc").textContent += " Testosteron zachowuje stały przebieg i skalę. " +
          "Połączenie między niemowlęctwem a dzieciństwem, okres płodowy i wiek powyżej 88 lat są poglądowe.";
      }
      pointDescription(dotModel);
    }
    function renderComparison() {
      stageNav.hidden = true;
      const h = femaleHormones.find((h) => h.id === compareHormone),
        male = maleHormones.find((h) => h.id === compareHormone),
        puberty = view === "puberty",
        minAge = puberty ? 8 : 0,
        maxAge = puberty ? 20 : 1;
      const W = svg.clientWidth || 1040,
        mobile = W < 640,
        H = chartHeight(mobile ? 334 : 393),
        left = mobile ? 28 : 50,
        right = mobile ? 16 : 29,
        top = mobile ? 61 : 63,
        bottom = H - 44,
        pw = W - left - right,
        ph = bottom - top;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("height", H);
      const g = el("g");
      svg.append(g);
      const dotModel = patientDotModel();
      const x = (age) => left + ((age - minAge) / (maxAge - minAge)) * pw,
        y = (value) => bottom - value * ph;
      g.append(
        el("rect", {
          x: left,
          y: top - 4,
          width: pw,
          height: ph + 4,
          rx: 9,
          fill: "#f4f8f9",
        }),
      );
      for (const value of [0, 0.25, 0.5, 0.75, 1])
        g.append(
          el("line", {
            x1: left,
            x2: W - right,
            y1: y(value),
            y2: y(value),
            stroke: "#dce7ea",
            "stroke-width": 0.8,
            "stroke-dasharray": value === 0 ? "0" : "3 5",
          }),
        );
      g.append(
        text(left - 6, top + 4, "wyżej", {
          "text-anchor": "end",
          "font-size": mobile ? 8.5 : 10,
          fill: "#82979e",
        }),
        text(left - 6, bottom, "niżej", {
          "text-anchor": "end",
          "font-size": mobile ? 8.5 : 10,
          fill: "#82979e",
        }),
      );
      const ticks = puberty
        ? [8, 10, 12, 14, 16, 18, 20]
        : mobile
          ? [0, 3, 6, 9, 12]
          : [0, 1, 2, 3, 4, 5, 6, 9, 12];
      for (const tick of ticks) {
        const px = x(puberty ? tick : tick / 12),
          last = tick === ticks[ticks.length - 1];
        g.append(
          el("line", {
            x1: px,
            x2: px,
            y1: bottom,
            y2: bottom + 5,
            stroke: "#bdcfd5",
          }),
          text(px, bottom + 22, last ? (puberty ? "20 lat" : "12 mies.") : String(tick), {
            "text-anchor":
              tick === ticks[0] ? "start" : last ? "end" : "middle",
            "font-size": mobile ? 10 : 11,
          }),
        );
      }
      let curves = [];
      if (!dotModel && h && puberty) {
        // Reuse the ordinary puberty curves, including their original knots
        // and smoothing. Only their vertical display scale changes here.
        const femaleSpline = displaySpline(h),
          maleSeries = series(male),
          maximum = (at, xs) =>
            Math.max(at(0), at(1), ...xs.filter((f) => f > 0 && f < 1).map(at)) || 1,
          femaleMax = maximum((f) => femaleSpline.at(f).value, femaleSpline.xs),
          maleMax = maximum(maleSeries.at, (male.ages || maleAges).map(xFraction));
        curves = [
          {
            sex: "female",
            color: "#b15786",
            d: h.segments
              .map((segment) => segmentPath(
                segment, left, pw, (value) => y(value / femaleMax), femaleSpline,
              ))
              .filter(Boolean)
              .join(" "),
          },
          {
            sex: "male",
            color: "#2b7491",
            d: curvePath(male, left, pw, (value) => y(value / maleMax)),
          },
        ];
      } else if (!dotModel && h) {
        const mi = maleAges
            .map((age, i) => ({ age, i }))
            .filter((p) => p.age >= 0 && p.age <= 1),
          maleMax = Math.max(...mi.map((p) => male.values[p.i]));
        curves = [
          {
            sex: "female",
            color: "#b15786",
            min: h.miniAges[0],
            max: 1,
            at: interpolator(h.miniAges, h.comparisonValues),
          },
          {
            sex: "male",
            color: "#2b7491",
            min: 0,
            max: 1,
            at: interpolator(
              mi.map((p) => p.age),
              mi.map((p) => male.values[p.i] / maleMax),
            ),
          },
        ];
      }
      if (dotModel) drawReferenceCurves(g, dotModel, { x, y, mobile });
      for (const curve of curves) {
        const d = curve.d || basisPath(
          Array.from({ length: 193 }, (_, i) => {
            const age = curve.min + ((curve.max - curve.min) * i) / 192;
            return [x(age), y(curve.at(age))];
          }),
        );
        g.append(
          el("path", {
            d,
            fill: "none",
            stroke: "#fff",
            "stroke-width": mobile ? 6 : 7,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "aria-hidden": "true",
          }),
        );
        g.append(
          el("path", {
            d,
            fill: "none",
            stroke: curve.color,
            "stroke-width": mobile ? 3 : 3.7,
            "stroke-linecap": "round",
            "stroke-linejoin": "round",
            "stroke-dasharray": curve.sex === "male" ? "9 6" : "none",
            "data-comparison-sex": curve.sex,
            "data-comparison-curve": compareHormone,
            "data-comparison-period": view,
          }),
        );
      }
      if (canShowAgeMarker() && patientAgeYears >= minAge && patientAgeYears <= maxAge) {
        drawAgeMarker(g, {
          W,
          mobile,
          left,
          right,
          top,
          bottom,
          px: x(patientAgeYears),
          comparison: true,
        });
      }
      if (dotModel) drawPatientDot(g, dotModel, {
        W, mobile, left, right, top, bottom, px: x(patientAgeYears), y,
      });
      panel.querySelector(".vhl-axis-label").textContent =
        h ? h.name + " · przebieg zmian" : "Przebieg zmian";
      byId("scale-note").textContent =
        "Każda płeć we własnej skali. Porównujemy przebieg zmian, nie stężenia.";
      byId("chart-title").textContent =
        (h ? h.name : "Hormony") + ": przebieg zmian u dziewczynek i chłopców " +
        (puberty ? "w pokwitaniu" : "w pierwszym roku życia");
      byId("chart-desc").textContent =
        (puberty
          ? "Wspólna oś wieku od 8 do 20 lat, nie stadium Tannera. Krzywe są poglądowe; żeńska inhibina B odtwarza model źródłowy. "
          : "Wspólna oś wieku od urodzenia do 12 miesięcy. Dziewczynki: przeskalowane mediany od około 7. dnia. Chłopcy: poglądowy schemat. ") +
        "Linia ciągła: dziewczynki, przerywana: chłopcy. Każda krzywa ma własne maksimum w wyświetlanym okresie na tej samej wysokości. Przecięcie linii nie oznacza równych stężeń. To nie są normy ani przebieg u konkretnego dziecka.";
      if (!dotModel && patientPoint?.status === "ready" && compareHormone === analyteHormones[currentAnalyte]) {
        byId("scale-note").textContent = "Porównanie poglądowe — brak dopasowanych median obu płci do umieszczenia wyniku.";
      }
      pointDescription(dotModel);
    }
    function updateInsight() {
      let title, copy;
      const showCycle =
        sex === "female" &&
        !compare &&
        view === "life" &&
        activeStage === 3 &&
        selected.has("e2");
      if (compare ? !compareHormone : !selected.size) {
        title = "Wybierz hormon";
        copy = "Kliknij nazwę hormonu nad wykresem.";
      } else if (compare && view === "puberty") {
        const h = femaleHormones.find((h) => h.id === compareHormone);
        title = h.name + " · pokwitanie";
        copy = compareHormone === "amh"
          ? "U chłopców AMH maleje w trakcie dojrzewania. U dziewczynek nie występuje podobny spadek."
          : compareHormone === "inhb"
            ? "Po wzroście krzywa dziewczynek opada, a u chłopców przechodzi w plateau."
            : h.name + " wzrasta w pokwitaniu u obu płci. Początek i tempo dojrzewania są indywidualne.";
      } else if (compare) {
        title =
          compareHormone === "amh"
            ? "AMH · różny przebieg po szczycie"
            : "Inhibina B · podobny czas szczytu";
        copy =
          compareHormone === "amh"
            ? "U dziewczynek po szczycie około 4. miesiąca krzywa opada. U chłopców szczyt przypada nieco później, a krzywa dłużej utrzymuje się wysoko."
            : "Obie krzywe osiągają szczyt w pobliżu 4. miesiąca, a następnie opadają. To podobny kierunek zmian, mimo różnych stężeń u obu płci.";
      } else {
        const h =
            insightMode === "hormone" && selected.size === 1
              ? hormones().find((h) => selected.has(h.id))
              : null,
          s =
            stages()[
              view === "mini"
                ? sex === "female"
                  ? 0
                  : 1
                : view === "puberty"
                  ? sex === "female"
                    ? 2
                    : 3
                  : activeStage
            ];
        title = h ? h.name : s ? s.title : "Hormony w ciągu życia";
        copy = h
          ? h.copy
          : s
            ? s.text
            : "Wybierz etap, aby przyjrzeć się przebiegowi zmian.";
      }
      if (showCycle) {
        title = "Estradiol w cyklu";
        copy = "W wieku rozrodczym zmienia się w cyklu miesiączkowym.";
      }
      if (renderedPoint) {
        title = renderedPoint.profile.statistic === "group-median"
          ? "Wynik na tle mediany grupy" : "Wynik na tle mediany dla wieku";
        copy = "Mediana opisuje populację z badania. Wynik konkretnej osoby ocenia się z zakresem referencyjnym i kontekstem klinicznym.";
      }
      byId("insight-title").textContent = title;
      byId("insight-text").textContent = copy;
      const observations = opts.observations || root.VildaHormoneLifespanObservations;
      // Measure the inset in its final, full-width layout rather than beside
      // the insight icon. Restore the compact layout if nothing is rendered.
      const mayShowObservations = observations && data.inhibinEvidence &&
        (compare ? compareHormone === "inhb" : selected.has("inhb"));
      panel.querySelector(".vhl-insight")
        .classList.toggle("vhl-cycle-open", showCycle || Boolean(mayShowObservations));
      byId("cycle-panel").hidden = !showCycle;
      if (showCycle) renderCycle();
      const stage = activeStage == null ? null : stages()[activeStage];
      const activeStageKind = stage?.min === 0 ? "mini"
        : stage?.min === 10 && stage?.max === 20 ? "puberty"
        : sex === "male" && (stage?.min === 60 ||
          (activeStage == null && patientAgeYears > 90)) ? "senior" : null;
      renderedObservation = observations && data.inhibinEvidence
        ? observations.render(observationsHost, data.inhibinEvidence, {
          ...patientContext, view, sex, preterm, compare, selected: [...selected],
          compareHormone, activeStageKind,
        }) : null;
      if (!renderedObservation) {
        observationsHost.hidden = true;
        observationsHost.replaceChildren();
      }
      panel.querySelector(".vhl-insight")
        .classList.toggle("vhl-cycle-open", showCycle || Boolean(renderedObservation));
    }
    function renderCycle() {
      const chart = byId("cycle-chart"),
        W = chart.clientWidth || 800,
        mobile = W < 560,
        H = mobile ? 200 : 224;
      const left = mobile ? 30 : 42,
        right = mobile ? 12 : 21,
        top = 35,
        bottom = H - 47,
        width = W - left - right,
        height = bottom - top;
      chart.setAttribute("viewBox", `0 0 ${W} ${H}`);
      chart.setAttribute("height", H);
      chart.querySelectorAll(":scope > g").forEach((n) => n.remove());
      const g = el("g");
      chart.append(g);
      const x = (day) => left + ((day - 1) / 27) * width,
        y = (value) => bottom - value * height;
      for (const v of [0, 0.5, 1])
        g.append(
          el("line", {
            x1: left,
            x2: W - right,
            y1: y(v),
            y2: y(v),
            stroke: "#d7e4e7",
            "stroke-width": 0.8,
            "stroke-dasharray": v === 0 ? "0" : "3 5",
          }),
        );
      g.append(
        text(left - 5, top + 4, "wyżej", {
          "text-anchor": "end",
          "font-size": mobile ? 8.5 : 10,
        }),
        text(left - 5, bottom, "niżej", {
          "text-anchor": "end",
          "font-size": mobile ? 8.5 : 10,
        }),
      );
      const nearOvulation = 14.5;
      g.append(
        el("line", {
          x1: x(nearOvulation),
          x2: x(nearOvulation),
          y1: top - 5,
          y2: bottom,
          stroke: "#b791aa",
          "stroke-dasharray": "3 5",
          "stroke-width": 1,
        }),
        text(x(nearOvulation), top - 14, "Około owulacji", {
          "text-anchor": "middle",
          "font-size": mobile ? 10 : 11,
          fill: "#8e5477",
        }),
      );
      const data = lifespanData.cycleSchematic.points,
        at = interpolator(
          data.map((p) => p.day),
          data.map((p) => p.relative),
        );
      const path = basisPath(
        Array.from({ length: 169 }, (_, i) => {
          const day = 1 + (27 * i) / 168;
          return [x(day), y(at(day))];
        }),
      );
      g.append(
        el("path", {
          d: path,
          fill: "none",
          stroke: "#b84d85",
          "stroke-width": mobile ? 3 : 3.3,
          "stroke-linecap": "round",
          "stroke-linejoin": "round",
          "data-cycle-curve": "e2",
        }),
      );
      for (const day of [1, 7, 14, 21, 28])
        g.append(
          el("line", {
            x1: x(day),
            x2: x(day),
            y1: bottom,
            y2: bottom + 4,
            stroke: "#bfcfd4",
          }),
          text(x(day), bottom + 19, String(day), {
            "text-anchor": day === 1 ? "start" : day === 28 ? "end" : "middle",
            "font-size": mobile ? 10 : 11,
          }),
        );
      g.append(
        text((left + W - right) / 2, H - 4, "Dzień cyklu", {
          "text-anchor": "middle",
          "font-size": mobile ? 10 : 11,
        }),
      );
    }
    function updateSources() {
      const nextKey = JSON.stringify([sex, view, compare, compareHormone, [...selected].sort(),
        renderedPoint?.curves.map((curve) => curve.profile.id), renderedObservation?.kind]);
      if (nextKey === sourcesKey) return;
      sourcesKey = nextKey;
      const target = byId("source-copy");
      target.replaceChildren();
      const paragraph = (t) => {
        const p = document.createElement("p");
        p.textContent = t;
        target.append(p);
      };
      const links = [];
      if (stableInhibinVisible()) {
        paragraph("Linia inhibiny B jest poglądową syntezą badań, nie jedną medianą ani granicą normy. Zachowuje ten sam przebieg i skalę przed wpisaniem wyniku i po nim. Pozostałe hormony mają własne skale.");
        paragraph("Łagodne przejścia między źródłami (około 9–24 miesięcy, 4,5–7 i 18–25 lat), okres płodowy oraz odcinek po 80. roku są ilustracyjne. Nie służą do wyznaczania mediany, norm ani wyniku pacjenta. Niemowlęcy przebieg źródłowy dotyczy chłopców urodzonych o czasie.");
        paragraph("Kropka oznacza wynik, a jasny znacznik medianę wybranego źródła. W obszarze wygładzonego przejścia mediana źródłowa może nie leżeć na linii poglądowej. Strzałka w górę oznacza wynik poza stałą skalą; etykieta zachowuje jego rzeczywistą wartość. Kolor nie klasyfikuje wyniku.");
        for (const profile of inhibinDisplay.profiles) {
          paragraph([profile.sourceLabel, profile.method, profile.population].filter(Boolean).join(" · "));
          if (profile.url) links.push([profile.sourceLabel || "Źródło", profile.url]);
        }
      }
      if (stableTestosteroneVisible()) {
        paragraph("Linia testosteronu całkowitego zachowuje ten sam przebieg i skalę przed wpisaniem wyniku i po nim. Łączy poglądowo mediany różnych badań; nie jest jedną medianą populacji ani granicą normy.");
        paragraph("Niemowlęca część źródłowa dotyczy chłopców urodzonych o czasie. Od 6. do 18. urodzin odniesienie pochodzi z Madsen 2022 (LC-MS/MS); w wieku 3–<6 i 18–88 lat z Kelsey 2014/2015. Granice doboru badań nie oznaczają nagłej zmiany fizjologicznej.");
        paragraph("Połączenia od około 5. miesiąca do 4 lat, 5–6 i 16–25 lat, okres płodowy oraz odcinek po 88. roku są poglądowe. Zaokrąglony szczyt nie wyznacza wieku biologicznego maksimum. Połączenia nie dostarczają mediany ani normy dla pacjenta.");
        paragraph("Kropka oznacza wynik, a jasny znacznik medianę wybranego źródła. W poglądowym połączeniu mediana może nie leżeć na linii. Strzałka oznacza wynik powyżej stałej skali; etykieta podaje rzeczywistą wartość. Kolor nie klasyfikuje wyniku.");
        const testosteroneSources = new Set();
        for (const profile of testosteroneDisplay.profiles) {
          const sourceKey = profile.url || profile.sourceLabel;
          if (testosteroneSources.has(sourceKey)) continue;
          testosteroneSources.add(sourceKey);
          paragraph([profile.sourceLabel, profile.method, profile.population].filter(Boolean).join(" · "));
          if (profile.url) links.push([profile.sourceLabel || "Źródło", profile.url]);
        }
      }
      const selectedSchematics = stableStudyVisible() ? maleHormones.filter((h) =>
        selected.has(h.id) && !stableCurves.has(h.id) && h.id !== renderedPoint?.id) : [];
      if (selectedSchematics.length) {
        paragraph(selectedSchematics.map((h) => h.name).join(", ") +
          ": autorski schemat czasu i kierunku zmian. Wysokości tych linii są ilustracyjne; nie przedstawiają stężeń ani median.");
        links.push(["Salonia 2019 · schemat rozwoju", "https://doi.org/10.1038/s41572-019-0087-y"]);
        if (selectedSchematics.some((h) => h.id === "lh" || h.id === "fsh")) links.push(
          ["Busch 2022 · minipuberty", "https://doi.org/10.1210/clinem/dgac115"],
          ["Madsen 2022 · pokwitanie", "https://doi.org/10.1210/clinem/dgac155"],
        );
        if (selectedSchematics.some((h) => h.id === "amh"))
          links.push(["Tehrani 2017 · dorosłość", "https://doi.org/10.1371/journal.pone.0179634"]);
        if (selectedSchematics.some((h) => h.id === "insl3"))
          links.push(["EMAS 2022 · INSL3", "https://doi.org/10.1111/andr.13220"]);
      }
      if (renderedPoint && !renderedPoint.stableDisplay) {
        const medianBasis = renderedPoint.profile.statistic === "group-median"
          ? (renderedPoint.profile.ageGroup.boundaryPolicy === "application-completed-year-convention"
            ? "medianę rocznej grupy wieku" : "medianę grupy wieku przed pokwitaniem")
          : "medianę populacji w tym wieku";
        paragraph(`Kropka przedstawia wynik, a linia ${medianBasis} — nie granicę normy ani indywidualny cel. Kolor kropki nie jest klasyfikacją wyniku. Zakresy odniesienia i ocena kliniczna pozostają w osobnej części przelicznika.`);
        paragraph(compare
          ? "Obie linie i wynik mają wspólną skalę stężeń. Źródła dotyczą różnych populacji i metod; wykres nie potwierdza zgodności metody próbki z publikacją. Nie wyznacza proporcji hormonalnych ani stadium pokwitania."
          : "Wynik i mediany korzystają z jednej skali, stałej przy zmianie widoku czasu. Każda publikacja zachowuje własne wartości. Przerywane połączenia między odcinkami są wyłącznie poglądowe: nie służą do wyliczania mediany ani punktu pacjenta. Poza dostępnymi profilami przerywana linia pozostaje schematem. Pozostałe hormony zachowują własne skale poglądowe.");
        for (const { profile } of renderedPoint.curves) {
          const description = [profile.sourceLabel, profile.ageGroup?.label, profile.method, profile.population]
            .filter((item) => typeof item === "string" && item.trim()).join(" · ");
          paragraph(description + (profile.approximate ? ". Mediana odtworzona orientacyjnie ze źródła." : "."));
          if (profile.statistic === "group-median") {
            if (profile.ageGroup?.description) paragraph(profile.ageGroup.description);
          }
          if (typeof profile.url === "string") links.push([profile.sourceLabel || "Źródło mediany", profile.url]);
        }
      } else if (!stableStudyVisible() && compare && view === "puberty") {
        paragraph(
          "Porównanie poglądowe w wieku 8–20 lat. Oś przedstawia wiek, nie stadium Tannera; nie ustalamy stadium z wieku. Każda płeć ma własną skalę względem maksimum w tych latach. Przecięcia linii nie oznaczają równych stężeń, a przesunięcie krzywych nie określa dokładnej różnicy czasu dojrzewania.",
        );
        paragraph(
          "Chłopcy: dotychczasowy autorski schemat czasu i kierunku zmian, nie pomiary ani model median. Zachowano pełne węzły i sposób wygładzania. Linie ciągłe oznaczają dziewczynki, przerywane chłopców; rodzaj linii w tym porównaniu nie określa pewności danych.",
        );
        links.push(
          ["Salonia 2019 · schemat rozwoju", "https://doi.org/10.1038/s41572-019-0087-y"],
          ["Madsen 2022 · pokwitanie", "https://doi.org/10.1210/clinem/dgac155"],
        );
        if (compareHormone === "lh" || compareHormone === "fsh") {
          paragraph(
            "Dziewczynki, LH/FSH: schemat na podstawie grup wieku w tabeli I Ljubicic 2020, AutoDELFIA. Tabela nie definiuje jednoznacznie rodzaju statystyki. Nie przedstawiamy go jako modelu median ani dokładnego wieku szczytu.",
          );
          links.push(["Ljubicic 2020 · LH i FSH", "https://doi.org/10.1093/humrep/deaa182"]);
        } else if (compareHormone === "amh") {
          paragraph(
            "Dziewczynki, AMH: istniejący schemat oparty na medianach grup wieku Jopling 2018 i FDA K170524, Access AMH, osocze. Grupy pediatryczne są niewielkie i szpitalne; dorosłe wybrano według regularnych cykli i płodności. Łagodny przebieg nie jest dodatkowym modelem stężeń ani precyzyjnym wiekiem maksimum.",
          );
          links.push(
            ["Jopling 2018 · AMH", "https://doi.org/10.1002/edm2.21"],
            ["FDA · Access AMH", "https://www.accessdata.fda.gov/cdrh_docs/pdf17/K170524.pdf"],
          );
        } else if (compareHormone === "inhb") {
          paragraph(
            "Dziewczynki, inhibina B: mediana z ryciny 1 Borelli-Kjær 2025, odtworzona orientacyjnie (około ±2 pg/mL), Gen II ELISA. Dorosła część populacji liczy 149 kobiet, bez standaryzacji fazy cyklu. Zachowano krzywą źródłową; porównanie z męskim schematem nie daje norm ani proporcji stężeń.",
          );
          links.push(
            ["Borelli-Kjær 2025 · inhibina B", "https://doi.org/10.1210/clinem/dgae439"],
            ["Kelsey 2016 · chłopcy", "https://doi.org/10.1371/journal.pone.0153843"],
          );
        }
      } else if (!stableStudyVisible() && compare) {
        paragraph(
          "Dziewczynki: mediany GAMLSS z suplementu Ljubicic 2022, od 0,02 do 1 roku, podzielone przez najwyższą medianę w tym przedziale. To nie są dwufazowe średnie z ryciny 3. Suplement CC BY 4.0; wybrano i przeskalowano dane.",
        );
        paragraph(
          "Chłopcy: autorski schemat czasu i kierunku zmian na podstawie Busch 2022 i Salonia 2019, przeskalowany do własnego maksimum. Nie jest modelem median ani zestawem zmierzonych stężeń. Męski szczyt inhibiny B przedstawiono około 4. miesiąca, AMH około 5. miesiąca.",
        );
        paragraph(
          "Porównujemy kształt i czas zmian u donoszonych niemowląt, nie wysokość stężeń ani normy. Wspólna wysokość szczytów i przecięcia linii nie oznaczają takich samych stężeń. Różne modele i zmienność indywidualna nie pozwalają odczytywać z wykresu precyzyjnych różnic czasu między płciami.",
        );
        links.push(
          ["Ljubicic 2022 · dziewczynki", infant.source.url],
          [
            "Dane źródłowe · CC BY 4.0",
            "https://doi.org/10.6084/m9.figshare.19469555.v1",
          ],
          ["Busch 2022 · chłopcy", "https://doi.org/10.1210/clinem/dgac115"],
          [
            "Salonia 2019 · schemat rozwoju",
            "https://doi.org/10.1038/s41572-019-0087-y",
          ],
        );
      } else if (!stableStudyVisible() && sex === "female") {
        paragraph(
          "Minipuberty: mediany GAMLSS Ljubicic 2022, od około 7,3 dnia do 1 roku. To nie są dwufazowe średnie z ryciny 3. Suplement CC BY 4.0; mediany przeskalowano do prezentacji względnej. Dane dotyczą donoszonych dziewczynek.",
        );
        paragraph(
          "Całe życie, minipuberty i pokwitanie zachowują tę samą skalę danego hormonu. Powiększenie dotyczy czasu; nie wyrównuje szczytów wybranych hormonów. Wysokości linii odnoszą się do przebiegu każdego hormonu osobno, nie porównują ich stężeń ani ilości między sobą.",
        );
        links.push(
          ["Ljubicic 2022 · minipuberty", infant.source.url],
          [
            "Suplement · CC BY 4.0",
            "https://doi.org/10.6084/m9.figshare.19469555.v1",
          ],
        );
        if (view !== "mini") {
          paragraph(
            "Całe życie: synteza badań, nie jeden zwalidowany model ani norma. Linie ciągłe odtwarzają modele źródłowe, a przerywane pokazują ogólny przebieg zmian. Luki między badaniami łączymy łagodnymi odcinkami poglądowymi. Nie są one dodatkowymi pomiarami ani modelem stężeń w tych latach. Każdy hormon ma własną skalę; niemowlęctwo nie jest dodatkowo powiększane. Schematyczne wysokości nie są średnimi stężeniami, a daty szczytów i menopauzy nie są prognozą dla pacjentki.",
          );
          if (selected.has("lh") || selected.has("fsh")) {
            paragraph(
              "LH/FSH: po niemowlęctwie wartości grup wieku z tabeli I Ljubicic 2020, AutoDELFIA jak w badaniu niemowlęcym. Tabela nie definiuje jednoznacznie rodzaju statystyki — nie nazywamy tych punktów medianami. Najmłodsza dorosła grupa kobiet liczy tylko 17 osób. Schemat pokazuje wzrost w pokwitaniu, wyrównany okres rozrodczy i wzrost związany z menopauzą. Nie przenosimy różnic między grupami na dokładny szczyt w wieku 14 lat, dołek w wieku 18 lat ani szczyt LH w wieku 65 lat. Badanie obejmowało wiek do 80 lat, mimo etykiety ostatniej grupy 70–100.",
            );
            links.push([
              "Ljubicic 2020 · LH i FSH",
              "https://doi.org/10.1093/humrep/deaa182",
            ]);
          }
          if (selected.has("amh")) {
            paragraph(
              "AMH: mediany grup wieku Jopling 2018 i FDA K170524, oznaczenie Access, po niemowlęctwie osocze. Badanie niemowlęce dotyczy surowicy; nie stosujemy niezweryfikowanego przelicznika między materiałami. Grupy pediatryczne są niewielkie i szpitalne, dorosłe wybrano według regularnych cykli i płodności. Po niemowlęctwie pokazujemy łagodne wypłaszczenie i stopniowy wzrost. Nie wymuszamy szybkiego odbicia do mediany szerokiej grupy 1–4,9 lat. Ten fragment jest schematem, bez przypisania wieku minimum. Dalszy przebieg pomija niepewne ząbki między grupami i pokazuje szerokie maksimum w młodej dorosłości, bez szczytu przypisanego do 28. roku życia. Po grupie 41–45 lat pokazujemy wyłącznie jakościowy spadek, bez wymyślonych stężeń.",
            );
            links.push(
              ["Jopling 2018 · AMH dzieci", "https://doi.org/10.1002/edm2.21"],
              [
                "FDA · Access AMH dorosłych",
                "https://www.accessdata.fda.gov/cdrh_docs/pdf17/K170524.pdf",
              ],
              [
                "Sowers 2008 · przejście menopauzalne",
                "https://doi.org/10.1210/jc.2008-0567",
              ],
            );
          }
          if (selected.has("inhb")) {
            paragraph(
              "Inhibina B: po niemowlęctwie mediana z ryciny 1 Borelli-Kjær 2025, odtworzona orientacyjnie z wykresu (około ±2 pg/mL). Gen II ELISA jak u niemowląt, ale odrębny model. Odcinek 1–5,6 roku jest poglądowym połączeniem modeli niemowląt i starszych dzieci. W źródle brak obserwacji między 1,08 a 5,6 roku. Pokwitaniowy garb i późniejszy łagodny spadek pozostają, ponieważ są widoczne w tym samym opublikowanym modelu. Dorosła grupa liczy 149 kobiet, bez standaryzacji fazy cyklu. Końcowy odcinek opisuje niskie lub niewykrywalne wartości, nie liczbowe stężenia poniżej granicy wykrywalności.",
            );
            links.push([
              "Borelli-Kjær 2025 · inhibina B",
              "https://doi.org/10.1210/clinem/dgae439",
            ]);
          }
          if (selected.has("e2")) {
            paragraph(
              "Estradiol: w pokwitaniu mediany Madsen 2022 (6–18 lat; LMS odwrócone z ln(SI × 10⁶)). Od końca pokwitania do przejścia menopauzalnego pokazujemy schematyczne plateau, zachowując graficzną wysokość końca pokwitania. Nie przypisujemy mu stężenia ani średniej całego cyklu. Nie łączymy mediany nastolatek z różnych faz cyklu z niższą medianą jednej fazy u dorosłych. Wartość 156 pmol/L z Frederiksen 2020 dotyczy tylko wczesnej fazy folikularnej i nie wyznacza linii dorosłości.",
            );
            paragraph(
              "Osobny wykres cyklu: schemat oparty na siedmiu medianach faz Anckaert 2021, w osobnej skali względnej. Autorzy standaryzowali cykle do 29 dni względem szczytu LH. Rozmieszczenie faz na przykładowej osi 28 dni i końcowy powrót do niskiego poziomu są umowne — nie są pomiarami poszczególnych dni ani prognozą owulacji pacjentki. Nie łączymy liczbowo tych oznaczeń Roche z danymi osi życia.",
            );
            paragraph(
              "Niski stan po menopauzie wspiera ogólna mediana 18 pmol/L z Cui 2026 (7206 kobiet; sprawdzony pierwotny abstrakt). To odrębna populacja i harmonizowane oznaczenia. Cały odcinek od dorosłości jest poglądowy — nie określa wielkości spadku u konkretnej kobiety ani wieku jej menopauzy.",
            );
            links.push(
              [
                "Madsen 2022 · pokwitanie",
                "https://doi.org/10.1210/clinem/dgac155",
              ],
              [
                "Suplement LMS · CC BY 4.0",
                "https://doi.org/10.6084/m9.figshare.17153336.v1",
              ],
              [
                "Frederiksen 2020 · tło estradiolu",
                "https://doi.org/10.1210/clinem/dgz196",
              ],
              [
                "Anckaert 2021 · przebieg cyklu",
                "https://pmc.ncbi.nlm.nih.gov/articles/PMC8042396/",
              ],
              [
                "Cui 2026 · po menopauzie",
                "https://pubmed.ncbi.nlm.nih.gov/42120349/",
              ],
              ["SWAN · czas przejścia", "https://doi.org/10.1210/jc.2010-1746"],
            );
          }
        }
      } else if (!stableStudyVisible()) {
        paragraph(
          "Autorski schemat oparty na opisanym w publikacjach czasie i kierunku zmian. Wysokości linii dobrano ilustracyjnie; nie są stężeniami, percentylami ani ilorazami hormonów. Linie nie przedstawiają pomiarów jednej osoby przez całe życie.",
        );
        paragraph(
          "Minipuberty przedstawia przebieg u chłopców urodzonych o czasie. Pokwitanie ma różny początek i tempo; nie ustalamy stadium z wieku. Przebieg w dorosłości i starszym wieku jest indywidualny.",
        );
        links.push(
          ["Salonia 2019", "https://doi.org/10.1038/s41572-019-0087-y"],
          [
            "Busch 2022 · minipuberty",
            "https://doi.org/10.1210/clinem/dgac115",
          ],
          [
            "Madsen 2022 · pokwitanie",
            "https://doi.org/10.1210/clinem/dgac155",
          ],
          [
            "Kelsey 2014 · testosteron",
            "https://doi.org/10.1371/journal.pone.0109346",
          ],
          [
            "Kelsey 2016 · inhibina B",
            "https://doi.org/10.1371/journal.pone.0153843",
          ],
          [
            "Tehrani 2017 · dorosłość",
            "https://doi.org/10.1371/journal.pone.0179634",
          ],
          ["EMAS 2022 · INSL3", "https://doi.org/10.1111/andr.13220"],
        );
      }
      if (renderedObservation?.source) {
        const source = renderedObservation.source;
        paragraph([source.label, source.method, source.specimen].filter(Boolean).join(" · ") + ".");
        if (Array.isArray(source.limitations)) source.limitations.forEach(paragraph);
        if (source.url) links.push([source.label, source.url]);
      }
      const group = document.createElement("div");
      group.className = "vhl-source-links";
      for (const [label, url] of links) {
        const a = document.createElement("a");
        a.textContent = label;
        if (!/^https:\/\//.test(url)) continue;
        a.href = url;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        group.append(a);
      }
      target.append(group);
    }

    // One removable local listener also covers controls rebuilt on context changes.
    function onControlClick(event) {
      const button = event.target.closest("button");
      if (destroyed || panel.hidden || !button || !panel.contains(button))
        return;
      if (button === expand) {
        if (fullscreen) closeFullscreen();
        else openFullscreen();
        return;
      } else if (button.dataset.hormone) {
        const id = button.dataset.hormone;
        if (compare) compareHormone = compareHormone === id ? null : id;
        else {
          if (selected.has(id)) selected.delete(id);
          else selected.add(id);
          insightMode = selected.size === 1 ? "hormone" : "stage";
        }
      } else if (button.dataset.stage !== undefined) {
        const index = Number(button.dataset.stage);
        insightMode = "stage";
        if (activeStage !== index) {
          activeStage = index;
          moveSectorHighlight();
        }
        updateInsight();
        updateSources();
        return;
      } else if (button.dataset.view) {
        view = button.dataset.view;
        if (compare) {
          if (view === "life") compare = false;
          else if (!comparisonHormones().includes(compareHormone))
            compareHormone = null;
          rebuildControls();
        }
        insightMode = "stage";
      } else if (button === toggle) {
        if (!compare) {
          const candidate = [...selected].find(
            (id) => comparisonHormones().includes(id),
          );
          if (selected.size > 0 && !candidate) return;
          compareHormone = candidate || null;
          if (view !== "puberty") view = "mini";
        }
        compare = !compare;
        rebuildControls();
      } else if (button === reset) {
        selected.clear();
        selected.add(analyteHormones[currentAnalyte]);
        insightMode = "hormone";
      } else return;
      render();
    }
    panel.addEventListener("click", onControlClick);
    const onMotionChange = () => {
      if (motionPreference.matches && !destroyed) moveSectorHighlight(false);
    };
    if (motionPreference.addEventListener)
      motionPreference.addEventListener("change", onMotionChange);
    const onResize = () => {
      if (destroyed || panel.hidden) return;
      cancelAnimationFrame(resizeFrame);
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        render();
      });
    };
    const observer = window.ResizeObserver
      ? new window.ResizeObserver(onResize)
      : null;
    if (observer) observer.observe(svg.parentElement);
    else window.addEventListener("resize", onResize);

    function clear() {
      closeFullscreen(false);
      cancelAnimationFrame(sectorFrame);
      cancelAnimationFrame(resizeFrame);
      sectorFrame = resizeFrame = 0;
      panel.hidden = true;
      delete panel.dataset.sex;
      selected.clear();
      identityKey = undefined;
      sex =
        currentAnalyte =
        patientAgeYears =
        compareHormone =
        activeStage =
          null;
      patientAgeLabel = "";
      patientContext = patientPoint = renderedPoint = renderedObservation = null;
      observationsHost.hidden = true;
      observationsHost.replaceChildren();
      preterm = "unknown";
      sourceStatus = "unavailable";
      view = "life";
      compare = false;
      insightMode = "hormone";
      svg.querySelectorAll(":scope > g").forEach((node) => node.remove());
      byId("cycle-chart")
        .querySelectorAll(":scope > g")
        .forEach((node) => node.remove());
      legend.replaceChildren();
      stageNav.replaceChildren();
      byId("source-copy").replaceChildren();
      sourcesKey = null;
      byId("insight-title").textContent = "";
      byId("insight-text").textContent = "";
      byId("cycle-panel").hidden = true;
      byId("population-note").textContent = "";
      byId("population-note").hidden = true;
      byId("scale-note").removeAttribute("data-current-source");
      byId("scale-note").textContent = "Schemat — każdy hormon ma własną skalę.";
      byId("chart-title").textContent = "Poglądowy przebieg hormonów";
      byId("chart-desc").textContent = "Krzywe przedstawiają poglądowo czas i kierunek zmian hormonów.";
      panel.querySelector(".vhl-insight").classList.remove("vhl-cycle-open");
      panel.querySelector(".vhl-sources").open = false;
    }

    function update(context) {
      if (destroyed) return false;
      const next = context || {};
      const nextSex =
        next.sex === "female" || next.sex === "male" ? next.sex : null;
      const nextAnalyte =
        typeof next.analyte === "string" ? next.analyte : null;
      const nextHormones =
        nextSex === "female"
          ? femaleHormones
          : nextSex === "male"
            ? maleHormones
            : [];
      if (
        next.sourceStatus !== "ready" ||
        !Object.prototype.hasOwnProperty.call(analyteHormones, nextAnalyte) ||
        !nextHormones.some((h) => h.id === analyteHormones[nextAnalyte])
      ) {
        clear();
        return false;
      }
      const resetContext =
        panel.hidden ||
        identityKey !== next.identityKey ||
        currentAnalyte !== nextAnalyte ||
        sex !== nextSex;
      sex = nextSex;
      currentAnalyte = nextAnalyte;
      identityKey = next.identityKey;
      sourceStatus = "ready";
      patientAgeYears =
        typeof next.ageYears === "number" &&
        Number.isFinite(next.ageYears) &&
        next.ageYears >= 0 &&
        next.ageYears <= 120
          ? next.ageYears
          : null;
      patientAgeLabel =
        patientAgeYears !== null && typeof next.ageLabel === "string"
          ? next.ageLabel.trim().slice(0, 80)
          : "";
      preterm =
        next.preterm === "yes" || next.preterm === "no"
          ? next.preterm
          : "unknown";
      patientContext = {
        analyte: currentAnalyte, sex, ageYears: patientAgeYears,
        ageUpperYears: next.ageUpperYears, preterm,
        ageUpperInclusive: next.ageUpperInclusive,
        measurement: next.measurement ? { ...next.measurement } : null,
        contraindicated: next.contraindicated === true,
        puberty: next.puberty && typeof next.puberty === "object"
          ? { kind: next.puberty.kind, stage: next.puberty.stage } : null,
        assayMethodId: next.assayMethodId,
        specimen: next.specimen,
      };
      const engine = pointEngine();
      patientPoint = engine && data.patientPointData
        ? engine.evaluate(data.patientPointData, patientContext) : null;
      if (resetContext) {
        closeFullscreen(false);
        selected.clear();
        selected.add(analyteHormones[currentAnalyte]);
        view = "life";
        compare = false;
        compareHormone = null;
        insightMode = "hormone";
        const ageStage =
          patientAgeYears === null
            ? -1
            : stages().findIndex(
                (stage, index) =>
                  patientAgeYears >= stage.min &&
                  (patientAgeYears < stage.max ||
                    (index === stages().length - 1 &&
                      patientAgeYears === stage.max)),
              );
        activeStage = ageStage < 0 ? null : ageStage;
        panel.querySelector(".vhl-sources").open = false;
        rebuildControls();
      }
      render();
      return true;
    }

    function getState() {
      return {
        visible: !panel.hidden && !destroyed,
        sex,
        currentAnalyte,
        patientAgeYears,
        sourceStatus,
        preterm,
        view,
        selected: [...selected],
        activeStage,
        compare,
        compareHormone,
      };
    }
    function destroy() {
      if (destroyed) return;
      clear();
      destroyed = true;
      if (observer) observer.disconnect();
      else window.removeEventListener("resize", onResize);
      if (motionPreference.removeEventListener)
        motionPreference.removeEventListener("change", onMotionChange);
      panel.removeEventListener("click", onControlClick);
      panel.remove();
    }
    return { update, clear, destroy, getState };
  }
  root.VildaHormoneLifespan = Object.freeze({ mount });
})(typeof window !== "undefined" ? window : globalThis);
