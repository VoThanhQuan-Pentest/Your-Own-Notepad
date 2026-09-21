const GLYPHS = "0123456789ABCDEF_#%!<>~/*-+=";

interface ScrambleHandle {
  timerId: number;
}

const activeScrambles = new WeakMap<HTMLElement, ScrambleHandle>();

export function cancelScramble(element: HTMLElement): void {
  const active = activeScrambles.get(element);
  if (active) {
    window.cancelAnimationFrame(active.timerId);
    activeScrambles.delete(element);
  }
}

/**
 * High-tech decryption text scramble animation.
 * Only runs when performance mode is "full" and reduced-motion is not requested.
 */
export function scrambleText(
  target: HTMLElement,
  finalText: string,
  durationMs = 280,
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

  const startTime = performance.now();
  const length = finalText.length;

  const frame = (now: number): void => {
    const elapsed = now - startTime;
    const progress = Math.min(1, elapsed / durationMs);

    // Number of characters that have settled to their final state
    const settledCount = Math.floor(progress * length);

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

    if (progress < 1) {
      const handle = activeScrambles.get(target);
      if (handle) {
        handle.timerId = window.requestAnimationFrame(frame);
      }
    } else {
      target.textContent = finalText;
      activeScrambles.delete(target);
    }
  };

  const handle: ScrambleHandle = {
    timerId: window.requestAnimationFrame(frame),
  };
  activeScrambles.set(target, handle);
}
