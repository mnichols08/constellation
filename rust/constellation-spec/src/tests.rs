use crate::compile::{compile, Canvas, BAND_RADII, MAX_EDGES_PER_NODE};
use crate::diagnostics::{Code, Diagnostics, Severity, MAX_DIAGNOSTICS};
use crate::engine::{Engine, MAX_RESULTS, TOOL_NAMES};
use crate::evidence::Evidence;
use crate::model::*;
use crate::parse::{parse_spec, RawConstellationSpec};
use crate::schema::{spec_schema, tool_definitions};
use serde_json::{json, Value};
use std::path::PathBuf;

fn root() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("../..")
}
fn read(path: &str) -> String {
    std::fs::read_to_string(root().join(path)).unwrap_or_else(|error| panic!("{path}: {error}"))
}
fn evidence_json() -> String {
    read("test/fixtures/ai/evidence.json")
}
fn evidence() -> Evidence {
    Evidence::from_json(&evidence_json()).unwrap()
}
fn examples() -> Vec<(String, String)> {
    let mut files: Vec<_> = std::fs::read_dir(root().join("examples/specs")).unwrap().map(|entry| entry.unwrap().path()).collect();
    files.sort();
    files.into_iter().map(|path| (path.file_name().unwrap().to_string_lossy().into_owned(), std::fs::read_to_string(path).unwrap())).collect()
}
fn errors(text: &str) -> Diagnostics {
    parse_spec(text).expect_err("spec should be rejected")
}
fn has(diagnostics: &Diagnostics, code: Code, path: &str) -> bool {
    diagnostics.items.iter().any(|d| d.code == code && d.path == path)
}

// ------------------------------------------------------------ contract (#26)

#[test]
fn examples_round_trip_and_compile() {
    let evidence = evidence();
    let all = examples();
    assert!(all.len() >= 5);
    for (name, text) in all {
        let spec = parse_spec(&text).unwrap_or_else(|d| panic!("{name}: {d:?}"));
        let canonical = spec.to_value();
        let again = parse_spec(&canonical.to_string()).unwrap();
        assert_eq!(spec, again, "{name} does not round-trip");
        assert_eq!(canonical, again.to_value(), "{name} canonical form is unstable");
        compile(spec, &evidence, Canvas::default()).unwrap_or_else(|d| panic!("{name}: {d:?}"));
    }
}

