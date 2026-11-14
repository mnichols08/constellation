// Registration seam for the optional ConstellationSpec engine.
//
// The spec engine is a separate Rust/WASM module (src/constellation-spec.mjs).
// Core never imports it: a host registers here, and configuration validation
// and layout use it when present. Without a host, `constellationSpec` is kept
// as inert, size-checked data and has no effect on a scene.
let host = null;

/**
 * @param {{ validate(spec): { ok: boolean, spec?: object, diagnostics: object[] },
 *           placements(spec, repositories, options): Map<string, [number, number]> } | null} next
 */
export function registerSpecHost(next) {
  if (next !== null && (typeof next?.validate !== 'function' || typeof next?.placements !== 'function')) throw new Error('A spec host needs validate() and placements().');
  host = next;
}
export const specHost = () => host;

const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
/** True when the layout pipeline should place stars from `options.constellationSpec`. */
export function specActive(options = {}) {
  const spec = options.constellationSpec;
  return Boolean(host) && object(spec) && (spec.layout?.kind ?? 'radial') === 'radial' && (options.arrangement || 'rings') === 'rings'
    && (options.nodeMode || 'repositories') === 'repositories' && !options.layoutEngine && !options.temporalStack?.enabled;
}
