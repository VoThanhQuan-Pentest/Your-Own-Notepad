let audioCtx: AudioContext | null = null;
let masterGain: GainNode | null = null;
let analyserNode: AnalyserNode | null = null;
let isMuted = false;

if (typeof window !== "undefined") {
  try {
    isMuted = window.localStorage.getItem("cv_audio_muted") === "true";
  } catch {
    // LocalStorage might be restricted
  }

  // Global user gesture unlock for WebKitGTK / Chromium Autoplay policy
  const unlockAudio = () => {
    const ctx = getAudioContext();
    if (ctx && ctx.state === "suspended") {
      ctx.resume().catch(() => {});
    }
  };
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });
}

export function isAudioMuted(): boolean {
  return isMuted;
}

export function setAudioMuted(muted: boolean): void {
  isMuted = muted;
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem("cv_audio_muted", String(muted));
    } catch {
      // Ignore
    }
  }
}

export function toggleAudioMuted(): boolean {
  setAudioMuted(!isMuted);
  return isMuted;
}

function getAudioContext(): AudioContext | null {
  if (typeof window === "undefined") return null;
  const AudioCtxClass =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtxClass) return null;

  if (!audioCtx) {
    try {
      audioCtx = new AudioCtxClass();
    } catch {
      return null;
    }
  }
  return audioCtx;
}

function getAudioOutput(): { ctx: AudioContext; output: AudioNode } | null {
  const ctx = getAudioContext();
  if (!ctx) return null;

  if (!analyserNode || !masterGain) {
    try {
      analyserNode = ctx.createAnalyser();
      analyserNode.fftSize = 32;
      analyserNode.smoothingTimeConstant = 0.55;

      masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(1.0, ctx.currentTime);

      masterGain.connect(analyserNode);
      analyserNode.connect(ctx.destination);
    } catch {
      return null;
    }
  }
  return { ctx, output: masterGain };
}

export function getAudioFrequencyData(targetArray: Uint8Array): void {
  if (!analyserNode) {
    targetArray.fill(0);
    return;
  }
  analyserNode.getByteFrequencyData(targetArray);
}

export function getAudioTimeDomainData(targetArray: Uint8Array): void {
  if (!analyserNode) {
    targetArray.fill(128);
    return;
  }
  analyserNode.getByteTimeDomainData(targetArray);
}

function isAudioEnabled(): boolean {
  if (isMuted) return false;
  if (typeof document === "undefined") return false;
  return document.documentElement.dataset.performance === "full";
}

/**
 * Universal sound scheduler ensuring playback even if AudioContext was suspended
 */
function playSound(
  render: (ctx: AudioContext, output: AudioNode, startTime: number) => void,
): void {
  if (!isAudioEnabled()) return;
  try {
    const audio = getAudioOutput();
    if (!audio) return;
    const { ctx, output } = audio;

    const trigger = () => {
      const startTime = ctx.currentTime + 0.005;
      render(ctx, output, startTime);
    };

    if (ctx.state === "suspended") {
      ctx.resume().then(trigger).catch(() => {});
    } else {
      trigger();
    }
  } catch {
    // Audio errors must never disrupt user workflow
  }
}

/**
 * Laser chirp sound on command copy (punchy high-tech frequency sweep)
 */
export function playLaserChirp(): void {
  playSound((ctx, output, now) => {
    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(880, now);
    osc.frequency.exponentialRampToValueAtTime(2400, now + 0.07);

    subOsc.type = "triangle";
    subOsc.frequency.setValueAtTime(440, now);
    subOsc.frequency.exponentialRampToValueAtTime(1200, now + 0.07);

    gain.gain.setValueAtTime(0.26, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.085);

    osc.connect(gain);
    subOsc.connect(gain);
    gain.connect(output);

    osc.start(now);
    subOsc.start(now);
    osc.stop(now + 0.09);
    subOsc.stop(now + 0.09);
  });
}

/**
 * Resonant harmonic pop on favorite toggle
 */
