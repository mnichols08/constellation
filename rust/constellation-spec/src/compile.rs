//! Semantic compilation: validated spec + repository evidence -> graph intent.
//!
//! The output is deterministic for the same evidence, spec, canvas and engine
//! version. It carries resolved groups with reasons, per-repository bands,
//! weighted relationship edges, ring positions for radial layouts, and the
//! existing scene options that express the rest. The spec never contains
//! coordinates; only this compiler decides what `inner` or `outer` mean.
use crate::diagnostics::{Code, Diagnostic, Diagnostics};
use crate::evidence::{Evidence, Reason, RepoIx};
use crate::model::*;
use serde_json::{json, Map, Value};
use std::f64::consts::TAU;

pub const ENGINE_VERSION: &str = env!("CARGO_PKG_VERSION");
/// Strongest relationships kept per repository.
pub const MAX_EDGES_PER_NODE: usize = 6;
pub const MAX_EDGES: usize = 8192;
pub const MIN_EDGE_WEIGHT: f64 = 0.05;
/// Focus matches that sit in the centre band; the rest go to the inner band.
pub const FOCUS_CENTER_LIMIT: usize = 6;
/// Bounds on what a JSON report lists; totals are always exact.
pub const MAX_MEMBERS_REPORTED: usize = 50;
pub const MAX_EDGES_REPORTED: usize = 256;
/// Ring radius of each placement band, as a fraction of the orbit spread.
pub const BAND_RADII: [f64; 4] = [0.38, 0.577, 0.773, 0.97];

/// Presentation facts the layout needs that are not semantic intent.
#[derive(Clone, Copy, Debug, Default, PartialEq)]
pub struct Canvas {
    pub compact: bool,
    pub round: bool,
}

pub struct CompiledGroup {
    pub id: String,
    pub label: String,
    pub placement: Option<Placement>,
    pub members: Vec<(RepoIx, Vec<Reason>)>,
}

#[derive(Clone)]
pub struct CompiledNode {
    pub band: Placement,
    pub group: Option<usize>,
    pub cluster: String,
    /// 0 is the highest ranked repository.
    pub rank: u32,
    /// False when `ranking.limit` leaves this repository out.
    pub included: bool,
}

#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Edge {
    pub a: RepoIx,
    pub b: RepoIx,
    pub weight: f32,
}

pub struct Compiled {
    pub spec: ConstellationSpec,
    pub canvas: Canvas,
    pub focus: Vec<RepoIx>,
    pub groups: Vec<CompiledGroup>,
    /// One entry per repository, in `RepoIx` order.
    pub nodes: Vec<CompiledNode>,
    pub edges: Vec<Edge>,
    /// Ring positions per repository; present only for radial layouts.
    pub positions: Option<Vec<[f64; 2]>>,
    pub warnings: Diagnostics,
}

fn round3(value: f64) -> f64 {
    (value * 1000.0).round() / 1000.0
}

/// Reference checks that need evidence but no compilation.
pub fn check_references(spec: &ConstellationSpec, evidence: &Evidence) -> Diagnostics {
    let mut out = Diagnostics::default();
    for (index, group) in spec.groups.iter().enumerate() {
        evidence.check(&group.filter, &format!("groups[{index}].match"), &mut out);
    }
    match &spec.focus {
        Some(Focus::Repository(id)) if evidence.lookup(id).is_none() => out.push(
            Diagnostic::error(Code::UnknownRepository, "focus.value", "No loaded repository has this id; use find_repositories to list valid ids").received(id),
        ),
        Some(Focus::Language(name)) if !evidence.index.languages.contains(&fold(name)) => out.push(
            Diagnostic::warning(Code::UnknownLanguage, "focus.value", "No repository uses this language").allowed_owned(evidence.index.languages.sample()).received(name),
        ),
        Some(Focus::Topic(name)) if !evidence.index.topics.contains(&fold(name)) => out.push(
            Diagnostic::warning(Code::UnknownTopic, "focus.value", "No repository has this topic").allowed_owned(evidence.index.topics.sample()).received(name),
        ),
        _ => {}
    }
    out
}

