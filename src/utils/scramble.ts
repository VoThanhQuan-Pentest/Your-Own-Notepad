import { playDecryptionTick } from "../services/audio";

const GLYPHS = "0123456789ABCDEF_#%!<>~/*-+=";

interface ScrambleHandle {
  timerId: number;
  finalText: string;
}

const activeScrambles = new WeakMap<HTMLElement, ScrambleHandle>();

export function cancelScramble(element: HTMLElement): void {
  const active = activeScrambles.get(element);
  if (active) {
    window.cancelAnimationFrame(active.timerId);
    activeScrambles.delete(element);
    element.textContent = active.finalText;
  }
}

/**
 * High-tech decryption text scramble animation with audio clicks.
 * Only runs when performance mode is "full" and reduced-motion is not requested.
 * Guaranteed to settle 100% of characters to finalText.
 */
export function scrambleText(
  target: HTMLElement,
  finalText: string,
  durationMs = 240,
): void {
  cancelScramble(target);

  const isFullMode =
    typeof document !== "undefined" &&
    document.documentElement.dataset.performance === "full";

  const prefersReducedMotion =
    typeof window !== "undefined" &&
    Boolean(window.matchMedia?.("(prefers-reduced-motion: reduce)").matches);

  if (!isFullMode || prefersReducedMotion || !finalText) {
    target.textContent = finalText;
    return;
  }

  playDecryptionTick();
  const startTime = performance.now();
  const length = finalText.length;
  let lastTickProgress = 0;

  const frame = (now: number): void => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / durationMs);

    // Number of characters that have settled to their final state
    const settledCount = Math.floor(progress * length);

    // Occasional decryption tick audio as characters unlock
    if (progress - lastTickProgress >= 0.35 && progress < 0.95) {
      lastTickProgress = progress;
      playDecryptionTick();
    }

    if (progress >= 1) {
      target.textContent = finalText;
      activeScrambles.delete(target);
      return;
    }

    let output = "";
    for (let i = 0; i < length; i++) {
      const char = finalText[i];
      if (char === " " || char === "\n") {
        output += char;
      } else if (i < settledCount) {
        output += char;
      } else {
        const randomIndex = Math.floor(Math.random() * GLYPHS.length);
        output += GLYPHS[randomIndex];
      }
    }

    target.textContent = output;

    const handle = activeScrambles.get(target);
    if (handle) {
      handle.timerId = window.requestAnimationFrame(frame);
    }
  };

  const handle: ScrambleHandle = {
    timerId: window.requestAnimationFrame(frame),
    finalText,
  };
  activeScrambles.set(target, handle);
}
