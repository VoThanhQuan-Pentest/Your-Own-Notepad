import {
  playCyberBootSequence,
  speakSystemGreeting,
  playLaserChirp,
  playTimeWarp,
  playEmpDistortion,
  playMechanicalClick,
  playCircuitSurgeAudio,
} from "../services/audio";
import { element } from "../utils/dom";
import { triggerSparkBurst, triggerHexShockwave } from "../utils/particles";

export interface BootSequenceOptions {
  displayName?: string | null;
  appVersion?: string;
}

/**
 * Command Vault v0.17.0 - Brutalist Cybernetic Intro
 * Style 2: Nhát Cắt Không Gian (Dimensional Void Slash / Spatial Rift Breach)
 *
 * Cinematic Flow:
 * - The Void: Pitch black space with floating quantum particles & central singularity
 * - Interactive: Swipe / drag a slash across screen OR click singularity / press Space
 * - Phase 1: Ultra-fast razor-sharp energy blade slices across space (120ms) with blade sound
 * - Phase 2: Reality cracks open, spatial shards scatter, spatial fabric tears apart
 * - Phase 3: The two halves of space slide off into the void, releasing radiant breach light
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

    const overlay = element("div", "cyber-boot-overlay void-slash-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Dimensional Void Slash Gateway");

    // The Void container
    const voidScreen = element("div", "void-slash-screen");

    // Radiant breach flash behind the tear
    const breachLight = element("div", "void-breach-light");

    // Two halves of reality that split apart along the diagonal slash
    const halfTop = element("div", "void-half void-half-top");
    const halfBottom = element("div", "void-half void-half-bottom");

    // Background cosmic dust particles
    const dustContainer = element("div", "void-dust-container");
    for (let i = 0; i < 20; i++) {
      const p = element("span", "void-particle");
      p.style.setProperty("--x", `${(i * 17) % 100}%`);
      p.style.setProperty("--y", `${(i * 23) % 100}%`);
      p.style.setProperty("--dur", `${3 + (i % 4)}s`);
      p.style.setProperty("--delay", `${(i * 0.2).toFixed(1)}s`);
      dustContainer.append(p);
    }

    // Razor energy blade line that slashes across the screen
    const slashBlade = element("div", "void-slash-blade");

    // Shard fragments that shatter when space tears
    const shardContainer = element("div", "spatial-shard-container");
    for (let i = 0; i < 8; i++) {
      const s = element("div", `spatial-shard shard-${i}`);
      shardContainer.append(s);
    }

    // Central Singularity Assembly
    const singularityAssembly = element("div", "void-singularity-assembly");
    const accretionRing = element("div", "singularity-accretion-ring");
    const singularityBtn = element("button", "void-singularity");
    singularityBtn.setAttribute("type", "button");
    singularityBtn.setAttribute("aria-label", "Trigger Dimensional Void Slash");

    const corePulse = element("div", "singularity-core-pulse");
    const coreDot = element("div", "singularity-core-dot");
    singularityBtn.append(corePulse, coreDot);

    const titleLabel = element("div", "void-title-label", "COMMAND VAULT // SPATIAL VOID");
    const statusBadge = element("div", "void-status-badge", "[ SPATIAL FABRIC: 100% // ANCHORED ]");
    const hintLabel = element("div", "void-hint-label", "✦ DRAG TO SLASH OR CLICK SINGULARITY TO TEAR REALITY ✦");
    const skipHint = element("div", "void-skip-hint", "[ ESC TO SKIP // SPACE TO SLASH ]");

    singularityAssembly.append(
      accretionRing,
      singularityBtn,
      titleLabel,
      statusBadge,
      hintLabel,
      skipHint,
    );

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
    document.body.append(overlay);

    let dismissed = false;
    let running = false;
    const timers: number[] = [];

    // ==========================================
    // Interactive Slash & Drag Detection
    // ==========================================
    let dragStartX = 0;
    let dragStartY = 0;
    let isDragging = false;

    voidScreen.addEventListener("pointerdown", (e) => {
      if (running || dismissed) return;
      isDragging = true;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
    });

    voidScreen.addEventListener("pointerup", (e) => {
      if (!isDragging || running || dismissed) return;
      isDragging = false;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      const dist = Math.hypot(dx, dy);

      if (dist > 60) {
        // Calculate dynamic drag angle
        let angle = (Math.atan2(dy, dx) * 180) / Math.PI;
        executeSlash(angle);
      } else {
        // Simple click / tap
        executeSlash(-25);
      }
    });

    singularityBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      executeSlash(-25);
    });

    // ==========================================
    // Cinematic Dimensional Slash Execution
    // ==========================================
    function executeSlash(angleDeg = -25) {
      if (running || dismissed) return;
      running = true;

      voidScreen.style.setProperty("--slash-angle", `${angleDeg}deg`);

      // Phase 1 (t = 0ms): Razor blade slashes across screen in 120ms
      voidScreen.classList.add("slashing", "void-screen-shaking");
      statusBadge.textContent = "[ SPATIAL FABRIC RUPTURED // VOID RIFT ACTIVATED ]";
      statusBadge.classList.add("status-slashed");

      playLaserChirp();
      playTimeWarp();

      const cx = window.innerWidth / 2;
      const cy = window.innerHeight / 2;
      triggerSparkBurst(cx, cy);

      // Phase 2 (t = 180ms): Reality cracks open, spatial shards scatter
      const t1 = window.setTimeout(() => {
        if (dismissed) return;
        voidScreen.classList.remove("void-screen-shaking");
        voidScreen.classList.add("rift-opening");
        statusBadge.textContent = "[ REALITY TEAR: 100% // COMMENCING BREACH ]";
        statusBadge.classList.add("status-breaching");

        triggerHexShockwave(cx, cy);
        playMechanicalClick();
        playEmpDistortion();
        playCircuitSurgeAudio();
      }, 180);
      timers.push(t1);

      // Phase 3 (t = 650ms): The two halves fly apart, radiant light floods screen
      const t2 = window.setTimeout(() => {
        if (dismissed) return;
        voidScreen.classList.add("rift-breached");
        breachLight.classList.add("breach-blooming");

        playCyberBootSequence();
        if (options.displayName) {
          speakSystemGreeting(options.displayName);
        }
      }, 650);
      timers.push(t2);

      // Phase 4 (t = 1600ms): Smooth overlay fadeout
      const t3 = window.setTimeout(() => {
        if (dismissed) return;
        overlay.classList.add("void-overlay-fadeout");
      }, 1600);
      timers.push(t3);

      // Phase 5 (t = 1850ms): Resolve and remove
      const t4 = window.setTimeout(() => {
        finish();
      }, 1850);
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
        executeSlash(-25);
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);

    // Auto-slash fallback after 5.0s if user is idle
    const autoSlash = window.setTimeout(() => {
      if (!running && !dismissed) {
        executeSlash(-25);
      }
    }, 5000);
    timers.push(autoSlash);
  });
}
