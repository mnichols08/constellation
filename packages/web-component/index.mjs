import { createScene, parseScene, serializeScene, parseConfig, normalizeConfig, renderSceneSVG, createDataPipeline, createLayoutHost } from '@constellation/core';
import { mountInteractive, interactiveStyles, interactiveMarkup, shortest_path, neighbors } from '@constellation/core/browser-runtime';

export class ConstellationView extends HTMLElement {
  static observedAttributes = ['src', 'config', 'account'];
  #config = null;
  #records = [];
  #scene = null;
  #runtime = null;
  #request = null;
  #pipeline = createDataPipeline();
  #layouts = createLayoutHost();
  #initialized = false;
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  get config() { return this.#config && structuredClone(this.#config); }
  set config(value) { this.setConfig(value); }
  get records() { return structuredClone(this.#records); }
  set records(value) {
    if (!Array.isArray(value)) throw new Error('records must be an array.');
    this.#records = structuredClone(value); this.#refresh();
  }
  get scene() { return this.#scene && structuredClone(this.#scene); }
  set scene(value) { this.loadScene(value); }
  setConfig(value) {
    try {
      const config = parseConfig(value); normalizeConfig(config.options);
      this.#config = config; return this.#refresh(false);
    } catch (error) { this.#error(error); return Promise.resolve(false); }
  }
  loadScene(value) {
    try {
      const scene = parseScene(typeof value === 'string' ? value : serializeScene(value));
      this.#request?.abort(); this.#scene = scene; this.#config = null;
      return this.#render();
    } catch (error) { this.#error(error); return false; }
  }
  #active() { if (!this.#runtime) throw new Error('Constellation view is not ready.'); return this.#runtime; }
  selectNode(id, options) { return this.#active().selectNode(id, options); }
  clearSelection() { return this.#active().clearSelection(); }
  fit() { return this.#active().fit(); }
  reset() { return this.#active().reset(); }
  setFilter(value) { return this.#active().setFilter(value); }
  setTheme(value) { return this.#active().setTheme(value); }
  get selection() { return this.#runtime?.selectionState || { start: null, end: null, path: [] }; }
  connectedCallback() { this.#refresh(); }
  disconnectedCallback() { this.#request?.abort(); this.#runtime?.destroy(); this.#runtime = null; this.#initialized = false; }
  attributeChangedCallback(name, previous, value) {
    if (previous === value) return;
    if (name === 'config') {
      try { this.#config = value === null ? null : parseConfig(value); }
      catch (error) { this.#error(error); return; }
    }
    if (this.isConnected) this.#refresh();
  }
  #error(error) {
    this.dispatchEvent(new CustomEvent('error', { detail: { message: error.message }, bubbles: true, composed: true }));
    if (!this.#runtime) { const message = document.createElement('p'); message.setAttribute('role', 'alert'); message.textContent = error.message; this.shadowRoot.replaceChildren(message); }
  }
  async #refresh(loadSource = true) {
    if (!this.isConnected) return false;
    this.#request?.abort(); const request = new AbortController(); this.#request = request;
    try {
      const src = loadSource && this.getAttribute('src');
      if (src) {
        const url = new URL(src, this.ownerDocument.baseURI);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('src must be an HTTP(S) JSON URL.');
        const response = await fetch(url, { signal: request.signal });
        if (!response.ok) throw new Error(`Unable to load visualization (${response.status}).`);
        const text = await response.text(); request.signal.throwIfAborted();
        if (text.length > 32 * 1024 * 1024) throw new Error('Visualization JSON exceeds 32 MiB.');
        const data = JSON.parse(text);
        if (['scene', 'time-lapse'].includes(data.kind)) { this.#scene = parseScene(text); this.#config = null; }
        else { this.#config = parseConfig(data.config || data); if (data.records !== undefined) { if (!Array.isArray(data.records)) throw new Error('records must be an array.'); this.#records = data.records; } }
      }
      if (this.#config || !this.#scene) {
        const config = this.#config || parseConfig({ account: this.getAttribute('account') || 'your-universe', options: {}, version: 6 });
        // Browser embedding uses the strict imported-CSS boundary, including v6 inputs.
        const options = normalizeConfig(config.options);
        this.#scene = createScene(config.account, this.#records, options, { pipeline: this.#pipeline, layoutHost: this.#layouts, signal: request.signal });
      }
      request.signal.throwIfAborted(); return this.#render();
    } catch (error) { if (!request.signal.aborted) this.#error(error); return false; }
  }
  #render() {
    if (!this.isConnected || !this.#scene) return false;
    try {
      // Validate custom styling before inserting renderer-owned SVG markup.
      const scenes = this.#scene.kind === 'time-lapse' ? [this.#scene, this.#scene.latest, ...this.#scene.frames.map(frame => frame.scene)] : [this.#scene];
      for (const scene of scenes) for (const key of ['css', 'customCSS']) {
        const css = scene.presentation.options[key];
        if (css && /(?:@import|url\s*\(|expression\s*\(|\\)/i.test(css.replace(/\/\*[\s\S]*?\*\//g, ''))) throw new Error('Embedded scene CSS must be self-contained.');
      }
      const markup = interactiveMarkup(renderSceneSVG(this.#scene));
      this.#runtime?.destroy();
      this.shadowRoot.innerHTML = `<style>:host{display:block;min-width:0}${interactiveStyles}</style>${markup}`;
      this.#runtime = mountInteractive(this.shadowRoot.querySelector('main'), this.#scene, { engine: { shortest_path, neighbors }, emitReady: false });
      const first = !this.#initialized; this.#initialized = true;
      this.dispatchEvent(new CustomEvent(first ? 'scene-ready' : 'scene-change', { detail: { scene: this.scene }, bubbles: true, composed: true }));
      return true;
    } catch (error) { this.#error(error); return false; }
  }
}

export function defineConstellationView(name = 'constellation-view', registry = customElements) {
  if (registry.get(name)) return registry.get(name);
  registry.define(name, class extends ConstellationView {});
  return registry.get(name);
}

defineConstellationView();
