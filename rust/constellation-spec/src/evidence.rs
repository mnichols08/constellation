//! Repository evidence, retained lookup indexes, and explainable filter matching.
//! Built once per evidence load; queries never rescan to rebuild topology.
use crate::diagnostics::{clip, Code, Diagnostic, Diagnostics};
use crate::model::{fold, sort_with, Filter, Role, MAX_REPOSITORY_ID, MAX_TEXT};
use serde::Serialize;
use serde_json::{Map, Value};

pub const MAX_EVIDENCE_BYTES: usize = 4 * 1024 * 1024;
pub const MAX_REPOSITORIES: usize = 2048;
pub const MAX_LANGUAGES_PER_REPOSITORY: usize = 64;
pub const MAX_TOPICS_PER_REPOSITORY: usize = 64;
pub const MAX_REASONS: usize = 6;
const MAX_DAY: i32 = 2_932_896;

/// Dense index of a repository inside one loaded evidence set.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
pub struct RepoIx(pub u32);

impl RepoIx {
    pub fn at(self) -> usize {
        self.0 as usize
    }
}

#[derive(Clone, Debug)]
pub struct Repo {
    pub id: String,
    pub key: String,
    /// (display name, share 0..=1), largest share first.
    pub languages: Vec<(String, f64)>,
    /// Folded, sorted, unique.
    pub topics: Vec<String>,
    pub role: Role,
    pub stars: u32,
    pub updated_day: Option<i32>,
    pub created_year: Option<i32>,
    pub archived: bool,
    pub fork: bool,
    /// (language posting index, share), sorted by index. Filled when the index is built.
    pub language_ids: Vec<(u32, f64)>,
    /// Topic posting indices, sorted.
    pub topic_ids: Vec<u32>,
}

pub struct Posting {
    pub key: String,
    pub display: String,
    pub members: Vec<RepoIx>,
}

/// Inverted index sorted by folded key; lookups are binary searches.
#[derive(Default)]
pub struct Postings {
    entries: Vec<Posting>,
}

impl Postings {
    fn build(mut triples: Vec<(String, String, RepoIx)>) -> Self {
        sort_with(&mut triples, &mut |a, b| a.0.cmp(&b.0).then(a.2.cmp(&b.2)));
        let mut entries: Vec<Posting> = Vec::new();
        for (key, display, ix) in triples {
            match entries.last_mut() {
                Some(last) if last.key == key => last.members.push(ix),
                _ => entries.push(Posting { key, display, members: vec![ix] }),
            }
        }
        Self { entries }
    }
    pub fn position(&self, key: &str) -> Option<u32> {
        self.entries.binary_search_by(|entry| entry.key.as_str().cmp(key)).ok().map(|at| at as u32)
    }
    pub fn get(&self, key: &str) -> Option<&Posting> {
        self.position(key).map(|at| &self.entries[at as usize])
    }
    pub fn contains(&self, key: &str) -> bool {
        self.get(key).is_some()
    }
    pub fn len(&self) -> usize {
        self.entries.len()
    }
    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }
    pub fn at(&self, index: usize) -> &Posting {
        &self.entries[index]
    }
    /// A short list of real names to offer when a requested one is unknown.
    pub fn sample(&self) -> Vec<String> {
        self.entries.iter().take(24).map(|entry| entry.display.clone()).collect()
    }
}

/// Retained lookup tables. Rebuilt only when evidence is replaced.
#[derive(Default)]
pub struct Index {
    pub languages: Postings,
    pub topics: Postings,
    /// Indexed by `Role as usize`.
    pub roles: [Vec<RepoIx>; 5],
}

pub struct Evidence {
    pub reference_day: i32,
    /// Sorted by folded id, so `RepoIx` order is stable for the same input set.
    pub repos: Vec<Repo>,
    pub index: Index,
}

/// Why a repository matched. `source` separates observed repository metadata
/// from developer-declared curation.
#[derive(Clone, Debug, PartialEq, Serialize)]
pub struct Reason {
    pub kind: &'static str,
    pub detail: String,
    pub source: &'static str,
}

fn invalid(path: &str, message: &str) -> Diagnostics {
    Diagnostics::one(Diagnostic::error(Code::InvalidEvidence, path, message))
}

fn clean(name: &str) -> bool {
    !name.trim().is_empty() && name.chars().count() <= MAX_TEXT && !name.chars().any(char::is_control)
}

/// Optional whole-number field within bounds; absent and null are both `None`.
fn whole(fields: &Map<String, Value>, key: &str, min: i64, max: i64) -> Result<Option<i64>, ()> {
    match fields.get(key) {
        None | Some(Value::Null) => Ok(None),
        Some(value) => value
            .as_i64()
            .or_else(|| value.as_f64().filter(|n| n.is_finite() && n.fract() == 0.0 && n.abs() < 9.0e15).map(|n| n as i64))
            .filter(|n| (min..=max).contains(n))
            .map(Some)
            .ok_or(()),
    }
}

