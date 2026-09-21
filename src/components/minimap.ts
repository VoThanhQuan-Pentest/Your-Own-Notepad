import type { CommandFile } from "../models/command-file";
import { element } from "../utils/dom";
import { playTacticalBlip } from "../services/audio";

export interface MinimapHandle {
  element: HTMLElement;
  update(file: CommandFile, expandedSections: ReadonlySet<string>): void;
  syncScroll(): void;
  dispose(): void;
}

/**
 * Tactical Minimap Scanner HUD
 * Displays a real-time cybernetic birds-eye overview of command sections with viewport reticle.
 */
export function createTacticalMinimap(
  scrollRoot: HTMLElement,
  onNavigateSection: (sectionId: string) => void,
): MinimapHandle {
  const container = element("aside", "tactical-minimap");
  container.setAttribute("aria-hidden", "true");

  const header = element("div", "minimap-header", "HUD");
  const track = element("div", "minimap-track");
  const viewportIndicator = element("div", "minimap-viewport-slider");
  track.append(viewportIndicator);
  container.append(header, track);

  let scrollRafId: number | null = null;

  function syncScroll(): void {
    if (scrollRafId !== null) return;
    scrollRafId = window.requestAnimationFrame(() => {
      scrollRafId = null;
      if (!scrollRoot.isConnected) return;
      const scrollHeight = scrollRoot.scrollHeight;
      const clientHeight = scrollRoot.clientHeight;
      if (scrollHeight <= clientHeight || clientHeight === 0) {
        viewportIndicator.style.display = "none";
        return;
      }
      viewportIndicator.style.display = "block";
      const trackHeight = track.clientHeight;
      if (trackHeight === 0) return;

      const visibleRatio = clientHeight / scrollHeight;
      const indicatorHeight = Math.max(16, visibleRatio * trackHeight);
      const scrollRatio = scrollRoot.scrollTop / (scrollHeight - clientHeight);
      const indicatorTop = scrollRatio * (trackHeight - indicatorHeight);

      viewportIndicator.style.height = `${indicatorHeight}px`;
      viewportIndicator.style.transform = `translateY(${indicatorTop}px)`;
    });
  }

  function update(file: CommandFile, _expandedSections: ReadonlySet<string>): void {
    // Clear section blocks but preserve viewportIndicator
    track.querySelectorAll(".minimap-section-block").forEach((el) => el.remove());

    if (file.sections.length <= 1) {
      container.hidden = true;
      return;
    }
    container.hidden = false;

    file.sections.forEach((section) => {
      const block = element("div", "minimap-section-block");
      const cmdCount = section.commands.length;
      block.title = `${section.title} (${cmdCount} command${cmdCount === 1 ? "" : "s"})`;

      // Visual micro density dots
      const dotCount = Math.min(5, Math.max(1, Math.ceil(cmdCount / 2)));
      for (let i = 0; i < dotCount; i++) {
        const dot = element("span", "minimap-dot");
        block.append(dot);
      }

      block.addEventListener("click", (e) => {
        e.stopPropagation();
        playTacticalBlip();
        onNavigateSection(section.id);
      });

      track.append(block);
    });

    syncScroll();
  }

  const onScroll = () => syncScroll();
  scrollRoot.addEventListener("scroll", onScroll, { passive: true });

  const onResize = () => syncScroll();
  window.addEventListener("resize", onResize, { passive: true });

  return {
    element: container,
    update,
    syncScroll,
    dispose() {
      if (scrollRafId !== null) {
        window.cancelAnimationFrame(scrollRafId);
        scrollRafId = null;
      }
      scrollRoot.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onResize);
      container.remove();
    },
  };
}
