//! Untrusted input -> validated `ConstellationSpec`.
//!
//! `RawConstellationSpec` is any JSON value. `TryFrom` walks it once, records a
//! structured diagnostic for every problem it can locate, and only returns a
//! spec when there are no errors. Nothing here panics on authored data.
use crate::diagnostics::{Code, Diagnostic, Diagnostics};
use crate::model::*;
use serde_json::{Map, Value};

/// Untrusted, unvalidated spec exactly as authored.
pub struct RawConstellationSpec(pub Value);

impl RawConstellationSpec {
    /// Size-checked JSON parsing. serde_json bounds nesting depth itself and
    /// rejects NaN, Infinity and out-of-range numbers as invalid JSON.
    pub fn from_json(text: &str) -> Result<Self, Diagnostics> {
        if text.len() > MAX_SPEC_BYTES {
            return Err(Diagnostics::one(
                Diagnostic::error(Code::SpecTooLarge, "", "ConstellationSpec exceeds the size limit")
                    .bounds(None, Some(MAX_SPEC_BYTES as f64)),
            ));
        }
        serde_json::from_str(text).map(Self).map_err(|error| {
            Diagnostics::one(Diagnostic::error(
                Code::InvalidJson,
                "",
                &format!("ConstellationSpec is not valid JSON (line {}, column {})", error.line(), error.column()),
            ))
        })
    }
}

impl TryFrom<RawConstellationSpec> for ConstellationSpec {
    type Error = Diagnostics;
    fn try_from(raw: RawConstellationSpec) -> Result<Self, Diagnostics> {
        let mut out = Diagnostics::default();
        let spec = spec(&raw.0, &mut out);
        match spec {
            Some(spec) if !out.has_errors() => Ok(spec),
            _ => Err(out),
        }
    }
}

/// Parse and validate JSON text in one step.
pub fn parse_spec(text: &str) -> Result<ConstellationSpec, Diagnostics> {
    ConstellationSpec::try_from(RawConstellationSpec::from_json(text)?)
}

/// Validate one authored group (used by `preview_group`).
pub fn group_from_value(value: &Value) -> Result<Group, Diagnostics> {
    let mut out = Diagnostics::default();
    let parsed = group(value, "group", 0, &mut out);
    match parsed {
        Some(group) if !out.has_errors() => Ok(group),
        _ => Err(out),
    }
}

/// Validate one authored repository filter (used by `find_repositories`).
pub fn filter_from_value(value: &Value) -> Result<Filter, Diagnostics> {
    let mut out = Diagnostics::default();
    let mut budget = MAX_FILTER_NODES;
    let parsed = filter(value, "filter", 0, &mut budget, &mut out);
    match parsed {
        Some(filter) if !out.has_errors() => Ok(filter),
        _ => Err(out),
    }
}

fn kind(value: &Value) -> &'static str {
    match value {
        Value::Null => "null",
        Value::Bool(_) => "boolean",
        Value::Number(_) => "number",
        Value::String(_) => "string",
        Value::Array(_) => "array",
        Value::Object(_) => "object",
    }
}

fn join(path: &str, key: &str) -> String {
    if path.is_empty() { key.to_owned() } else { format!("{path}.{key}") }
}

fn wrong_type(path: &str, expected: &str, value: &Value, out: &mut Diagnostics) {
    out.push(
        Diagnostic::error(Code::InvalidType, path, &format!("Expected {expected}, received {}", kind(value)))
            .allowed(&[expected]),
    );
}

fn object<'a>(value: &'a Value, path: &str, allowed: &[&str], out: &mut Diagnostics) -> Option<&'a Map<String, Value>> {
    let Value::Object(map) = value else {
        wrong_type(path, "object", value, out);
        return None;
    };
    for key in map.keys() {
        if !allowed.contains(&key.as_str()) {
            out.push(
                Diagnostic::error(Code::UnknownField, &join(path, &super::diagnostics::clip(key, 40)), "Unknown field")
                    .allowed(allowed),
            );
        }
    }
    Some(map)
}

fn text(value: &Value, path: &str, max: usize, out: &mut Diagnostics) -> Option<String> {
    let Value::String(raw) = value else {
        wrong_type(path, "string", value, out);
        return None;
    };
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        out.push(Diagnostic::error(Code::EmptyValue, path, "Text must not be empty"));
        return None;
    }
    if trimmed.chars().count() > max {
        out.push(
            Diagnostic::error(Code::TooLong, path, "Text is too long")
                .bounds(Some(1.0), Some(max as f64))
                .received(trimmed),
        );
        return None;
    }
    if trimmed.chars().any(char::is_control) {
        out.push(Diagnostic::error(Code::InvalidValue, path, "Text must not contain control characters"));
        return None;
    }
    Some(trimmed.to_owned())
}

