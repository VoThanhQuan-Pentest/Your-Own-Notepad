import { playTargetLock } from "../services/audio";
import { element } from "./dom";

function isFullPerformance(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.performance === "full"
  );
}

/**
 * Tactical HUD Target Lock Reticle:
 * Snaps a 4-corner military crosshair bracket onto targetEl with audio lock
 */
export function triggerTargetReticle(targetEl: HTMLElement): void {
  if (!isFullPerformance() || !targetEl || !targetEl.isConnected) return;

  playTargetLock();

  // Create HUD reticle overlay
  const reticle = element("div", "hud-target-reticle");
  reticle.setAttribute("aria-hidden", "true");

  const cornerTL = element("span", "reticle-corner reticle-tl");
  const cornerTR = element("span", "reticle-corner reticle-tr");
  const cornerBL = element("span", "reticle-corner reticle-bl");
  const cornerBR = element("span", "reticle-corner reticle-br");
  const centerCross = element("span", "reticle-crosshair");

  reticle.append(cornerTL, cornerTR, cornerBL, cornerBR, centerCross);

  // Position relative to target
  const prevPosition = window.getComputedStyle(targetEl).position;
  if (prevPosition === "static") {
    targetEl.style.position = "relative";
  }

  targetEl.append(reticle);

  window.setTimeout(() => {
    if (reticle.isConnected) {
      reticle.remove();
    }
  }, 600);
}
