/**
 * Tactical Radar Scanner Canvas Engine
 * Simulates a high-precision military/pentest active target acquisition sonar.
 * Adapts dynamically to the active UI accent theme with high-luminance glowing optics.
 */

export interface TacticalRadarTarget {
  id: string;
  name: string;
  ip: string;
  port: string;
  angle: number; // in radians
  distance: number; // 0 to 1
  status: "vulnerable" | "hardened" | "exploitable" | "scanned";
  search?: string;
}

export interface TacticalRadarHandle {
  element: HTMLCanvasElement;
  destroy: () => void;
  setMode?: (mode: "red" | "blue") => void;
  pulseTarget: (id: string) => void;
}

function parseRgb(color: string): { r: number; g: number; b: number } {
  const clean = color.replace("#", "").trim();
  if (clean.length === 6) {
    return {
      r: parseInt(clean.slice(0, 2), 16),
      g: parseInt(clean.slice(2, 4), 16),
      b: parseInt(clean.slice(4, 6), 16),
    };
  }
  return { r: 0, g: 255, b: 157 };
}

function boostBrightness(rgb: { r: number; g: number; b: number }, boost = 0.38) {
  return {
    r: Math.min(255, Math.round(rgb.r * (1 - boost) + 255 * boost)),
    g: Math.min(255, Math.round(rgb.g * (1 - boost) + 255 * boost)),
    b: Math.min(255, Math.round(rgb.b * (1 - boost) + 255 * boost)),
  };
}