/// Closed vocabulary lookup. `aliases` maps accepted synonyms to canonical names.
fn word<T>(value: &Value, path: &str, allowed: &[&str], aliases: &[(&str, &str)], parse: fn(&str) -> Option<T>, out: &mut Diagnostics) -> Option<T> {
    let Value::String(raw) = value else {
        wrong_type(path, "string", value, out);
        return None;
    };
    let folded = fold(raw).replace([' ', '-'], "_");
    let canonical = aliases.iter().find(|(alias, _)| *alias == folded).map_or(folded.as_str(), |(_, name)| name);
    let parsed = parse(canonical);
    if parsed.is_none() {
        out.push(
            Diagnostic::error(Code::InvalidValue, path, "Value is not in the supported vocabulary")
                .allowed(allowed)
                .received(raw),
        );
    }
    parsed
}

fn integer(value: &Value, path: &str, min: u64, max: u64, out: &mut Diagnostics) -> Option<u32> {
    let Value::Number(number) = value else {
        wrong_type(path, "integer", value, out);
        return None;
    };
    // Accept 3 and 3.0; reject fractions, negatives and anything out of bounds.
    let whole = number.as_u64().or_else(|| {
        number.as_f64().filter(|f| f.is_finite() && f.fract() == 0.0 && *f >= 0.0 && *f <= 4_294_967_295.0).map(|f| f as u64)
    });
    match whole {
        Some(n) if (min..=max).contains(&n) => Some(n as u32),
        _ => {
            out.push(
                Diagnostic::error(Code::OutOfRange, path, "Expected a whole number within bounds")
                    .bounds(Some(min as f64), Some(max as f64))
                    .received(&number.to_string()),
            );
            None
        }
    }
}

fn unit(value: &Value, path: &str, out: &mut Diagnostics) -> Option<f64> {
    let Value::Number(number) = value else {
        wrong_type(path, "number", value, out);
        return None;
    };
    match number.as_f64() {
        Some(n) if n.is_finite() && (0.0..=1.0).contains(&n) => Some((n * 1000.0).round() / 1000.0),
        _ => {
            out.push(
                Diagnostic::error(Code::OutOfRange, path, "Expected a finite number within bounds")
                    .bounds(Some(0.0), Some(1.0))
                    .received(&number.to_string()),
            );
            None
        }
    }
}

fn boolean(value: &Value, path: &str, out: &mut Diagnostics) -> Option<bool> {
    match value {
        Value::Bool(b) => Some(*b),
        _ => {
            wrong_type(path, "boolean", value, out);
            None
        }
    }
}

fn list<'a>(value: &'a Value, path: &str, max: usize, out: &mut Diagnostics) -> Option<&'a [Value]> {
    let Value::Array(items) = value else {
        wrong_type(path, "array", value, out);
        return None;
    };
    if items.len() > max {
        out.push(
            Diagnostic::error(Code::TooMany, path, "Too many entries").bounds(None, Some(max as f64)).received(&items.len().to_string()),
        );
        return None;
    }
    Some(items)
}

/// Lowercase ASCII slug used when a group has a name but no explicit id.
fn slug(label: &str) -> String {
    let mut out = String::new();
    for ch in label.chars().flat_map(char::to_lowercase) {
        if ch.is_ascii_alphanumeric() {
            out.push(ch);
        } else if !out.is_empty() && !out.ends_with('-') {
            out.push('-');
        }
        if out.len() >= MAX_ID {
            break;
        }
    }
    let out = out.trim_end_matches('-').to_owned();
    if out.is_empty() { "group".into() } else { out }
}

fn valid_id(id: &str) -> bool {
    !id.is_empty()
        && id.len() <= MAX_ID
        && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit() || b == b'-' || b == b'_')
        && id.as_bytes()[0].is_ascii_alphanumeric()
}

