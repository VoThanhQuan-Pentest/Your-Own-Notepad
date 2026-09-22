import {
  playCyberBootSequence,
  speakSystemGreeting,
  playPneumaticHiss,
  playServoClick,
  playMechanicalClick,
  playCircuitSurgeAudio,
  playLaserChirp,
  playTimeWarp,
  playEmpDistortion,
  playReactorOverload,
  playDecryptionTick,
} from "../services/audio";
import { type BootSequenceStyle } from "../models/settings";
import { element } from "../utils/dom";
import { triggerSparkBurst, triggerHexShockwave } from "../utils/particles";

export interface BootSequenceOptions {
  displayName?: string | null;
  appVersion?: string;
  style?: BootSequenceStyle;
}

const CONCRETE_BOOT_STYLES: Exclude<BootSequenceStyle, "random">[] = [
  "mechanical-iris",
  "blast-door",
  "void-slash",
  "reactor-core",
  "glass-shatter",
];

/**
 * Creates the clean, minimalist branding group requested by the user:
 * - Line 1: COMMAND VAULT (enlarged, glowing aura)
 * - Line 2: WELCOME <NAME> BACK (enlarged, luminous shimmer)
 * Positioned majestically at the top of the screen with radiant ambient aura.
 */
function createBrandGroup(displayName?: string | null, extraPrefix = "boot"): HTMLElement {
  const brandGroup = element("div", `boot-brand-group ${extraPrefix}-brand-group`);

  const leftWing = element("div", "boot-brand-wing wing-left");
  const rightWing = element("div", "boot-brand-wing wing-right");

  const badge = element("div", "boot-brand-badge");
  const beacon = element("span", "boot-brand-beacon");

  const userName = displayName && displayName.trim().length > 0 ? displayName.trim().toUpperCase() : "OPERATOR";
  const welcomeLabel = element("div", `boot-welcome-label ${extraPrefix}-welcome-label`);

  const prefixSpan = element("span", "welcome-text-prefix", "WELCOME ");
  const nameSpan = element("span", "welcome-text-name", userName);
  const suffixSpan = element("span", "welcome-text-suffix", " BACK");

  welcomeLabel.append(prefixSpan, nameSpan, suffixSpan);
  badge.append(beacon, welcomeLabel);
  brandGroup.append(leftWing, badge, rightWing);

  return brandGroup;
}

/**
 * Triggers a radiant expanding aura shockwave around the interactive actuator core
 */
function triggerAuraPulse(cx: number, cy: number, parent: HTMLElement): void {
  const aura = element("div", "boot-trigger-aura-wave");
  aura.style.left = `${cx}px`;
  aura.style.top = `${cy}px`;
  parent.append(aura);
  window.setTimeout(() => aura.remove(), 2000);
}

/**
 * Command Vault v0.17.0 - Brutalist Cybernetic Intro Registry
 * Supports 5 cinematic styles + Random surprise mode:
 * 1. Mechanical Iris Aperture (Cửa sập quang học)
 * 2. Massive Blast Door (Cánh cổng Titan)
 * 3. Dimensional Void Slash (Nhát cắt không gian)
 * 4. Tokamak Reactor Supernova (Lõi phản ứng)
 * 5. Ballistic Glass Shatter (Vách kính cường lực)
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

    // Resolve style (if random or unset, randomly pick from the 5 concrete styles)
    let activeStyle: Exclude<BootSequenceStyle, "random">;
    if (!options.style || options.style === "random") {
      activeStyle = CONCRETE_BOOT_STYLES[Math.floor(Math.random() * CONCRETE_BOOT_STYLES.length)];
    } else {
      activeStyle = options.style;
    }

    let dismissed = false;
    let running = false;
    const timers: number[] = [];

    const overlay = element("div", `cyber-boot-overlay boot-style-${activeStyle}`);
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Command Vault Clearance");

    function finish() {
      if (dismissed) return;
      dismissed = true;
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener("keydown", handleKeydown, true);
      overlay.remove();
      resolve();
    }

    let triggerAction: () => void = () => {};

    function handleKeydown(event: KeyboardEvent) {
      if (dismissed) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        finish();
      } else if (event.key === " " || event.key === "Enter") {
        event.preventDefault();
        event.stopPropagation();
        triggerAction();
      }
    }
    window.addEventListener("keydown", handleKeydown, true);

    switch (activeStyle) {
      case "mechanical-iris":
        triggerAction = setupMechanicalIris(overlay, options, finish, timers, () => running, (r) => { running = r; }, () => dismissed);
        break;
      case "blast-door":
        triggerAction = setupBlastDoor(overlay, options, finish, timers, () => running, (r) => { running = r; }, () => dismissed);
        break;
      case "void-slash":
        triggerAction = setupVoidSlash(overlay, options, finish, timers, () => running, (r) => { running = r; }, () => dismissed);
        break;
      case "reactor-core":
        triggerAction = setupReactorCore(overlay, options, finish, timers, () => running, (r) => { running = r; }, () => dismissed);
        break;
      case "glass-shatter":
        triggerAction = setupGlassShatter(overlay, options, finish, timers, () => running, (r) => { running = r; }, () => dismissed);
        break;
    }

    document.body.append(overlay);
  });
}

/* ==========================================================================
   STYLE 1: MECHANICAL IRIS APERTURE (Cửa Sập Màng Chắn Quang Học)
   ========================================================================== */