/// Relationship edges for the given repositories: bounded, weighted, deterministic.
pub fn relationship_edges(evidence: &Evidence, relationships: &[Relationship], included: &[bool]) -> Vec<Edge> {
    let strength = |basis: Basis| relationships.iter().find(|r| r.basis == basis).map_or(0.0, |r| r.strength);
    let (language, topic) = (strength(Basis::SharedLanguage), strength(Basis::SharedTopic));
    let total = language + topic;
    let count = evidence.repos.len();
    if total <= 0.0 || count < 2 {
        return Vec::new();
    }
    // Per-node shortlist of its strongest partners; memory stays O(n * K).
    let mut best: Vec<Vec<(f64, u32)>> = vec![Vec::new(); count];
    let offer = |list: &mut Vec<(f64, u32)>, weight: f64, other: u32| {
        let at = list.partition_point(|(w, o)| *w > weight || (*w == weight && *o < other));
        if at < MAX_EDGES_PER_NODE {
            list.insert(at, (weight, other));
            list.truncate(MAX_EDGES_PER_NODE);
        }
    };
    let mut seen = vec![u32::MAX; count];
    for a in 0..count {
        if !included[a] {
            continue;
        }
        let repo = &evidence.repos[a];
        let mut partners = Vec::new();
        let mut visit = |members: &[RepoIx]| {
            for member in members {
                let b = member.at();
                if b > a && included[b] && seen[b] != a as u32 {
                    seen[b] = a as u32;
                    partners.push(b);
                }
            }
        };
        if language > 0.0 {
            for (id, _) in &repo.language_ids {
                visit(&evidence.index.languages.at(*id as usize).members);
            }
        }
        if topic > 0.0 {
            for id in &repo.topic_ids {
                visit(&evidence.index.topics.at(*id as usize).members);
            }
        }
        // Indices only; the shared sort keeps this deterministic.
        let partners: Vec<usize> = sorted_order(partners.len(), &mut |x, y| partners[x].cmp(&partners[y])).into_iter().map(|at| partners[at as usize]).collect();
        for b in partners {
            let other = &evidence.repos[b];
            // Histogram intersection of language shares; Jaccard overlap of topics.
            // Both id lists are sorted, so each is one merge with no allocation.
            let mut shared_language = 0.0;
            let (mut i, mut j) = (0, 0);
            while language > 0.0 && i < repo.language_ids.len() && j < other.language_ids.len() {
                let (x, y) = (repo.language_ids[i], other.language_ids[j]);
                match x.0.cmp(&y.0) {
                    std::cmp::Ordering::Less => i += 1,
                    std::cmp::Ordering::Greater => j += 1,
                    std::cmp::Ordering::Equal => {
                        shared_language += x.1.min(y.1);
                        i += 1;
                        j += 1;
                    }
                }
            }
            let mut common = 0;
            let (mut i, mut j) = (0, 0);
            while topic > 0.0 && i < repo.topic_ids.len() && j < other.topic_ids.len() {
                match repo.topic_ids[i].cmp(&other.topic_ids[j]) {
                    std::cmp::Ordering::Less => i += 1,
                    std::cmp::Ordering::Greater => j += 1,
                    std::cmp::Ordering::Equal => {
                        common += 1;
                        i += 1;
                        j += 1;
                    }
                }
            }
            let union = repo.topic_ids.len() + other.topic_ids.len() - common;
            let shared_topic = if union > 0 { common as f64 / union as f64 } else { 0.0 };
            let weight = round3((language * shared_language + topic * shared_topic) / total);
            if weight >= MIN_EDGE_WEIGHT {
                offer(&mut best[a], weight, b as u32);
                offer(&mut best[b], weight, a as u32);
            }
        }
    }
    // Union of every shortlist, one entry per unordered pair, in (a, b) order.
    let mut pairs: Vec<(u32, u32, f64)> = Vec::new();
    for (node, list) in best.iter().enumerate() {
        for (weight, other) in list {
            pairs.push(((node as u32).min(*other), (node as u32).max(*other), *weight));
        }
    }
    sort_with(&mut pairs, &mut |x, y| (x.0, x.1).cmp(&(y.0, y.1)));
    pairs.dedup_by_key(|pair| (pair.0, pair.1));
    if pairs.len() > MAX_EDGES {
        sort_with(&mut pairs, &mut |x, y| y.2.total_cmp(&x.2).then((x.0, x.1).cmp(&(y.0, y.1))));
        pairs.truncate(MAX_EDGES);
        sort_with(&mut pairs, &mut |x, y| (x.0, x.1).cmp(&(y.0, y.1)));
    }
    pairs.into_iter().map(|(a, b, weight)| Edge { a: RepoIx(a), b: RepoIx(b), weight: weight as f32 }).collect()
}

pub fn adjacency(count: usize, edges: &[Edge]) -> Vec<Vec<(RepoIx, f32)>> {
    let mut lists = vec![Vec::new(); count];
    for edge in edges {
        lists[edge.a.at()].push((edge.b, edge.weight));
        lists[edge.b.at()].push((edge.a, edge.weight));
    }
    for list in &mut lists {
        sort_with(list, &mut |x, y| x.0.cmp(&y.0));
    }
    lists
}

