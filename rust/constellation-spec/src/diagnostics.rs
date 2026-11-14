//! Machine-readable diagnostics for externally authored ConstellationSpec input.
//! Codes are a stable public contract: add new ones, never repurpose old ones.
use serde::Serialize;

/// Diagnostics beyond this count are dropped; `Diagnostics::truncated` records it.
pub const MAX_DIAGNOSTICS: usize = 64;
const MAX_RECEIVED: usize = 80;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Code {
    InvalidJson,
    SpecTooLarge,
    InvalidType,
    MissingField,
    UnknownField,
    UnsupportedSchemaVersion,
    InvalidValue,
    OutOfRange,
    TooLong,
    TooMany,
    EmptyValue,
    DuplicateId,
    UnknownGroup,
    FilterTooDeep,
    FilterTooComplex,
    EmptyFilter,
    UnsupportedCombination,
    UnknownRepository,
    UnknownLanguage,
    UnknownTopic,
    EmptyGroup,
    EmptyFocus,
    OverlappingPlacement,
    UnknownTool,
    InvalidEvidence,
}

pub const CODES: [&str; 25] = [
    "invalid_json",
    "spec_too_large",
    "invalid_type",
    "missing_field",
    "unknown_field",
    "unsupported_schema_version",
    "invalid_value",
    "out_of_range",
    "too_long",
    "too_many",
    "empty_value",
    "duplicate_id",
    "unknown_group",
    "filter_too_deep",
    "filter_too_complex",
    "empty_filter",
    "unsupported_combination",
    "unknown_repository",
    "unknown_language",
    "unknown_topic",
    "empty_group",
    "empty_focus",
    "overlapping_placement",
    "unknown_tool",
    "invalid_evidence",
];

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "snake_case")]
pub enum Severity {
    Error,
    Warning,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Bounds {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max: Option<f64>,
}

#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Diagnostic {
    pub code: Code,
    pub severity: Severity,
    /// Location in the authored document, e.g. `groups[1].match.language`.
    pub path: String,
    pub message: String,
    #[serde(skip_serializing_if = "Vec::is_empty")]
    pub allowed: Vec<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub bounds: Option<Bounds>,
    /// A short, truncated echo of the offending scalar. Never a whole document.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub received: Option<String>,
}

impl Diagnostic {
    pub fn error(code: Code, path: &str, message: &str) -> Self {
        Self {
            code,
            severity: Severity::Error,
            path: path.to_owned(),
            message: message.to_owned(),
            allowed: Vec::new(),
            bounds: None,
            received: None,
        }
    }
    pub fn warning(code: Code, path: &str, message: &str) -> Self {
        Self { severity: Severity::Warning, ..Self::error(code, path, message) }
    }
    pub fn allowed(mut self, values: &[&str]) -> Self {
        self.allowed = values.iter().map(|value| (*value).to_owned()).collect();
        self
    }
    pub fn allowed_owned(mut self, values: Vec<String>) -> Self {
        self.allowed = values;
        self
    }
    pub fn bounds(mut self, min: Option<f64>, max: Option<f64>) -> Self {
        self.bounds = Some(Bounds { min, max });
        self
    }
    pub fn received(mut self, value: &str) -> Self {
        self.received = Some(clip(value, MAX_RECEIVED));
        self
    }
}

/// Truncate on a character boundary and strip control characters.
pub fn clip(value: &str, max: usize) -> String {
    let mut out: String =
        value.chars().filter(|c| !c.is_control()).take(max).collect();
    if value.chars().count() > max {
        out.push('…');
    }
    out
}

#[derive(Clone, Debug, Default, PartialEq, Serialize)]
pub struct Diagnostics {
    pub items: Vec<Diagnostic>,
    pub truncated: bool,
}

impl Diagnostics {
    pub fn push(&mut self, diagnostic: Diagnostic) {
        if self.items.len() < MAX_DIAGNOSTICS {
            self.items.push(diagnostic);
        } else {
            self.truncated = true;
        }
    }
    pub fn has_errors(&self) -> bool {
        self.items.iter().any(|d| d.severity == Severity::Error)
    }
    pub fn extend(&mut self, other: Diagnostics) {
        for item in other.items {
            self.push(item);
        }
        self.truncated |= other.truncated;
    }
    pub fn one(diagnostic: Diagnostic) -> Self {
        Self { items: vec![diagnostic], truncated: false }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn codes_serialize_to_the_published_stable_names() {
        let all = [
            Code::InvalidJson, Code::SpecTooLarge, Code::InvalidType, Code::MissingField,
            Code::UnknownField, Code::UnsupportedSchemaVersion, Code::InvalidValue,
            Code::OutOfRange, Code::TooLong, Code::TooMany, Code::EmptyValue, Code::DuplicateId,
            Code::UnknownGroup, Code::FilterTooDeep, Code::FilterTooComplex, Code::EmptyFilter,
            Code::UnsupportedCombination, Code::UnknownRepository, Code::UnknownLanguage,
            Code::UnknownTopic, Code::EmptyGroup, Code::EmptyFocus, Code::OverlappingPlacement,
            Code::UnknownTool, Code::InvalidEvidence,
        ];
        let names: Vec<String> = all
            .iter()
            .map(|code| serde_json::to_value(code).unwrap().as_str().unwrap().to_owned())
            .collect();
        assert_eq!(names, CODES);
    }

    #[test]
    fn diagnostics_are_bounded_and_echo_only_short_clean_text() {
        let mut list = Diagnostics::default();
        for _ in 0..MAX_DIAGNOSTICS + 5 {
            list.push(Diagnostic::error(Code::InvalidType, "a", "x"));
        }
        assert_eq!(list.items.len(), MAX_DIAGNOSTICS);
        assert!(list.truncated);
        let echoed = Diagnostic::error(Code::TooLong, "a", "x").received(&"é\u{0}".repeat(200));
        let text = echoed.received.unwrap();
        assert!(text.chars().count() <= MAX_RECEIVED + 1 && !text.contains('\u{0}'));
        let json = serde_json::to_value(
            Diagnostic::error(Code::OutOfRange, "relationships[0].strength", "bad")
                .bounds(Some(0.0), Some(1.0))
                .allowed(&["a"]),
        )
        .unwrap();
        assert_eq!(json["code"], "out_of_range");
        assert_eq!(json["severity"], "error");
        assert_eq!(json["bounds"]["max"], 1.0);
        assert_eq!(json["allowed"][0], "a");
    }
}