function setupMechanicalIris(
  overlay: HTMLElement,
  options: BootSequenceOptions,
  finish: () => void,
  timers: number[],
  getRunning: () => boolean,
  setRunning: (r: boolean) => void,
  getDismissed: () => boolean,
): () => void {
  overlay.classList.add("iris-aperture-overlay");
  overlay.setAttribute("aria-label", "Mechanical Iris Shutter Clearance");

  // Top Title Aura Group
  const brandGroup = createBrandGroup(options.displayName, "iris");
  overlay.append(brandGroup);

  const stage = element("div", "iris-stage");
  const breachFlash = element("div", "iris-breach-flash");
  const irisContainer = element("div", "iris-aperture-container");

  const chassisFrame = element("div", "iris-outer-chassis");
  const clampsContainer = element("div", "iris-clamps-container");
  for (let i = 0; i < 8; i++) {
    const clamp = element("div", `iris-clamp clamp-pos-${i}`);
    const clampLed = element("div", "clamp-led");
    clamp.append(clampLed);
    clampsContainer.append(clamp);
  }
  chassisFrame.append(clampsContainer);

  const bladesContainer = element("div", "iris-blades-container");
  for (let i = 0; i < 8; i++) {
    const blade = element("div", `iris-blade blade-idx-${i}`);
    blade.style.setProperty("--blade-angle", `${i * 45}deg`);
    const bladeSurface = element("div", "blade-surface");
    const bladeRib = element("div", "blade-rib");
    blade.append(bladeSurface, bladeRib);
    bladesContainer.append(blade);
  }

  const hubAssembly = element("div", "iris-hub-assembly");
  const crosshairRing = element("div", "iris-crosshair-ring");

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
  hubAssembly.append(crosshairRing, actuatorBtn);

  irisContainer.append(chassisFrame, bladesContainer, hubAssembly);
  stage.append(breachFlash, irisContainer);
  overlay.append(stage);

  function dilateIris() {
    if (getRunning() || getDismissed()) return;
    setRunning(true);

    irisContainer.classList.add("iris-unlatching", "iris-shaking");
    playPneumaticHiss(true);
    playServoClick();

    const rect = actuatorBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    triggerAuraPulse(cx, cy, overlay);

    const t1 = window.setTimeout(() => {
      if (getDismissed()) return;
      irisContainer.classList.remove("iris-shaking");
      irisContainer.classList.add("iris-dilating", "iris-opening");

      triggerSparkBurst(cx, cy);
      triggerHexShockwave(cx, cy);
      triggerAuraPulse(cx, cy, overlay);

      playMechanicalClick();
      playCircuitSurgeAudio();
      playLaserChirp();
    }, 450);
    timers.push(t1);

    const t2 = window.setTimeout(() => {
      if (getDismissed()) return;
      breachFlash.classList.add("breach-blooming");
      playCyberBootSequence();
      if (options.displayName) {
        speakSystemGreeting(options.displayName);
      }
    }, 1100);
    timers.push(t2);

    const t3 = window.setTimeout(() => {
      if (getDismissed()) return;
      overlay.classList.add("iris-overlay-fadeout");
    }, 2400);
    timers.push(t3);

    const t4 = window.setTimeout(() => {
      finish();
    }, 2800);
    timers.push(t4);
  }

  actuatorBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    dilateIris();
  });
  overlay.addEventListener("click", () => {
    if (!getRunning()) dilateIris();
  });

  return dilateIris;
}

