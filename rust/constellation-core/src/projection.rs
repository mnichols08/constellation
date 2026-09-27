use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

#[derive(Deserialize)]
pub struct Repository {
    pub id: String,
    pub languages: Vec<String>,
    pub topics: Vec<String>,
}

#[derive(Deserialize)]
pub struct Input {
    pub mode: String,
    pub repos: Vec<Repository>,
}

#[derive(Serialize)]
pub struct Node {
    pub id: String,
    pub label: String,
    pub kind: String,
    pub members: Vec<String>,
}

#[derive(Serialize)]
pub struct Projection {
    pub nodes: Vec<Node>,
    pub total: usize,
}

pub fn project(input: Input) -> Result<Projection, String> {
    let combined = input.mode == "combined";
    if !["languages", "topics", "combined"].contains(&input.mode.as_str()) {
        return Err("Nodes must represent languages, topics or combined".into());
    }
    if input.repos.len() > 100 {
        return Err("At most 100 source repositories are supported".into());
    }
    let mut groups: BTreeMap<(String, String), BTreeSet<String>> = BTreeMap::new();
    let mut repositories = Vec::new();
    for repo in input.repos {
        for (kind, categories) in [("language", repo.languages), ("topic", repo.topics)] {
            if !combined && input.mode != format!("{kind}s") {
                continue;
            }
            for label in categories {
                if !label.is_empty() {
                    groups
                        .entry((kind.into(), label))
                        .or_default()
                        .insert(repo.id.clone());
                }
            }
        }
        if combined {
            repositories.push(Node {
                id: repo.id.clone(),
                label: repo.id.clone(),
                kind: "repository".into(),
                members: vec![repo.id],
            });
        }
    }
    let total = groups.len() + repositories.len();
    let mut nodes: Vec<_> = groups
        .into_iter()
        .map(|((kind, label), members)| Node {
            id: format!("{kind}:{label}"),
            label,
            kind,
            members: members.into_iter().collect(),
        })
        .collect();
    nodes.sort_by(|a, b| {
        b.members
            .len()
            .cmp(&a.members.len())
            .then(a.label.cmp(&b.label))
            .then(a.kind.cmp(&b.kind))
    });
    nodes.truncate(if combined {
        256 - repositories.len()
    } else {
        100
    });
    nodes.extend(repositories);
    Ok(Projection { nodes, total })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn projection_deduplicates_members_and_namespaces_node_ids() {
        let output = project(Input {
            mode: "topics".into(),
            repos: vec![
                Repository {
                    id: "o/a".into(),
                    languages: vec![],
                    topics: vec!["agile".into(), "agile".into()],
                },
                Repository {
                    id: "o/b".into(),
                    languages: vec![],
                    topics: vec!["agile".into(), "good-first-issue".into()],
                },
            ],
        })
        .unwrap();
        assert_eq!(output.total, 2);
        assert_eq!(output.nodes[0].id, "topic:agile");
        assert_eq!(output.nodes[0].members, vec!["o/a", "o/b"]);
        assert_eq!(output.nodes[1].members, vec!["o/b"]);
    }
    #[test]
    fn categories_are_bounded_and_count_reports_omitted_nodes() {
        let output = project(Input {
            mode: "languages".into(),
            repos: vec![Repository {
                id: "o/a".into(),
                languages: (0..105).map(|i| format!("language-{i:03}")).collect(),
                topics: vec![],
            }],
        })
        .unwrap();
        assert_eq!(output.total, 105);
        assert_eq!(output.nodes.len(), 100);
        assert_eq!(output.nodes[0].id, "language:language-000");
    }
}
