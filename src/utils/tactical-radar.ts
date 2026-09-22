/**
 * Tactical Radar Scanner Canvas Engine
 * Simulates a high-precision military/pentest active target acquisition sonar.
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
  setMode: (mode: "red" | "blue") => void;
  pulseTarget: (id: string) => void;
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
      setMode: () => {},
      pulseTarget: () => {},
    };
  }

  let mode: "red" | "blue" = "red";
  let sweepAngle = 0;
  let running = true;
  let animId = 0;
  const pulsedTargets = new Set<string>();

  const primaryColor = () => (mode === "red" ? "#ff3366" : "#00f0ff");
  const glowColor = () => (mode === "red" ? "rgba(255, 51, 102, 0.4)" : "rgba(0, 240, 255, 0.4)");
  const phosphorTrail = () => (mode === "red" ? "rgba(255, 51, 102, 0.12)" : "rgba(0, 240, 255, 0.12)");

  const center = (size * window.devicePixelRatio) / 2;
  const radius = center - 8 * window.devicePixelRatio;

  function render() {
    if (!running || !ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // 1. Radar background rings
    ctx.lineWidth = 1 * window.devicePixelRatio;
    ctx.strokeStyle = mode === "red" ? "rgba(255, 51, 102, 0.18)" : "rgba(0, 240, 255, 0.18)";

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

    // Diagonal coordinate tick marks
    ctx.beginPath();
    ctx.arc(center, center, radius, 0, Math.PI * 2);
    ctx.strokeStyle = primaryColor();
    ctx.stroke();

    // 2. Sweeping Beam
    sweepAngle = (sweepAngle + 0.035) % (Math.PI * 2);

    const sweepGradient = ctx.createRadialGradient(center, center, 0, center, center, radius);
    sweepGradient.addColorStop(0, "rgba(255, 255, 255, 0.15)");
    sweepGradient.addColorStop(1, phosphorTrail());

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.arc(center, center, radius, sweepAngle - 0.4, sweepAngle);
    ctx.closePath();
    ctx.fillStyle = sweepGradient;
    ctx.fill();
    ctx.restore();

    // Beam Line
    ctx.beginPath();
    ctx.moveTo(center, center);
    ctx.lineTo(
      center + Math.cos(sweepAngle) * radius,
      center + Math.sin(sweepAngle) * radius,
    );
    ctx.strokeStyle = mode === "red" ? "#ff6688" : "#80f8ff";
    ctx.lineWidth = 1.5 * window.devicePixelRatio;
    ctx.shadowColor = glowColor();
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // 3. Targets
    targets.forEach((t) => {
      const tx = center + Math.cos(t.angle) * (radius * t.distance);
      const ty = center + Math.sin(t.angle) * (radius * t.distance);

      // Angle difference to sweep
      const angleDiff = Math.abs((sweepAngle - t.angle + Math.PI * 2) % (Math.PI * 2));
      const isLit = angleDiff < 0.35 || pulsedTargets.has(t.id);

      ctx.save();
      ctx.beginPath();
      ctx.arc(tx, ty, (isLit ? 5 : 3.5) * window.devicePixelRatio, 0, Math.PI * 2);
      ctx.fillStyle = isLit ? "#ffffff" : primaryColor();
      ctx.shadowColor = primaryColor();
      ctx.shadowBlur = isLit ? 12 : 4;
      ctx.fill();

      if (isLit) {
        ctx.beginPath();
        ctx.arc(tx, ty, 8 * window.devicePixelRatio, 0, Math.PI * 2);
        ctx.strokeStyle = primaryColor();
        ctx.lineWidth = 1 * window.devicePixelRatio;
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
    setMode(newMode: "red" | "blue") {
      mode = newMode;
    },
    pulseTarget(id: string) {
      pulsedTargets.add(id);
      window.setTimeout(() => pulsedTargets.delete(id), 1200);
    },
  };
}
