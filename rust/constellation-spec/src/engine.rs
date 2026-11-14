//! Persistent semantic engine: owns repository evidence, its retained indexes,
//! and the adjacency of the last applied spec. No DOM, network, clock or
//! randomness: the same evidence and spec always produce the same answers.
//!
//! Lifetime: one engine per loaded evidence set. `set_evidence` replaces the
//! evidence, rebuilds every index, drops the applied spec and bumps
//! `generation`; indices obtained before that call are no longer valid.
use crate::compile::{adjacency, check_references, compile, compile_with, relationship_edges, Canvas, Compiled, Edge, ENGINE_VERSION, MAX_MEMBERS_REPORTED};
use std::cell::OnceCell;
use crate::diagnostics::{Code, Diagnostic, Diagnostics};
use crate::evidence::{Evidence, Postings, RepoIx};
use crate::model::{sort_with, sorted_order, ConstellationSpec, MAX_SPEC_BYTES};
use crate::parse::{filter_from_value, group_from_value, parse_spec, RawConstellationSpec};
use serde_json::{json, Value};
use std::collections::VecDeque;

/// Upper bound on items any discovery result lists.
pub const MAX_RESULTS: usize = 50;
pub const DEFAULT_RESULTS: usize = 20;
pub const MAX_LISTED: usize = 200;
pub const TOOL_NAMES: [&str; 7] =
    ["list_languages", "list_topics", "find_repositories", "describe_repository", "preview_group", "validate_spec", "compile_spec"];

/// Relationship edges and their adjacency lists, built once and reused.
struct Graph {
    edges: Vec<Edge>,
    adjacency: Vec<Vec<(RepoIx, f32)>>,
}

pub struct Engine {
    evidence: Evidence,
    applied: Option<Compiled>,
    /// Built on the first graph query and kept until the evidence or applied spec changes.
    graph: OnceCell<Graph>,
    generation: u32,
}

fn failure(diagnostics: Diagnostics) -> Value {
    json!({ "ok": false, "diagnostics": diagnostics.items, "diagnostics_truncated": diagnostics.truncated })
}

fn success(mut payload: Value, warnings: &Diagnostics) -> Value {
    payload["ok"] = json!(true);
    payload["diagnostics"] = json!(warnings.items);
    payload["diagnostics_truncated"] = json!(warnings.truncated);
    payload
}

impl Engine {
    pub fn new(evidence_json: &str) -> Result<Self, Diagnostics> {
        let evidence = Evidence::from_json(evidence_json)?;
        Ok(Self { evidence, applied: None, graph: OnceCell::new(), generation: 0 })
    }

    /// Until a spec is applied, the graph follows the default relationships.
    fn graph(&self) -> &Graph {
        self.graph.get_or_init(|| {
            let count = self.evidence.repos.len();
            let edges = match &self.applied {
                Some(compiled) => compiled.edges.clone(),
                None => relationship_edges(&self.evidence, &ConstellationSpec::default().relationships, &vec![true; count]),
            };
            Graph { adjacency: adjacency(count, &edges), edges }
        })
    }

    /// Replace the evidence. On failure the engine keeps its previous state.
    pub fn set_evidence(&mut self, evidence_json: &str) -> Result<(), Diagnostics> {
        self.evidence = Evidence::from_json(evidence_json)?;
        self.applied = None;
        self.graph = OnceCell::new();
        self.generation = self.generation.wrapping_add(1);
        Ok(())
    }

    pub fn generation(&self) -> u32 {
        self.generation
    }
    pub fn repository_count(&self) -> usize {
        self.evidence.repos.len()
    }
    pub fn index_of(&self, id: &str) -> Option<u32> {
        self.evidence.lookup(id).map(|ix| ix.0)
    }
    pub fn id_at(&self, index: u32) -> Option<&str> {
        self.evidence.repos.get(index as usize).map(|repo| repo.id.as_str())
    }

    /// Neighbours through retained adjacency; no topology is rebuilt.
    pub fn neighbors(&self, index: u32) -> Vec<u32> {
        self.graph().adjacency.get(index as usize).map(|list| list.iter().map(|(ix, _)| ix.0).collect()).unwrap_or_default()
    }

