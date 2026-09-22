export async function copyText(value: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(value);
      return;
    } catch {
      // Fall back to execCommand
    }
  }
  if (typeof document === "undefined") {
    throw new Error("Clipboard access is not available in this environment.");
  }
  const textarea = document.createElement("textarea");
  textarea.value = value;
  textarea.style.position = "fixed";
  textarea.style.left = "-9999px";
  textarea.style.top = "-9999px";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  try {
    const success = document.execCommand("copy");
    if (!success) {
      throw new Error("Copy command unsuccessful");
    }
  } finally {
    textarea.remove();
  }
}
