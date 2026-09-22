import { element } from "./dom";

interface Point3D {
  x: number;
  y: number;
  z: number;
}

interface GlobeNode {
  lat: number;
  lon: number;
  blinkOffset: number;
}

/**
 * High-performance 3D Holographic Cyber Globe
 * Projects 3D wireframe spherical coordinates onto a 2D canvas with mouse tilt.
 * Renders complete 360-degree parallels and meridians with dual-pass depth shading.
 */
export function createCyberGlobe(width = 140, height = 140): {
  element: HTMLElement;
  destroy(): void;
} {
  const container = element("div", "cyber-globe-container");
  container.setAttribute("aria-hidden", "true");
  container.style.cssText = `position:relative;width:${width}px;height:${height}px;display:flex;align-items:center;justify-content:center;`;

  const canvas = document.createElement("canvas");
  canvas.className = "cyber-globe-canvas";
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;

  container.append(canvas);
  const ctx = canvas.getContext("2d");

  let rotX = 0.25;
  let rotY = 0;
  let targetRotX = 0.25;
  let targetRotY = 0;
  let animId: number | null = null;
  let disposed = false;

  const radius = width * 0.42 * dpr;
  const cx = (width / 2) * dpr;
  const cy = (height / 2) * dpr;

  // Tactical node points on the globe
  const nodes: GlobeNode[] = [
    { lat: 0.25, lon: 0.6, blinkOffset: 0 },
    { lat: -0.35, lon: 1.9, blinkOffset: 1.5 },
    { lat: 0.55, lon: 3.2, blinkOffset: 3.0 },
    { lat: -0.2, lon: 4.4, blinkOffset: 4.5 },
    { lat: 0.45, lon: 5.6, blinkOffset: 2.0 },
    { lat: -0.5, lon: 0.9, blinkOffset: 0.8 },
  ];

  function project(p: Point3D): { x: number; y: number; z: number } {
    // Rotate Y
    const cosY = Math.cos(rotY);
    const sinY = Math.sin(rotY);
    const x1 = p.x * cosY - p.z * sinY;
    const z1 = p.x * sinY + p.z * cosY;

    // Rotate X
    const cosX = Math.cos(rotX);
    const sinX = Math.sin(rotX);
    const y2 = p.y * cosX - z1 * sinX;
    const z2 = p.y * sinX + z1 * cosX;

    return {
      x: cx + x1,
      y: cy + y2,
      z: z2,
    };
  }

  let mounted = false;

  function render(): void {
    if (disposed || !ctx) return;
    if (mounted && !container.isConnected) {
      animId = null;
      return;
    }
    if (container.isConnected) {
      mounted = true;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const style = typeof document !== "undefined" ? getComputedStyle(document.documentElement) : null;
    const accent = style?.getPropertyValue("--accent").trim() || "#00d4f0";
    const bright = style?.getPropertyValue("--accent-bright").trim() || "#5ceaff";
    const isLowPower = typeof document !== "undefined" && document.documentElement.dataset.performance === "low-power";

    // Interpolate rotation towards target
    rotX += (targetRotX - rotX) * 0.05;
    rotY += (targetRotY - rotY) * 0.05;
    if (!isLowPower) {
      targetRotY += 0.008;
    }

    // Outer glow aura
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 1.25);
    grad.addColorStop(0, "transparent");
    grad.addColorStop(0.75, colorWithAlpha(accent, 0.09));
    grad.addColorStop(1, "transparent");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.15, 0, Math.PI * 2);
    ctx.fill();

    // 1. Draw Parallels (Latitude circles across the entire sphere)
    const latSteps = [-0.8, -0.55, -0.3, 0, 0.3, 0.55, 0.8];
    const segments = 48;

    latSteps.forEach((latFrac) => {
      const ringR = Math.sqrt(Math.max(0, 1 - latFrac * latFrac)) * radius;
      const ringY = latFrac * radius;
      const isEquator = latFrac === 0;

      // Dual pass: back (pass 0) and front (pass 1)
      for (let pass = 0; pass < 2; pass++) {
        const isFrontPass = pass === 1;
        ctx.strokeStyle = colorWithAlpha(
          accent,
          isFrontPass ? (isEquator ? 0.45 : 0.28) : (isEquator ? 0.16 : 0.08)
        );
        ctx.lineWidth = (isFrontPass && isEquator ? 1.4 : 1) * dpr;
        ctx.beginPath();
        let started = false;

        for (let s = 0; s <= segments; s++) {
          const theta = (s / segments) * Math.PI * 2;
          const pt = project({
            x: Math.cos(theta) * ringR,
            y: ringY,
            z: Math.sin(theta) * ringR,
          });

          const inPass = isFrontPass ? pt.z >= 0 : pt.z < 0;
          if (inPass) {
            if (!started) {
              ctx.moveTo(pt.x, pt.y);
              started = true;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          } else {
            started = false;
          }
        }
        ctx.stroke();
      }
    });

    // 2. Draw Meridians (8 Full circles spanning all 360 degrees)
    const lonCount = 8;
    const meridianSegments = 48;

    for (let m = 0; m < lonCount; m++) {
      const baseLon = (m / lonCount) * Math.PI;

      for (let pass = 0; pass < 2; pass++) {
        const isFrontPass = pass === 1;
        ctx.strokeStyle = colorWithAlpha(accent, isFrontPass ? 0.22 : 0.07);
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        let started = false;

        for (let s = 0; s <= meridianSegments; s++) {
          const phi = (s / meridianSegments) * Math.PI * 2;
          const pt = project({
            x: Math.cos(baseLon) * Math.cos(phi) * radius,
            y: Math.sin(phi) * radius,
            z: Math.sin(baseLon) * Math.cos(phi) * radius,
          });

          const inPass = isFrontPass ? pt.z >= 0 : pt.z < 0;
          if (inPass) {
            if (!started) {
              ctx.moveTo(pt.x, pt.y);
              started = true;
            } else {
              ctx.lineTo(pt.x, pt.y);
            }
          } else {
            started = false;
          }
        }
        ctx.stroke();
      }
    }

    // 3. Crisp outer silhouette boundary circle
    ctx.strokeStyle = colorWithAlpha(accent, 0.28);
    ctx.lineWidth = 1.2 * dpr;
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Draw Nodes (Blinking Tactical Command Nodes on front hemisphere)
    const time = performance.now() * 0.003;
    nodes.forEach((node) => {
      const cosLat = Math.cos(node.lat);
      const pt = project({
        x: Math.cos(node.lon) * cosLat * radius,
        y: Math.sin(node.lat) * radius,
        z: Math.sin(node.lon) * cosLat * radius,
      });

      if (pt.z > 0) {
        const alpha = 0.4 + 0.5 * Math.sin(time + node.blinkOffset);
        ctx.fillStyle = bright;
        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 2.8 * dpr, 0, Math.PI * 2);
        ctx.fill();

        // Node halo
        ctx.strokeStyle = accent;
        ctx.lineWidth = 1 * dpr;
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, 5 * dpr, 0, Math.PI * 2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    });

    if (!isLowPower) {
      animId = window.requestAnimationFrame(render);
    }
  }

  function colorWithAlpha(color: string, alpha: number): string {
    if (color.startsWith("#")) {
      const hex = color.slice(1);
      const r = parseInt(hex.slice(0, 2), 16) || 0;
      const g = parseInt(hex.slice(2, 4), 16) || 212;
      const b = parseInt(hex.slice(4, 6), 16) || 240;
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return color;
  }

  // Mouse interaction
  const onPointerMove = (e: PointerEvent) => {
    const rect = container.getBoundingClientRect();
    const mx = (e.clientX - (rect.left + rect.width / 2)) / (rect.width / 2);
    const my = (e.clientY - (rect.top + rect.height / 2)) / (rect.height / 2);
    targetRotX = 0.25 - my * 0.4;
    targetRotY += mx * 0.03;
  };

  container.addEventListener("pointermove", onPointerMove, { passive: true });

  animId = window.requestAnimationFrame(render);

  return {
    element: container,
    destroy() {
      disposed = true;
      if (animId !== null) {
        window.cancelAnimationFrame(animId);
        animId = null;
      }
      container.removeEventListener("pointermove", onPointerMove);
      container.remove();
    },
  };
}