#[test]
fn omitted_sections_take_documented_deterministic_defaults() {
    let spec = parse_spec(r#"{"schema_version":1}"#).unwrap();
    assert_eq!(spec, ConstellationSpec::default());
    assert_eq!(
        spec.to_value(),
        json!({"schema_version":1,"groups":[],"relationships":[{"basis":"shared_language","strength":1.0}],"layout":{"kind":"radial","cluster_by":["language"]},"ranking":{"by":"stars"}})
    );
}

#[test]
fn unsupported_schema_versions_return_a_structured_error() {
    for version in ["0", "2", "\"1\"", "1.5", "-1", "null", "[1]"] {
        let diagnostics = errors(&format!(r#"{{"schema_version":{version},"focus":7}}"#));
        assert_eq!(diagnostics.items.len(), 1, "{version}");
        let item = &diagnostics.items[0];
        assert_eq!((item.code, item.path.as_str()), (Code::UnsupportedSchemaVersion, "schema_version"));
        assert_eq!(item.allowed, ["1"]);
    }
    assert!(has(&errors("{}"), Code::MissingField, "schema_version"));
}

#[test]
fn the_spec_cannot_carry_coordinates_or_engine_internals() {
    for field in ["x", "position", "positions", "forces", "iterations", "css", "script"] {
        let text = json!({"schema_version":1, field: 1}).to_string();
        assert!(has(&errors(&text), Code::UnknownField, field));
    }
    let text = r#"{"schema_version":1,"groups":[{"name":"a","match":{"role":"featured"},"x":4,"y":2}]}"#;
    let diagnostics = errors(text);
    assert!(has(&diagnostics, Code::UnknownField, "groups[0].x") && has(&diagnostics, Code::UnknownField, "groups[0].y"));
}

#[test]
fn synonyms_normalize_to_canonical_vocabulary() {
    let spec = parse_spec(
        r#"{"schema_version":1,"groups":[{"name":"Old Experiments!","match":{"role":"experiments","topic":"WASM"},"placement":"outskirts"}],
            "relationships":[{"basis":"shared_topics"}],"layout":{"kind":"rings","cluster_by":["topics","languages","topic"]},"ranking":{"by":"updated","limit":12.0}}"#,
    )
    .unwrap();
    assert_eq!(spec.groups[0].id, "old-experiments");
    assert_eq!(spec.groups[0].placement, Some(Placement::Outer));
    assert_eq!(spec.groups[0].filter, Filter::All(vec![Filter::Topic("wasm".into()), Filter::Role(Role::Experimental)]));
    assert_eq!(spec.relationships, [Relationship { basis: Basis::SharedTopic, strength: 1.0 }]);
    assert_eq!(spec.layout, Layout { kind: LayoutKind::Radial, cluster_by: vec![ClusterBy::Topic, ClusterBy::Language] });
    assert_eq!(spec.ranking, Ranking { by: RankBy::Recency, limit: Some(12) });
}

// --------------------------------------------------------- diagnostics (#27)

#[test]
fn diagnostics_locate_the_offending_field_with_allowed_values_and_bounds() {
    let text = r#"{"schema_version":1,
      "focus":{"kind":"planet","value":"x"},
      "groups":[{"id":"ok","match":{"role":"featured"}},{"id":"Bad Id","match":{"language":7,"foo":1}},{"id":"ok","match":{"stars":{"min":9,"max":2}}}],
      "relationships":[{"basis":"shared_topic","strength":1.5},{"basis":"gravity"},{"strength":0.2}],
      "layout":{"kind":"spiral","cluster_by":["mood"]},
      "ranking":{"by":"stars","limit":0},
      "style":{"motion":"frantic","rings":"yes"}}"#;
    let diagnostics = errors(text);
    let find = |code: Code, path: &str| diagnostics.items.iter().find(|d| d.code == code && d.path == path).unwrap_or_else(|| panic!("missing {code:?} at {path}: {diagnostics:#?}"));
    assert_eq!(find(Code::InvalidValue, "focus.kind").allowed, FOCUS_KINDS);
    find(Code::InvalidValue, "groups[1].id");
    find(Code::InvalidType, "groups[1].match.language");
    assert_eq!(find(Code::UnknownField, "groups[1].match.foo").allowed, FILTER_KEYS);
    find(Code::OutOfRange, "groups[2].match.stars");
    let strength = find(Code::OutOfRange, "relationships[0].strength").bounds.clone().unwrap();
    assert_eq!((strength.min, strength.max), (Some(0.0), Some(1.0)));
    assert_eq!(find(Code::InvalidValue, "relationships[1].basis").allowed, BASES);
    find(Code::MissingField, "relationships[2].basis");
    assert_eq!(find(Code::InvalidValue, "layout.kind").allowed, LAYOUT_KINDS);
    find(Code::InvalidValue, "layout.cluster_by[0]");
    assert_eq!(find(Code::OutOfRange, "ranking.limit").bounds.clone().unwrap().max, Some(MAX_LIMIT as f64));
    find(Code::InvalidValue, "style.motion");
    find(Code::InvalidType, "style.rings");
    assert!(diagnostics.items.iter().all(|d| d.severity == Severity::Error && !d.message.is_empty()));
    // Diagnostics serialize as plain JSON suitable for crossing the WASM boundary.
    let wire = serde_json::to_value(&diagnostics.items).unwrap();
    assert!(wire.as_array().unwrap().iter().all(|d| d["code"].is_string() && d["path"].is_string() && d["message"].is_string()));
}

#[test]
fn duplicate_ids_unknown_references_and_unsupported_combinations_are_reported() {
    assert!(has(&errors(r#"{"schema_version":1,"groups":[{"id":"a","match":{"fork":true}},{"id":"a","match":{"fork":false}}]}"#), Code::DuplicateId, "groups[1].id"));
    let unknown = errors(r#"{"schema_version":1,"focus":{"kind":"group","value":"missing"},"groups":[{"id":"a","match":{"fork":true}}]}"#);
    assert!(has(&unknown, Code::UnknownGroup, "focus.value"));
    assert_eq!(unknown.items[0].allowed, ["a"]);
    let combo = errors(r#"{"schema_version":1,"groups":[{"id":"a","match":{"fork":true},"placement":"outer"}],"layout":{"kind":"clustered"}}"#);
    assert!(has(&combo, Code::UnsupportedCombination, "groups[0].placement"));
    assert!(has(&errors(r#"{"schema_version":1,"layout":{"cluster_by":["group"]}}"#), Code::UnsupportedCombination, "layout.cluster_by"));
    assert!(has(&errors(r#"{"schema_version":1,"relationships":[{"basis":"shared_topic"},{"basis":"shared_topics"}]}"#), Code::DuplicateId, "relationships[1].basis"));
}

#[test]
fn malformed_and_adversarial_documents_fail_with_one_clear_diagnostic() {
    for text in ["", "{", "nope", "[1,2", "{\"schema_version\":1,}", "{\"schema_version\":NaN}", "{\"schema_version\":1,\"relationships\":[{\"basis\":\"shared_topic\",\"strength\":Infinity}]}", "{\"schema_version\":1e999}"] {
        let diagnostics = errors(text);
        assert_eq!(diagnostics.items[0].code, Code::InvalidJson, "{text}");
    }
    for text in ["null", "7", "\"spec\"", "[]", "true"] {
        assert!(has(&errors(text), Code::InvalidType, ""), "{text}");
    }
    let deep = format!("{}{}", "[".repeat(100_000), "]".repeat(100_000));
    assert_eq!(errors(&deep).items[0].code, Code::InvalidJson);
    let huge = format!(r#"{{"schema_version":1,"focus":{{"kind":"topic","value":"{}"}}}}"#, "a".repeat(MAX_SPEC_BYTES));
    let diagnostics = errors(&huge);
    assert_eq!(diagnostics.items[0].code, Code::SpecTooLarge);
    assert_eq!(diagnostics.items[0].bounds.clone().unwrap().max, Some(MAX_SPEC_BYTES as f64));
}

// ---------------------------------------------------------- validation (#30)

#[test]
fn numeric_fields_reject_non_finite_fractional_and_out_of_range_values() {
    let cases = [
        (r#"{"schema_version":1,"relationships":[{"basis":"shared_topic","strength":-0.01}]}"#, "relationships[0].strength"),
        (r#"{"schema_version":1,"relationships":[{"basis":"shared_topic","strength":1e308}]}"#, "relationships[0].strength"),
        (r#"{"schema_version":1,"ranking":{"limit":2.5}}"#, "ranking.limit"),
        (r#"{"schema_version":1,"ranking":{"limit":-3}}"#, "ranking.limit"),
        (r#"{"schema_version":1,"ranking":{"limit":18446744073709551615}}"#, "ranking.limit"),
        (r#"{"schema_version":1,"groups":[{"id":"a","match":{"stars":{"min":1e12}}}]}"#, "groups[0].match.stars.min"),
        (r#"{"schema_version":1,"groups":[{"id":"a","match":{"updated":{"within_days":99999}}}]}"#, "groups[0].match.updated.within_days"),
    ];
    for (text, path) in cases {
        assert!(has(&errors(text), Code::OutOfRange, path), "{text}");
    }
    let spec = parse_spec(r#"{"schema_version":1,"relationships":[{"basis":"shared_topic","strength":0.33333333}]}"#).unwrap();
    assert_eq!(spec.relationships[0].strength, 0.333);
}

#[test]
fn every_collection_and_string_has_an_explicit_limit() {
    let group = |i: usize| json!({"id": format!("g{i}"), "match": {"fork": true}});
    let too_many = json!({"schema_version":1,"groups":(0..=MAX_GROUPS).map(group).collect::<Vec<_>>()}).to_string();
    let diagnostics = errors(&too_many);
    assert!(has(&diagnostics, Code::TooMany, "groups"));
    assert_eq!(diagnostics.items.len(), 1, "an oversized list is rejected whole, not item by item");
    assert!(parse_spec(&json!({"schema_version":1,"groups":(0..MAX_GROUPS).map(group).collect::<Vec<_>>()}).to_string()).is_ok());

    let relationships = json!({"schema_version":1,"relationships":vec![json!({"basis":"shared_topic"}); MAX_RELATIONSHIPS + 1]}).to_string();
    assert!(has(&errors(&relationships), Code::TooMany, "relationships"));
    let clusters = json!({"schema_version":1,"layout":{"cluster_by":["language","topic","role","language"]}}).to_string();
    assert!(has(&errors(&clusters), Code::TooMany, "layout.cluster_by"));

    let long = json!({"schema_version":1,"focus":{"kind":"topic","value":"t".repeat(MAX_TEXT + 1)}}).to_string();
    let diagnostics = errors(&long);
    assert!(has(&diagnostics, Code::TooLong, "focus.value"));
    assert!(diagnostics.items[0].received.as_ref().unwrap().chars().count() < 100);
    assert!(has(&errors(r#"{"schema_version":1,"focus":{"kind":"topic","value":"  "}}"#), Code::EmptyValue, "focus.value"));
    assert!(has(&errors(&json!({"schema_version":1,"focus":{"kind":"topic","value":"a\u{0007}b"}}).to_string()), Code::InvalidValue, "focus.value"));

    let mut nested = json!({"fork": true});
    for _ in 0..=MAX_FILTER_DEPTH {
        nested = json!({"not": nested});
    }
    let deep = json!({"schema_version":1,"groups":[{"id":"a","match":nested}]}).to_string();
    assert!(errors(&deep).items.iter().any(|d| d.code == Code::FilterTooDeep));
    let wide = json!({"schema_version":1,"groups":[{"id":"a","match":{"any":vec![json!({"any":vec![json!({"fork":true}); 40]}); 2]}}]}).to_string();
    assert!(errors(&wide).items.iter().any(|d| d.code == Code::FilterTooComplex));
    for empty in [json!({}), json!({"any":[]}), json!({"stars":{}})] {
        let text = json!({"schema_version":1,"groups":[{"id":"a","match":empty}]}).to_string();
        assert!(errors(&text).items.iter().any(|d| d.code == Code::EmptyFilter), "{text}");
    }
}

#[test]
fn diagnostics_stay_bounded_for_pathological_documents() {
    let groups: Vec<Value> = (0..MAX_GROUPS).map(|i| json!({"id": format!("BAD {i}"), "match": {"a":1,"b":2,"c":3}, "placement": "nowhere", "zzz": 1})).collect();
    let diagnostics = errors(&json!({"schema_version":1,"groups":groups}).to_string());
    assert_eq!(diagnostics.items.len(), MAX_DIAGNOSTICS);
    assert!(diagnostics.truncated);
}

// ---------------------------------------------------------- resolution (#31)

fn ids(evidence: &Evidence, filter: Value) -> Vec<String> {
    let filter = crate::parse::filter_from_value(&filter).unwrap();
    evidence.resolve(&filter).into_iter().map(|(ix, _)| evidence.repo(ix).id.clone()).collect()
}

#[test]
fn filters_resolve_deterministically_against_fixture_evidence() {
    let evidence = evidence();
    assert_eq!(ids(&evidence, json!({"language":"rust"})), ["ada/lightbeam", "ada/orbit-engine", "ada/tiny-alloc", "ada/wayfinder"]);
    assert_eq!(ids(&evidence, json!({"language":"HTML"})), ["ada/constellation-ui", "ada/old-blog", "ada/weekend-synth"]);
    assert_eq!(ids(&evidence, json!({"topic":"Graphics"})), ["ada/constellation-ui", "ada/orbit-engine", "ada/tiny-worlds"]);
    assert_eq!(ids(&evidence, json!({"role":"experimental"})), ["ada/tiny-alloc", "ada/tiny-worlds", "ada/weekend-synth"]);
    assert_eq!(ids(&evidence, json!({"role":"unassigned"})), ["ada/dotfiles", "ada/field-notes", "ada/forked-linter", "ada/palette"]);
    assert_eq!(ids(&evidence, json!({"language":"Rust","stars":{"min":100}})), ["ada/lightbeam", "ada/orbit-engine"]);
    assert_eq!(ids(&evidence, json!({"updated":{"within_days":30}})), ["ada/constellation-ui", "ada/lightbeam", "ada/orbit-engine"]);
    assert_eq!(ids(&evidence, json!({"updated":{"older_than_days":2000}})), ["ada/moonrise", "ada/old-blog"]);
    assert_eq!(ids(&evidence, json!({"all":[{"topic":"web"},{"not":{"archived":true}}]})), ["ada/constellation-ui", "ada/little-notes", "ada/palette"]);
    assert_eq!(ids(&evidence, json!({"any":[{"fork":true},{"repository":"ADA/Dotfiles"}]})), ["ada/dotfiles", "ada/forked-linter"]);
    assert!(ids(&evidence, json!({"language":"COBOL"})).is_empty());
    // Indexed and full-scan paths agree.
    assert_eq!(ids(&evidence, json!({"language":"Rust"})), ids(&evidence, json!({"any":[{"language":"Rust"}]})));
}

#[test]
fn resolved_members_carry_reasons_that_separate_observed_from_declared_evidence() {
    let evidence = evidence();
    let filter = crate::parse::filter_from_value(&json!({"language":"Rust","role":"featured"})).unwrap();
    let matches = evidence.resolve(&filter);
    assert_eq!(matches.len(), 2);
    let reasons = &matches.iter().find(|(ix, _)| evidence.repo(*ix).id == "ada/orbit-engine").unwrap().1;
    assert_eq!(reasons[0].kind, "language");
    assert_eq!(reasons[0].detail, "Rust is 90% of the code");
    assert_eq!(reasons[0].source, "observed");
    assert_eq!((reasons[1].kind, reasons[1].source), ("role", "declared"));
}

#[test]
fn unknown_references_produce_diagnostics_instead_of_empty_results() {
    let evidence = evidence();
    let spec = parse_spec(r#"{"schema_version":1,"groups":[{"id":"a","match":{"any":[{"repository":"ada/nope"},{"language":"COBOL"},{"topic":"quantum"}]}}]}"#).unwrap();
    let diagnostics = compile(spec, &evidence, Canvas::default()).err().unwrap();
    assert!(has(&diagnostics, Code::UnknownRepository, "groups[0].match.any[0].repository"));
    let language = diagnostics.items.iter().find(|d| d.code == Code::UnknownLanguage).unwrap();
    assert_eq!(language.severity, Severity::Warning);
    assert!(language.allowed.contains(&"Rust".to_owned()));
    assert!(has(&diagnostics, Code::UnknownTopic, "groups[0].match.any[2].topic"));
    let focus = parse_spec(r#"{"schema_version":1,"focus":{"kind":"repository","value":"ada/nope"}}"#).unwrap();
    assert!(has(&compile(focus, &evidence, Canvas::default()).err().unwrap(), Code::UnknownRepository, "focus.value"));
}

// --------------------------------------------------------- compilation (#32)

fn compiled(text: &str) -> Value {
    let evidence = evidence();
    compile(parse_spec(text).unwrap(), &evidence, Canvas::default()).unwrap().to_value(&evidence)
}
fn node<'a>(compiled: &'a Value, id: &str) -> &'a Value {
    compiled["nodes"].as_array().unwrap().iter().find(|node| node["id"] == id).unwrap()
}

#[test]
fn the_epic_example_places_focus_inside_and_experiments_outside() {
    let text = read("examples/specs/solar-system-rust-focus.json");
    let result = compiled(&text);
    assert_eq!(result, compiled(&text), "compilation must be deterministic");
    for id in ["ada/orbit-engine", "ada/lightbeam", "ada/wayfinder"] {
        assert_eq!(node(&result, id)["band"], "center", "{id}");
    }
    // Explicit group placement outranks focus: an experimental Rust project stays outside.
    for id in ["ada/tiny-alloc", "ada/tiny-worlds", "ada/weekend-synth"] {
        assert_eq!(node(&result, id)["band"], "outer", "{id}");
    }
    assert_eq!(node(&result, "ada/stargazer")["band"], "middle");
    assert_eq!(result["groups"][0]["id"], "experiments");
    assert_eq!(result["groups"][0]["total"], 3);
    assert_eq!(result["groups"][0]["members"][0]["reasons"][0]["source"], "declared");
    assert_eq!(result["focus"]["total"], 4);
    assert_eq!(result["bands"], json!({"center":3,"inner":0,"middle":9,"outer":3}));
    assert_eq!(result["scene_options"], json!({"arrangement":"rings","ringMeaning":"identity","snapToRings":false,"connectionBasis":"both","connectionWeight":"topics","sortBy":"stars"}));
    // The public spec echoed back still has no coordinates; geometry lives only in compiled nodes.
    assert!(!result["spec"].to_string().contains("position"));
    let outer = node(&result, "ada/tiny-alloc")["position"].as_array().unwrap();
    let inner = node(&result, "ada/orbit-engine")["position"].as_array().unwrap();
    let distance = |p: &[Value]| ((p[0].as_f64().unwrap() - 450.0) / 368.0).hypot((p[1].as_f64().unwrap() - 270.0) / 192.0);
    assert!((distance(inner) - BAND_RADII[0]).abs() < 1e-3 && (distance(outer) - BAND_RADII[3]).abs() < 1e-3);
}

#[test]
fn placements_stay_on_the_canvas_for_every_canvas_shape() {
    let evidence = evidence();
    for canvas in [Canvas { compact: false, round: false }, Canvas { compact: true, round: false }, Canvas { compact: false, round: true }, Canvas { compact: true, round: true }] {
        let spec = parse_spec(r#"{"schema_version":1}"#).unwrap();
        let result = compile(spec, &evidence, canvas).unwrap();
        let positions = result.positions.unwrap();
        let mut unique = std::collections::BTreeSet::new();
        for [x, y] in positions {
            assert!((60.0..=840.0).contains(&x) && (20.0..=520.0).contains(&y), "{x},{y}");
            assert!(unique.insert((x.to_bits(), y.to_bits())), "two repositories share a position");
        }
    }
}

#[test]
fn default_bands_follow_rank_and_limits_exclude_the_tail() {
    let result = compiled(r#"{"schema_version":1}"#);
    assert_eq!(node(&result, "ada/orbit-engine")["band"], "inner");
    assert_eq!(node(&result, "ada/forked-linter")["band"], "outer");
    let limited = compiled(r#"{"schema_version":1,"ranking":{"by":"recency","limit":4}}"#);
    let shown: Vec<&str> = limited["nodes"].as_array().unwrap().iter().map(|n| n["id"].as_str().unwrap()).collect();
    assert_eq!(shown, ["ada/constellation-ui", "ada/dotfiles", "ada/lightbeam", "ada/orbit-engine"]);
    assert_eq!(limited["repositories"], json!({"total":15,"included":4}));
    assert_eq!(limited["scene_options"]["maxRepos"], 4);
    assert_eq!(limited["scene_options"]["sortBy"], "updated");
}

#[test]
fn relationship_rules_compile_to_bounded_weighted_edges() {
    let topics = compiled(r#"{"schema_version":1,"relationships":[{"basis":"shared_topic","strength":1}],"layout":{"kind":"web"}}"#);
    let edges = topics["relationships"]["edges"].as_array().unwrap();
    assert!(!edges.is_empty());
    assert!(edges.iter().all(|e| !e["shared_topics"].as_array().unwrap().is_empty() && e["weight"].as_f64().unwrap() > 0.0 && e["weight"].as_f64().unwrap() <= 1.0));
    assert!(topics["nodes"][0].get("position").is_none(), "only radial layouts carry ring positions");
    assert_eq!(topics["scene_options"]["arrangement"], "force");
    assert_eq!(topics["scene_options"]["connectionBasis"], "topics");

    let languages = compiled(r#"{"schema_version":1,"relationships":[{"basis":"shared_language","strength":0.4}]}"#);
    let pair = languages["relationships"]["edges"].as_array().unwrap().iter().find(|e| e["source"] == "ada/lightbeam" && e["target"] == "ada/tiny-alloc").unwrap();
    assert_eq!(pair["weight"], 1.0, "weights are normalized by total strength");
    assert_eq!(pair["shared_languages"], json!(["Rust"]));

    let none = compiled(r#"{"schema_version":1,"relationships":[]}"#);
    assert_eq!(none["relationships"]["total"], 0);
    assert!(none["scene_options"].get("connectionBasis").is_none());

    // Dense evidence: every repository shares one language, yet edges stay bounded.
    let dense = json!({"repositories": (0..400).map(|i| json!({"id": format!("o/r{i:03}"), "languages": {"Rust": 1}, "stars": i})).collect::<Vec<_>>()}).to_string();
    let dense = Evidence::from_json(&dense).unwrap();
    let result = compile(ConstellationSpec::default(), &dense, Canvas::default()).unwrap();
    assert!(result.edges.len() <= 400 * MAX_EDGES_PER_NODE);
    assert!(result.edges.windows(2).all(|pair| (pair[0].a, pair[0].b) < (pair[1].a, pair[1].b)));
}

#[test]
fn overlapping_placements_and_empty_matches_are_warnings_not_failures() {
    let result = compiled(
        r#"{"schema_version":1,"focus":{"kind":"topic","value":"astronomy"},"groups":[
            {"id":"rust","match":{"language":"Rust"},"placement":"inner"},
            {"id":"experiments","match":{"role":"experimental"},"placement":"outer"},
            {"id":"nothing","match":{"stars":{"min":99999}}}]}"#,
    );
    let codes: Vec<&str> = result["diagnostics"].as_array().unwrap().iter().map(|d| d["code"].as_str().unwrap()).collect();
    assert_eq!(codes, ["empty_group", "overlapping_placement"]);
    assert_eq!(node(&result, "ada/tiny-alloc")["band"], "inner", "the earlier group keeps an ambiguous repository");
    assert_eq!(node(&result, "ada/tiny-alloc")["group"], "rust");
    assert_eq!(node(&result, "ada/stargazer")["band"], "center");
}

// ------------------------------------------------------------- engine (#34-36)

#[test]
fn engine_validates_compiles_and_only_retains_applied_specs() {
    let mut engine = Engine::new(&evidence_json()).unwrap();
    assert_eq!(engine.repository_count(), 15);
    assert!(engine.bands().is_empty() && engine.positions().is_empty());
    let text = read("examples/specs/solar-system-rust-focus.json");

    let valid = engine.validate(&text);
    assert_eq!(valid["ok"], true);
    assert_eq!(valid["spec"]["groups"][0]["id"], "experiments");
    assert!(valid.get("compiled").is_none(), "validation builds nothing");

    let before = engine.edge_pairs();
    let preview = engine.compile(&text, Canvas::default());
    assert_eq!(preview["ok"], true);
    assert_eq!(engine.edge_pairs(), before, "compile is pure");
    assert_eq!(engine.applied_spec(), Value::Null);

    let rejected = engine.apply(r#"{"schema_version":1,"focus":{"kind":"repository","value":"nope"}}"#, Canvas::default());
    assert_eq!(rejected["ok"], false);
    assert_eq!(rejected["diagnostics"][0]["code"], "unknown_repository");
    assert_eq!(engine.edge_pairs(), before, "a rejected spec leaves the engine untouched");

    // Placement-only compilation agrees with the full compile.
    let placed = engine.placements(&text, Canvas::default());
    let full: Vec<Value> = preview["compiled"]["nodes"].as_array().unwrap().iter().map(|n| json!([n["id"], n["position"][0], n["position"][1]])).collect();
    assert_eq!(placed["positions"], json!(full));
    assert_eq!(engine.placements(r#"{"schema_version":1,"layout":{"kind":"web"}}"#, Canvas::default())["positions"], json!([]));
    assert_eq!(engine.placements("{", Canvas::default())["ok"], false);

    let applied = engine.apply(&text, Canvas::default());
    assert_eq!(applied["compiled"], preview["compiled"]);
    assert_eq!(engine.applied_spec(), valid["spec"]);
    assert_eq!(engine.bands().len(), 15);
    assert_eq!(engine.positions().len(), 30);
    assert_eq!(engine.edge_pairs().len(), engine.edge_weights().len() * 2);
    assert_ne!(engine.edge_pairs(), before);
}

#[test]
fn neighbour_and_path_queries_reuse_retained_adjacency_and_survive_updates() {
    let mut engine = Engine::new(&evidence_json()).unwrap();
    let index = |engine: &Engine, id: &str| engine.index_of(id).unwrap();
    let names = |engine: &Engine, list: Vec<u32>| -> Vec<String> { list.into_iter().map(|i| engine.id_at(i).unwrap().to_owned()).collect() };
    let rust = names(&engine, engine.neighbors(index(&engine, "ada/tiny-alloc")));
    assert_eq!(rust, ["ada/lightbeam", "ada/orbit-engine", "ada/wayfinder"]);
    // Symmetric, and consistent with the flat edge list.
    let pairs = engine.edge_pairs();
    for pair in pairs.chunks_exact(2) {
        assert!(engine.neighbors(pair[0]).contains(&pair[1]) && engine.neighbors(pair[1]).contains(&pair[0]));
    }
    let path = engine.path(index(&engine, "ada/dotfiles"), index(&engine, "ada/tiny-alloc"));
    assert_eq!(names(&engine, path), ["ada/dotfiles", "ada/wayfinder", "ada/tiny-alloc"]);
    assert!(engine.path(index(&engine, "ada/forked-linter"), index(&engine, "ada/tiny-alloc")).is_empty());
    assert!(engine.neighbors(9999).is_empty() && engine.path(0, 9999).is_empty());
    assert_eq!(engine.index_of("ADA/Lightbeam"), engine.index_of("ada/lightbeam"));
    assert_eq!(engine.index_of("ada/none"), None);

    // Replacing evidence rebuilds every index and invalidates the applied spec.
    engine.apply(r#"{"schema_version":1}"#, Canvas::default());
    let generation = engine.generation();
    engine.set_evidence(r#"{"repositories":[{"id":"b/two","languages":{"Go":1},"topics":["x"]},{"id":"a/one","languages":{"Go":3},"topics":["x","y"]},{"id":"c/three","language":"Zig"}]}"#).unwrap();
    assert_eq!(engine.generation(), generation + 1);
    assert_eq!(engine.repository_count(), 3);
    assert_eq!(engine.applied_spec(), Value::Null);
    assert!(engine.bands().is_empty());
    assert_eq!(engine.index_of("ada/lightbeam"), None);
    assert_eq!(engine.neighbors(index(&engine, "a/one")), [index(&engine, "b/two")]);
    assert_eq!(engine.list_languages()["languages"], json!([{"name":"Go","repositories":2},{"name":"Zig","repositories":1}]));
    assert_eq!(engine.list_topics()["topics"], json!([{"name":"x","repositories":2},{"name":"y","repositories":1}]));
    // Invalid evidence keeps the previous state.
    assert!(engine.set_evidence(r#"{"repositories":[{"id":"a"},{"id":"A"}]}"#).is_err());
    assert_eq!(engine.repository_count(), 3);
    assert_eq!(engine.generation(), generation + 1);
}

#[test]
fn invalid_evidence_is_rejected_with_a_located_diagnostic() {
    let cases = [
        ("{", ""),
        (r#"{"repositories":[{"id":""}]}"#, "repositories[0].id"),
        (r#"{"repositories":[{"id":"a","stars":-1}]}"#, "repositories[0].stars"),
        (r#"{"repositories":[{"id":"a","languages":{"Rust":-5}}]}"#, "repositories[0].languages"),
        (r#"{"repositories":[{"id":"a","role":"legendary"}]}"#, "repositories[0].role"),
        (r#"{"repositories":[{"id":"a","updated_day":-4}]}"#, "repositories[0].updated_day"),
        (r#"{"repositories":[{"id":"a","created_year":12}]}"#, "repositories[0].created_year"),
        (r#"{"repositories":[{"id":"a"},{"id":" A "}]}"#, "repositories"),
        (r#"{"reference_day":-1,"repositories":[]}"#, "reference_day"),
    ];
    for (text, path) in cases {
        let diagnostics = Engine::new(text).err().unwrap_or_else(|| panic!("accepted {text}"));
        assert!(has(&diagnostics, Code::InvalidEvidence, path), "{text}: {diagnostics:?}");
    }
    let many = json!({"repositories": (0..2049).map(|i| json!({"id": format!("r{i}")})).collect::<Vec<_>>()}).to_string();
    assert!(Engine::new(&many).is_err());
    assert!(Engine::new(r#"{"repositories":[]}"#).unwrap().compile(r#"{"schema_version":1}"#, Canvas::default())["ok"] == true);
}

// -------------------------------------------------------------- tools (#38-40)

#[test]
fn discovery_tools_return_bounded_results_with_stable_ids() {
    let engine = Engine::new(&evidence_json()).unwrap();
    let languages = engine.call_tool("list_languages", "{}");
    assert_eq!(languages["languages"][0], json!({"name":"Rust","repositories":4}));
    assert_eq!(languages["total"], 9);
    assert_eq!(engine.call_tool("list_topics", "")["topics"][0], json!({"name":"web","repositories":4}));

    let found = engine.call_tool("find_repositories", r#"{"filter":{"language":"Rust"},"limit":2}"#);
    assert_eq!(found["ok"], true);
    assert_eq!((found["total"].as_u64(), found["truncated"].as_bool()), (Some(4), Some(true)));
    assert_eq!(found["repositories"].as_array().unwrap().len(), 2);
    assert_eq!(found["repositories"][0]["id"], "ada/orbit-engine");
    assert_eq!(found["filter"], json!({"language":"Rust"}));

    let described = engine.call_tool("describe_repository", r#"{"id":"ADA/orbit-engine"}"#);
    assert_eq!(described["repository"]["id"], "ada/orbit-engine");
    assert_eq!(described["repository"]["languages"][0], json!({"name":"Rust","share":0.9}));
    assert_eq!(described["repository"]["updated_days_before_reference"], 5);
    assert_eq!(described["repository"]["role_source"], "declared");
    assert_eq!(engine.call_tool("describe_repository", r#"{"id":"x"}"#)["diagnostics"][0]["code"], "unknown_repository");
}

#[test]
fn portfolio_overview_is_a_bounded_snapshot_of_evidence_not_a_judgement() {
    let engine = Engine::new(&evidence_json()).unwrap();
    let overview = engine.call_tool("portfolio_overview", "{}");
    assert_eq!(overview["ok"], true);
    assert_eq!(overview["repositories"], json!({"total":15,"archived":2,"forks":1}));
    assert_eq!(overview["updated"], json!({"within_90_days":4,"within_a_year":3,"over_a_year_ago":8,"unknown":0}));
    assert_eq!(overview["roles"][0], json!({"role":"featured","repositories":3,"examples":["ada/constellation-ui","ada/lightbeam","ada/orbit-engine"]}));
    assert_eq!(overview["roles_source"], "declared");
    assert_eq!(overview["languages"][0], json!({"name":"Rust","repositories":4}));
    assert_eq!(overview["most_starred"][0]["id"], "ada/orbit-engine");
    assert_eq!(overview["most_recently_updated"][0]["id"], "ada/constellation-ui");
    assert!(overview["most_starred"].as_array().unwrap().len() <= 8 && overview["languages"].as_array().unwrap().len() <= 10);
    // Apart from the note that says so, nothing in the data reads as an assessment.
    let mut data = overview.clone();
    data.as_object_mut().unwrap().remove("note");
    let text = data.to_string().to_lowercase();
    for judgement in ["senior", "expert", "score", "rating", "best", "strong", "skill"] {
        assert!(!text.contains(judgement), "overview makes a judgement: {judgement}");
    }
    assert_eq!(engine.call_tool("portfolio_overview", "{}"), overview);
    // Large and empty accounts stay bounded and valid.
    let big = json!({"repositories": (0..2000).map(|i| json!({"id": format!("o/r{i:04}"), "languages": {"Rust": 1}, "topics": [format!("t{}", i % 40)], "stars": i})).collect::<Vec<_>>()}).to_string();
    assert!(Engine::new(&big).unwrap().portfolio_overview().to_string().len() < 8000);
    assert_eq!(Engine::new(r#"{"repositories":[]}"#).unwrap().portfolio_overview()["repositories"]["total"], 0);
}

#[test]
fn preview_and_validate_cover_zero_match_ambiguous_and_oversized_requests() {
    let engine = Engine::new(&evidence_json()).unwrap();
    let before = (engine.edge_pairs(), engine.summary());
    let zero = engine.call_tool("preview_group", r#"{"group":{"name":"Giants","match":{"stars":{"min":50000}}}}"#);
    assert_eq!((zero["ok"].as_bool(), zero["total"].as_u64()), (Some(true), Some(0)));
    assert_eq!(zero["diagnostics"][0]["code"], "empty_group");

    // One object with several keys is ambiguous to read; it is normalized to an explicit `all`.
    let ambiguous = engine.call_tool("preview_group", r#"{"group":{"name":"Web experiments","match":{"topic":"web","language":"TypeScript"},"placement":"edge"}}"#);
    assert_eq!(ambiguous["group"]["match"], json!({"all":[{"language":"TypeScript"},{"topic":"web"}]}));
    assert_eq!(ambiguous["group"]["placement"], "outer");
    assert_eq!(ambiguous["total"], 3);
    assert_eq!(ambiguous["members"][0]["reasons"].as_array().unwrap().len(), 2);

    let oversized = engine.call_tool("preview_group", &json!({"group":{"name":"All","match":{"fork":false}},"limit":MAX_RESULTS + 1}).to_string());
    assert_eq!(oversized["diagnostics"][0]["code"], "out_of_range");
    assert_eq!(oversized["diagnostics"][0]["bounds"]["max"], MAX_RESULTS as f64);
    let capped = engine.call_tool("preview_group", &json!({"group":{"name":"All","match":{"fork":false}},"limit":3}).to_string());
    assert_eq!((capped["total"].as_u64(), capped["truncated"].as_bool(), capped["members"].as_array().unwrap().len()), (Some(14), Some(true), 3));
    assert_eq!(engine.call_tool("find_repositories", &format!(r#"{{"filter":{{"topic":"{}"}}}}"#, "a".repeat(MAX_SPEC_BYTES)))["diagnostics"][0]["code"], "spec_too_large");

    let valid = engine.call_tool("validate_spec", &json!({"spec": serde_json::from_str::<Value>(&read("examples/specs/topic-clusters.json")).unwrap()}).to_string());
    assert_eq!(valid["ok"], true);
    assert!(valid.get("compiled").is_none());
    let invalid = engine.call_tool("validate_spec", r#"{"spec":{"schema_version":1,"layout":{"kind":"spiral"}}}"#);
    assert_eq!((invalid["ok"].as_bool(), invalid["diagnostics"][0]["path"].as_str()), (Some(false), Some("layout.kind")));
    assert_eq!(engine.call_tool("compile_spec", r#"{"spec":{"schema_version":1}}"#)["compiled"]["repositories"]["total"], 15);

    for (name, arguments, code) in [("launch_rockets", "{}", "unknown_tool"), ("find_repositories", "{}", "missing_field"), ("find_repositories", "[]", "invalid_type"), ("describe_repository", r#"{"id":4}"#, "invalid_type"), ("validate_spec", "{", "invalid_json")] {
        assert_eq!(engine.call_tool(name, arguments)["diagnostics"][0]["code"], code, "{name} {arguments}");
    }
    assert_eq!((engine.edge_pairs(), engine.summary()), before, "tools never mutate the engine");
}

#[test]
fn tool_definitions_are_provider_neutral_and_aligned_with_the_engine() {
    let definitions = tool_definitions();
    let tools = definitions["tools"].as_array().unwrap();
    let names: Vec<&str> = tools.iter().map(|tool| tool["name"].as_str().unwrap()).collect();
    assert_eq!(names, TOOL_NAMES);
    let engine = Engine::new(&evidence_json()).unwrap();
    for tool in tools {
        assert!(tool["description"].as_str().unwrap().len() > 20);
        assert_eq!(tool["input_schema"]["type"], "object");
        // Every published tool is dispatchable.
        assert_ne!(engine.call_tool(tool["name"].as_str().unwrap(), "{}")["diagnostics"][0]["code"], "unknown_tool");
    }
    let text = definitions.to_string().to_lowercase();
    for vendor in ["openai", "anthropic", "claude", "gemini", "gpt", "function_call", "tool_use"] {
        assert!(!text.contains(vendor), "tool definitions mention {vendor}");
    }
    // Parameters reuse the spec's own definitions rather than restating them.
    assert_eq!(tools[3]["input_schema"]["$defs"]["filter"], spec_schema()["$defs"]["filter"]);
    assert_eq!(tools[6]["input_schema"]["properties"]["spec"]["$ref"], spec_schema()["$id"]);
}

// ------------------------------------------------------------- schema (#28)

/// The checked-in schema files are generated from the Rust contract.
/// Regenerate with `npm run build:schema`.
#[test]
fn published_schema_files_match_the_rust_contract() {
    let pretty = |value: &Value| serde_json::to_string_pretty(value).unwrap();
    let module = format!(
        "// Generated from rust/constellation-spec/src/schema.rs by `npm run build:schema`; do not edit.\nexport const specSchema = {};\nexport const toolDefinitions = {};\n",
        pretty(&spec_schema()),
        pretty(&tool_definitions())
    );
    let files = [
        ("schemas/constellation-spec.v1.schema.json", format!("{}\n", pretty(&spec_schema()))),
        ("schemas/constellation-tools.v1.json", format!("{}\n", pretty(&tool_definitions()))),
        ("src/constellation-spec-schema.mjs", module),
    ];
    for (path, generated) in files {
        if std::env::var_os("UPDATE_SPEC_SCHEMA").is_some() {
            std::fs::write(root().join(path), &generated).unwrap();
        }
        assert_eq!(read(path), generated, "{path} is stale; run `npm run build:schema`");
    }
}

#[test]
fn schema_vocabularies_and_bounds_come_from_the_validator() {
    let schema = spec_schema();
    assert_eq!(schema["properties"]["schema_version"]["enum"], json!(SUPPORTED_SCHEMA_VERSIONS));
    assert_eq!(schema["properties"]["groups"]["maxItems"], MAX_GROUPS);
    assert_eq!(schema["properties"]["layout"]["properties"]["kind"]["enum"], json!(LAYOUT_KINDS));
    assert_eq!(schema["$defs"]["group"]["properties"]["placement"]["enum"], json!(PLACEMENTS));
    let filter_keys: Vec<&str> = schema["$defs"]["filter"]["properties"].as_object().unwrap().keys().map(String::as_str).collect();
    let mut expected = FILTER_KEYS.to_vec();
    expected.sort_unstable();
    assert_eq!(filter_keys, expected);
    // No property anywhere in the contract names geometry or simulation internals.
    fn properties(value: &Value, out: &mut Vec<String>) {
        match value {
            Value::Object(map) => {
                if let Some(Value::Object(fields)) = map.get("properties") {
                    out.extend(fields.keys().cloned());
                }
                map.values().for_each(|child| properties(child, out));
            }
            Value::Array(items) => items.iter().for_each(|child| properties(child, out)),
            _ => {}
        }
    }
    let mut names = Vec::new();
    properties(&schema, &mut names);
    for forbidden in ["x", "y", "position", "positions", "coordinates", "force", "forces", "iterations", "velocity"] {
        assert!(!names.iter().any(|name| name == forbidden), "schema exposes {forbidden}");
    }
}

// ------------------------------------------------- property / fuzz tests (#50)

/// Small deterministic generator: the same seed always explores the same inputs,
/// so CI runs a fixed, reproducible subset.
struct Rng(u64);
impl Rng {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn below(&mut self, n: usize) -> usize {
        (self.next() % n as u64) as usize
    }
    fn pick<'a>(&mut self, items: &[&'a str]) -> &'a str {
        items[self.below(items.len())]
    }
}

const WORDS: &[&str] = &[
    "schema_version", "focus", "groups", "relationships", "layout", "ranking", "style", "kind", "value", "id", "label", "name", "match", "placement",
    "basis", "strength", "cluster_by", "by", "limit", "motion", "orbit_shape", "rings", "language", "topic", "role", "repository", "stars", "updated",
    "archived", "fork", "any", "all", "not", "min", "max", "within_days", "older_than_days", "radial", "outer", "inner", "center", "shared_topic",
    "shared_language", "Rust", "wasm", "experimental", "featured", "ada/lightbeam", "ada/nope", "__proto__", "constructor", "", " ", "\u{0}", "💫", "x", "position",
];

fn scalar(rng: &mut Rng) -> Value {
    match rng.below(14) {
        0 => Value::Null,
        1 => json!(rng.below(2) == 0),
        2 => json!(1),
        3 => json!(rng.below(5)),
        4 => json!(-(rng.below(1000) as i64)),
        5 => json!(rng.next()),
        6 => json!((rng.next() % 4000) as f64 / 1000.0 - 1.0),
        7 => json!(f64::MAX),
        8 => json!(f64::MIN_POSITIVE),
        9 => json!(-0.0),
        10 => json!("a".repeat(rng.below(400))),
        _ => json!(rng.pick(WORDS)),
    }
}

fn arbitrary(rng: &mut Rng, depth: usize) -> Value {
    if depth == 0 || rng.below(3) == 0 {
        return scalar(rng);
    }
    if rng.below(3) == 0 {
        Value::Array((0..rng.below(6)).map(|_| arbitrary(rng, depth - 1)).collect())
    } else {
        Value::Object((0..rng.below(6)).map(|_| (rng.pick(WORDS).to_owned(), arbitrary(rng, depth - 1))).collect())
    }
}

/// Replace one random node of a valid document with arbitrary content.
fn mutate(value: &mut Value, rng: &mut Rng) {
    match value {
        Value::Object(map) if !map.is_empty() && rng.below(4) != 0 => {
            let key = map.keys().nth(rng.below(map.len())).unwrap().clone();
            match rng.below(6) {
                0 => {
                    map.remove(&key);
                }
                1 => {
                    map.insert(rng.pick(WORDS).to_owned(), arbitrary(rng, 2));
                }
                _ => mutate(map.get_mut(&key).unwrap(), rng),
            }
        }
        Value::Array(items) if !items.is_empty() && rng.below(4) != 0 => match rng.below(6) {
            0 => {
                let copy = items[rng.below(items.len())].clone();
                let times = [1, 3, 40, 300][rng.below(4)];
                items.extend(std::iter::repeat_n(copy, times));
            }
            1 => items.clear(),
            _ => {
                let index = rng.below(items.len());
                mutate(&mut items[index], rng);
            }
        },
        _ => *value = arbitrary(rng, 3),
    }
}

/// The invariants every outcome must satisfy, whatever the input.
fn check_outcome(text: &str, evidence: &Evidence) {
    match parse_spec(text) {
        Ok(spec) => {
            // Anything accepted is normalized, in bounds, and round-trips.
            assert!(spec.groups.len() <= MAX_GROUPS && spec.relationships.len() <= MAX_RELATIONSHIPS && spec.layout.cluster_by.len() <= MAX_CLUSTER_BY);
            assert!(spec.relationships.iter().all(|r| r.strength.is_finite() && (0.0..=1.0).contains(&r.strength)));
            assert!(spec.ranking.limit.is_none_or(|limit| (1..=MAX_LIMIT as u32).contains(&limit)));
            let canonical = spec.to_value().to_string();
            assert_eq!(parse_spec(&canonical).as_ref(), Ok(&spec), "{canonical}");
            match compile(spec, evidence, Canvas::default()) {
                Ok(compiled) => {
                    assert!(compiled.positions.iter().flatten().all(|p| p[0].is_finite() && p[1].is_finite()));
                    assert!(compiled.edges.iter().all(|e| e.a < e.b && e.weight.is_finite() && e.weight > 0.0 && e.weight <= 1.0));
                    assert!(!compiled.warnings.has_errors());
                }
                Err(diagnostics) => assert!(diagnostics.has_errors()),
            }
        }
        Err(diagnostics) => {
            assert!(diagnostics.has_errors(), "rejected without an error: {text}");
            assert!(diagnostics.items.len() <= MAX_DIAGNOSTICS);
            for item in &diagnostics.items {
                assert!(!item.message.is_empty() && item.path.len() < 400 && item.allowed.len() <= 64);
                assert!(item.received.as_ref().is_none_or(|echo| echo.chars().count() <= 81));
            }
        }
    }
}

#[test]
fn fuzz_arbitrary_json_never_panics_the_validator() {
    let evidence = evidence();
    let mut rng = Rng(0x9E37_79B9_7F4A_7C15);
    for _ in 0..4000 {
        let mut value = arbitrary(&mut rng, 5);
        if rng.below(2) == 0 {
            if let Value::Object(map) = &mut value {
                map.insert("schema_version".into(), json!(1));
            }
        }
        check_outcome(&value.to_string(), &evidence);
    }
}

#[test]
fn fuzz_mutated_valid_specs_never_panic_and_accepted_ones_round_trip() {
    let evidence = evidence();
    let seeds: Vec<Value> = examples().iter().map(|(_, text)| serde_json::from_str(text).unwrap()).collect();
    let mut rng = Rng(0xD1B5_4A32_D192_ED03);
    let (mut accepted, mut rejected) = (0, 0);
    for round in 0..6000 {
        let mut value = seeds[round % seeds.len()].clone();
        for _ in 0..=rng.below(3) {
            mutate(&mut value, &mut rng);
        }
        let text = value.to_string();
        if parse_spec(&text).is_ok() { accepted += 1 } else { rejected += 1 }
        check_outcome(&text, &evidence);
    }
    // The corpus must exercise both sides of the validator to mean anything.
    assert!(accepted > 300 && rejected > 300, "accepted {accepted}, rejected {rejected}");
}

#[test]
fn fuzz_raw_bytes_and_truncated_documents_never_panic() {
    let evidence = evidence();
    let mut rng = Rng(0x2545_F491_4F6C_DD1D);
    let alphabet: Vec<char> = "{}[]\":,0123456789.-+eE truefalsnu\\\u{0}\u{7f}é💫".chars().collect();
    for _ in 0..3000 {
        let text: String = (0..rng.below(120)).map(|_| alphabet[rng.below(alphabet.len())]).collect();
        check_outcome(&text, &evidence);
    }
    for (_, text) in examples() {
        for end in (0..text.len()).step_by(7) {
            if text.is_char_boundary(end) {
                check_outcome(&text[..end], &evidence);
            }
        }
    }
}

#[test]
fn fuzz_tools_and_evidence_never_panic_and_always_answer_with_a_verdict() {
    let engine = Engine::new(&evidence_json()).unwrap();
    let mut rng = Rng(0xA076_1D64_78BD_642F);
    let names = ["portfolio_overview", "list_languages", "list_topics", "find_repositories", "describe_repository", "preview_group", "validate_spec", "compile_spec", "", "eval", "__proto__"];
    for _ in 0..3000 {
        let arguments = match rng.below(4) {
            0 => arbitrary(&mut rng, 4),
            1 => json!({"filter": arbitrary(&mut rng, 4), "limit": scalar(&mut rng)}),
            2 => json!({"group": arbitrary(&mut rng, 4), "id": scalar(&mut rng)}),
            _ => json!({"spec": arbitrary(&mut rng, 5)}),
        };
        let result = engine.call_tool(rng.pick(&names), &arguments.to_string());
        let ok = result["ok"].as_bool().expect("every tool result states ok");
        assert!(ok || !result["diagnostics"].as_array().unwrap().is_empty());
        assert!(result.to_string().len() < 400_000, "tool output is bounded");
    }
    for _ in 0..1500 {
        let text = json!({"reference_day": scalar(&mut rng), "repositories": (0..rng.below(5)).map(|_| arbitrary(&mut rng, 3)).collect::<Vec<_>>()}).to_string();
        if let Ok(engine) = Engine::new(&text) {
            assert_eq!(engine.compile(r#"{"schema_version":1}"#, Canvas::default())["ok"], true);
        }
    }
}

#[test]
fn size_limits_reject_pathological_input_before_allocating_for_it() {
    // A million-element list is refused by its length, never walked item by item.
    let list = format!(r#"{{"schema_version":1,"groups":[{}]}}"#, vec!["{}"; 60_000].join(","));
    let diagnostics = errors(&list);
    assert_eq!(diagnostics.items.len(), 1);
    assert_eq!(diagnostics.items[0].code, Code::TooMany);
    assert!(RawConstellationSpec::from_json(&" ".repeat(MAX_SPEC_BYTES + 1)).is_err());
    let filters = format!(r#"{{"schema_version":1,"groups":[{{"id":"a","match":{{"any":[{}]}}}}]}}"#, vec![r#"{"fork":true}"#; 5000].join(","));
    assert!(has(&errors(&filters), Code::TooMany, "groups[0].match.any"));
}
