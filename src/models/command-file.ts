export type CommandSectionLayout = "standard" | "table";

export interface CommandEntry {
  id: string;
  name: string;
  command: string;
  description?: string;
  example?: string;
  notes?: string;
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
