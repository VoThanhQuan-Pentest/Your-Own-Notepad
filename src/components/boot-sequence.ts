import {
  playCyberBootSequence,
  speakSystemGreeting,
  playReactorOverload,
  playEmpDistortion,
  playCircuitSurgeAudio,
  playLaserChirp,
} from "../services/audio";
import { element } from "../utils/dom";
import { triggerSparkBurst, triggerHexShockwave } from "../utils/particles";

export interface BootSequenceOptions {
  displayName?: string | null;
  appVersion?: string;
}

/**
 * Command Vault v0.17.0 - Brutalist Cybernetic Intro
 * Style 3: Lõi Phản Ứng Quá Tải (Reactor Core Supernova / Critical Ignition)
 *
 * Cinematic Flow:
 * - Centerpiece: Tokamak Fusion Reactor with 3 counter-rotating magnetic containment rings
 * - Interactive: Hold / click reactor core button to initiate criticality
 * - Phase 1: Turbine spools up, magnetic coils accelerate, plasma core turns white-hot (400ms)
 * - Phase 2: Containment dampers breach, rings shatter outward, arcs and EMP shockwaves blast (350ms)
 * - Phase 3: Supernova blast wave washes across screen, dissolving into Workspace (900ms)
 */
export function runBootSequence(options: BootSequenceOptions = {}, force = false): Promise<void> {
  return new Promise((resolve) => {
    if (typeof document === "undefined") {
      resolve();
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const isE2E =
      typeof window !== "undefined" &&
      (window.location.pathname.includes("e2e.html") ||
        document.querySelector("#e2e-state") !== null ||
        searchParams.has("skip-welcome") ||
        searchParams.has("skip-boot") ||
        document.documentElement.dataset.performance === "low-power");

    if (!force && isE2E) {
      resolve();
      return;
    }

    const overlay = element("div", "cyber-boot-overlay reactor-core-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Tokamak Fusion Reactor Core Ignition");

    // The Reactor Stage Container
    const reactorStage = element("div", "reactor-stage");

    // Supernova Blast Flash Layer
    const blastFlash = element("div", "reactor-supernova-blast");

    // Reactor Chamber assembly
    const chamber = element("div", "reactor-chamber");

    // Ambient background flux grid
    const fluxGrid = element("div", "reactor-flux-grid");

    // 3 Counter-Rotating Magnetic Containment Damper Rings
    const ringOuter = element("div", "containment-ring ring-outer");
    const ringMiddle = element("div", "containment-ring ring-middle");
    const ringInner = element("div", "containment-ring ring-inner");

    // Central Heavy Reactor Sphere & Actuator Button
    const coreSphere = element("div", "reactor-core-sphere");
    const actuatorBtn = element("button", "reactor-actuator-btn");
    actuatorBtn.setAttribute("type", "button");
    actuatorBtn.setAttribute("aria-label", "Initiate Tokamak Reactor Critical Overload");

    const plasmaOrb = element("div", "reactor-plasma-orb");
    const coreHeatHaze = element("div", "reactor-heat-haze");
    const coreIcon = element("div", "reactor-core-icon");
    coreIcon.innerHTML = `
      <svg viewBox="0 0 48 48" class="reactor-svg" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="24" cy="24" r="16" stroke-dasharray="4 2"/>
        <circle cx="24" cy="24" r="8"/>
        <path d="M24 4 V12 M24 36 V44 M4 24 H12 M36 24 H44"/>
        <circle cx="24" cy="24" r="3" fill="currentColor"/>
      </svg>
    `;
    actuatorBtn.append(coreHeatHaze, plasmaOrb, coreIcon);
    coreSphere.append(actuatorBtn);

    // Stencil, Diagnostics & Guidance Labels
    const titleLabel = element("div", "reactor-title-label", "COMMAND VAULT // TOKAMAK KERNEL");
    const statusBadge = element("div", "reactor-status-badge", "[ CORE TEMP: 4.8M K // CONTAINMENT STABLE ]");
    const hintLabel = element("div", "reactor-hint-label", "✦ CLICK CORE TO INITIATE CRITICAL OVERCHARGE ✦");
    const skipHint = element("div", "reactor-skip-hint", "[ ESC TO SKIP // SPACE TO DETONATE ]");

    chamber.append(
      fluxGrid,
      ringOuter,
      ringMiddle,
      ringInner,
      coreSphere,
      titleLabel,
      statusBadge,
      hintLabel,
      skipHint,
    );

    reactorStage.append(blastFlash, chamber);
    overlay.append(reactorStage);
    document.body.append(overlay);

    let dismissed = false;
    let running = false;
    const timers: number[] = [];

    // ==========================================
    // Critical Overcharge Ignition Execution
    // ==========================================
    function igniteReactor() {
      if (running || dismissed) return;
      running = true;

      // Phase 1 (t = 0ms): Spooling turbine, coils accelerate, heat escalates
      chamber.classList.add("reactor-spooling", "reactor-shaking");
      statusBadge.textContent = "[ CRITICALITY OVERCHARGE: 99.9% // WARNING ]";
      statusBadge.classList.add("status-overcharge");

      playReactorOverload();
      playCircuitSurgeAudio();

      const rect = actuatorBtn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Phase 2 (t = 400ms): Damper breach, rings shatter outward, arcs and EMP
      const t1 = window.setTimeout(() => {
        if (dismissed) return;
        chamber.classList.remove("reactor-shaking");
        chamber.classList.add("reactor-breached");
        statusBadge.textContent = "[ CONTAINMENT PURGED // SUPERNOVA IGNITION ]";
        statusBadge.classList.add("status-purged");

        triggerSparkBurst(cx, cy);
        triggerHexShockwave(cx, cy);
        playEmpDistortion();
        playLaserChirp();
      }, 400);
      timers.push(t1);

      // Phase 3 (t = 780ms): Supernova blast wave washes across screen
      const t2 = window.setTimeout(() => {
        if (dismissed) return;
        blastFlash.classList.add("supernova-blooming");
        chamber.classList.add("reactor-dissolving");

        playCyberBootSequence();
        if (options.displayName) {
          speakSystemGreeting(options.displayName);
        }
      }, 780);
      timers.push(t2);

      // Phase 4 (t = 1750ms): Smooth overlay fadeout
      const t3 = window.setTimeout(() => {
        if (dismissed) return;
        overlay.classList.add("reactor-overlay-fadeout");
      }, 1750);
      timers.push(t3);

      // Phase 5 (t = 2050ms): Resolve and remove
      const t4 = window.setTimeout(() => {
        finish();
      }, 2050);
      timers.push(t4);
    }

    function finish() {
      if (dismissed) return;
      dismissed = true;
      timers.forEach((t) => window.clearTimeout(t));
      window.removeEventListener("keydown", onKeyDown);
      overlay.remove();
      resolve();
    }

    actuatorBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      igniteReactor();
    });

    chamber.addEventListener("click", (e) => {
      e.stopPropagation();
      igniteReactor();
    });

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        finish();
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.stopPropagation();
        e.preventDefault();
        igniteReactor();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);

    // Auto-ignite fallback after 5.0s if user is idle
    const autoIgnite = window.setTimeout(() => {
      if (!running && !dismissed) {
        igniteReactor();
      }
    }, 5000);
    timers.push(autoIgnite);
  });
}