/* ==========================================================================
   STYLE 2: MASSIVE CYBER BLAST DOOR (Cánh Cổng Titan Cơ Khí)
   ========================================================================== */
function setupBlastDoor(
  overlay: HTMLElement,
  options: BootSequenceOptions,
  finish: () => void,
  timers: number[],
  getRunning: () => boolean,
  setRunning: (r: boolean) => void,
  getDismissed: () => boolean,
): () => void {
  overlay.classList.add("blast-door-overlay");
  overlay.setAttribute("aria-label", "Command Vault Blast Door Clearance");

  // Top Title Aura Group
  const brandGroup = createBrandGroup(options.displayName, "blast");
  overlay.append(brandGroup);

  const bgVignette = element("div", "blast-bg-vignette");
  const breachLight = element("div", "vault-breach-light");
  const blastGate = element("div", "vault-blast-gate");

  function createHydraulicPiston(posClass: string): HTMLElement {
    const piston = element("div", `vault-hydraulic-piston ${posClass}`);
    const mount = element("div", "piston-mount");
    const cylinder = element("div", "piston-cylinder");
    const rod = element("div", "piston-rod");
    const led = element("div", "piston-led");
    const label = element("span", "piston-label", "HYD-04");
    cylinder.append(rod, led);
    piston.append(mount, cylinder, label);
    return piston;
  }

  // Left Panel
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
  panelLeft.append(armorPlateL, stencilL, hazardStripeL, teethLeft, createHydraulicPiston("piston-tl"), createHydraulicPiston("piston-bl"));

  // Right Panel
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
  panelRight.append(armorPlateR, stencilR, hazardStripeR, teethRight, createHydraulicPiston("piston-tr"), createHydraulicPiston("piston-br"));

  const seamGlow = element("div", "vault-seam-glow");

  // Center Core
  const coreAssembly = element("div", "vault-core-assembly");
  const hazardRing = element("div", "core-hazard-ring");
  const lockingDogs = element("div", "core-locking-dogs");
  lockingDogs.append(
    element("div", "locking-dog dog-top"),
    element("div", "locking-dog dog-right"),
    element("div", "locking-dog dog-bottom"),
    element("div", "locking-dog dog-left"),
  );

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
  coreButton.append(coreHalo, coreIcon);
  coreAssembly.append(hazardRing, lockingDogs, coreButton);

  blastGate.append(panelLeft, panelRight, seamGlow, coreAssembly);
  overlay.append(bgVignette, breachLight, blastGate);

  function disengageLocks() {
    if (getRunning() || getDismissed()) return;
    setRunning(true);

    blastGate.classList.add("gate-disengaging", "gate-shaking");
    playPneumaticHiss(true);
    playServoClick();

    const rect = coreButton.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    triggerAuraPulse(cx, cy, overlay);

    const t1 = window.setTimeout(() => {
      if (getDismissed()) return;
      blastGate.classList.remove("gate-shaking");
      blastGate.classList.add("gate-dogs-released");

      triggerSparkBurst(cx, cy);
      triggerHexShockwave(cx, cy);
      triggerAuraPulse(cx, cy, overlay);

      playMechanicalClick();
      playCircuitSurgeAudio();
      playLaserChirp();
    }, 550);
    timers.push(t1);

    const t2 = window.setTimeout(() => {
      if (getDismissed()) return;
      blastGate.classList.add("gate-opening");
      breachLight.classList.add("breach-blooming");
      playCyberBootSequence();
      if (options.displayName) {
        speakSystemGreeting(options.displayName);
      }
    }, 1300);
    timers.push(t2);

    const t3 = window.setTimeout(() => {
      if (getDismissed()) return;
      overlay.classList.add("blast-overlay-fadeout");
    }, 2700);
    timers.push(t3);

    const t4 = window.setTimeout(() => {
      finish();
    }, 3100);
    timers.push(t4);
  }

  coreButton.addEventListener("click", (e) => {
    e.stopPropagation();
    disengageLocks();
  });
  overlay.addEventListener("click", () => {
    if (!getRunning()) disengageLocks();
  });

  return disengageLocks;
}

/* ==========================================================================
   STYLE 3: DIMENSIONAL VOID SLASH (Nhát Cắt Không Gian)
   ========================================================================== */
