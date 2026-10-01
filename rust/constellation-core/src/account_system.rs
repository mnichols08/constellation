use crate::profile_evidence;
use serde::{Deserialize, Serialize};
use std::collections::{BTreeMap, BTreeSet};

const MAX_REPOSITORIES: usize = 100;
const MAX_RELATIONS: usize = 2048;
const MAX_IDENTITIES: usize = 120;

#[derive(Deserialize)]
pub struct Input {
    pub center: Identity,
    pub repositories: Vec<Repository>,
    #[serde(default)] pub contributors: Vec<Contributor>,
    #[serde(default = "default_width")] pub width: f64,
    #[serde(default = "default_height")] pub height: f64,
    #[serde(default = "default_per_planet")] pub max_per_planet: usize,
    #[serde(default)] pub grouping: String,
    #[serde(default)] pub seed: String,
}
fn default_width() -> f64 { 900.0 }
fn default_height() -> f64 { 560.0 }
fn default_per_planet() -> usize { 4 }

#[derive(Clone, Deserialize, Serialize)]
pub struct Identity { pub id: String, pub login: String, #[serde(rename="type")] pub kind: String }

#[derive(Clone, Deserialize)]
pub struct Repository {
    pub id: String,
    #[serde(default)] pub languages: BTreeMap<String, f64>,
    #[serde(default)] pub language_names: Vec<String>,
    #[serde(default)] pub topics: Vec<String>,
    #[serde(default)] pub role: String,
    #[serde(default)] pub position: Option<[f64; 2]>,
}

#[derive(Clone, Deserialize)]
pub struct Contributor {
    pub id: String,
    pub login: String,
    #[serde(default)] pub actor_type: String,
    pub repository: String,
    #[serde(default)] pub contributions: Option<u64>,
    #[serde(default)] pub pull_requests: Option<u64>,
    #[serde(default)] pub source: String,
}

#[derive(Serialize)]
pub struct Output {
    pub version: u8,
    pub center: Identity,
    pub planets: Vec<Planet>,
    pub moons: Vec<Moon>,
    pub relations: Vec<Relation>,
    pub coverage: Coverage,
}
#[derive(Serialize)] pub struct Planet { pub id: String, pub position: [f64;2], pub technical_region: Option<String> }
#[derive(Serialize)] pub struct Moon { pub id: String, pub login: String, pub actor_type: String, pub parent: String, pub offset: [f64;2] }
#[derive(Serialize)] pub struct Relation { pub identity: String, pub repository: String, pub source: String, pub contributions: Option<u64>, pub pull_requests: Option<u64>, pub primary: bool }
#[derive(Serialize)] pub struct Coverage { pub observed_identities: usize, pub displayed_identities: usize, pub suppressed_identities: usize }

fn hash(value: &str) -> u64 {
    value.bytes().fold(1469598103934665603u64, |value, byte| (value ^ byte as u64).wrapping_mul(1099511628211))
}
fn valid_id(value: &str) -> bool { !value.is_empty() && value.len() <= 512 && !value.chars().any(char::is_control) }

pub fn compute(input: Input) -> Result<Output, String> {
    if !["user", "organization"].contains(&input.center.kind.as_str()) || !valid_id(&input.center.id) || input.center.id == "" {
        return Err("Center must have a typed stable identity".into());
    }
    if input.repositories.len() > MAX_REPOSITORIES || input.contributors.len() > MAX_RELATIONS { return Err("Account system exceeds bounded input limits".into()); }
    if !(320.0..=100000.0).contains(&input.width) || !(120.0..=100000.0).contains(&input.height) || input.max_per_planet > 12 { return Err("Invalid account-system viewport or moon limit".into()); }
    let mut ids = BTreeSet::new();
    for repository in &input.repositories {
        if !valid_id(&repository.id) || !ids.insert(repository.id.clone()) || repository.id == input.center.id { return Err("Repository identities must be unique and distinct from center".into()); }
        if let Some(position) = repository.position { if !position.iter().all(|v| v.is_finite()) { return Err("Manual positions must be finite".into()); } }
    }
    let repository_ids: BTreeSet<_> = input.repositories.iter().map(|repo| repo.id.clone()).collect();
    let profile = profile_evidence::analyze(profile_evidence::Input { repositories: input.repositories.iter().map(|repo| profile_evidence::Repository { name: repo.id.clone(), languages: repo.languages.clone(), language_names: repo.language_names.clone(), topics: repo.topics.clone(), role: repo.role.clone() }).collect() })?;
    let dimensions = profile_evidence::DIMENSIONS;
    let affinity: BTreeMap<_,_> = profile.repositories.into_iter().map(|repo| (repo.repository, repo.dimensions)).collect();
    let cx = input.width / 2.0; let cy = input.height / 2.0;
    let rx = (input.width * 0.39).min(360.0); let ry = (input.height * 0.34).min(190.0);
    let count = input.repositories.len().max(1) as f64;
    let phase = (hash(&input.seed) % 6283) as f64 / 1000.0;
    let mut planets = Vec::new();
    for (index, repository) in input.repositories.iter().enumerate() {
        let scores = affinity.get(&repository.id).cloned().unwrap_or_else(|| vec![0.0; 6]);
        let strongest = scores.iter().enumerate().filter(|(_,v)| **v > 0.0).max_by(|a,b| a.1.total_cmp(b.1).then_with(|| b.0.cmp(&a.0))).map(|(i,_)| i);
        let base = if input.grouping == "technical" { strongest.map(|i| phase + i as f64 * std::f64::consts::TAU / 6.0).unwrap_or(phase + index as f64 * std::f64::consts::TAU / count) } else { phase + index as f64 * std::f64::consts::TAU / count };
        let lane = 0.72 + (index % 3) as f64 * 0.13;
        let position = repository.position.unwrap_or([cx + base.cos()*rx*lane, cy + base.sin()*ry*lane]);
        planets.push(Planet { id: repository.id.clone(), position, technical_region: strongest.map(|i| dimensions[i].to_string()) });
    }
    let mut evidence: BTreeMap<String, Vec<Contributor>> = BTreeMap::new();
    for relation in input.contributors {
        if !valid_id(&relation.id) || relation.id == input.center.id || !repository_ids.contains(&relation.repository) { continue; }
        evidence.entry(relation.id.clone()).or_default().push(relation);
    }
    if evidence.len() > MAX_IDENTITIES { evidence = evidence.into_iter().take(MAX_IDENTITIES).collect(); }
    for values in evidence.values_mut() { values.sort_by(|a,b| b.contributions.cmp(&a.contributions).then_with(|| b.pull_requests.cmp(&a.pull_requests)).then_with(|| a.repository.cmp(&b.repository))); }
    let mut per_parent: BTreeMap<String, usize> = BTreeMap::new();
    let positions: BTreeMap<_,_> = planets.iter().map(|p| (p.id.clone(), p.position)).collect();
    let mut moons = Vec::new(); let mut relations = Vec::new();
    let mut ordered: Vec<_> = evidence.into_iter().collect();
    ordered.sort_by(|a,b| b.1[0].contributions.cmp(&a.1[0].contributions).then_with(|| b.1[0].pull_requests.cmp(&a.1[0].pull_requests)).then_with(|| a.0.cmp(&b.0)));
    for (identity, values) in ordered.iter() {
        let primary = &values[0]; let used = per_parent.entry(primary.repository.clone()).or_default();
        if *used >= input.max_per_planet { continue; }
        let ordinal = *used; *used += 1;
        let angle = phase + hash(identity) as f64 / u64::MAX as f64 * std::f64::consts::TAU;
        let distance = 24.0 + ordinal as f64 * 7.0;
        moons.push(Moon { id: identity.clone(), login: primary.login.clone(), actor_type: if ["User","Bot","Organization"].contains(&primary.actor_type.as_str()) { primary.actor_type.clone() } else { "Unknown".into() }, parent: primary.repository.clone(), offset: [angle.cos()*distance, angle.sin()*distance] });
        for relation in values.iter().take(8) { relations.push(Relation { identity: identity.clone(), repository: relation.repository.clone(), source: relation.source.clone(), contributions: relation.contributions, pull_requests: relation.pull_requests, primary: relation.repository == primary.repository }); }
    }
    let displayed = moons.len(); let observed = ordered.len();
    let _ = positions;
    Ok(Output { version: 1, center: input.center, planets, moons, relations, coverage: Coverage { observed_identities: observed, displayed_identities: displayed, suppressed_identities: observed.saturating_sub(displayed) } })
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test] fn shared_identity_has_one_parent_and_secondary_relation() {
        let input = Input { center: Identity{id:"account:user:owner".into(),login:"owner".into(),kind:"user".into()}, repositories: vec![Repository{id:"owner/a".into(),languages:BTreeMap::new(),language_names:vec![],topics:vec![],role:"".into(),position:None},Repository{id:"owner/b".into(),languages:BTreeMap::new(),language_names:vec![],topics:vec![],role:"".into(),position:None}], contributors: vec![Contributor{id:"actor:user:sam".into(),login:"sam".into(),actor_type:"User".into(),repository:"owner/a".into(),contributions:Some(2),pull_requests:None,source:"contributors".into()},Contributor{id:"actor:user:sam".into(),login:"sam".into(),actor_type:"User".into(),repository:"owner/b".into(),contributions:Some(5),pull_requests:None,source:"contributors".into()}], width:900.,height:560.,max_per_planet:4,grouping:"technical".into(),seed:"x".into() };
        let result=compute(input).unwrap(); assert_eq!(result.moons.len(),1); assert_eq!(result.moons[0].parent,"owner/b"); assert_eq!(result.relations.len(),2);
    }
}
