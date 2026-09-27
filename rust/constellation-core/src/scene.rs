use crate::{graph::Graph, identity};
use serde::{Deserialize, Serialize};
use std::{cmp::Ordering, collections::BTreeSet};

thread_local! {
    // Manual dragging changes edge distances, not the settled base layout.
    static FORCE_LAYOUT: std::cell::RefCell<Option<(String, Vec<[f64; 2]>)>> = const { std::cell::RefCell::new(None) };
}

#[derive(Deserialize)]
pub struct Repository {
    name: String,
    group: String,
    languages: Vec<String>,
    topics: Vec<String>,
    #[serde(default)]
    members: Vec<String>,
    #[serde(default)]
    kind: String,
    #[serde(default)]
    hidden: bool,
    position: Option<[f64; 2]>,
}

#[derive(Deserialize)]
pub struct Input {
    account: String,
    repos: Vec<Repository>,
    compact: bool,
    arrangement: String,
    all: bool,
    basis: String,
    #[serde(default)]
    ring_rotation: f64,
    #[serde(default)]
    ring_rotations: Option<[f64; 4]>,
}

#[derive(Serialize)]
pub struct Edge {
    from: usize,
    to: usize,
    languages: Vec<String>,
    topics: Vec<String>,
    members: Vec<String>,
    primary: bool,
    #[serde(skip)]
    distance: f64,
}

#[derive(Serialize)]
pub struct Scene {
    positions: Vec<[f64; 2]>,
    edges: Vec<Edge>,
    total: usize,
}

// Match the existing account-seeded field, including JS's first UTF-16 unit.
fn hash(value: &str) -> u32 {
    let mut n = value.chars().fold(7u32, |n, ch| {
        let mut units = [0; 2];
        n.wrapping_mul(31)
            .wrapping_add(ch.encode_utf16(&mut units)[0] as u32)
    });
    n = (n ^ (n >> 16)).wrapping_mul(0x45d9f3b);
    n = (n ^ (n >> 16)).wrapping_mul(0x45d9f3b);
    n ^ (n >> 16)
}

