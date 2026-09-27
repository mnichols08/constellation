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
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  get config() { return this.#config && structuredClone(this.#config); }
  set config(value) { this.#config = parseConfig(value); this.#refresh(); }
  get records() { return structuredClone(this.#records); }
  set records(value) {
    if (!Array.isArray(value)) throw new Error('records must be an array.');
    this.#records = structuredClone(value); this.#refresh();
  }
  get scene() { return this.#scene && structuredClone(this.#scene); }
  set scene(value) { this.#scene = parseScene(typeof value === 'string' ? value : serializeScene(value)); this.#config = null; this.#render(); }
  connectedCallback() { this.#refresh(); }
  disconnectedCallback() { this.#request?.abort(); this.#runtime?.destroy(); this.#runtime = null; }
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
  async #refresh() {
    if (!this.isConnected) return;
    this.#request?.abort(); const request = new AbortController(); this.#request = request;
    try {
      const src = this.getAttribute('src');
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
      request.signal.throwIfAborted(); this.#render();
    } catch (error) { if (!request.signal.aborted) this.#error(error); }
  }
  #render() {
    if (!this.isConnected || !this.#scene) return;
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
      this.#runtime = mountInteractive(this.shadowRoot.querySelector('main'), this.#scene, { engine: { shortest_path, neighbors } });
    } catch (error) { this.#error(error); }
  }
}

export function defineConstellationView(name = 'constellation-view', registry = customElements) {
  if (registry.get(name)) return registry.get(name);
  registry.define(name, class extends ConstellationView {});
  return registry.get(name);
}

defineConstellationView();
