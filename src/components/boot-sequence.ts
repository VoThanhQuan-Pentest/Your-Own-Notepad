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
  playStoneGrindRumble,
  playAncientKeystoneLatch,
  playMultiSlashFlurry,
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
  const userName = displayName && displayName.trim().length > 0 ? displayName.trim().toUpperCase() : "OPERATOR";
  const welcomeLabel = element("div", `boot-welcome-label ${extraPrefix}-welcome-label`, `WELCOME ${userName}`);
  brandGroup.append(welcomeLabel);
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
   STYLE 2: ANCIENT CONCENTRIC RUIN VAULT GATE (Cánh Cổng Di Tích Cổ Đại Khóa Đồng Tâm Đa Lớp)
   Multi-tiered stone concentric locking rings opening sequentially from INSIDE OUT
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
  overlay.classList.add("blast-door-overlay", "ancient-ruin-overlay");
  overlay.setAttribute("aria-label", "Ancient Concentric Ruin Vault Clearance");

  // Top Title Aura Group
  const brandGroup = createBrandGroup(options.displayName, "blast");
  overlay.append(brandGroup);

  const bgVignette = element("div", "blast-bg-vignette");
  const breachLight = element("div", "vault-breach-light ancient-breach-light");
  const blastGate = element("div", "vault-blast-gate ancient-ruin-gate");

  // Left & Right Ancient Megalithic Stone Slabs
  const slabLeft = element("div", "ancient-ruin-slab slab-left");
  const runeCarvingL = element("div", "slab-rune-carvings");
  runeCarvingL.innerHTML = `
    <svg class="ancient-slab-svg" viewBox="0 0 300 800" preserveAspectRatio="none">
      <path d="M280,0 L240,120 L270,220 L230,340 L260,460 L230,580 L270,680 L240,800 L0,800 L0,0 Z" fill="currentColor"/>
      <path d="M120,40 L160,180 L80,300 L180,420 L100,560 L170,700" stroke="rgba(0, 240, 255, 0.45)" stroke-width="2.5" fill="none" stroke-dasharray="8 6"/>
      <circle cx="160" cy="180" r="5" fill="rgba(0, 240, 255, 0.8)"/>
      <circle cx="180" cy="420" r="5" fill="rgba(255, 183, 0, 0.8)"/>
      <circle cx="100" cy="560" r="5" fill="rgba(0, 240, 255, 0.8)"/>
    </svg>
  `;
  const teethLeft = element("div", "ancient-teeth teeth-left");
  slabLeft.append(runeCarvingL, teethLeft);

  const slabRight = element("div", "ancient-ruin-slab slab-right");
  const runeCarvingR = element("div", "slab-rune-carvings");
  runeCarvingR.innerHTML = `
    <svg class="ancient-slab-svg" viewBox="0 0 300 800" preserveAspectRatio="none">
      <path d="M20,0 L60,120 L30,220 L70,340 L40,460 L70,580 L30,680 L60,800 L300,800 L300,0 Z" fill="currentColor"/>
      <path d="M180,40 L140,180 L220,300 L120,420 L200,560 L130,700" stroke="rgba(255, 183, 0, 0.45)" stroke-width="2.5" fill="none" stroke-dasharray="8 6"/>
      <circle cx="140" cy="180" r="5" fill="rgba(255, 183, 0, 0.8)"/>
      <circle cx="120" cy="420" r="5" fill="rgba(0, 240, 255, 0.8)"/>
      <circle cx="200" cy="560" r="5" fill="rgba(255, 183, 0, 0.8)"/>
    </svg>
  `;
  const teethRight = element("div", "ancient-teeth teeth-right");
  slabRight.append(runeCarvingR, teethRight);

  const seamGlow = element("div", "vault-seam-glow ancient-seam-glow");

  // Multi-Tier Concentric Mechanism Chamber
  const concentricChamber = element("div", "ancient-concentric-chamber");

  // Ring 4 (Outer Monolith Keystones Ring): 8 radial stone locking pins
  const ringOuter = element("div", "concentric-ring concentric-ring-outer");
  const keystonesContainer = element("div", "concentric-keystones-container");
  for (let i = 0; i < 8; i++) {
    const keystone = element("div", `monolith-keystone keystone-idx-${i}`);
    keystone.style.setProperty("--keystone-angle", `${i * 45}deg`);
    const stoneBlock = element("div", "keystone-stone");
    const runeGlyph = element("span", "keystone-glyph");
    runeGlyph.textContent = ["᚛", "᚜", "ᚠ", "ᚢ", "ᚦ", "ᚨ", "ᚱ", "ᚲ"][i];
    stoneBlock.append(runeGlyph);
    keystone.append(stoneBlock);
    keystonesContainer.append(keystone);
  }
  ringOuter.append(keystonesContainer);

  // Ring 3 (Middle Astrolabe Gear Ring)
  const ringMiddle = element("div", "concentric-ring concentric-ring-middle");
  const middleDial = element("div", "astrolabe-gear-dial");
  middleDial.innerHTML = `
    <svg viewBox="0 0 200 200" class="astrolabe-svg">
      <circle cx="100" cy="100" r="92" stroke="rgba(255, 183, 0, 0.4)" stroke-width="2" fill="none" stroke-dasharray="14 8"/>
      <circle cx="100" cy="100" r="82" stroke="rgba(0, 240, 255, 0.5)" stroke-width="1.5" fill="none"/>
      <path d="M100 12 L100 24 M100 176 L100 188 M12 100 L24 100 M176 100 L188 100" stroke="rgba(255, 183, 0, 0.8)" stroke-width="3"/>
      <path d="M38 38 L46 46 M154 154 L162 162 M162 38 L154 46 M38 162 L46 154" stroke="rgba(0, 240, 255, 0.8)" stroke-width="3"/>
      <circle cx="100" cy="40" r="4" fill="rgba(255, 183, 0, 0.9)"/>
      <circle cx="160" cy="100" r="4" fill="rgba(0, 240, 255, 0.9)"/>
      <circle cx="100" cy="160" r="4" fill="rgba(255, 183, 0, 0.9)"/>
      <circle cx="40" cy="100" r="4" fill="rgba(0, 240, 255, 0.9)"/>
    </svg>
  `;
  ringMiddle.append(middleDial);

  // Ring 2 (Inner Glyph Disc)
  const ringInner = element("div", "concentric-ring concentric-ring-inner");
  const innerDial = element("div", "inner-glyph-dial");
  innerDial.innerHTML = `
    <svg viewBox="0 0 140 140" class="inner-glyph-svg">
      <circle cx="70" cy="70" r="62" stroke="rgba(0, 240, 255, 0.6)" stroke-width="2" fill="none" stroke-dasharray="6 4"/>
      <polygon points="70,18 115,96 25,96" stroke="rgba(255, 183, 0, 0.6)" stroke-width="1.5" fill="none"/>
      <polygon points="70,122 115,44 25,44" stroke="rgba(0, 240, 255, 0.6)" stroke-width="1.5" fill="none"/>
      <circle cx="70" cy="70" r="32" stroke="rgba(255, 255, 255, 0.5)" stroke-width="1.5" fill="none"/>
    </svg>
  `;
  ringInner.append(innerDial);

  // Ring 1: Prime Core Dial housing .vault-core-button
  const coreDial = element("div", "ancient-core-dial");
  const coreButton = element("button", "vault-core-button ancient-core-btn");
  coreButton.setAttribute("type", "button");
  coreButton.setAttribute("aria-label", "Awaken Ancient Ruin Mechanism and Unlock Vault");

  const coreEye = element("div", "ancient-eye-icon");
  coreEye.innerHTML = `
    <svg viewBox="0 0 64 64" class="core-svg-icon" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="32" cy="32" r="28" stroke="rgba(255, 183, 0, 0.8)" stroke-dasharray="5 3"/>
      <path d="M32 12 Q48 32 32 52 Q16 32 32 12 Z" stroke="rgba(0, 240, 255, 0.9)"/>
      <circle cx="32" cy="32" r="8" fill="rgba(255, 183, 0, 0.95)" stroke="#ffffff"/>
      <circle cx="32" cy="32" r="3" fill="#ffffff"/>
    </svg>
  `;
  const coreHalo = element("div", "core-btn-halo ancient-btn-halo");
  coreButton.append(coreHalo, coreEye);
  coreDial.append(coreButton);

  concentricChamber.append(ringOuter, ringMiddle, ringInner, coreDial);
  blastGate.append(slabLeft, slabRight, seamGlow, concentricChamber);
  overlay.append(bgVignette, breachLight, blastGate);

  function disengageLocks() {
    if (getRunning() || getDismissed()) return;
    setRunning(true);

    const rect = coreButton.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    triggerAuraPulse(cx, cy, overlay);

    // 1. TẦNG 1: Lõi trung tâm thức tỉnh (0ms)
    blastGate.classList.add("gate-awakening", "gate-shaking");
    playStoneGrindRumble();
    playServoClick();

    // 2. TẦNG 2: Vòng đá Cổ tự bên trong mở khóa (700ms)
    const t1 = window.setTimeout(() => {
      if (getDismissed()) return;
      blastGate.classList.remove("gate-shaking");
      blastGate.classList.add("inner-ring-unlocked");
      playAncientKeystoneLatch();
      playLaserChirp();
      triggerSparkBurst(cx, cy);
    }, 700);
    timers.push(t1);

    // 3. TẦNG 3: Vòng bánh răng thiên văn giữa xoay khớp rãnh (1500ms)
    const t2 = window.setTimeout(() => {
      if (getDismissed()) return;
      blastGate.classList.add("middle-ring-unlocked");
      playStoneGrindRumble();
      playMechanicalClick();
      triggerHexShockwave(cx, cy);
    }, 1500);
    timers.push(t2);

    // 4. TẦNG 4: 8 chốt đá nguyên khối vòng ngoài rút lùi xuyên tâm (2350ms)
    const t3 = window.setTimeout(() => {
      if (getDismissed()) return;
      blastGate.classList.add("outer-keystones-retracted");
      playPneumaticHiss(true);
      playCircuitSurgeAudio();
      playAncientKeystoneLatch();
      triggerAuraPulse(cx, cy, overlay);
    }, 2350);
    timers.push(t3);

    // 5. Cánh cổng cự thạch khổng lồ trượt mở giải phóng lối vào (3200ms)
    const t4 = window.setTimeout(() => {
      if (getDismissed()) return;
      blastGate.classList.add("gate-opening");
      breachLight.classList.add("breach-blooming");
      playCyberBootSequence();
      if (options.displayName) {
        speakSystemGreeting(options.displayName);
      }
    }, 3200);
    timers.push(t4);

    // 6. Mờ dần (4400ms)
    const t5 = window.setTimeout(() => {
      if (getDismissed()) return;
      overlay.classList.add("blast-overlay-fadeout");
    }, 4400);
    timers.push(t5);

    // 7. Hoàn tất (4800ms)
    const t6 = window.setTimeout(() => {
      finish();
    }, 4800);
    timers.push(t6);
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
   STYLE 3: DIMENSIONAL VOID SLASH (Nhát Cắt Không Gian Đa Chiều)
   Multi-angle kinetic slashes flurry tearing space into 24 polygonal shards
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

  const brandGroup = createBrandGroup(options.displayName, "void");
  overlay.append(brandGroup);

  const voidScreen = element("div", "void-slash-screen");
  const breachLight = element("div", "void-breach-light");

  // 4 fractured quadrants of space tearing apart
  const quadTL = element("div", "void-quad void-quad-tl");
  const quadTR = element("div", "void-quad void-quad-tr");
  const quadBL = element("div", "void-quad void-quad-bl");
  const quadBR = element("div", "void-quad void-quad-br");

  const dustContainer = element("div", "void-dust-container");
  for (let i = 0; i < 28; i++) {
    const p = element("span", "void-particle");
    p.style.setProperty("--x", `${(i * 13) % 100}%`);
    p.style.setProperty("--y", `${(i * 19) % 100}%`);
    p.style.setProperty("--dur", `${2.5 + (i % 4)}s`);
    p.style.setProperty("--delay", `${(i * 0.15).toFixed(1)}s`);
    dustContainer.append(p);
  }

  // 4 Sequential Kinetic Slashing Blades
  const slashContainer = element("div", "void-slashes-container");
  const slashAngles = [-32, 48, 0, 86];
  const slashBlades: HTMLElement[] = [];
  slashAngles.forEach((angle, idx) => {
    const blade = element("div", `void-slash-blade slash-combo-${idx}`);
    blade.style.setProperty("--slash-angle", `${angle}deg`);
    slashBlades.push(blade);
    slashContainer.append(blade);
  });

  // 24 Spatial Voronoi Shards with varied clip paths and trajectories
  const shardContainer = element("div", "spatial-shard-container");
  for (let i = 0; i < 24; i++) {
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
    quadTL,
    quadTR,
    quadBL,
    quadBR,
    slashContainer,
    shardContainer,
    singularityAssembly,
  );
  overlay.append(voidScreen);

  function tearVoid() {
    if (getRunning() || getDismissed()) return;
    setRunning(true);

    const rect = singularityBtn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    triggerAuraPulse(cx, cy, overlay);

    // Flurry of sequential kinetic slashes
    slashBlades.forEach((blade, index) => {
      const delay = index * 130; // 0ms, 130ms, 260ms, 390ms
      const t = window.setTimeout(() => {
        if (getDismissed()) return;
        blade.classList.add("blade-striking");
        playMultiSlashFlurry();
        playLaserChirp();
        triggerSparkBurst(cx + (index - 1.5) * 60, cy + (index % 2 === 0 ? -40 : 40));
        voidScreen.classList.add("void-screen-shaking");
        window.setTimeout(() => voidScreen.classList.remove("void-screen-shaking"), 110);
      }, delay);
      timers.push(t);
    });

    // Space breaks apart along all intersecting cuts
    const tBreak = window.setTimeout(() => {
      if (getDismissed()) return;
      voidScreen.classList.add("reality-torn", "rift-opening");

      playTimeWarp();
      playEmpDistortion();
      playCircuitSurgeAudio();

      triggerHexShockwave(cx, cy);
      triggerAuraPulse(cx, cy, overlay);
    }, 560);
    timers.push(tBreak);

    // Bloom breach light and entry
    const tBloom = window.setTimeout(() => {
      if (getDismissed()) return;
      voidScreen.classList.add("rift-breached");
      breachLight.classList.add("breach-blooming");
      playCyberBootSequence();
      if (options.displayName) {
        speakSystemGreeting(options.displayName);
      }
    }, 1500);
    timers.push(tBloom);

    const tFade = window.setTimeout(() => {
      if (getDismissed()) return;
      overlay.classList.add("void-overlay-fadeout");
    }, 2950);
    timers.push(tFade);

    const tFinish = window.setTimeout(() => {
      finish();
    }, 3350);
    timers.push(tFinish);
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
