(() => {
  "use strict";

  const root = document.documentElement;
  const motion = !matchMedia("(prefers-reduced-motion: reduce)").matches;
  const darkQuery = matchMedia("(prefers-color-scheme: dark)");
  const THEME_KEY = "meetup-theme";
  const themeListeners = new Set();
  const notifyTheme = () => themeListeners.forEach((fn) => fn());

  const isDark = () => {
    const t = root.getAttribute("data-theme");
    return t ? t === "dark" : darkQuery.matches;
  };

  /* ---------- theme ---------- */

  function setTheme(choice) {
    const fixed = choice === "light" || choice === "dark";
    if (fixed) root.setAttribute("data-theme", choice);
    else root.removeAttribute("data-theme");
    try {
      if (fixed) localStorage.setItem(THEME_KEY, choice);
      else localStorage.removeItem(THEME_KEY);
    } catch (e) { /* not persisted, still applied */ }
    notifyTheme();
  }

  function initThemeSwitch() {
    const group = document.querySelector(".theme-switch");
    if (!group) return;
    const current = () => root.getAttribute("data-theme") || "system";
    const paint = () => {
      group.querySelectorAll("[data-theme-choice]").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.themeChoice === current()));
      });
    };
    group.addEventListener("click", (e) => {
      const b = e.target.closest("[data-theme-choice]");
      if (b) setTheme(b.dataset.themeChoice);
    });
    themeListeners.add(paint);
    darkQuery.addEventListener("change", notifyTheme);
    paint();
  }

  /* ---------- background canvases ---------- */

  const hexA = (hex, a) => {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
  };

  // mulberry32: same blob layout on every visit
  const seeded = (seed) => {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };

  function canvasLoop(canvas, draw, { fps = 24, scale = 1 } = {}) {
    const ctx = canvas.getContext("2d");
    let w = 1, h = 1, k = 1, visible = true, last = 0;
    const paint = (t) => draw(ctx, w, h, t, k);
    const resize = () => {
      const r = canvas.getBoundingClientRect();
      k = Math.min(window.devicePixelRatio || 1, 1.5) * scale;
      w = Math.max(1, Math.round(r.width));
      h = Math.max(1, Math.round(r.height));
      canvas.width = Math.max(1, Math.round(w * k));
      canvas.height = Math.max(1, Math.round(h * k));
      ctx.setTransform(k, 0, 0, k, 0, 0);
      paint(motion ? performance.now() / 1000 : 0);
    };
    new ResizeObserver(resize).observe(canvas);
    new IntersectionObserver((e) => { visible = e[0].isIntersecting; }).observe(canvas);
    themeListeners.add(() => requestAnimationFrame(() => paint(motion ? performance.now() / 1000 : 0)));
    resize();
    if (!motion) return;
    const frame = 1000 / fps;
    const tick = (t) => {
      requestAnimationFrame(tick);
      if (!visible || t - last < frame) return;
      last = t;
      paint(t / 1000);
    };
    requestAnimationFrame(tick);
  }

  function orbs(canvas) {
    const rand = seeded(20261103);
    const r = (a, b) => a + rand() * (b - a);
    const blobs = Array.from({ length: 4 }, (_, i) => ({
      x: r(.15, .85), y: r(.15, .85), size: r(.28, .5),
      px: r(0, 6.28), py: r(0, 6.28), sx: r(.6, 1.3), sy: r(.6, 1.3), i
    }));
    canvasLoop(canvas, (c, W, H, t, k) => {
      const dark = isDark();
      const colors = dark ? ["#FF3E86", "#1FD8B2", "#7B5CFF"] : ["#FF3E86", "#00CFA6", "#FFC93C"];
      const alpha = dark ? .26 : .34;
      const m = Math.min(W, H);
      c.clearRect(0, 0, W, H);
      c.filter = `blur(${Math.max(4, 80 * k)}px)`;
      for (const b of blobs) {
        const x = (b.x + Math.sin(t * .2 * b.sx + b.px) * .1) * W;
        const y = (b.y + Math.cos(t * .2 * b.sy + b.py) * .1) * H;
        const rad = b.size * m;
        const col = colors[b.i % colors.length];
        const g = c.createRadialGradient(x, y, 0, x, y, rad);
        g.addColorStop(0, hexA(col, alpha));
        g.addColorStop(1, hexA(col, 0));
        c.fillStyle = g;
        c.beginPath();
        c.arc(x, y, rad, 0, Math.PI * 2);
        c.fill();
      }
      c.filter = "none";
    }, { fps: 24, scale: .5 }); // the blobs are blurred anyway, half resolution is invisible
  }

  function dots(canvas) {
    const cell = 18, max = 4.6, speed = .3;
    canvasLoop(canvas, (c, W, H, t) => {
      const dark = isDark();
      c.clearRect(0, 0, W, H);
      c.fillStyle = hexA(dark ? "#E9E4FF" : "#17123A", dark ? .12 : .28);
      for (let y = cell / 2; y < H; y += cell) {
        for (let x = cell / 2; x < W; x += cell) {
          const v = (Math.sin(x * .011 + t * speed) + Math.cos(y * .013 - t * speed * .8) + Math.sin((x + y) * .0075 + t * .38)) / 3;
          const rad = (v * .5 + .5) * max;
          if (rad > .3) {
            c.beginPath();
            c.arc(x, y, rad, 0, Math.PI * 2);
            c.fill();
          }
        }
      }
    }, { fps: 24 });
  }

  /* ---------- countdown ---------- */

  function countdown(el) {
    const target = new Date(el.dataset.target).getTime();
    if (Number.isNaN(target)) return;
    const units = el.querySelectorAll("[data-unit]");
    const tick = () => {
      const d = Math.max(0, target - Date.now());
      const v = {
        days: Math.floor(d / 864e5),
        hours: Math.floor(d / 36e5) % 24,
        minutes: Math.floor(d / 6e4) % 60,
        seconds: Math.floor(d / 1000) % 60
      };
      units.forEach((n) => { n.textContent = String(v[n.dataset.unit]).padStart(2, "0"); });
      if (!d) clearInterval(id);
    };
    const id = setInterval(tick, 1000);
    tick();
  }

  /* ---------- typewriter (reserves its height, so nothing around it moves) ---------- */

  function typewriter(el, words) {
    const ZW = "​";
    const put = (t) => { el.textContent = t + ZW; };
    const reserve = () => {
      const prev = el.textContent;
      el.style.minHeight = "0px";
      let mh = 0;
      for (const w of words) { put(w); mh = Math.max(mh, el.getBoundingClientRect().height); }
      el.textContent = prev;
      el.style.minHeight = Math.ceil(mh) + "px";
    };
    put(words[0]);
    reserve();
    if (document.fonts) document.fonts.ready.then(reserve);
    let lastW = 0;
    new ResizeObserver(() => {
      const w = Math.round(el.parentElement.getBoundingClientRect().width);
      if (w !== lastW) { lastW = w; reserve(); }
    }).observe(el.parentElement);
    if (!motion) return;

    let i = 0, j = words[0].length, deleting = true;
    const step = () => {
      const w = words[i];
      j += deleting ? -1 : 1;
      put(w.slice(0, Math.max(0, j)));
      let wait = deleting ? 32 : 58;
      if (!deleting && j >= w.length) { deleting = true; wait = 1900; }
      else if (deleting && j <= 0) { deleting = false; i = (i + 1) % words.length; wait = 320; }
      setTimeout(step, wait);
    };
    setTimeout(step, 1900);
  }

  /* ---------- branches: trunk splits under the card, each move gets a twig ---------- */

  function branches(svg, from, moves) {
    const NS = "http://www.w3.org/2000/svg";
    const twigs = [...svg.querySelectorAll("path.branch")];
    const dotOf = (n) => n.querySelector(".move-dot") || n;
    const shown = (n) => n.classList.contains("is-on") && getComputedStyle(n).display !== "none";
    const joins = {};
    const BEFORE = 34, AFTER = 30;

    // Each twig fades into the trunk with its own colour around the joint.
    const defs = document.createElementNS(NS, "defs");
    svg.insertBefore(defs, svg.firstChild);
    const blends = moves.map((n, i) => {
      const g = document.createElementNS(NS, "linearGradient");
      g.id = "blend-" + i;
      g.setAttribute("gradientUnits", "userSpaceOnUse");
      const stops = [0, 1, 2].map(() => g.appendChild(document.createElementNS(NS, "stop")));
      defs.appendChild(g);
      const path = document.createElementNS(NS, "path");
      path.setAttribute("class", "blend");
      path.style.stroke = `url(#${g.id})`;
      svg.insertBefore(path, twigs[0] || null);
      return { g, stops, path };
    });

    const draw = () => {
      const S = svg.getBoundingClientRect();
      if (S.width < 2) return;
      svg.setAttribute("viewBox", `0 0 ${Math.round(S.width)} ${Math.round(S.height)}`);
      const A = from.getBoundingClientRect();
      const sx = A.left - S.left + A.width / 2;
      const sy = A.bottom - S.top + 2;
      for (const k in joins) delete joins[k];

      const sides = {};
      for (const side of ["left", "right"]) {
        const trunk = svg.querySelector(".trunk-" + side);
        const list = moves
          .filter((n) => n.dataset.side === side && shown(n))
          .map((n) => {
            const d = dotOf(n).getBoundingClientRect();
            return { n, x: d.left - S.left + d.width / 2, y: d.top - S.top + d.height / 2 };
          })
          .sort((a, b) => a.y - b.y);
        if (!list.length) { trunk.removeAttribute("d"); continue; }
        sides[side] = { trunk, list, dir: side === "right" ? 1 : -1 };
      }

      const fy = sy + 12;
      const firsts = Object.values(sides).map((o) => o.list[0].x - o.dir * 46);
      const fx = firsts.length ? firsts.reduce((a, b) => a + b, 0) / firsts.length : sx;
      let stem = true;

      for (const o of Object.values(sides)) {
        const { list, dir } = o;
        const drift = list.length > 1 ? 22 / (list.length - 1) : 0;
        let prevY = fy;
        const J = list.map((p, i) => {
          const lead = Math.min(26, Math.max(7, (p.y - prevY) * .42));
          prevY = p.y;
          return { x: p.x - dir * (46 - i * drift), y: p.y - lead };
        });
        let d = stem
          ? `M${sx.toFixed(1)} ${sy.toFixed(1)} C${sx.toFixed(1)} ${(sy + 6).toFixed(1)} ${fx.toFixed(1)} ${(fy - 6).toFixed(1)} ${fx.toFixed(1)} ${fy.toFixed(1)}`
          : `M${fx.toFixed(1)} ${fy.toFixed(1)}`;
        stem = false;
        let px = fx, py = fy;
        for (const j of J) {
          const dy = (j.y - py) * .45;
          d += ` C${px.toFixed(1)} ${(py + dy).toFixed(1)} ${j.x.toFixed(1)} ${(j.y - dy).toFixed(1)} ${j.x.toFixed(1)} ${j.y.toFixed(1)}`;
          px = j.x; py = j.y;
        }
        o.trunk.setAttribute("d", d);
        const L = o.trunk.getTotalLength();
        o.trunk.style.strokeDasharray = L;
        o.trunk.style.strokeDashoffset = 0;
        list.forEach((p, i) => { joins[moves.indexOf(p.n)] = J[i]; });
      }

      moves.forEach((n, i) => {
        const p = twigs[i];
        const j = joins[i];
        if (!p) return;
        if (!j) { p.removeAttribute("d"); return; }
        const D = dotOf(n).getBoundingClientRect();
        const bx = D.left - S.left + D.width / 2;
        const by = D.top - S.top + D.height / 2;
        const dx = bx - j.x, dy = by - j.y;
        p.setAttribute("d", `M${j.x.toFixed(1)} ${j.y.toFixed(1)} C${(j.x + dx * .1).toFixed(1)} ${(j.y + dy * .66).toFixed(1)} ${(bx - dx * .44).toFixed(1)} ${(by - dy * .04).toFixed(1)} ${bx.toFixed(1)} ${by.toFixed(1)}`);
        const L = p.getTotalLength();
        p.style.strokeDasharray = L;
        p.style.strokeDashoffset = shown(n) ? 0 : L;

        const bl = blends[i];
        const t = svg.querySelector(".trunk-" + n.dataset.side);
        if (!t || !t.getAttribute("d")) { bl.path.removeAttribute("d"); return; }
        const TL = t.getTotalLength();
        let lo = 0, hi = TL;
        for (let k = 0; k < 24; k++) {
          const m = (lo + hi) / 2;
          if (t.getPointAtLength(m).y < j.y) lo = m; else hi = m;
        }
        const at = (lo + hi) / 2;
        const a = Math.max(0, at - BEFORE), b = Math.min(TL, at + AFTER);
        const ya = t.getPointAtLength(a).y, yb = t.getPointAtLength(b).y;
        const color = getComputedStyle(n).getPropertyValue("--dot").trim() || "currentColor";
        const mid = yb - ya > 1 ? (j.y - ya) / (yb - ya) : 1;
        bl.g.setAttribute("x1", 0);
        bl.g.setAttribute("x2", 0);
        bl.g.setAttribute("y1", ya.toFixed(1));
        bl.g.setAttribute("y2", yb.toFixed(1));
        [[0, 0], [mid, 1], [1, b >= TL - .5 ? 1 : 0]].forEach(([off, op], k) => {
          bl.stops[k].setAttribute("offset", Math.max(0, Math.min(1, off)).toFixed(3));
          bl.stops[k].setAttribute("stop-color", color);
          bl.stops[k].setAttribute("stop-opacity", op);
        });
        bl.path.setAttribute("d", t.getAttribute("d"));
        bl.path.style.strokeDasharray = `0 ${a.toFixed(1)} ${(b - a).toFixed(1)} ${(TL + 10).toFixed(1)}`;
        bl.path.style.transition = motion ? `opacity .6s ease ${(1 + i * .11).toFixed(2)}s` : "none";
        bl.path.style.opacity = shown(n) ? 1 : 0;
      });
    };

    draw();
    new ResizeObserver(draw).observe(svg);
    if (document.fonts) document.fonts.ready.then(draw);
    return { redraw: draw, trunks: [...svg.querySelectorAll("path.trunk")], twigs };
  }

  function initMap() {
    const map = document.querySelector(".map");
    const quick = document.querySelector(".quick");
    const svg = document.querySelector(".lines");
    if (!map || !quick || !svg) return;
    const moves = [...map.querySelectorAll(".move")];
    moves.forEach((n, i) => {
      n.style.transitionDelay = (motion ? 240 + i * 110 : 0) + "ms";
      n.classList.add("is-on");
    });
    const tree = branches(svg, quick, moves);
    tree.twigs.forEach((p, i) => { if (moves[i]) p.style.color = getComputedStyle(moves[i]).getPropertyValue("--dot"); });

    // The single-column layout draws a rail instead of curves: from the card to the last dot.
    const layout = () => {
      const M = map.getBoundingClientRect();
      if (M.height < 2) return;
      const visible = moves.filter((n) => getComputedStyle(n).display !== "none");
      const last = visible[visible.length - 1];
      map.style.setProperty("--spine-top", quick.getBoundingClientRect().bottom - M.top + 10 + "px");
      if (last) {
        const k = last.querySelector(".move-dot").getBoundingClientRect();
        map.style.setProperty("--spine-bottom", Math.max(0, M.bottom - (k.top + k.height / 2)) + "px");
      }
      requestAnimationFrame(tree.redraw);
    };

    if (motion) {
      tree.trunks.concat(tree.twigs).forEach((p, i) => {
        p.style.transitionDelay = 140 + i * 110 + "ms";
        const L = p.getTotalLength ? p.getTotalLength() : 0;
        if (L) p.style.strokeDashoffset = L;
      });
      requestAnimationFrame(() => requestAnimationFrame(layout));
    }
    layout();
    new ResizeObserver(layout).observe(map);
  }

  /* ---------- phones: hero and map are two pages in a scroll-snap row ---------- */

  function initPager() {
    const grid = document.querySelector(".hero-grid");
    const copy = document.querySelector(".hero-copy");
    const panel = document.querySelector(".map-panel");
    if (!grid || !copy || !panel) return;

    const sync = (toMap) => {
      if (grid.scrollWidth <= grid.clientWidth + 2) { copy.inert = false; panel.inert = false; return; }
      const onMap = toMap != null ? toMap : grid.scrollLeft > grid.clientWidth / 2;
      copy.inert = onMap;
      panel.inert = !onMap;
    };

    grid.addEventListener("click", (e) => {
      const b = e.target.closest("[data-go]");
      if (!b) return;
      const toMap = b.dataset.go === "map";
      const target = toMap ? panel : copy;
      const pad = parseFloat(getComputedStyle(grid).scrollPaddingLeft) || 0;
      const behavior = motion ? "smooth" : "auto";
      grid.scrollTo({ left: target.getBoundingClientRect().left - grid.getBoundingClientRect().left + grid.scrollLeft - pad, behavior });
      if (toMap && grid.getBoundingClientRect().top < 0) grid.scrollIntoView({ block: "start", behavior });
      sync(toMap);
      const focusTarget = document.querySelector(toMap ? ".back" : ".to-map");
      if (focusTarget) setTimeout(() => focusTarget.focus({ preventScroll: true }), motion ? 450 : 0);
    });

    let t = 0;
    grid.addEventListener("scroll", () => { clearTimeout(t); t = setTimeout(() => sync(), 90); }, { passive: true });
    new ResizeObserver(() => sync()).observe(grid);
    sync();
  }

  /* ---------- scroll reveal ---------- */

  function initReveal() {
    const els = [...document.querySelectorAll(".reveal")];
    if (!motion || !("IntersectionObserver" in window)) { els.forEach((e) => e.classList.add("is-in")); return; }
    els.forEach((e, i) => { e.style.transitionDelay = (i % 8) * 55 + "ms"; });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((e) => {
        if (!e.isIntersecting) return;
        e.target.classList.add("is-in");
        io.unobserve(e.target);
      });
    }, { threshold: .1, rootMargin: "0px 0px -5% 0px" });
    els.forEach((e) => io.observe(e));
  }

  /* ---------- registration ---------- */

  function initRegister() {
    const form = document.getElementById("reg-form");
    if (!form) return;
    const status = document.getElementById("reg-status");
    const button = form.querySelector("button[type=submit]");
    const contact = form.dataset.contact;
    const shownAt = Date.now();
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    // Status line; with withContact it ends in "írj nekünk: <mailto>".
    const say = (kind, msg, withContact) => {
      status.replaceChildren(msg);
      if (withContact) {
        const a = document.createElement("a");
        a.href = "mailto:" + contact;
        a.textContent = contact;
        status.append(" Ha nem sikerül, írj nekünk: ", a, ".");
      }
      status.className = "reg-status is-" + kind;
      status.hidden = false;
      status.focus();
    };
    const hideFields = () => [...form.children].forEach((el) => { if (el !== status) el.hidden = true; });
    const done = (msg) => { hideFields(); say("ok", msg); };

    if (Date.now() >= Date.parse(form.dataset.closes)) {
      hideFields();
      status.textContent = "A regisztráció lezárult. Köszönjük az érdeklődést!";
      status.className = "reg-status is-error";
      status.hidden = false;
      return;
    }

    const fieldError = (name, msg) => {
      const input = form.elements[name];
      const err = document.getElementById(input.id + "-err");
      input.setAttribute("aria-invalid", msg ? "true" : "false");
      err.textContent = msg || "";
      err.hidden = !msg;
      return !msg;
    };

    const rules = {
      email: (v) => (!v.trim() ? "Add meg az e-mail-címed." : EMAIL_RE.test(v.trim()) ? "" : "Ez nem tűnik érvényes e-mail-címnek."),
      name: (v) => (v.trim().length < 2 ? "Add meg a neved." : ""),
      study_other: (v) => (form.elements.study.value === "other" && v.trim().length < 2 ? "Írd be, hol tanulsz." : ""),
      gdpr: (_, el) => (el.checked ? "" : "Az adatkezelési tájékoztató elfogadása kötelező."),
      photo: (_, el) => (el.checked ? "" : "A fotózásról szóló tájékoztatás tudomásulvétele kötelező."),
    };
    const check = (name) => fieldError(name, rules[name](form.elements[name].value, form.elements[name]));

    const validate = () => {
      const bad = Object.keys(rules).filter((name) => !check(name));
      if (bad.length) form.elements[bad[0]].focus();
      return !bad.length;
    };

    // Re-check a flagged field while it is being fixed.
    const recheck = (e) => {
      const name = e.target.name;
      if (rules[name] && e.target.getAttribute("aria-invalid") === "true") check(name);
    };
    form.addEventListener("input", recheck);
    form.addEventListener("change", recheck);

    // "Máshol" reveals a free-text field for the school.
    const otherWrap = document.getElementById("reg-study-other-wrap");
    form.addEventListener("change", (e) => {
      if (e.target.name !== "study") return;
      const other = e.target.value === "other";
      otherWrap.hidden = !other;
      if (other) form.elements.study_other.focus();
      else fieldError("study_other", "");
    });

    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      status.hidden = true;
      if (!validate()) return;

      const f = form.elements;
      const payload = {
        email: f.email.value.trim(),
        name: f.name.value.trim(),
        study: f.study.value || "",
        study_other: f.study.value === "other" ? f.study_other.value.trim() : "",
        gdpr: f.gdpr.checked,
        photo: f.photo.checked,
        website: f.website.value,
        t: shownAt,
      };

      button.disabled = true;
      try {
        const res = await fetch("/api/register", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json().catch(() => null);
        if (res.ok && data && data.ok) {
          done(data.already
            ? "Ezzel az e-mail-címmel már regisztráltál, nincs további teendőd. Találkozunk november 3-án!"
            : "Köszönjük, sikeresen regisztráltál! Találkozunk november 3-án 17:00-kor az FNT-ben.");
          return;
        }
        if (data && rules[data.field]) {
          if (data.field === "study_other") otherWrap.hidden = false;
          fieldError(data.field, data.error);
          f[data.field].focus();
        } else {
          say("error", (data && data.error) || "Valami hiba történt, nem sikerült a regisztráció.", res.status >= 500 || !data);
        }
      } catch {
        say("error", "Nem értük el a szervert. Ellenőrizd a netkapcsolatot, és próbáld újra.", true);
      } finally {
        button.disabled = false;
      }
    });
  }

  /* ---------- boot ---------- */

  initThemeSwitch();
  const orbsCanvas = document.querySelector(".fx-orbs");
  const dotsCanvas = document.querySelector(".fx-dots");
  if (orbsCanvas) orbs(orbsCanvas);
  if (dotsCanvas) dots(dotsCanvas);
  const cd = document.querySelector(".countdown");
  if (cd) countdown(cd);
  const typed = document.querySelector(".typed");
  if (typed) typewriter(typed, ["Másold be, ami kijön.", "Kérdezd meg az AI-t.", "Csináld, ahogy szokás.", "Használd a kész kódot."]);
  initMap();
  initPager();
  initReveal();
  initRegister();
})();
