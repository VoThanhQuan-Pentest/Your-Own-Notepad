export interface AppSettings {
  lastWorkspace: string | null;
  lastOpenedFile: string | null;
  uiFontSize: number;
  codeFontSize: number;
  uiScale: number;
  rememberExpandedSections: boolean;
  expandedSections: string[];
  sectionStateFiles: string[];
  windowWidth: number | null;
  windowHeight: number | null;
}

export const defaultSettings: AppSettings = {
  lastWorkspace: null,
  lastOpenedFile: null,
  uiFontSize: 14,
  codeFontSize: 13,
  uiScale: 100,
  rememberExpandedSections: true,
  expandedSections: [],
  sectionStateFiles: [],
  windowWidth: null,
  windowHeight: null,
};