fn spec(value: &Value, out: &mut Diagnostics) -> Option<ConstellationSpec> {
    let map = object(value, "", &["schema_version", "focus", "groups", "relationships", "layout", "ranking", "style"], out)?;
    match map.get("schema_version") {
        None => out.push(
            Diagnostic::error(Code::MissingField, "schema_version", "schema_version is required")
                .allowed_owned(SUPPORTED_SCHEMA_VERSIONS.iter().map(u64::to_string).collect()),
        ),
        Some(version) => {
            if !version.as_u64().is_some_and(|v| SUPPORTED_SCHEMA_VERSIONS.contains(&v)) {
                out.push(
                    Diagnostic::error(Code::UnsupportedSchemaVersion, "schema_version", "This engine does not support that schema version")
                        .allowed_owned(SUPPORTED_SCHEMA_VERSIONS.iter().map(u64::to_string).collect())
                        .received(&version.to_string()),
                );
                // Later fields may mean something else in another version.
                return None;
            }
        }
    }
    let defaults = ConstellationSpec::default();

    let mut groups = Vec::new();
    if let Some(items) = map.get("groups").and_then(|v| list(v, "groups", MAX_GROUPS, out)) {
        for (index, item) in items.iter().enumerate() {
            let path = format!("groups[{index}]");
            if let Some(parsed) = group(item, &path, index, out) {
                if !groups.iter().any(|known: &Group| known.id == parsed.id) {
                    groups.push(parsed);
                } else {
                    out.push(Diagnostic::error(Code::DuplicateId, &join(&path, "id"), "Group ids must be unique").received(&parsed.id));
                }
            }
        }
    }

    let focus = map.get("focus").filter(|v| !v.is_null()).and_then(|value| {
        let fields = object(value, "focus", &["kind", "value"], out)?;
        let (Some(kind_value), Some(target)) = (fields.get("kind"), fields.get("value")) else {
            for key in ["kind", "value"] {
                if !fields.contains_key(key) {
                    out.push(Diagnostic::error(Code::MissingField, &join("focus", key), "Field is required"));
                }
            }
            return None;
        };
        let kind = word(kind_value, "focus.kind", FOCUS_KINDS, &[("languages", "language"), ("topics", "topic"), ("repo", "repository")], |v| {
            FOCUS_KINDS.iter().position(|k| *k == v)
        }, out)?;
        match FOCUS_KINDS[kind] {
            "language" => text(target, "focus.value", MAX_TEXT, out).map(Focus::Language),
            "topic" => text(target, "focus.value", MAX_TEXT, out).map(Focus::Topic),
            "role" => word(target, "focus.value", ROLES, &[], Role::parse, out).map(Focus::Role),
            "repository" => text(target, "focus.value", MAX_REPOSITORY_ID, out).map(Focus::Repository),
            _ => {
                let id = text(target, "focus.value", MAX_ID, out)?;
                if groups.iter().any(|group| group.id == id) {
                    Some(Focus::Group(id))
                } else {
                    out.push(
                        Diagnostic::error(Code::UnknownGroup, "focus.value", "Focus refers to a group that is not defined")
                            .allowed_owned(groups.iter().map(|group| group.id.clone()).collect())
                            .received(&id),
                    );
                    None
                }
            }
        }
    });

    let mut relationships = Vec::new();
    match map.get("relationships").and_then(|v| list(v, "relationships", MAX_RELATIONSHIPS, out)) {
        None if !map.contains_key("relationships") => relationships = defaults.relationships,
        None => {}
        Some(items) => {
            for (index, item) in items.iter().enumerate() {
                let path = format!("relationships[{index}]");
                let Some(fields) = object(item, &path, &["basis", "strength"], out) else { continue };
                let basis = match fields.get("basis") {
                    Some(v) => word(v, &join(&path, "basis"), BASES, &[("shared_languages", "shared_language"), ("shared_topics", "shared_topic"), ("language", "shared_language"), ("topic", "shared_topic")], Basis::parse, out),
                    None => {
                        out.push(Diagnostic::error(Code::MissingField, &join(&path, "basis"), "Field is required").allowed(BASES));
                        None
                    }
                };
                let strength = match fields.get("strength") {
                    Some(v) => unit(v, &join(&path, "strength"), out),
                    None => Some(1.0),
                };
                if let (Some(basis), Some(strength)) = (basis, strength) {
                    if !relationships.iter().any(|known: &Relationship| known.basis == basis) {
                        relationships.push(Relationship { basis, strength });
                    } else {
                        out.push(Diagnostic::error(Code::DuplicateId, &join(&path, "basis"), "Each relationship basis may appear once").received(basis.as_str()));
                    }
                }
            }
        }
    }

    let mut layout = defaults.layout;
    if let Some(fields) = map.get("layout").and_then(|v| object(v, "layout", &["kind", "cluster_by"], out)) {
        if let Some(v) = fields.get("kind") {
            if let Some(kind) = word(v, "layout.kind", LAYOUT_KINDS, &[("rings", "radial"), ("galaxy", "clustered"), ("clusters", "clustered"), ("solar", "solar_system"), ("force", "web"), ("eras", "timeline")], LayoutKind::parse, out) {
                layout.kind = kind;
            }
        }
        if let Some(items) = fields.get("cluster_by").and_then(|v| list(v, "layout.cluster_by", MAX_CLUSTER_BY, out)) {
            layout.cluster_by.clear();
            for (index, item) in items.iter().enumerate() {
                let path = format!("layout.cluster_by[{index}]");
                if let Some(by) = word(item, &path, CLUSTER_BY, &[("languages", "language"), ("topics", "topic"), ("roles", "role"), ("groups", "group")], ClusterBy::parse, out) {
                    if !layout.cluster_by.contains(&by) {
                        layout.cluster_by.push(by);
                    }
                }
            }
        }
    }

    let mut ranking = defaults.ranking;
    if let Some(fields) = map.get("ranking").and_then(|v| object(v, "ranking", &["by", "limit"], out)) {
        if let Some(v) = fields.get("by") {
            if let Some(by) = word(v, "ranking.by", RANK_BY, &[("updated", "recency"), ("recent", "recency"), ("popularity", "stars")], RankBy::parse, out) {
                ranking.by = by;
            }
        }
        if let Some(v) = fields.get("limit").filter(|v| !v.is_null()) {
            ranking.limit = integer(v, "ranking.limit", 1, MAX_LIMIT, out);
        }
    }

    let mut style = Style::default();
    if let Some(fields) = map.get("style").and_then(|v| object(v, "style", &["motion", "orbit_shape", "rings"], out)) {
        if let Some(v) = fields.get("motion") {
            style.motion = word(v, "style.motion", MOTIONS, &[("none", "still"), ("calm", "gentle")], Motion::parse, out);
        }
        if let Some(v) = fields.get("orbit_shape") {
            style.orbit_shape = word(v, "style.orbit_shape", ORBIT_SHAPES, &[("circle", "round"), ("circular", "round")], OrbitShape::parse, out);
        }
        if let Some(v) = fields.get("rings") {
            style.rings = boolean(v, "style.rings", out);
        }
    }

    // Placement names radial distance; other layouts have no rings to place on.
    if layout.kind != LayoutKind::Radial {
        for (index, group) in groups.iter().enumerate() {
            if group.placement.is_some() {
                out.push(
                    Diagnostic::error(
                        Code::UnsupportedCombination,
                        &format!("groups[{index}].placement"),
                        &format!("Group placement requires layout.kind \"radial\"; this spec uses \"{}\"", layout.kind.as_str()),
                    )
                    .allowed(&["radial"]),
                );
            }
        }
    }
    if layout.cluster_by.contains(&ClusterBy::Group) && groups.is_empty() {
        out.push(Diagnostic::error(Code::UnsupportedCombination, "layout.cluster_by", "Clustering by group requires at least one group"));
    }

    Some(ConstellationSpec { focus, groups, relationships, layout, ranking, style })
}

