import { playCyberBootSequence, speakSystemGreeting, playBiometricAuthSound } from "../services/audio";
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

    // Full-screen Ambient Backgrounds
    const bgGrid = element("div", "boot-bg-grid");
    const bgRadar = element("div", "boot-bg-radar");
    const laserSweep = element("div", "boot-laser-sweep");

    // 4 Corner HUD Perimeter Telemetry Pods
    const cornerTL = element("div", "boot-hud-corner top-left");
    cornerTL.innerHTML = `<span class="corner-tag">[SYS_KERNEL]</span> ARCH: X86_64 // KERNEL: 6.8.0-SECURE<br><span class="corner-sub">STATUS: HOST ENCLAVE ALLOCATED (OK)</span>`;

    const cornerTR = element("div", "boot-hud-corner top-right");
    cornerTR.innerHTML = `<span class="corner-tag">[SECURITY]</span> DEFCON 1 // ZERO-TRUST AIRGAP<br><span class="corner-sub">CIPHER: AES-256-GCM // BUS: 4.80GHz (SYNC)</span>`;

    const cornerBL = element("div", "boot-hud-corner bottom-left");
    cornerBL.innerHTML = `<span class="corner-tag">[RADAR_MESH]</span> SENSORS: 127.0.0.1 // THREATS: 0<br><span class="corner-sub">TACTICAL TELEMETRY: 60 FPS NOMINAL</span>`;

    const cornerBR = element("div", "boot-hud-corner bottom-right");
    cornerBR.innerHTML = `<span class="corner-tag">[OVERRIDE]</span> ESC / ANY KEY / CLICK TO SKIP<br><span class="corner-sub">SYS_LATENCY: 0.12ms // STABLE</span>`;

    const content = element("div", "boot-content");

    // Top Header
    const header = element("div", "boot-header");
    const title = element("span", "boot-title");
    const dot = element("span", "boot-status-dot");
    title.append(dot, document.createTextNode("COMMAND VAULT // TACTICAL SECURE KERNEL"));
    const sysTime = element("span", "boot-systime", "REALTIME DIAGNOSTIC BUS");
    const version = element("span", "boot-version", options.appVersion ?? "v0.16.0");
    header.append(title, sysTime, version);

    // 3-Deck Panoramic Mainframe Layout
    const deckGrid = element("div", "boot-deck-grid");

    // Left Deck: System Enclave & Hardware Metrics
    const deckLeft = element("div", "boot-deck-left");
    const leftHeader = element("div", "boot-deck-header", "// HARDWARE ENCLAVE");
    const metricsList = element("div", "boot-metrics-list");
    metricsList.innerHTML = `
      <div class="boot-metric-item">
        <span class="boot-metric-name">CPU CORES</span>
        <div class="boot-metric-bar"><div class="boot-metric-fill cpu"></div></div>
        <span class="boot-metric-val">8/8 ON</span>
      </div>
      <div class="boot-metric-item">
        <span class="boot-metric-name">VRAM BUF</span>
        <div class="boot-metric-bar"><div class="boot-metric-fill vram"></div></div>
        <span class="boot-metric-val">60 FPS</span>
      </div>
      <div class="boot-metric-item">
        <span class="boot-metric-name">CRYPTO BUS</span>
        <div class="boot-metric-bar"><div class="boot-metric-fill crypto"></div></div>
        <span class="boot-metric-val">SHA-256</span>
      </div>
      <div class="boot-metric-item">
        <span class="boot-metric-name">AIRGAP ENCLAVE</span>
        <div class="boot-metric-bar"><div class="boot-metric-fill airgap"></div></div>
        <span class="boot-metric-val">SECURE</span>
      </div>
    `;

    // Live Quantum Oscilloscope Waveform Canvas
    const oscCanvas = element("canvas", "boot-oscilloscope-canvas") as HTMLCanvasElement;
    oscCanvas.width = 240;
    oscCanvas.height = 40;
    const oscCtx = oscCanvas.getContext("2d");
    let oscAnimId = 0;
    let oscPhase = 0;

    const freqVisualizer = element("div", "boot-freq-visualizer");
    for (let i = 0; i < 14; i++) {
      const bar = element("span", "boot-freq-bar");
      bar.style.animationDelay = `${(i * 0.08).toFixed(2)}s`;
      freqVisualizer.append(bar);
    }
    deckLeft.append(leftHeader, metricsList, oscCanvas, freqVisualizer);

    // Center Deck: Quantum Core Reactor & Biometrics
    const deckCenter = element("div", "boot-deck-center");
    const phaseBanner = element("div", "boot-phase-banner", "PHASE 1 // BIOMETRIC & HARDWARE AUTHENTICATION");

    const holoCenter = element("div", "boot-holo-center");
    const holoOuterRing = element("div", "boot-holo-outer-ring");
    const holoRing = element("div", "boot-holo-ring");
    const holoInner = element("div", "boot-holo-inner");
    const holoIcon = createIcon("command-file", "boot-holo-icon");
    holoCenter.append(holoOuterRing, holoRing, holoInner, holoIcon);

    const clearanceContainer = element("div", "boot-clearance-container");

    const progressContainer = element("div", "boot-progress-container");
    const progressHeader = element("div", "boot-progress-header");
    const progressLabel = element("span", undefined, "INITIALIZING SYSTEM MODULES");
    const progressPercent = element("span", "boot-progress-percent", "0%");
    progressHeader.append(progressLabel, progressPercent);

    const progressTrack = element("div", "boot-progress-track");
    const progressFill = element("div", "boot-progress-fill");
    progressTrack.append(progressFill);
    progressContainer.append(progressHeader, progressTrack);

    const skipHint = element("span", "boot-skip-hint", "[ CLICK ANYWHERE OR PRESS ANY KEY TO SKIP ]");
    deckCenter.append(phaseBanner, holoCenter, clearanceContainer, progressContainer, skipHint);

    // Right Deck: Real-time Kernel POST Stream
    const deckRight = element("div", "boot-deck-right");
    const rightHeader = element("div", "boot-deck-header", "// REAL-TIME POST STREAM");
    const terminalLog = element("div", "boot-terminal-log");
    const hexStream = element("div", "boot-hex-stream");
    hexStream.innerHTML = `<span class="hex-addr">0x7FFE04</span> <span class="hex-bytes">48 89 E5 31 C0 48 83 EC</span> <span class="hex-tag">[MEM_ENCRYPTED]</span>`;
    const terminalPrompt = element("div", "boot-terminal-prompt", "> _");
    deckRight.append(rightHeader, terminalLog, hexStream, terminalPrompt);

    deckGrid.append(deckLeft, deckCenter, deckRight);
    content.append(header, deckGrid);
    overlay.append(bgGrid, bgRadar, laserSweep, cornerTL, cornerTR, cornerBL, cornerBR, content);
    document.body.append(overlay);

    // Start Audio
    playCyberBootSequence();

    let dismissed = false;
    const timers: number[] = [];

    function renderOsc() {
      if (dismissed || !oscCtx) return;
      oscPhase += 0.08;
      oscCtx.clearRect(0, 0, 240, 40);
      oscCtx.strokeStyle = "rgba(0, 255, 255, 0.15)";
      oscCtx.lineWidth = 1;
      oscCtx.beginPath();
      oscCtx.moveTo(0, 20);
      oscCtx.lineTo(240, 20);
      oscCtx.stroke();

      oscCtx.strokeStyle = "#00f0ff";
      oscCtx.shadowColor = "#00f0ff";
      oscCtx.shadowBlur = 6;
      oscCtx.lineWidth = 1.6;
      oscCtx.beginPath();
      for (let x = 0; x < 240; x += 2) {
        const y = 20 + Math.sin(x * 0.06 + oscPhase) * 8 + Math.cos(x * 0.12 - oscPhase * 1.5) * 5;
        if (x === 0) oscCtx.moveTo(x, y);
        else oscCtx.lineTo(x, y);
      }
      oscCtx.stroke();
      oscCtx.shadowBlur = 0;
      oscAnimId = requestAnimationFrame(renderOsc);
    }
    oscAnimId = requestAnimationFrame(renderOsc);

    const dismiss = () => {
      if (dismissed) return;
      dismissed = true;

      if (oscAnimId) cancelAnimationFrame(oscAnimId);
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
          hexStream.innerHTML = `<span class="hex-addr">0x7FFE04</span> <span class="hex-bytes">48 8D 3D E8 2B 00 00 90</span> <span class="hex-tag ok">[DECRYPTING...]</span>`;
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
          playBiometricAuthSound();
          speakSystemGreeting("Biometrics confirmed. Operator authenticated. Command Vault online and ready for operations.");
          const badge = element("div", "boot-clearance-badge", `CLEARANCE LEVEL 5 // ${name}`);
          clearanceContainer.append(badge);
          hexStream.innerHTML = `<span class="hex-addr">0x7FFE04</span> <span class="hex-bytes">FF FF FF FF 00 00 00 00</span> <span class="hex-tag ok">[ENCLAVE_READY]</span>`;
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
        terminalLog.scrollTop = terminalLog.scrollHeight;

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
