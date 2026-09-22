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
 * Command Vault v0.17.0 - Brutalist Cybernetic Blast Gate Sequence
 * Style A: Massive Sci-Fi Hydraulic Vault Blast Doors
 *
 * Cinematic Philosophy:
 * - Direct, brutalist, and monumental visual impact
 * - No cluttered 3-column text feeds or tiny status logs
 * - Heavy titanium blast panels with interlocking serrated teeth
 * - 4 Heavy-duty corner hydraulic pistons with dual-state status LEDs
 * - Central gravity reactor core with radial locking dogs and tactile actuator
 * - Multi-phase hydraulic depressurization, lock disengagement, and radiant breach
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

    const overlay = element("div", "cyber-boot-overlay blast-door-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Command Vault Blast Door Clearance");

    // Ambient background layers
    const bgVignette = element("div", "blast-bg-vignette");
    const breachLight = element("div", "vault-breach-light");

    // The Massive Blast Gate Container
    const blastGate = element("div", "vault-blast-gate");

    // Helper: Create a heavy hydraulic piston assembly
    function createHydraulicPiston(positionClass: string): HTMLElement {
      const piston = element("div", `vault-hydraulic-piston ${positionClass}`);
      const mount = element("div", "piston-mount");
      const cylinder = element("div", "piston-cylinder");
      const rod = element("div", "piston-rod");
      const led = element("div", "piston-led");
      const label = element("span", "piston-label", "HYD-04");
      cylinder.append(rod, led);
      piston.append(mount, cylinder, label);
      return piston;
    }

    // ==========================================
    // 1. LEFT TITANIUM ARMORED PANEL
    // ==========================================
    const panelLeft = element("div", "vault-panel vault-panel-left");
    const armorPlateL = element("div", "panel-armor-plate");
    const stencilL = element("div", "panel-stencil", "SECTOR-01 // AIRGAPPED CORE");
    const hazardStripeL = element("div", "panel-hazard-stripe");
    const teethLeft = element("div", "panel-teeth-edge teeth-left");
    teethLeft.innerHTML = `
      <svg class="teeth-svg" viewBox="0 0 40 400" preserveAspectRatio="none">
        <path d="M40,0 L15,40 L40,80 L15,120 L40,160 L15,200 L40,240 L15,280 L40,320 L15,360 L40,400 L0,400 L0,0 Z" fill="currentColor"/>
      </svg>
    `;
    const pistonTL = createHydraulicPiston("piston-tl");
    const pistonBL = createHydraulicPiston("piston-bl");
    panelLeft.append(armorPlateL, stencilL, hazardStripeL, teethLeft, pistonTL, pistonBL);

    // ==========================================
    // 2. RIGHT TITANIUM ARMORED PANEL
    // ==========================================
    const panelRight = element("div", "vault-panel vault-panel-right");
    const armorPlateR = element("div", "panel-armor-plate");
    const stencilR = element("div", "panel-stencil", "VAULT D-07 // HYDRAULIC SEAL");
    const hazardStripeR = element("div", "panel-hazard-stripe");
    const teethRight = element("div", "panel-teeth-edge teeth-right");
    teethRight.innerHTML = `
      <svg class="teeth-svg" viewBox="0 0 40 400" preserveAspectRatio="none">
        <path d="M0,0 L25,40 L0,80 L25,120 L0,160 L25,200 L0,240 L25,280 L0,320 L25,360 L0,400 L40,400 L40,0 Z" fill="currentColor"/>
      </svg>
    `;
    const pistonTR = createHydraulicPiston("piston-tr");
    const pistonBR = createHydraulicPiston("piston-br");
    panelRight.append(armorPlateR, stencilR, hazardStripeR, teethRight, pistonTR, pistonBR);

    // Central glowing vertical seam
    const seamGlow = element("div", "vault-seam-glow");

    // ==========================================
    // 3. CENTRAL REACTOR LOCK & ACTUATOR CORE
    // ==========================================
    const coreAssembly = element("div", "vault-core-assembly");

    // Industrial hazard warning ring
    const hazardRing = element("div", "core-hazard-ring");

    // 4 Heavy Radial Locking Dogs
    const lockingDogs = element("div", "core-locking-dogs");
    const dogTop = element("div", "locking-dog dog-top");
    const dogRight = element("div", "locking-dog dog-right");
    const dogBottom = element("div", "locking-dog dog-bottom");
    const dogLeft = element("div", "locking-dog dog-left");
    lockingDogs.append(dogTop, dogRight, dogBottom, dogLeft);

    // Center Actuator Core Button
    const coreButton = element("button", "vault-core-button");
    coreButton.setAttribute("type", "button");
    coreButton.setAttribute("aria-label", "Disengage Blast Locks and Open Vault");

    const coreHalo = element("div", "core-btn-halo");
    const coreIcon = element("div", "core-btn-icon");
    coreIcon.innerHTML = `
      <svg viewBox="0 0 64 64" class="core-svg-icon" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <circle cx="32" cy="32" r="28" stroke-dasharray="6 3"/>
        <circle cx="32" cy="32" r="18"/>
        <path d="M32 18 V10 M32 54 V46 M18 32 H10 M54 32 H46"/>
        <path d="M22 22 L16 16 M48 48 L42 42 M48 16 L42 22 M16 48 L22 42"/>
        <circle cx="32" cy="32" r="6" fill="currentColor"/>
      </svg>
    `;
    const coreTitle = element("span", "core-btn-title", "COMMAND VAULT");
    coreButton.append(coreHalo, coreIcon, coreTitle);

    // Status diagnostics & instructions
    const statusBadge = element("div", "core-status-badge", "[ HYDRAULIC PRESSURE: 42,000 PSI // LOCKED ]");
    const hintLabel = element("div", "core-hint-label", "✦ CLICK CORE OR PRESS SPACE / ENTER TO BREACH ✦");
    const skipHint = element("div", "core-skip-hint", "[ ESC TO SKIP ]");

    coreAssembly.append(hazardRing, lockingDogs, coreButton, statusBadge, hintLabel, skipHint);

    blastGate.append(panelLeft, panelRight, seamGlow, coreAssembly);
    overlay.append(bgVignette, breachLight, blastGate);
    document.body.append(overlay);

    let dismissed = false;
    let running = false;
    const timers: number[] = [];

    // ==========================================
    // Cinematic Blast Door Disengage Sequence
    // ==========================================
    function disengageLocks() {
      if (running || dismissed) return;
      running = true;

      // Phase 1 (t = 0ms): High Pressure Pneumatic Vent & Rod Retraction
      blastGate.classList.add("gate-disengaging", "gate-shaking");
      statusBadge.textContent = "[ HYDRAULIC VENTED // RELEASING LOCKS ]";
      statusBadge.classList.add("status-venting");

      playPneumaticHiss(true);
      playServoClick();

      // Phase 2 (t = 380ms): Radial Locking Dogs Rotate & Disengage
      const t1 = window.setTimeout(() => {
        if (dismissed) return;
        blastGate.classList.remove("gate-shaking");
        blastGate.classList.add("gate-dogs-released");
        statusBadge.textContent = "[ LOCKS DISENGAGED // COMMENCING BREACH ]";
        statusBadge.classList.remove("status-venting");
        statusBadge.classList.add("status-disengaged");

        const rect = coreButton.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;
        triggerSparkBurst(cx, cy);
        triggerHexShockwave(cx, cy);

        playMechanicalClick();
        playCircuitSurgeAudio();
        playLaserChirp();
      }, 380);
      timers.push(t1);

      // Phase 3 (t = 820ms): Massive Doors Part and Slide Outward
      const t2 = window.setTimeout(() => {
        if (dismissed) return;
        blastGate.classList.add("gate-opening");
        breachLight.classList.add("breach-blooming");

        playCyberBootSequence();
        if (options.displayName) {
          speakSystemGreeting(options.displayName);
        }
      }, 820);
      timers.push(t2);

      // Phase 4 (t = 1950ms): Fade Overlay and Reveal Workspace
      const t3 = window.setTimeout(() => {
        if (dismissed) return;
        overlay.classList.add("blast-overlay-fadeout");
      }, 1950);
      timers.push(t3);

      // Phase 5 (t = 2200ms): Cleanup and Resolve
      const t4 = window.setTimeout(() => {
        finish();
      }, 2200);
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

    // Interactive Triggers
    coreButton.addEventListener("click", (e) => {
      e.stopPropagation();
      disengageLocks();
    });

    blastGate.addEventListener("click", (e) => {
      e.stopPropagation();
      disengageLocks();
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
        disengageLocks();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);

    // Auto-disengage fallback after 5.0s if user is idle
    const autoDisengage = window.setTimeout(() => {
      if (!running && !dismissed) {
        disengageLocks();
      }
    }, 5000);
    timers.push(autoDisengage);
  });
}
