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
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::AppSettings;

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
}
