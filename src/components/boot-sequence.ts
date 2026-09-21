import { playCyberBootSequence, speakSystemGreeting } from "../services/audio";
import { element } from "../utils/dom";
import { createIcon } from "./icons";

export interface BootSequenceOptions {
  displayName?: string | null;
  appVersion?: string;
}

/**
 * Tactical Cybernetic Boot Sequence:
 * 3.2-second 3-phase cinematic BIOS / Kernel Power-On Self Test overlay:
 * - Phase 1: Biometric & Hardware Authentication
 * - Phase 2: Quantum Core Ignition & Decryption
 * - Phase 3: Clearance Level 5 Approval, Vocal Greeting & Radial Laser Dissolve
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

    const overlay = element("div", "cyber-boot-overlay");
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-label", "System Boot Sequence");

    const laserSweep = element("div", "boot-laser-sweep");
    const content = element("div", "boot-content");

    // Header
    const header = element("div", "boot-header");
    const title = element("span", "boot-title");
    const dot = element("span", "boot-status-dot");
    title.append(dot, document.createTextNode("COMMAND VAULT // TACTICAL SECURE KERNEL"));
    const version = element("span", "boot-version", options.appVersion ?? "v0.16.0");
    header.append(title, version);

    // Phase Banner
    const phaseBanner = element("div", "boot-phase-banner", "PHASE 1 // BIOMETRIC & HARDWARE AUTHENTICATION");

    // Holo Center
    const holoCenter = element("div", "boot-holo-center");
    const holoRing = element("div", "boot-holo-ring");
    const holoInner = element("div", "boot-holo-inner");
    const holoIcon = createIcon("command-file", "boot-holo-icon");
    holoCenter.append(holoRing, holoInner, holoIcon);

    // Terminal log
    const terminalLog = element("div", "boot-terminal-log");

    // Progress
    const progressContainer = element("div", "boot-progress-container");
    const progressHeader = element("div", "boot-progress-header");
    const progressLabel = element("span", undefined, "INITIALIZING SYSTEM MODULES");
    const progressPercent = element("span", "boot-progress-percent", "0%");
    progressHeader.append(progressLabel, progressPercent);

    const progressTrack = element("div", "boot-progress-track");
    const progressFill = element("div", "boot-progress-fill");
    progressTrack.append(progressFill);
    progressContainer.append(progressHeader, progressTrack);

    // Skip hint
    const skipHint = element("span", "boot-skip-hint", "[ CLICK ANYWHERE OR PRESS ANY KEY TO SKIP ]");

    content.append(header, phaseBanner, holoCenter, terminalLog, progressContainer, skipHint);
    overlay.append(laserSweep, content);
    document.body.append(overlay);

    // Start Audio
    playCyberBootSequence();

    let dismissed = false;
    const timers: number[] = [];

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;

      window.removeEventListener("keydown", onKeyDown, true);
      overlay.removeEventListener("pointerdown", onPointerDown, true);

      timers.forEach((t) => window.clearTimeout(t));

      overlay.classList.add("boot-dismissing");
      window.setTimeout(() => {
        if (overlay.isConnected) {
          overlay.remove();
        }
        resolve();
      }, 260);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      e.stopPropagation();
      dismiss();
    };

    const onPointerDown = (e: PointerEvent) => {
      e.stopPropagation();
      dismiss();
    };

    window.addEventListener("keydown", onKeyDown, true);
    overlay.addEventListener("pointerdown", onPointerDown, true);

    const name = (options.displayName?.trim() || "OPERATOR").toUpperCase();

    // Multi-phase timeline schedule
    const steps: Array<{
      delay: number;
      prefix: string;
      text: string;
      status: string;
      pct: number;
      action?: () => void;
    }> = [
      // Phase 1: Biometric & Hardware (0s - 1.0s)
      { delay: 60, prefix: "[BIOS]", text: "INITIALIZING SECURE HARDWARE ENCLAVE", status: "OK", pct: 10 },
      { delay: 320, prefix: "[SCAN]", text: `BIOMETRIC TARGET ID: MATCHING ${name}`, status: "VERIFIED", pct: 22 },
      { delay: 600, prefix: "[VRAM]", text: "WEBGL2 / 2D GPU HARDWARE ACCELERATION", status: "60 FPS", pct: 32 },
      { delay: 900, prefix: "[MEM]", text: "ZERO-KNOWLEDGE ENCRYPTED RAM BUFFERS", status: "ALLOCATED", pct: 40 },

      // Phase 2: Quantum Core Ignition (1.0s - 2.2s)
      {
        delay: 1100,
        prefix: "[CORE]",
        text: "INJECTING PLASMA CONFINEMENT FIELD: 4.80GHz",
        status: "STABILIZED",
        pct: 55,
        action: () => {
          phaseBanner.textContent = "PHASE 2 // QUANTUM CORE REACTOR IGNITION";
          holoCenter.classList.add("core-igniting");
        },
      },
      { delay: 1400, prefix: "[VAULT]", text: "AIRGAPPED SECURE FILE SYSTEM: DECRYPTING SHA-256", status: "100%", pct: 68 },
      { delay: 1750, prefix: "[AUDIO]", text: "TACTICAL NEURAL FREQUENCY ANALYZER", status: "ONLINE", pct: 78 },
      { delay: 2050, prefix: "[MATRIX]", text: "REAL-TIME TELEMETRY SENSOR MATRIX", status: "ARMED", pct: 88 },

      // Phase 3: Clearance Level 5 & Dissolve (2.2s - 3.2s)
      {
        delay: 2300,
        prefix: "[EXEC]",
        text: `ACCESS GRANTED // CLEARANCE: LEVEL 5 // WELCOME, ${name}`,
        status: "APPROVED",
        pct: 100,
        action: () => {
          phaseBanner.textContent = "PHASE 3 // CLEARANCE LEVEL 5 GRANTED";
          progressLabel.textContent = "ALL SYSTEMS NOMINAL // SYSTEM READY";
          speakSystemGreeting("Biometrics confirmed. Operator authenticated. Command Vault online and ready for operations.");
          const burst = element("div", "boot-radial-burst");
          overlay.append(burst);
        },
      },
    ];

    steps.forEach((step) => {
      const t = window.setTimeout(() => {
        if (dismissed) return;
        step.action?.();

        const line = element("div", "boot-log-line");
        const prefix = element("span", "boot-log-prefix", step.prefix);
        const msg = element("span", undefined, step.text);
        const st = element("span", "boot-log-ok", step.status);
        line.append(prefix, msg, st);
        terminalLog.append(line);

        progressFill.style.width = `${step.pct}%`;
        progressPercent.textContent = `${step.pct}%`;
      }, step.delay);
      timers.push(t);
    });

    // Auto dismiss after 3250ms
    const finalTimer = window.setTimeout(() => {
      dismiss();
    }, 3250);
    timers.push(finalTimer);
  });
}