pub fn compile(spec: ConstellationSpec, evidence: &Evidence, canvas: Canvas) -> Result<Compiled, Diagnostics> {
    compile_with(spec, evidence, canvas, true)
}

/// `with_edges: false` skips relationship scoring for callers that only place stars.
pub fn compile_with(spec: ConstellationSpec, evidence: &Evidence, canvas: Canvas, with_edges: bool) -> Result<Compiled, Diagnostics> {
    let mut warnings = check_references(&spec, evidence);
    if warnings.has_errors() {
        return Err(warnings);
    }
    let count = evidence.repos.len();

    // Rank every repository once; ties break on the stable folded id.
    let order = sorted_order(count, &mut |a, b| match spec.ranking.by {
        RankBy::Stars => evidence.repos[b].stars.cmp(&evidence.repos[a].stars),
        RankBy::Recency => evidence.repos[b].updated_day.cmp(&evidence.repos[a].updated_day),
        RankBy::Name => std::cmp::Ordering::Equal,
    });
    let limit = spec.ranking.limit.map_or(count, |limit| limit as usize);
    let mut nodes = vec![CompiledNode { band: Placement::Middle, group: None, cluster: String::new(), rank: 0, included: false }; count];
    for (rank, ix) in order.iter().enumerate() {
        nodes[*ix as usize].rank = rank as u32;
        nodes[*ix as usize].included = rank < limit;
    }
    let included: Vec<bool> = nodes.iter().map(|node| node.included).collect();

    let groups: Vec<CompiledGroup> = spec
        .groups
        .iter()
        .map(|group| CompiledGroup { id: group.id.clone(), label: group.label.clone(), placement: group.placement, members: evidence.resolve(&group.filter) })
        .collect();
    for (index, group) in groups.iter().enumerate() {
        if group.members.is_empty() {
            warnings.push(Diagnostic::warning(Code::EmptyGroup, &format!("groups[{index}].match"), "This group matches no repositories"));
        }
    }

    let focus: Vec<RepoIx> = match &spec.focus {
        None => Vec::new(),
        Some(Focus::Language(v)) => evidence.resolve(&Filter::Language(v.clone())).into_iter().map(|(ix, _)| ix).collect(),
        Some(Focus::Topic(v)) => evidence.resolve(&Filter::Topic(v.clone())).into_iter().map(|(ix, _)| ix).collect(),
        Some(Focus::Role(v)) => evidence.resolve(&Filter::Role(*v)).into_iter().map(|(ix, _)| ix).collect(),
        Some(Focus::Repository(v)) => evidence.lookup(v).into_iter().collect(),
        Some(Focus::Group(id)) => groups.iter().find(|g| &g.id == id).map(|g| g.members.iter().map(|(ix, _)| *ix).collect()).unwrap_or_default(),
    };
    if spec.focus.is_some() && focus.is_empty() {
        warnings.push(Diagnostic::warning(Code::EmptyFocus, "focus", "The focus matches no repositories"));
    }

    // Bands. Explicit group placement wins, then focus, then the default.
    let mut placed: Vec<Option<(usize, Placement)>> = vec![None; count];
    for (index, group) in groups.iter().enumerate() {
        let mut conflicts = 0;
        for (ix, _) in &group.members {
            let node = &mut nodes[ix.at()];
            if node.group.is_none() {
                node.group = Some(index);
            }
            let Some(placement) = group.placement else { continue };
            match placed[ix.at()] {
                None => placed[ix.at()] = Some((index, placement)),
                Some((_, earlier)) if earlier != placement => conflicts += 1,
                Some(_) => {}
            }
        }
        if conflicts > 0 {
            warnings.push(Diagnostic::warning(
                Code::OverlappingPlacement,
                &format!("groups[{index}].placement"),
                &format!("{conflicts} repositories were already placed by an earlier group and keep that placement"),
            ));
        }
    }
    let mut focus_ranked: Vec<RepoIx> = focus.iter().copied().filter(|ix| included[ix.at()] && placed[ix.at()].is_none()).collect();
    sort_with(&mut focus_ranked, &mut |x, y| nodes[x.at()].rank.cmp(&nodes[y.at()].rank));
    let directed = spec.focus.is_some() || groups.iter().any(|group| group.placement.is_some());
    let shown = included.iter().filter(|flag| **flag).count().max(1);
    for ix in 0..count {
        nodes[ix].band = match placed[ix] {
            Some((_, placement)) => placement,
            None => match focus_ranked.iter().position(|member| member.at() == ix) {
                Some(position) if position < FOCUS_CENTER_LIMIT => Placement::Center,
                Some(_) => Placement::Inner,
                None if directed => Placement::Middle,
                // No stated intent: the top quarter by rank sits inside, the last quarter outside.
                None => match nodes[ix].rank as usize * 4 / shown {
                    0 => Placement::Inner,
                    1 | 2 => Placement::Middle,
                    _ => Placement::Outer,
                },
            },
        };
    }

    // Cluster keys: similar repositories share a key and sit next to each other.
    let topic_frequency = |topic: &String| evidence.index.topics.get(topic).map_or(0, |posting| posting.members.len());
    for (ix, repo) in evidence.repos.iter().enumerate() {
        let parts: Vec<String> = spec
            .layout
            .cluster_by
            .iter()
            .map(|by| match by {
                ClusterBy::Language => repo.languages.first().map_or_else(|| "Other".to_owned(), |(name, _)| {
                    evidence.index.languages.get(&fold(name)).map_or_else(|| name.clone(), |posting| posting.display.clone())
                }),
                ClusterBy::Topic => repo
                    .topics
                    .iter()
                    .max_by(|a, b| topic_frequency(a).cmp(&topic_frequency(b)).then_with(|| b.cmp(a)))
                    .cloned()
                    .unwrap_or_else(|| "untagged".to_owned()),
                ClusterBy::Role => repo.role.as_str().to_owned(),
                ClusterBy::Group => nodes[ix].group.map_or_else(|| "ungrouped".to_owned(), |group| groups[group].label.clone()),
            })
            .collect();
        nodes[ix].cluster = parts.join(" · ");
    }

    let edges = if with_edges { relationship_edges(evidence, &spec.relationships, &included) } else { Vec::new() };

    let positions = (spec.layout.kind == LayoutKind::Radial).then(|| {
        // Larger clusters first so the dominant kind of work starts at the top.
        let size = |cluster: &str| nodes.iter().filter(|node| node.included && node.cluster == cluster).count();
        let sizes: Vec<usize> = nodes.iter().map(|node| size(&node.cluster)).collect();
        let (cx, cy) = (450.0, if canvas.compact { 126.0 } else { 270.0 });
        let spread_x = match (canvas.round, canvas.compact) {
            (true, true) => 88.0,
            (true, false) => 192.0,
            _ => 368.0,
        };
        let spread_y = if canvas.compact { 88.0 } else { 192.0 };
        let mut positions = vec![[cx, cy]; count];
        for (band, radius) in BAND_RADII.iter().enumerate() {
            let mut members: Vec<usize> = (0..count).filter(|ix| nodes[*ix].included && nodes[*ix].band as usize == band).collect();
            sort_with(&mut members, &mut |a, b| {
                let (x, y) = (&nodes[*a], &nodes[*b]);
                sizes[*b].cmp(&sizes[*a]).then_with(|| x.cluster.cmp(&y.cluster)).then(x.rank.cmp(&y.rank))
            });
            for (slot, ix) in members.iter().enumerate() {
                // Alternate bands start half a step apart so rings do not line up into spokes.
                let angle = -TAU / 4.0 + TAU * (slot as f64 + if band % 2 == 0 { 0.0 } else { 0.5 }) / members.len() as f64;
                positions[*ix] = [round3(cx + spread_x * radius * angle.cos()), round3(cy + spread_y * radius * angle.sin())];
            }
        }
        positions
    });

    Ok(Compiled { spec, canvas, focus, groups, nodes, edges, positions, warnings })
}

