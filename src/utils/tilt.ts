let activeRow: HTMLElement | null = null;
let rafId: number | null = null;

function isFullPerformance(): boolean {
  return (
    typeof document !== "undefined" &&
    document.documentElement.dataset.performance === "full"
  );
}

/**
 * Attaches a single delegated 3D parallax tilt listener to the container.
 * Only processes events when in Full Performance mode.
 */
export function initDelegatedTilt(container: HTMLElement): () => void {
  let pendingEvent: PointerEvent | null = null;

  const onPointerMove = (e: PointerEvent) => {
    if (!isFullPerformance()) {
      if (activeRow) {
        resetRow(activeRow);
        activeRow = null;
      }
      return;
    }

    const target = (e.target as HTMLElement | null)?.closest<HTMLElement>(".command-row");
    if (!target) {
      if (activeRow) {
        resetRow(activeRow);
        activeRow = null;
      }
      return;
    }

    if (activeRow && activeRow !== target) {
      resetRow(activeRow);
    }
    activeRow = target;
    pendingEvent = e;

    if (rafId === null) {
      rafId = window.requestAnimationFrame(updateTilt);
    }
  };

  const updateTilt = () => {
    rafId = null;
    if (!activeRow || !pendingEvent) return;

    const rect = activeRow.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const x = pendingEvent.clientX - rect.left;
    const y = pendingEvent.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const dx = Math.max(-1, Math.min(1, (x - centerX) / centerX));
    const dy = Math.max(-1, Math.min(1, (y - centerY) / centerY));

    const rotX = (-dy * 3.5).toFixed(2);
    const rotY = (dx * 4.5).toFixed(2);
    const glareX = ((x / rect.width) * 100).toFixed(1);
    const glareY = ((y / rect.height) * 100).toFixed(1);

    activeRow.style.setProperty("--tilt-rot-x", `${rotX}deg`);
    activeRow.style.setProperty("--tilt-rot-y", `${rotY}deg`);
    activeRow.style.setProperty("--glare-x", `${glareX}%`);
    activeRow.style.setProperty("--glare-y", `${glareY}%`);
  };

  const onPointerLeave = () => {
    if (activeRow) {
      resetRow(activeRow);
      activeRow = null;
    }
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };

  container.addEventListener("pointermove", onPointerMove, { passive: true });
  container.addEventListener("pointerleave", onPointerLeave, { passive: true });

  return () => {
    container.removeEventListener("pointermove", onPointerMove);
    container.removeEventListener("pointerleave", onPointerLeave);
    if (activeRow) {
      resetRow(activeRow);
      activeRow = null;
    }
    if (rafId !== null) {
      window.cancelAnimationFrame(rafId);
      rafId = null;
    }
  };
}

function resetRow(row: HTMLElement): void {
  row.style.removeProperty("--tilt-rot-x");
  row.style.removeProperty("--tilt-rot-y");
  row.style.removeProperty("--glare-x");
  row.style.removeProperty("--glare-y");
}