export function playEnergyPulse(): void {
  playSound((ctx, output, now) => {
    const osc = ctx.createOscillator();
    const subOsc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(587.33, now); // D5
    osc.frequency.exponentialRampToValueAtTime(1174.66, now + 0.1); // D6

    subOsc.type = "sine";
    subOsc.frequency.setValueAtTime(293.66, now); // D4
    subOsc.frequency.exponentialRampToValueAtTime(587.33, now + 0.1);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    subOsc.connect(gain);
    gain.connect(output);

    osc.start(now);
    subOsc.start(now);
    osc.stop(now + 0.145);
    subOsc.stop(now + 0.145);
  });
}

/**
 * Subtle mechanical tactile tick for folder clicks / tree navigation
 */
export function playServoClick(): void {
  playSound((ctx, output, now) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(180, now + 0.035);

    gain.gain.setValueAtTime(0.20, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);

    osc.connect(gain);
    gain.connect(output);

    osc.start(now);
    osc.stop(now + 0.045);
  });
}

/**
 * Hydraulic/pneumatic latch hiss when expanding/collapsing sections
 */
export function playPneumaticHiss(opening = true): void {
  playSound((ctx, output, now) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    filter.type = "bandpass";
    filter.Q.setValueAtTime(2.5, now);

    if (opening) {
      osc.frequency.setValueAtTime(220, now);
      osc.frequency.exponentialRampToValueAtTime(90, now + 0.09);
      filter.frequency.setValueAtTime(1200, now);
      filter.frequency.exponentialRampToValueAtTime(400, now + 0.09);
    } else {
      osc.frequency.setValueAtTime(110, now);
      osc.frequency.exponentialRampToValueAtTime(200, now + 0.08);
      filter.frequency.setValueAtTime(500, now);
      filter.frequency.exponentialRampToValueAtTime(1000, now + 0.08);
    }

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.095);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(output);

    osc.start(now);
    osc.stop(now + 0.1);
  });
}

/**
 * Time warp frequency reversal sweep on Undo / Redo
 */
export function playTimeWarp(isRedo = false): void {
  playSound((ctx, output, now) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    if (isRedo) {
      osc.frequency.setValueAtTime(320, now);
      osc.frequency.exponentialRampToValueAtTime(1400, now + 0.11);
    } else {
      osc.frequency.setValueAtTime(1400, now);
      osc.frequency.exponentialRampToValueAtTime(320, now + 0.11);
    }

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(output);

    osc.start(now);
    osc.stop(now + 0.125);
  });
}

/**
 * Micro tactical blip on search keypress
 */
export function playTacticalBlip(): void {
  playSound((ctx, output, now) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "triangle";
    osc.frequency.setValueAtTime(2200, now);
    osc.frequency.exponentialRampToValueAtTime(3100, now + 0.022);

    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    osc.connect(gain);
    gain.connect(output);

    osc.start(now);
    osc.stop(now + 0.028);
  });
}

/**
 * Modal whoosh on dialog open / close
 */
export function playModalWhoosh(opening = true): void {
  playSound((ctx, output, now) => {
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = "sawtooth";
    filter.type = "lowpass";

    if (opening) {
      osc.frequency.setValueAtTime(180, now);
      osc.frequency.exponentialRampToValueAtTime(480, now + 0.12);
      filter.frequency.setValueAtTime(400, now);
      filter.frequency.exponentialRampToValueAtTime(1800, now + 0.12);
    } else {
      osc.frequency.setValueAtTime(480, now);
      osc.frequency.exponentialRampToValueAtTime(180, now + 0.1);
      filter.frequency.setValueAtTime(1800, now);
      filter.frequency.exponentialRampToValueAtTime(300, now + 0.1);
    }

    gain.gain.setValueAtTime(0.20, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.13);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(output);

    osc.start(now);
    osc.stop(now + 0.135);
  });
}

/**
 * Double-beep tactical lock-on when clicking parameters/chips
 */