fn group(value: &Value, path: &str, index: usize, out: &mut Diagnostics) -> Option<Group> {
    let fields = object(value, path, &["id", "label", "name", "match", "placement"], out)?;
    let label = fields
        .get("label")
        .or_else(|| fields.get("name"))
        .and_then(|v| text(v, &join(path, if fields.contains_key("label") { "label" } else { "name" }), MAX_TEXT, out));
    let id = match fields.get("id") {
        Some(v) => text(v, &join(path, "id"), MAX_ID, out).and_then(|id| {
            if valid_id(&id) {
                Some(id)
            } else {
                out.push(
                    Diagnostic::error(Code::InvalidValue, &join(path, "id"), "Group ids use lowercase letters, digits, hyphens and underscores, and start with a letter or digit")
                        .received(&id),
                );
                None
            }
        }),
        None => Some(label.as_deref().map_or_else(|| format!("group-{}", index + 1), slug)),
    };
    let label = label.or_else(|| id.clone());
    let matcher = match fields.get("match") {
        Some(v) => {
            let mut budget = MAX_FILTER_NODES;
            filter(v, &join(path, "match"), 0, &mut budget, out)
        }
        None => {
            out.push(Diagnostic::error(Code::MissingField, &join(path, "match"), "A group needs a match filter").allowed(FILTER_KEYS));
            None
        }
    };
    let placement = match fields.get("placement").filter(|v| !v.is_null()) {
        Some(v) => Some(word(v, &join(path, "placement"), PLACEMENTS, &[("centre", "center"), ("outskirts", "outer"), ("edge", "outer"), ("core", "center")], Placement::parse, out)?),
        None => None,
    };
    Some(Group { id: id?, label: label?, filter: matcher?, placement })
}