fn overlap(a: &[String], b: &[String]) -> Vec<String> {
    a.iter()
        .filter(|value| b.contains(value))
        .cloned()
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn key(edge: &Edge) -> String {
    format!("{}:{}", edge.from, edge.to)
}
fn weight(edge: &Edge) -> usize {
    edge.languages.len() + edge.topics.len() + edge.members.len()
}
fn root(parent: &[usize], mut index: usize) -> usize {
    while parent[index] != index {
        index = parent[index];
    }
    index
}

pub fn compute(input: Input) -> Result<Scene, String> {
    let n = input.repos.len();
    if n > if input.basis == "membership" {
        256
    } else {
        100
    } {
        return Err("At most 100 repositories are supported".into());
    }
    if !["field", "orbital", "force", "rings"].contains(&input.arrangement.as_str()) {
        return Err("Unknown arrangement".into());
    }
    if !["languages", "topics", "both", "repositories", "membership"]
        .contains(&input.basis.as_str())
    {
        return Err("Unknown connection basis".into());
    }
    let height = if input.compact { 280.0 } else { 560.0 };
    let center = if input.compact { 126.0 } else { 270.0 };
    let spread = if input.compact { 88.0 } else { 192.0 };
    let phase = (hash(&input.account) % 628) as f64 / 100.0;
    let rings = identity::generate(&input.account, 0).map_err(str::to_owned)?;
    let ring_points = if input.arrangement == "rings" {
        identity::rotated_points(
            &input.account,
            n,
            &input.ring_rotations.unwrap_or([input.ring_rotation; 4]),
        )
        .map_err(str::to_owned)?
    } else {
        vec![]
    };
    let mut positions: Vec<[f64; 2]> = (0..n)
        .map(|i| {
            if input.arrangement == "rings" {
                return [
                    450.0 + (ring_points[i * 3] - 240.0) * 368.0 / 172.0,
                    center + (ring_points[i * 3 + 1] - 240.0) * spread / 172.0,
                ];
            }
            let (angle, radius) = if input.arrangement == "orbital" {
                let ring = i % 4;
                let count = (n - 1 - ring) / 4 + 1;
                (
                    rings[3 + ring * 22].to_radians()
                        + (i / 4) as f64 * std::f64::consts::TAU / count as f64,
                    rings[2 + ring * 22] / 172.0,
                )
            } else {
                (
                    i as f64 * 2.399963 + phase,
                    if n == 1 {
                        0.0
                    } else {
                        ((i as f64 + 0.6) / n as f64).sqrt()
                    },
                )
            };
            [
                450.0 + angle.cos() * radius * 368.0,
                center + angle.sin() * radius * spread,
            ]
        })
        .collect();
    let mut candidates = Vec::new();
    for a in 0..n {
        for b in a + 1..n {
            let languages = if input.basis == "topics"
                || input.basis == "repositories"
                || input.basis == "membership"
            {
                vec![]
            } else {
                overlap(&input.repos[a].languages, &input.repos[b].languages)
            };
            let topics = if input.basis == "languages"
                || input.basis == "repositories"
                || input.basis == "membership"
            {
                vec![]
            } else {
                overlap(&input.repos[a].topics, &input.repos[b].topics)
            };
            let members = if input.basis == "membership" {
                let (left, right) = (&input.repos[a], &input.repos[b]);
                let repository = if left.kind == "repository"
                    && right.kind != "repository"
                    && right.members.contains(&left.name)
                {
                    Some(&left.name)
                } else if right.kind == "repository"
                    && left.kind != "repository"
                    && left.members.contains(&right.name)
                {
                    Some(&right.name)
                } else {
                    None
                };
                repository.into_iter().cloned().collect()
            } else if input.basis == "repositories" {
                overlap(&input.repos[a].members, &input.repos[b].members)
            } else {
                vec![]
            };
            if !languages.is_empty() || !topics.is_empty() || !members.is_empty() {
                candidates.push(Edge {
                    from: a,
                    to: b,
                    languages,
                    topics,
                    members,
                    primary: false,
                    distance: 0.0,
                });
            }
        }
    }
    if input.arrangement == "force" {
        let pairs: Vec<u32> = candidates
            .iter()
            .flat_map(|e| [e.from as u32, e.to as u32])
            .collect();
        let cache_key = format!("{}:{n}:{}:{pairs:?}", input.account, input.compact);
        let cached = FORCE_LAYOUT.with(|cache| {
            cache
                .borrow()
                .as_ref()
                .filter(|(key, _)| key == &cache_key)
                .map(|(_, positions)| positions.clone())
        });
        if let Some(cached) = cached {
            positions = cached;
        } else {
            let mut graph = Graph::new(n as u32, &pairs, 800.0, 440.0).map_err(str::to_owned)?;
            for (i, node) in graph.nodes.iter_mut().enumerate() {
                node.x = positions[i][0] - 50.0;
                node.y = (positions[i][1] - center) / spread * 192.0 + 220.0;
            }
            // Settle once per data/layout change. CSS owns animation, no frame loop.
            for _ in 0..120 {
                graph.tick(1.0 / 60.0);
            }
            for (position, node) in positions.iter_mut().zip(graph.nodes.iter()) {
                *position = [node.x + 50.0, center + (node.y - 220.0) * spread / 220.0];
            }
            FORCE_LAYOUT.with(|cache| *cache.borrow_mut() = Some((cache_key, positions.clone())));
        }
    }
    for (position, repo) in positions.iter_mut().zip(&input.repos) {
        if let Some([x, y]) = repo.position {
            if !x.is_finite() || !y.is_finite() {
                return Err(format!("Invalid position for {}", repo.name));
            }
            *position = [x.clamp(32.0, 868.0), y.clamp(28.0, height - 60.0)];
        }
    }
    candidates.retain(|edge| !input.repos[edge.from].hidden && !input.repos[edge.to].hidden);
    for edge in &mut candidates {
        edge.distance = (positions[edge.from][0] - positions[edge.to][0]).powi(2)
            + (positions[edge.from][1] - positions[edge.to][1]).powi(2);
    }
    let mut selected = BTreeSet::new();
    if input.all || input.basis == "membership" {
        selected.extend(0..candidates.len());
    } else {
        for i in 0..n {
            let mut adjacent: Vec<_> = candidates
                .iter()
                .enumerate()
                .filter(|(_, e)| e.from == i || e.to == i)
                .collect();
            adjacent.sort_by(|(_, a), (_, b)| {
                let cross = |e: &Edge| input.repos[e.from].group != input.repos[e.to].group;
                weight(b)
                    .cmp(&weight(a))
                    .then(cross(b).cmp(&cross(a)))
                    .then(
                        a.distance
                            .partial_cmp(&b.distance)
                            .unwrap_or(Ordering::Equal),
                    )
                    .then(key(a).cmp(&key(b)))
            });
            selected.extend(adjacent.into_iter().take(4).map(|(i, _)| i));
        }
    }
    let total = candidates.len();
    let mut edges: Vec<_> = candidates
        .into_iter()
        .enumerate()
        .filter(|(i, _)| selected.contains(i))
        .map(|(_, e)| e)
        .collect();
    edges.sort_by(|a, b| {
        a.distance
            .total_cmp(&b.distance)
            .then(weight(b).cmp(&weight(a)))
            .then(key(a).cmp(&key(b)))
    });
    let mut parent: Vec<_> = (0..n).collect();
    for edge in &mut edges {
        let (a, b) = (root(&parent, edge.from), root(&parent, edge.to));
        if a != b {
            edge.primary = true;
            parent[a] = b;
        }
    }
    edges.sort_by_key(|edge| (edge.primary, key(edge)));
    Ok(Scene {
        positions,
        edges,
        total,
    })
}

#[cfg(test)]
mod tests {
    use super::*;
    fn input(arrangement: &str) -> Input {
        Input {
            account: "octocat".into(),
            compact: true,
            arrangement: arrangement.into(),
            all: true,
            basis: "both".into(),
            ring_rotation: 0.0,
            ring_rotations: None,
            repos: (0..16)
                .map(|i| Repository {
                    name: i.to_string(),
                    group: "Rust".into(),
                    languages: vec!["Rust".into()],
                    topics: vec![],
                    members: vec![],
                    kind: "repository".into(),
                    hidden: false,
                    position: None,
                })
                .collect(),
        }
    }
    #[test]
    fn layouts_are_deterministic_bounded_and_preserve_manual_positions() {
        for arrangement in ["field", "orbital", "force", "rings"] {
            let a = compute(input(arrangement)).unwrap();
            let b = compute(input(arrangement)).unwrap();
            assert_eq!(a.positions, b.positions);
            assert_eq!(a.total, 120);
            assert_eq!(a.edges.iter().filter(|e| e.primary).count(), 15);
            assert!(a
                .positions
                .iter()
                .all(|p| (32.0..=868.0).contains(&p[0]) && (28.0..=220.0).contains(&p[1])));
            let mut manual = input(arrangement);
            manual.repos[0].position = Some([200.0, 100.0]);
            assert_eq!(compute(manual).unwrap().positions[0], [200.0, 100.0]);
        }
    }
    #[test]
    fn empty_single_and_disconnected_graphs_work() {
        for count in [0, 1, 2, 3] {
            let mut data = input("orbital");
            data.repos.truncate(count);
            for repo in &mut data.repos {
                repo.languages.clear();
            }
            let result = compute(data).unwrap();
            assert_eq!(result.positions.len(), count);
            assert!(result.edges.is_empty());
        }
    }
}
