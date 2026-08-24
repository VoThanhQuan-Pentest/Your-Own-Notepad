export function contrastRatio(first: string, second: string): number {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  return (
    (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05)
  );
}

export function mixHex(first: string, second: string, firstWeight: number): string {
  const weight = Math.max(0, Math.min(1, firstWeight));
  const channels = [1, 3, 5].map((index) => {
    const firstValue = Number.parseInt(first.slice(index, index + 2), 16);
    const secondValue = Number.parseInt(second.slice(index, index + 2), 16);
    return Math.round(firstValue * weight + secondValue * (1 - weight));
  });
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
}

function relativeLuminance(value: string): number {
  const channels = [1, 3, 5].map((index) => Number.parseInt(value.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) =>
    channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4,
  );
  return (linear[0] ?? 0) * 0.2126 + (linear[1] ?? 0) * 0.7152 + (linear[2] ?? 0) * 0.0722;
}
