// Adds the focus API to a <constellation-view>-style element whose shadow root
// hosts the interactive runtime. Kept in Core so the component entry stays within
// its size budget.
export function installFocusAPI(View) {
  const runtime = view => view.shadowRoot?.querySelector('main')?.constellation;
  const active = view => {
    const value = runtime(view);
    if (!value) throw new Error('Constellation view is not ready.');
    if (!value.focusProject) throw new Error('The active scene does not support focus.');
    return value;
  };
  for (const [name, method] of Object.entries({
    focusProject(id, options) { return active(this).focusProject(id, options); },
    focusRelationship(projectId, relatedId) { return active(this).focusRelationship(projectId, relatedId); },
    returnToOverview() { return active(this).returnToOverview(); },
  })) Object.defineProperty(View.prototype, name, { value: method, configurable: true, writable: true });
  Object.defineProperty(View.prototype, 'focusState', {
    configurable: true,
    get() { return runtime(this)?.focusState || { mode: 'overview', project: null, related: null, connections: [] }; },
  });
}