impl Compiled {
    /// Existing scene options that carry this intent through the normal pipeline.
    pub fn scene_options(&self) -> Value {
        let mut options = Map::new();
        let arrangement = match self.spec.layout.kind {
            LayoutKind::Radial => "rings",
            LayoutKind::Clustered => "galaxy",
            LayoutKind::SolarSystem => "solar-system",
            LayoutKind::Web => "force",
            LayoutKind::Timeline => "era-rings",
        };
        options.insert("arrangement".into(), json!(arrangement));
        if self.spec.layout.kind == LayoutKind::Radial {
            // Ring distance now carries the spec's bands, not a built-in meaning.
            options.insert("ringMeaning".into(), json!("identity"));
            options.insert("snapToRings".into(), json!(false));
        }
        let strength = |basis: Basis| self.spec.relationships.iter().find(|r| r.basis == basis).map_or(0.0, |r| r.strength);
        let (language, topic) = (strength(Basis::SharedLanguage), strength(Basis::SharedTopic));
        if language > 0.0 || topic > 0.0 {
            let (basis, weight) = if language > 0.0 && topic > 0.0 {
                ("both", if topic > language { "topics" } else if language > topic { "languages" } else { "overlap" })
            } else if topic > 0.0 {
                ("topics", "uniform")
            } else {
                ("languages", "uniform")
            };
            options.insert("connectionBasis".into(), json!(basis));
            options.insert("connectionWeight".into(), json!(weight));
        }
        options.insert("sortBy".into(), json!(match self.spec.ranking.by { RankBy::Stars => "stars", RankBy::Recency => "updated", RankBy::Name => "name" }));
        if let Some(limit) = self.spec.ranking.limit {
            options.insert("maxRepos".into(), json!(limit.min(100)));
        }
        if let Some(shape) = self.spec.style.orbit_shape {
            options.insert("orbitShape".into(), json!(shape.as_str()));
        }
        if let Some(rings) = self.spec.style.rings {
            options.insert("identityRing".into(), json!(rings));
        }
        Value::Object(options)
    }

