export async function copyText(value: string): Promise<void> {
  if (!navigator.clipboard) {
    throw new Error("Clipboard access is not available in this environment.");
  }
  await navigator.clipboard.writeText(value);
}