export function createTacticalRadar(
  size = 180,
  targets: TacticalRadarTarget[] = [],
  onTargetClick?: (target: TacticalRadarTarget) => void,
): TacticalRadarHandle {
  const canvas = document.createElement("canvas");
  canvas.className = "tactical-radar-canvas";
  canvas.width = size * window.devicePixelRatio;
  canvas.height = size * window.devicePixelRatio;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) {
    return {
      element: canvas,
      destroy: () => {},
      pulseTarget: () => {},
    };
  }

  let sweepAngle = 0;
  let running = true;
  let animId = 0;
  const pulsedTargets = new Set<string>();

  const center = (size * window.devicePixelRatio) / 2;
  const radius = center - 8 * window.devicePixelRatio;

  function render() {
    if (!running || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Dynamic theme color sampling with high-luminance boost
    const style = getComputedStyle(document.documentElement);
    const accent = style.getPropertyValue("--accent").trim() || "#00d4f0";
    const bright = style.getPropertyValue("--accent-bright").trim() || "#5ceaff";

    const brightRgb = parseRgb(bright || accent);
    const ultraBrightRgb = boostBrightness(brightRgb, 0.38);

    const ultraBright = `rgb(${ultraBrightRgb.r}, ${ultraBrightRgb.g}, ${ultraBrightRgb.b})`;
    const glowColor = `rgba(${ultraBrightRgb.r}, ${ultraBrightRgb.g}, ${ultraBrightRgb.b}, 0.7)`;
    const ringColor = `rgba(${brightRgb.r}, ${brightRgb.g}, ${brightRgb.b}, 0.32)`;
    const phosphorTrail = `rgba(${brightRgb.r}, ${brightRgb.g}, ${brightRgb.b}, 0.24)`;

    // 1. Radar background rings & grid
    ctx.lineWidth = 1.2 * window.devicePixelRatio;
    ctx.strokeStyle = ringColor;

    // Concentric range circles
    for (let step = 1; step <= 3; step++) {
      ctx.beginPath();
      ctx.arc(center, center, (radius * step) / 3, 0, Math.PI * 2);
      ctx.stroke();
    }

    // Crosshairs
    ctx.beginPath();
    ctx.moveTo(center - radius, center);
    ctx.lineTo(center + radius, center);
    ctx.moveTo(center, center - radius);
    ctx.lineTo(center, center + radius);
    ctx.stroke();

    // Outer perimeter ring with luminous glow
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.strokeStyle = ultraBright;
    ctx.lineWidth = 1.5 * window.devicePixelRatio;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 10;
    ctx.stroke();
    ctx.restore();

    // 2. Sweeping Beam
    sweepAngle = (sweepAngle + 0.035) % (Math.PI * 2);

    const sweepGradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
    sweepGradient.addColorStop(0, "rgba(255, 255, 255, 0.45)");
    sweepGradient.addColorStop(0.3, `rgba(${ultraBrightRgb.r}, ${ultraBrightRgb.g}, ${ultraBrightRgb.b}, 0.35)`);
    sweepGradient.addColorStop(1, phosphorTrail);

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, sweepAngle - 0.45, sweepAngle);
    ctx.closePath();
    ctx.fillStyle = sweepGradient;
    ctx.fill();
    ctx.restore();

    // Beam Line (Bright Neon with Bloom)
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(
      center + Math.cos(sweepAngle) * radius,
      center + Math.sin(sweepAngle) * radius,
    );
    ctx.strokeStyle = ultraBright;
    ctx.lineWidth = 2 * window.devicePixelRatio;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 14;
    ctx.stroke();
    ctx.restore();

    // Center emitter beacon
    ctx.save();
    ctx.beginPath();
    ctx.arc(center, center, 3.5 * window.devicePixelRatio, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.shadowColor = ultraBright;
    ctx.shadowBlur = 10;
    ctx.fill();
    ctx.restore();

    // 3. Targets
    targets.forEach((t) => {
      const tx = center + Math.cos(t.angle) * (radius * t.distance);
      const ty = center + Math.sin(t.angle) * (radius * t.distance);

      // Angle difference to sweep
      const angleDiff = Math.abs((sweepAngle - t.angle + Math.PI * 2) % (Math.PI * 2));
      const isLit = angleDiff < 0.38 || pulsedTargets.has(t.id);

      ctx.save();
      ctx.beginPath();
      ctx.arc(tx, ty, (isLit ? 5.5 : 4) * window.devicePixelRatio, 0, Math.PI * 2);
      ctx.fillStyle = isLit ? "#ffffff" : ultraBright;
      ctx.shadowColor = isLit ? "#ffffff" : glowColor;
      ctx.shadowBlur = isLit ? 16 : 8;
      ctx.fill();

      if (isLit) {
        ctx.beginPath();
        ctx.arc(tx, ty, 9 * window.devicePixelRatio, 0, Math.PI * 2);
        ctx.strokeStyle = ultraBright;
        ctx.lineWidth = 1.5 * window.devicePixelRatio;
        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 10;
        ctx.stroke();
      }
      ctx.restore();
    });

    animId = requestAnimationFrame(render);
  }

  // Click detection
  canvas.addEventListener("click", (e) => {
    const rect = canvas.getBoundingClientRect();
    const clickX = (e.clientX - rect.left) * window.devicePixelRatio;
    const clickY = (e.clientY - rect.top) * window.devicePixelRatio;

    for (const t of targets) {
      const tx = center + Math.cos(t.angle) * (radius * t.distance);
      const ty = center + Math.sin(t.angle) * (radius * t.distance);
      const dist = Math.hypot(clickX - tx, clickY - ty);
      if (dist < 18 * window.devicePixelRatio) {
        pulsedTargets.add(t.id);
        window.setTimeout(() => pulsedTargets.delete(t.id), 1200);
        onTargetClick?.(t);
        break;
      }
    }
  });

  animId = requestAnimationFrame(render);

  return {
    element: canvas,
    destroy() {
      running = false;
      cancelAnimationFrame(animId);
    },
    setMode(_newMode?: "red" | "blue") {
      // Kept for backward compatibility; radar now follows active theme color
    },
    pulseTarget(id: string) {
      pulsedTargets.add(id);
      window.setTimeout(() => pulsedTargets.delete(id), 1200);
    },
  };
}