    /// Fewest-hops path through retained adjacency; empty when unreachable.
    pub fn path(&self, start: u32, end: u32) -> Vec<u32> {
        let adjacency = &self.graph().adjacency;
        let count = adjacency.len();
        let (start, end) = (start as usize, end as usize);
        if start >= count || end >= count {
            return Vec::new();
        }
        let mut previous = vec![usize::MAX; count];
        let mut queue = VecDeque::from([start]);
        previous[start] = start;
        while let Some(node) = queue.pop_front() {
            if node == end {
                let mut path = vec![end as u32];
                let mut at = end;
                while at != start {
                    at = previous[at];
                    path.push(at as u32);
                }
                path.reverse();
                return path;
            }
            for (next, _) in &adjacency[node] {
                if previous[next.at()] == usize::MAX {
                    previous[next.at()] = node;
                    queue.push_back(next.at());
                }
            }
        }
        Vec::new()
    }

    pub fn edge_pairs(&self) -> Vec<u32> {
        self.graph().edges.iter().flat_map(|edge| [edge.a.0, edge.b.0]).collect()
    }
    pub fn edge_weights(&self) -> Vec<f32> {
        self.graph().edges.iter().map(|edge| edge.weight).collect()
    }
    /// Band per repository for the applied spec (0 centre .. 3 outer, 255 not shown). Empty before a spec is applied.
    pub fn bands(&self) -> Vec<u8> {
        self.applied.as_ref().map(|compiled| compiled.nodes.iter().map(|node| if node.included { node.band as u8 } else { 255 }).collect()).unwrap_or_default()
    }
    /// Flat x,y per repository for an applied radial spec; empty otherwise.
    pub fn positions(&self) -> Vec<f32> {
        self.applied
            .as_ref()
            .and_then(|compiled| compiled.positions.as_ref())
            .map(|positions| positions.iter().flat_map(|p| [p[0] as f32, p[1] as f32]).collect())
            .unwrap_or_default()
    }

    fn parse(&self, spec_json: &str) -> Result<(ConstellationSpec, Diagnostics), Diagnostics> {
        let spec = parse_spec(spec_json)?;
        let references = check_references(&spec, &self.evidence);
        if references.has_errors() { Err(references) } else { Ok((spec, references)) }
    }

    /// Schema and reference validation only; nothing is compiled or retained.
    pub fn validate(&self, spec_json: &str) -> Value {
        match self.parse(spec_json) {
            Ok((spec, warnings)) => success(json!({ "spec": spec.to_value() }), &warnings),
            Err(diagnostics) => failure(diagnostics),
        }
    }

    /// Compile without retaining anything: safe for previews and tool calls.
    pub fn compile(&self, spec_json: &str, canvas: Canvas) -> Value {
        match parse_spec(spec_json).and_then(|spec| compile(spec, &self.evidence, canvas)) {
            Ok(compiled) => success(json!({ "compiled": compiled.to_value(&self.evidence) }), &compiled.warnings),
            Err(diagnostics) => failure(diagnostics),
        }
    }

    /// Compile and retain the result. A spec that fails leaves the engine untouched.
    pub fn apply(&mut self, spec_json: &str, canvas: Canvas) -> Value {
        match parse_spec(spec_json).and_then(|spec| compile(spec, &self.evidence, canvas)) {
            Ok(compiled) => {
                let result = success(json!({ "compiled": compiled.to_value(&self.evidence) }), &compiled.warnings);
                self.applied = Some(compiled);
                self.graph = OnceCell::new();
                result
            }
            Err(diagnostics) => failure(diagnostics),
        }
    }

    /// Ring positions only: `{ ok, positions: [[id, x, y], ...] }`. Skips relationship
    /// scoring, so layout can ask on every pass. Empty for non-radial specs.
    pub fn placements(&self, spec_json: &str, canvas: Canvas) -> Value {
        match parse_spec(spec_json).and_then(|spec| compile_with(spec, &self.evidence, canvas, false)) {
            Ok(compiled) => {
                let positions: Vec<Value> = compiled
                    .positions
                    .iter()
                    .flatten()
                    .enumerate()
                    .filter(|(ix, _)| compiled.nodes[*ix].included)
                    .map(|(ix, point)| json!([self.evidence.repos[ix].id, point[0], point[1]]))
                    .collect();
                success(json!({ "positions": positions }), &compiled.warnings)
            }
            Err(diagnostics) => failure(diagnostics),
        }
    }

