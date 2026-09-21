interface Spark {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
  maxLife: number;
}

let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let sparks: Spark[] = [];
let animId: number | null = null;

const SPARK_COLORS = ["#00e5ff", "#00ff9d", "#ffffff", "#ffd166", "#bd93f9"];

function isFullPerformance(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.performance === "full"
  );
}

function ensureCanvas(): HTMLCanvasElement | null {
  if (typeof document === "undefined") return null;
  if (canvas && canvas.isConnected) return canvas;

  const workspace = document.querySelector<HTMLElement>(".workspace");
  if (!workspace) return null;

  canvas = document.createElement("canvas");
  canvas.className = "cyber-spark-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.cssText =
    "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:999;overflow:hidden;";

  workspace.append(canvas);
  resizeCanvas();
  ctx = canvas.getContext("2d");
  return canvas;
}

function resizeCanvas(): void {
  if (!canvas) return;
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
}

export function triggerSparkBurst(clientX: number, clientY: number): void {
  if (!isFullPerformance()) return;

  const c = ensureCanvas();
  if (!c || !ctx) return;

  const rect = c.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const startX = (clientX - rect.left) * dpr;
  const startY = (clientY - rect.top) * dpr;

  const count = 16 + Math.floor(Math.random() * 8);
  for (let i = 0; i < count; i++) {
    const angle = Math.random() * Math.PI * 2;
    const speed = (2.5 + Math.random() * 5.5) * dpr;
    const maxLife = 20 + Math.floor(Math.random() * 15);
    sparks.push({
      x: startX,
      y: startY,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      color: SPARK_COLORS[Math.floor(Math.random() * SPARK_COLORS.length)] as string,
      size: (1.5 + Math.random() * 1.5) * dpr,
      life: maxLife,
      maxLife,
    });
  }

  if (animId === null) {
    animId = window.requestAnimationFrame(renderLoop);
  }
}

function renderLoop(): void {
  if (!canvas || !ctx) {
    animId = null;
    return;
  }

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = sparks.length - 1; i >= 0; i--) {
    const s = sparks[i] as Spark;
    s.life -= 1;
    if (s.life <= 0) {
      sparks.splice(i, 1);
      continue;
    }

    s.x += s.vx;
    s.y += s.vy;
    s.vx *= 0.92;
    s.vy *= 0.92;

    const progress = s.life / s.maxLife;
    ctx.save();
    ctx.globalAlpha = progress;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = s.size * progress;
    ctx.lineCap = "round";

    ctx.beginPath();
    ctx.moveTo(s.x - s.vx * 1.8, s.y - s.vy * 1.8);
    ctx.lineTo(s.x, s.y);
    ctx.stroke();

    ctx.restore();
  }

  if (sparks.length > 0) {
    animId = window.requestAnimationFrame(renderLoop);
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    animId = null;
  }
}
