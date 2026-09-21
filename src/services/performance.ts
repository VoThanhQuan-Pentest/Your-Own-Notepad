import type { PerformanceMode, StartupPerformanceMode } from "../models/settings";

export type EffectivePerformanceMode = "full" | "balanced" | "low-power";

export interface EffectivePerformanceProfile {
  mode: EffectivePerformanceMode;
  reason: string;
  selectedStartupMode?: StartupPerformanceMode | null;
  searchDebounceMs: number;
  animationsEnabled: boolean;
  fileTransitionsEnabled: boolean;
  workerBatchSize: number;
  workerYieldMs: number;
  virtualRowOverscan: number;
  preloadFiles: boolean;
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
type FallbackListener = (message: string) => void;

export class PerformanceController {
  private selectedMode: PerformanceMode = "auto";
  private selectedStartupMode: StartupPerformanceMode | null = null;
  private uiScale = 100;
  private effective: EffectivePerformanceMode = "balanced";
  private reason = "Auto is calibrating";
  private readonly listeners = new Set<ProfileListener>();
  private readonly fallbackListeners = new Set<FallbackListener>();
  private readonly diagnostics: PerformanceDiagnostic[] = [];
  private readonly interactionDurations: number[] = [];
  private calibrationGeneration = 0;
  private systemPowerSaver = false;
  private stableInteractionCount = 0;

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

  applyStartupMode(mode: StartupPerformanceMode): void {
    this.selectedStartupMode = mode;
    this.stableInteractionCount = 0;
    if (mode === "battery-saver") {
      this.selectedMode = "low-power";
      this.setEffective("low-power", "Battery Saver mode selected");
      this.calibrationGeneration += 1;
      return;
    }
    this.selectedMode = "full";
    this.setEffective("full", "Performance mode selected");
    this.calibrationGeneration += 1;
  }

  configure(mode: PerformanceMode, uiScale: number): void {
    this.selectedMode = mode;
    this.uiScale = uiScale;
    if (mode === "low-power") {
      this.selectedStartupMode = "battery-saver";
    } else if (mode === "full") {
      this.selectedStartupMode = "performance";
    } else if (mode === "balanced") {
      this.selectedStartupMode = null;
    }
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
    if (this.selectedStartupMode === "battery-saver" && this.selectedMode !== "auto") return;
    if (this.selectedMode === "auto") {
      const initial = this.chooseInitialMode();
      this.setEffective(initial.mode, initial.reason);
      if (initial.mode !== "low-power") this.calibrate();
    }
  }

  profile(): EffectivePerformanceProfile {
    const mode = this.effective;
    const reducedMotion = this.isReducedMotionRequested();
    if (mode === "full") {
      return {
        mode,
        reason: this.reason,
        selectedStartupMode: this.selectedStartupMode,
        searchDebounceMs: 90,
        animationsEnabled: !reducedMotion,
        fileTransitionsEnabled: !reducedMotion,
        workerBatchSize: 400,
        workerYieldMs: 10,
        virtualRowOverscan: 12,
        preloadFiles: true,
        parseConcurrency: 4,
        virtualThreshold: 32,
        overscan: 12,
        fileMotion: reducedMotion ? "none" : "full",
        sectionMotionScale: reducedMotion ? 0 : 1,
      };
    }
    if (mode === "balanced") {
      return {
        mode,
        reason: this.reason,
        selectedStartupMode: this.selectedStartupMode,
        searchDebounceMs: 140,
        animationsEnabled: !reducedMotion,
        fileTransitionsEnabled: !reducedMotion,
        workerBatchSize: 200,
        workerYieldMs: 8,
        virtualRowOverscan: 8,
        preloadFiles: false,
        parseConcurrency: 2,
        virtualThreshold: 16,
        overscan: 4,
        fileMotion: reducedMotion ? "none" : "fade",
        sectionMotionScale: reducedMotion ? 0 : 0.67,
      };
    }
    return {
      mode,
      reason: this.reason,
      selectedStartupMode: this.selectedStartupMode,
      searchDebounceMs: 220,
      animationsEnabled: false,
      fileTransitionsEnabled: false,
      workerBatchSize: 75,
      workerYieldMs: 5,
      virtualRowOverscan: 4,
      preloadFiles: false,
      parseConcurrency: 1,
      virtualThreshold: 8,
      overscan: 2,
      fileMotion: "none",
      sectionMotionScale: 0,
    };
  }

