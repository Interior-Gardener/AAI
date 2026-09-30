// Decorative motion: scroll reveals, hero particle network, rotating words, tilt & magnetic hovers,
// the self-playing demo card. Everything respects prefers-reduced-motion.

import { $, $$, countUp, reducedMotion, sleep, typewrite } from "./ui.js";

export function initEffects() {
  initReveal();
  initScrollChrome();
  initCursorGlow();
  initWordRotator();
  initHoverFx();
  initHeroCanvas();
}

/* ---------- Reveal on scroll (+ count-ups, + flow animation) ---------- */
function initReveal() {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const el = entry.target;
        el.classList.add("visible");
        $$(".count", el).forEach((c) => countUp(c, Number(c.dataset.to)));
        io.unobserve(el);
      }
    },
    { threshold: 0.12, rootMargin: "0px 0px -40px 0px" },
  );
  // Stagger siblings for a cascading entrance.
  $$(".tech-grid, .team-grid, .hero-copy").forEach((group) =>
    $$(".reveal", group).forEach((el, i) => el.style.setProperty("--delay", `${i * 0.08}s`)),
  );
  $$(".reveal, .flow").forEach((el) => io.observe(el));
}

/* ---------- Nav background, progress bar, active section link ---------- */
function initScrollChrome() {
  const nav = $("#nav");
  const bar = $(".scroll-progress");
  const links = $$(".nav-links a[href^='#']");
  const sections = links.map((a) => $(a.getAttribute("href"))).filter(Boolean);
  let ticking = false;
  const update = () => {
    ticking = false;
    const y = window.scrollY;
    nav.classList.toggle("scrolled", y > 20);
    const max = document.documentElement.scrollHeight - window.innerHeight;
    bar.style.transform = `scaleX(${max > 0 ? y / max : 0})`;
    let active = null;
    for (const s of sections) if (s.getBoundingClientRect().top < window.innerHeight * 0.4) active = s.id;
    links.forEach((a) => a.classList.toggle("active", a.getAttribute("href") === `#${active}`));
  };
  window.addEventListener("scroll", () => {
    if (!ticking) {
      ticking = true;
      requestAnimationFrame(update);
    }
  }, { passive: true });
  update();
}

