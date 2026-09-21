import { playCyberBootSequence, speakSystemGreeting } from "../services/audio";
import { element } from "../utils/dom";
import { createIcon } from "./icons";

export interface BootSequenceOptions {
  displayName?: string | null;
  appVersion?: string;
}

/**
 * Tactical Cybernetic Boot Sequence:
 * Displays a futuristic BIOS / Kernel Power-On Self Test overlay
 * with laser sweep, progress bar, audio chime, and optional robot voice.
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

    // Holo Center
    const holoCenter = element("div", "boot-holo-center");
    holoCenter.append(
      element("div", "boot-holo-ring"),
      element("div", "boot-holo-inner"),
      createIcon("command-file", "boot-holo-icon"),
    );

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

    content.append(header, holoCenter, terminalLog, progressContainer, skipHint);
    overlay.append(laserSweep, content);
    document.body.append(overlay);

    // Start Audio
    playCyberBootSequence();
    speakSystemGreeting("Command Vault online. Systems operational.");

    let dismissed = false;
    let animTimer: number | null = null;
    let stepTimer: number | null = null;

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;

      window.removeEventListener("keydown", onKeyDown, true);
      overlay.removeEventListener("pointerdown", onPointerDown, true);

      if (animTimer !== null) window.clearTimeout(animTimer);
      if (stepTimer !== null) window.clearTimeout(stepTimer);

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

    // Boot lines sequence
    const name = (options.displayName?.trim() || "OPERATOR").toUpperCase();
    const steps = [
      { delay: 40, prefix: "[BOOT]", text: "KERNEL CHECK: SECURE OS RUNTIME", status: "OK", pct: 20 },
      { delay: 200, prefix: "[CORE]", text: "QUANTUM REACTOR 4.80GHz: STABILIZED", status: "99.8%", pct: 45 },
      { delay: 400, prefix: "[MESH]", text: "NEURAL CO-PROCESSOR: 60 FPS ACTIVE", status: "ONLINE", pct: 70 },
      { delay: 620, prefix: "[AUTH]", text: "VAULT CRYPTOGRAPHIC ENGINE", status: "DECRYPTED", pct: 90 },
      { delay: 840, prefix: "[READY]", text: `ACCESS GRANTED // WELCOME, ${name}`, status: "100%", pct: 100 },
    ];

    steps.forEach((step) => {
      window.setTimeout(() => {
        if (dismissed) return;
        const line = element("div", "boot-log-line");
        const prefix = element("span", "boot-log-prefix", step.prefix);
        const msg = element("span", undefined, step.text);
        const st = element("span", "boot-log-ok", step.status);
        line.append(prefix, msg, st);
        terminalLog.append(line);

        progressFill.style.width = `${step.pct}%`;
        progressPercent.textContent = `${step.pct}%`;
      }, step.delay);
    });

    // Auto dismiss after completion
    animTimer = window.setTimeout(() => {
      dismiss();
    }, 1150);
  });
}