    /// The normalized applied spec, or null.
    pub fn applied_spec(&self) -> Value {
        self.applied.as_ref().map_or(Value::Null, |compiled| compiled.spec.to_value())
    }

    fn listing(&self, postings: &Postings, field: &str) -> Value {
        let order = sorted_order(postings.len(), &mut |a, b| {
            let (x, y) = (postings.at(a), postings.at(b));
            y.members.len().cmp(&x.members.len()).then_with(|| x.display.cmp(&y.display))
        });
        let items: Vec<Value> =
            order.iter().take(MAX_LISTED).map(|index| postings.at(*index as usize)).map(|posting| json!({ "name": posting.display, "repositories": posting.members.len() })).collect();
        let mut result = json!({ "ok": true, "total": postings.len(), "truncated": postings.len() > MAX_LISTED });
        result[field] = Value::Array(items);
        result
    }

    pub fn list_languages(&self) -> Value {
        self.listing(&self.evidence.index.languages, "languages")
    }

    pub fn list_topics(&self) -> Value {
        self.listing(&self.evidence.index.topics, "topics")
    }

    fn limit(value: Option<&Value>) -> Result<usize, Diagnostics> {
        match value {
            None | Some(Value::Null) => Ok(DEFAULT_RESULTS),
            Some(value) => value.as_u64().filter(|n| (1..=MAX_RESULTS as u64).contains(n)).map(|n| n as usize).ok_or_else(|| {
                Diagnostics::one(Diagnostic::error(Code::OutOfRange, "limit", "Expected a whole number within bounds").bounds(Some(1.0), Some(MAX_RESULTS as f64)))
            }),
        }
    }

    pub fn find_repositories(&self, filter: &Value, limit: Option<&Value>) -> Value {
        let parsed = Self::limit(limit).and_then(|limit| filter_from_value(filter).map(|filter| (filter, limit)));
        let (filter, limit) = match parsed {
            Ok(parsed) => parsed,
            Err(diagnostics) => return failure(diagnostics),
        };
        let mut warnings = Diagnostics::default();
        self.evidence.check(&filter, "filter", &mut warnings);
        if warnings.has_errors() {
            return failure(warnings);
        }
        let mut matches = self.evidence.resolve(&filter);
        let total = matches.len();
        // Most starred first so a bounded answer shows the most notable matches.
        sort_with(&mut matches, &mut |a, b| self.evidence.repo(b.0).stars.cmp(&self.evidence.repo(a.0).stars).then(a.0.cmp(&b.0)));
        let repositories: Vec<Value> = matches
            .iter()
            .take(limit)
            .map(|(ix, reasons)| {
                let repo = self.evidence.repo(*ix);
                json!({ "id": repo.id, "language": repo.languages.first().map(|(name, _)| name), "stars": repo.stars, "role": repo.role.as_str(), "reasons": reasons })
            })
            .collect();
        success(json!({ "filter": filter.to_value(), "total": total, "truncated": total > limit, "repositories": repositories }), &warnings)
    }

    pub fn describe_repository(&self, id: &str) -> Value {
        let Some(ix) = self.evidence.lookup(id) else {
            return failure(Diagnostics::one(
                Diagnostic::error(Code::UnknownRepository, "id", "No loaded repository has this id; use find_repositories to list valid ids").received(id),
            ));
        };
        let repo = self.evidence.repo(ix);
        let related: Vec<Value> = {
            let mut list = self.graph().adjacency[ix.at()].clone();
            sort_with(&mut list, &mut |a, b| b.1.total_cmp(&a.1).then(a.0.cmp(&b.0)));
            list.iter().take(MAX_MEMBERS_REPORTED).map(|(other, weight)| json!({ "id": self.evidence.repo(*other).id, "weight": (f64::from(*weight) * 1000.0).round() / 1000.0 })).collect()
        };
        json!({
            "ok": true,
            "diagnostics": [],
            "repository": {
                "id": repo.id,
                "languages": repo.languages.iter().map(|(name, share)| json!({ "name": name, "share": (share * 1000.0).round() / 1000.0 })).collect::<Vec<_>>(),
                "topics": repo.topics,
                "role": repo.role.as_str(),
                "role_source": "declared",
                "stars": repo.stars,
                "updated_days_before_reference": repo.updated_day.filter(|day| *day <= self.evidence.reference_day).map(|day| self.evidence.reference_day - day),
                "created_year": repo.created_year,
                "archived": repo.archived,
                "fork": repo.fork,
                "related": related,
            }
        })
    }