export function playTargetLock(): void {
  playSound((ctx, output, now) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    osc.frequency.setValueAtTime(1760, now);
    osc.frequency.setValueAtTime(2349, now + 0.04);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.setValueAtTime(0.02, now + 0.035);
    gain.gain.setValueAtTime(0.24, now + 0.04);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);

    osc.connect(gain);
    gain.connect(output);

    osc.start(now);
    osc.stop(now + 0.095);
  });
}

/**
 * Quantum Reactor Core Overload - rising electromagnetic sonic hum with discharge
 */
export function playReactorOverload(): void {
  playSound((ctx, output, now) => {
    const sub = ctx.createOscillator();
    const sweep = ctx.createOscillator();
    const gain = ctx.createGain();

    sub.type = "sawtooth";
    sub.frequency.setValueAtTime(55, now);
    sub.frequency.exponentialRampToValueAtTime(110, now + 0.45);

    sweep.type = "triangle";
    sweep.frequency.setValueAtTime(220, now);
    sweep.frequency.exponentialRampToValueAtTime(1760, now + 0.4);
    sweep.frequency.exponentialRampToValueAtTime(440, now + 0.55);

    gain.gain.setValueAtTime(0.28, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.25);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.58);

    sub.connect(gain);
    sweep.connect(gain);
    gain.connect(output);

    sub.start(now);
    sweep.start(now);
    sub.stop(now + 0.6);
    sweep.stop(now + 0.6);
  });
}

/**
 * Fast matrix data stream tick
 */
export function playDecryptionTick(): void {
  playSound((ctx, output, now) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    const freq = 2400 + Math.floor(Math.random() * 1200);
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);

    gain.gain.setValueAtTime(0.10, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.016);

    osc.connect(gain);
    gain.connect(output);

    osc.start(now);
    osc.stop(now + 0.018);
  });
}

/**
 * Tactical Cyber Boot Sequence - 3.0s multi-phase cinematic power surge
 */
