import type { PerformanceMode } from "../models/settings";

export type EffectivePerformanceMode = "full" | "balanced" | "low-power";

export interface EffectivePerformanceProfile {
  mode: EffectivePerformanceMode;
  reason: string;
  parseConcurrency: number;
  virtualThreshold: number;
  overscan: number;
  fileMotion: "full" | "fade" | "none";
  sectionMotionScale: number;
}

export interface PerformanceDiagnostic {
  name: string;
  durationMs: number;
  timestamp: number;
  detail?: string;
}

type ProfileListener = (profile: EffectivePerformanceProfile) => void;

export class PerformanceController {
  private selectedMode: PerformanceMode = "auto";
  private uiScale = 100;
  private effective: EffectivePerformanceMode = "balanced";
  private reason = "Auto is calibrating";
  private readonly listeners = new Set<ProfileListener>();
  private readonly diagnostics: PerformanceDiagnostic[] = [];
  private readonly interactionDurations: number[] = [];
  private calibrationGeneration = 0;
  private systemPowerSaver = false;

  constructor() {
    const supported = typeof PerformanceObserver === "undefined"
      ? []
      : PerformanceObserver.supportedEntryTypes ?? [];
    if (!supported.includes("longtask")) return;
    const observer = new PerformanceObserver((list) => {
      list.getEntries().forEach((entry) => this.record("main-thread-long-task", entry.duration));
    });
    observer.observe({ entryTypes: ["longtask"] });
  }

  configure(mode: PerformanceMode, uiScale: number): void {
    this.selectedMode = mode;
    this.uiScale = uiScale;
    const initial = this.chooseInitialMode();
    this.setEffective(initial.mode, initial.reason);
    if (mode === "auto" && initial.mode !== "low-power") {
      this.calibrate();
    } else {
      this.calibrationGeneration += 1;
    }
  }

  setSystemPowerProfile(profile: string | null): void {
    const nextPowerSaver = profile === "power-saver";
    if (nextPowerSaver === this.systemPowerSaver) return;
    this.systemPowerSaver = nextPowerSaver;
    if (this.selectedMode === "auto") {
      const initial = this.chooseInitialMode();
      this.setEffective(initial.mode, initial.reason);
      if (initial.mode !== "low-power") this.calibrate();
    }
  }

  profile(): EffectivePerformanceProfile {
    const mode = this.effective;
    if (mode === "full") {
      return { mode, reason: this.reason, parseConcurrency: 4, virtualThreshold: 32, overscan: 8, fileMotion: "full", sectionMotionScale: 1 };
    }
    if (mode === "balanced") {
      return { mode, reason: this.reason, parseConcurrency: 2, virtualThreshold: 16, overscan: 4, fileMotion: "fade", sectionMotionScale: 0.67 };
    }
    return { mode, reason: this.reason, parseConcurrency: 1, virtualThreshold: 8, overscan: 2, fileMotion: "none", sectionMotionScale: 0 };
  }

  subscribe(listener: ProfileListener): () => void {
    this.listeners.add(listener);
    listener(this.profile());
    return () => this.listeners.delete(listener);
  }

  record(name: string, durationMs: number, detail?: string): void {
    this.diagnostics.push({ name, durationMs, timestamp: Date.now(), detail });
    if (this.diagnostics.length > 50) this.diagnostics.shift();
    if (name === "input-to-paint") {
      this.interactionDurations.push(durationMs);
      if (this.interactionDurations.length > 10) this.interactionDurations.shift();
      this.considerDowngrade(durationMs);
    } else if (durationMs > 250) {
      this.considerDowngrade(durationMs);
    }
  }

  begin(name: string, detail?: string): () => number {
    const started = performance.now();
    return () => {
      const duration = performance.now() - started;
      this.record(name, duration, detail);
      return duration;
    };
  }

  diagnosticsText(): string {
    const profile = this.profile();
    return JSON.stringify({
      selectedMode: this.selectedMode,
      effectiveMode: profile.mode,
      reason: profile.reason,
      uiScale: this.uiScale,
      hardwareConcurrency: navigator.hardwareConcurrency || null,
      recent: this.diagnostics,
    }, null, 2);
  }

  clearDiagnostics(): void {
    this.diagnostics.length = 0;
    this.interactionDurations.length = 0;
  }

  private chooseInitialMode(): { mode: EffectivePerformanceMode; reason: string } {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return { mode: "low-power", reason: "Operating system requests Reduced Motion" };
    }
    if (this.selectedMode !== "auto") {
      return { mode: this.selectedMode, reason: `Selected ${this.selectedMode}` };
    }
    if (this.systemPowerSaver) return { mode: "low-power", reason: "Linux power profile is power-saver" };
    const cores = navigator.hardwareConcurrency || 4;
    if (this.uiScale >= 175) return { mode: "low-power", reason: `UI scale is ${this.uiScale}%` };
    if (this.uiScale >= 150) return { mode: "balanced", reason: `UI scale is ${this.uiScale}%` };
    if (cores <= 4) return { mode: "low-power", reason: `${cores} logical CPU cores` };
    if (cores <= 8) return { mode: "balanced", reason: `${cores} logical CPU cores` };
    return { mode: "balanced", reason: "Auto is calibrating frame timing" };
  }

  private calibrate(): void {
    const generation = ++this.calibrationGeneration;
    const samples: number[] = [];
    let previous = performance.now();
    const sample = (now: number): void => {
      if (generation !== this.calibrationGeneration || document.visibilityState !== "visible") return;
      samples.push(now - previous);
      previous = now;
      if (samples.length < 20) {
        window.requestAnimationFrame(sample);
        return;
      }
      samples.sort((left, right) => left - right);
      const p95 = samples[Math.min(samples.length - 1, Math.floor(samples.length * 0.95))] ?? 50;
      if (p95 > 45) this.setEffective("low-power", `Frame p95 is ${p95.toFixed(1)} ms`);
      else if (p95 <= 24 && (navigator.hardwareConcurrency || 4) > 8 && this.uiScale < 150) {
        this.setEffective("full", `Frame p95 is ${p95.toFixed(1)} ms`);
      } else this.setEffective("balanced", `Frame p95 is ${p95.toFixed(1)} ms`);
    };
    window.requestAnimationFrame(sample);
  }

  private considerDowngrade(latest: number): void {
    if (this.selectedMode !== "auto" || this.effective === "low-power") return;
    const slowInteractions = this.interactionDurations.filter((duration) => duration > 80).length;
    if (latest <= 250 && slowInteractions < 3) return;
    const next = this.effective === "full" ? "balanced" : "low-power";
    this.calibrationGeneration += 1;
    this.interactionDurations.length = 0;
    this.setEffective(
      next,
      latest > 250 ? `Slow task ${latest.toFixed(0)} ms` : `${slowInteractions}/10 slow interactions`,
    );
  }

  private setEffective(mode: EffectivePerformanceMode, reason: string): void {
    const changed = mode !== this.effective || reason !== this.reason;
    this.effective = mode;
    this.reason = reason;
    document.documentElement.dataset.performance = mode;
    if (changed) this.listeners.forEach((listener) => listener(this.profile()));
  }
}
