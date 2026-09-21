/**
 * Matrix Digital Rain ambient overlay
 * Toggleable ambient stream of falling cryptographic hex/katakana glyphs
 */

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let animId: number | null = null;
let active = false;
let columns: number[] = [];
const FONT_SIZE = 14;
const CHARS = "0123456789ABCDEF01010101XYZΩλµπ§±√∞≈<>{}[]/*";

function resize(): void {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = window.innerWidth;
  const h = window.innerHeight;
  canvas.width = w * dpr;
  canvas.height = h * dpr;
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.font = `${FONT_SIZE}px ui-monospace, SFMono-Regular, monospace`;
  }

  const colCount = Math.floor(w / FONT_SIZE);
  columns = new Array(colCount).fill(0).map(() => Math.floor(Math.random() * -50));
}

function draw(): void {
  if (!active || !canvas || !ctx) return;

  const isLowPower = typeof document !== "undefined" && document.documentElement.dataset.performance === "low-power";
  if (isLowPower) {
    stopMatrixRain();
    return;
  }

  const style = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
  const accent = style?.getPropertyValue("--accent").trim() || "#00d4f0";
  const bright = style?.getPropertyValue("--accent-bright").trim() || "#5ceaff";

  const w = window.innerWidth;
  const h = window.innerHeight;

  // Semi-transparent fade background to create trail
  ctx.fillStyle = "rgba(7, 11, 17, 0.08)";
  ctx.fillRect(0, 0, w, h);

  for (let i = 0; i < columns.length; i++) {
    const char = CHARS[Math.floor(Math.random() * CHARS.length)];
    const x = i * FONT_SIZE;
    const y = columns[i] * FONT_SIZE;

    if (y >= 0 && y <= h + FONT_SIZE) {
      // Glow head of the drop
      ctx.fillStyle = "#ffffff";
      ctx.shadowColor = bright;
      ctx.shadowBlur = 6;
      ctx.fillText(char, x, y);

      // Trailing character behind
      const trailChar = CHARS[Math.floor(Math.random() * CHARS.length)];
      ctx.fillStyle = accent;
      ctx.shadowBlur = 0;
      ctx.fillText(trailChar, x, y - FONT_SIZE);
    }

    if (y > h && Math.random() > 0.975) {
      columns[i] = 0;
    } else {
      columns[i]++;
    }
  }

  animId = window.requestAnimationFrame(draw);
}

export function isMatrixRainActive(): boolean {
  return active;
}

export function startMatrixRain(): void {
  if (active) return;
  if (typeof document === "undefined") return;
  if (document.documentElement.dataset.performance === "low-power") return;

  active = true;
  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "matrix-rain-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText = `
      position: fixed;
      inset: 0;
      width: 100vw;
      height: 100vh;
      pointer-events: none;
      z-index: 12;
      opacity: 0.22;
      mix-blend-mode: screen;
      transition: opacity 0.5s ease-in-out;
    `;
    window.addEventListener("resize", resize, { passive: true });
  }

  document.body.append(canvas);
  ctx = canvas.getContext("2d");
  resize();
  animId = window.requestAnimationFrame(draw);
}

export function stopMatrixRain(): void {
  if (!active) return;
  active = false;
  if (animId !== null) {
    window.cancelAnimationFrame(animId);
    animId = null;
  }
  if (canvas) {
    canvas.remove();
    ctx = null;
  }
}

export function toggleMatrixRain(): boolean {
  if (active) {
    stopMatrixRain();
  } else {
    startMatrixRain();
  }
  return active;
}
