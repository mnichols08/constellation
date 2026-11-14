//! Validated ConstellationSpec domain model. Values of these types can only be
//! built by `parse`, so every instance is normalized and within bounds.
//! The spec states semantic intent only: no coordinates, forces or renderer state.
use serde_json::{json, Map, Value};

pub const SCHEMA_VERSION: u64 = 1;
pub const SUPPORTED_SCHEMA_VERSIONS: [u64; 1] = [1];

// Every externally controlled size has an explicit bound.
pub const MAX_SPEC_BYTES: usize = 262_144;
pub const MAX_GROUPS: usize = 32;
pub const MAX_RELATIONSHIPS: usize = 8;
pub const MAX_CLUSTER_BY: usize = 3;
pub const MAX_FILTER_DEPTH: usize = 4;
pub const MAX_FILTER_NODES: usize = 64;
pub const MAX_TEXT: usize = 120;
pub const MAX_ID: usize = 64;
pub const MAX_REPOSITORY_ID: usize = 200;
pub const MAX_STARS: u64 = 100_000_000;
pub const MAX_DAYS: u64 = 36_500;
pub const MAX_LIMIT: u64 = 2048;

macro_rules! vocabulary {
    ($(#[$meta:meta])* $name:ident, $all:ident { $($variant:ident => $text:literal),+ $(,)? }) => {
        $(#[$meta])*
        #[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord, Hash)]
        pub enum $name { $($variant),+ }
        pub const $all: &[&str] = &[$($text),+];
        impl $name {
            pub const fn as_str(self) -> &'static str { match self { $(Self::$variant => $text),+ } }
            pub fn parse(value: &str) -> Option<Self> { match value { $($text => Some(Self::$variant),)+ _ => None } }
        }
    };
}

vocabulary!(
    /// Curated showcase role. `Unassigned` means no role was declared.
    Role, ROLES { Featured => "featured", Supporting => "supporting", Experimental => "experimental", Historical => "historical", Unassigned => "unassigned" }
);
vocabulary!(
    /// Radial distance intent, innermost first. Rust decides the geometry.
    Placement, PLACEMENTS { Center => "center", Inner => "inner", Middle => "middle", Outer => "outer" }
);
vocabulary!(Basis, BASES { SharedLanguage => "shared_language", SharedTopic => "shared_topic" });
vocabulary!(LayoutKind, LAYOUT_KINDS { Radial => "radial", Clustered => "clustered", SolarSystem => "solar_system", Web => "web", Timeline => "timeline" });
vocabulary!(ClusterBy, CLUSTER_BY { Language => "language", Topic => "topic", Role => "role", Group => "group" });
vocabulary!(RankBy, RANK_BY { Stars => "stars", Recency => "recency", Name => "name" });
vocabulary!(Motion, MOTIONS { Still => "still", Gentle => "gentle", Lively => "lively" });
vocabulary!(OrbitShape, ORBIT_SHAPES { Round => "round", Wide => "wide" });

pub const FOCUS_KINDS: &[&str] = &["language", "topic", "role", "repository", "group"];
pub const FILTER_KEYS: &[&str] = &[
    "language", "topic", "role", "repository", "stars", "updated", "archived", "fork", "any", "all", "not",
];

#[derive(Clone, Debug, PartialEq)]
pub enum Focus {
    Language(String),
    Topic(String),
    Role(Role),
    Repository(String),
    Group(String),
}

#[derive(Clone, Debug, PartialEq)]
pub enum Filter {
    Language(String),
    Topic(String),
    Role(Role),
    Repository(String),
    Stars { min: Option<u32>, max: Option<u32> },
    Updated { within_days: Option<u32>, older_than_days: Option<u32> },
    Archived(bool),
    Fork(bool),
    Any(Vec<Filter>),
    All(Vec<Filter>),
    Not(Box<Filter>),
}

#[derive(Clone, Debug, PartialEq)]
pub struct Group {
    pub id: String,
    pub label: String,
    pub filter: Filter,
    pub placement: Option<Placement>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Relationship {
    pub basis: Basis,
    /// Finite, within 0..=1.
    pub strength: f64,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Layout {
    pub kind: LayoutKind,
    pub cluster_by: Vec<ClusterBy>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct Ranking {
    pub by: RankBy,
    pub limit: Option<u32>,
}

#[derive(Clone, Debug, Default, PartialEq)]
pub struct Style {
    pub motion: Option<Motion>,
    pub orbit_shape: Option<OrbitShape>,
    pub rings: Option<bool>,
}

#[derive(Clone, Debug, PartialEq)]
pub struct ConstellationSpec {
    pub focus: Option<Focus>,
    pub groups: Vec<Group>,
    pub relationships: Vec<Relationship>,
    pub layout: Layout,
    pub ranking: Ranking,
    pub style: Style,
}

impl Default for ConstellationSpec {
    /// The documented deterministic defaults for every omitted section.
    fn default() -> Self {
        Self {
            focus: None,
            groups: Vec::new(),
            relationships: vec![Relationship { basis: Basis::SharedLanguage, strength: 1.0 }],
            layout: Layout { kind: LayoutKind::Radial, cluster_by: vec![ClusterBy::Language] },
            ranking: Ranking { by: RankBy::Stars, limit: None },
            style: Style::default(),
        }
    }
}

impl Filter {
    /// Canonical JSON: one key per filter object.
    pub fn to_value(&self) -> Value {
        match self {
            Filter::Language(v) => json!({ "language": v }),
            Filter::Topic(v) => json!({ "topic": v }),
            Filter::Role(v) => json!({ "role": v.as_str() }),
            Filter::Repository(v) => json!({ "repository": v }),
            Filter::Stars { min, max } => {
                let mut range = Map::new();
                if let Some(min) = min { range.insert("min".into(), json!(min)); }
                if let Some(max) = max { range.insert("max".into(), json!(max)); }
                json!({ "stars": range })
            }
            Filter::Updated { within_days, older_than_days } => {
                let mut range = Map::new();
                if let Some(v) = within_days { range.insert("within_days".into(), json!(v)); }
                if let Some(v) = older_than_days { range.insert("older_than_days".into(), json!(v)); }
                json!({ "updated": range })
            }
            Filter::Archived(v) => json!({ "archived": v }),
            Filter::Fork(v) => json!({ "fork": v }),
            Filter::Any(items) => json!({ "any": items.iter().map(Filter::to_value).collect::<Vec<_>>() }),
            Filter::All(items) => json!({ "all": items.iter().map(Filter::to_value).collect::<Vec<_>>() }),
            Filter::Not(inner) => json!({ "not": inner.to_value() }),
        }
    }
}

impl ConstellationSpec {
    /// Canonical, fully defaulted JSON. Parsing this value yields an equal spec.
    pub fn to_value(&self) -> Value {
        let mut root = Map::new();
        root.insert("schema_version".into(), json!(SCHEMA_VERSION));
        if let Some(focus) = &self.focus {
            let (kind, value) = match focus {
                Focus::Language(v) => ("language", v.as_str()),
                Focus::Topic(v) => ("topic", v.as_str()),
                Focus::Role(v) => ("role", v.as_str()),
                Focus::Repository(v) => ("repository", v.as_str()),
                Focus::Group(v) => ("group", v.as_str()),
            };
            root.insert("focus".into(), json!({ "kind": kind, "value": value }));
        }
        root.insert(
            "groups".into(),
            Value::Array(
                self.groups
                    .iter()
                    .map(|group| {
                        let mut item = Map::new();
                        item.insert("id".into(), json!(group.id));
                        item.insert("label".into(), json!(group.label));
                        item.insert("match".into(), group.filter.to_value());
                        if let Some(placement) = group.placement {
                            item.insert("placement".into(), json!(placement.as_str()));
                        }
                        Value::Object(item)
                    })
                    .collect(),
            ),
        );
        root.insert(
            "relationships".into(),
            Value::Array(
                self.relationships
                    .iter()
                    .map(|r| json!({ "basis": r.basis.as_str(), "strength": r.strength }))
                    .collect(),
            ),
        );
        root.insert(
            "layout".into(),
            json!({
                "kind": self.layout.kind.as_str(),
                "cluster_by": self.layout.cluster_by.iter().map(|c| c.as_str()).collect::<Vec<_>>(),
            }),
        );
        let mut ranking = Map::new();
        ranking.insert("by".into(), json!(self.ranking.by.as_str()));
        if let Some(limit) = self.ranking.limit {
            ranking.insert("limit".into(), json!(limit));
        }
        root.insert("ranking".into(), Value::Object(ranking));
        let mut style = Map::new();
        if let Some(motion) = self.style.motion { style.insert("motion".into(), json!(motion.as_str())); }
        if let Some(shape) = self.style.orbit_shape { style.insert("orbit_shape".into(), json!(shape.as_str())); }
        if let Some(rings) = self.style.rings { style.insert("rings".into(), json!(rings)); }
        if !style.is_empty() {
            root.insert("style".into(), Value::Object(style));
        }
        Value::Object(root)
    }
}

/// Case- and punctuation-insensitive identity for languages, topics and IDs.
/// `C`, `C++` and `C#` stay distinct.
pub fn fold(value: &str) -> String {
    value.trim().chars().flat_map(char::to_lowercase).collect()
}

/// Sort through one shared, non-generic instantiation. Each generic
/// `slice::sort_by` call site adds several kilobytes to the WASM binary that
/// every page and standalone export downloads; this keeps that cost constant.
/// Comparators must be total (break ties), so the unstable sort is deterministic.
pub fn sorted_order(len: usize, compare: &mut dyn FnMut(usize, usize) -> std::cmp::Ordering) -> Vec<u32> {
    let mut order: Vec<u32> = (0..len as u32).collect();
    order.sort_unstable_by(|a, b| compare(*a as usize, *b as usize).then(a.cmp(b)));
    order
}

/// Reorder `items` by a comparator using the shared sort.
pub fn sort_with<T>(items: &mut Vec<T>, compare: &mut dyn FnMut(&T, &T) -> std::cmp::Ordering) {
    let order = sorted_order(items.len(), &mut |a, b| compare(&items[a], &items[b]));
    let mut slots: Vec<Option<T>> = std::mem::take(items).into_iter().map(Some).collect();
    items.extend(order.into_iter().filter_map(|index| slots[index as usize].take()));
}