fn flag(fields: &Map<String, Value>, key: &str) -> Result<bool, ()> {
    match fields.get(key) {
        None | Some(Value::Null) => Ok(false),
        Some(Value::Bool(value)) => Ok(*value),
        Some(_) => Err(()),
    }
}

impl Evidence {
    pub fn from_json(text: &str) -> Result<Self, Diagnostics> {
        if text.len() > MAX_EVIDENCE_BYTES {
            return Err(Diagnostics::one(
                Diagnostic::error(Code::InvalidEvidence, "", "Evidence exceeds the size limit").bounds(None, Some(MAX_EVIDENCE_BYTES as f64)),
            ));
        }
        let raw: Value = serde_json::from_str(text).map_err(|error| invalid("", &format!("Evidence is not valid JSON (line {}, column {})", error.line(), error.column())))?;
        let Some(Value::Array(items)) = raw.get("repositories") else {
            return Err(invalid("repositories", "Evidence needs a repositories array"));
        };
        if items.len() > MAX_REPOSITORIES {
            return Err(Diagnostics::one(
                Diagnostic::error(Code::InvalidEvidence, "repositories", "Too many repositories").bounds(None, Some(MAX_REPOSITORIES as f64)),
            ));
        }
        let mut repos = Vec::with_capacity(items.len());
        let mut latest = 0;
        for (index, item) in items.iter().enumerate() {
            let fail = |field: &str, message: &str| invalid(&format!("repositories[{index}].{field}"), message);
            let Value::Object(fields) = item else {
                return Err(invalid(&format!("repositories[{index}]"), "Repository must be an object"));
            };
            let id = fields.get("id").and_then(Value::as_str).map(str::trim).unwrap_or("");
            if id.is_empty() || id.chars().count() > MAX_REPOSITORY_ID || id.chars().any(char::is_control) {
                return Err(fail("id", "Repository id must be 1-200 printable characters"));
            }
            let mut weights: Vec<(String, f64)> = Vec::new();
            match fields.get("languages") {
                None | Some(Value::Null) => {}
                Some(Value::Object(map)) if map.len() <= MAX_LANGUAGES_PER_REPOSITORY => {
                    for (name, weight) in map {
                        if !clean(name) {
                            return Err(fail("languages", "Language names must be 1-120 printable characters"));
                        }
                        let Some(weight) = weight.as_f64().filter(|w| w.is_finite() && *w >= 0.0) else {
                            return Err(fail("languages", "Language weights must be finite and non-negative"));
                        };
                        if weight > 0.0 && !weights.iter().any(|(seen, _)| fold(seen) == fold(name)) {
                            weights.push((name.trim().to_owned(), weight));
                        }
                    }
                }
                Some(_) => return Err(fail("languages", "Languages must be an object of at most 64 weights")),
            }
            if weights.is_empty() {
                if let Some(primary) = fields.get("language").and_then(Value::as_str).filter(|name| clean(name)) {
                    weights.push((primary.trim().to_owned(), 1.0));
                }
            }
            let total: f64 = weights.iter().map(|(_, weight)| weight).sum();
            let mut languages: Vec<(String, f64)> =
                weights.into_iter().map(|(name, weight)| (name, if total > 0.0 { weight / total } else { 0.0 })).collect();
            sort_with(&mut languages, &mut |a, b| b.1.total_cmp(&a.1).then_with(|| fold(&a.0).cmp(&fold(&b.0))));
            let mut topics = Vec::new();
            match fields.get("topics") {
                None | Some(Value::Null) => {}
                Some(Value::Array(list)) if list.len() <= MAX_TOPICS_PER_REPOSITORY => {
                    for topic in list {
                        let Some(topic) = topic.as_str().filter(|name| clean(name)) else {
                            return Err(fail("topics", "Topics must be 1-120 printable characters"));
                        };
                        topics.push(fold(topic));
                    }
                }
                Some(_) => return Err(fail("topics", "Topics must be a list of at most 64 names")),
            }
            sort_with(&mut topics, &mut |a, b| a.cmp(b));
            topics.dedup();
            let role = match fields.get("role") {
                None | Some(Value::Null) => Role::Unassigned,
                Some(Value::String(role)) if role.trim().is_empty() => Role::Unassigned,
                Some(Value::String(role)) => Role::parse(role.trim()).ok_or_else(|| fail("role", "Unknown showcase role"))?,
                Some(_) => return Err(fail("role", "Unknown showcase role")),
            };
            let stars = whole(fields, "stars", 0, 4_294_967_295).map_err(|()| fail("stars", "Stars must be a whole non-negative number"))?.unwrap_or(0) as u32;
            let updated_day = whole(fields, "updated_day", 0, i64::from(MAX_DAY)).map_err(|()| fail("updated_day", "Update day is out of range"))?.map(|day| day as i32);
            let created_year = whole(fields, "created_year", 1970, 9999).map_err(|()| fail("created_year", "Creation year is out of range"))?.map(|year| year as i32);
            let archived = flag(fields, "archived").map_err(|()| fail("archived", "Expected a boolean"))?;
            let fork = flag(fields, "fork").map_err(|()| fail("fork", "Expected a boolean"))?;
            latest = latest.max(updated_day.unwrap_or(0));
            repos.push(Repo { key: fold(id), id: id.to_owned(), languages, topics, role, stars, updated_day, created_year, archived, fork, language_ids: Vec::new(), topic_ids: Vec::new() });
        }
        sort_with(&mut repos, &mut |a, b| a.key.cmp(&b.key));
        if let Some(pair) = repos.windows(2).find(|pair| pair[0].key == pair[1].key) {
            return Err(Diagnostics::one(
                Diagnostic::error(Code::InvalidEvidence, "repositories", "Repository ids must be unique").received(&pair[0].id),
            ));
        }
        // Recency is measured against the evidence itself, never the wall clock.
        let reference_day = match raw.as_object().map(|fields| whole(fields, "reference_day", 0, i64::from(MAX_DAY))) {
            Some(Ok(day)) => day.map_or(latest, |day| day as i32),
            _ => return Err(invalid("reference_day", "Reference day is out of range")),
        };
        let index = Index::build(&repos);
        // Integer ids let relationship scoring compare repositories without touching strings.
        for repo in &mut repos {
            let mut ids: Vec<(u32, f64)> = repo.languages.iter().filter_map(|(name, share)| index.languages.position(&fold(name)).map(|at| (at, *share))).collect();
            sort_with(&mut ids, &mut |a, b| a.0.cmp(&b.0));
            repo.language_ids = ids;
            // Topics and postings are both sorted by the same key, so ids stay sorted.
            repo.topic_ids = repo.topics.iter().filter_map(|topic| index.topics.position(topic)).collect();
        }
        Ok(Self { reference_day, repos, index })
    }