function setupVoidSlash(
  overlay: HTMLElement,
  options: BootSequenceOptions,
  finish: () => void,
  timers: number[],
  getRunning: () => boolean,
  setRunning: (r: boolean) => void,
  getDismissed: () => boolean,
): () => void {
  overlay.classList.add("void-slash-overlay");
  overlay.setAttribute("aria-label", "Dimensional Void Slash Gateway");

  // Top Title Aura Group
  const brandGroup = createBrandGroup(options.displayName, "void");
  overlay.append(brandGroup);

  const voidScreen = element("div", "void-slash-screen");
  const breachLight = element("div", "void-breach-light");
  const halfTop = element("div", "void-half void-half-top");
  const halfBottom = element("div", "void-half void-half-bottom");

  const dustContainer = element("div", "void-dust-container");
  for (let i = 0; i < 20; i++) {
    const p = element("span", "void-particle");
    p.style.setProperty("--x", `${(i * 17) % 100}%`);
    p.style.setProperty("--y", `${(i * 23) % 100}%`);
    p.style.setProperty("--dur", `${3 + (i % 4)}s`);
    p.style.setProperty("--delay", `${(i * 0.2).toFixed(1)}s`);
    dustContainer.append(p);
  }

  const slashBlade = element("div", "void-slash-blade");
  const shardContainer = element("div", "spatial-shard-container");
  for (let i = 0; i < 8; i++) {
    const s = element("div", `spatial-shard shard-${i}`);
    shardContainer.append(s);
  }

  const singularityAssembly = element("div", "void-singularity-assembly");
  const accretionRing = element("div", "singularity-accretion-ring");
  const singularityBtn = element("button", "void-singularity");
  singularityBtn.setAttribute("type", "button");
  singularityBtn.setAttribute("aria-label", "Trigger Dimensional Void Slash");

  const corePulse = element("div", "singularity-core-pulse");
  const coreDot = element("div", "singularity-core-dot");
  singularityBtn.append(corePulse, coreDot);
  singularityAssembly.append(accretionRing, singularityBtn);

  voidScreen.append(
    dustContainer,
    breachLight,
    halfTop,
    halfBottom,
    slashBlade,
    shardContainer,
    singularityAssembly,
  );
  overlay.append(voidScreen);

  function tearVoid() {
    if (getRunning() || getDismissed()) return;
    setRunning(true);

    slashBlade.classList.add("blade-striking");
    playTimeWarp();
    playLaserChirp();

    const rect = singularityBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    triggerAuraPulse(cx, cy, overlay);

    const t1 = window.setTimeout(() => {
      if (getDismissed()) return;
      voidScreen.classList.add("reality-torn", "rift-opening");

      triggerSparkBurst(cx, cy);
      triggerHexShockwave(cx, cy);
      triggerAuraPulse(cx, cy, overlay);

      playEmpDistortion();
      playMechanicalClick();
      playCircuitSurgeAudio();
    }, 260);
    timers.push(t1);

    const t2 = window.setTimeout(() => {
      if (getDismissed()) return;
      voidScreen.classList.add("rift-breached");
      breachLight.classList.add("breach-blooming");
      playCyberBootSequence();
      if (options.displayName) {
        speakSystemGreeting(options.displayName);
      }
    }, 900);
    timers.push(t2);

    const t3 = window.setTimeout(() => {
      if (getDismissed()) return;
      overlay.classList.add("void-overlay-fadeout");
    }, 2400);
    timers.push(t3);

    const t4 = window.setTimeout(() => {
      finish();
    }, 2800);
    timers.push(t4);
  }

  // Pointer drag to slash gesture
  let startX = 0;
  let startY = 0;
  let isDragging = false;

  overlay.addEventListener("pointerdown", (e) => {
    if (getRunning()) return;
    startX = e.clientX;
    startY = e.clientY;
    isDragging = true;
  });

  overlay.addEventListener("pointerup", (e) => {
    if (!isDragging || getRunning()) return;
    isDragging = false;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;
    const dist = Math.hypot(dx, dy);
    if (dist > 80) {
      tearVoid();
    }
  });

  singularityBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    tearVoid();
  });
  overlay.addEventListener("click", () => {
    if (!getRunning()) tearVoid();
  });

  return tearVoid;
}

/* ==========================================================================
   STYLE 4: TOKAMAK REACTOR CORE SUPERNOVA (Lõi Phản Ứng Quá Tải)
   ========================================================================== */
