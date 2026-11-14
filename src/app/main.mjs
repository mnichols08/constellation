// Studio composition root: wires the store, engine and views, and owns every
// command a view can ask for. Views never call each other directly.

import { createStore } from './store.mjs';
import { createEngine, defaultOptions, friendlyError } from './engine.mjs';
import { applySetting, settingsById, composeCSS } from './settings.mjs';
import { announce } from './dom.mjs';
import { applyMotion } from './motion.mjs';
import { mountHome } from './views/home.mjs';
import { mountStudio } from './views/studio.mjs';
import { mountToasts } from './views/toasts.mjs';
import { createConfigStore } from '../config-store.mjs';
import { parseConfig } from '../config-schema.mjs';
import { decodeShare } from '../share-link.mjs';
import { selectRepositories } from '../constellation.mjs';
import { newDesignCode, randomizeDesign } from '../design-randomizer.mjs';
import { randomizeParts } from '../randomize-parts.mjs';
import { seededRandom } from '../seeded-random.mjs';

const DRAFT_DELAY = 400;
const TECH_STACK_INTENT = 'constellation-tech-stack-intent';
// Layouts that always show one named star per project.
const SHUFFLE_LAYOUTS = ['galaxy', 'rings', 'solar-system', 'orbital', 'force', 'field'];