    /// Side-effect free: reports what a group would contain and why.
    pub fn preview_group(&self, group: &Value, limit: Option<&Value>) -> Value {
        let parsed = Self::limit(limit).and_then(|limit| group_from_value(group).map(|group| (group, limit)));
        let (group, limit) = match parsed {
            Ok(parsed) => parsed,
            Err(diagnostics) => return failure(diagnostics),
        };
        let mut warnings = Diagnostics::default();
        self.evidence.check(&group.filter, "group.match", &mut warnings);
        if warnings.has_errors() {
            return failure(warnings);
        }
        let members = self.evidence.resolve(&group.filter);
        if members.is_empty() {
            warnings.push(Diagnostic::warning(Code::EmptyGroup, "group.match", "This group matches no repositories"));
        }
        success(
            json!({
                "group": { "id": group.id, "label": group.label, "placement": group.placement.map(|p| p.as_str()), "match": group.filter.to_value() },
                "total": members.len(),
                "truncated": members.len() > limit,
                "members": members.iter().take(limit).map(|(ix, reasons)| json!({ "id": self.evidence.repo(*ix).id, "reasons": reasons })).collect::<Vec<_>>(),
            }),
            &warnings,
        )
    }

    /// Single dispatch for the published tool definitions. Never mutates.
    pub fn call_tool(&self, name: &str, arguments_json: &str) -> Value {
        if arguments_json.len() > MAX_SPEC_BYTES {
            return failure(Diagnostics::one(Diagnostic::error(Code::SpecTooLarge, "", "Tool arguments exceed the size limit").bounds(None, Some(MAX_SPEC_BYTES as f64))));
        }
        let arguments = if arguments_json.trim().is_empty() {
            json!({})
        } else {
            match RawConstellationSpec::from_json(arguments_json) {
                Ok(raw) => raw.0,
                Err(diagnostics) => return failure(diagnostics),
            }
        };
        let Value::Object(fields) = &arguments else {
            return failure(Diagnostics::one(Diagnostic::error(Code::InvalidType, "", "Tool arguments must be an object").allowed(&["object"])));
        };
        let missing = |field: &str| failure(Diagnostics::one(Diagnostic::error(Code::MissingField, field, "Field is required")));
        let spec_text = |value: &Value| serde_json::to_string(value).unwrap_or_default();
        match name {
            "list_languages" => self.list_languages(),
            "list_topics" => self.list_topics(),
            "find_repositories" => fields.get("filter").map_or_else(|| missing("filter"), |filter| self.find_repositories(filter, fields.get("limit"))),
            "describe_repository" => match fields.get("id") {
                Some(Value::String(id)) => self.describe_repository(id),
                Some(_) => failure(Diagnostics::one(Diagnostic::error(Code::InvalidType, "id", "Expected string").allowed(&["string"]))),
                None => missing("id"),
            },
            "preview_group" => fields.get("group").map_or_else(|| missing("group"), |group| self.preview_group(group, fields.get("limit"))),
            "validate_spec" => fields.get("spec").map_or_else(|| missing("spec"), |spec| self.validate(&spec_text(spec))),
            "compile_spec" => fields.get("spec").map_or_else(|| missing("spec"), |spec| self.compile(&spec_text(spec), Canvas::default())),
            _ => failure(Diagnostics::one(Diagnostic::error(Code::UnknownTool, "", "Unknown tool").allowed(&TOOL_NAMES).received(name))),
        }
    }

    pub fn summary(&self) -> Value {
        json!({
            "engine_version": ENGINE_VERSION,
            "generation": self.generation,
            "repositories": self.evidence.repos.len(),
            "languages": self.evidence.index.languages.len(),
            "topics": self.evidence.index.topics.len(),
            "relationships": self.graph().edges.len(),
            "reference_day": self.evidence.reference_day,
            "applied": self.applied.is_some(),
        })
    }
}
