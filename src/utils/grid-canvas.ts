let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let animId: number | null = null;
let mouseX = -9999;
let mouseY = -9999;
let targetWorkspace: HTMLElement | null = null;

interface Node {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  radius: number;
}

const nodes: Node[] = [];
const NODE_SPACING = 75;
const MAX_CONNECT_DIST = 95;

function isFullPerformance(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.performance === "full"
  );
}

function initNodes(width: number, height: number): void {
  nodes.length = 0;
  const cols = Math.ceil(width / NODE_SPACING) + 1;
  const rows = Math.ceil(height / NODE_SPACING) + 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const x = c * NODE_SPACING + (r % 2 === 1 ? NODE_SPACING / 2 : 0);
      const y = r * NODE_SPACING;
      nodes.push({
        x,
        y,
        baseX: x,
        baseY: y,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        radius: 1.2 + Math.random() * 0.8,
      });
    }
  }
}

function resize(): void {
  if (!canvas || !targetWorkspace) return;
  const rect = targetWorkspace.getBoundingClientRect();
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.floor(rect.width);
  const h = Math.floor(rect.height);

  canvas.width = Math.floor(w * dpr);
  canvas.height = Math.floor(h * dpr);
  canvas.style.width = `${w}px`;
  canvas.style.height = `${h}px`;

  if (ctx) {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  initNodes(w, h);
}

function render(): void {
  if (!isFullPerformance() || !canvas || !ctx || !targetWorkspace) {
    stopGridCanvas();
    return;
  }

  const rect = targetWorkspace.getBoundingClientRect();
  ctx.clearRect(0, 0, rect.width, rect.height);

  const style = getComputedStyle(document.documentElement);
  const accent = style.getPropertyValue("--accent").trim() || "#00d4f0";

  // Draw connecting threads near mouse
  ctx.lineWidth = 0.8;
  const nodeCount = nodes.length;

  for (let i = 0; i < nodeCount; i++) {
    const node = nodes[i] as Node;

    // Gentle floating motion
    node.x += node.vx;
    node.y += node.vy;

    if (Math.abs(node.x - node.baseX) > 12) node.vx *= -1;
    if (Math.abs(node.y - node.baseY) > 12) node.vy *= -1;

    const dxMouse = mouseX - node.x;
    const dyMouse = mouseY - node.y;
    const distMouse = Math.sqrt(dxMouse * dxMouse + dyMouse * dyMouse);

    // Mouse proximity repulsion/glow
    let nodeAlpha = 0.15;
    if (distMouse < 160) {
      nodeAlpha = 0.15 + (1 - distMouse / 160) * 0.55;
    }

    ctx.fillStyle = accent;
    ctx.globalAlpha = nodeAlpha;
    ctx.beginPath();
    ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
    ctx.fill();

    // Check neighbors for connection lines near mouse
    if (distMouse < 200) {
      for (let j = i + 1; j < nodeCount; j++) {
        const other = nodes[j] as Node;
        const dx = node.x - other.x;
        const dy = node.y - other.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < MAX_CONNECT_DIST) {
          const lineAlpha = (1 - dist / MAX_CONNECT_DIST) * (1 - distMouse / 200) * 0.45;
          ctx.strokeStyle = accent;
          ctx.globalAlpha = lineAlpha;
          ctx.beginPath();
          ctx.moveTo(node.x, node.y);
          ctx.lineTo(other.x, other.y);
          ctx.stroke();
        }
      }
    }
  }

  ctx.globalAlpha = 1;
  animId = window.requestAnimationFrame(render);
}

export function initGridCanvas(workspace: HTMLElement): () => void {
  targetWorkspace = workspace;

  if (!isFullPerformance()) {
    return () => {};
  }

  if (!canvas) {
    canvas = document.createElement("canvas");
    canvas.className = "cyber-grid-canvas";
    canvas.setAttribute("aria-hidden", "true");
    canvas.style.cssText =
      "position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0;opacity:0.65;transition:opacity 0.4s ease;";
  }

  if (!canvas.isConnected) {
    workspace.prepend(canvas);
  }

  ctx = canvas.getContext("2d");
  resize();

  const onPointerMove = (e: PointerEvent) => {
    if (!targetWorkspace) return;
    const rect = targetWorkspace.getBoundingClientRect();
    mouseX = e.clientX - rect.left;
    mouseY = e.clientY - rect.top;
  };

  const onPointerLeave = () => {
    mouseX = -9999;
    mouseY = -9999;
  };

  const onResize = () => {
    resize();
  };

  window.addEventListener("resize", onResize, { passive: true });
  workspace.addEventListener("pointermove", onPointerMove, { passive: true });
  workspace.addEventListener("pointerleave", onPointerLeave, { passive: true });

  if (animId === null) {
    animId = window.requestAnimationFrame(render);
  }

  return () => {
    window.removeEventListener("resize", onResize);
    workspace.removeEventListener("pointermove", onPointerMove);
    workspace.removeEventListener("pointerleave", onPointerLeave);
    stopGridCanvas();
  };
}

export function stopGridCanvas(): void {
  if (animId !== null) {
    window.cancelAnimationFrame(animId);
    animId = null;
  }
  if (canvas && canvas.isConnected) {
    canvas.remove();
  }
}
