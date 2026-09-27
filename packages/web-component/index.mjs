import { createScene, parseScene, serializeScene, parseConfig, normalizeConfig, renderSceneSVG, createDataPipeline, createLayoutHost } from '@constellation/core';
import { mountInteractive, mountTimeline, replaceInteractiveSVG, interactiveStyles, interactiveMarkup, shortest_path, neighbors } from '@constellation/core/browser-runtime';

export class ConstellationView extends HTMLElement {
  static observedAttributes = ['src', 'config', 'account', 'loading'];
  #config = null;
  #records = [];
  #scene = null;
  #runtime = null;
  #request = null;
  #pipeline = createDataPipeline();
  #layouts = createLayoutHost();
  #initialized = false;
  #intersection = null;
  #visible = true;
  #sourceMode = true;
  #sourceCache = new Map();
  constructor() { super(); this.attachShadow({ mode: 'open' }); }
  get config() { return this.#config && structuredClone(this.#config); }
  set config(value) { this.setConfig(value); }
  get records() { return structuredClone(this.#records); }
  set records(value) {
    if (!Array.isArray(value)) throw new Error('records must be an array.');
    this.#records = structuredClone(value); this.#refresh(false);
  }
  get scene() { return this.#scene && structuredClone(this.#scene); }
  set scene(value) { this.loadScene(value); }
  setConfig(value) {
    try {
      const config = parseConfig(value); normalizeConfig(config.options);
      this.#sourceMode = false; this.#config = config; return this.#refresh(false);
    } catch (error) { this.#error(error); return Promise.resolve(false); }
  }
  loadScene(value) {
    try {
      const scene = parseScene(typeof value === 'string' ? value : serializeScene(value));
      this.#request?.abort(); const previous = this.#scene;
      this.#sourceMode = false; this.#scene = scene; this.#config = null;
      const rendered = this.#render();
      if (!rendered && this.isConnected && this.#visible) this.#scene = previous;
      return rendered;
    } catch (error) { this.#error(error); return false; }
  }
  #active() { if (!this.#runtime) throw new Error('Constellation view is not ready.'); return this.#runtime; }
  selectNode(id, options) { return this.#active().selectNode(id, options); }
  clearSelection() { return this.#active().clearSelection(); }
  fit() { return this.#active().fit(); }
  reset() { return this.#active().reset(); }
  setFilter(value) { return this.#active().setFilter(value); }
  setTheme(value) { return this.#active().setTheme(value); }
  setFrame(value) { const runtime = this.#active(); if (!runtime.setFrame) throw new Error('This scene has no timeline.'); return runtime.setFrame(value); }
  setDate(value) { const runtime = this.#active(); if (!runtime.setDate) throw new Error('This scene has no timeline.'); return runtime.setDate(value); }
  compareWithNow(value) { const runtime = this.#active(); if (!runtime.compareWithNow) throw new Error('This scene has no timeline.'); return runtime.compareWithNow(value); }
  get selection() { return this.#runtime?.selectionState || { start: null, end: null, path: [] }; }
  connectedCallback() { this.#observe(); }
  disconnectedCallback() {
    this.#request?.abort(); this.#intersection?.disconnect(); this.#intersection = null;
    this.#runtime?.destroy(); this.#runtime = null; this.#initialized = false;
    this.#pipeline.clear(); this.#layouts.clearCache();
  }
  #observe() {
    this.#intersection?.disconnect(); this.#intersection = null;
    this.#visible = this.getAttribute('loading') !== 'lazy' || typeof IntersectionObserver !== 'function';
    if (this.#visible) { this.#refresh(); return; }
    this.#intersection = new IntersectionObserver(entries => {
      if (!entries.some(entry => entry.isIntersecting)) return;
      this.#visible = true; this.#intersection.disconnect(); this.#intersection = null; this.#refresh();
    }, { rootMargin: '200px' });
    this.#intersection.observe(this);
  }
  reload() { this.#sourceCache.clear(); this.#sourceMode = true; return this.#refresh(); }
  get cacheStatistics() { return { sources: this.#sourceCache.size, sourceLimit: 4, pipeline: this.#pipeline.cacheStatistics, layout: this.#layouts.cacheStatistics }; }
  attributeChangedCallback(name, previous, value) {
    if (previous === value) return;
    if (name === 'src') { this.#sourceMode = true; this.#request?.abort(); }
    if (name === 'loading') { if (this.isConnected) this.#observe(); return; }
    if (name === 'config') {
      try { this.#config = value === null ? null : parseConfig(value); this.#sourceMode = false; }
      catch (error) { this.#error(error); return; }
    }
    if (this.isConnected) this.#refresh();
  }
  #error(error) {
    this.dispatchEvent(new CustomEvent('error', { detail: { message: error.message }, bubbles: true, composed: true }));
    if (!this.#runtime) { const message = document.createElement('p'); message.setAttribute('role', 'alert'); message.textContent = error.message; this.shadowRoot.replaceChildren(message); }
  }
  async #refresh(loadSource = true) {
    if (!this.isConnected || !this.#visible) return false;
    this.#request?.abort(); const request = new AbortController(); this.#request = request;
    try {
      const src = loadSource && this.#sourceMode && this.getAttribute('src');
      if (src) {
        const url = new URL(src, this.ownerDocument.baseURI);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('src must be an HTTP(S) JSON URL.');
        let text = this.#sourceCache.get(url.href);
        if (text === undefined) {
          const response = await fetch(url, { signal: request.signal });
          if (!response.ok) throw new Error(`Unable to load visualization (${response.status}).`);
          text = await response.text();
        }
        request.signal.throwIfAborted();
        if (text.length > 32 * 1024 * 1024) throw new Error('Visualization JSON exceeds 32 MiB.');
        const data = JSON.parse(text);
        if (['scene', 'time-lapse'].includes(data.kind)) { this.#scene = parseScene(text); this.#config = null; }
        else { this.#config = parseConfig(data.config || data); if (data.records !== undefined) { if (!Array.isArray(data.records)) throw new Error('records must be an array.'); this.#records = data.records; } }
        if (text.length <= 1024 * 1024) {
          this.#sourceCache.delete(url.href); this.#sourceCache.set(url.href, text);
          while (this.#sourceCache.size > 4) this.#sourceCache.delete(this.#sourceCache.keys().next().value);
        }
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
    if (!this.isConnected || !this.#visible || !this.#scene) return false;
    try {
      // Validate custom styling before inserting renderer-owned SVG markup.
      const scenes = this.#scene.kind === 'time-lapse' ? [this.#scene, this.#scene.latest, ...this.#scene.frames.map(frame => frame.scene)] : [this.#scene, ...this.#scene.timeline?.frames.map(frame => frame.scene) || []];
      for (const scene of scenes) for (const key of ['css', 'customCSS']) {
        const css = scene.presentation.options[key];
        if (css && /(?:@import|url\s*\(|expression\s*\(|\\)/i.test(css.replace(/\/\*[\s\S]*?\*\//g, ''))) throw new Error('Embedded scene CSS must be self-contained.');
      }
      const markup = interactiveMarkup(renderSceneSVG(this.#scene));
      this.#runtime?.destroy();
      this.shadowRoot.innerHTML = `<style>:host{display:block;min-width:0}${interactiveStyles}</style>${markup}`;
      this.#runtime = mountTimeline(this.shadowRoot.querySelector('main'), this.#scene, { engine: { shortest_path, neighbors }, replaceSVG: replaceInteractiveSVG, emitReady: false, frameSVGs: this.#scene.timeline?.frames.map(frame => renderSceneSVG(frame.scene)) || [] }, mountInteractive);
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