export function playCyberBootSequence(): void {
  playSound((ctx, output, now) => {
    // Phase 1: Biometric radar pulses & low hum (0.0s - 1.5s)
    [0.0, 0.35, 0.7, 1.05].forEach((delay, idx) => {
      const ping = ctx.createOscillator();
      const pingGain = ctx.createGain();
      ping.type = "sine";
      ping.frequency.setValueAtTime(1050 + idx * 180, now + delay);
      pingGain.gain.setValueAtTime(0.001, now + delay);
      pingGain.gain.linearRampToValueAtTime(0.09, now + delay + 0.02);
      pingGain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.14);
      ping.connect(pingGain);
      pingGain.connect(output);
      ping.start(now + delay);
      ping.stop(now + delay + 0.15);
    });

    const subHum = ctx.createOscillator();
    const subGain = ctx.createGain();
    subHum.type = "sine";
    subHum.frequency.setValueAtTime(55, now);
    subHum.frequency.linearRampToValueAtTime(65, now + 1.5);
    subGain.gain.setValueAtTime(0.001, now);
    subGain.gain.linearRampToValueAtTime(0.12, now + 0.4);
    subGain.gain.linearRampToValueAtTime(0.05, now + 1.5);
    subHum.connect(subGain);
    subGain.connect(output);
    subHum.start(now);
    subHum.stop(now + 1.5);

    // Phase 2: Turbine spool-up & quantum reactor ignition (1.5s - 3.2s)
    const turbine = ctx.createOscillator();
    const turbineGain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    turbine.type = "sawtooth";
    turbine.frequency.setValueAtTime(45, now + 1.5);
    turbine.frequency.exponentialRampToValueAtTime(260, now + 3.2);

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(120, now + 1.5);
    filter.frequency.exponentialRampToValueAtTime(2400, now + 3.2);

    turbineGain.gain.setValueAtTime(0.001, now + 1.5);
    turbineGain.gain.linearRampToValueAtTime(0.25, now + 2.8);
    turbineGain.gain.exponentialRampToValueAtTime(0.02, now + 3.4);

    turbine.connect(filter);
    filter.connect(turbineGain);
    turbineGain.connect(output);
    turbine.start(now + 1.5);
    turbine.stop(now + 3.4);

    // Phase 3: High-speed matrix decryption arpeggio (3.2s - 4.8s)
    const arpeggio = [587.33, 659.25, 783.99, 880.00, 1046.50, 1174.66, 1318.51, 1567.98];
    arpeggio.forEach((freq, idx) => {
      const noteDelay = 3.2 + idx * 0.18;
      const noteOsc = ctx.createOscillator();
      const noteGain = ctx.createGain();
      noteOsc.type = "sine";
      noteOsc.frequency.setValueAtTime(freq, now + noteDelay);
      noteGain.gain.setValueAtTime(0.001, now + noteDelay);
      noteGain.gain.linearRampToValueAtTime(0.08, now + noteDelay + 0.02);
      noteGain.gain.exponentialRampToValueAtTime(0.001, now + noteDelay + 0.15);
      noteOsc.connect(noteGain);
      noteGain.connect(output);
      noteOsc.start(now + noteDelay);
      noteOsc.stop(now + noteDelay + 0.16);
    });

    // Phase 4: Majestic cyberpunk harmonic chord bloom & sub-bass drop (4.8s - 5.8s)
    const chords = [220, 329.63, 440, 554.37, 659.25, 880];
    chords.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq * 0.94, now + 4.8);
      osc.frequency.exponentialRampToValueAtTime(freq, now + 5.0 + idx * 0.04);

      const delay = 4.8 + idx * 0.04;
      g.gain.setValueAtTime(0.001, now + delay);
      g.gain.linearRampToValueAtTime(0.24 / (idx + 1), now + delay + 0.2);
      g.gain.exponentialRampToValueAtTime(0.001, now + 5.85);

      osc.connect(g);
      g.connect(output);
      osc.start(now + delay);
      osc.stop(now + 5.9);
    });

    // High crystal confirmation chime & Supernova burst (5.4s - 6.0s)
    const chime = ctx.createOscillator();
    const chimeGain = ctx.createGain();
    chime.type = "sine";
    chime.frequency.setValueAtTime(2200, now + 5.3);
    chime.frequency.exponentialRampToValueAtTime(3520, now + 5.65);
    chimeGain.gain.setValueAtTime(0.001, now + 5.3);
    chimeGain.gain.linearRampToValueAtTime(0.16, now + 5.45);
    chimeGain.gain.exponentialRampToValueAtTime(0.001, now + 5.98);
    chime.connect(chimeGain);
    chimeGain.connect(output);
    chime.start(now + 5.3);
    chime.stop(now + 6.0);
  });
}

/**
 * Haptic mechanical keyboard switch click for search & typing
 */
export function playMechanicalClick(): void {
  playSound((ctx, output, now) => {
    // Click transient
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = "triangle";
    const baseFreq = 2200 + Math.random() * 400;
    click.frequency.setValueAtTime(baseFreq, now);
    click.frequency.exponentialRampToValueAtTime(600, now + 0.012);

    clickGain.gain.setValueAtTime(0.08, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.014);

    click.connect(clickGain);
    clickGain.connect(output);
    click.start(now);
    click.stop(now + 0.015);

    // Bottom-out thud
    const thud = ctx.createOscillator();
    const thudGain = ctx.createGain();
    thud.type = "sine";
    thud.frequency.setValueAtTime(140 + Math.random() * 30, now + 0.004);
    thud.frequency.exponentialRampToValueAtTime(60, now + 0.024);

    thudGain.gain.setValueAtTime(0.07, now + 0.004);
    thudGain.gain.exponentialRampToValueAtTime(0.001, now + 0.025);

    thud.connect(thudGain);
    thudGain.connect(output);
    thud.start(now + 0.004);
    thud.stop(now + 0.026);
  });
}

/**
 * EMP electromagnetic shockwave & cyberdeck cartridge swap sound on theme change
 */