export function startStudio({ win = window, doc = document } = {}) {
  const engine = createEngine({ win, doc });
  let local;
  try { local = win.localStorage; } catch {}
  const designs = createConfigStore(local);
  const store = createStore();
  const toasts = mountToasts(doc.getElementById('toasts'));
  let loadToken = 0;
  let shuffles = 0;
  let lastShuffled = null;

  // ------------------------------------------------- described plans
  // The ConstellationSpec engine (Rust/WASM) and the prompt flow load on first
  // use, so visitors who never describe a layout download none of it.
  let specState = 'idle';
  let specModule = null;
  function loadSpec() {
    specModule ??= import('../spec-register.mjs').then((module) => { specState = 'ready'; return module; }, (error) => { specState = 'failed'; specModule = null; throw error; });
    return specModule;
  }
  let keywordModel = null;
  /** A page may provide its own model adapter; the built-in reader needs no network. */
  const customAdapter = () => (typeof win.constellationModelAdapter?.generate === 'function' ? win.constellationModelAdapter : null);
  // Readers, in the order they are preferred: one the page connected, Claude
  // with the visitor's own key, Claude provided by this site (signed in), and
  // the built-in phrase matcher, which always works.
  let ownKeyModel = null;   // Holds the visitor's key in memory only; gone on reload.
  let hostedModel = null;
  let hosted = { available: false, checked: false };
  let hostedCheck = 0;
  let hostedDown = false;   // It refused a request as switched off; don't offer it again on this page.
  function refreshHosted() {
    if (!engine.ai.configured || hostedDown) { hosted = { available: false, checked: true }; return; }
    const check = ++hostedCheck;
    engine.ai.status().then((status) => {
      if (check !== hostedCheck) return;
      hosted = { ...status, checked: true };
      if (store.get().dialog === 'describe') ctx.refreshDialog?.();
    });
  }
  engine.onSessionChange(() => { hostedModel = null; if (store.get().dialog === 'describe') refreshHosted(); });
  const readerKind = () => (customAdapter() ? 'custom' : ownKeyModel ? 'own-key' : hosted.available && engine.ai.signedIn && hosted.remaining !== 0 ? 'hosted' : 'matcher');
  const canvasOf = (options) => ({ compact: options.layout === 'compact', round: options.orbitShape === 'round' });
  const evidenceOf = (options) => ({ projectShowcase: options.projectShowcase, referenceDate: options.referenceDate });

  // ----------------------------------------------------------- rendering
  let renderQueued = false;
  function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    queueMicrotask(() => {
      renderQueued = false;
      const { account, repositories, options, sample, screen } = store.get();
      if (screen !== 'studio' || !account) return;
      // A design that carries a described plan needs the spec engine, which is
      // a separate download. Wait for it once; if it cannot load, draw without.
      if (options.constellationSpec && specState === 'idle') {
        loadSpec().then(scheduleRender, scheduleRender);
        return;
      }
      try {
        const result = engine.render(account, repositories, options, { sample });
        store.update({ render: { ...result, error: null } });
      } catch (error) {
        // Keep the last good map on screen and say what went wrong.
        const previous = store.get().render;
        store.update({ render: { ...(previous || {}), error: error.message } });
      }
    });
  }

  // ------------------------------------------------------- draft autosave
  let draftTimer = null;
  // Set by an edit, cleared once written: an untouched design is never a draft.
  let draftDirty = false;
  function saveDraftNow() {
    clearTimeout(draftTimer);
    draftTimer = null;
    const { account, options, sample } = store.get();
    if (!draftDirty || !account || sample) return;
    draftDirty = false;
    designs.saveDraft(account, options);
  }
  function queueDraft() {
    draftDirty = true;
    clearTimeout(draftTimer);
    draftTimer = setTimeout(saveDraftNow, DRAFT_DELAY);
  }
  win.addEventListener('pagehide', saveDraftNow);

  store.subscribe((state, changed) => {
    if (changed.has('options') || changed.has('repositories') || (changed.has('screen') && state.screen === 'studio')) scheduleRender();
    // Only real edits become a draft: loading an account or opening a share
    // link must never overwrite the design you were working on.
    if (changed.has('reset')) draftDirty = false;
    else if (changed.has('options')) queueDraft();
  });

  // ------------------------------------------------- data a setting needs
  // A few settings need GitHub data beyond the first load (signed in only):
  // pinned projects replace the project list; activity effects need recent
  // events. Fetch each once, when a setting first asks for it.
  let loadedSource = 'all';
  const activityLoaded = new Set();
  store.subscribe((state, changed) => {
    if (!changed.has('options') || state.screen !== 'studio' || state.sample || !state.account) return;
    const { options, account } = state;
    const source = options.repoSource || 'all';
    if (source !== loadedSource && (source === 'all' || engine.access.capabilities.pinnedRepositories)) {
      loadedSource = source;
      engine.load(account, { repoSource: source }).then(({ repositories }) => {
        if (store.get().account === account) store.update({ repositories });
      }, (error) => {
        loadedSource = 'all';
        toasts.show(error.message, { tone: 'error' });
      });
    }
    const wantsActivity = (options.activityEffect && options.activityEffect !== 'off') || options.codingRhythm;
    const key = account.toLowerCase();
    if (wantsActivity && engine.access.capabilities.activity && !activityLoaded.has(key)) {
      activityLoaded.add(key);
      engine.loadActivity(account).then(() => scheduleRender(), (error) => {
        activityLoaded.delete(key);
        toasts.show(error.message, { tone: 'error' });
      });
    }
  });

  // ----------------------------------------------------------- URL state
  function setUrl(account) {
    const url = new URL(win.location.href);
    for (const key of [...url.searchParams.keys()]) url.searchParams.delete(key);
    if (account) url.searchParams.set('user', account);
    win.history.replaceState(null, '', url.pathname + url.search + url.hash);
  }

  // ------------------------------------------------------------- commands
  const actions = {
    async openAccount(input, { options: explicit = null, refresh = false } = {}) {
      const token = ++loadToken;
      saveDraftNow();
      store.update({ screen: 'loading', busy: true, status: { text: 'Finding your projects…' }, selected: null, dialog: null });
      try {
        const { account, repositories, profile } = await engine.load(input, {
          refresh,
          // A cancelled or replaced load must not keep writing status.
          onProgress: (done, total) => { if (token === loadToken) store.update({ status: { text: `Reading project details… ${done} of ${total}` } }); },
        });
        if (token !== loadToken) return false;
        const draft = explicit ? null : designs.draft(account);
        const options = explicit || draft?.options || defaultOptions(account, repositories, profile);
        loadedSource = 'all';
        store.resetOptions(options, { screen: 'studio', account, repositories, profile, sample: false, busy: false, status: null, render: null, panel: 'look' });
        setUrl(account);
        announce(`Showing ${repositories.length} projects for ${account}.`);
        if (draft && !explicit) toasts.show('Welcome back. We restored your last design.', { action: { label: 'Start fresh', run: () => actions.startFresh() } });
        return true;
      } catch (error) {
        if (token !== loadToken) return false;
        store.update({ screen: 'home', busy: false, status: { text: friendlyError(error), tone: 'error' } });
        return false;
      }
    },

    openSample(options = null) {
      saveDraftNow();
      const { account, repositories, profile } = engine.sample();
      store.resetOptions(options || defaultOptions(account, repositories, profile), {
        screen: 'studio', account, repositories, profile, sample: true, busy: false, status: null, render: null, panel: 'look', selected: null, dialog: null,
      });
      setUrl(null);
      announce('Showing an example sky.');
    },

    goHome() {
      saveDraftNow();
      loadToken++;
      toasts.dismissAll();
      store.update({ screen: 'home', dialog: null, selected: null, status: null, busy: false });
      setUrl(null);
    },

    startFresh() {
      const { account, repositories, profile } = store.get();
      store.setOptions(defaultOptions(account, repositories, profile), { label: 'Start fresh' });
    },

    /** Apply one registry setting. Errors become a toast, never an exception. */
    setSetting(id, value) {
      const setting = settingsById.get(id);
      try {
        return store.setOptions((options) => applySetting(options, id, value), { key: id, label: setting?.label || 'Change' });
      } catch (error) {
        toasts.show(error.message, { tone: 'error' });
        return false;
      }
    },

    /** Arbitrary options edit, e.g. featuring a project. */
    /** key: repeated changes with the same key (arrow-key moves) share one Undo step. */
    changeOptions(fn, label = 'Change', key = null) {
      return store.setOptions(fn, { label, key });
    },

    /** Replace every option at once from a validated configuration. */
    applyConfig(value, label = 'Open settings') {
      const { account } = store.get();
      const parsed = parseConfig(value, account || 'your-universe');
      store.setOptions(parsed.options, { label });
      return parsed;
    },

    undo() {
      const label = store.undo();
      if (label) announce(`Undid ${label}.`);
    },
    redo() {
      const label = store.redo();
      if (label) announce(`Redid ${label}.`);
    },

    /**
     * A new look and layout for the same projects. Shuffle never changes what
     * the stars are, never leaves the one-star-per-project layouts, and keeps
     * the visitor's own CSS.
     */
    shuffle() {
      const { options, repositories } = store.get();
      const recipe = randomizeDesign(newDesignCode({ repositories }), { repositories });
      const next = randomizeParts(options, recipe, { styling: true, connections: true }, repositories);
      const random = seededRandom(`${recipe.designCode}:shuffle-layout`);
      const current = options.temporalStack?.enabled ? 'temporal-stack' : options.arrangement;
      const layouts = SHUFFLE_LAYOUTS.filter((layout) => layout !== current);
      next.arrangement = layouts[Math.floor(random() * layouts.length)];
      next.temporalStack = { ...(options.temporalStack || {}), enabled: false };
      next.nodeMode = options.nodeMode;
      next.effect = options.effect ?? 'none';
      next.starPositions = {};
      next.labelOffsets = {};
      next.labelPositions = {};
      if (options.customCSS !== undefined) next.customCSS = options.customCSS;
      next.css = composeCSS(next);
      shuffles = store.get().options === lastShuffled ? shuffles + 1 : 1;
      store.setOptions(next, { label: 'Shuffle' });
      lastShuffled = store.get().options;
      toasts.show(shuffles > 1 ? `Shuffled ${shuffles} times. Your projects are kept.` : 'New colours and layout. Your projects are kept.', {
        key: 'shuffle',
        action: { label: 'Undo', run: () => actions.undo() },
      });
    },

    // Projects --------------------------------------------------------------
    /** Full names of the projects currently on the map. */
    shownProjects() {
      const { repositories, options } = store.get();
      const hidden = new Set(options.hiddenNodes || []);
      try { return selectRepositories(repositories, options).map((r) => r.full_name).filter((name) => !hidden.has(name)); }
      catch { return []; }
    },
    /** Put a project on the map or take it off. Switches to an explicit list. */
    setProjectShown(fullName, shown) {
      const { repositories, options } = store.get();
      let base;
      try {
        const hidden = new Set(options.hiddenNodes || []);
        base = selectRepositories(repositories, options).map((r) => r.full_name).filter((name) => !hidden.has(name));
      } catch {
        // Settings that can't select projects must not wipe your picked list.
        base = Array.isArray(options.includeRepos) ? options.includeRepos : null;
      }
      if (!base) {
        toasts.show('Your current settings can’t pick projects. Undo the last change, then try again.', { tone: 'error' });
        return false;
      }
      const current = new Set(base);
      if (shown) current.add(fullName); else current.delete(fullName);
      if (!current.size) {
        toasts.show('Keep at least one project on the map.', { tone: 'error' });
        return false;
      }
      const repo = store.get().repositories.find((r) => r.full_name === fullName);
      const name = repo?.name || fullName;
      return store.setOptions((options) => ({
        ...options,
        includeRepos: [...current],
        maxRepos: Math.min(100, Math.max(options.maxRepos || 1, current.size)),
        includeForks: options.includeForks || Boolean(shown && repo?.fork),
        // Ticking a fork or an archived project must actually put it on the map.
        includeArchived: (options.includeArchived ?? true) || Boolean(shown && repo?.archived),
        hiddenNodes: (options.hiddenNodes || []).filter((id) => id !== fullName),
      }), { label: shown ? `Show ${name}` : `Hide ${name}` });
    },
    /** Go back to choosing projects automatically by the sort order. */
    resetProjects() {
      return store.setOptions((options) => {
        const next = { ...options, hiddenNodes: [] };
        delete next.includeRepos;
        return next;
      }, { label: 'Choose projects automatically' });
    },
    isFeatured(fullName) {
      return store.get().options.projectShowcase?.[fullName]?.role === 'featured';
    },
    toggleFeatured(fullName) {
      const featured = actions.isFeatured(fullName);
      const name = fullName.split('/').pop();
      return store.setOptions((options) => {
        const showcase = { ...(options.projectShowcase || {}) };
        if (featured) delete showcase[fullName];
        else {
          const priorities = Object.values(showcase).filter((v) => v.role === 'featured').map((v) => v.priority || 0);
          showcase[fullName] = { role: 'featured', priority: Math.min(9999, Math.max(0, ...priorities) + 1) };
        }
        return { ...options, projectShowcase: showcase };
      }, { label: featured ? `Unfeature ${name}` : `Feature ${name}` });
    },

    select(nodeId) { store.update({ selected: nodeId || null }); },
    setPanel(panel) { store.update({ panel }); },
    openDialog(name) { store.update({ dialog: name }); },
    closeDialog() { store.update({ dialog: null }); },

    // Tech stack ---------------------------------------------------------
    openTechStack(account = null) { store.update({ techStackTarget: account, dialog: 'tech-stack' }); },
    /** Sign-in may leave the page for GitHub, so remember what the visitor came for. */
    signInForTechStack(account) {
      try { win.sessionStorage.setItem(TECH_STACK_INTENT, account || ''); } catch { /* They can open it again by hand. */ }
      store.update({ dialog: 'sign-in' });
    },
    /** Picks up where signInForTechStack left off. Returns whether it did. */
    resumeTechStack() {
      let intent = null;
      try { intent = win.sessionStorage.getItem(TECH_STACK_INTENT); win.sessionStorage.removeItem(TECH_STACK_INTENT); } catch { /* Nothing to resume. */ }
      if (intent === null || !engine.signedIn) return false;
      actions.openTechStack(intent || null);
      return true;
    },
    toast: (text, options) => toasts.show(text, options),

    // Describe ----------------------------------------------------------
    /** Who reads a description, in one sentence for the dialog. */
    describeReader() {
      const kind = readerKind();
      if (kind === 'custom') return `Read by ${String(customAdapter().name || 'the model this page connected').slice(0, 60)}.`;
      if (kind === 'own-key') return 'Read by Claude, using your own key.';
      if (kind === 'hosted') return `Read by Claude${Number.isInteger(hosted.remaining) ? ` (${hosted.remaining} of ${hosted.limit} left today)` : ''}.`;
      return 'Read by a built-in phrase matcher, not an AI model, so it knows a small set of words: centre, outskirts, experiments, recent, similar, topics, languages.';
    },
    /** What the dialog needs to offer the other readers. No credentials. */
    describeReaders() {
      return {
        kind: readerKind(),
        signedIn: engine.ai.signedIn,
        hosted: { available: hosted.available, limit: hosted.limit, remaining: hosted.remaining },
        ownKey: Boolean(ownKeyModel),
      };
    },
    /** Use Claude with the visitor's own key. It is kept in this tab's memory and nowhere else. */
    async useOwnKey(apiKey) {
      try { ownKeyModel = await engine.ai.withKey(apiKey); return { ok: true }; }
      catch (error) { return { ok: false, sentence: error?.name === 'ModelUnavailable' ? error.message : 'Claude could not be set up. Check your connection and try again.' }; }
    },
    forgetOwnKey() { ownKeyModel = null; },
    signInForDescribe() { store.update({ dialog: 'sign-in' }); },
    /**
     * Turn words into a plan. Changes nothing: the result is only a preview.
     * @returns {Promise<{ ok: true, compiled, plan } | { ok: false, sentence: string }>}
     */
    async describe(prompt, { signal, intent = 'describe' } = {}) {
      const kind = readerKind();
      const adapter = kind === 'custom' ? customAdapter() : kind === 'own-key' ? ownKeyModel : kind === 'hosted' ? (hostedModel ??= await engine.ai.hosted()) : null;
      const [spec, { describeConstellation }, { describePlan, describeFailure }, { createKeywordModel }] = await Promise.all([
        loadSpec(), import('../ai/describe.mjs'), import('../ai/plan.mjs'), import('../ai/fake-model.mjs'),
      ]);
      const { repositories, options } = store.get();
      const specEngine = spec.createConstellationEngine(repositories, evidenceOf(options));
      try {
        const result = await describeConstellation({
          adapter: adapter || (keywordModel ??= createKeywordModel()), engine: specEngine, prompt, intent, signal,
          currentSpec: options.constellationSpec, canvas: canvasOf(options),
        });
        if (kind === 'hosted') refreshHosted();
        if (!result.ok && result.error?.name === 'ModelUnavailable') {
          // Say what happened and leave the other readers on offer.
          const why = result.error.reason;
          if (why === 'disabled') { hostedDown = true; hostedCheck += 1; hosted = { available: false, checked: true }; }
          if (why === 'quota') hosted = { ...hosted, remaining: 0 };
          if (why === 'key') ownKeyModel = null;
          return { ok: false, sentence: `${result.error.message} Nothing was changed.`, reason: why, readers: true };
        }
        if (!result.ok) return { ok: false, sentence: describeFailure(result), reason: result.reason };
        return { ok: true, compiled: result.compiled, plan: describePlan(result.compiled, { previousSpec: options.constellationSpec }) };
      } finally {
        specEngine.destroy();
      }
    },
    /** The applied plan in words, for the dialog. Null until the engine has loaded. */
    currentPlan() {
      const { repositories, options } = store.get();
      if (specState !== 'ready' || !options.constellationSpec) return null;
      return describedPlan?.(options.constellationSpec, repositories, options) ?? null;
    },
    /** Apply a previewed plan as one Undo step. */
    applyPlan(compiled) {
      loadSpec().then((spec) => {
        const changed = store.setOptions((options) => {
          let next = spec.specOptions(options, compiled);
          if (compiled.motion) next = applyMotion(next, compiled.motion);
          next.maxRepos = Math.max(1, Math.min(next.maxRepos ?? 45, 100, store.get().repositories.length || 1));
          return next.visualStyle || next.customCSS !== undefined ? { ...next, css: composeCSS(next) } : next;
        }, { label: 'Describe' });
        store.update({ dialog: null });
        if (changed) toasts.show('Plan applied to your map.', { key: 'describe', action: { label: 'Undo', run: () => actions.undo() } });
        announce('Plan applied to your map.');
      }, () => toasts.show('The plan could not be applied. Nothing was changed.', { tone: 'error' }));
    },
    /** Go back to a map with no described plan. One Undo step. */
    clearPlan() {
      const changed = store.setOptions((options) => { const { constellationSpec: _removed, ...rest } = options; return rest; }, { label: 'Remove plan' });
      if (changed) toasts.show('Plan removed. Your other settings are kept.', { key: 'describe', action: { label: 'Undo', run: () => actions.undo() } });
    },

    // Saved designs ------------------------------------------------------
    saveDesign(name) {
      const { account, options } = store.get();
      designs.savePreset(account, name, options);
      toasts.show(`Saved “${name.trim()}”.`);
    },
    savedDesigns: () => designs.library(),
    async openDesign(entry) {
      const { account } = store.get();
      if (account && entry.account.toLowerCase() === account.toLowerCase()) {
        actions.applyConfig(entry.config, `Open “${entry.name}”`);
        store.update({ dialog: null });
        return true;
      }
      return actions.openAccount(entry.account, { options: parseConfig(entry.config, entry.account).options });
    },
    deleteDesign(entry) { designs.delete(entry.account, entry.name); },
  };

  // Reads an applied plan back in words once the engine is in memory.
  let describedPlan = null;
  store.subscribe((state, changed) => {
    if (changed.has('dialog') && state.dialog === 'describe') refreshHosted();
    if (changed.has('dialog') && state.dialog === 'describe' && !describedPlan) {
      Promise.all([loadSpec(), import('../ai/plan.mjs')]).then(([spec, { describePlan }]) => {
        describedPlan = (current, repositories, options) => {
          const engine = spec.createConstellationEngine(repositories, evidenceOf(options));
          try {
            const result = engine.compileSpec(current, canvasOf(options));
            return result.ok ? describePlan(result.compiled) : null;
          } finally { engine.destroy(); }
        };
        if (store.get().dialog === 'describe' && store.get().options.constellationSpec) ctx.refreshDialog?.();
      }, () => {});
    }
  });

  const ctx = { store, engine, actions, designs, win, doc };

  // --------------------------------------------------------------- views
  mountHome(doc.getElementById('home'), ctx);
  mountStudio(doc.getElementById('studio'), ctx);

  // The tab title says where you are: screen readers announce it and it names the tab.
  const DIALOG_TITLES = { 'get-it': 'Get your map', 'fine-tune': 'Fine-tune', save: 'Save this design', saved: 'Your saved designs', 'sign-in': 'Sign in with GitHub', 'tech-stack': 'Tech stack', describe: 'Describe your sky' };
  const homeTitle = doc.title;
  store.subscribe((state, changed) => {
    if (!['screen', 'account', 'sample', 'dialog'].some((key) => changed.has(key))) return;
    const place = state.screen !== 'studio' ? null : state.sample ? 'Example sky' : `@${state.account}’s sky`;
    const parts = [DIALOG_TITLES[state.dialog], place].filter(Boolean);
    doc.title = parts.length ? `${parts.join(' — ')} — Constellation` : homeTitle;
  });

  store.subscribe((state, changed) => {
    if (!changed.has('screen')) return;
    doc.documentElement.dataset.screen = state.screen;
    doc.getElementById('home').hidden = state.screen === 'studio';
    doc.getElementById('studio').hidden = state.screen !== 'studio';
    // The skip link must point at the main region of the screen on show.
    const skip = doc.getElementById('skip-link');
    if (skip) skip.href = state.screen === 'studio' ? '#studio-main' : '#main';
  });
  doc.documentElement.dataset.screen = 'home';

  // ------------------------------------------------------------ shortcuts
  doc.addEventListener('keydown', (event) => {
    if (store.get().screen !== 'studio') return;
    const target = event.target;
    // Only text fields have their own undo; sliders, switches and radios use the Studio's.
    const typing = target instanceof HTMLElement && (target.isContentEditable || target.tagName === 'TEXTAREA'
      || (target.tagName === 'INPUT' && ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(target.type)));
    const mod = event.ctrlKey || event.metaKey;
    if (mod && !typing && event.key.toLowerCase() === 'z') {
      event.preventDefault();
      if (event.shiftKey) actions.redo(); else actions.undo();
    } else if (mod && !typing && event.key.toLowerCase() === 'y') {
      event.preventDefault();
      actions.redo();
    }
  });

  // ----------------------------------------------------------------- boot
  async function boot() {
    const href = win.location.href;
    const url = new URL(href);
    if (url.searchParams.has('code') || url.searchParams.has('error')) {
      win.history.replaceState(null, '', url.pathname + url.hash);
      try {
        const profile = await engine.signIn.complete(href);
        if (profile?.login) {
          let intent = '';
          try { intent = win.sessionStorage.getItem(TECH_STACK_INTENT) || ''; } catch { /* Their own sky is the fallback. */ }
          const opened = await actions.openAccount(intent || profile.login);
          actions.resumeTechStack();
          return opened;
        }
      } catch (error) {
        store.update({ status: { text: error.message, tone: 'error' } });
      }
      return;
    }
    // A bare ?user= is the Studio's own address (a reload): restore the draft.
    // Anything more is a share link and carries its own design.
    const user = url.searchParams.get('user');
    if (user && [...url.searchParams.keys()].every((key) => key === 'user')) return actions.openAccount(user);
    let shared = null;
    try { shared = decodeShare(href); } catch (error) {
      store.update({ status: { text: friendlyError(error), tone: 'error' } });
    }
    if (shared?.account === engine.sample().account) return actions.openSample(shared.options);
    if (shared?.account) return actions.openAccount(shared.account, { options: shared.options });
  }

  return { store, engine, actions, ready: boot() };
}
