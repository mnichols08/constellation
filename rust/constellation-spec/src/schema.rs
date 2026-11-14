//! Published JSON Schema and provider-neutral tool definitions.
//!
//! Both are generated from the same vocabularies and bounds the validator
//! enforces, so they cannot drift from the Rust contract. The repository keeps
//! generated copies; a test fails when they are stale.
use crate::engine::{MAX_RESULTS, TOOL_NAMES};
use crate::model::*;
use serde_json::{json, Value};

pub const SCHEMA_ID: &str = "https://mnichols08.github.io/constellation/schemas/constellation-spec.v1.schema.json";

fn text(max: usize) -> Value {
    json!({ "type": "string", "minLength": 1, "maxLength": max })
}

fn filter_definition() -> Value {
    let reference = json!({ "$ref": "#/$defs/filter" });
    json!({
        "type": "object",
        "description": "Repository filter. One key per object is canonical; several keys mean all must hold. Nesting depth and total conditions are bounded.",
        "additionalProperties": false,
        "minProperties": 1,
        "properties": {
            "language": text(MAX_TEXT),
            "topic": text(MAX_TEXT),
            "role": { "enum": ROLES },
            "repository": { "type": "string", "minLength": 1, "maxLength": MAX_REPOSITORY_ID, "description": "A repository id returned by a discovery tool." },
            "stars": {
                "type": "object", "additionalProperties": false, "minProperties": 1,
                "properties": {
                    "min": { "type": "integer", "minimum": 0, "maximum": MAX_STARS },
                    "max": { "type": "integer", "minimum": 0, "maximum": MAX_STARS }
                }
            },
            "updated": {
                "type": "object", "additionalProperties": false, "minProperties": 1,
                "description": "Days between the repository's last update and the evidence reference date.",
                "properties": {
                    "within_days": { "type": "integer", "minimum": 0, "maximum": MAX_DAYS },
                    "older_than_days": { "type": "integer", "minimum": 0, "maximum": MAX_DAYS }
                }
            },
            "archived": { "type": "boolean" },
            "fork": { "type": "boolean" },
            "any": { "type": "array", "minItems": 1, "maxItems": MAX_FILTER_NODES, "items": reference },
            "all": { "type": "array", "minItems": 1, "maxItems": MAX_FILTER_NODES, "items": reference },
            "not": reference
        }
    })
}

fn group_definition() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "required": ["match"],
        "properties": {
            "id": { "type": "string", "pattern": "^[a-z0-9][a-z0-9_-]{0,63}$", "description": "Optional; derived from the label when omitted." },
            "label": text(MAX_TEXT),
            "name": { "type": "string", "minLength": 1, "maxLength": MAX_TEXT, "description": "Alias of label." },
            "match": { "$ref": "#/$defs/filter" },
            "placement": { "enum": PLACEMENTS, "description": "Radial distance intent; requires layout.kind radial." }
        }
    })
}

/// JSON Schema (2020-12) for ConstellationSpec v1.
pub fn spec_schema() -> Value {
    json!({
        "$schema": "https://json-schema.org/draft/2020-12/schema",
        "$id": SCHEMA_ID,
        "title": "ConstellationSpec",
        "description": "Semantic intent for a constellation. It names what should be emphasized, grouped, related and how it should be arranged; the Rust engine computes all geometry. It never contains coordinates, forces, code or styles.",
        "type": "object",
        "additionalProperties": false,
        "required": ["schema_version"],
        "properties": {
            "schema_version": { "enum": SUPPORTED_SCHEMA_VERSIONS },
            "focus": {
                "type": "object", "additionalProperties": false, "required": ["kind", "value"],
                "description": "What sits nearest the centre.",
                "properties": {
                    "kind": { "enum": FOCUS_KINDS },
                    "value": { "type": "string", "minLength": 1, "maxLength": MAX_REPOSITORY_ID }
                }
            },
            "groups": { "type": "array", "maxItems": MAX_GROUPS, "items": { "$ref": "#/$defs/group" } },
            "relationships": {
                "type": "array", "maxItems": MAX_RELATIONSHIPS,
                "description": "What connects repositories and how much each basis matters. Default: shared_language at 1.",
                "items": {
                    "type": "object", "additionalProperties": false, "required": ["basis"],
                    "properties": {
                        "basis": { "enum": BASES },
                        "strength": { "type": "number", "minimum": 0, "maximum": 1, "default": 1 }
                    }
                }
            },
            "layout": {
                "type": "object", "additionalProperties": false,
                "properties": {
                    "kind": { "enum": LAYOUT_KINDS, "default": "radial" },
                    "cluster_by": { "type": "array", "maxItems": MAX_CLUSTER_BY, "items": { "enum": CLUSTER_BY }, "default": ["language"] }
                }
            },
            "ranking": {
                "type": "object", "additionalProperties": false,
                "properties": {
                    "by": { "enum": RANK_BY, "default": "stars" },
                    "limit": { "type": "integer", "minimum": 1, "maximum": MAX_LIMIT }
                }
            },
            "style": {
                "type": "object", "additionalProperties": false,
                "description": "Presentation hints only.",
                "properties": {
                    "motion": { "enum": MOTIONS },
                    "orbit_shape": { "enum": ORBIT_SHAPES },
                    "rings": { "type": "boolean" }
                }
            }
        },
        "$defs": { "filter": filter_definition(), "group": group_definition() }
    })
}

