export type IconName = "heart" | "star" | "chevron" | "folder" | "folder-open" | "command-file";

const paths: Record<IconName, string[]> = {
  heart: ["M12 20.6 10.55 19.28C5.4 14.6 2 11.52 2 7.74 2 4.66 4.42 2.25 7.5 2.25c1.74 0 3.41.81 4.5 2.08a6.03 6.03 0 0 1 4.5-2.08c3.08 0 5.5 2.41 5.5 5.49 0 3.78-3.4 6.86-8.55 11.55L12 20.6Z"],
  star: ["m12 2.75 2.8 5.67 6.25.91-4.52 4.4 1.07 6.22L12 17.84l-5.6 2.95 1.07-6.22-4.52-4.4 6.25-.91L12 2.75Z"],
  chevron: ["m9 5 7 7-7 7"],
  folder: ["M3 6.75c0-1.1.9-2 2-2h5l2 2h7c1.1 0 2 .9 2 2v8.5c0 1.1-.9 2-2 2H5c-1.1 0-2-.9-2-2V6.75Z"],
  "folder-open": ["M3.5 8.25v-1.5c0-1.1.9-2 2-2h4.75l2 2h6.25c1.1 0 2 .9 2 2v.75", "M4.2 9.5h17.1l-2.2 8.25a2 2 0 0 1-1.93 1.48H5.83a2 2 0 0 1-1.93-1.48L2.75 13.4A3.05 3.05 0 0 1 4.2 9.5Z"],
  "command-file": ["M6 2.75h8l4 4v14.5H6V2.75Z", "M14 2.75v4h4", "m9 11-2 2 2 2", "m13 11 2 2-2 2"],
};

export function createIcon(name: IconName, className?: string): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("ui-icon", `icon-${name}`);
  if (className) {
    svg.classList.add(...className.split(/\s+/).filter(Boolean));
  }
  paths[name].forEach((data) => {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", data);
    svg.append(path);
  });
  return svg;
}