function setupReactorCore(
  overlay: HTMLElement,
  options: BootSequenceOptions,
  finish: () => void,
  timers: number[],
  getRunning: () => boolean,
  setRunning: (r: boolean) => void,
  getDismissed: () => boolean,
): () => void {
  overlay.classList.add("reactor-core-overlay");
  overlay.setAttribute("aria-label", "Tokamak Fusion Reactor Core Ignition");

  // Top Title Aura Group
  const brandGroup = createBrandGroup(options.displayName, "reactor");
  overlay.append(brandGroup);

  const reactorStage = element("div", "reactor-stage");
  const blastFlash = element("div", "reactor-supernova-blast");
  const chamber = element("div", "reactor-chamber");
  const fluxGrid = element("div", "reactor-flux-grid");

  const ringOuter = element("div", "containment-ring ring-outer");
  const ringMiddle = element("div", "containment-ring ring-middle");
  const ringInner = element("div", "containment-ring ring-inner");

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

  chamber.append(fluxGrid, ringOuter, ringMiddle, ringInner, coreSphere);
  reactorStage.append(blastFlash, chamber);
  overlay.append(reactorStage);

  function igniteReactor() {
    if (getRunning() || getDismissed()) return;
    setRunning(true);

    chamber.classList.add("reactor-overcharging", "chamber-shaking");
    playReactorOverload();

    const rect = actuatorBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    triggerAuraPulse(cx, cy, overlay);

    const t1 = window.setTimeout(() => {
      if (getDismissed()) return;
      chamber.classList.remove("chamber-shaking");
      chamber.classList.add("reactor-critical");

      triggerSparkBurst(cx, cy);
      triggerHexShockwave(cx, cy);
      triggerAuraPulse(cx, cy, overlay);

      playEmpDistortion();
      playCircuitSurgeAudio();
      playLaserChirp();
    }, 600);
    timers.push(t1);

    const t2 = window.setTimeout(() => {
      if (getDismissed()) return;
      blastFlash.classList.add("supernova-blooming");
      chamber.classList.add("reactor-dissolving");
      playCyberBootSequence();
      if (options.displayName) {
        speakSystemGreeting(options.displayName);
      }
    }, 1300);
    timers.push(t2);

    const t3 = window.setTimeout(() => {
      if (getDismissed()) return;
      overlay.classList.add("reactor-overlay-fadeout");
    }, 2650);
    timers.push(t3);

    const t4 = window.setTimeout(() => {
      finish();
    }, 3050);
    timers.push(t4);
  }

  actuatorBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    igniteReactor();
  });
  overlay.addEventListener("click", () => {
    if (!getRunning()) igniteReactor();
  });

  return igniteReactor;
}

/* ==========================================================================
   STYLE 5: TACTICAL BALLISTIC GLASS SHATTER (Vách Kính Cường Lực Sập Nứt)
   ========================================================================== */
