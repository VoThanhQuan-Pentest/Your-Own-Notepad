use serde::{Deserialize, Serialize};

fn default_ui_font_size() -> u8 {
    14
}

fn default_code_font_size() -> u8 {
    13
}

fn default_ui_scale() -> u16 {
    100
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum ThemeMode {
    #[default]
    Dark,
    Light,
}

#[derive(Debug, Clone, Copy, Default, Deserialize, PartialEq, Serialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AccentTheme {
    #[default]
    Cyan,
    Blue,
    Purple,
    Green,
    Orange,
    Pink,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct CustomThemeColors {
    pub(crate) enabled: bool,
    pub(crate) background: String,
    pub(crate) text: String,
    pub(crate) accent: String,
}

impl Default for CustomThemeColors {
    fn default() -> Self {
        Self {
            enabled: false,
            background: "#0d1117".to_string(),
            text: "#d8dee9".to_string(),
            accent: "#00c8e8".to_string(),
        }
    }
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct CustomThemes {
    pub(crate) dark: CustomThemeColors,
    pub(crate) light: CustomThemeColors,
}

impl Default for CustomThemes {
    fn default() -> Self {
        Self {
            dark: CustomThemeColors::default(),
            light: CustomThemeColors {
                background: "#f5f7fa".to_string(),
                text: "#1f2937".to_string(),
                accent: "#087f9a".to_string(),
                ..CustomThemeColors::default()
            },
        }
    }
}

#[derive(Debug, Clone, Deserialize, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub(crate) enum FavoriteItem {
    Folder {
        path: String,
    },
    File {
        path: String,
    },
    Command {
        file_path: String,
        command_id: String,
    },
}

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(default, rename_all = "camelCase")]
pub(crate) struct AppSettings {
    pub(crate) last_workspace: Option<String>,
    pub(crate) last_opened_file: Option<String>,
    #[serde(default = "default_ui_font_size")]
    pub(crate) ui_font_size: u8,
    #[serde(default = "default_code_font_size")]
    pub(crate) code_font_size: u8,
    #[serde(default = "default_ui_scale")]
    pub(crate) ui_scale: u16,
    pub(crate) theme_mode: ThemeMode,
    pub(crate) accent_theme: AccentTheme,
    pub(crate) custom_themes: CustomThemes,
    pub(crate) favorites: Vec<FavoriteItem>,
    pub(crate) recent_files: Vec<String>,
    #[serde(default = "default_true")]
    pub(crate) remember_expanded_sections: bool,
    pub(crate) expanded_sections: Vec<String>,
    pub(crate) section_state_files: Vec<String>,
    pub(crate) window_width: Option<u32>,
    pub(crate) window_height: Option<u32>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            last_workspace: None,
            last_opened_file: None,
            ui_font_size: default_ui_font_size(),
            code_font_size: default_code_font_size(),
            ui_scale: default_ui_scale(),
            theme_mode: ThemeMode::default(),
            accent_theme: AccentTheme::default(),
            custom_themes: CustomThemes::default(),
            favorites: Vec::new(),
            recent_files: Vec::new(),
            remember_expanded_sections: true,
            expanded_sections: Vec::new(),
            section_state_files: Vec::new(),
            window_width: None,
            window_height: None,
        }
    }
}

