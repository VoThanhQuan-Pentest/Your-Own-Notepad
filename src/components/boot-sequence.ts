import {
  playCyberBootSequence,
  speakSystemGreeting,
  playMechanicalClick,
  playServoClick,
  playDecryptionTick,
  playEmpDistortion,
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
 * Style 4: Vách Kính Cường Lực Sập Nứt (Tactical Stasis Breach / Ballistic Glass Shatter)
 *
 * Cinematic Flow:
 * - Centerpiece: Frosted smoked ballistic glass pane with corner brackets & central reticle
 * - Interactive: Click central kinetic reticle OR press Space / Enter to strike
 * - Phase 1: High-velocity kinetic strike slams center, loud mechanical impact (150ms)
 * - Phase 2: Complex fractal cracks spread like lightning to all 4 corners (300ms)
 * - Phase 3: Glass pane shatters into tumbling 3D polygonal shards, revealing Workspace (900ms)
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

    const overlay = element("div", "cyber-boot-overlay glass-breach-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "Tactical Ballistic Glass Stasis Breach");

    // The Glass Stage
    const stage = element("div", "glass-stage");

    // Radiant Breach Light Layer behind the glass
    const breachFlash = element("div", "glass-breach-flash");

    // The Ballistic Glass Pane
    const glassPane = element("div", "ballistic-glass-pane");

    // Diagonal Glass Glare Reflection
    const glassGlare = element("div", "glass-reflection-glare");

    // 4 Heavy-duty Steel Corner Mounting Brackets
    const bracketTL = element("div", "glass-bracket bracket-tl");
    const bracketTR = element("div", "glass-bracket bracket-tr");
    const bracketBL = element("div", "glass-bracket bracket-bl");
    const bracketBR = element("div", "glass-bracket bracket-br");

    // SVG Fractal Lightning Crack Web radiating from center (500x500 viewBox)
    const crackSvg = element("div", "glass-fractal-cracks");
    crackSvg.innerHTML = `
      <svg viewBox="0 0 1000 1000" class="crack-web-svg" preserveAspectRatio="none">
        <!-- Main primary fracture arteries -->
        <path d="M500,500 L420,380 L350,290 L210,180 L80,60" class="crack-path crack-primary"/>
        <path d="M500,500 L580,360 L690,260 L820,150 L950,50" class="crack-path crack-primary"/>
        <path d="M500,500 L390,580 L280,670 L170,780 L50,920" class="crack-path crack-primary"/>
        <path d="M500,500 L620,590 L740,710 L860,820 L960,940" class="crack-path crack-primary"/>
        
        <!-- Secondary branching fractures -->
        <path d="M420,380 L310,410 L180,440 L40,460" class="crack-path crack-secondary"/>
        <path d="M580,360 L660,400 L800,430 L960,450" class="crack-path crack-secondary"/>
        <path d="M350,290 L400,210 L440,110 L460,0" class="crack-path crack-secondary"/>
        <path d="M690,260 L630,190 L570,90 L540,0" class="crack-path crack-secondary"/>
        <path d="M390,580 L440,680 L480,820 L500,1000" class="crack-path crack-secondary"/>
        <path d="M620,590 L570,700 L530,830 L510,1000" class="crack-path crack-secondary"/>
        
        <!-- Concentric stress rings -->
        <circle cx="500" cy="500" r="45" class="crack-ring ring-1"/>
        <circle cx="500" cy="500" r="110" class="crack-ring ring-2"/>
        <circle cx="500" cy="500" r="220" class="crack-ring ring-3"/>
      </svg>
    `;

    // 16 3D Polygonal Shatter Shards
    const shardContainer = element("div", "glass-shards-container");
    for (let i = 0; i < 16; i++) {
      const shard = element("div", `glass-shard shard-idx-${i}`);
      shardContainer.append(shard);
    }

    // Central Kinetic Target Reticle Assembly
    const kineticAssembly = element("div", "kinetic-impact-assembly");

    // Rotating Crosshair Ring
    const reticleRing = element("div", "kinetic-crosshair-ring");

    // Center Strike Actuator Button
    const breachBtn = element("button", "kinetic-breach-btn");
    breachBtn.setAttribute("type", "button");
    breachBtn.setAttribute("aria-label", "Strike Ballistic Glass Stasis Shield");

    const bullseye = element("div", "kinetic-bullseye");
    const bullseyeCore = element("div", "kinetic-bullseye-core");
    const targetIcon = element("div", "kinetic-target-icon");
    targetIcon.innerHTML = `
      <svg viewBox="0 0 48 48" class="target-crosshair-svg" fill="none" stroke="currentColor" stroke-width="2.5">
        <circle cx="24" cy="24" r="18"/>
        <circle cx="24" cy="24" r="8"/>
        <path d="M24 2 V12 M24 36 V46 M2 24 H12 M36 24 H46"/>
        <circle cx="24" cy="24" r="2.5" fill="currentColor"/>
      </svg>
    `;
    breachBtn.append(bullseye, bullseyeCore, targetIcon);

    const titleLabel = element("div", "kinetic-title-label", "COMMAND VAULT // STASIS SHIELD");
    const statusBadge = element("div", "kinetic-status-badge", "[ BALLISTIC GLASS // 100% INTEGRITY ]");
    const hintLabel = element("div", "kinetic-hint-label", "✦ CLICK RETICLE OR PRESS SPACE TO STRIKE & SHATTER ✦");
    const skipHint = element("div", "kinetic-skip-hint", "[ ESC TO SKIP // SPACE TO STRIKE ]");

    kineticAssembly.append(
      reticleRing,
      breachBtn,
      titleLabel,
      statusBadge,
      hintLabel,
      skipHint,
    );

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
    document.body.append(overlay);

    let dismissed = false;
    let running = false;
    const timers: number[] = [];

    // ==========================================
    // Kinetic Breach Execution
    // ==========================================
    function strikeGlass() {
      if (running || dismissed) return;
      running = true;

      // Phase 1 (t = 0ms): Heavy Kinetic Strike Impact
      glassPane.classList.add("glass-striking", "glass-shaking");
      statusBadge.textContent = "[ KINETIC STRIKE IMPACT // FRACTURE SPREADING ]";
      statusBadge.classList.add("status-impact");

      playMechanicalClick();
      playServoClick();

      const rect = breachBtn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      triggerSparkBurst(cx, cy);

      // Phase 2 (t = 160ms): Fractal Lightning Cracks Radiate
      const t1 = window.setTimeout(() => {
        if (dismissed) return;
        glassPane.classList.remove("glass-shaking");
        glassPane.classList.add("glass-cracking");
        statusBadge.textContent = "[ STRUCTURAL INTEGRITY: 0% // CRITICAL BREACH ]";
        statusBadge.classList.add("status-cracking");

        triggerHexShockwave(cx, cy);
        playDecryptionTick();
        playLaserChirp();
        playEmpDistortion();
      }, 160);
      timers.push(t1);

      // Phase 3 (t = 460ms): Catastrophic Glass Shatter & Rain
      const t2 = window.setTimeout(() => {
        if (dismissed) return;
        glassPane.classList.add("glass-shattered");
        breachFlash.classList.add("breach-blooming");

        playCyberBootSequence();
        if (options.displayName) {
          speakSystemGreeting(options.displayName);
        }
      }, 460);
      timers.push(t2);

      // Phase 4 (t = 1550ms): Smooth overlay fadeout
      const t3 = window.setTimeout(() => {
        if (dismissed) return;
        overlay.classList.add("glass-overlay-fadeout");
      }, 1550);
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

    breachBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      strikeGlass();
    });

    glassPane.addEventListener("click", (e) => {
      e.stopPropagation();
      strikeGlass();
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
        strikeGlass();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown);

    // Auto-strike fallback after 5.0s if user is idle
    const autoStrike = window.setTimeout(() => {
      if (!running && !dismissed) {
        strikeGlass();
      }
    }, 5000);
    timers.push(autoStrike);
  });
}