/// Provider-neutral tool definitions: a name, a description and a JSON Schema
/// for the arguments. Provider adapters translate these into their own format.
pub fn tool_definitions() -> Value {
    let spec = spec_schema();
    let defs = spec["$defs"].clone();
    let limit = json!({ "type": "integer", "minimum": 1, "maximum": MAX_RESULTS, "default": 20 });
    let empty = json!({ "type": "object", "additionalProperties": false, "properties": {} });
    let tools = json!([
        {
            "name": "portfolio_overview",
            "description": "Start here. One bounded snapshot of the account: how many repositories, how recently they were updated, the developer's own curated roles, the most used languages and topics, and the most starred and most recently updated repositories. Counts of public metadata only; it does not measure skill.",
            "input_schema": empty
        },
        {
            "name": "list_languages",
            "description": "List the languages present in the loaded repositories, with how many repositories use each. Call before naming a language.",
            "input_schema": empty
        },
        {
            "name": "list_topics",
            "description": "List the topics present in the loaded repositories, with how many repositories carry each. Call before naming a topic.",
            "input_schema": empty
        },
        {
            "name": "find_repositories",
            "description": "Find repositories matching a filter. Returns stable repository ids with the evidence that matched. Results are bounded.",
            "input_schema": {
                "type": "object", "additionalProperties": false, "required": ["filter"],
                "properties": { "filter": { "$ref": "#/$defs/filter" }, "limit": limit },
                "$defs": { "filter": defs["filter"] }
            }
        },
        {
            "name": "describe_repository",
            "description": "Describe one repository's evidence: languages, topics, curated role, stars and recency.",
            "input_schema": {
                "type": "object", "additionalProperties": false, "required": ["id"],
                "properties": { "id": { "type": "string", "minLength": 1, "maxLength": MAX_REPOSITORY_ID } }
            }
        },
        {
            "name": "preview_group",
            "description": "Check which repositories a group would contain, with reasons, without changing anything.",
            "input_schema": {
                "type": "object", "additionalProperties": false, "required": ["group"],
                "properties": { "group": { "$ref": "#/$defs/group" }, "limit": limit },
                "$defs": defs
            }
        },
        {
            "name": "validate_spec",
            "description": "Validate a ConstellationSpec against the schema and the loaded repositories. Returns the normalized spec or structured diagnostics. Builds nothing.",
            "input_schema": { "type": "object", "additionalProperties": false, "required": ["spec"], "properties": { "spec": { "$ref": SCHEMA_ID } } }
        },
        {
            "name": "compile_spec",
            "description": "Compile a valid ConstellationSpec into resolved groups, placement bands and relationships. The engine computes all geometry.",
            "input_schema": { "type": "object", "additionalProperties": false, "required": ["spec"], "properties": { "spec": { "$ref": SCHEMA_ID } } }
        }
    ]);
    debug_assert!(tools.as_array().is_some_and(|list| list.iter().map(|tool| tool["name"].as_str().unwrap_or("")).eq(TOOL_NAMES.iter().copied())));
    json!({ "version": 1, "spec_schema": SCHEMA_ID, "tools": tools })
}