export function playEmpDistortion(): void {
  playSound((ctx, output, now) => {
    const sweep = ctx.createOscillator();
    const gain = ctx.createGain();
    sweep.type = "sawtooth";
    sweep.frequency.setValueAtTime(1800, now);
    sweep.frequency.exponentialRampToValueAtTime(220, now + 0.22);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    sweep.connect(gain);
    gain.connect(output);
    sweep.start(now);
    sweep.stop(now + 0.26);

    // Mechanical slot latch
    const latch = ctx.createOscillator();
    const latchGain = ctx.createGain();
    latch.type = "triangle";
    latch.frequency.setValueAtTime(320, now + 0.12);
    latch.frequency.exponentialRampToValueAtTime(120, now + 0.24);

    latchGain.gain.setValueAtTime(0.12, now + 0.12);
    latchGain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

    latch.connect(latchGain);
    latchGain.connect(output);
    latch.start(now + 0.12);
    latch.stop(now + 0.26);
  });
}

/**
 * Robot vocal synthesis greeting using Web Speech Synthesis API
 */
export function speakSystemGreeting(text: string): void {
  if (!isAudioEnabled()) return;
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return;

  try {
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.volume = 0.75;
    utterance.rate = 1.02;
    utterance.pitch = 0.88; // Deep tactical cybernetic tone

    const voices = window.speechSynthesis.getVoices();
    const preferredVoice = voices.find(
      (v) =>
        v.lang.startsWith("en") &&
        (v.name.includes("Male") || v.name.includes("Natural") || v.name.includes("Robot")),
    ) || voices.find((v) => v.lang.startsWith("en"));

    if (preferredVoice) {
      utterance.voice = preferredVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch {
    // Speech synthesis error should not disrupt application
  }
}

/**
 * High-voltage plasma capacitor discharge on command copy/execution
 */
export function playCircuitSurgeAudio(): void {
  playSound((ctx, output, now) => {
    // Electric plasma zap
    const zap = ctx.createOscillator();
    const zapGain = ctx.createGain();
    zap.type = "sawtooth";
    zap.frequency.setValueAtTime(3400, now);
    zap.frequency.exponentialRampToValueAtTime(420, now + 0.12);

    zapGain.gain.setValueAtTime(0.22, now);
    zapGain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    zap.connect(zapGain);
    zapGain.connect(output);
    zap.start(now);
    zap.stop(now + 0.15);

    // Resonant sub-current hum
    const hum = ctx.createOscillator();
    const humGain = ctx.createGain();
    hum.type = "sine";
    hum.frequency.setValueAtTime(140, now);
    hum.frequency.exponentialRampToValueAtTime(60, now + 0.18);

    humGain.gain.setValueAtTime(0.18, now);
    humGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

    hum.connect(humGain);
    humGain.connect(output);
    hum.start(now);
    hum.stop(now + 0.21);
  });
}

/**
 * Biometric Level 5 Clearance approved dual-tone chime
 */
export function playBiometricAuthSound(): void {
  playSound((ctx, output, now) => {
    const tone1 = ctx.createOscillator();
    const tone2 = ctx.createOscillator();
    const gain = ctx.createGain();

    tone1.type = "sine";
    tone1.frequency.setValueAtTime(740, now); // F#5
    tone1.frequency.setValueAtTime(1108.73, now + 0.08); // C#6
    tone1.frequency.exponentialRampToValueAtTime(1480, now + 0.22); // F#6

    tone2.type = "triangle";
    tone2.frequency.setValueAtTime(370, now);
    tone2.frequency.setValueAtTime(554.37, now + 0.08);
    tone2.frequency.exponentialRampToValueAtTime(740, now + 0.22);

    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);

    tone1.connect(gain);
    tone2.connect(gain);
    gain.connect(output);

    tone1.start(now);
    tone2.start(now);
    tone1.stop(now + 0.33);
    tone2.stop(now + 0.33);
  });
}

/**
 * Tactical military target lock beep when selecting pentest nodes
 */
export function playTacticalTargetLock(): void {
  playSound((ctx, output, now) => {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.setValueAtTime(1864.66, now); // A#6
    osc.frequency.setValueAtTime(2349.32, now + 0.04); // D7

    gain.gain.setValueAtTime(0.20, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.08);

    osc.connect(gain);
    gain.connect(output);
    osc.start(now);
    osc.stop(now + 0.085);
  });
}
