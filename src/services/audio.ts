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
