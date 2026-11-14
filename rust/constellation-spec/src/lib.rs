//! ConstellationSpec: the versioned semantic contract between an author (a
//! person, a JavaScript client, a config file or a language model) and the
//! deterministic engine. See docs/ai/AI-CONSTELLATION-SPEC.md.
//!
//! untrusted JSON -> `RawConstellationSpec` -> `ConstellationSpec` (validated)
//!   -> `compile` with repository evidence -> `Compiled` graph intent.
pub mod compile;
pub mod diagnostics;
pub mod engine;
pub mod evidence;
pub mod model;
pub mod parse;
// Schema and tool definitions are generated natively into checked-in files
// (schemas/, src/constellation-spec-schema.mjs); the WASM binary does not carry them.
#[cfg(not(target_arch = "wasm32"))]
pub mod schema;


#[cfg(test)]
mod tests;

use wasm_bindgen::prelude::*;

/// Validate a ConstellationSpec without any repository evidence. Returns
/// `{ ok, spec | diagnostics }` as JSON text and never throws on authored input.
#[wasm_bindgen]
pub fn validate_constellation_spec(spec: &str) -> String {
    match parse::parse_spec(spec) {
        Ok(parsed) => serde_json::json!({ "ok": true, "spec": parsed.to_value(), "diagnostics": [] }),
        Err(diagnostics) => serde_json::json!({ "ok": false, "diagnostics": diagnostics.items, "diagnostics_truncated": diagnostics.truncated }),
    }
    .to_string()
}

/// Persistent semantic engine for one loaded evidence set. Structured results
/// are JSON text; interaction hot paths (neighbours, paths, edges, bands,
/// positions) use numbers and typed arrays with no JSON round trip.
#[wasm_bindgen]
pub struct ConstellationEngine {
    engine: engine::Engine,
}

fn evidence_error(diagnostics: diagnostics::Diagnostics) -> String {
    serde_json::json!({ "ok": false, "diagnostics": diagnostics.items }).to_string()
}

#[wasm_bindgen]
impl ConstellationEngine {
    /// Throws a JSON diagnostics document when the evidence is invalid.
    #[wasm_bindgen(constructor)]
    pub fn new(evidence: &str) -> Result<ConstellationEngine, String> {
        engine::Engine::new(evidence).map(|engine| Self { engine }).map_err(evidence_error)
    }

    /// Replace the evidence, rebuild indexes and drop the applied spec.
    #[wasm_bindgen(js_name = setEvidence)]
    pub fn set_evidence(&mut self, evidence: &str) -> Result<(), String> {
        self.engine.set_evidence(evidence).map_err(evidence_error)
    }

    #[wasm_bindgen(js_name = validateSpec)]
    pub fn validate_spec(&self, spec: &str) -> String {
        self.engine.validate(spec).to_string()
    }

    /// Pure: compiles for inspection and retains nothing.
    #[wasm_bindgen(js_name = compileSpec)]
    pub fn compile_spec(&self, spec: &str, compact: bool, round: bool) -> String {
        self.engine.compile(spec, compile::Canvas { compact, round }).to_string()
    }

    /// Ring positions for a radial spec, without relationship scoring.
    pub fn placements(&self, spec: &str, compact: bool, round: bool) -> String {
        self.engine.placements(spec, compile::Canvas { compact, round }).to_string()
    }

    /// Compile and retain; a failing spec leaves the engine unchanged.
    #[wasm_bindgen(js_name = applySpec)]
    pub fn apply_spec(&mut self, spec: &str, compact: bool, round: bool) -> String {
        self.engine.apply(spec, compile::Canvas { compact, round }).to_string()
    }

    #[wasm_bindgen(js_name = appliedSpec)]
    pub fn applied_spec(&self) -> String {
        self.engine.applied_spec().to_string()
    }

    /// Dispatch one published tool by name. Never mutates the engine.
    #[wasm_bindgen(js_name = callTool)]
    pub fn call_tool(&self, name: &str, arguments: &str) -> String {
        self.engine.call_tool(name, arguments).to_string()
    }

    pub fn summary(&self) -> String {
        self.engine.summary().to_string()
    }

    #[wasm_bindgen(getter)]
    pub fn generation(&self) -> u32 {
        self.engine.generation()
    }

    #[wasm_bindgen(getter, js_name = repositoryCount)]
    pub fn repository_count(&self) -> u32 {
        self.engine.repository_count() as u32
    }

    /// Index of a repository id, or -1.
    #[wasm_bindgen(js_name = indexOf)]
    pub fn index_of(&self, id: &str) -> i32 {
        self.engine.index_of(id).map_or(-1, |index| index as i32)
    }

    #[wasm_bindgen(js_name = idAt)]
    pub fn id_at(&self, index: u32) -> Option<String> {
        self.engine.id_at(index).map(str::to_owned)
    }

    pub fn neighbors(&self, index: u32) -> Vec<u32> {
        self.engine.neighbors(index)
    }

    pub fn path(&self, start: u32, end: u32) -> Vec<u32> {
        self.engine.path(start, end)
    }

    #[wasm_bindgen(js_name = edgePairs)]
    pub fn edge_pairs(&self) -> Vec<u32> {
        self.engine.edge_pairs()
    }

    #[wasm_bindgen(js_name = edgeWeights)]
    pub fn edge_weights(&self) -> Vec<f32> {
        self.engine.edge_weights()
    }

    pub fn bands(&self) -> Vec<u8> {
        self.engine.bands()
    }

    pub fn positions(&self) -> Vec<f32> {
        self.engine.positions()
    }
}
