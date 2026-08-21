export function isTauriRuntime(): boolean {
  return "__TAURI_INTERNALS__" in window;
}

export interface ServiceError {
  code: string;
  message: string;
}

export function normalizeServiceError(error: unknown): ServiceError {
  if (isServiceError(error)) {
    return error;
  }
  if (error instanceof Error) {
    return { code: "UNEXPECTED_ERROR", message: error.message };
  }
  return { code: "UNEXPECTED_ERROR", message: String(error) };
}

function isServiceError(value: unknown): value is ServiceError {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Record<string, unknown>;
  return typeof candidate.code === "string" && typeof candidate.message === "string";
}
