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
      c.fillStyle = hexA(dark ? "#E9E4FF" : "#17123A", dark ? .1 : .22);
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
            : "Köszönjük, sikeresen regisztráltál! Találkozunk november 3-án 17:30-kor az FNT-ben.");
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
  if (orbsCanvas) orbs(orbsCanvas);
  const dotsCanvas = document.querySelector(".fx-dots");
  if (dotsCanvas) dots(dotsCanvas);
  initRegister();
})();
