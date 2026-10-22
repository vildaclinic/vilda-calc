/* Educational lifespan visualization. Approved source/display data are separate
 * from the clinical reference engine. This module never classifies a result,
 * infers puberty/menopause or writes patient data. Approved female LH/FSH
 * periods use explicit source models/scales, never patient-dependent scaling.
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
<p data-lifespan="comparison-note" class="vhl-relationship-note" hidden>Porównanie zmian LH i FSH w czasie. Każdy hormon ma własną skalę — podobna wysokość linii nie oznacza takiego samego stężenia.</p>
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
        : ["lh", "fsh", "amh", "inhb"];
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
      resultOnlyPoint = null,
      renderedPoint = null,
      renderedResultOnlyPoint = null,
      renderedAmhComparison = null,
      renderedInhibinComparison = null,
      renderedGonadotropinComparison = null,
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
      if (restoreFocus && host.isConnected && !panel.hidden &&
        frames.every((frame) => frame.isConnected && !frame.hidden) && host.getClientRects().length)
        expand.focus({ preventScroll: true });
      // Returning focus across documents can scroll the iframe despite preventScroll.
      // Restore the saved positions after focus, before the next paint.
      for (const { view, left, top } of scrollPositions)
        view.scrollTo({ left, top, behavior: "instant" });
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
      if (sex === "male" && !compare) {
        let stable = schematicCurves.get(h.id);
        if (!stable) {
          const ages = h.ages || maleAges;
          const segment = { points: ages.map((ageYears, i) => ({ ageYears, relative: h.values[i] })) };
          stable = { display: { points: segment.points }, segment,
            spline: displaySpline({ segments: [segment] }, maleLifeFraction) };
          schematicCurves.set(h.id, stable);
        }
        // A zoom must not refit the infant anchors and move their peaks.
        // Quantitative reference curves remain in their separate engine.
        return stableReferencePath(stable, left, width, y);
      }
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
      const firstStage = stageNav.querySelector('[data-stage="0"]');
      if (firstStage) firstStage.textContent = stableAmhVisible() || stableInsl3Visible() || stableGonadotropinVisible()
        ? "Płód · schemat" : stages()[0].short;
      const current = hormones().find(
        (h) => h.id === analyteHormones[currentAnalyte],
      );
      reset.hidden =
        compare || (selected.size === 1 && selected.has(current.id));
      reset.textContent = "Tylko " + current.name;
      svg.querySelectorAll(":scope > g").forEach((n) => n.remove());
      renderedPoint = null;
      renderedResultOnlyPoint = null;
      renderedAmhComparison = null;
      renderedInhibinComparison = null;
      renderedGonadotropinComparison = null;
      delete svg.dataset.comparisonScale;
      delete svg.dataset.comparisonMin;
      delete svg.dataset.comparisonMax;
      clearFemalePeriodMetadata();
      panel.querySelector(".vhl-chart-caption").hidden = false;
      byId("scale-note").removeAttribute("data-current-source");
      if (compare) renderComparison();
      else if (femaleGonadotropinsActive()) renderFemaleGonadotropins();
      else renderSchematic();
      updateInsight();
      explainUnavailablePoint();
      updateGonadotropinPresentation();
      updateSourcePointNote();
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
    const amhDisplay = displayEngine?.buildMaleAmh?.(data, pointEngine());
    const amhInfantComparison = displayEngine?.buildAmhInfantComparison?.(data, pointEngine());
    const amhInfantComparisonActive = () => compare && view === "mini" && compareHormone === "amh";
    const inhibinComparisons = {
      mini: displayEngine?.buildInhibinComparison?.(data, pointEngine(), "mini"),
      puberty: displayEngine?.buildInhibinComparison?.(data, pointEngine(), "puberty"),
    };
    const inhibinComparisonActive = () => compare && compareHormone === "inhb" &&
      (view === "mini" || view === "puberty");
    const gonadotropinComparisons = Object.fromEntries(["mini", "puberty"].map((period) =>
      [period, Object.fromEntries(["lh", "fsh"].map((id) => [id,
        displayEngine?.buildGonadotropinComparison?.(data, pointEngine(), period, id)]))]));
    const gonadotropinComparisonActive = () => compare && ["lh", "fsh"].includes(compareHormone) &&
      (view === "mini" || view === "puberty");
    // This is the existing educational AMH axis, not a patient-reference domain.
    const amhPubertyComparisonDomain = { minAge: 8, maxAge: 20 };
    function initialComparisonPeriod(candidate) {
      const domain = candidate === "amh" ? amhPubertyComparisonDomain
        : candidate === "inhb" ? inhibinComparisons.puberty?.domain
          : gonadotropinComparisons.puberty[candidate]?.domain;
      // Navigation uses the age marker; the point still needs its whole age interval.
      if (domain && Number.isFinite(patientAgeYears) &&
          patientAgeYears >= domain.minAge && patientAgeYears <= domain.maxAge)
        return "puberty";
      // Preserve the existing educational fallback outside the known axes.
      return sex === "female" && ["amh", "inhb"].includes(candidate) && patientAgeYears >= 8
        ? "puberty" : "mini";
    }
    const insl3Display = displayEngine?.buildMaleInsl3?.(data);
    const gonadotropinDisplays = displayEngine?.buildMaleGonadotropins?.(data, pointEngine()) || [];
    const femaleGonadotropins = displayEngine?.buildFemaleGonadotropins?.(data);
    const femaleGonadotropinsActive = () => !!femaleGonadotropins && sex === "female" && !compare &&
      ((selected.size === 0 && ["lh", "fsh"].includes(analyteHormones[currentAnalyte])) ||
        selected.has("lh") || selected.has("fsh"));
    const maleLifeFraction = (age) => {
      let offset = 0;
      for (const stage of maleStages) {
        if (age <= stage.max)
          return offset + (age - stage.min) / (stage.max - stage.min) * stage.width;
        offset += stage.width;
      }
      return 1;
    };
    const stableCurves = new Map([inhibinDisplay, testosteroneDisplay, amhDisplay, insl3Display, ...gonadotropinDisplays].filter(Boolean).map((display) => {
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
    // Female AMH keeps its approved whole-life curve and scale in every ordinary view.
    const femaleAmhLifeFraction = (age) => {
      let offset = 0;
      for (const stage of femaleStages) {
        if (age <= stage.max)
          return offset + (age - stage.min) / (stage.max - stage.min) * stage.width;
        offset += stage.width;
      }
      return 1;
    };
    const femaleAmhHormone = femaleHormones.find((h) => h.id === "amh");
    const femaleAmhStable = femaleAmhHormone ? {
      display: { id: "amh", kind: "female-amh-life", divisor: femaleAmhHormone.life.normalizationMaximum,
        ceiling: 1, unit: femaleAmhHormone.life.unit },
      spline: displaySpline(femaleAmhHormone, femaleAmhLifeFraction),
      ages: [...new Set(femaleAmhHormone.segments.flatMap((segment) =>
        segment.points.map((point) => point.ageYears)))],
    } : null;
    const femaleE2Hormone = femaleHormones.find((h) => h.id === "e2");
    const femaleE2Stable = femaleE2Hormone ? {
      display: { id: "e2", kind: "female-e2-life", divisor: femaleE2Hormone.life.normalizationMaximum,
        ceiling: 1, unit: femaleE2Hormone.life.unit },
      spline: displaySpline(femaleE2Hormone, femaleAmhLifeFraction),
      ages: [...new Set(femaleE2Hormone.segments.flatMap((segment) =>
        segment.points.map((point) => point.ageYears)))],
    } : null;
    const femaleInhibinHormone = femaleHormones.find((h) => h.id === "inhb");
    const femaleInhibinStable = femaleInhibinHormone ? {
      display: { id: "inhb", kind: "female-inhibin-life", divisor: femaleInhibinHormone.life.normalizationMaximum,
        ceiling: 1, unit: femaleInhibinHormone.life.unit },
      spline: displaySpline(femaleInhibinHormone, femaleAmhLifeFraction),
      ages: [...new Set(femaleInhibinHormone.segments.flatMap((segment) =>
        segment.points.map((point) => point.ageYears)))],
    } : null;
    const schematicCurves = new Map();
    const stableVisible = (id) => !compare && sex === "male" && stableCurves.has(id) && selected.has(id);
    const stableInhibinVisible = () => stableVisible("inhb");
    const stableTestosteroneVisible = () => stableVisible("t");
    const stableAmhVisible = () => stableVisible("amh");
    const stableInsl3Visible = () => stableVisible("insl3");
    const stableGonadotropinVisible = () => gonadotropinDisplays.some((display) => stableVisible(display.id));
    const stableStudyVisible = () => stableInhibinVisible() || stableTestosteroneVisible() || stableAmhVisible() || stableInsl3Visible() || stableGonadotropinVisible();
    const pointNumber = (value, significantDigits = 6) => new Intl.NumberFormat("pl-PL", {
      maximumSignificantDigits: significantDigits,
      ...(value !== 0 && (Math.abs(value) >= 1e7 || Math.abs(value) < 0.0001)
        ? { notation: "scientific" } : {}),
    }).format(value);
    function visibleAgeDomain() {
      if (femaleGonadotropinsActive()) {
        const { minAge, maxAge } = femaleGonadotropins[view].domain;
        return [minAge, maxAge];
      }
      return view === "mini" ? [0, 1] : view === "puberty" ? [8, 20]
        : [stages()[0].min, stages()[stages().length - 1].max];
    }
    function ordinaryPointOutsideView() {
      const id = analyteHormones[currentAnalyte];
      if (compare || (view !== "mini" && view !== "puberty") ||
          renderedPoint || renderedObservation?.patientPoint?.status === "ready" ||
          patientPoint?.status !== "ready" || !canShowAgeMarker() || !selected.has(id) ||
          (femaleGonadotropinsActive() && view === "mini" && ["lh", "fsh"].includes(id))) return false;
      const [minAge, maxAge] = visibleAgeDomain();
      return patientAgeYears < minAge || patientAgeYears > maxAge;
    }
    function resultOnlyVisible() {
      return !compare && resultOnlyPoint?.status === "result-only" &&
        canShowAgeMarker() && selected.has(analyteHormones[currentAnalyte]);
    }
    function patientDotModel() {
      const engine = pointEngine();
      const id = analyteHormones[currentAnalyte];
      // INSL3 has a unitless educational curve, not an activated numeric
      // patient reference. Keep this guard even when the display is unavailable.
      if (id === "insl3") return null;
      const [minAge, maxAge] = visibleAgeDomain();
      if (!engine || patientPoint?.status !== "ready" ||
          !canShowAgeMarker() || patientAgeYears < minAge || patientAgeYears > maxAge ||
          (compare ? compareHormone !== id : !selected.has(id))) return null;
      if (compare && patientPoint.profile.ordinaryOnly) return null;
      let profiles = [patientPoint.profile];
      const stableDisplay = !compare ? (sex === "male" ? stableCurves.get(id)?.display
        : sex === "female" && id === "amh" ? femaleAmhStable?.display
        : sex === "female" && id === "e2" ? femaleE2Stable?.display
        : sex === "female" && id === "inhb" ? femaleInhibinStable?.display : null) : null;
      if ((stableDisplay?.kind === "female-amh-life" || stableDisplay?.kind === "female-e2-life" ||
          stableDisplay?.kind === "female-inhibin-life") &&
          stableDisplay.unit !== patientPoint.profile.unit) return null;
      if (stableDisplay?.profiles) profiles = stableDisplay.profiles;
      if (compare) {
        // This view compares ages, not matched Tanner stages. The other sex
        // has no patient observation, so do not invent its gonadal context.
        if (profiles[0].requiredGonadalStage != null) return null;
        const other = engine.selectProfile(data.patientPointData, {
          ...patientContext, sex: sex === "female" ? "male" : "female",
          puberty: null,
        });
        if (other.status !== "ready" || other.profile.unit !== profiles[0].unit ||
            other.profile.ordinaryOnly ||
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
    function femaleAmhReferencePath(segment, left, width, y, fraction = xFraction, domain = visibleAgeDomain()) {
      const stable = femaleAmhStable;
      if (!stable) return null;
      // Preserve the original full-life SVG path exactly. For a zoom, an affine
      // piece of the time axis projects the same cubic without fitting it again.
      if (view === "life") return segmentPath(segment, left, width, y, stable.spline);
      const min = Math.max(domain[0], segment.points[0].ageYears);
      const max = Math.min(domain[1], segment.points[segment.points.length - 1].ageYears);
      if (max <= min) return null;
      const ages = [...new Set([min, max, ...stable.ages, ...femaleStages.map((stage) => stage.min)])]
        .filter((age) => age >= min && age <= max).sort((a, b) => a - b);
      const pair = (position, value) => (left + width * position).toFixed(4) + "," + y(value).toFixed(4);
      let path = "M" + pair(fraction(min), stable.spline.at(femaleAmhLifeFraction(min)).value);
      for (let i = 0; i < ages.length - 1; i++) {
        const a = ages[i], b = ages[i + 1];
        const ca = femaleAmhLifeFraction(a), cb = femaleAmhLifeFraction(b);
        const va = stable.spline.at(ca), vb = stable.spline.at(cb);
        const xa = fraction(a), xb = fraction(b), xStep = (xb - xa) / 3, sourceStep = (cb - ca) / 3;
        path += "C" + pair(xa + xStep, va.value + sourceStep * va.slope) + " " +
          pair(xb - xStep, vb.value - sourceStep * vb.slope) + " " + pair(xb, vb.value);
      }
      return path;
    }
    function femaleE2ReferencePath(segment, left, width, y, fraction = xFraction, domain = visibleAgeDomain()) {
      const stable = femaleE2Stable;
      if (!stable) return null;
      // Preserve the original full-life SVG path exactly. For a zoom, an affine
      // piece of the time axis projects the same cubic without fitting it again.
      if (view === "life") return segmentPath(segment, left, width, y, stable.spline);
      const min = Math.max(domain[0], segment.points[0].ageYears);
      const max = Math.min(domain[1], segment.points[segment.points.length - 1].ageYears);
      if (max <= min) return null;
      const ages = [...new Set([min, max, ...stable.ages, ...femaleStages.map((stage) => stage.min)])]
        .filter((age) => age >= min && age <= max).sort((a, b) => a - b);
      const pair = (position, value) => (left + width * position).toFixed(4) + "," + y(value).toFixed(4);
      let path = "M" + pair(fraction(min), stable.spline.at(femaleAmhLifeFraction(min)).value);
      for (let i = 0; i < ages.length - 1; i++) {
        const a = ages[i], b = ages[i + 1];
        const ca = femaleAmhLifeFraction(a), cb = femaleAmhLifeFraction(b);
        const va = stable.spline.at(ca), vb = stable.spline.at(cb);
        const xa = fraction(a), xb = fraction(b), xStep = (xb - xa) / 3, sourceStep = (cb - ca) / 3;
        path += "C" + pair(xa + xStep, va.value + sourceStep * va.slope) + " " +
          pair(xb - xStep, vb.value - sourceStep * vb.slope) + " " + pair(xb, vb.value);
      }
      return path;
    }
    function femaleInhibinReferencePath(segment, left, width, y, fraction = xFraction, domain = visibleAgeDomain()) {
      const stable = femaleInhibinStable;
      if (!stable) return null;
      // Preserve the original full-life SVG path exactly. For a zoom, an affine
      // piece of the time axis projects the same cubic without fitting it again.
      if (view === "life") return segmentPath(segment, left, width, y, stable.spline);
      const min = Math.max(domain[0], segment.points[0].ageYears);
      const max = Math.min(domain[1], segment.points[segment.points.length - 1].ageYears);
      if (max <= min) return null;
      const ages = [...new Set([min, max, ...stable.ages, ...femaleStages.map((stage) => stage.min)])]
        .filter((age) => age >= min && age <= max).sort((a, b) => a - b);
      const pair = (position, value) => (left + width * position).toFixed(4) + "," + y(value).toFixed(4);
      let path = "M" + pair(fraction(min), stable.spline.at(femaleAmhLifeFraction(min)).value);
      for (let i = 0; i < ages.length - 1; i++) {
        const a = ages[i], b = ages[i + 1];
        const ca = femaleAmhLifeFraction(a), cb = femaleAmhLifeFraction(b);
        const va = stable.spline.at(ca), vb = stable.spline.at(cb);
        const xa = fraction(a), xb = fraction(b), xStep = (xb - xa) / 3, sourceStep = (cb - ca) / 3;
        path += "C" + pair(xa + xStep, va.value + sourceStep * va.slope) + " " +
          pair(xb - xStep, vb.value - sourceStep * vb.slope) + " " + pair(xb, vb.value);
      }
      return path;
    }
    function patientPointAboveScale(model) {
      if (!model.stableDisplay) return false;
      const relative = model.value / model.divisor;
      const tolerance = (model.stableDisplay.kind === "female-amh-life" || model.stableDisplay.kind === "female-e2-life" ||
        model.stableDisplay.kind === "female-inhibin-life")
        ? 8 * Number.EPSILON * Math.max(1, Math.abs(relative), Math.abs(model.ceiling)) : 0;
      return relative > model.ceiling + tolerance;
    }
    function drawPatientDot(group, model, { W, mobile, left, right, top, bottom, px, y }) {
      const offscale = patientPointAboveScale(model);
      const fraction = model.valueFraction || ((value) => value / model.divisor / model.ceiling);
      const py = offscale ? top + 5 : y(fraction(model.value));
      const my = y(fraction(model.referenceValue));
      // New grouped/age references keep source units for geometry, while the
      // two labels use the same unit as the entered result. No assay or
      // specimen conversion is implied by this ordinary unit conversion.
      const enteredUnit = patientContext?.displayUnit || patientContext?.measurement?.unit;
      const conversions = data.patientPointData.unitConversions[model.id];
      const enteredFactor = model.profile.patientNote && conversions?.unit === model.profile.unit &&
        Object.prototype.hasOwnProperty.call(conversions.factors || {}, enteredUnit)
        ? conversions.factors[enteredUnit] : null;
      const labelFactor = Number.isFinite(enteredFactor) && enteredFactor > 0 ? enteredFactor : 1;
      const unit = Number.isFinite(enteredFactor) && enteredFactor > 0 ? enteredUnit : model.profile.unit;
      const labelValue = model.value / labelFactor, labelReference = model.referenceValue / labelFactor;
      const person = sex === "female" ? "pacjentki" : "pacjenta";
      const groupMean = model.profile.statistic === "group-mean";
      // Source readouts can require coarser labels than their exact unit
      // conversion. This does not round the patient's result or move either dot.
      const referenceDigits = Number.isInteger(model.profile.referenceSignificantDigits) &&
        model.profile.referenceSignificantDigits >= 1 && model.profile.referenceSignificantDigits <= 6
        ? model.profile.referenceSignificantDigits
        : model.profile.id === "ljubicic2020-male-fsh-75-80-approximate" ? 2 : 3;
      const medianLabel = groupMean ? "Średnia grupy" : model.profile.statistic === "group-median" ? "Mediana grupy" : "Mediana";
      const medianContext = model.profile.referenceGroupLabel
        ? `Mediana grupy ${model.profile.referenceGroupLabel}`
        : groupMean ? `Średnia w grupie ${model.profile.ageGroup.label}` : model.profile.statistic === "group-median"
        ? `Mediana grupy ${model.profile.ageGroup.label}` +
          (model.profile.requiredGonadalStage != null ? `, Tanner ${model.profile.requiredGonadalStage}` : "")
        : "Mediana dla wieku";
      const a11y = (offscale ? "Wynik powyżej skali; strzałka nie oznacza dokładnego położenia stężenia. " : "") + `Wynik ${person}: ${pointNumber(labelValue)} ${unit}. ${medianContext}: około ${pointNumber(labelReference, referenceDigits)} ${unit}. Czerwony punkt oznacza wynik, nie jego klasyfikację.`;
      const dot = el("g", {
        "data-patient-concentration": model.id, "data-value": model.value,
        "data-median": model.referenceValue, "data-profile": model.profile.id,
        // Keep the legacy numeric attribute for existing integrations; the
        // statistic is explicit and must never be inferred from that name.
        "data-reference-value": model.referenceValue, "data-reference-statistic": model.profile.statistic,
        "data-label-unit": unit,
        "data-divisor": model.divisor, "data-ceiling": model.ceiling,
        ...(model.scaleTransform ? { "data-scale-transform": model.scaleTransform } : {}),
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
      label(`${compare ? personLabel + " · " : ""}${offscale ? "↑ " : ""}${pointNumber(labelValue)} ${unit}`, resultTop, "#b51e33", 700, "result");
      label(`${medianLabel} ≈${pointNumber(labelReference, referenceDigits)} ${unit}`, medianTop, "#365b66", 550, "median");
      group.append(dot);
      model.a11y = a11y;
    }
    // A measurement can be plotted on an existing concentration axis without
    // supplying a population reference. Keep it out of the comparison model:
    // no synthetic profile, median, connector or reference metadata is created.
    function drawResultOnlyDot(group, model, { W, mobile, left, right, top, bottom, px, y, period }) {
      const conversions = data.patientPointData.unitConversions[model.policy.analyte];
      const enteredUnit = patientContext.displayUnit || patientContext.measurement.unit;
      const factor = Object.prototype.hasOwnProperty.call(conversions.factors, enteredUnit)
        ? conversions.factors[enteredUnit] : null;
      const labelFactor = Number.isFinite(factor) && factor > 0 ? factor : 1;
      const unit = Number.isFinite(factor) && factor > 0 ? enteredUnit : model.unit;
      const labelValue = model.value / labelFactor;
      const offscale = model.value > period.scale.max;
      const py = offscale ? top + 5 : y(period.valueFraction(model.value));
      const a11y = (offscale ? "Wynik powyżej skali; strzałka nie oznacza dokładnego położenia stężenia. " : "") +
        `Wynik pacjentki: ${pointNumber(labelValue)} ${unit}. ` + model.policy.patientNote +
        " Czerwony punkt oznacza wynik, nie jego klasyfikację.";
      const dot = el("g", {
        "data-patient-concentration": model.policy.analyte, "data-result-only": "true",
        "data-result-only-policy": model.policy.id, "data-value": model.value,
        "data-label-unit": unit, "data-divisor": period.scale.max, "data-ceiling": 1,
        "data-scale-transform": period.scale.kind, "data-plot-top": top, "data-plot-bottom": bottom,
        "data-age-lower": patientAgeYears, "data-age-upper": patientContext.ageUpperYears ?? patientAgeYears,
        ...(offscale ? { "data-offscale": "above" } : {}),
        role: "img", "aria-label": a11y, class: "vhl-patient-point",
      });
      dot.append(el("title", {}, a11y));
      if (offscale) dot.append(el("path", {
        d: `M${px},${top + 16}V${top + 2}M${px - 5},${top + 7}L${px},${top + 2}L${px + 5},${top + 7}`,
        fill: "none", stroke: "#d52d43", "stroke-width": 2.5,
        "stroke-linecap": "round", "stroke-linejoin": "round", "data-result-overflow": "above",
      }));
      else dot.append(el("circle", { cx: px, cy: py, r: 11, fill: "#d52d43", opacity: 0.12 }),
        el("circle", { cx: px, cy: py, r: mobile ? 6.5 : 7, fill: "#d52d43",
          stroke: "white", "stroke-width": 2.5, "data-result-point": "" }));
      const message = `${offscale ? "↑ " : ""}${pointNumber(labelValue)} ${unit}`;
      const context = document.createElement("canvas").getContext("2d"), font = mobile ? 11 : 12;
      if (context) context.font = `700 ${font}px system-ui, sans-serif`;
      const measured = context ? context.measureText(message).width : message.length * font * 0.6;
      const width = Math.min(W - left - right, measured + 16);
      const xx = Math.max(left, Math.min(W - right - width,
        px + 13 + width > W - right ? px - width - 13 : px + 13));
      const yy = Math.max(top + 3, Math.min(bottom - 25, py - 27));
      const label = el("g", { "data-dot-label": "result" });
      label.append(el("rect", { x: xx, y: yy, width, height: 23, rx: 6,
        fill: "white", "fill-opacity": 0.96, stroke: "#f1cbd0" }),
      text(xx + 8, yy + 16, message, { "font-size": font, "font-weight": 700, fill: "#b51e33",
        ...(measured > width - 16 ? { textLength: width - 16, lengthAdjust: "spacingAndGlyphs" } : {}),
      }));
      dot.append(label);
      group.append(dot);
      renderedResultOnlyPoint = { ...model, a11y, offscale };
    }
    function pointDescription(model) {
      if (!model) return;
      renderedPoint = model;
      const name = hormones().find((h) => h.id === model.id).name;
      const groupMean = model.profile.statistic === "group-mean";
      panel.querySelector(".vhl-axis-label").textContent = name + (groupMean
        ? ` · grupa ${model.profile.ageGroup.label}` : model.stableDisplay ? " · wynik na tle badań" : " · wynik na tle mediany");
      const groupLabel = groupMean || model.profile.statistic === "group-median"
        ? ` grupy ${model.profile.ageGroup.label}` +
          (model.profile.requiredGonadalStage != null ? `, Tanner ${model.profile.requiredGonadalStage}` : "")
        : "";
      byId("scale-note").textContent = (model.stableDisplay
        ? `Kropka: wynik. Jasny znacznik: ${groupMean ? "średnia grupy" : "odniesienie z badania"}. Linia jest poglądowa.`
        : `Kropka: wynik. Linia: ${groupMean ? "średnia" : "mediana"}${groupLabel}, nie granica normy.`) +
        (patientPointAboveScale(model) ? " ↑ Wynik powyżej skali." : "") +
        (compare ? " Obie płcie we wspólnej skali stężeń." : "") +
        (patientContext.ageUpperYears > patientAgeYears ? " Pozycja wieku przybliżona." : "");
      byId("scale-note").setAttribute("data-current-source", model.profile.id);
      byId("chart-desc").textContent = model.a11y +
        " Wynik i źródłowa wartość odniesienia używają tej samej skali stężeń. " +
        (model.stableDisplay
          ? "Linia jest syntezą badań z wygładzonymi przejściami, a nie jedną medianą populacji. Przejścia nie wyznaczają wartości odniesienia pacjenta. " : "") +
        (compare ? "Obie płcie są pokazane w tej samej jednostce i skali; źródła mogą stosować różne metody oznaczenia."
          : "Pozostałe hormony zachowują własne skale poglądowe. Nie porównujemy liczbowo wysokości różnych hormonów.");
    }
    function updateGonadotropinPresentation() {
      if (femaleGonadotropinsActive()) {
        byId("comparison-note").hidden = true;
        return;
      }
      const visible = stableGonadotropinVisible();
      byId("comparison-note").hidden = !visible;
      if (!visible) return;
      const model = renderedPoint;
      if (model && (model.id === "lh" || model.id === "fsh")) {
        const basis = model.profile.statistic === "group-mean" ? "średnia grupy"
          : model.profile.statistic === "group-median" ? "mediana grupy" : "mediana badania";
        const offscale = model.value / model.divisor > model.ceiling;
        byId("scale-note").textContent = (offscale ? "Strzałka: wynik ponad skalą." : "Kropka: wynik.") +
          " Jasny znacznik: " + basis + "." +
          (patientContext.ageUpperYears > patientAgeYears ? " Pozycja wieku przybliżona." : "");
      } else if (!model && !(patientContext?.measurement && patientPoint?.status === "unavailable") &&
          !ordinaryPointOutsideView()) {
        // The persistent LH/FSH note already explains the separate scales.
        // Keep a qualification error or another analyte's point caption visible.
        panel.querySelector(".vhl-chart-caption").hidden = true;
      }
    }
    function updateSourcePointNote() {
      const model = renderedPoint, note = model?.profile.patientNote;
      if (!note) return;
      const caption = byId("scale-note");
      const basis = model.profile.statistic === "group-median" ? "mediana grupy"
        : model.profile.statistic === "group-mean" ? "średnia grupy" : "mediana";
      let detail = note;
      if (model.profile.referenceGroupLabel) {
        const enteredUnit = patientContext?.displayUnit || patientContext?.measurement?.unit;
        const conversions = data.patientPointData.unitConversions[model.id];
        const factor = conversions?.unit === model.profile.unit &&
          Object.prototype.hasOwnProperty.call(conversions.factors || {}, enteredUnit)
          ? conversions.factors[enteredUnit] : null;
        const matchingUnit = Number.isFinite(factor) && factor > 0;
        detail = `Mediana grupy ${model.profile.referenceGroupLabel}: ${pointNumber(model.referenceValue / (matchingUnit ? factor : 1), 3)} ${matchingUnit ? enteredUnit : model.profile.unit}. ` + note;
      }
      if (femaleGonadotropinsActive()) caption.textContent += " " + detail;
      else caption.textContent = (model.profile.referenceGroupLabel ? "Kropka: wynik. "
        : "Kropka: wynik; jasny znacznik: " + basis + ". ") + detail +
        " Linia jest poglądowa." +
        (patientPointAboveScale(model) ? " ↑ Wynik powyżej skali." : "") +
        (patientContext.ageUpperYears > patientAgeYears ? " Pozycja wieku przybliżona." : "");
      caption.setAttribute("data-current-source", model.profile.id);
    }
    function explainUnavailablePoint() {
      if (amhInfantComparisonActive() || inhibinComparisonActive() || gonadotropinComparisonActive()) return;
      if (femaleGonadotropinsActive() && view === "mini" && ["lh", "fsh"].includes(analyteHormones[currentAnalyte])) return;
      if (renderedObservation?.patientPoint?.status === "ready") return;
      const measurement = patientContext?.measurement;
      const id = analyteHormones[currentAnalyte];
      const [minAge, maxAge] = visibleAgeDomain();
      if (renderedResultOnlyPoint) return;
      if (resultOnlyVisible() && view === "puberty" &&
          (patientAgeYears < minAge || patientAgeYears > maxAge)) {
        const message = `Wiek pacjentki jest poza wybranym okresem (${fmt(minAge)}–${fmt(maxAge)} lat). Sam wynik zobaczysz w „Całym życiu”, bez mediany.`;
        byId("scale-note").textContent = message;
        byId("chart-desc").textContent += " " + message;
        return;
      }
      const termAmhUnavailable = !compare && id === "amh" && patientPoint?.reason === "preterm-context";
      if (renderedPoint || (!canShowAgeMarker() && !termAmhUnavailable) ||
          ((compare || termAmhUnavailable) && (patientAgeYears < minAge || patientAgeYears > maxAge)) ||
          (compare ? compareHormone !== id : !selected.has(id)) ||
          !measurement || !Number.isFinite(measurement.value) || measurement.value < 0 ||
          (measurement.operator != null && measurement.operator !== "" && measurement.operator !== "=")) return;
      if (ordinaryPointOutsideView()) {
        const period = view === "mini"
          ? `${fmt(minAge * 12)}–${fmt(maxAge * 12)} mies.`
          : `${fmt(minAge)}–${fmt(maxAge)} lat`;
        const message = `Wiek pacjenta jest poza wybranym okresem (${period}). Wynik i odniesienie zobaczysz w „Całym życiu”.`;
        byId("scale-note").textContent = message;
        byId("chart-desc").textContent += " " + message;
        return;
      }
      if (termAmhUnavailable) {
        byId("scale-note").textContent = "Te dane dotyczą niemowląt urodzonych o czasie; brak dopasowanego odniesienia dla wyniku.";
        return;
      }
      if (compare && ["missing-puberty-stage", "incompatible-puberty-stage"].includes(patientPoint?.reason)) {
        byId("scale-note").textContent = "Porównanie poglądowe — brak dopasowanych wartości odniesienia obu płci do umieszczenia wyniku.";
        return;
      }
      const messages = {
        "unsupported-age": "Dla tego wieku brak wartości odniesienia pozwalającej nanieść wynik.",
        "ambiguous-age": "Podany przedział wieku wykracza poza dostępny profil odniesienia.",
        "ambiguous-profile": "Brak jednoznacznie dopasowanej wartości odniesienia do naniesienia wyniku.",
        "reference-unavailable": "W tym wieku źródło nie pozwala wiarygodnie nanieść wyniku.",
        "incompatible-specimen": "Wartość odniesienia nie dotyczy materiału tej próbki.",
        "incompatible-assay": "Brak wartości odniesienia dla potwierdzonej metody tej próbki.",
        "incompatible-reproductive-context": "Brak odrębnego odniesienia dla ciąży lub okresu po menopauzie.",
        "unsupported-unit": "W tej jednostce nie można nanieść wyniku na wykres.",
        "contraindicated": "Dla tego kontekstu badania nie nanosimy wyniku na wykres populacyjny.",
        "missing-puberty-stage": "To odniesienie dotyczy dzieci przed pokwitaniem. Uzupełnij stadium w danych pacjenta.",
        "incompatible-puberty-stage": "Dostępne odniesienie wymaga zgodnej oceny przed pokwitaniem (Tanner 1).",
      };
      const adultTestosterone = id === "t" && sex === "male" && patientAgeYears >= 18;
      const adultMessages = {
        "unsupported-age": "Dla tego wieku brak wartości odniesienia pozwalającej nanieść wynik.",
        "ambiguous-age": "Podany przedział wieku obejmuje różne grupy odniesienia.",
        "ambiguous-profile": "Brak jednoznacznej wartości odniesienia do naniesienia wyniku.",
        "incompatible-specimen": "Wartość odniesienia nie dotyczy materiału tej próbki.",
        "incompatible-assay": "Brak wartości odniesienia dla potwierdzonej metody tej próbki.",
        "unsupported-unit": "W tej jednostce nie można nanieść wyniku na wykres.",
        "contraindicated": "Dla tego kontekstu badania nie nanosimy wyniku na wykres populacyjny.",
      };
      const femaleSource = sex === "female" && ["amh", "inhb"].includes(id) && patientAgeYears >= 1;
      const femaleMessages = {
        "ambiguous-age": "Podany przedział wieku obejmuje granicę źródeł lub grup wieku — nie wybieramy jednej mediany.",
        "unsupported-age": "Dla tego wieku nie udostępniono mediany źródłowej. Linia pokazuje ogólny przebieg zmian.",
      };
      const reason = resultOnlyPoint?.reason || patientPoint?.reason;
      const typedGroups = id === "e2" && sex === "female" && Array.isArray(data.patientPointData?.profiles)
        ? data.patientPointData.profiles.filter((profile) => profile.analyte === id && profile.sex === sex &&
          profile.referenceGroupLabel && profile.requiredGonadalStage != null) : [];
      const stageMessage = typedGroups.length === 1 &&
        ["missing-puberty-stage", "incompatible-puberty-stage"].includes(reason)
        ? `Mediana grupy ${typedGroups[0].referenceGroupLabel} wymaga aktualnego Th${typedGroups[0].requiredGonadalStage} tej samej pacjentki. P i ogólny numer Tannera go nie zastępują.` : null;
      const message = stageMessage || (femaleSource && femaleMessages[reason]) ||
        (adultTestosterone && adultMessages[reason]) || messages[reason];
      if (message) byId("scale-note").textContent = (femaleGonadotropinsActive()
        ? byId("scale-note").textContent + " " : "") + message +
        (femaleSource && patientPoint?.reason === "unsupported-age" ? "" : " Krzywe pozostają poglądowe.");
    }

    function clearFemalePeriodMetadata() {
      for (const key of ["femaleGonadotropinView", "periodProfile", "periodUnit", "periodCeiling",
        "periodMin", "periodMax", "scaleTransform"]) delete svg.dataset[key];
      for (const key of ["cycleSource", "cycleUnit", "cycleDomain", "cycleCeiling"])
        delete byId("cycle-chart").dataset[key];
    }
    function renderFemaleGonadotropins() {
      const period = femaleGonadotropins[view], life = view === "life", mini = view === "mini";
      const W = svg.clientWidth || 1040, mobile = W < 640;
      const H = chartHeight(mobile ? 350 : 415), left = mobile ? 36 : 52, right = mobile ? 13 : 25;
      const top = 48, bottom = H - 42, width = W - left - right, height = bottom - top;
      const x = (age) => left + period.xFraction(age) * width;
      const y = (value) => bottom - period.valueFraction(value) * height;
      const relativeY = (value) => bottom - value * height;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("height", H);
      Object.assign(svg.dataset, {
        femaleGonadotropinView: view, periodProfile: femaleGonadotropins.policy.id + "-" + view,
        periodUnit: period.scale.unit || "relative",
        periodCeiling: period.scale.max, periodMin: period.domain.minAge,
        periodMax: period.domain.maxAge, scaleTransform: period.scale.kind,
      });
      stageNav.hidden = !life;
      stageNav.classList.toggle("vhl-compact", mobile);
      stageNav.querySelectorAll("button").forEach((b) =>
        b.setAttribute("aria-pressed", String(Number(b.dataset.stage) === activeStage)));
      const g = el("g", { "data-female-gonadotropin-plot": view,
        "data-plot-left": left, "data-plot-right": W - right,
        "data-plot-top": top, "data-plot-bottom": bottom });
      svg.append(g);
      const backgrounds = life ? femaleStages : [{
        min: period.domain.minAge, max: period.domain.maxAge, color: mini ? "#eaf5f2" : "#edf4f9",
      }];
      for (const [i, stage] of backgrounds.entries()) g.append(el("rect", {
        x: x(stage.min), y: top, width: x(stage.max) - x(stage.min), height,
        fill: stage.color, "data-period-background": view,
        "data-sector": life ? i : view, "data-active": String(life && i === activeStage),
      }));
      if (life && activeStage !== null) {
        const stage = femaleStages[activeStage];
        g.append(el("rect", { x: x(stage.min) + 0.8, y: top - 3,
          width: x(stage.max) - x(stage.min) - 1.6, height: height + 6, rx: 5,
          fill: "#dcefeb", stroke: "#228c91", "stroke-width": 1.6,
          "pointer-events": "none", "data-sector-highlight": activeStage }));
      }
      for (const tick of period.scale.ticks) {
        g.append(el("line", { x1: left, x2: W - right, y1: y(tick), y2: y(tick),
          stroke: "#cddfe3", "stroke-width": 0.8, "stroke-dasharray": tick === 0 ? "0" : "3 5" }),
        text(left - 7, y(tick) + 4, mini ? Math.round(tick * 100) + "%" : fmt(tick), {
          "text-anchor": "end", "font-size": mobile ? 9 : 11,
          "data-period-y-tick": tick, fill: "#54757e" }));
      }
      if (!mini) g.append(text(left - 7, top - 14, "IU/L", {
        "text-anchor": "end", "font-size": mobile ? 9 : 10, "font-weight": 600 }));
      const startAge = Math.min(...period.curves.map((curve) => curve.points[0].ageYears));
      const ticks = life ? (mobile ? [0, 1, 10, 20, 45, 75] : [0, 1, 10, 20, 45, 55, 75])
        : mini ? (mobile ? [0, 3, 6, 9, 12] : [0, 1, 3, 6, 9, 12]) : [6, 8, 10, 12, 14, 16];
      for (const [i, tick] of ticks.entries()) {
        const firstDays = (life || mini) && i === 0;
        const age = firstDays ? startAge : mini ? tick / 12 : tick;
        if (life && i > 0 && i < ticks.length - 1) g.append(el("line", {
          x1: x(age), x2: x(age), y1: top, y2: bottom, stroke: "#d5e3e7", "stroke-dasharray": "3 5",
        }));
        g.append(el("line", { x1: x(age), x2: x(age), y1: bottom, y2: bottom + 5, stroke: "#b7ced5" }),
        text(x(age), bottom + 23, firstDays ? (mini ? "~6 dni" : "1–5 dni")
          : String(tick) + (i === ticks.length - 1 ? mini ? " mies." : " lat" : ""), {
          "text-anchor": i === 0 ? "start" : i === ticks.length - 1 ? "end" : "middle",
          "font-size": mobile ? 9.5 : 11, "data-period-x-tick": tick,
          ...(firstDays ? { "data-birth-measurement": "false" } : {}),
        }));
      }
      // Source/drawing models are built once. Selection, result and viewport
      // change visibility and coordinates only, never the underlying trajectory.
      for (const curve of period.curves) {
        if (!selected.has(curve.id)) continue;
        const h = femaleDefinitions.find((h) => h.id === curve.id);
        const path = curve.points.map((point, i) =>
          `${i ? "L" : "M"}${x(point.ageYears)},${y(point.value)}`).join(" ");
        g.append(el("path", { d: path, fill: "none", stroke: h.color,
          "stroke-width": mobile ? 3 : 3.5, "stroke-linecap": "round", "stroke-linejoin": "round",
          "data-line": h.id, "data-period-hormone": h.id, "data-period-statistic": curve.statistic,
          "data-source-min": curve.points[0].ageYears,
          "data-source-max": curve.points[curve.points.length - 1].ageYears,
        }));
      }
      const currentId = analyteHormones[currentAnalyte];
      const gonadotropinResult = currentId === "lh" || currentId === "fsh";
      const dotModel = mini && gonadotropinResult ? null : patientDotModel();
      // Other hormones keep their own existing scale in a mixed selection.
      // No IU/L tick is assigned to AMH, estradiol or inhibin B.
      for (const h of femaleHormones.filter((h) => selected.has(h.id) && h.id !== "lh" && h.id !== "fsh")) {
        if (h.id === "amh" && femaleAmhStable) {
          for (const segment of h.segments) {
            const d = femaleAmhReferencePath(segment, left, width, relativeY, period.xFraction,
              [period.domain.minAge, period.domain.maxAge]);
            if (!d) continue;
            const schematic = segment.kind === "schematic";
            g.append(el("path", { d, fill: "none", stroke: h.color, "stroke-width": mobile ? 3 : 3.5,
              "stroke-linecap": "round", "stroke-linejoin": "round",
              "stroke-dasharray": schematic ? "5 5" : "none",
              [schematic ? "data-illustrative-line" : "data-line"]: h.id,
              "data-independent-scale": h.id, "data-female-stable-line": h.id,
              "data-segment-kind": segment.kind,
              "data-divisor": femaleAmhStable.display.divisor, "data-ceiling": 1,
              "data-plot-left": left, "data-plot-right": left + width,
              "data-plot-top": top, "data-plot-bottom": bottom,
              "data-age-from": segment.points[0].ageYears,
              "data-age-to": segment.points[segment.points.length - 1].ageYears,
            }));
          }
          continue;
        }
        if (h.id === "e2" && femaleE2Stable) {
          for (const segment of h.segments) {
            const d = femaleE2ReferencePath(segment, left, width, relativeY, period.xFraction,
              [period.domain.minAge, period.domain.maxAge]);
            if (!d) continue;
            const schematic = segment.kind === "schematic";
            g.append(el("path", { d, fill: "none", stroke: h.color, "stroke-width": mobile ? 3 : 3.5,
              "stroke-linecap": "round", "stroke-linejoin": "round",
              "stroke-dasharray": schematic ? "5 5" : "none",
              [schematic ? "data-illustrative-line" : "data-line"]: h.id,
              "data-independent-scale": h.id, "data-female-stable-line": h.id,
              "data-segment-kind": segment.kind,
              "data-divisor": femaleE2Stable.display.divisor, "data-ceiling": 1,
              "data-plot-left": left, "data-plot-right": left + width,
              "data-plot-top": top, "data-plot-bottom": bottom,
              "data-age-from": segment.points[0].ageYears,
              "data-age-to": segment.points[segment.points.length - 1].ageYears,
            }));
          }
          continue;
        }
        if (h.id === "inhb" && femaleInhibinStable) {
          for (const segment of h.segments) {
            const d = femaleInhibinReferencePath(segment, left, width, relativeY, period.xFraction,
              [period.domain.minAge, period.domain.maxAge]);
            if (!d) continue;
            const schematic = segment.kind === "schematic";
            g.append(el("path", { d, fill: "none", stroke: h.color, "stroke-width": mobile ? 3 : 3.5,
              "stroke-linecap": "round", "stroke-linejoin": "round",
              "stroke-dasharray": schematic ? "5 5" : "none",
              [schematic ? "data-illustrative-line" : "data-line"]: h.id,
              "data-independent-scale": h.id, "data-female-stable-line": h.id,
              "data-segment-kind": segment.kind,
              "data-divisor": femaleInhibinStable.display.divisor, "data-ceiling": 1,
              "data-plot-left": left, "data-plot-right": left + width,
              "data-plot-top": top, "data-plot-bottom": bottom,
              "data-age-from": segment.points[0].ageYears,
              "data-age-to": segment.points[segment.points.length - 1].ageYears,
            }));
          }
          continue;
        }
        if (dotModel?.id === h.id) {
          drawReferenceCurves(g, dotModel, { x, y: relativeY, mobile });
          continue;
        }
        const fullSpline = displaySpline(h, femaleGonadotropins.life.xFraction);
        const infantAt = interpolator(h.miniAges, h.miniValues);
        for (const segment of mini ? [{ points: h.miniAges.map((ageYears) => ({ ageYears })) }] : h.segments) {
          const min = Math.max(period.domain.minAge, segment.points[0].ageYears);
          const max = Math.min(period.domain.maxAge, segment.points[segment.points.length - 1].ageYears);
          if (max <= min) continue;
          const points = Array.from({ length: 801 }, (_, i) => {
            const age = min + (max - min) * i / 800;
            return [x(age), relativeY(mini ? infantAt(age) : fullSpline.at(femaleGonadotropins.life.xFraction(age)).value)];
          });
          g.append(el("path", { d: points.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" "),
            fill: "none", stroke: h.color, "stroke-width": mobile ? 3 : 3.5,
            "stroke-linecap": "round", "stroke-linejoin": "round",
            "stroke-dasharray": segment.kind === "schematic" ? "5 5" : "none",
            "data-line": h.id, "data-independent-scale": h.id }));
        }
      }
      if (canShowAgeMarker() && patientAgeYears >= period.domain.minAge && patientAgeYears <= period.domain.maxAge) {
        drawAgeMarker(g, { W, mobile, left, right, top, bottom, px: x(patientAgeYears) });
        if (dotModel) {
          if (gonadotropinResult) {
            dotModel.divisor = period.scale.max;
            dotModel.ceiling = 1;
            dotModel.valueFraction = period.valueFraction;
            dotModel.scaleTransform = period.scale.kind;
            dotModel.stableDisplay = { kind: "female-gonadotropins", divisor: period.scale.max, ceiling: 1 };
          }
          drawPatientDot(g, dotModel, { W, mobile, left, right, top, bottom,
            px: x(patientAgeYears), y: relativeY });
          renderedPoint = dotModel;
        }
        if (life && resultOnlyVisible()) drawResultOnlyDot(g, resultOnlyPoint, {
          W, mobile, left, right, top, bottom, px: x(patientAgeYears), y: relativeY, period,
        });
      }
      const gonadotropinsSelected = selected.has("lh") || selected.has("fsh");
      panel.querySelector(".vhl-axis-label").textContent = mini ? "Przebieg zmian · minipuberty"
        : gonadotropinsSelected ? life ? "LH i FSH · przebieg przez życie" : "LH i FSH · dojrzewanie" : "Przebieg zmian";
      let caption = mini
        ? "100% oznacza własny szczyt LH lub FSH w minipuberty. Wysokości LH i FSH nie porównują stężeń."
        : life ? "Wspólna skala LH i FSH. Wysokie stężenia są skompresowane, aby uwidocznić wcześniejsze etapy."
          : "Wspólna, liniowa skala 0–8 IU/L — inna niż w widoku całego życia.";
      if ([...selected].some((id) => id !== "lh" && id !== "fsh")) caption += mini
        ? " Pozostałe hormony zachowują własne skale."
        : " Oś IU/L dotyczy LH i FSH; pozostałe hormony mają własne skale.";
      if (renderedPoint) caption += " Kropka: wynik; jasny znacznik: odniesienie z badania." +
        (((renderedPoint.stableDisplay?.kind === "female-amh-life" || renderedPoint.stableDisplay?.kind === "female-e2-life" ||
          renderedPoint.stableDisplay?.kind === "female-inhibin-life") ? patientPointAboveScale(renderedPoint)
          : renderedPoint.stableDisplay && renderedPoint.value > period.scale.max) ? " ↑ Wynik powyżej skali." : "");
      if (renderedResultOnlyPoint) caption += " Kropka: wynik. " + renderedResultOnlyPoint.policy.patientNote +
        (renderedResultOnlyPoint.offscale ? " ↑ Wynik powyżej skali." : "") +
        (patientContext.ageUpperYears > patientAgeYears ? " Pozycja wieku przybliżona." : "");
      const measurement = patientContext?.measurement;
      if (mini && gonadotropinResult && selected.has(currentId) && measurement &&
        Number.isFinite(measurement.value) && measurement.value >= 0 && typeof measurement.unit === "string") {
        const operators = { "<": "<", "<=": "≤", "≤": "≤", ">": ">", ">=": "≥", "≥": "≥", "=": "" };
        const operator = operators[measurement.operator || "="];
        if (operator !== undefined) caption += ` Wynik ${currentId.toUpperCase()}: ${operator}${pointNumber(measurement.value)} ${measurement.unit}. Na tej osi zaznaczamy tylko wiek.`;
      }
      byId("scale-note").textContent = caption;
      byId("chart-title").textContent = !gonadotropinsSelected ? "Poglądowy przebieg wybranych hormonów u dziewczynek i kobiet"
        : mini ? "LH i FSH u dziewczynek — dwie fale w modelu badania COPENHAGEN"
        : life ? "LH i FSH u kobiet — poglądowy przebieg życia" : "Mediany LH i FSH według wieku 6–16 lat";
      byId("chart-desc").textContent = (mini
        ? "Przybliżony odczyt ryciny 3 Ljubicic 2022: średnie modelowane podłużnie względem własnego maksimum. To nie mediana ani norma; pion zaznacza wiek, nie stężenie. "
        : life ? "Oś LH i FSH jest wspólna i nieliniowa w IU/L. Linie łączą różne badania, nie są jedną medianą populacyjną. Pierwsza grupa obejmuje dni 1–5, nie chwilę porodu. Przejście menopauzalne jest umowne. "
          : "Madsen 2022: niezależny model median 6–16 lat, nie dosłowny wycinek całego życia. Wiek nie wyznacza stadium pokwitania. ") +
        caption + (renderedPoint ? " " + renderedPoint.a11y : "") +
        (renderedResultOnlyPoint ? " " + renderedResultOnlyPoint.a11y : "");
    }
    function updateFemaleGonadotropinInsight() {
      const messages = [
        ["Minipuberty", "LH wzrasta w pierwszych tygodniach. U dziewczynek przeważa FSH, którego podwyższone stężenia utrzymują się dłużej."],
        ["Dzieciństwo · względne wyciszenie", "LH pozostaje bardzo niskie. FSH nie musi spadać do zera."],
        ["Pokwitanie · ponowna aktywacja", "LH i FSH narastają. Zbliżenie „Pokwitanie” pokazuje mediany według wieku."],
        ["Dorosłość · rytm cyklu", "Gładka linia przez lata nie oznacza stałego stężenia. W obrębie cyklu pojawia się wyraźny szczyt LH."],
        ["Przejście menopauzalne", "FSH i LH wzrastają, ale moment i przebieg zmian są indywidualne. Granice wieku na schemacie są umowne."],
        ["Po menopauzie", "FSH zwykle przewyższa LH. Przebieg w późnym wieku różni się między badaniami i nie jest uniwersalną prognozą."],
      ];
      const gonadotropinsSelected = selected.has("lh") || selected.has("fsh");
      const other = selected.size === 1 ? femaleHormones.find((h) => selected.has(h.id)) : null;
      const message = !selected.size ? ["Wybierz hormon", "Kliknij nazwę hormonu nad wykresem."]
        : !gonadotropinsSelected ? [other ? other.name : "Przebieg zmian", other ? other.copy : "Pozostałe hormony zachowują własne skale."]
        : view === "mini" ? [selected.has("lh") ? "LH — mniejsza druga fala" : "FSH — dwie fale w badaniu",
          "Po wczesnym szczycie model ponownie narasta w 3.–4. miesiącu, z maksimum około 5.–6. miesiąca. To przebieg z jednego badania, nie harmonogram dla każdej dziewczynki."]
          : view === "puberty" ? ["Wzrost w okresie dojrzewania", "Mediany z badania dziewcząt 6–16 lat. Wiek nie określa stadium Tannera ani fazy cyklu."]
            : activeStage === null ? ["Od minipuberty do menopauzy", "Wczesna aktywność, względne wyciszenie dzieciństwa, wzrost w pokwitaniu i zmiany okołomenopauzalne. Linia jest poglądowa."]
              : messages[activeStage];
      byId("insight-title").textContent = message[0];
      byId("insight-text").textContent = message[1];
      const cycle = view === "life" && activeStage === 3 && (selected.has("lh") || selected.has("fsh"));
      byId("cycle-panel").hidden = !cycle;
      panel.querySelector(".vhl-insight").classList.toggle("vhl-cycle-open", cycle);
      if (cycle) renderFemaleGonadotropinCycle();
      const observations = opts.observations || root.VildaHormoneLifespanObservations;
      const stage = activeStage === null ? null : stages()[activeStage];
      const activeStageKind = stage?.min === 0 ? "mini"
        : stage?.min === 10 && stage?.max === 20 ? "puberty" : null;
      // Selecting LH/FSH must not remove the separate inhibin-B evidence inset.
      const mayShowObservations = observations && data.inhibinEvidence && selected.has("inhb");
      panel.querySelector(".vhl-insight").classList.toggle("vhl-cycle-open", cycle || Boolean(mayShowObservations));
      renderedObservation = mayShowObservations ? observations.render(observationsHost, data.inhibinEvidence, {
        ...patientContext, view, sex, preterm, compare, selected: [...selected], compareHormone, activeStageKind,
      }) : null;
      if (!renderedObservation) {
        observationsHost.hidden = true;
        observationsHost.replaceChildren();
      }
      panel.querySelector(".vhl-insight").classList.toggle("vhl-cycle-open", cycle || Boolean(renderedObservation));
    }
    function renderFemaleGonadotropinCycle() {
      const chart = byId("cycle-chart"), cycle = femaleGonadotropins.cycle;
      const active = cycle.curves.filter((curve) => selected.has(curve.id));
      const W = chart.clientWidth || 800, mobile = W < 560, H = mobile ? 204 : 228;
      const left = mobile ? 34 : 42, right = mobile ? 12 : 20, top = 39, bottom = H - 38;
      const x = (day) => left + cycle.xFraction(day) * (W - left - right);
      const y = (value) => bottom - cycle.valueFraction(value) * (bottom - top);
      chart.setAttribute("viewBox", `0 0 ${W} ${H}`);
      chart.setAttribute("height", H);
      Object.assign(chart.dataset, { cycleSource: "stricker2006", cycleUnit: "IU/L", cycleDomain: "-15,14", cycleCeiling: cycle.scale.max });
      byId("cycle-title").textContent = active.map((curve) => curve.id.toUpperCase()).join(" i ") + " w cyklu miesiączkowym";
      byId("cycle-desc").textContent = "Dzienne mediany 20 zdrowych kobiet w wieku 20–36 lat, Abbott ARCHITECT. LH i FSH na wspólnej osi 0–50 IU/L. Dni −15 do +14 względem indywidualnego szczytu LH (0), nie przewidywanie owulacji pacjentki.";
      panel.querySelector(".vhl-cycle-note").textContent = "Dni względem szczytu LH (0). To nie jest stały dzień cyklu.";
      chart.querySelectorAll(":scope > g").forEach((node) => node.remove());
      const g = el("g", { "data-cycle-content": "paired-daily-medians",
        "data-plot-left": left, "data-plot-right": W - right, "data-plot-top": top, "data-plot-bottom": bottom });
      chart.append(g);
      for (const tick of cycle.scale.ticks) g.append(
        el("line", { x1: left, x2: W - right, y1: y(tick), y2: y(tick), stroke: "#d7e4e7", "stroke-dasharray": tick === 0 ? "0" : "3 5" }),
        text(left - 7, y(tick) + 3.5, String(tick), { "text-anchor": "end", "font-size": mobile ? 9.5 : 10.5 }));
      g.append(text(left, top - 19, "IU/L", { "font-size": 10.5, "font-weight": 600 }),
        el("line", { x1: x(0), x2: x(0), y1: top, y2: bottom, stroke: "#aebfc6", "stroke-dasharray": "3 5" }));
      active.forEach((curve, index) => {
        const h = femaleDefinitions.find((h) => h.id === curve.id);
        g.append(el("path", { d: curve.points.map((p, i) => `${i ? "L" : "M"}${x(p.day)},${y(p.value)}`).join(" "),
          fill: "none", stroke: h.color, "stroke-width": mobile ? 2.8 : 3.1,
          "stroke-linecap": "round", "stroke-linejoin": "round", "data-cycle-curve": h.id,
          "data-cycle-statistic": "published-daily-median" }));
        const legendX = W - right - (active.length - index) * 62;
        g.append(el("line", { x1: legendX, x2: legendX + 16, y1: top - 22, y2: top - 22, stroke: h.color, "stroke-width": 3 }),
          text(legendX + 23, top - 18, h.name, { fill: h.color, "font-size": 11, "font-weight": 650 }));
      });
      for (const day of mobile ? [-15, -5, 0, 5, 14] : [-15, -10, -5, 0, 5, 10, 14]) g.append(
        el("line", { x1: x(day), x2: x(day), y1: bottom, y2: bottom + 4, stroke: "#bfcfd4" }),
        text(x(day), bottom + 19, day < 0 ? `−${Math.abs(day)}` : day > 0 ? `+${day}` : "0", {
          "text-anchor": day === -15 ? "start" : day === 14 ? "end" : "middle", "font-size": mobile ? 10 : 11 }));
    }
    function appendGroupReferenceSource(paragraph, addLink) {
      const profile = renderedPoint?.profile;
      if (!profile?.referenceGroupLabel) return;
      paragraph([profile.sourceLabel, profile.ageGroup?.label, profile.method, profile.population]
        .filter(Boolean).join(" · ") + ".");
      if (profile.ageGroup?.n) paragraph(`Liczebność pełnej grupy źródłowej: ${profile.ageGroup.n}.`);
      for (const limitation of profile.limitations || []) paragraph(limitation);
      if (profile.url) addLink(profile.sourceLabel, profile.url);
    }
    function updateFemaleGonadotropinSources() {
      const resultPolicy = resultOnlyVisible() ? resultOnlyPoint.policy : null;
      const nextKey = JSON.stringify(["female-gonadotropins", view, [...selected].sort(), renderedPoint?.profile.id,
        resultPolicy?.id, renderedObservation?.kind]);
      if (sourcesKey === nextKey) return;
      sourcesKey = nextKey;
      const target = byId("source-copy"), period = femaleGonadotropins[view];
      target.replaceChildren();
      const paragraph = (copy) => {
        const p = document.createElement("p");
        p.textContent = copy;
        target.append(p);
      };
      for (const copy of period.caveats || []) paragraph(copy);
      if (selected.has("inhb")) paragraph("Inhibina B zachowuje tę samą linię i stałą skalę po wpisaniu wyniku oraz po zmianie okresu. Zbliżenie pokazuje fragment tego samego przebiegu. Jasny znacznik zachowuje źródłową medianę, także gdy nie leży dokładnie na linii. Most dzieciństwa i końcowy spadek po 47. roku są poglądowe; nie stanowią nowych odniesień liczbowych.");
      if (selected.has("e2")) paragraph("Estradiol zachowuje tę samą linię i stałą skalę po wpisaniu wyniku oraz po zmianie okresu. Zbliżenie pokazuje fragment tego samego przebiegu. W niemowlęctwie linia przedstawia medianę modelu GAMLSS, a nie dwie fale średniej podłużnej z ryciny 3. Dorosłe plateau jest poglądowe; osobny schemat cyklu pokazuje zmienność w jego obrębie. Jasny znacznik zachowuje źródłową medianę, także gdy nie leży dokładnie na linii.");
      if (selected.has("amh")) paragraph("AMH zachowuje własną stałą skalę i tę samą poglądową linię, także po wpisaniu wyniku oraz po zmianie okresu. Zbliżenie pokazuje fragment tego samego przebiegu. Końcówka pierwszego roku przechodzi łagodnie w poglądowy odcinek dzieciństwa. Jasny znacznik AMH zachowuje medianę źródłową także wtedy, gdy nie leży na linii.");
      if (view === "life") for (const copy of femaleGonadotropins.cycle.caveats || []) paragraph(copy);
      paragraph(view === "mini"
        ? "LH i FSH podzielono osobno przez własne maksimum modelowanej średniej podłużnej. 100% nie oznacza konkretnego stężenia ani mediany GAMLSS. Nie przeliczamy tego modelu na IU/L. Pierwszy odczyt pochodzi z około 6. dnia, a końce linii z około 357.–360. dnia; nie dopisujemy pomiaru w chwili narodzin ani przy 12 miesiącach. Wynik LH/FSH pozostaje tekstem, a pion zaznacza tylko wiek."
        : renderedResultOnlyPoint
          ? "Kropka przedstawia wyłącznie wpisany wynik, bez mediany, łącznika ani klasyfikacji na podstawie poglądowej linii. Strzałka zachowuje rzeczywistą liczbę ponad stałą skalą."
          : "Kropka oznacza wynik, a jasny znacznik źródłowe odniesienie oryginalnego silnika aplikacji. Wartość źródłowa może leżeć poza poglądową linią. Wysokość ilustracji nie zmienia median, norm laboratoryjnych ani interpretacji wyniku. Strzałka zachowuje rzeczywistą liczbę ponad stałą skalą.");
      if (resultPolicy) for (const copy of resultPolicy.discussion || []) paragraph(copy);
      if (view === "life") paragraph("Zbliżenie minipuberty ma odrębny, względny model średniej z badania podłużnego. Zbliżenie pokwitania przedstawia model median Madsen. Te różne statystyki nie są dosłownym wycinkiem syntezy całego życia. W wieku rozrodczym kliknij „Dorosła”, aby zobaczyć codzienne mediany LH i FSH względem szczytu LH, nie stałego dnia cyklu.");
      if (renderedPoint) {
        const profile = renderedPoint.profile;
        paragraph("Odniesienie wyniku: " + [profile.sourceLabel, profile.ageGroup?.label,
          profile.method, profile.population].filter(Boolean).join(" · ") + ".");
        if (renderedPoint.id === "inhb" && profile.statistic === "group-median") {
          if (profile.ageGroup?.description) paragraph(profile.ageGroup.description);
          if (profile.ageGroup?.n) paragraph(`Liczebność grupy źródłowej: ${profile.ageGroup.n}.`);
        }
      }
      if ([...selected].some((id) => id !== "lh" && id !== "fsh")) paragraph("Pozostałe wybrane hormony zachowują odrębne, dotychczasowe skale. Oś LH/FSH nie opisuje ich stężeń. Ewentualny wynik innego hormonu i jego źródłowe odniesienie stosują własną skalę i oryginalną jednostkę.");
      const links = [...(period.sources || []), ...(view === "life" ? femaleGonadotropins.cycle.sources || [] : [])];
      appendGroupReferenceSource(paragraph, (label, url) => links.push({ label, url }));
      if (resultPolicy) links.push(...(resultPolicy.sources || []));
      if ([...selected].some((id) => id !== "lh" && id !== "fsh")) {
        paragraph("Pozostałe hormony w minipuberty: mediany GAMLSS z suplementu Ljubicic 2022, około 7,3 dnia–1 rok, donoszone dziewczynki. To odrębna statystyka od dwufazowej średniej LH/FSH. Zachowują dotychczasową normalizację całego życia.");
        links.push({ label: "Ljubicic 2022 · mediany pozostałych hormonów", url: infant.source.url },
          { label: "Suplement GAMLSS · CC BY 4.0", url: "https://doi.org/10.6084/m9.figshare.19469555.v1" });
        if (view !== "mini" && selected.has("amh")) {
          paragraph("Linia AMH po niemowlęctwie opiera się na osoczowych medianach grup wieku Jopling 2018 i FDA K170524, Access AMH. Dorosły punkt odniesienia korzysta z osobnej tabeli surowicy FDA; nie przeliczamy materiałów. Grupy pediatryczne są niewielkie i szpitalne, dorosłe wybrano według regularnych cykli i płodności. Niemowlęctwo dotyczy surowicy; nie przeliczamy materiałów. Połączenia i końcowy spadek po 45 latach są poglądowe, bez nowych stężeń i wieku biologicznego maksimum.");
          links.push({ label: "Jopling 2018 · AMH", url: "https://doi.org/10.1002/edm2.21" },
            { label: "FDA · Access AMH", url: "https://www.accessdata.fda.gov/cdrh_docs/pdf17/K170524.pdf" },
            { label: "Sowers 2008 · przejście menopauzalne", url: "https://doi.org/10.1210/jc.2008-0567" });
        }
        if (view !== "mini" && selected.has("inhb")) {
          paragraph("Inhibina B po niemowlęctwie: orientacyjny odczyt mediany z ryciny 1 Borelli-Kjær 2025 (około ±2 pg/mL), Gen II ELISA. Most 1–5,6 roku jest poglądowy, w źródle brak obserwacji 1,08–5,6 roku. Dorosła grupa liczyła 149 kobiet, bez standaryzacji fazy cyklu. Końcowy niski przebieg nie nadaje stężeń poniżej granicy wykrywalności.");
          links.push({ label: "Borelli-Kjær 2025 · inhibina B", url: "https://doi.org/10.1210/clinem/dgae439" });
        }
        if (view !== "mini" && selected.has("e2")) {
          paragraph("Estradiol: mediany Madsen 2022 w pokwitaniu, LC-MS/MS. Dorosłe plateau zachowuje poglądową wysokość końca pokwitania, nie jest średnią całego cyklu. Niski stan po menopauzie wspiera ogólna mediana Cui 2026, ale rysunek nie określa indywidualnego spadku ani wieku menopauzy.");
          links.push({ label: "Madsen 2022 · estradiol", url: "https://doi.org/10.1210/clinem/dgac155" },
            { label: "Suplement LMS · CC BY 4.0", url: "https://doi.org/10.6084/m9.figshare.17153336.v1" },
            { label: "Cui 2026 · po menopauzie", url: "https://pubmed.ncbi.nlm.nih.gov/42120349/" });
        }
      }
      if (renderedObservation?.source) {
        const source = renderedObservation.source;
        paragraph([source.label, source.method, source.specimen].filter(Boolean).join(" · ") + ".");
        for (const limitation of source.limitations || []) paragraph(limitation);
        if (source.url) links.push({ label: source.label, url: source.url });
      }
      if (renderedPoint?.profile.url) links.push({ label: renderedPoint.profile.sourceLabel || "Odniesienie wyniku", url: renderedPoint.profile.url });
      const group = document.createElement("div");
      group.className = "vhl-source-links";
      for (const source of links) {
        if (!/^https:\/\//.test(source.url)) continue;
        const link = document.createElement("a");
        link.href = source.url; link.textContent = source.label;
        link.target = "_blank"; link.rel = "noopener noreferrer";
        group.append(link);
      }
      target.append(group);
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
          const tail = (h.id === "t" || h.id === "amh" || h.id === "insl3" || gonadotropinDisplays.some((display) => display.id === h.id)) &&
            full && stable.display.illustrativeIntervals.find((part) => part.kind === "older-age-tail");
          if (tail) {
            const id = uid + h.id + "-illustrative-tail";
            const gradient = el("linearGradient", { id, gradientUnits: "userSpaceOnUse",
              x1: x(tail.minAge), x2: x(tail.maxAge), y1: 0, y2: 0,
              "data-illustrative-tail-from": tail.minAge });
            gradient.append(el("stop", { offset: "0%", "stop-color": h.color, "stop-opacity": 1 }),
              el("stop", { offset: "100%", "stop-color": h.color, "stop-opacity": 0.15 }));
            const defs = el("defs");
            defs.append(gradient);
            g.append(defs);
            style.stroke = `url(#${id})`;
          }
          g.append(el("path", { ...style, d: stableReferencePath(stable, left, pw, y),
            ...(h.dash ? { "stroke-dasharray": h.dash } : {}),
            "data-line": h.id, "data-stable-reference-line": h.id,
            "data-divisor": stable.display.divisor, "data-ceiling": stable.display.ceiling,
            "data-plot-top": top, "data-plot-bottom": bottom,
          }));
        } else if (sex === "female" && h.id === "amh" && femaleAmhStable) {
          for (const segment of h.segments) {
            const d = femaleAmhReferencePath(segment, left, pw, y);
            if (!d) continue;
            const schematic = segment.kind === "schematic";
            g.append(el("path", { ...style, d,
              "stroke-dasharray": schematic ? "5 5" : "none",
              [schematic ? "data-illustrative-line" : "data-line"]: h.id,
              "data-segment-kind": segment.kind, "data-female-stable-line": h.id,
              "data-divisor": femaleAmhStable.display.divisor, "data-ceiling": 1,
              "data-plot-left": left, "data-plot-right": left + pw,
              "data-plot-top": top, "data-plot-bottom": bottom,
              "data-age-from": segment.points[0].ageYears,
              "data-age-to": segment.points[segment.points.length - 1].ageYears,
            }));
          }
        } else if (sex === "female" && h.id === "e2" && femaleE2Stable) {
          for (const segment of h.segments) {
            const d = femaleE2ReferencePath(segment, left, pw, y);
            if (!d) continue;
            const schematic = segment.kind === "schematic";
            g.append(el("path", { ...style, d,
              "stroke-dasharray": schematic ? "5 5" : "none",
              [schematic ? "data-illustrative-line" : "data-line"]: h.id,
              "data-segment-kind": segment.kind, "data-female-stable-line": h.id,
              "data-divisor": femaleE2Stable.display.divisor, "data-ceiling": 1,
              "data-plot-left": left, "data-plot-right": left + pw,
              "data-plot-top": top, "data-plot-bottom": bottom,
              "data-age-from": segment.points[0].ageYears,
              "data-age-to": segment.points[segment.points.length - 1].ageYears,
            }));
          }
        } else if (sex === "female" && h.id === "inhb" && femaleInhibinStable) {
          for (const segment of h.segments) {
            const d = femaleInhibinReferencePath(segment, left, pw, y);
            if (!d) continue;
            const schematic = segment.kind === "schematic";
            g.append(el("path", { ...style, d,
              "stroke-dasharray": schematic ? "5 5" : "none",
              [schematic ? "data-illustrative-line" : "data-line"]: h.id,
              "data-segment-kind": segment.kind, "data-female-stable-line": h.id,
              "data-divisor": femaleInhibinStable.display.divisor, "data-ceiling": 1,
              "data-plot-left": left, "data-plot-right": left + pw,
              "data-plot-top": top, "data-plot-bottom": bottom,
              "data-age-from": segment.points[0].ageYears,
              "data-age-to": segment.points[segment.points.length - 1].ageYears,
            }));
          }
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
      const miniEndTicks = [];
      for (const [age, label] of ticks) {
        const px = x(age);
        const tick = el("line", {
            x1: px,
            x2: px,
            y1: bottom,
            y2: bottom + 5,
            stroke: "#bdcfd5",
          });
        const tickLabel = text(
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
          );
        g.append(tick, tickLabel);
        if (view === "mini" && (age === 0.75 || age === 1)) miniEndTicks.push({ tick, tickLabel });
      }
      // A narrow app card can be smaller than the viewport. Keep the 12-month
      // endpoint and omit the intermediate tick only when its text overlaps.
      if (miniEndTicks.length === 2) {
        const [nine, last] = miniEndTicks;
        if (nine.tickLabel.getBoundingClientRect().right + 5 > last.tickLabel.getBoundingClientRect().left) {
          nine.tick.remove();
          nine.tickLabel.remove();
        }
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
        byId("scale-note").textContent = "Przebieg poglądowy. Każdy hormon ma własną skalę.";
        byId("chart-desc").textContent += " Testosteron zachowuje stały przebieg i skalę. " +
          "Połączenie między niemowlęctwem a dzieciństwem, okres płodowy i dorosły łuk są poglądowe. Po 86 latach brak ilościowego odniesienia.";
      }
      if (stableAmhVisible()) {
        byId("scale-note").textContent = "Poglądowy przebieg na podstawie badań." +
          (selected.size > 1 ? " Każdy hormon ma własną skalę." : "");
        byId("chart-desc").textContent += " AMH zachowuje stały przebieg i skalę. " +
          "Połączenia grup wieku i badań są poglądowe, nie stanowią median konkretnego wieku ani stadiów Tannera. " +
          "Okres płodowy jest schematem. Wygaszony odcinek po 70 latach oznacza koniec danych, nie zatrzymanie biologicznego spadku.";
      }
      if (stableInsl3Visible()) {
        byId("scale-note").textContent = selected.size === 1
          ? "Poglądowy przebieg INSL3. Hormony mają odrębne skale."
          : "Przebieg poglądowy. Każdy hormon ma własną skalę.";
        byId("chart-desc").textContent += " INSL3: niewielki wzrost w pierwszych tygodniach, spadek w niemowlęctwie, wzrost pokwitaniowy i stopniowy spadek w dorosłości. " +
          "Wysokości są ilustracyjne, nie oznaczają stężeń. Odcinek po 80 latach jest wygaszonym przedłużeniem poglądowym.";
      }
      pointDescription(dotModel);
    }
    function renderAmhInfantComparison() {
      const model = amhInfantComparison;
      panel.querySelector(".vhl-axis-label").textContent = "AMH · stężenie";
      byId("scale-note").textContent = "Kolejne poziomy osi oznaczają 10× większe stężenie.";
      byId("chart-title").textContent = "AMH u dziewczynek i chłopców w pierwszym roku życia — wspólna skala stężenia";
      byId("chart-desc").textContent = "Stała oś logarytmiczna od 0,1 do 1000 ng/mL. " +
        "Linie przedstawiają mediany modeli niemowlęcych: różowa dziewczynki, niebieska przerywana chłopcy. " +
        "Linie od 0,02 roku do końca pierwszego roku. Wynik nie zmienia krzywych ani osi. To nie są granice normy.";
      if (!model) {
        renderedAmhComparison = { point: null, reason: "missing-comparison-data" };
        return;
      }
      const W = svg.clientWidth || 1040, mobile = W < 640;
      const H = chartHeight(mobile ? 350 : 403), left = mobile ? 43 : 60,
        right = mobile ? 14 : 28, top = mobile ? 60 : 64, bottom = H - 43;
      const width = W - left - right, height = bottom - top;
      const { min, max, unit, sourcePmolToNgMl } = model.scale;
      const logMin = Math.log10(min), logSpan = Math.log10(max) - logMin;
      const x = (age) => left + age * width;
      const y = (value) => bottom - (Math.log10(value) - logMin) / logSpan * height;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("height", H);
      svg.dataset.comparisonScale = "log10";
      svg.dataset.comparisonMin = min;
      svg.dataset.comparisonMax = max;
      const g = el("g", { "data-fixed-comparison": "amh" });
      svg.append(g);
      g.append(el("rect", { x: left, y: top, width, height, rx: 8, fill: "#f4f8f9" }));
      for (const value of model.scale.ticks) {
        const yy = y(value);
        g.append(el("line", { x1: left, x2: W - right, y1: yy, y2: yy,
          stroke: "#dce7ea", "stroke-width": 0.8, "stroke-dasharray": value === min ? "none" : "3 5" }),
        text(left - 7, yy + 3, pointNumber(value, 3), {
          "text-anchor": "end", "font-size": mobile ? 9.5 : 11,
          fill: "#5c7b85", "data-log-tick": value,
        }));
      }
      g.append(text(left - 7, top - 12, unit, {
        "text-anchor": "end", "font-size": mobile ? 9 : 10, fill: "#5c7b85",
      }));
      for (const tick of mobile ? [0, 3, 6, 9, 12] : [0, 1, 3, 6, 9, 12]) {
        const xx = x(tick / 12);
        g.append(el("line", { x1: xx, x2: xx, y1: bottom, y2: bottom + 5, stroke: "#bdcfd5" }),
          text(xx, bottom + 22, tick === 12 ? "12 mies." : String(tick), {
            "text-anchor": tick === 0 ? "start" : tick === 12 ? "end" : "middle",
            "font-size": mobile ? 10 : 11, "data-month-tick": tick,
          }));
      }
      // Test the actual card width, including the narrow embedded mobile form.
      const ninth = g.querySelector('[data-month-tick="9"]');
      const last = g.querySelector('[data-month-tick="12"]');
      if (ninth && ninth.getBoundingClientRect().right + 5 > last.getBoundingClientRect().left) {
        ninth.previousElementSibling.remove();
        ninth.remove();
      }
      for (const curve of model.curves) {
        // Points already sample the original source interpolation. Do not fit
        // another spline or normalize to a patient value or a sex-specific peak.
        const d = curve.points.map((point, index) =>
          (index ? "L" : "M") + x(point.ageYears).toFixed(4) + "," + y(point.value).toFixed(4)).join("");
        const common = { d, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };
        g.append(el("path", { ...common, stroke: "#fff", "stroke-width": mobile ? 6 : 7, "aria-hidden": "true" }),
          el("path", { ...common, stroke: curve.color, "stroke-width": mobile ? 3 : 3.7,
            "stroke-dasharray": curve.sex === "male" ? "9 6" : "none",
            "data-comparison-sex": curve.sex, "data-comparison-curve": "amh",
            "data-comparison-period": "mini", "data-profile": curve.profileId,
            "data-common-scale": "log10", "data-unit": unit,
          }));
      }
      if (canShowAgeMarker() && patientAgeYears >= 0 && patientAgeYears <= 1) {
        drawAgeMarker(g, { W, mobile, left, right, top, bottom,
          px: x(patientAgeYears), comparison: true });
      }
      let point = null, reason = null;
      if (analyteHormones[currentAnalyte] === "amh" && patientContext?.measurement) {
        const evaluated = patientPoint;
        const age = patientAgeYears, upper = patientContext.ageUpperYears ?? age;
        const maxAge = model.domain.maxAge;
        const exclusiveInfantEnd = upper === maxAge && patientContext.ageUpperInclusive === false && upper > age;
        if (!(age >= 0 && age < maxAge) || upper > maxAge || (upper === maxAge && !exclusiveInfantEnd))
          reason = "outside-infant-comparison";
        else if (evaluated?.status !== "ready") reason = evaluated?.reason || "reference-unavailable";
        else if (evaluated.profile.id !== model.profileIds[sex]) reason = "outside-infant-comparison";
        else point = { ...evaluated, valueNgMl: evaluated.value * sourcePmolToNgMl,
          referenceNgMl: evaluated.referenceValue * sourcePmolToNgMl };
      }
      // The qualified seven-day male point may precede the shared curves by
      // about 0.3 day. Its own source median never extends either curve domain.
      renderedAmhComparison = { point, reason };
      if (!point) return;
      const px = x(patientAgeYears), value = point.valueNgMl, median = point.referenceNgMl;
      const offscale = displayEngine.classifyAmhComparisonValue(model, value);
      const py = offscale === "below" ? bottom - 3 : offscale === "above" ? top + 3 : y(value);
      const my = y(median), person = sex === "female" ? "Dziewczynka" : "Chłopiec";
      const a11y = `${person}: ${pointNumber(value, 3)} ${unit}. Mediana dla wieku: około ${pointNumber(median, 3)} ${unit}.` +
        (offscale ? ` Wynik ${offscale === "above" ? "powyżej" : "poniżej"} osi; strzałka nie jest dokładną pozycją stężenia.` : "") +
        " Kolor nie klasyfikuje wyniku.";
      const dot = el("g", { class: "vhl-patient-point", "data-patient-concentration": "amh",
        "data-value": value, "data-reference-value": median, "data-median": median,
        "data-reference-statistic": point.profile.statistic, "data-profile": point.profile.id,
        "data-unit": unit, "data-age": patientAgeYears,
        "data-age-lower": patientAgeYears, "data-age-upper": patientContext.ageUpperYears ?? patientAgeYears,
        "data-plot-top": top, "data-plot-bottom": bottom, "data-log-min": min, "data-log-max": max,
        ...(offscale ? { "data-offscale": offscale } : {}), role: "img", "aria-label": a11y,
      });
      dot.append(el("title", {}, a11y), el("line", { x1: px, x2: px, y1: py, y2: my,
        stroke: "#8ba6ad", "stroke-width": 1.5, "stroke-dasharray": "3 4" }),
      el("circle", { cx: px, cy: my, r: 4.3, fill: "white", stroke: sex === "female" ? "#b15786" : "#2b7491",
        "stroke-width": 2, "data-median-point": "" }));
      if (offscale) {
        const tip = offscale === "above" ? top + 2 : bottom - 2;
        const base = offscale === "above" ? tip + 15 : tip - 15;
        const head = offscale === "above" ? tip + 5 : tip - 5;
        dot.append(el("path", { d: `M${px},${base}V${tip}M${px - 5},${head}L${px},${tip}L${px + 5},${head}`,
          fill: "none", stroke: "#d52d43", "stroke-width": 2.5, "stroke-linecap": "round",
          "stroke-linejoin": "round", "data-result-overflow": offscale }));
      } else {
        dot.append(el("circle", { cx: px, cy: py, r: 11, fill: "#d52d43", opacity: 0.12 }),
          el("circle", { cx: px, cy: py, r: mobile ? 6.5 : 7, fill: "#d52d43",
            stroke: "white", "stroke-width": 2.5, "data-result-point": "" }));
      }
      const font = mobile ? 10.5 : 12, canvas = document.createElement("canvas"), context = canvas.getContext("2d");
      const label = (message, yy, color, kind) => {
        if (context) context.font = `600 ${font}px system-ui`;
        const measured = context ? context.measureText(message).width : message.length * font * 0.6;
        const labelWidth = Math.min(width, measured + 16);
        let xx = px + 13;
        if (xx + labelWidth > W - right) xx = px - labelWidth - 13;
        xx = Math.max(left, Math.min(W - right - labelWidth, xx));
        const box = el("g", { "data-dot-label": kind });
        box.append(el("rect", { x: xx, y: yy, width: labelWidth, height: 23, rx: 6,
          fill: "white", "fill-opacity": 0.97, stroke: kind === "result" ? "#f1cbd0" : "#dce7e9" }),
        text(xx + 8, yy + 16, message, { "font-size": font, "font-weight": kind === "result" ? 700 : 550, fill: color,
          ...(measured > labelWidth - 16 ? { textLength: labelWidth - 16, lengthAdjust: "spacingAndGlyphs" } : {}),
        }));
        dot.append(box);
      };
      const limit = (position) => Math.max(top + 3, Math.min(bottom - 26, position));
      let resultY = limit(py - 28), medianY = limit(my + 8);
      if (py > my) {
        medianY = limit(my - 28); resultY = limit(py + 8);
        if (resultY - medianY < 28) { medianY = limit(resultY - 28); resultY = limit(medianY + 28); }
      } else if (medianY - resultY < 28) { resultY = limit(medianY - 28); medianY = limit(resultY + 28); }
      label(`${offscale === "above" ? "↑ " : offscale === "below" ? "↓ " : ""}${pointNumber(value, 3)} ${unit}`, resultY, "#b51e33", "result");
      label(`Mediana ≈${pointNumber(median, 3)} ${unit}`, medianY, "#365b66", "median");
      g.append(dot);
      byId("scale-note").dataset.currentSource = point.profile.id;
      byId("chart-desc").textContent += " " + a11y;
    }
    function amhComparisonInsight() {
      const { point, reason } = renderedAmhComparison || {};
      if (point) return ["Wynik na tle mediany", "Czerwony punkt: wynik. Jasny znacznik: mediana z badania." +
        (displayEngine.classifyAmhComparisonValue(amhInfantComparison, point.valueNgMl) ? " Strzałka oznacza wynik poza osią." : "")];
      const messages = {
        "outside-infant-comparison": "Porównanie dotyczy okresu przed 1. urodzinami.",
        "preterm-context": "Te dane dotyczą niemowląt urodzonych o czasie; brak dopasowanego odniesienia dla wyniku.",
        "censored-result": "Wynik z oznaczeniem „<” lub „>” nie otrzymuje dokładnego punktu.",
        "ambiguous-age": "Podany wiek obejmuje różne zakresy odniesienia.",
        "missing-age": "Uzupełnij wiek, aby umieścić wynik.",
        "incompatible-assay": "Dla tej metody nie nanosimy punktu na te mediany.",
        "incompatible-specimen": "Materiał próbki nie odpowiada źródłu porównania.",
        "contraindicated": "Ten kontekst nie pozwala umieścić wyniku na krzywej.",
        "unsupported-age": "Dla podanego wieku nie ma odpowiedniego odniesienia.",
        "invalid-value": "Wpisz prawidłową wartość wyniku.",
        "missing-comparison-data": "Brak danych do wyświetlenia porównania.",
      };
      return ["AMH · minipuberty", reason ? messages[reason] || "Brak dopasowanego odniesienia dla punktu pacjenta."
        : "Mediany z badań niemowląt urodzonych o czasie. U chłopców stężenie jest znacznie wyższe."];
    }
    function renderInhibinComparison() {
      const model = inhibinComparisons[view], puberty = view === "puberty";
      panel.querySelector(".vhl-axis-label").textContent = "Inhibina B · stężenie";
      byId("scale-note").textContent = "Obie płcie we wspólnej skali stężenia.";
      byId("chart-title").textContent = "Inhibina B u dziewczynek i chłopców " +
        (puberty ? "w pokwitaniu" : "w pierwszym roku życia") + " — wspólna skala stężenia";
      byId("chart-desc").textContent = "Stała oś liniowa od 0 do 400 pg/mL. " +
        "Linie przedstawiają mediany modeli wieku: różowa dziewczynki, niebieska przerywana chłopcy. " +
        (puberty ? "Linie od 8 do 20 lat; wiek nie ustala stadium Tannera. " : "Linie od 0,02 roku do końca pierwszego roku. ") +
        "Wynik nie zmienia krzywych ani osi. To nie są granice normy.";
      if (!model) {
        renderedInhibinComparison = { point: null, reason: "missing-comparison-data" };
        return;
      }
      const W = svg.clientWidth || 1040, mobile = W < 640;
      const H = chartHeight(mobile ? 350 : 403), left = mobile ? 43 : 60,
        right = mobile ? 14 : 28, top = mobile ? 60 : 64, bottom = H - 43;
      const width = W - left - right, height = bottom - top;
      const { min, max, unit, sourceToPgMl } = model.scale;
      const minAge = puberty ? model.domain.minAge : 0, maxAge = model.domain.maxAge;
      const x = (age) => left + (age - minAge) / (maxAge - minAge) * width;
      const y = (value) => bottom - (value - min) / (max - min) * height;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("height", H);
      svg.dataset.comparisonScale = "linear";
      svg.dataset.comparisonMin = min;
      svg.dataset.comparisonMax = max;
      const g = el("g", { "data-fixed-comparison": "inhb" });
      svg.append(g);
      g.append(el("rect", { x: left, y: top, width, height, rx: 8, fill: "#f4f8f9" }));
      for (const value of model.scale.ticks) {
        const yy = y(value);
        g.append(el("line", { x1: left, x2: W - right, y1: yy, y2: yy,
          stroke: "#dce7ea", "stroke-width": 0.8, "stroke-dasharray": value === min ? "none" : "3 5" }),
        text(left - 7, yy + 3, pointNumber(value, 3), {
          "text-anchor": "end", "font-size": mobile ? 9.5 : 11,
          fill: "#5c7b85", "data-linear-tick": value,
        }));
      }
      g.append(text(left - 7, top - 12, unit, {
        "text-anchor": "end", "font-size": mobile ? 9 : 10, fill: "#5c7b85",
      }));
      const ticks = puberty ? (mobile ? [8, 12, 16, 20] : [8, 10, 12, 14, 16, 18, 20])
        : mobile ? [0, 3, 6, 9, 12] : [0, 1, 3, 6, 9, 12];
      for (const tick of ticks) {
        const xx = x(puberty ? tick : tick / 12), lastTick = tick === ticks[ticks.length - 1];
        g.append(el("line", { x1: xx, x2: xx, y1: bottom, y2: bottom + 5, stroke: "#bdcfd5" }),
          text(xx, bottom + 22, lastTick ? (puberty ? "20 lat" : "12 mies.") : String(tick), {
            "text-anchor": tick === ticks[0] ? "start" : lastTick ? "end" : "middle",
            "font-size": mobile ? 10 : 11, [puberty ? "data-year-tick" : "data-month-tick"]: tick,
          }));
      }
      // Test the actual card width, including the narrow embedded mobile form.
      const trailingTick = g.querySelector(puberty ? '[data-year-tick="18"]' : '[data-month-tick="9"]');
      const last = g.querySelector(puberty ? '[data-year-tick="20"]' : '[data-month-tick="12"]');
      if (trailingTick && trailingTick.getBoundingClientRect().right + 5 > last.getBoundingClientRect().left) {
        trailingTick.previousElementSibling.remove();
        trailingTick.remove();
      }
      for (const curve of model.curves) {
        // Points already sample the original source interpolation. Do not fit
        // another spline or normalize to a patient value or a sex-specific peak.
        const d = curve.points.map((point, index) =>
          (index ? "L" : "M") + x(point.ageYears).toFixed(4) + "," + y(point.value).toFixed(4)).join("");
        const common = { d, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };
        g.append(el("path", { ...common, stroke: "#fff", "stroke-width": mobile ? 6 : 7, "aria-hidden": "true" }),
          el("path", { ...common, stroke: curve.color, "stroke-width": mobile ? 3 : 3.7,
            "stroke-dasharray": curve.sex === "male" ? "9 6" : "none",
            "data-comparison-sex": curve.sex, "data-comparison-curve": "inhb",
            "data-comparison-period": view, "data-profile": curve.profileId, "data-reference-line": "inhb",
            "data-common-scale": "linear", "data-unit": unit,
          }));
      }
      if (canShowAgeMarker() && patientAgeYears >= minAge && patientAgeYears <= maxAge) {
        drawAgeMarker(g, { W, mobile, left, right, top, bottom,
          px: x(patientAgeYears), comparison: true });
      }
      let point = null, reason = null;
      if (analyteHormones[currentAnalyte] === "inhb" && patientContext?.measurement) {
        // The scoped reference data adds a female puberty profile only for
        // this comparison. Ordinary views keep the original patientPoint.
        const evaluated = pointEngine()?.evaluate(model.referenceData, patientContext);
        const age = patientAgeYears, upper = patientContext.ageUpperYears ?? age;
        const exclusiveInfantEnd = upper === maxAge && patientContext.ageUpperInclusive === false && upper > age;
        const outside = puberty ? !(age >= minAge && age <= maxAge) || upper > maxAge
          : !(age >= 0 && age < maxAge) || upper > maxAge || (upper === maxAge && !exclusiveInfantEnd);
        const outsideReason = puberty ? "outside-puberty-comparison" : "outside-infant-comparison";
        if (outside) reason = outsideReason;
        else if (evaluated?.status !== "ready") reason = evaluated?.reason || "reference-unavailable";
        else if (evaluated.profile.id !== model.profileIds[sex]) reason = outsideReason;
        else point = { ...evaluated, valuePgMl: evaluated.value * sourceToPgMl,
          referencePgMl: evaluated.referenceValue * sourceToPgMl };
      }
      // The qualified seven-day male point may precede the shared curves by
      // about 0.3 day. Its own source median never extends either curve domain.
      renderedInhibinComparison = { point, reason };
      if (!point) return;
      const px = x(patientAgeYears), value = point.valuePgMl, median = point.referencePgMl;
      const offscale = displayEngine.classifyInhibinComparisonValue(model, value);
      const py = offscale === "below" ? bottom - 3 : offscale === "above" ? top + 3 : y(value);
      const my = y(median), person = sex === "female" ? "Dziewczynka" : "Chłopiec";
      const a11y = `${person}: ${pointNumber(value, 3)} ${unit}. Mediana dla wieku: około ${pointNumber(median, 3)} ${unit}.` +
        (offscale ? ` Wynik ${offscale === "above" ? "powyżej" : "poniżej"} osi; strzałka nie jest dokładną pozycją stężenia.` : "") +
        " Kolor nie klasyfikuje wyniku.";
      const dot = el("g", { class: "vhl-patient-point", "data-patient-concentration": "inhb",
        "data-value": value, "data-reference-value": median, "data-median": median,
        "data-reference-statistic": point.profile.statistic, "data-profile": point.profile.id,
        "data-unit": unit, "data-age": patientAgeYears,
        "data-age-lower": patientAgeYears, "data-age-upper": patientContext.ageUpperYears ?? patientAgeYears,
        "data-plot-top": top, "data-plot-bottom": bottom, "data-scale-min": min, "data-scale-max": max,
        ...(offscale ? { "data-offscale": offscale } : {}), role: "img", "aria-label": a11y,
      });
      dot.append(el("title", {}, a11y), el("line", { x1: px, x2: px, y1: py, y2: my,
        stroke: "#8ba6ad", "stroke-width": 1.5, "stroke-dasharray": "3 4" }),
      el("circle", { cx: px, cy: my, r: 4.3, fill: "white", stroke: sex === "female" ? "#b15786" : "#2b7491",
        "stroke-width": 2, "data-median-point": "" }));
      if (offscale) {
        const tip = offscale === "above" ? top + 2 : bottom - 2;
        const base = offscale === "above" ? tip + 15 : tip - 15;
        const head = offscale === "above" ? tip + 5 : tip - 5;
        dot.append(el("path", { d: `M${px},${base}V${tip}M${px - 5},${head}L${px},${tip}L${px + 5},${head}`,
          fill: "none", stroke: "#d52d43", "stroke-width": 2.5, "stroke-linecap": "round",
          "stroke-linejoin": "round", "data-result-overflow": offscale }));
      } else {
        dot.append(el("circle", { cx: px, cy: py, r: 11, fill: "#d52d43", opacity: 0.12 }),
          el("circle", { cx: px, cy: py, r: mobile ? 6.5 : 7, fill: "#d52d43",
            stroke: "white", "stroke-width": 2.5, "data-result-point": "" }));
      }
      const font = mobile ? 10.5 : 12, canvas = document.createElement("canvas"), context = canvas.getContext("2d");
      const label = (message, yy, color, kind) => {
        if (context) context.font = `600 ${font}px system-ui`;
        const measured = context ? context.measureText(message).width : message.length * font * 0.6;
        const labelWidth = Math.min(width, measured + 16);
        let xx = px + 13;
        if (xx + labelWidth > W - right) xx = px - labelWidth - 13;
        xx = Math.max(left, Math.min(W - right - labelWidth, xx));
        const box = el("g", { "data-dot-label": kind });
        box.append(el("rect", { x: xx, y: yy, width: labelWidth, height: 23, rx: 6,
          fill: "white", "fill-opacity": 0.97, stroke: kind === "result" ? "#f1cbd0" : "#dce7e9" }),
        text(xx + 8, yy + 16, message, { "font-size": font, "font-weight": kind === "result" ? 700 : 550, fill: color,
          ...(measured > labelWidth - 16 ? { textLength: labelWidth - 16, lengthAdjust: "spacingAndGlyphs" } : {}),
        }));
        dot.append(box);
      };
      const limit = (position) => Math.max(top + 3, Math.min(bottom - 26, position));
      let resultY = limit(py - 28), medianY = limit(my + 8);
      if (py > my) {
        medianY = limit(my - 28); resultY = limit(py + 8);
        if (resultY - medianY < 28) { medianY = limit(resultY - 28); resultY = limit(medianY + 28); }
      } else if (medianY - resultY < 28) { resultY = limit(medianY - 28); medianY = limit(resultY + 28); }
      label(`${offscale === "above" ? "↑ " : offscale === "below" ? "↓ " : ""}${pointNumber(value, 3)} ${unit}`, resultY, "#b51e33", "result");
      label(`Mediana ≈${pointNumber(median, 3)} ${unit}`, medianY, "#365b66", "median");
      g.append(dot);
      byId("scale-note").dataset.currentSource = point.profile.id;
      byId("chart-desc").textContent += " " + a11y;
    }
    function inhibinComparisonInsight() {
      const { point, reason } = renderedInhibinComparison || {};
      if (point) return ["Wynik na tle mediany", "Czerwony punkt: wynik. Jasny znacznik: mediana z badania." +
        (displayEngine.classifyInhibinComparisonValue(inhibinComparisons[view], point.valuePgMl) ? " Strzałka oznacza wynik poza osią." : "")];
      const messages = {
        "outside-infant-comparison": "Porównanie dotyczy okresu przed 1. urodzinami.",
        "outside-puberty-comparison": "Porównanie dotyczy wieku od 8 do 20 lat.",
        "preterm-context": "Te dane dotyczą niemowląt urodzonych o czasie; brak dopasowanego odniesienia dla wyniku.",
        "censored-result": "Wynik z oznaczeniem „<” lub „>” nie otrzymuje dokładnego punktu.",
        "ambiguous-age": "Podany wiek obejmuje różne zakresy odniesienia.",
        "missing-age": "Uzupełnij wiek, aby umieścić wynik.",
        "incompatible-assay": "Dla tej metody nie nanosimy punktu na te mediany.",
        "incompatible-specimen": "Materiał próbki nie odpowiada źródłu porównania.",
        "contraindicated": "Ten kontekst nie pozwala umieścić wyniku na krzywej.",
        "unsupported-age": "Dla podanego wieku nie ma odpowiedniego odniesienia.",
        "invalid-value": "Wpisz prawidłową wartość wyniku.",
        "missing-comparison-data": "Brak danych do wyświetlenia porównania.",
      };
      return [view === "puberty" ? "Inhibina B · pokwitanie" : "Inhibina B · minipuberty",
        reason ? messages[reason] || "Brak dopasowanego odniesienia dla punktu pacjenta."
          : view === "puberty" ? "Mediany według wieku. Wykres nie ustala stadium pokwitania."
            : "Mediany z badań niemowląt urodzonych o czasie. U chłopców stężenie jest znacznie wyższe."];
    }
    function renderGonadotropinComparison() {
      const model = gonadotropinComparisons[view][compareHormone], puberty = view === "puberty", name = compareHormone.toUpperCase();
      panel.querySelector(".vhl-axis-label").textContent = name + " · stężenie";
      byId("scale-note").textContent = "Mediany stężeń · wspólna skala IU/L";
      byId("chart-title").textContent = name + " u dziewczynek i chłopców " +
        (puberty ? "w pokwitaniu" : "w pierwszym roku życia") + " — wspólna skala stężenia";
      byId("chart-desc").textContent = `Stała oś liniowa od 0 do ${puberty ? 8 : 6} IU/L. ` +
        "Linie przedstawiają mediany modeli wieku: różowa dziewczynki, niebieska przerywana chłopcy. " +
        (puberty ? "Linie od 6 do 16 lat; wiek nie ustala stadium Tannera. " : "Linie od 0,02 roku do końca pierwszego roku. ") +
        "Wynik nie zmienia krzywych ani osi. To nie są granice normy.";
      if (!model) {
        renderedGonadotropinComparison = { point: null, reason: "missing-comparison-data" };
        return;
      }
      const W = svg.clientWidth || 1040, mobile = W < 640;
      const H = chartHeight(mobile ? 350 : 403), left = mobile ? 43 : 60,
        right = mobile ? 14 : 28, top = mobile ? 60 : 64, bottom = H - 43;
      const width = W - left - right, height = bottom - top;
      const { min, max, unit, sourceToIU } = model.scale;
      const minAge = puberty ? model.domain.minAge : 0, maxAge = model.domain.maxAge;
      const x = (age) => left + (age - minAge) / (maxAge - minAge) * width;
      const y = (value) => bottom - (value - min) / (max - min) * height;
      svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
      svg.setAttribute("height", H);
      svg.dataset.comparisonScale = "linear";
      svg.dataset.comparisonMin = min;
      svg.dataset.comparisonMax = max;
      const g = el("g", { "data-fixed-comparison": compareHormone });
      svg.append(g);
      g.append(el("rect", { x: left, y: top, width, height, rx: 8, fill: "#f4f8f9" }));
      for (const value of model.scale.ticks) {
        const yy = y(value);
        g.append(el("line", { x1: left, x2: W - right, y1: yy, y2: yy,
          stroke: "#dce7ea", "stroke-width": 0.8, "stroke-dasharray": value === min ? "none" : "3 5" }),
        text(left - 7, yy + 3, pointNumber(value), {
          "text-anchor": "end", "font-size": mobile ? 9.5 : 11,
          fill: "#5c7b85", "data-linear-tick": value,
        }));
      }
      g.append(text(left - 7, top - 12, unit, {
        "text-anchor": "end", "font-size": mobile ? 9 : 10, fill: "#5c7b85",
      }));
      const ticks = puberty ? (mobile ? [6, 10, 14, 16] : [6, 8, 10, 12, 14, 16])
        : mobile ? [0, 3, 6, 9, 12] : [0, 1, 3, 6, 9, 12];
      for (const tick of ticks) {
        const xx = x(puberty ? tick : tick / 12), lastTick = tick === ticks[ticks.length - 1];
        g.append(el("line", { x1: xx, x2: xx, y1: bottom, y2: bottom + 5, stroke: "#bdcfd5" }),
          text(xx, bottom + 22, lastTick ? (puberty ? "16 lat" : "12 mies.") : String(tick), {
            "text-anchor": tick === ticks[0] ? "start" : lastTick ? "end" : "middle",
            "font-size": mobile ? 10 : 11, [puberty ? "data-year-tick" : "data-month-tick"]: tick,
          }));
      }
      // Test the actual card width, including the narrow embedded mobile form.
      const trailingTick = g.querySelector(puberty ? '[data-year-tick="14"]' : '[data-month-tick="9"]');
      const last = g.querySelector(puberty ? '[data-year-tick="16"]' : '[data-month-tick="12"]');
      if (trailingTick && trailingTick.getBoundingClientRect().right + 5 > last.getBoundingClientRect().left) {
        trailingTick.previousElementSibling.remove();
        trailingTick.remove();
      }
      for (const curve of model.curves) {
        // Points already sample the original source interpolation. Do not fit
        // another spline or normalize to a patient value or a sex-specific peak.
        const d = curve.points.map((point, index) =>
          (index ? "L" : "M") + x(point.ageYears).toFixed(4) + "," + y(point.value).toFixed(4)).join("");
        const common = { d, fill: "none", "stroke-linecap": "round", "stroke-linejoin": "round" };
        g.append(el("path", { ...common, stroke: "#fff", "stroke-width": mobile ? 6 : 7, "aria-hidden": "true" }),
          el("path", { ...common, stroke: curve.color, "stroke-width": mobile ? 3 : 3.7,
            "stroke-dasharray": curve.sex === "male" ? "9 6" : "none",
            "data-comparison-sex": curve.sex, "data-comparison-curve": compareHormone,
            "data-comparison-period": view, "data-profile": curve.profileId, "data-reference-line": compareHormone,
            "data-common-scale": "linear", "data-unit": unit,
          }));
      }
      if (canShowAgeMarker() && patientAgeYears >= minAge && patientAgeYears <= maxAge) {
        drawAgeMarker(g, { W, mobile, left, right, top, bottom,
          px: x(patientAgeYears), comparison: true });
      }
      let point = null, reason = null;
      if (analyteHormones[currentAnalyte] === compareHormone && patientContext?.measurement) {
        // The scoped reference data adds a female puberty profile only for
        // this comparison. Ordinary views keep the original patientPoint.
        const evaluated = pointEngine()?.evaluate(model.referenceData, patientContext);
        const age = patientAgeYears, upper = patientContext.ageUpperYears ?? age;
        const exclusiveInfantEnd = upper === maxAge && patientContext.ageUpperInclusive === false && upper > age;
        const outside = puberty ? !(age >= minAge && age <= maxAge) || upper > maxAge
          : !(age >= 0 && age < maxAge) || upper > maxAge || (upper === maxAge && !exclusiveInfantEnd);
        const outsideReason = puberty ? "outside-puberty-comparison" : "outside-infant-comparison";
        if (outside) reason = outsideReason;
        else if (evaluated?.status !== "ready") reason = evaluated?.reason || "reference-unavailable";
        else if (evaluated.profile.id !== model.profileIds[sex]) reason = outsideReason;
        else point = { ...evaluated, valueIU: evaluated.value * sourceToIU,
          referenceIU: evaluated.referenceValue * sourceToIU };
      }
      // The qualified seven-day male point may precede the shared curves by
      // about 0.3 day. Its own source median never extends either curve domain.
      renderedGonadotropinComparison = { point, reason };
      if (!point) return;
      const px = x(patientAgeYears), value = point.valueIU, median = point.referenceIU;
      const offscale = displayEngine.classifyInhibinComparisonValue(model, value);
      const py = offscale === "below" ? bottom - 3 : offscale === "above" ? top + 3 : y(value);
      const my = y(median), person = sex === "female" ? "Dziewczynka" : "Chłopiec";
      const a11y = `${person}: ${pointNumber(value)} ${unit}. Mediana dla wieku: około ${pointNumber(median, 3)} ${unit}.` +
        (offscale ? ` Wynik ${offscale === "above" ? "powyżej" : "poniżej"} osi; strzałka nie jest dokładną pozycją stężenia.` : "") +
        " Kolor nie klasyfikuje wyniku.";
      const dot = el("g", { class: "vhl-patient-point", "data-patient-concentration": compareHormone,
        "data-value": value, "data-reference-value": median, "data-median": median,
        "data-reference-statistic": point.profile.statistic, "data-profile": point.profile.id,
        "data-unit": unit, "data-age": patientAgeYears,
        "data-age-lower": patientAgeYears, "data-age-upper": patientContext.ageUpperYears ?? patientAgeYears,
        "data-plot-top": top, "data-plot-bottom": bottom, "data-scale-min": min, "data-scale-max": max,
        ...(offscale ? { "data-offscale": offscale } : {}), role: "img", "aria-label": a11y,
      });
      dot.append(el("title", {}, a11y), el("line", { x1: px, x2: px, y1: py, y2: my,
        stroke: "#8ba6ad", "stroke-width": 1.5, "stroke-dasharray": "3 4" }),
      el("circle", { cx: px, cy: my, r: 4.3, fill: "white", stroke: sex === "female" ? "#b15786" : "#2b7491",
        "stroke-width": 2, "data-median-point": "" }));
      if (offscale) {
        const tip = offscale === "above" ? top + 2 : bottom - 2;
        const base = offscale === "above" ? tip + 15 : tip - 15;
        const head = offscale === "above" ? tip + 5 : tip - 5;
        dot.append(el("path", { d: `M${px},${base}V${tip}M${px - 5},${head}L${px},${tip}L${px + 5},${head}`,
          fill: "none", stroke: "#d52d43", "stroke-width": 2.5, "stroke-linecap": "round",
          "stroke-linejoin": "round", "data-result-overflow": offscale }));
      } else {
        dot.append(el("circle", { cx: px, cy: py, r: 11, fill: "#d52d43", opacity: 0.12 }),
          el("circle", { cx: px, cy: py, r: mobile ? 6.5 : 7, fill: "#d52d43",
            stroke: "white", "stroke-width": 2.5, "data-result-point": "" }));
      }
      const font = mobile ? 10.5 : 12, canvas = document.createElement("canvas"), context = canvas.getContext("2d");
      const label = (message, yy, color, kind) => {
        if (context) context.font = `600 ${font}px system-ui`;
        const measured = context ? context.measureText(message).width : message.length * font * 0.6;
        const labelWidth = Math.min(width, measured + 16);
        let xx = px + 13;
        if (xx + labelWidth > W - right) xx = px - labelWidth - 13;
        xx = Math.max(left, Math.min(W - right - labelWidth, xx));
        const box = el("g", { "data-dot-label": kind });
        box.append(el("rect", { x: xx, y: yy, width: labelWidth, height: 23, rx: 6,
          fill: "white", "fill-opacity": 0.97, stroke: kind === "result" ? "#f1cbd0" : "#dce7e9" }),
        text(xx + 8, yy + 16, message, { "font-size": font, "font-weight": kind === "result" ? 700 : 550, fill: color,
          ...(measured > labelWidth - 16 ? { textLength: labelWidth - 16, lengthAdjust: "spacingAndGlyphs" } : {}),
        }));
        dot.append(box);
      };
      const limit = (position) => Math.max(top + 3, Math.min(bottom - 26, position));
      let resultY = limit(py - 28), medianY = limit(my + 8);
      if (py > my) {
        medianY = limit(my - 28); resultY = limit(py + 8);
        if (resultY - medianY < 28) { medianY = limit(resultY - 28); resultY = limit(medianY + 28); }
      } else if (medianY - resultY < 28) { resultY = limit(medianY - 28); medianY = limit(resultY + 28); }
      label(`${offscale === "above" ? "↑ " : offscale === "below" ? "↓ " : ""}${pointNumber(value)} ${unit}`, resultY, "#b51e33", "result");
      label(`Mediana ≈${pointNumber(median, 3)} ${unit}`, medianY, "#365b66", "median");
      g.append(dot);
      byId("scale-note").dataset.currentSource = point.profile.id;
      byId("chart-desc").textContent += " " + a11y;
    }
    function gonadotropinComparisonInsight() {
      const { point, reason } = renderedGonadotropinComparison || {};
      if (point) return ["Wynik na tle mediany", "Czerwony punkt: wynik. Jasny znacznik: mediana z badania." +
        (displayEngine.classifyInhibinComparisonValue(gonadotropinComparisons[view][compareHormone], point.valueIU) ? " Strzałka oznacza wynik poza osią." : "")];
      const messages = {
        "outside-infant-comparison": "Porównanie dotyczy okresu przed 1. urodzinami.",
        "outside-puberty-comparison": "Porównanie dotyczy wieku od 6 do 16 lat.",
        "preterm-context": "Te dane dotyczą niemowląt urodzonych o czasie; brak dopasowanego odniesienia dla wyniku.",
        "censored-result": "Wynik z oznaczeniem „<” lub „>” nie otrzymuje dokładnego punktu.",
        "ambiguous-age": "Podany wiek obejmuje różne zakresy odniesienia.",
        "missing-age": "Uzupełnij wiek, aby umieścić wynik.",
        "incompatible-assay": "Dla tej metody nie nanosimy punktu na te mediany.",
        "incompatible-specimen": "Materiał próbki nie odpowiada źródłu porównania.",
        "contraindicated": "Ten kontekst nie pozwala umieścić wyniku na krzywej.",
        "unsupported-age": "Dla podanego wieku nie ma odpowiedniego odniesienia.",
        "invalid-value": "Wpisz prawidłową wartość wyniku.",
        "missing-comparison-data": "Brak danych do wyświetlenia porównania.",
        "reference-unavailable": "Mediana jest zbyt niska lub zbyt niepewna, aby precyzyjnie umieścić punkt.",
      };
      return [compareHormone.toUpperCase() + (view === "puberty" ? " · pokwitanie" : " · minipuberty"),
        reason ? messages[reason] || "Brak dopasowanego odniesienia dla punktu pacjenta."
          : view === "puberty" ? "Mediany według wieku. Wykres nie ustala stadium pokwitania."
            : "Mediany stężeń z badań donoszonych niemowląt. To inny model niż przebieg zmian jednej osoby."];
    }
    function renderComparison() {
      stageNav.hidden = true;
      if (amhInfantComparisonActive()) return renderAmhInfantComparison();
      if (inhibinComparisonActive()) return renderInhibinComparison();
      if (gonadotropinComparisonActive()) return renderGonadotropinComparison();
      const h = femaleHormones.find((h) => h.id === compareHormone),
        male = maleHormones.find((h) => h.id === compareHormone),
        puberty = view === "puberty",
        minAge = puberty ? amhPubertyComparisonDomain.minAge : 0,
        maxAge = puberty ? amhPubertyComparisonDomain.maxAge : 1;
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
          ? `Wspólna oś wieku od 8 do 20 lat, nie stadium Tannera. Krzywe ${h ? h.name : "hormonów"} są poglądowe. `
          : "Wspólna oś wieku od urodzenia do 12 miesięcy. Dziewczynki: przeskalowane mediany od około 7. dnia. Chłopcy: poglądowy schemat. ") +
        "Linia ciągła: dziewczynki, przerywana: chłopcy. Każda krzywa ma własne maksimum w wyświetlanym okresie na tej samej wysokości. Przecięcie linii nie oznacza równych stężeń. To nie są normy ani przebieg u konkretnego dziecka.";
      if (!dotModel && patientPoint?.status === "ready" && compareHormone === analyteHormones[currentAnalyte]) {
        byId("scale-note").textContent = "Porównanie poglądowe — brak dopasowanych wartości odniesienia obu płci do umieszczenia wyniku.";
      }
      pointDescription(dotModel);
    }
    function updateInsight() {
      if (femaleGonadotropinsActive()) {
        updateFemaleGonadotropinInsight();
        return;
      }
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
      if (stableGonadotropinVisible() && [...selected].every((id) => id === "lh" || id === "fsh") &&
          (view === "mini" || (view === "life" && insightMode === "stage" && activeStage === 1))) {
        title = [...selected].map((id) => id.toUpperCase()).join(" i ") + " · minipuberty";
        copy = "Wczesna fala aktywności po urodzeniu, potem stopniowe wyciszenie. " +
          "Szeroki wierzchołek linii jest poglądowy; nie wyznacza dnia szczytu u konkretnego dziecka.";
      }
      if (renderedPoint) {
        const groupMean = renderedPoint.profile.statistic === "group-mean";
        title = groupMean ? "Wynik na tle średniej grupy wieku" : renderedPoint.profile.statistic === "group-median"
          ? "Wynik na tle mediany grupy" : "Wynik na tle mediany dla wieku";
        copy = (groupMean ? `Średnia opisuje badaną grupę ${renderedPoint.profile.ageGroup.label}.`
          : renderedPoint.profile.statistic === "group-median"
            ? `Mediana opisuje badaną grupę ${renderedPoint.profile.ageGroup.label}, nie dokładny wiek pacjenta.`
            : "Mediana opisuje populację z badania.") +
          " Wynik konkretnej osoby ocenia się z zakresem referencyjnym i kontekstem klinicznym.";
      }
      if (stableAmhVisible() && selected.size === 1 && insightMode === "hormone") {
        copy = "AMH jest wysokie w niemowlęctwie. Z wiekiem spada, a w okresie dojrzewania osiąga znacznie niższe wartości. Tempo zmian zależy od rozwoju pacjenta.";
      }
      if (stableInsl3Visible() && selected.size === 1) {
        if (insightMode === "hormone") copy = insl3Display.policy.presentation.hormoneCopy;
        if (view === "mini" || (view === "life" && activeStage === 1)) {
          title = "Minipuberty";
          copy = "Niewielki wzrost w pierwszych tygodniach, potem spadek. Poziom pozostaje znacznie niższy niż po pokwitaniu.";
        }
      }
      if (amhInfantComparisonActive()) [title, copy] = amhComparisonInsight();
      if (inhibinComparisonActive()) [title, copy] = inhibinComparisonInsight();
      if (gonadotropinComparisonActive()) [title, copy] = gonadotropinComparisonInsight();
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
      for (const key of ["cycleSource", "cycleUnit", "cycleDomain", "cycleCeiling"]) delete chart.dataset[key];
      byId("cycle-title").textContent = "Poglądowy przebieg estradiolu w cyklu miesiączkowym";
      byId("cycle-desc").textContent = "Schemat estradiolu na podstawie median faz, nie pomiary poszczególnych dni ani przewidywanie owulacji pacjentki. Przykładowa oś 28 dni i względna wysokość; większy szczyt okołoowulacyjny i mniejszy w fazie lutealnej.";
      panel.querySelector(".vhl-cycle-note").textContent = "Przykładowy cykl 28-dniowy. Długość cyklu i czas owulacji są zmienne.";
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
      if (femaleGonadotropinsActive()) {
        updateFemaleGonadotropinSources();
        return;
      }
      const nextKey = JSON.stringify([sex, view, compare, compareHormone, [...selected].sort(),
        renderedPoint?.profile.id, renderedPoint?.curves.map((curve) => curve.profile.id), renderedObservation?.kind]);
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
        paragraph("Linia testosteronu całkowitego zachowuje ten sam przebieg i skalę przed wpisaniem wyniku i po nim. Pokazuje poglądowy trend na podstawie badań; nie wyznacza norm ani stężenia w każdym roku życia.");
        paragraph("Niemowlęca część źródłowa dotyczy chłopców urodzonych o czasie. Od 6. do 18. urodzin odniesienie pochodzi z Madsen 2022 (LC-MS/MS), a w wieku 3–<6 lat z Kelsey 2014/2015. Łagodne zejście po minipuberty nie odtwarza różnicy między tymi modelami jako nagłego spadku w wieku 5–6 lat. Okres płodowy i połączenia między źródłami są ilustracyjne.");
        paragraph("Dorośli: średnie grup wieku z tabeli 1 badania Walravens 2025/2026, 1194 mężczyzn w wieku 18–86 lat. Testosteron całkowity oznaczano rano, na czczo, metodą LC-MS/MS. Zdrowe młodsze kohorty połączono ze starszą populacją, w której występowały choroby współistniejące. Różnice między grupami nie są wyłącznie skutkiem wieku.");
        paragraph("Dorosłość pokazujemy jednym szerokim łukiem, bez wymuszania przejścia przez każdą średnią grupową. Nie jest to indywidualne tempo starzenia ani ustalenie wieku fizjologicznego maksimum. Wygaszona końcówka po 86 latach nie dostarcza wartości odniesienia.");
        paragraph("Kropka oznacza wynik, a jasny znacznik źródłową medianę lub u dorosłych średnią grupy wieku. Znacznik może nie leżeć na poglądowej linii. Strzałka oznacza wynik powyżej stałej skali; etykieta podaje rzeczywistą wartość. Średnia ani mediana nie są granicami normy. Kolor nie klasyfikuje wyniku.");
        const testosteroneSources = new Set();
        if (renderedPoint?.id === "t" && renderedPoint.profile.ageGroup) {
          const profile = renderedPoint.profile;
          paragraph("Odniesienie dla wyniku: " +
            [profile.sourceLabel, profile.ageGroup.label, profile.method, profile.population].filter(Boolean).join(" · ") + ".");
          if (profile.ageGroup.description) paragraph(profile.ageGroup.description);
          if (profile.url) {
            testosteroneSources.add(profile.url);
            links.push([profile.sourceLabel || "Źródło", profile.url]);
          }
        }
        for (const profile of testosteroneDisplay.profiles) {
          const sourceKey = profile.url || profile.sourceLabel;
          if (testosteroneSources.has(sourceKey)) continue;
          testosteroneSources.add(sourceKey);
          paragraph([profile.sourceLabel, profile.method, profile.population].filter(Boolean).join(" · "));
          if (profile.url) links.push([profile.sourceLabel || "Źródło", profile.url]);
        }
      }
      if (stableAmhVisible()) {
        paragraph("Linia AMH jest poglądową syntezą badań, nie jedną medianą ani granicą normy. Zachowuje ten sam przebieg i skalę po wpisaniu wyniku. Pozostałe hormony mają własne skale.");
        paragraph("Minipuberty opiera się na medianie modelu Busch u donoszonych chłopców. Dalszy przebieg łączy mediany rocznych grup Wang z dorosłymi Tehrani. Grupy wieku nie są stadiami Tannera; różne populacje i metody oznaczeń nie są wymienne. Okres płodowy i łagodne połączenia są ilustracyjne.");
        paragraph("Dla AMH jasny znacznik zachowuje medianę wybranego źródła i może leżeć obok poglądowej linii. Kropka oznacza rzeczywisty wynik; strzałka — wynik ponad stałą skalą. Kolor nie klasyfikuje wyniku. Bez liczbowego odniesienia AMH: przed 7. dniem oraz po 70 latach. Wygaszony koniec oznacza koniec danych, nie biologiczne plateau.");
        const amhSources = new Set();
        if (renderedPoint?.id === "amh") {
          const profile = renderedPoint.profile;
          paragraph("Odniesienie dla wyniku: " +
            [profile.sourceLabel, profile.ageGroup?.label, profile.method, profile.population].filter(Boolean).join(" · ") + ".");
          if (profile.ageGroup?.description) paragraph(profile.ageGroup.description);
          if (profile.url) {
            amhSources.add(profile.url);
            links.push([profile.sourceLabel || "Źródło", profile.url]);
          }
        }
        for (const profile of amhDisplay.profiles) {
          const sourceKey = profile.url || profile.sourceLabel;
          if (amhSources.has(sourceKey)) continue;
          amhSources.add(sourceKey);
          paragraph([profile.sourceLabel, profile.method, profile.population].filter(Boolean).join(" · "));
          if (profile.url) links.push([profile.sourceLabel || "Źródło", profile.url]);
        }
      }
      if (stableInsl3Visible()) {
        paragraph("Linia pokazuje poglądowy przebieg INSL3. Nie jest krzywą mediany ani zakresem referencyjnym. Hormony mają odrębne skale.");
        paragraph("Niemowlęctwo: Busch 2022, rycina 2, pokazuje modelowaną średnią trajektorię z niewielkim wzrostem do około 27. dnia i późniejszym spadkiem. Rycina 3 opisuje inną statystykę: medianę modelu. Jej opadający kształt nie wyklucza wczesnej fali pokazanej w modelu podłużnym.");
        paragraph("Mała wysokość niemowlęcego odcinka względem dorosłości jest ilustracyjna. Bay 2007 i Bay 2005 wspierają niższe centralne stężenia u niemowląt niż u dorosłych, ale nie ustalają dokładnej wysokości miesięcznego szczytu na wspólnej krzywej. Wyników z różnych metod i populacji nie zharmonizowano.");
        paragraph("Niskie wartości oraz ograniczenia oznaczenia zmniejszają pewność dokładnych liczb. Nie są dowodem braku wzrostu biologicznego. Na tym wykresie nie dodano liczbowego odniesienia dla wyniku pacjenta.");
        paragraph("Pokwitanie i dorośli: Albrethsen 2020 oraz EMAS 2022 wspierają wzrost pokwitaniowy i stopniowy spadek w dorosłości. Stadium Tannera nie jest przypisane do dokładnego wieku. Wygładzona linia nie odtwarza każdej średniej ani mediany grupowej.");
        paragraph("Życie płodowe: schemat oparty jakościowo na fizjologii opisanej przez Harrison 2019. Wysokość nie oznacza stężenia. Odcinek 80–90 lat pozostaje wygaszonym przedłużeniem poglądowym.");
        links.push(
          ["Busch 2022 · minipuberty", "https://doi.org/10.1210/clinem/dgac115"],
          ["Bay 2007 · niemowlęta", "https://doi.org/10.1210/jc.2007-0974"],
          ["Bay 2005 · dorośli", "https://doi.org/10.1210/jc.2004-2257"],
          ["Albrethsen 2020 · pokwitanie", "https://doi.org/10.1210/clinem/dgaa496"],
          ["Albrethsen 2020 · dorośli", "https://doi.org/10.1210/clinem/dgaa145"],
          ["EMAS 2022 · dorośli", "https://doi.org/10.1111/andr.13220"],
          ["Harrison 2019 · życie płodowe", "https://doi.org/10.3389/fendo.2019.00596"],
        );
      }
      if (stableGonadotropinVisible()) {
        paragraph("Linie LH i FSH pokazują poglądowy przebieg zmian, zachowując stałą geometrię i skalę przed wpisaniem wyniku i po nim. Jasny znacznik przedstawia źródłową medianę lub średnią i może leżeć poza linią. Nie są to granice normy ani iloraz LH/FSH.");
        paragraph("Okres płodowy jest wyłącznie schematem; jego wysokości nie pochodzą ze zweryfikowanych stężeń płodowych. Nie dostarcza liczbowego odniesienia pacjenta. Wczesny wierzchołek po urodzeniu również jest ilustracyjny, a nie oszacowaniem dnia szczytu mediany populacji.");
        paragraph("Minipuberty: przybliżone mediany modelu Busch 2022 dotyczą zdrowych chłopców urodzonych o czasie. Bergadá 2006 wspiera kierunek wczesnego wzrostu. Dzieciństwo i pokwitanie: Madsen 2022, model 6–16 lat; FSH przed pokwitaniem także Zec 2012, mediana grupy ze stadium G1. Niski odcinek dziecięcy nie uzupełnia brakujących lub niewiarygodnych median LH.");
        paragraph("Dorośli: Laurentino 2020 — średnia młodej grupy stosowana w wieku 18–<25 lat; Perheentupa 2013 — mediany grup 25–74 lata. Starsi mężczyźni: Yeap 2007 dla LH, 75–89 lat; Ljubicic 2020 dla FSH, przybliżony środek modelu w wieku 75–80 lat. Zwykłe FSH od 16 do przed 18 lat korzysta z CALIPER; LH po 16 i przed 18 lat z odtworzonej mediany CALIPER. Dokładnie 16 lat LH zachowuje Madsen, od 18 lat oba hormony zachowują źródła dorosłych. Po 89 latach dla LH i po 80 latach dla FSH wygaszona linia nie dostarcza kolejnych wartości odniesienia.");
        if (selected.has("lh")) {
          paragraph("LH po 16 i przed 18 lat: mediana została odtworzona z tabeli LMS Wilson 2023 po przekształceniu logarytmicznym, według konwencji z przykładowego kodu współautora. Wszystkie pięć centyli sprawdzono względem ryciny. Nie jest to odzyskany oryginalny skrypt LH autorów ani nowa norma laboratoryjna. Surowica, Abbott ARCHITECT ci2000; inne metody nie otrzymały kalibracji.");
          links.push(["Wilson 2023 · CALIPER · LH", "https://doi.org/10.1515/cclm-2022-1077"],
            ["Kod współautora · przykład przeliczenia (2023)", "https://github.com/andremadsen/LMS-reference-curve/blob/288329c43ee238b3c8921097dfeac411d30465b9/OUS_demo.Rmd#L194-L196"]);
        }
        paragraph("Badania różnią się populacją i metodą oznaczenia: AutoDELFIA/DELFIA, IMMULITE, Roche, Abbott. Nie tworzą jednej zwalidowanej krzywej referencyjnej ani trajektorii jednej osoby. Dorosły łuk FSH sprawdzono względem centralnej krzywej Ljubicic; graficzne odczyty są przybliżone. Wygładzenie nie zmienia średnich i median przy jasnym znaczniku ani norm laboratoryjnych w przeliczniku.");
        if (renderedPoint && (renderedPoint.id === "lh" || renderedPoint.id === "fsh")) {
          const profile = renderedPoint.profile;
          const statistic = profile.statistic === "group-mean" ? "średnia grupy"
            : profile.statistic === "group-median" ? "mediana grupy" : "mediana modelu";
          paragraph("Odniesienie dla tego wyniku: " + [profile.sourceLabel,
            statistic + (profile.ageGroup?.label ? " " + profile.ageGroup.label : ""),
            profile.method, profile.population].filter(Boolean).join(" · ") + ".");
        }
        const sources = new Set();
        for (const display of gonadotropinDisplays.filter((item) => stableVisible(item.id))) {
          for (const profile of display.profiles) {
            const sourceKey = profile.url || profile.sourceLabel;
            if (sources.has(sourceKey)) continue;
            sources.add(sourceKey);
            if (profile.url) links.push([profile.sourceLabel || "Źródło", profile.url]);
          }
        }
        links.push(["Bergadá 2006 · wczesny wzrost", "https://doi.org/10.1210/jc.2006-1079"]);
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
      if (gonadotropinComparisonActive()) {
        paragraph("Obie płcie i LH/FSH mają w danym okresie tę samą stałą oś IU/L: 0–6 w minipuberty i 0–8 w pokwitaniu. Mediany opisują populację, nie normy ani indywidualną trajektorię. Wynik nie zmienia linii ani skali.");
        if (view === "mini") {
          paragraph("Donoszone niemowlęta: Busch 2022 — chłopcy (119 uczestników, 338 próbek); Ljubicic 2022 — dziewczynki (98 uczestniczek, 266 próbek). Surowica, AutoDELFIA. Męskie mediany GAMLSS odczytano z ryciny; żeńskie pochodzą z tabel suplementu. Wspólne linie: 0,02–<1 roku. Nie ekstrapolujemy do urodzenia.");
          paragraph("To inne statystyki niż średnie trajektorie podłużne w zwykłym widoku minipuberty. Dlatego porównanie median nie musi powtarzać dwóch fal żeńskiej średniej: względnie płaska mediana FSH nie oznacza braku zmienności u pojedynczej dziewczynki. Nie kalibrujemy średniej względnej do IU/L.");
          paragraph("Własny punkt chłopca może być dostępny od 7. dnia, choć obie linie zaczynają się około 7,3 dnia. Dokładnie pierwsze urodziny są poza tym porównaniem. Przy bardzo niskiej lub niepewnej medianie punkt pozostaje niedostępny; nie podstawiamy LOD/2. Męskie LH od około 244. dnia zachowuje dotychczasowe ograniczenie dokładnego punktu; późniejsza linia nadal pokazuje oszacowanie modelu. Około 327. dnia schodzi ono poniżej granicy oznaczenia 0,05 IU/L — nie oznacza dokładnie zmierzonego stężenia.");
          links.push(["Busch 2022 — chłopcy", "https://doi.org/10.1210/clinem/dgac115"],
            ["Ljubicic 2022 — dziewczynki", "https://doi.org/10.1210/clinem/dgac363"]);
        } else {
          paragraph("Madsen 2022, Bergen Growth Study 2: mediany GAMLSS obu płci, surowica, Siemens IMMULITE 2000 XPi. Kohorta z dostępnymi próbkami: 601 dziewcząt i 414 chłopców; liczba oznaczeń jest zależna od analitu. Każda krzywa ma 11 źródłowych median wieku 6–16 lat. Kohorta obejmowała 6–<16 lat; węzeł 16 lat jest opublikowanym brzegiem modelu. Nie przedłużamy do 20 lat.");
          paragraph("Fazy cyklu nie standaryzowano, użytkowniczki antykoncepcji doustnej wykluczono. To porównanie według wieku, bez przypisywania stadium Tannera. Dane pacjentki w tym okresie działają tylko w tym porównaniu; nie zmieniają globalnych profili ani norm.");
          links.push(["Madsen 2022 — obie płcie", "https://doi.org/10.1210/clinem/dgac155"]);
        }
        paragraph("Kropka pokazuje rzeczywisty wynik, jasny znacznik medianę jego płci, a strzałka wynik ponad osią. Własny profil kwalifikuje się niezależnie od metody drugiej płci. Zgodność metody, materiału, wieku i kontekstu nadal obowiązuje. Wspólna oś nie ustanawia wymienności metod ani klinicznego ilorazu LH/FSH.");
      } else if (inhibinComparisonActive()) {
        if (view === "mini") {
          paragraph("Mediany modeli populacyjnych inhibiny B z badań zdrowych niemowląt urodzonych o czasie: Busch 2022 — chłopcy i Ljubicic 2022 — dziewczynki. Oba badania: surowica, Inhibin B Gen II ELISA, Beckman Coulter.");
          paragraph("Męska krzywa jest przybliżonym odczytem mediany modelu GAMLSS z ryciny; żeńska pochodzi z tabeli modelu. Nie zastępujemy ich schematem ani średnią trajektorią podłużną. To odrębne badania; linie nie określają norm ani rozpoznania. W obu źródłach podano LOD 3 pg/mL, bez osobnej granicy LOQ. LOD nie jest granicą normy.");
          paragraph("Wspólny zakres krzywych: od 0,02 roku (około 7,3 dnia) do końca pierwszego roku. Nie ekstrapolujemy do urodzenia i nie dołączamy modelu starszych dzieci po 1. urodzinach. Punkt wymaga zgodności z profilem niemowlęcym; sam wykres pozostaje widoczny także bez wyniku lub przy braku kwalifikacji punktu.");
          links.push(["Busch 2022 — chłopcy", "https://doi.org/10.1210/clinem/dgac115"],
            ["Ljubicic 2022 — dziewczynki", "https://academic.oup.com/jcem/article/107/9/2598/6608768"]);
        } else {
          paragraph("Mediany modeli populacyjnych inhibiny B według wieku, Borelli-Kjær 2025: dziewczynki — rycina 1, chłopcy — rycina 2. Pokazujemy przybliżone odczyty źródłowych krzywych GAMLSS w wieku 8–20 lat. To wiek, nie stadium Tannera.");
          paragraph("Dziewczynki: surowica, Inhibin B Gen II ELISA, Beckman Coulter; przybliżenie odczytu około ±2 pg/mL. Kohorta wieku 5,6–20,2 lat obejmowała 648 dziewcząt. Zachowano wszystkie 24 źródłowe węzły 5,6–47 lat, aby obcięcie widoku nie zmieniało stycznych na jego granicach. Odniesienie punktu pacjentki jest dostępne wyłącznie w tym porównaniu wieku 8–20 lat.");
          paragraph("Chłopcy: połączone oznaczenia Oxford Bio-innovation oraz Beckman Coulter Gen II; przybliżenie odczytu około ±5 pg/mL. Wspólna oś nie oznacza harmonizacji metod. Nie stosujemy między nimi nowego przelicznika.");
          paragraph("Fazy cyklu nie standaryzowano, a antykoncepcja doustna wpływa na stężenia. Mediana wieku nie zastępuje oceny stadium, fazy cyklu ani laboratoryjnego zakresu referencyjnego. Nie wyznaczamy SDS, percentyli, rozpoznania ani indywidualnego celu. Podane przybliżenia digitizacji nie są przedziałami klinicznymi.");
          links.push(["Borelli-Kjær 2025 — publikacja", "https://doi.org/10.1210/clinem/dgae439"]);
        }
        paragraph("Stała wspólna oś liniowa 0–400 pg/mL jest taka sama w porównaniu minipuberty i pokwitania. Taka sama wysokość oznacza takie samo stężenie. Granice osi nie są normami ani granicami oznaczenia. Zero pozostaje punktem na poziomie 0; wynik powyżej 400 ma strzałkę z rzeczywistą wartością. Jasny znacznik pokazuje medianę z właściwego źródła. Każda płeć kwalifikuje punkt niezależnie na podstawie własnego profilu, metody, materiału i zapisu wyniku. 1 pg/mL = 1 ng/L.");
      } else if (amhInfantComparisonActive()) {
        paragraph("Mediany modeli populacyjnych AMH z badań zdrowych niemowląt urodzonych o czasie: Busch 2022 — chłopcy i Ljubicic 2022 — dziewczynki. Oba badania: surowica, Access 2, Beckman Coulter.");
        paragraph("Męska krzywa jest przybliżonym odczytem mediany modelu GAMLSS z ryciny; żeńska pochodzi z tabeli modelu. Nie zastępujemy ich schematem ani średnią trajektorią podłużną. To odrębne badania; linie nie określają norm ani rozpoznania.");
        paragraph("Wspólny zakres krzywych: od 0,02 roku (około 7,3 dnia) do końca pierwszego roku. Nie ekstrapolujemy do urodzenia i nie dołączamy modelu starszych dzieci po 1. urodzinach. Punkt wymaga zgodności z profilem niemowlęcym; sam wykres pozostaje widoczny także bez wyniku lub przy braku kwalifikacji punktu.");
        paragraph("Stała oś od 0,1 do 1000 ng/mL ma skalę logarytmiczną. Każdy kolejny poziom oznacza dziesięciokrotnie większe stężenie. Granice osi nie są normami ani granicami oznaczenia. Strzałka oznacza wynik poza osią i zachowuje jego rzeczywistą wartość. Jasny znacznik pokazuje medianę z właściwego źródła. 1 pmol/L = 0,1401 ng/mL.");
        links.push(["Busch 2022 — chłopcy", "https://doi.org/10.1210/clinem/dgac115"],
          ["Ljubicic 2022 — dziewczynki", "https://academic.oup.com/jcem/article/107/9/2598/6608768"]);
      } else if (renderedPoint && !renderedPoint.stableDisplay) {
        const medianBasis = renderedPoint.profile.statistic === "group-mean" ? "średnią grupy wieku" : renderedPoint.profile.statistic === "group-median"
          ? (renderedPoint.profile.ageGroup.boundaryPolicy === "application-completed-year-convention"
            ? "medianę rocznej grupy wieku" : "medianę grupy wieku przed pokwitaniem")
          : "medianę populacji w tym wieku";
        paragraph(`Kropka przedstawia wynik, a linia ${medianBasis} — nie granicę normy ani indywidualny cel. Kolor kropki nie jest klasyfikacją wyniku. Zakresy odniesienia i ocena kliniczna pozostają w osobnej części przelicznika.`);
        paragraph(compare
          ? "Obie linie i wynik mają wspólną skalę stężeń. Źródła dotyczą różnych populacji i metod; wykres nie potwierdza zgodności metody próbki z publikacją. Nie wyznacza proporcji hormonalnych ani stadium pokwitania."
          : "Wynik i wartości odniesienia korzystają z jednej skali, stałej przy zmianie widoku czasu. Każda publikacja zachowuje własne wartości. Przerywane połączenia między odcinkami są wyłącznie poglądowe: nie służą do wyliczania odniesienia ani punktu pacjenta. Poza dostępnymi profilami przerywana linia pozostaje schematem. Pozostałe hormony zachowują własne skale poglądowe.");
        for (const { profile } of renderedPoint.curves) {
          const description = [profile.sourceLabel, profile.ageGroup?.label, profile.method, profile.population]
            .filter((item) => typeof item === "string" && item.trim()).join(" · ");
          paragraph(description + (profile.approximate ? ". Mediana odtworzona orientacyjnie ze źródła." : "."));
          if (profile.statistic === "group-median" || profile.statistic === "group-mean") {
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
        if (selected.has("inhb")) paragraph("Inhibina B zachowuje tę samą linię i stałą skalę po wpisaniu wyniku oraz po zmianie okresu. Zbliżenie pokazuje fragment tego samego przebiegu. Jasny znacznik zachowuje źródłową medianę, także gdy nie leży dokładnie na linii. Most dzieciństwa i końcowy spadek po 47. roku są poglądowe; nie stanowią nowych odniesień liczbowych.");
        if (selected.has("e2")) paragraph("Estradiol zachowuje tę samą linię i stałą skalę po wpisaniu wyniku oraz po zmianie okresu. Zbliżenie pokazuje fragment tego samego przebiegu. W niemowlęctwie linia przedstawia medianę modelu GAMLSS, a nie dwie fale średniej podłużnej z ryciny 3. Dorosłe plateau jest poglądowe; osobny schemat cyklu pokazuje zmienność w jego obrębie. Jasny znacznik zachowuje źródłową medianę, także gdy nie leży dokładnie na linii.");
        if (selected.has("amh")) {
          paragraph("AMH zachowuje tę samą linię i stałą skalę we wszystkich zwykłych widokach, także po wpisaniu wyniku. Zbliżenie powiększa ten sam przebieg. Końcówka pierwszego roku przechodzi łagodnie w poglądowy odcinek dzieciństwa. Jasny znacznik zachowuje medianę źródłową także wtedy, gdy nie leży na linii.");
          if (renderedPoint?.stableDisplay?.kind === "female-amh-life") {
            const profile = renderedPoint.profile;
            paragraph("Odniesienie wyniku AMH: " + [profile.sourceLabel, profile.ageGroup?.label, profile.method, profile.population]
              .filter(Boolean).join(" · ") + ".");
            if (profile.url) links.push([profile.sourceLabel || "Źródło odniesienia AMH", profile.url]);
            if (profile.ageGroup?.description) paragraph(profile.ageGroup.description);
            if (profile.ageGroup?.n) paragraph(`Liczebność grupy źródłowej: ${profile.ageGroup.n}.`);
          }
        }
        if (renderedPoint?.stableDisplay?.kind === "female-inhibin-life" && renderedPoint.profile.patientNote) {
          const profile = renderedPoint.profile;
          paragraph("Odniesienie wyniku inhibiny B: " + [profile.sourceLabel, profile.ageGroup?.label, profile.method, profile.population]
            .filter(Boolean).join(" · ") + ".");
          if (profile.url) links.push([profile.sourceLabel || "Źródło odniesienia inhibiny B", profile.url]);
          if (profile.ageGroup?.description) paragraph(profile.ageGroup.description);
          if (profile.ageGroup?.n) paragraph(`Liczebność grupy źródłowej: ${profile.ageGroup.n}.`);
        }
        appendGroupReferenceSource(paragraph, (label, url) => links.push([label, url]));
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
              "Linia AMH: mediany grup wieku Jopling 2018 i FDA K170524, oznaczenie Access, po niemowlęctwie osocze. Dorosły punkt odniesienia korzysta z osobnej tabeli surowicy FDA. Badanie niemowlęce dotyczy surowicy; nie stosujemy niezweryfikowanego przelicznika między materiałami. Grupy pediatryczne są niewielkie i szpitalne, dorosłe wybrano według regularnych cykli i płodności. Po niemowlęctwie pokazujemy łagodne wypłaszczenie i stopniowy wzrost. Nie wymuszamy szybkiego odbicia do mediany szerokiej grupy 1–4,9 lat. Ten fragment jest schematem, bez przypisania wieku minimum. Dalszy przebieg pomija niepewne ząbki między grupami i pokazuje szerokie maksimum w młodej dorosłości, bez szczytu przypisanego do 28. roku życia. Po grupie 41–45 lat pokazujemy wyłącznie jakościowy spadek, bez wymyślonych stężeń.",
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
              "Inhibina B: po niemowlęctwie mediana z ryciny 1 Borelli-Kjær 2025, odtworzona orientacyjnie z wykresu (około ±2 pg/mL). Gen II ELISA w surowicy jak u niemowląt, ale odrębny model. Odcinek 1–5,6 roku jest poglądowym połączeniem modeli niemowląt i starszych dzieci. W źródle brak obserwacji między 1,08 a 5,6 roku. Pokwitaniowy garb i późniejszy łagodny spadek pozostają, ponieważ są widoczne w tym samym opublikowanym modelu. Dorosła grupa liczy 149 kobiet, bez standaryzacji fazy cyklu; dane o antykoncepcji były niepełne. To nie jest mediana konkretnej fazy cyklu ani kohorty wyłącznie bez leczenia. Liczbowe odniesienie kończy się na zweryfikowanym odczycie przy 47 latach; dalsza linia jest poglądowa, bez stężeń poniżej granicy wykrywalności.",
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
              "Niski stan po menopauzie wspiera ogólna mediana 18 pmol/L z Cui 2026 (7206 kobiet; pełny artykuł, tabela 2). To odrębna populacja i harmonizowane oznaczenia. Cały odcinek od dorosłości jest poglądowy — nie określa wielkości spadku u konkretnej kobiety ani wieku jej menopauzy.",
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
          if (view === "life") view = initialComparisonPeriod(candidate);
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
      patientContext = patientPoint = resultOnlyPoint = renderedPoint = renderedResultOnlyPoint = renderedAmhComparison = renderedInhibinComparison = renderedGonadotropinComparison = renderedObservation = null;
      clearFemalePeriodMetadata();
      delete svg.dataset.comparisonScale;
      delete svg.dataset.comparisonMin;
      delete svg.dataset.comparisonMax;
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
      byId("comparison-note").hidden = true;
      panel.querySelector(".vhl-chart-caption").hidden = false;
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
        displayUnit: next.displayUnit,
        contraindicated: next.contraindicated === true,
        cyclePhase: next.cyclePhase,
        puberty: next.puberty && typeof next.puberty === "object"
          ? { kind: next.puberty.kind, stage: next.puberty.stage } : null,
        assayMethodId: next.assayMethodId,
        specimen: next.specimen,
      };
      const engine = pointEngine();
      patientPoint = currentAnalyte !== "insl3" && engine && data.patientPointData
        ? engine.evaluate(data.patientPointData, patientContext) : null;
      resultOnlyPoint = patientPoint?.reason === "unsupported-age" && engine?.evaluateResultOnly
        ? engine.evaluateResultOnly(data, patientContext) : null;
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