    pub fn to_value(&self, evidence: &Evidence) -> Value {
        let id = |ix: RepoIx| evidence.repo(ix).id.as_str();
        let members = |list: &[(RepoIx, Vec<Reason>)]| -> Vec<Value> {
            list.iter().take(MAX_MEMBERS_REPORTED).map(|(ix, reasons)| json!({ "id": id(*ix), "reasons": reasons })).collect()
        };
        let groups: Vec<Value> = self
            .groups
            .iter()
            .map(|group| {
                json!({
                    "id": group.id,
                    "label": group.label,
                    "placement": group.placement.map(Placement::as_str),
                    "total": group.members.len(),
                    "truncated": group.members.len() > MAX_MEMBERS_REPORTED,
                    "members": members(&group.members),
                })
            })
            .collect();
        let nodes: Vec<Value> = self
            .nodes
            .iter()
            .enumerate()
            .filter(|(_, node)| node.included)
            .map(|(ix, node)| {
                let mut item = Map::new();
                item.insert("id".into(), json!(evidence.repos[ix].id));
                item.insert("band".into(), json!(node.band.as_str()));
                item.insert("group".into(), json!(node.group.map(|group| self.groups[group].id.as_str())));
                item.insert("cluster".into(), json!(node.cluster));
                item.insert("rank".into(), json!(node.rank));
                if let Some(positions) = &self.positions {
                    item.insert("position".into(), json!(positions[ix]));
                }
                Value::Object(item)
            })
            .collect();
        let strongest = sorted_order(self.edges.len(), &mut |x, y| self.edges[y].weight.total_cmp(&self.edges[x].weight));
        let edges: Vec<Value> = strongest
            .iter()
            .take(MAX_EDGES_REPORTED)
            .map(|at| &self.edges[*at as usize])
            .map(|edge| {
                let (a, b) = (evidence.repo(edge.a), evidence.repo(edge.b));
                let languages: Vec<&str> = a.languages.iter().filter(|(name, _)| b.languages.iter().any(|(n, _)| fold(n) == fold(name))).map(|(name, _)| name.as_str()).collect();
                let topics: Vec<&str> = a.topics.iter().filter(|t| b.topics.binary_search(t).is_ok()).map(String::as_str).collect();
                json!({ "source": a.id, "target": b.id, "weight": round3(f64::from(edge.weight)), "shared_languages": languages, "shared_topics": topics })
            })
            .collect();
        let mut bands = Map::new();
        for placement in PLACEMENTS {
            let total = self.nodes.iter().filter(|node| node.included && node.band.as_str() == *placement).count();
            bands.insert((*placement).into(), json!(total));
        }
        json!({
            "schema_version": SCHEMA_VERSION,
            "engine_version": ENGINE_VERSION,
            "spec": self.spec.to_value(),
            "repositories": { "total": evidence.repos.len(), "included": self.nodes.iter().filter(|node| node.included).count() },
            "focus": self.spec.focus.as_ref().map(|_| json!({
                "total": self.focus.len(),
                "truncated": self.focus.len() > MAX_MEMBERS_REPORTED,
                "members": self.focus.iter().take(MAX_MEMBERS_REPORTED).map(|ix| id(*ix)).collect::<Vec<_>>(),
            })),
            "groups": groups,
            "bands": bands,
            "nodes": nodes,
            "relationships": { "total": self.edges.len(), "truncated": self.edges.len() > MAX_EDGES_REPORTED, "edges": edges },
            "scene_options": self.scene_options(),
            "motion": self.spec.style.motion.map(Motion::as_str),
            "diagnostics": self.warnings.items,
        })
    }
}