fn filter(value: &Value, path: &str, depth: usize, budget: &mut usize, out: &mut Diagnostics) -> Option<Filter> {
    if depth > MAX_FILTER_DEPTH {
        out.push(Diagnostic::error(Code::FilterTooDeep, path, "Filters nest too deeply").bounds(None, Some(MAX_FILTER_DEPTH as f64)));
        return None;
    }
    if *budget == 0 {
        out.push(Diagnostic::error(Code::FilterTooComplex, path, "Filter has too many conditions").bounds(None, Some(MAX_FILTER_NODES as f64)));
        return None;
    }
    *budget -= 1;
    let fields = object(value, path, FILTER_KEYS, out)?;
    let mut parts = Vec::new();
    let mut failed = false;
    // FILTER_KEYS order makes multi-key objects normalize deterministically.
    for key in FILTER_KEYS {
        let Some(item) = fields.get(*key) else { continue };
        let at = join(path, key);
        let parsed = match *key {
            "language" => text(item, &at, MAX_TEXT, out).map(Filter::Language),
            "topic" => text(item, &at, MAX_TEXT, out).map(|v| Filter::Topic(fold(&v))),
            "role" => word(item, &at, ROLES, &[("experiment", "experimental"), ("experiments", "experimental"), ("none", "unassigned")], Role::parse, out).map(Filter::Role),
            "repository" => text(item, &at, MAX_REPOSITORY_ID, out).map(Filter::Repository),
            "stars" => object(item, &at, &["min", "max"], out).and_then(|range| {
                let min = range.get("min").map(|v| integer(v, &join(&at, "min"), 0, MAX_STARS, out));
                let max = range.get("max").map(|v| integer(v, &join(&at, "max"), 0, MAX_STARS, out));
                bounds_pair(min, max, &at, out).map(|(min, max)| Filter::Stars { min, max })
            }),
            "updated" => object(item, &at, &["within_days", "older_than_days"], out).and_then(|range| {
                let within = range.get("within_days").map(|v| integer(v, &join(&at, "within_days"), 0, MAX_DAYS, out));
                let older = range.get("older_than_days").map(|v| integer(v, &join(&at, "older_than_days"), 0, MAX_DAYS, out));
                // older_than is the lower bound on age, within the upper bound.
                bounds_pair(older, within, &at, out).map(|(older_than_days, within_days)| Filter::Updated { within_days, older_than_days })
            }),
            "archived" => boolean(item, &at, out).map(Filter::Archived),
            "fork" => boolean(item, &at, out).map(Filter::Fork),
            "any" | "all" => list(item, &at, MAX_FILTER_NODES, out).and_then(|items| {
                if items.is_empty() {
                    out.push(Diagnostic::error(Code::EmptyFilter, &at, "Combinator needs at least one filter"));
                    return None;
                }
                let children: Vec<_> = items
                    .iter()
                    .enumerate()
                    .filter_map(|(index, child)| filter(child, &format!("{at}[{index}]"), depth + 1, budget, out))
                    .collect();
                (children.len() == items.len()).then(|| if *key == "any" { Filter::Any(children) } else { Filter::All(children) })
            }),
            _ => filter(item, &at, depth + 1, budget, out).map(|inner| Filter::Not(Box::new(inner))),
        };
        match parsed {
            Some(part) => parts.push(part),
            None => failed = true,
        }
    }
    if failed {
        return None;
    }
    match parts.len() {
        0 => {
            out.push(Diagnostic::error(Code::EmptyFilter, path, "Filter has no conditions").allowed(FILTER_KEYS));
            None
        }
        1 => parts.pop(),
        // Several keys in one object mean all of them must hold.
        _ => Some(Filter::All(parts)),
    }
}

/// Both ends optional, at least one present, and min <= max.
/// Outer `None` means the bound was not authored; inner `None` means it was invalid.
fn bounds_pair(min: Option<Option<u32>>, max: Option<Option<u32>>, path: &str, out: &mut Diagnostics) -> Option<(Option<u32>, Option<u32>)> {
    if min.is_none() && max.is_none() {
        out.push(Diagnostic::error(Code::EmptyFilter, path, "Range needs at least one bound"));
        return None;
    }
    let min = match min { Some(value) => Some(value?), None => None };
    let max = match max { Some(value) => Some(value?), None => None };
    if let (Some(lo), Some(hi)) = (min, max) {
        if lo > hi {
            out.push(Diagnostic::error(Code::OutOfRange, path, "Range lower bound exceeds its upper bound").bounds(Some(f64::from(lo)), Some(f64::from(hi))));
            return None;
        }
    }
    Some((min, max))
}