  subscribe(listener: ProfileListener): () => void {
    this.listeners.add(listener);
    listener(this.profile());
    return () => this.listeners.delete(listener);
  }

  onFallbackNotification(listener: FallbackListener): () => void {
    this.fallbackListeners.add(listener);
    return () => this.fallbackListeners.delete(listener);
  }

  record(name: string, durationMs: number, detail?: string): void {
    this.diagnostics.push({ name, durationMs, timestamp: Date.now(), detail });
    if (this.diagnostics.length > 50) this.diagnostics.shift();
    if (name === "input-to-paint") {
      this.interactionDurations.push(durationMs);
      if (this.interactionDurations.length > 10) this.interactionDurations.shift();
      this.considerDowngrade(durationMs);
      this.considerRecovery(durationMs);
    } else if (durationMs > 250) {
      this.considerDowngrade(durationMs);
    } else {
      this.considerRecovery(durationMs);
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
      selectedStartupMode: this.selectedStartupMode,
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
    this.stableInteractionCount = 0;
  }

  private isReducedMotionRequested(): boolean {
    return typeof window !== "undefined" &&
      Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);
  }

  private chooseInitialMode(): { mode: EffectivePerformanceMode; reason: string } {
    if (this.selectedStartupMode === "battery-saver" || this.selectedMode === "low-power") {
      return { mode: "low-power", reason: "Battery Saver mode selected" };
    }
    if (this.selectedStartupMode === "performance" || this.selectedMode === "full") {
      return { mode: "full", reason: "Performance mode selected" };
    }
    if (this.selectedMode !== "auto") {
      return { mode: this.selectedMode, reason: `Selected ${this.selectedMode}` };
    }
    if (this.systemPowerSaver) return { mode: "low-power", reason: "Linux power profile is power-saver" };
    const cores = (typeof navigator !== "undefined" && navigator.hardwareConcurrency) || 4;
    if (this.uiScale >= 175) return { mode: "low-power", reason: `UI scale is ${this.uiScale}%` };
    if (this.uiScale >= 150) return { mode: "balanced", reason: `UI scale is ${this.uiScale}%` };
    if (cores <= 4) return { mode: "low-power", reason: `${cores} logical CPU cores` };
    if (cores <= 8) return { mode: "balanced", reason: `${cores} logical CPU cores` };
    return { mode: "balanced", reason: "Auto is calibrating frame timing" };
  }

  private calibrate(): void {
    if (typeof window === "undefined" || typeof document === "undefined") return;
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
    if (this.selectedStartupMode === "battery-saver") return; // Battery saver never changes
    if (this.effective === "low-power") return;

    if (this.selectedStartupMode === "performance") {
      if (this.effective === "full") {
        const slowInteractions = this.interactionDurations.filter((d) => d > 80).length;
        if (latest > 250 || slowInteractions >= 3) {
          this.stableInteractionCount = 0;
          this.setEffective(
            "balanced",
            latest > 250
              ? `Performance fallback: slow task ${latest.toFixed(0)} ms`
              : `Performance fallback: ${slowInteractions}/10 slow interactions`,
          );
          this.fallbackListeners.forEach((listener) =>
            listener("Performance temporarily reduced to keep Command Vault responsive."),
          );
        }
      }
      return;
    }

    if (this.selectedMode !== "auto") return;
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

  private considerRecovery(latest: number): void {
    if (this.selectedStartupMode !== "performance" || this.effective !== "balanced") return;
    if (latest <= 80) {
      this.stableInteractionCount += 1;
      if (this.stableInteractionCount >= 15) {
        this.stableInteractionCount = 0;
        this.setEffective("full", "Performance mode restored after responsiveness stabilized");
      }
    } else {
      this.stableInteractionCount = 0;
    }
  }

  private setEffective(mode: EffectivePerformanceMode, reason: string): void {
    const changed = mode !== this.effective || reason !== this.reason;
    this.effective = mode;
    this.reason = reason;
    if (typeof document !== "undefined" && document.documentElement) {
      document.documentElement.dataset.performance = mode;
    }
    if (changed) this.listeners.forEach((listener) => listener(this.profile()));
  }
}
