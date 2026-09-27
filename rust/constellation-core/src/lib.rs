mod geometry;
mod graph;
mod identity;
mod physics;
mod projection;
mod refinement;
mod scene;
mod stable;

use wasm_bindgen::prelude::*;

#[wasm_bindgen]
pub fn stable_positions(input: &str) -> Result<String, String> {
    let input = serde_json::from_str(input).map_err(|error| format!("Invalid overview: {error}"))?;
    serde_json::to_string(&stable::positions(input)?).map_err(|error| error.to_string())
}

#[wasm_bindgen]
pub fn refine_layout(input: &str) -> Result<String, String> {
    let input =
        serde_json::from_str(input).map_err(|error| format!("Invalid refinement: {error}"))?;
    serde_json::to_string(&refinement::refine(input)?).map_err(|error| error.to_string())
}

#[wasm_bindgen]
pub fn project_nodes(input: &str) -> Result<String, String> {
    let input =
        serde_json::from_str(input).map_err(|error| format!("Invalid projection: {error}"))?;
    serde_json::to_string(&projection::project(input)?).map_err(|error| error.to_string())
}

#[wasm_bindgen]
pub fn compute_scene(input: &str) -> Result<String, String> {
    let input = serde_json::from_str(input).map_err(|error| format!("Invalid scene: {error}"))?;
    serde_json::to_string(&scene::compute(input)?).map_err(|error| error.to_string())
}

#[wasm_bindgen]
pub fn identity_geometry(input: &str, variation: u32) -> Result<Vec<f64>, String> {
    identity::generate(input, variation).map_err(str::to_owned)
}

#[wasm_bindgen]
pub fn identity_points(input: &str, count: u32, rotations: &[f64]) -> Result<Vec<f64>, String> {
    identity::rotated_points(input, count as usize, rotations).map_err(str::to_owned)
}

#[wasm_bindgen]
pub fn shortest_path(count: u32, pairs: &[u32], start: u32, end: u32) -> Result<Vec<u32>, String> {
    graph::Graph::new(count, pairs, 900.0, 560.0)
        .and_then(|graph| graph.find_path(start, end))
        .map_err(str::to_owned)
}

#[wasm_bindgen]
pub fn neighbors(count: u32, pairs: &[u32], start: u32) -> Result<Vec<u32>, String> {
    graph::Graph::new(count, pairs, 900.0, 560.0).map_err(str::to_owned)?;
    if start >= count {
        return Err("Unknown node index".into());
    }
    let mut result = std::collections::BTreeSet::new();
    for pair in pairs.chunks_exact(2) {
        if pair[0] == start {
            result.insert(pair[1]);
        }
        if pair[1] == start {
            result.insert(pair[0]);
        }
    }
    Ok(result.into_iter().collect())
}
