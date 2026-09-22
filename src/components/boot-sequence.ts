import {
  playCyberBootSequence,
  speakSystemGreeting,
  playBiometricAuthSound,
  playCircuitSurgeAudio,
  playLaserChirp,
  playEnergyPulse,
  playDecryptionTick,
} from "../services/audio";
import { element } from "../utils/dom";
import { createIcon } from "./icons";
import { triggerSparkBurst, triggerHexShockwave } from "../utils/particles";

export interface BootSequenceOptions {
  displayName?: string | null;
  appVersion?: string;
}

/**
 * Tactical Cybernetic Boot Sequence v0.17.0:
 * - Interactive Style 3: Magnetic Railgun Slider (Slide-to-Engage Neural Link)
 * - 6.0-second 4-phase cinematic BIOS / Kernel Power-On Self Test
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
    cornerTR.innerHTML = `<span class="corner-tag">[SECURITY]</span> DEFCON 1 // ZERO-TRUST AIRGAP<br><span class="corner-sub">CIPHER: AES-256-GCM // BUS: 5.20GHz (SYNC)</span>`;

    const cornerBL = element("div", "boot-hud-corner bottom-left");
    cornerBL.innerHTML = `<span class="corner-tag">[RADAR_MESH]</span> SENSORS: 127.0.0.1 // THREATS: 0<br><span class="corner-sub">TACTICAL TELEMETRY: 60 FPS NOMINAL</span>`;

    const cornerBR = element("div", "boot-hud-corner bottom-right");
    cornerBR.innerHTML = `<span class="corner-tag">[OVERRIDE]</span> ESC TO ABORT // SLIDE TO ENGAGE<br><span class="corner-sub">SYS_LATENCY: 0.08ms // STABLE</span>`;

    const content = element("div", "boot-content");

    // Top Header
    const header = element("div", "boot-header");
    const title = element("span", "boot-title");
    const dot = element("span", "boot-status-dot");
    title.append(dot, document.createTextNode("COMMAND VAULT // TACTICAL SECURE KERNEL"));
    const sysTime = element("span", "boot-systime", "REALTIME DIAGNOSTIC BUS");
    const version = element("span", "boot-version", options.appVersion ?? "v0.17.0");
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

    // Center Deck: Optical Biometric Scanner & Holographic Core
    const deckCenter = element("div", "boot-deck-center");
    const phaseBanner = element("div", "boot-phase-banner", "STANDBY // OPTICAL BIOMETRIC CLEARANCE MATRIX");

    // 1. Biometric Scanner Hub
    const biometricScanner = element("div", "boot-biometric-scanner");
    biometricScanner.setAttribute("role", "button");
    biometricScanner.setAttribute("tabindex", "0");
    biometricScanner.setAttribute("aria-label", "Optical Biometric Scanner. Click or hold to scan");

    const bioHeader = element("div", "biometric-scanner-header");
    const bioBadge = element("span", "biometric-badge", "DEFCON 1 // BIOMETRIC CLEARANCE");
    const bioStatus = element("span", "biometric-status", "[ AWAITING TOUCH ]");
    bioHeader.append(bioBadge, bioStatus);

    // The Optical Scanner Pad
    const scannerPad = element("div", "biometric-scanner-pad");
    const reticleRing1 = element("div", "biometric-reticle-ring ring-outer");
    const reticleRing2 = element("div", "biometric-reticle-ring ring-inner");
    const laserBar = element("div", "biometric-laser-bar");

    // Realistic Fingerprint SVG Icon
    const fingerprintSvg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    fingerprintSvg.setAttribute("class", "biometric-fingerprint-svg");
    fingerprintSvg.setAttribute("viewBox", "0 0 100 120");
    fingerprintSvg.innerHTML = `
      <path d="M50 15 C30 15 20 28 20 48 C20 72 30 100 50 105 C70 100 80 72 80 48 C80 28 70 15 50 15 Z" fill="none" stroke="currentColor" stroke-width="2" opacity="0.3"/>
      <path d="M50 25 C36 25 28 35 28 50 C28 70 36 92 50 97 C64 92 72 70 72 50 C72 35 64 25 50 25 Z" fill="none" stroke="currentColor" stroke-width="2.5" opacity="0.5"/>
      <path d="M50 35 C42 35 36 42 36 52 C36 67 42 84 50 89 C58 84 64 67 64 52 C64 42 58 35 50 35 Z" fill="none" stroke="currentColor" stroke-width="3" opacity="0.75"/>
      <path d="M50 45 C46 45 44 48 44 54 C44 64 47 76 50 81 C53 76 56 64 56 54 C56 48 54 45 50 45 Z" fill="none" stroke="currentColor" stroke-width="3.5" opacity="0.95"/>
      <circle cx="50" cy="54" r="3" fill="currentColor"/>
    `;

    scannerPad.append(reticleRing1, reticleRing2, laserBar, fingerprintSvg);

    const bioPrompt = element("div", "biometric-prompt-text", "✦ HOLD TO SCAN OR CLICK TO AUTHENTICATE ✦");
    const bioDiagnostics = element("div", "biometric-diagnostics", "[ SENSOR: 9600 DPI OPTICAL // READY ]");

    biometricScanner.append(bioHeader, scannerPad, bioPrompt, bioDiagnostics);

    // 2. Holographic Quantum Core (revealed once engaged)
    const holoCenter = element("div", "boot-holo-center");
    holoCenter.style.display = "none";
    const holoOuterRing = element("div", "boot-holo-outer-ring");
    const holoRing = element("div", "boot-holo-ring");
    const holoInner = element("div", "boot-holo-inner");
    const holoIcon = createIcon("command-file", "boot-holo-icon");
    holoCenter.append(holoOuterRing, holoRing, holoInner, holoIcon);

    const clearanceContainer = element("div", "boot-clearance-container");

    const progressContainer = element("div", "boot-progress-container");
    const progressHeader = element("div", "boot-progress-header");
    const progressLabel = element("span", undefined, "STANDBY MODE // CORE ARMED");
    const progressPercent = element("span", "boot-progress-percent", "0%");
    progressHeader.append(progressLabel, progressPercent);

    const progressTrack = element("div", "boot-progress-track");
    const progressFill = element("div", "boot-progress-fill");
    progressTrack.append(progressFill);
    progressContainer.append(progressHeader, progressTrack);

    const skipHint = element("span", "boot-skip-hint", "[ ESC TO SKIP // SPACE TO AUTHENTICATE ]");
    deckCenter.append(phaseBanner, biometricScanner, holoCenter, clearanceContainer, progressContainer, skipHint);

    // Right Deck: Real-time Kernel POST Stream
    const deckRight = element("div", "boot-deck-right");
    const rightHeader = element("div", "boot-deck-header", "// REAL-TIME POST STREAM");
    const terminalLog = element("div", "boot-terminal-log");
    const hexStream = element("div", "boot-hex-stream");
    hexStream.innerHTML = `<span class="hex-addr">0x7FFE04</span> <span class="hex-bytes">48 89 E5 31 C0 48 83 EC</span> <span class="hex-tag">[BIO_STANDBY]</span>`;
    const terminalPrompt = element("div", "boot-terminal-prompt", "> _");
    deckRight.append(rightHeader, terminalLog, hexStream, terminalPrompt);

    deckGrid.append(deckLeft, deckCenter, deckRight);
    content.append(header, deckGrid);
    overlay.append(bgGrid, bgRadar, laserSweep, cornerTL, cornerTR, cornerBL, cornerBR, content);
    document.body.append(overlay);

    let dismissed = false;
    let running = false;
    const timers: number[] = [];

    // ==========================================
    // Biometric Optical Scanning Engine
    // ==========================================
    let scanProgress = 0;
    let scanTimer: number | null = null;

    function startScanning() {
      if (running || dismissed || scanTimer !== null) return;
      biometricScanner.classList.add("scanning");
      bioStatus.textContent = "[ SCANNING... ]";
      playEnergyPulse();

      scanTimer = window.setInterval(() => {
        scanProgress += 20;
        bioDiagnostics.textContent = `[ ANALYZING GENOMIC DATA: ${Math.min(99, scanProgress)}% ]`;
        playDecryptionTick();

        if (scanProgress >= 100) {
          if (scanTimer !== null) {
            window.clearInterval(scanTimer);
            scanTimer = null;
          }
          engageBiometrics();
        }
      }, 70);
    }

    function cancelScanning() {
      if (running || dismissed) return;
      if (scanTimer !== null) {
        window.clearInterval(scanTimer);
        scanTimer = null;
      }
      scanProgress = 0;
      biometricScanner.classList.remove("scanning");
      bioStatus.textContent = "[ AWAITING TOUCH ]";
      bioDiagnostics.textContent = "[ SENSOR: 9600 DPI OPTICAL // READY ]";
    }

    function engageBiometrics() {
      if (running || dismissed) return;
      running = true;
      if (scanTimer !== null) {
        window.clearInterval(scanTimer);
        scanTimer = null;
      }

      biometricScanner.classList.add("verified");
      bioStatus.textContent = "[ ACCESS GRANTED ]";
      bioDiagnostics.textContent = "[ 100% MATCH // OPERATOR CONFIRMED ]";

      const rect = scannerPad.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      triggerSparkBurst(cx, cy);
      triggerHexShockwave(cx, cy);

      playBiometricAuthSound();
      playCircuitSurgeAudio();
      playLaserChirp();
      playCyberBootSequence();

      window.setTimeout(() => {
        biometricScanner.classList.add("engaged-hidden");
        holoCenter.style.display = "flex";
        holoCenter.classList.add("core-igniting");
      }, 240);

      start6SecondTimeline();
    }

    biometricScanner.addEventListener("pointerdown", (e) => {
      e.stopPropagation();
      startScanning();
    });

    biometricScanner.addEventListener("pointerup", (e) => {
      e.stopPropagation();
      if (scanProgress < 100) {
        cancelScanning();
      }
    });

    biometricScanner.addEventListener("pointerleave", () => {
      if (scanProgress < 100) {
        cancelScanning();
      }
    });

    biometricScanner.addEventListener("click", (e) => {
      e.stopPropagation();
      engageBiometrics();
    });

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

      oscCtx.strokeStyle = running ? "#00ff9d" : "#00f0ff";
      oscCtx.shadowColor = running ? "#00ff9d" : "#00f0ff";
      oscCtx.shadowBlur = running ? 10 : 6;
      oscCtx.lineWidth = running ? 2.0 : 1.6;
      oscCtx.beginPath();
      for (let x = 0; x < 240; x += 2) {
        const amplitude = running ? 11 : 6;
        const y = 20 + Math.sin(x * 0.06 + oscPhase) * amplitude + Math.cos(x * 0.12 - oscPhase * 1.5) * (amplitude * 0.6);
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
      if (e.key === "Escape") {
        e.stopPropagation();
        dismiss();
        return;
      }
      if (e.key === "Enter" || e.key === " ") {
        e.stopPropagation();
        e.preventDefault();
        engageBiometrics();
        return;
      }
    };

    window.addEventListener("keydown", onKeyDown, true);

    // Auto-engage fallback after 5.0 seconds if user is idle
    const autoEngageTimer = window.setTimeout(() => {
      if (!running && !dismissed) {
        engageBiometrics();
      }
    }, 5000);
    timers.push(autoEngageTimer);

    const name = (options.displayName?.trim() || "OPERATOR").toUpperCase();

    function start6SecondTimeline() {
      phaseBanner.textContent = "PHASE 1 // POWER GRID SURGE & HARDWARE POST";
      progressLabel.textContent = "INITIALIZING SECURE KERNEL BUS";

      // 6.0-Second 4-Phase Cinematic Timeline Schedule
      const steps: Array<{
        delay: number;
        prefix: string;
        text: string;
        status: string;
        pct: number;
        action?: () => void;
      }> = [
        // Phase 1: Hardware POST & Memory Enclave (0.0s - 1.5s)
        { delay: 100, prefix: "[POWER]", text: "HIGH VOLTAGE BUS STABILIZED: 380V // 4.80GHz", status: "ONLINE", pct: 8 },
        { delay: 400, prefix: "[BIOS]", text: "SECURE HARDWARE ENCLAVE INITIALIZATION", status: "OK", pct: 16 },
        { delay: 750, prefix: "[CORES]", text: "8/8 CPU LOGICAL ENGINES SYNCHRONIZED", status: "LOCKED", pct: 24 },
        { delay: 1100, prefix: "[VRAM]", text: "GPU ACCELERATION PIPELINE: 60 FPS NOMINAL", status: "READY", pct: 32 },
        { delay: 1400, prefix: "[MEM]", text: "ZERO-KNOWLEDGE ENCRYPTED RAM ALLOCATED: 64 GB", status: "ARMED", pct: 40 },

        // Phase 2: Quantum Core Reactor Overdrive (1.5s - 3.2s)
        {
          delay: 1600,
          prefix: "[CORE]",
          text: "INJECTING PLASMA CONFINEMENT FIELD: 5.20GHz OVERCLOCK",
          status: "STABILIZED",
          pct: 50,
          action: () => {
            phaseBanner.textContent = "PHASE 2 // QUANTUM CORE REACTOR OVERDRIVE";
            progressLabel.textContent = "CALIBRATING QUANTUM CONFINEMENT";
            playEnergyPulse();
            hexStream.innerHTML = `<span class="hex-addr">0x7FFE04</span> <span class="hex-bytes">48 8D 3D E8 2B 00 00 90</span> <span class="hex-tag ok">[CORE_ACTIVE]</span>`;
          },
        },
        { delay: 2000, prefix: "[RADAR]", text: "360° SENSOR ARRAY ACTIVE // 0 THREAT ANOMALIES", status: "CLEAR", pct: 60 },
        { delay: 2400, prefix: "[CIPHER]", text: "QUANTUM KEY EXCHANGE: AES-256-GCM HANDSHAKE", status: "ENCRYPTED", pct: 68 },
        { delay: 2800, prefix: "[BUS]", text: "ULTRA-LOW LATENCY AIRGAP DATA BUS: 0.08ms", status: "OPTIMAL", pct: 75 },

        // Phase 3: Matrix Hex Decryption & Operator Identity (3.2s - 4.8s)
        {
          delay: 3200,
          prefix: "[MATRIX]",
          text: "INITIATING LIVE OPERATOR IDENTITY DECRYPTION CASCADE",
          status: "SYNC",
          pct: 82,
          action: () => {
            phaseBanner.textContent = "PHASE 3 // MATRIX DECRYPTION & IDENTITY VERIFICATION";
            progressLabel.textContent = `DECODING OPERATOR TOKEN: ${name}`;
            startNameDecoder(name);
          },
        },
        { delay: 3600, prefix: "[VAULT]", text: "AIRGAPPED SECURE FILE REPOSITORY INTEGRITY", status: "100%", pct: 88 },
        { delay: 4100, prefix: "[DEFCON]", text: "DEFCON 1 ZERO-TRUST POLICY ARMED & ENFORCED", status: "SECURE", pct: 93 },
        { delay: 4500, prefix: "[ENCLAVE]", text: "HARDWARE SECURITY MODULE (HSM) ACTIVE", status: "NOMINAL", pct: 97 },

        // Phase 4: Clearance Level 5 & Supernova Dissolve (4.8s - 6.0s)
        {
          delay: 4800,
          prefix: "[EXEC]",
          text: `ACCESS GRANTED // CLEARANCE: LEVEL 5 // WELCOME, ${name}`,
          status: "APPROVED",
          pct: 100,
          action: () => {
            phaseBanner.textContent = "PHASE 4 // CLEARANCE LEVEL 5 GRANTED";
            progressLabel.textContent = "ALL SYSTEMS NOMINAL // AIRGAP SECURE";
            playBiometricAuthSound();
            speakSystemGreeting(
              `Biometrics confirmed. Operator ${name} authenticated. Quantum core online. Welcome to Command Vault.`,
            );
            const badge = element("div", "boot-clearance-badge", `CLEARANCE LEVEL 5 // ${name}`);
            clearanceContainer.append(badge);
            hexStream.innerHTML = `<span class="hex-addr">0x7FFE04</span> <span class="hex-bytes">FF FF FF FF 00 00 00 00</span> <span class="hex-tag ok">[ENCLAVE_READY]</span>`;
          },
        },
        {
          delay: 5600,
          prefix: "[WARP]",
          text: "SUPERNOVA SINGULARITY DISSOLVE INITIALIZED",
          status: "WARP",
          pct: 100,
          action: () => {
            overlay.classList.add("boot-collapsing");
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

      // Auto dismiss after 6050ms
      const finalTimer = window.setTimeout(() => {
        dismiss();
      }, 6050);
      timers.push(finalTimer);
    }

    function startNameDecoder(targetName: string) {
      let decodeIdx = 0;
      const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!#$@%";
      const interval = window.setInterval(() => {
        if (dismissed || decodeIdx > targetName.length) {
          window.clearInterval(interval);
          return;
        }
        playDecryptionTick();
        const revealed = targetName.slice(0, decodeIdx);
        const randomChar = chars[Math.floor(Math.random() * chars.length)] ?? "X";
        const placeholder = decodeIdx < targetName.length ? randomChar : "";
        hexStream.innerHTML = `<span class="hex-addr">0xID</span> <span class="hex-bytes">${revealed}${placeholder}</span> <span class="hex-tag ok">[DECODING]</span>`;
        decodeIdx++;
      }, 140);
      timers.push(interval as unknown as number);
    }
  });
}
