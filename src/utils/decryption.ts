import { playDecryptionTick } from "../services/audio";

const GLYPHS = "0123456789ABCDEF!@#$%&*<>{}[]/\\~";

function isFullPerformance(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.performance === "full"
  );
}

/**
 * Triggers a fast 120ms matrix decryption stream on an element's text content.
 */
export function triggerDecryptionStream(target: HTMLElement): void {
  if (!isFullPerformance()) return;
  const originalText = target.textContent ?? "";
  if (!originalText || originalText.length === 0) return;

  const length = originalText.length;
  let iteration = 0;
  const maxIterations = Math.min(6, Math.max(3, Math.floor(length / 2)));
  playDecryptionTick();

  const intervalId = window.setInterval(() => {
    iteration += 1;
    const scrambled = originalText
      .split("")
      .map((char, index) => {
        if (char === " " || char === "\n") return char;
        if (index < (iteration / maxIterations) * length) {
          return originalText[index];
        }
        return GLYPHS[Math.floor(Math.random() * GLYPHS.length)];
      })
      .join("");

    target.textContent = scrambled;

    if (iteration >= maxIterations) {
      window.clearInterval(intervalId);
      target.textContent = originalText;
    }
  }, 22);
}