impl AppSettings {
    pub(crate) fn validate(&self) -> Result<(), &'static str> {
        if !(11..=20).contains(&self.ui_font_size) {
            return Err("UI font size must be between 11 and 20 pixels.");
        }
        if !(11..=22).contains(&self.code_font_size) {
            return Err("Code font size must be between 11 and 22 pixels.");
        }
        if !(75..=200).contains(&self.ui_scale) {
            return Err("UI scale must be between 75 and 200 percent.");
        }
        for colors in [&self.custom_themes.dark, &self.custom_themes.light] {
            if !is_hex_color(&colors.background)
                || !is_hex_color(&colors.text)
                || !is_hex_color(&colors.accent)
            {
                return Err("Custom theme colors must use #RRGGBB format.");
            }
        }
        if self.favorites.len() > 50 {
            return Err("Favorites cannot contain more than 50 items.");
        }
        if self.favorites.iter().any(|item| match item {
            FavoriteItem::Folder { path } | FavoriteItem::File { path } => path.is_empty(),
            FavoriteItem::Command {
                file_path,
                command_id,
            } => file_path.is_empty() || command_id.is_empty(),
        }) {
            return Err("Favorite paths and command IDs cannot be empty.");
        }
        if self.recent_files.len() > 8 {
            return Err("Recent files cannot contain more than 8 items.");
        }
        if self.recent_files.iter().any(|path| path.is_empty()) {
            return Err("Recent file paths cannot be empty.");
        }
        Ok(())
    }
}

fn is_hex_color(value: &str) -> bool {
    value.len() == 7
        && value.starts_with('#')
        && value[1..]
            .bytes()
            .all(|character| character.is_ascii_hexdigit())
}

#[cfg(test)]
mod tests {
    use super::{AccentTheme, AppSettings, FavoriteItem, ThemeMode};

    #[test]
    fn defaults_are_valid() {
        assert!(AppSettings::default().validate().is_ok());
    }

    #[test]
    fn rejects_out_of_range_font_sizes() {
        let settings = AppSettings {
            ui_font_size: 10,
            ..AppSettings::default()
        };
        assert!(settings.validate().is_err());

        let settings = AppSettings {
            code_font_size: 23,
            ..AppSettings::default()
        };
        assert!(settings.validate().is_err());

        let settings = AppSettings {
            ui_scale: 201,
            ..AppSettings::default()
        };
        assert!(settings.validate().is_err());
    }

    #[test]
    fn legacy_settings_default_to_dark_cyan() {
        let source = r#"{
          "uiFontSize": 14,
          "codeFontSize": 13,
          "uiScale": 100,
          "rememberExpandedSections": true
        }"#;
        let settings: AppSettings =
            serde_json::from_str(source).expect("legacy settings should load");
        assert_eq!(settings.theme_mode, ThemeMode::Dark);
        assert_eq!(settings.accent_theme, AccentTheme::Cyan);
        assert!(!settings.custom_themes.dark.enabled);
        assert_eq!(settings.custom_themes.light.background, "#f5f7fa");
        assert!(settings.favorites.is_empty());
        assert!(settings.recent_files.is_empty());
    }

    #[test]
    fn favorite_settings_use_camel_case_and_enforce_limits() {
        let mut settings = AppSettings::default();
        settings.favorites.push(FavoriteItem::Folder {
            path: "/workspace/Network".to_string(),
        });
        settings.favorites.push(FavoriteItem::Command {
            file_path: "/workspace/Nmap.cmdnote".to_string(),
            command_id: "ping-scan".to_string(),
        });
        let serialized = serde_json::to_value(&settings).expect("settings must serialize");
        assert_eq!(serialized["favorites"][0]["kind"], "folder");
        assert_eq!(serialized["favorites"][0]["path"], "/workspace/Network");
        assert_eq!(serialized["favorites"][1]["kind"], "command");
        assert_eq!(
            serialized["favorites"][1]["filePath"],
            "/workspace/Nmap.cmdnote"
        );
        assert_eq!(serialized["favorites"][1]["commandId"], "ping-scan");

        settings.recent_files = (0..9).map(|index| format!("/file-{index}")).collect();
        assert!(settings.validate().is_err());
    }

    #[test]
    fn rejects_invalid_custom_theme_hex_values() {
        let mut settings = AppSettings::default();
        settings.custom_themes.dark.background = "not-a-color".to_string();
        assert!(settings.validate().is_err());
        settings.custom_themes.dark.background = "#123abc".to_string();
        assert!(settings.validate().is_ok());
    }
}