    pub fn repo(&self, ix: RepoIx) -> &Repo {
        &self.repos[ix.at()]
    }

    /// Repositories are sorted by folded id, so lookup is a binary search.
    pub fn lookup(&self, id: &str) -> Option<RepoIx> {
        let key = fold(id);
        self.repos.binary_search_by(|repo| repo.key.as_str().cmp(&key)).ok().map(|at| RepoIx(at as u32))
    }

    fn age(&self, repo: &Repo) -> Option<i32> {
        repo.updated_day.filter(|day| *day <= self.reference_day).map(|day| self.reference_day - day)
    }

    /// Reasons this repository satisfies the filter, or `None` when it does not.
    pub fn explain(&self, filter: &Filter, ix: RepoIx) -> Option<Vec<Reason>> {
        let repo = self.repo(ix);
        let observed = |kind: &'static str, detail: String| Some(vec![Reason { kind, detail, source: "observed" }]);
        match filter {
            Filter::Language(wanted) => {
                let key = fold(wanted);
                let (name, share) = repo.languages.iter().find(|(name, _)| fold(name) == key)?;
                observed("language", format!("{name} is {}% of the code", (share * 100.0).round().max(1.0)))
            }
            Filter::Topic(wanted) => {
                repo.topics.binary_search(&fold(wanted)).ok()?;
                observed("topic", format!("has topic {}", fold(wanted)))
            }
            Filter::Role(wanted) => (repo.role == *wanted).then(|| {
                vec![Reason {
                    kind: "role",
                    detail: if *wanted == Role::Unassigned { "no curated role".into() } else { format!("curated role: {}", wanted.as_str()) },
                    source: "declared",
                }]
            }),
            Filter::Repository(wanted) => {
                if repo.key != fold(wanted) {
                    return None;
                }
                observed("repository", "named explicitly".into())
            }
            Filter::Stars { min, max } => {
                if min.is_some_and(|min| repo.stars < min) || max.is_some_and(|max| repo.stars > max) {
                    return None;
                }
                observed("stars", format!("{} stars", repo.stars))
            }
            Filter::Updated { within_days, older_than_days } => {
                let age = self.age(repo)?;
                if within_days.is_some_and(|days| age as i64 > i64::from(days)) || older_than_days.is_some_and(|days| (age as i64) < i64::from(days)) {
                    return None;
                }
                observed("updated", format!("updated {age} days before the reference date"))
            }
            Filter::Archived(wanted) => {
                if repo.archived != *wanted {
                    return None;
                }
                observed("archived", if *wanted { "archived".into() } else { "not archived".into() })
            }
            Filter::Fork(wanted) => {
                if repo.fork != *wanted {
                    return None;
                }
                observed("fork", if *wanted { "a fork".into() } else { "not a fork".into() })
            }
            Filter::Any(items) => {
                let mut reasons: Vec<Reason> = items.iter().filter_map(|item| self.explain(item, ix)).flatten().collect();
                if reasons.is_empty() {
                    return None;
                }
                reasons.truncate(MAX_REASONS);
                Some(reasons)
            }
            Filter::All(items) => {
                let mut reasons = Vec::new();
                for item in items {
                    reasons.extend(self.explain(item, ix)?);
                }
                reasons.truncate(MAX_REASONS);
                Some(reasons)
            }
            Filter::Not(inner) => match self.explain(inner, ix) {
                Some(_) => None,
                None => observed("not", "does not match the excluded condition".into()),
            },
        }
    }

