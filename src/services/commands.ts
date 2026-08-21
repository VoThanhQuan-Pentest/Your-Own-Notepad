import { invoke } from "@tauri-apps/api/core";

export interface ExecutionResult {
  pid: number;
  program: string;
  args: string[];
}

export interface LaunchResult {
  program: string;
}

export function executeProgram(command: string): Promise<ExecutionResult> {
  return invoke("execute_program", { command });
}

export function openTerminal(command: string): Promise<LaunchResult> {
  return invoke("open_terminal", { command });
}

export function openExternal(target: string): Promise<LaunchResult> {
  return invoke("open_external", { target });
}