function setupGlassShatter(
  overlay: HTMLElement,
  options: BootSequenceOptions,
  finish: () => void,
  timers: number[],
  getRunning: () => boolean,
  setRunning: (r: boolean) => void,
  getDismissed: () => boolean,
): () => void {
  overlay.classList.add("glass-breach-overlay");
  overlay.setAttribute("aria-label", "Tactical Ballistic Glass Stasis Breach");

  // Top Title Aura Group
  const brandGroup = createBrandGroup(options.displayName, "glass");
  overlay.append(brandGroup);

  const stage = element("div", "glass-stage");
  const breachFlash = element("div", "glass-breach-flash");
  const glassPane = element("div", "ballistic-glass-pane");
  const glassGlare = element("div", "glass-reflection-glare");

  const bracketTL = element("div", "glass-bracket bracket-tl");
  const bracketTR = element("div", "glass-bracket bracket-tr");
  const bracketBL = element("div", "glass-bracket bracket-bl");
  const bracketBR = element("div", "glass-bracket bracket-br");

  const crackSvg = element("div", "glass-fractal-cracks");
  crackSvg.innerHTML = `
    <svg viewBox="0 0 1000 1000" class="crack-web-svg" preserveAspectRatio="none">
      <path d="M500,500 L420,380 L350,290 L210,180 L80,60" class="crack-path crack-primary"/>
      <path d="M500,500 L580,360 L690,260 L820,150 L950,50" class="crack-path crack-primary"/>
      <path d="M500,500 L390,580 L280,670 L170,780 L50,920" class="crack-path crack-primary"/>
      <path d="M500,500 L620,590 L740,710 L860,820 L960,940" class="crack-path crack-primary"/>
      <path d="M420,380 L310,410 L180,440 L40,460" class="crack-path crack-secondary"/>
      <path d="M580,360 L660,400 L800,430 L960,450" class="crack-path crack-secondary"/>
      <path d="M350,290 L400,210 L440,110 L460,0" class="crack-path crack-secondary"/>
      <path d="M690,260 L630,190 L570,90 L540,0" class="crack-path crack-secondary"/>
      <path d="M390,580 L440,680 L480,820 L500,1000" class="crack-path crack-secondary"/>
      <path d="M620,590 L570,700 L530,830 L510,1000" class="crack-path crack-secondary"/>
      <circle cx="500" cy="500" r="45" class="crack-ring ring-1"/>
      <circle cx="500" cy="500" r="110" class="crack-ring ring-2"/>
      <circle cx="500" cy="500" r="220" class="crack-ring ring-3"/>
    </svg>
  `;

  const shardContainer = element("div", "glass-shards-container");
  for (let i = 0; i < 16; i++) {
    const shard = element("div", `glass-shard shard-idx-${i}`);
    shardContainer.append(shard);
  }

  const kineticAssembly = element("div", "kinetic-impact-assembly");
  const reticleRing = element("div", "kinetic-crosshair-ring");

  const breachBtn = element("button", "kinetic-breach-btn");
  breachBtn.setAttribute("type", "button");
  breachBtn.setAttribute("aria-label", "Strike Ballistic Glass Stasis Shield");

  const bullseye = element("div", "kinetic-bullseye");
  const bullseyeCore = element("div", "kinetic-bullseye-core");
  const targetIcon = element("div", "kinetic-target-icon");
  targetIcon.innerHTML = `
    <svg viewBox="0 0 48 48" class="target-crosshair-svg" fill="none" stroke="currentColor" stroke-width="2.5">
      <circle cx="24" cy="24" r="18"/>
      <line x1="24" y1="2" x2="24" y2="10"/>
      <line x1="24" y1="38" x2="24" y2="46"/>
      <line x1="2" y1="24" x2="10" y2="24"/>
      <line x1="38" y1="24" x2="46" y2="24"/>
      <circle cx="24" cy="24" r="3" fill="currentColor"/>
    </svg>
  `;
  bullseye.append(bullseyeCore, targetIcon);
  breachBtn.append(bullseye);
  kineticAssembly.append(reticleRing, breachBtn);

  glassPane.append(
    glassGlare,
    bracketTL,
    bracketTR,
    bracketBL,
    bracketBR,
    crackSvg,
    shardContainer,
    kineticAssembly,
  );
  stage.append(breachFlash, glassPane);
  overlay.append(stage);

  function shatterGlass() {
    if (getRunning() || getDismissed()) return;
    setRunning(true);

    glassPane.classList.add("glass-striking", "glass-shaking");
    playMechanicalClick();
    playServoClick();

    const rect = breachBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    triggerAuraPulse(cx, cy, overlay);

    const t1 = window.setTimeout(() => {
      if (getDismissed()) return;
      glassPane.classList.remove("glass-shaking");
      glassPane.classList.add("glass-fracturing");

      triggerSparkBurst(cx, cy);
      triggerHexShockwave(cx, cy);
      triggerAuraPulse(cx, cy, overlay);

      playDecryptionTick();
      playEmpDistortion();
    }, 280);
    timers.push(t1);

    const t2 = window.setTimeout(() => {
      if (getDismissed()) return;
      glassPane.classList.add("glass-shattered");
      breachFlash.classList.add("breach-blooming");
      playCyberBootSequence();
      playLaserChirp();
      if (options.displayName) {
        speakSystemGreeting(options.displayName);
      }
    }, 750);
    timers.push(t2);

    const t3 = window.setTimeout(() => {
      if (getDismissed()) return;
      overlay.classList.add("glass-overlay-fadeout");
    }, 2350);
    timers.push(t3);

    const t4 = window.setTimeout(() => {
      finish();
    }, 2750);
    timers.push(t4);
  }

  breachBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    shatterGlass();
  });
  overlay.addEventListener("click", () => {
    if (!getRunning()) shatterGlass();
  });

  return shatterGlass;
}