    /// Indexed candidates for a filter, or `None` when a full pass is needed.
    fn candidates(&self, filter: &Filter) -> Option<Vec<RepoIx>> {
        match filter {
            Filter::Language(wanted) => Some(self.index.languages.get(&fold(wanted)).map(|posting| posting.members.clone()).unwrap_or_default()),
            Filter::Topic(wanted) => Some(self.index.topics.get(&fold(wanted)).map(|posting| posting.members.clone()).unwrap_or_default()),
            Filter::Role(wanted) => Some(self.index.roles[*wanted as usize].clone()),
            Filter::Repository(wanted) => Some(self.lookup(wanted).into_iter().collect()),
            // The smallest indexed child bounds the work for a conjunction.
            Filter::All(items) => {
                let mut best: Option<Vec<RepoIx>> = None;
                for candidate in items.iter().filter_map(|item| self.candidates(item)) {
                    if best.as_ref().is_none_or(|current| candidate.len() < current.len()) {
                        best = Some(candidate);
                    }
                }
                best
            }
            _ => None,
        }
    }

    /// Every matching repository with its reasons, in stable `RepoIx` order.
    pub fn resolve(&self, filter: &Filter) -> Vec<(RepoIx, Vec<Reason>)> {
        let pool = self.candidates(filter).unwrap_or_else(|| (0..self.repos.len() as u32).map(RepoIx).collect());
        pool.into_iter().filter_map(|ix| self.explain(filter, ix).map(|reasons| (ix, reasons))).collect()
    }

    /// Check a filter's references against loaded evidence. Unknown repository
    /// ids are errors; languages and topics nobody uses are warnings.
    pub fn check(&self, filter: &Filter, path: &str, out: &mut Diagnostics) {
        let at = |key: &str| if path.is_empty() { key.to_owned() } else { format!("{path}.{key}") };
        match filter {
            Filter::Language(wanted) if !self.index.languages.contains(&fold(wanted)) => out.push(
                Diagnostic::warning(Code::UnknownLanguage, &at("language"), "No repository uses this language").allowed_owned(self.index.languages.sample()).received(wanted),
            ),
            Filter::Topic(wanted) if !self.index.topics.contains(&fold(wanted)) => out.push(
                Diagnostic::warning(Code::UnknownTopic, &at("topic"), "No repository has this topic").allowed_owned(self.index.topics.sample()).received(wanted),
            ),
            Filter::Repository(wanted) if self.lookup(wanted).is_none() => out.push(
                Diagnostic::error(Code::UnknownRepository, &at("repository"), "No loaded repository has this id; use find_repositories to list valid ids")
                    .received(&clip(wanted, 80)),
            ),
            Filter::Any(items) => items.iter().enumerate().for_each(|(i, item)| self.check(item, &format!("{}[{i}]", at("any")), out)),
            Filter::All(items) => items.iter().enumerate().for_each(|(i, item)| self.check(item, &format!("{}[{i}]", at("all")), out)),
            Filter::Not(inner) => self.check(inner, &at("not"), out),
            _ => {}
        }
    }
}

impl Index {
    fn build(repos: &[Repo]) -> Self {
        let (mut languages, mut topics) = (Vec::new(), Vec::new());
        let mut roles: [Vec<RepoIx>; 5] = Default::default();
        for (position, repo) in repos.iter().enumerate() {
            let ix = RepoIx(position as u32);
            for (name, _) in &repo.languages {
                languages.push((fold(name), name.clone(), ix));
            }
            for topic in &repo.topics {
                topics.push((topic.clone(), topic.clone(), ix));
            }
            roles[repo.role as usize].push(ix);
        }
        Self { languages: Postings::build(languages), topics: Postings::build(topics), roles }
    }
}
