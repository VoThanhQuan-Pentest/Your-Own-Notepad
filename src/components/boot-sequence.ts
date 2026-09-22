import {
  playCyberBootSequence,
  speakSystemGreeting,
  playPneumaticHiss,
  playServoClick,
  playMechanicalClick,
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
 * Style 5: Cửa Sập Màng Chắn Quang Học (Sci-Fi Mechanical Iris Aperture)
 *
 * Cinematic Flow:
 * - Centerpiece: 8 Interlocking Heavy Titanium Shutter Blades forming a sealed iris
 * - Interactive: Click central aperture hub OR press Space / Enter to dilate
 * - Phase 1: 8 perimeter clamp lugs release with pneumatic venting & servo click (250ms)
 * - Phase 2: Shutter blades rotate and slide back into circular chassis casing (700ms)
 * - Phase 3: Aperture dilates to 100%, radiant breach light floods screen into Workspace (800ms)
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

    const overlay = element("div", "cyber-boot-overlay iris-aperture-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Mechanical Iris Shutter Clearance");

    // The Stage
    const stage = element("div", "iris-stage");

    // Radiant Breach Light Layer behind the iris
    const breachFlash = element("div", "iris-breach-flash");

    // The Mechanical Iris Aperture Container
    const irisContainer = element("div", "iris-aperture-container");

    // Outer Armored Chassis Frame
    const chassisFrame = element("div", "iris-outer-chassis");

    // 8 Perimeter Clamp Lugs around the chassis
    const clampsContainer = element("div", "iris-clamps-container");
    for (let i = 0; i < 8; i++) {
      const clamp = element("div", `iris-clamp clamp-pos-${i}`);
      const clampLed = element("div", "clamp-led");
      clamp.append(clampLed);
      clampsContainer.append(clamp);
    }
    chassisFrame.append(clampsContainer);

    // 8 Interlocking Titanium Shutter Blades
    const bladesContainer = element("div", "iris-blades-container");
    for (let i = 0; i < 8; i++) {
      const blade = element("div", `iris-blade blade-idx-${i}`);
      blade.style.setProperty("--blade-angle", `${i * 45}deg`);

      // Blade inner graphics: CNC milled metallic plating
      const bladeSurface = element("div", "blade-surface");
      const bladeRib = element("div", "blade-rib");
      blade.append(bladeSurface, bladeRib);
      bladesContainer.append(blade);
    }

    // Central Aperture Hub & Trigger Assembly
    const hubAssembly = element("div", "iris-hub-assembly");

    // Rotating Crosshair Ring
    const crosshairRing = element("div", "iris-crosshair-ring");

    // Center Actuator Trigger Button
    const actuatorBtn = element("button", "iris-actuator-btn");
    actuatorBtn.setAttribute("type", "button");
    actuatorBtn.setAttribute("aria-label", "Dilate Mechanical Iris Shutter");

    const lensHalo = element("div", "iris-lens-halo");
    const lensCore = element("div", "iris-lens-core");
    const opticIcon = element("div", "iris-optic-icon");
    opticIcon.innerHTML = `
      <svg viewBox="0 0 48 48" class="iris-svg-icon" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="24" cy="24" r="18" stroke-dasharray="5 3"/>
        <polygon points="24,12 34,18 34,30 24,36 14,30 14,18"/>
        <circle cx="24" cy="24" r="4" fill="currentColor"/>
      </svg>
    `;
    actuatorBtn.append(lensHalo, lensCore, opticIcon);

    const brandGroup = element("div", "iris-brand-group");
    const titleLabel = element("div", "iris-title-label", "COMMAND VAULT");
    const userName = options.displayName ? options.displayName.trim().toUpperCase() : "OPERATOR";
    const welcomeLabel = element("div", "iris-welcome-label", `WELCOME ${userName} BACK`);
    brandGroup.append(titleLabel, welcomeLabel);

    hubAssembly.append(
      crosshairRing,
      actuatorBtn,
      brandGroup,
    );

    irisContainer.append(chassisFrame, bladesContainer, hubAssembly);
    stage.append(breachFlash, irisContainer);
    overlay.append(stage);
    document.body.append(overlay);

    let dismissed = false;
    let running = false;
    const timers: number[] = [];

    // ==========================================
    // Mechanical Iris Dilation Execution
    // ==========================================
    function dilateIris() {
      if (running || dismissed) return;
      running = true;

      // Phase 1 (t = 0ms): Clamp Unlatch & Pneumatic Purge
      irisContainer.classList.add("iris-unlatching", "iris-shaking");

      playPneumaticHiss(true);
      playServoClick();

      const rect = actuatorBtn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;

      // Phase 2 (t = 240ms): Blades Rotate & Slide Back into Chassis
      const t1 = window.setTimeout(() => {
        if (dismissed) return;
        irisContainer.classList.remove("iris-shaking");
        irisContainer.classList.add("iris-opening");
        breachFlash.classList.add("breach-blooming");

        triggerSparkBurst(cx, cy);
        triggerHexShockwave(cx, cy);

        playMechanicalClick();
        playCircuitSurgeAudio();
        playLaserChirp();
      }, 240);
      timers.push(t1);

      // Phase 3 (t = 880ms): Radiant Bloom & Synth Chord
      const t2 = window.setTimeout(() => {
        if (dismissed) return;
        irisContainer.classList.add("iris-dilated");

        playCyberBootSequence();
        if (options.displayName) {
          speakSystemGreeting(options.displayName);
        }
      }, 880);
      timers.push(t2);

      // Phase 4 (t = 1600ms): Smooth overlay fadeout
      const t3 = window.setTimeout(() => {
        if (dismissed) return;
        overlay.classList.add("iris-overlay-fadeout");
      }, 1600);
      timers.push(t3);

      // Phase 5 (t = 1880ms): Resolve and remove
      const t4 = window.setTimeout(() => {
        finish();
      }, 1880);
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
      dilateIris();
    });

    irisContainer.addEventListener("click", (e) => {
      e.stopPropagation();
      dilateIris();
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
        dilateIris();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);

    // Auto-dilate fallback after 5.0s if user is idle
    const autoDilate = window.setTimeout(() => {
      if (!running && !dismissed) {
        dilateIris();
      }
    }, 5000);
    timers.push(autoDilate);
  });
}
