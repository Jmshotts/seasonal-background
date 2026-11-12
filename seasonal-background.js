/*
 * Seasonal Background for Home Assistant
 * Falling leaves (autumn), snow (winter), petals (spring), sun motes (summer).
 * Random wind gusts blow particles off the screen. Season comes from
 * sensor.season (Season integration), with a month-based fallback.
 *
 * Day/night: uses sun.sun (built into Home Assistant) to dim the screen
 * slightly at night, show stars and a moon, glow warm at sunrise/sunset,
 * and turn summer sparkles into fireflies after dark.
 *
 * Install: save as /config/www/seasonal-background.js
 * Add as a dashboard resource: /local/seasonal-background.js (JavaScript module)
 */
(() => {
  if (window.__seasonalBg) return;
  window.__seasonalBg = true;

  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  // ---------- Settings you can tweak ----------
  const SEASON_ENTITY = "sensor.season";
  const OPACITY = 0.9;          // overall particle opacity
  const DENSITY = 1.0;          // 0.5 = half as many, 2 = double
  const GUST_EVERY = [12, 25];  // seconds between wind gusts (min, max)
  const GUST_LENGTH = 5;        // seconds a gust lasts
  const SUN_ENTITY = "sun.sun"; // day/night source
  const NIGHT_TINT = 0.18;      // how dark the screen gets at night (0 = none)
  const SHOW_STARS = true;
  const SHOW_MOON = true;
  // --------------------------------------------

  const SEASONS = {
    autumn: {
      count: 35, shape: "leaf", size: [10, 20], fall: [0.6, 1.5], sway: [0.3, 1.0],
      colors: ["#e8761f", "#d9480f", "#f2a31b", "#b83a1b", "#c9831e", "#8f3b17"],
    },
    winter: {
      count: 90, shape: "flake", size: [1.5, 4.5], fall: [0.5, 1.4], sway: [0.2, 0.6],
      colors: ["#ffffff", "#e6f1ff", "#d4e6fb"],
    },
    spring: {
      count: 40, shape: "petal", size: [5, 10], fall: [0.5, 1.1], sway: [0.3, 0.9],
      colors: ["#ffc1d6", "#ffd9e6", "#fff0f5", "#f9a8c4"],
    },
    summer: {
      count: 28, shape: "mote", size: [1.5, 4], fall: [-0.25, 0.25], sway: [0.2, 0.7],
      colors: ["#fff2a8", "#ffe38a", "#fffbe0"],
    },
  };

  const canvas = document.createElement("canvas");
  Object.assign(canvas.style, {
    position: "fixed", top: "0", left: "0", width: "100%", height: "100%",
    pointerEvents: "none", zIndex: "5",
  });
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");

  let W = 0, H = 0;
  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  resize();
  window.addEventListener("resize", () => { resize(); makeStars(); });

  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

  function currentSeason() {
    try {
      const ha = document.querySelector("home-assistant");
      const st = ha && ha.hass && ha.hass.states[SEASON_ENTITY];
      if (st && SEASONS[st.state]) return st.state;
    } catch (e) { /* fall through */ }
    const m = new Date().getMonth(); // northern hemisphere fallback
    if (m >= 2 && m <= 4) return "spring";
    if (m >= 5 && m <= 7) return "summer";
    if (m >= 8 && m <= 10) return "autumn";
    return "winter";
  }

  let season = currentSeason();
  let particles = [];

  // ---------- Day / night ----------
  let light = 1; // 1 = full day, 0 = full night
  let warm = 0;  // 0..1, golden hour around sunrise/sunset

  function updateSky() {
    let e = null;
    try {
      const ha = document.querySelector("home-assistant");
      const st = ha && ha.hass && ha.hass.states[SUN_ENTITY];
      if (st && typeof st.attributes.elevation === "number") e = st.attributes.elevation;
    } catch (err) { /* fall through */ }
    if (e === null) { // no sun entity: rough guess from the clock
      const d = new Date();
      const h = d.getHours() + d.getMinutes() / 60;
      e = 50 * Math.sin(Math.PI * (h - 6) / 12);
    }
    light = Math.min(1, Math.max(0, (e + 6) / 12));
    warm = Math.min(1, Math.max(0, 1 - Math.abs(e - 1) / 9));
  }
  updateSky();
  setInterval(updateSky, 20000);

  let stars = [];
  function makeStars() {
    const n = Math.round(60 * DENSITY);
    stars = Array.from({ length: n }, () => ({
      x: rand(0, W), y: rand(0, H * 0.7), r: rand(0.5, 1.6),
      ph: rand(0, Math.PI * 2), sp: rand(0.001, 0.003),
    }));
  }

  function drawMoon(night) {
    const x = W - 64, y = 176, r = 16;
    ctx.save();
    ctx.globalAlpha = night * OPACITY;
    const g = ctx.createRadialGradient(x, y, r * 0.5, x, y, r * 3);
    g.addColorStop(0, "rgba(255,248,220,0.35)");
    g.addColorStop(1, "rgba(255,248,220,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r * 3, 0, Math.PI * 2);
    ctx.fill();
    // crescent: outer circle minus an offset inner circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.clip();
    ctx.fillStyle = "#f6f1d8";
    ctx.beginPath();
    ctx.rect(x - 2 * r, y - 2 * r, 4 * r, 4 * r);
    ctx.arc(x + r * 0.55, y - r * 0.2, r * 0.9, 0, Math.PI * 2);
    ctx.fill("evenodd");
    ctx.restore();
  }

  function drawSky(now) {
    const night = 1 - light;
    if (night > 0.01) {
      ctx.fillStyle = "rgba(8,14,40," + (NIGHT_TINT * night) + ")";
      ctx.fillRect(0, 0, W, H);
      if (SHOW_STARS) {
        ctx.fillStyle = "#ffffff";
        for (const s of stars) {
          ctx.globalAlpha = night * (0.35 + 0.65 * Math.abs(Math.sin(now * s.sp + s.ph))) * OPACITY;
          ctx.beginPath();
          ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.globalAlpha = 1;
      }
      if (SHOW_MOON) drawMoon(night);
    }
    if (warm > 0.01) {
      const g = ctx.createLinearGradient(0, H, 0, H * 0.3);
      g.addColorStop(0, "rgba(255,140,50," + (0.16 * warm) + ")");
      g.addColorStop(1, "rgba(255,140,50,0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  function makeParticle(cfg, anywhere) {
    return {
      x: rand(-0.2 * W, W),
      y: anywhere ? rand(-H * 0.1, H) : rand(-60, -10),
      size: rand(cfg.size[0], cfg.size[1]),
      vy: rand(cfg.fall[0], cfg.fall[1]),
      sway: rand(cfg.sway[0], cfg.sway[1]),
      phase: rand(0, Math.PI * 2),
      phaseSpeed: rand(0.01, 0.035),
      rot: rand(0, Math.PI * 2),
      vrot: rand(-0.03, 0.03),
      drag: rand(0.6, 1.4),
      color: pick(cfg.colors),
      alpha: rand(0.6, 1) * OPACITY,
    };
  }

  function buildParticles() {
    const cfg = SEASONS[season];
    const n = Math.round(cfg.count * DENSITY);
    particles = Array.from({ length: n }, () => makeParticle(cfg, true));
  }
  buildParticles();
  makeStars();

  // ---------- Wind ----------
  let t0 = performance.now();
  let nextGust = t0 + rand(GUST_EVERY[0], GUST_EVERY[1]) * 1000;
  let gustStart = 0;
  let gustPower = 0;

  function wind(now) {
    const base = 0.25 + Math.sin(now * 0.0003) * 0.2;
    if (now >= nextGust) {
      gustStart = now;
      gustPower = rand(5, 9);
      nextGust = now + rand(GUST_EVERY[0], GUST_EVERY[1]) * 1000;
    }
    const prog = (now - gustStart) / (GUST_LENGTH * 1000);
    const gust = prog >= 0 && prog <= 1 ? Math.sin(prog * Math.PI) * gustPower : 0;
    return { base, gust };
  }

  // ---------- Drawing ----------
  function drawLeaf(p) {
    const s = p.size;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.bezierCurveTo(s * 0.9, -s * 0.4, s * 0.7, s * 0.6, 0, s);
    ctx.bezierCurveTo(-s * 0.7, s * 0.6, -s * 0.9, -s * 0.4, 0, -s);
    ctx.fill();
    ctx.strokeStyle = "rgba(60,20,0,0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(0, s * 1.15);
    ctx.stroke();
  }

  function drawPetal(p) {
    const s = p.size;
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.55, s, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawFlake(p) {
    ctx.beginPath();
    ctx.arc(0, 0, p.size, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawMote(p, now) {
    const n = 1 - light; // 0 day, 1 night
    const fire = n > 0.5; // fireflies after dark
    const pulse = fire
      ? Math.pow(0.5 + 0.5 * Math.sin(now * 0.0015 + p.phase * 3), 2)
      : 0.35 + 0.35 * (0.5 + 0.5 * Math.sin(now * 0.002 + p.phase * 3));
    ctx.globalAlpha = p.alpha * pulse;
    const rad = p.size * (3 + 2 * n);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rad);
    g.addColorStop(0, fire ? "#d6ff7a" : p.color);
    g.addColorStop(1, fire ? "rgba(214,255,122,0)" : "rgba(255,240,170,0)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, rad, 0, Math.PI * 2);
    ctx.fill();
  }

  const DRAW = { leaf: drawLeaf, petal: drawPetal, flake: drawFlake, mote: drawMote };

  let last = performance.now();
  function frame(now) {
    const dt = Math.min((now - last) / 16.67, 3); // normalise to ~60fps
    last = now;

    ctx.clearRect(0, 0, W, H);
    drawSky(now);
    const cfg = SEASONS[season];
    const w = wind(now);
    const draw = DRAW[cfg.shape];

    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      p.phase += p.phaseSpeed * dt;
      p.rot += (p.vrot + w.gust * 0.004 * p.drag) * dt;

      const vx = w.base * p.drag + w.gust * p.drag + Math.sin(p.phase) * p.sway;
      p.x += vx * dt;
      p.y += (p.vy + Math.cos(p.phase * 0.7) * 0.2 + w.gust * 0.05) * dt;

      if (p.y > H + 40 || p.y < -80 || p.x > W + 60 || p.x < -80) {
        particles[i] = makeParticle(cfg, false);
        continue;
      }

      ctx.save();
      ctx.translate(p.x, p.y);
      if (cfg.shape === "mote") {
        draw(p, now);
      } else {
        ctx.rotate(p.rot);
        if (cfg.shape === "leaf" || cfg.shape === "petal") {
          ctx.scale(Math.max(0.25, Math.abs(Math.cos(p.phase))), 1); // tumbling flip
        }
        ctx.globalAlpha = p.alpha * (0.6 + 0.4 * light); // a little dimmer at night
        ctx.fillStyle = p.color;
        draw(p, now);
      }
      ctx.restore();
    }
    ctx.globalAlpha = 1;
    requestAnimationFrame(frame);
  }

  // Check for a season change every few minutes
  setInterval(() => {
    const s = currentSeason();
    if (s !== season) {
      season = s;
      buildParticles();
      // start new season's particles above the screen so they drift in
      particles.forEach((p) => (p.y = rand(-H, -10)));
    }
  }, 5 * 60 * 1000);

  // Pause when the tab/screen is hidden to save tablet battery
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) last = performance.now();
  });

  requestAnimationFrame(frame);
})();
