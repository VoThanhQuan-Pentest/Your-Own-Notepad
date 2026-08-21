export type CommandAction = "copy" | "run" | "open" | "open-terminal";

export type CommandRisk = "safe" | "caution" | "danger";

export type CommandSectionLayout = "standard" | "table";

export interface CommandVariable {
  name: string;
  default?: string;
}

export interface CommandEntry {
  id: string;
  name: string;
  command: string;
  description?: string;
  syntax?: string;
  example?: string;
  notes?: string;
  action: CommandAction;
  risk: CommandRisk;
  variables?: CommandVariable[];
}

export interface CommandSection {
  id: string;
  title: string;
  layout?: CommandSectionLayout;
  commands: CommandEntry[];
}

export interface CommandFile {
  version: number;
  title: string;
  description?: string;
  sections: CommandSection[];
}
