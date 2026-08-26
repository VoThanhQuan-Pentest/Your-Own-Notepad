export interface VirtualRowsHandle {
  element: HTMLElement;
  destroy(): void;
  ensureVisible(index: number): void;
  refresh(): void;
  reconnect(): void;
}

interface VirtualRowsOptions {
  count: number;
  defaultRowHeight: number;
  renderRow(index: number): HTMLElement;
  getScrollRoot(): HTMLElement | null;
  overscan?: number;
}

export function createVirtualRows(options: VirtualRowsOptions): VirtualRowsHandle {
  const element = document.createElement("div");
  element.className = "virtual-rows";
  const topSpacer = document.createElement("div");
  const rows = document.createElement("div");
  const bottomSpacer = document.createElement("div");
  element.append(topSpacer, rows, bottomSpacer);

  const overscan = options.overscan ?? 8;
  const heights = Array.from({ length: options.count }, () => options.defaultRowHeight);
  let offsets = buildOffsets(heights);
  let rangeStart = -1;
  let rangeEnd = -1;
  let animationFrame: number | null = null;
  let disposed = false;
  let active = false;
  let forcedIndex: number | null = null;
  let scrollRoot: HTMLElement | null = null;
  let visibilityObserver: IntersectionObserver | null = null;
  const observer = new ResizeObserver((entries) => {
    let changed = false;
    entries.forEach((entry) => {
      const index = Number((entry.target as HTMLElement).dataset.virtualIndex);
      const height = Math.ceil(entry.contentRect.height);
      if (!Number.isInteger(index) || index < 0 || index >= heights.length || height <= 0) {
        return;
      }
      if (Math.abs((heights[index] ?? 0) - height) > 1) {
        heights[index] = height;
        changed = true;
      }
    });
    if (changed) {
      offsets = buildOffsets(heights);
      schedule();
    }
  });

  const onScroll = () => schedule();

  queueMicrotask(() => {
    if (disposed) {
      return;
    }
    scrollRoot = options.getScrollRoot();
    renderRange(0, 0);
    if (!scrollRoot) {
      return;
    }
    visibilityObserver = new IntersectionObserver(
      (entries) => {
        const nextActive = entries.some((entry) => entry.isIntersecting);
        if (nextActive === active || disposed) {
          return;
        }
        active = nextActive;
        if (active) {
          scrollRoot?.addEventListener("scroll", onScroll, { passive: true });
          refresh();
        } else {
          scrollRoot?.removeEventListener("scroll", onScroll);
          renderRange(0, 0);
        }
      },
      { root: scrollRoot, rootMargin: "800px 0px" },
    );
    visibilityObserver.observe(element);
  });

  function schedule(): void {
    if (disposed || animationFrame !== null) {
      return;
    }
    animationFrame = window.requestAnimationFrame(() => {
      animationFrame = null;
      refresh();
    });
  }

  function refresh(): void {
    if (disposed || !active || options.count === 0) {
      return;
    }
    const root = scrollRoot ?? options.getScrollRoot();
    if (!root) {
      return;
    }
    scrollRoot = root;
    if (forcedIndex !== null) {
      const start = Math.max(0, forcedIndex - overscan);
      const end = Math.min(options.count, forcedIndex + overscan + 1);
      renderRange(start, end);
      forcedIndex = null;
      return;
    }
    const rootRect = root.getBoundingClientRect();
    const listRect = element.getBoundingClientRect();
    const total = offsets[offsets.length - 1] ?? 0;
    if (listRect.top >= rootRect.bottom) {
      renderRange(0, 0);
      return;
    }
    if (listRect.bottom <= rootRect.top) {
      renderRange(options.count, options.count);
      return;
    }
    const top = clamp(rootRect.top - listRect.top, 0, total);
    const bottom = clamp(rootRect.bottom - listRect.top, 0, total);
    const start = Math.max(0, findIndex(offsets, top) - overscan);
    const end = Math.min(options.count, findIndex(offsets, bottom) + overscan + 1);
    renderRange(start, end);
  }

  function renderRange(start: number, end: number): void {
    if (disposed || (rangeStart === start && rangeEnd === end)) {
      return;
    }
    rangeStart = start;
    rangeEnd = end;
    observer.disconnect();
    const fragment = document.createDocumentFragment();
    for (let index = start; index < end; index += 1) {
      const row = options.renderRow(index);
      row.dataset.virtualIndex = String(index);
      fragment.append(row);
      observer.observe(row);
    }
    rows.replaceChildren(fragment);
    topSpacer.style.height = `${offsets[start] ?? 0}px`;
    bottomSpacer.style.height = `${Math.max(0, (offsets[offsets.length - 1] ?? 0) - (offsets[end] ?? 0))}px`;
  }

  return {
    element,
    destroy() {
      disposed = true;
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
      }
      scrollRoot?.removeEventListener("scroll", onScroll);
      visibilityObserver?.disconnect();
      observer.disconnect();
      element.replaceChildren();
    },
    ensureVisible(index) {
      if (disposed || index < 0 || index >= options.count) {
        return;
      }
      const root = scrollRoot ?? options.getScrollRoot();
      if (!root) {
        return;
      }
      active = true;
      root.addEventListener("scroll", onScroll, { passive: true });
      const target = offsets[index] ?? 0;
      forcedIndex = index;
      const start = Math.max(0, index - overscan);
      const end = Math.min(options.count, index + overscan + 1);
      renderRange(start, end);
      window.requestAnimationFrame(() => {
        if (disposed) {
          return;
        }
        const relativeTop = element.getBoundingClientRect().top - root.getBoundingClientRect().top;
        root.scrollTop = Math.max(0, root.scrollTop + target + relativeTop - root.clientHeight / 2);
        schedule();
      });
    },
    refresh,
    reconnect() {
      if (disposed) {
        return;
      }
      if (animationFrame !== null) {
        window.cancelAnimationFrame(animationFrame);
        animationFrame = null;
      }
      scrollRoot?.removeEventListener("scroll", onScroll);
      scrollRoot = options.getScrollRoot();
      if (!scrollRoot) {
        return;
      }
      active = true;
      scrollRoot.addEventListener("scroll", onScroll, { passive: true });
      visibilityObserver?.disconnect();
      visibilityObserver?.observe(element);
      rangeStart = -1;
      rangeEnd = -1;
      refresh();
      window.requestAnimationFrame(() => {
        if (!disposed) {
          rangeStart = -1;
          rangeEnd = -1;
          refresh();
        }
      });
    },
  };
}

function buildOffsets(heights: number[]): number[] {
  const offsets = [0];
  heights.forEach((height) => offsets.push((offsets[offsets.length - 1] ?? 0) + height));
  return offsets;
}

function findIndex(offsets: number[], offset: number): number {
  let low = 0;
  let high = Math.max(0, offsets.length - 2);
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    const start = offsets[middle] ?? 0;
    const end = offsets[middle + 1] ?? start;
    if (offset < start) {
      high = middle - 1;
    } else if (offset >= end) {
      low = middle + 1;
    } else {
      return middle;
    }
  }
  return Math.max(0, Math.min(offsets.length - 2, low));
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}
