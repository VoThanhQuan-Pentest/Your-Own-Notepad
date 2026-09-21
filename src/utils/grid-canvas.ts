let canvas: HTMLCanvasElement | null = null;
let ctx: CanvasRenderingContext2D | null = null;
let animId: number | null = null;
let mouseX = -9999;
let mouseY = -9999;
let targetWorkspace: HTMLElement | null = null;
let radarAngle = 0;

interface Node {
  x: number;
  y: number;
  baseX: number;
  baseY: number;
  vx: number;
  vy: number;
  radius: number;
}

interface Mote {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  alpha: number;
  pulsePhase: number;
}

const nodes: Node[] = [];
const motes: Mote[] = [];
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

  // Initialize quantum motes
  motes.length = 0;
  const moteCount = Math.min(28, Math.max(12, Math.floor((width * height) / 45000)));
  for (let i = 0; i < moteCount; i++) {
    motes.push({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.45,
      vy: (Math.random() - 0.5) * 0.45,
      size: 1.2 + Math.random() * 2.0,
      alpha: 0.15 + Math.random() * 0.25,
      pulsePhase: Math.random() * Math.PI * 2,
    });
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
  const width = rect.width;
  const height = rect.height;
  ctx.clearRect(0, 0, width, height);

  const style = getComputedStyle(document.documentElement);
  const accent = style.getPropertyValue("--accent").trim() || "#00d4f0";

  // Center coordinates for radar
  const cx = width / 2;
  const cy = height / 2;
  const maxRadius = Math.sqrt(cx * cx + cy * cy);

  // Advance radar beam
  radarAngle = (radarAngle + 0.008) % (Math.PI * 2);

  // 1. Draw Radar Sweep Sector (faint tactical trail)
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(radarAngle);

  // Trailing soft cone
  const coneGrad = ctx.createLinearGradient(0, 0, maxRadius, 0);
  coneGrad.addColorStop(0, "rgba(255,255,255,0.015)");
  coneGrad.addColorStop(1, "transparent");
  ctx.fillStyle = coneGrad;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.arc(0, 0, maxRadius, -0.32, 0);
  ctx.closePath();
  ctx.fill();

  // Sharp leading laser line
  ctx.strokeStyle = accent;
  ctx.globalAlpha = 0.12;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(maxRadius, 0);
  ctx.stroke();
  ctx.restore();

  // 2. Draw Quantum Motes (ambient plasma dust)
  const moteCount = motes.length;
  for (let m = 0; m < moteCount; m++) {
    const mote = motes[m] as Mote;
    mote.x += mote.vx;
    mote.y += mote.vy;
    mote.pulsePhase += 0.025;

    // Boundary wrap
    if (mote.x < -10) mote.x = width + 10;
    else if (mote.x > width + 10) mote.x = -10;
    if (mote.y < -10) mote.y = height + 10;
    else if (mote.y > height + 10) mote.y = -10;

    // Mouse repulsion
    const dxM = mouseX - mote.x;
    const dyM = mouseY - mote.y;
    const distM = Math.sqrt(dxM * dxM + dyM * dyM);
    if (distM < 110) {
      mote.x -= (dxM / distM) * 1.5;
      mote.y -= (dyM / distM) * 1.5;
    }

    const pulsAlpha = mote.alpha * (0.8 + 0.3 * Math.sin(mote.pulsePhase));
    ctx.fillStyle = accent;
    ctx.globalAlpha = pulsAlpha;
    ctx.beginPath();
    ctx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. Draw Nodes & Connections with radar illumination
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
    let nodeAlpha = 0.12;
    if (distMouse < 160) {
      nodeAlpha = 0.12 + (1 - distMouse / 160) * 0.55;
    }

    // Radar illumination check
    const angleToNode = (Math.atan2(node.y - cy, node.x - cx) + Math.PI * 2) % (Math.PI * 2);
    let angleDiff = (radarAngle - angleToNode + Math.PI * 2) % (Math.PI * 2);
    if (angleDiff < 0.28) {
      nodeAlpha = Math.max(nodeAlpha, 0.45 * (1 - angleDiff / 0.28));
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