function initCursorGlow() {
  if (reducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
  const glow = $(".cursor-glow");
  let x = 0, y = 0, cx = 0, cy = 0, frame = 0;
  // Ease towards the pointer, and stop scheduling frames once it has caught up.
  const loop = () => {
    cx += (x - cx) * 0.12;
    cy += (y - cy) * 0.12;
    glow.style.transform = `translate(${cx}px, ${cy}px)`;
    frame = Math.abs(x - cx) + Math.abs(y - cy) > 0.5 ? requestAnimationFrame(loop) : 0;
  };
  window.addEventListener("pointermove", (e) => {
    x = e.clientX;
    y = e.clientY;
    document.body.classList.add("has-pointer");
    if (!frame) frame = requestAnimationFrame(loop);
  }, { passive: true });
}

/* ---------- "Turn pixels into ___" ---------- */
function initWordRotator() {
  const box = $("#wordRotator");
  const words = ["prose.", "stories.", "captions.", "insight.", "words."];
  let i = 0;
  if (reducedMotion()) return;
  setInterval(() => {
    const old = box.firstElementChild;
    i = (i + 1) % words.length;
    const next = document.createElement("span");
    next.textContent = words[i];
    next.className = "in";
    old.className = "out";
    box.append(next);
    old.addEventListener("animationend", () => old.remove(), { once: true });
  }, 2600);
}

/* ---------- Magnetic buttons, 3D tilt, spotlight cards ---------- */
function initHoverFx() {
  if (reducedMotion() || !window.matchMedia("(pointer: fine)").matches) return;
  $$(".magnetic").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = `translate(${dx * 0.18}px, ${dy * 0.25}px)`;
    });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });
  $$(".tilt").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      el.style.transform = `rotateY(${px * 10}deg) rotateX(${-py * 10}deg) translateZ(0)`;
    });
    el.addEventListener("pointerleave", () => (el.style.transform = ""));
  });
  $$(".tech-card").forEach((el) => {
    el.addEventListener("pointermove", (e) => {
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${e.clientX - r.left}px`);
      el.style.setProperty("--my", `${e.clientY - r.top}px`);
    });
  });
}

/* ---------- Hero: drifting "neural" particle network ---------- */
function initHeroCanvas() {
  const canvas = $("#heroCanvas");
  const ctx = canvas.getContext("2d");
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  let w, h, points = [], running = true;
  const mouse = { x: -9999, y: -9999 };

  const resize = () => {
    w = canvas.offsetWidth;
    h = canvas.offsetHeight;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const count = Math.round(Math.min(90, (w * h) / 16000));
    points = Array.from({ length: count }, () => ({
      x: Math.random() * w, y: Math.random() * h,
      vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
      r: Math.random() * 1.6 + 0.6,
    }));
  };
  resize();
  window.addEventListener("resize", resize);
  canvas.parentElement.addEventListener("pointermove", (e) => {
    const r = canvas.getBoundingClientRect();
    mouse.x = e.clientX - r.left;
    mouse.y = e.clientY - r.top;
  });
  canvas.parentElement.addEventListener("pointerleave", () => (mouse.x = mouse.y = -9999));
  new IntersectionObserver(([e]) => {
    running = e.isIntersecting;
    if (running) requestAnimationFrame(draw);
  }).observe(canvas);

  function draw() {
    if (!running) return;
    const dark = document.documentElement.dataset.theme !== "light";
    ctx.clearRect(0, 0, w, h);
    for (const p of points) {
      if (!reducedMotion()) {
        p.x += p.vx;
        p.y += p.vy;
      }
      if (p.x < 0 || p.x > w) p.vx *= -1;
      if (p.y < 0 || p.y > h) p.vy *= -1;
      const dx = mouse.x - p.x, dy = mouse.y - p.y, d = Math.hypot(dx, dy);
      if (d < 160) {
        p.x -= dx * 0.004;
        p.y -= dy * 0.004;
      }
    }
    for (let i = 0; i < points.length; i++) {
      for (let j = i + 1; j < points.length; j++) {
        const a = points[i], b = points[j];
        const d = Math.hypot(a.x - b.x, a.y - b.y);
        if (d < 130) {
          ctx.strokeStyle = dark ? `rgba(139,92,246,${(1 - d / 130) * 0.35})` : `rgba(99,102,241,${(1 - d / 130) * 0.25})`;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }
    }
    for (const p of points) {
      const near = Math.hypot(mouse.x - p.x, mouse.y - p.y) < 160;
      ctx.fillStyle = near ? "#22d3ee" : dark ? "rgba(200,190,255,.7)" : "rgba(80,70,180,.55)";
      ctx.beginPath();
      ctx.arc(p.x, p.y, near ? p.r + 1 : p.r, 0, Math.PI * 2);
      ctx.fill();
    }
    requestAnimationFrame(draw);
  }
  requestAnimationFrame(draw);
}

/* ---------- Hero demo card: loops through real captions produced by the model ---------- */
// Captions and match scores below are real outputs of the large model; boxes are [left, top, width, height] in %.
const DEMOS = [
  { src: "/samples/people/woman_and_dog_on_beach.jpg", text: "a woman sitting on a beach next to a dog", score: 0.997, boxes: [[20, 24, 34, 52], [57, 36, 22, 40]] },
  { src: "/samples/animals/two_cats_sleeping.jpg", text: "a couple of cats laying on top of a pink couch", score: 0.999, boxes: [[1, 12, 48, 85], [52, 10, 45, 70]] },
  { src: "/samples/animals/giraffe_and_zebra.jpg", text: "a giraffe standing next to a zebra in a field", score: 0.929, boxes: [[33, 5, 50, 85], [49, 40, 31, 57]] },
  { src: "/samples/vehicles/red_sports_car.jpg", text: "a close up of a car on a reflective surface", score: 0.993, boxes: [[2, 16, 96, 68], [26, 52, 16, 32]] },
];

export async function runDemoCard() {
  const card = $("#demoCard");
  const img = $("#demoImg");
  const text = $("#demoText");
  const meter = $("#demoMeter");
  let visible = true;
  new IntersectionObserver(([e]) => (visible = e.isIntersecting)).observe(card);
  let i = 0;
  while (true) {
    while (!visible || document.hidden) await sleep(400); // don't animate off-screen
    const demo = DEMOS[i % DEMOS.length];
    img.classList.add("fade");
    await sleep(350);
    img.src = demo.src;
    await img.decode().catch(() => {});
    img.classList.remove("fade");
    card.classList.remove("found");
    $$(".demo-boxes span", card).forEach((box, k) => {
      const [l, t, w, h] = demo.boxes[k];
      Object.assign(box.style, { left: `${l}%`, top: `${t}%`, width: `${w}%`, height: `${h}%` });
    });
    card.classList.add("scanning");
    text.textContent = "";
    meter.style.width = "0";
    await sleep(reducedMotion() ? 200 : 1800);
    card.classList.remove("scanning");
    card.classList.add("found");
    meter.style.width = `${demo.score * 100}%`;
    await typewrite(text, demo.text, reducedMotion() ? 0 : 26);
    await sleep(2600);
    i++;
  }
}
