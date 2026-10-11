export function describePublishingSVG(svg) {
  const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
  if (document.querySelector('parsererror')) throw Error('The publishing preview is not valid SVG.');
  const root = document.documentElement;
  const projects = [...document.querySelectorAll('.star[data-repo]')]
    .filter(node => node.getAttribute('data-kind') === 'repository')
    .map(node => node.getAttribute('data-repo'));
  const labels = [...document.querySelectorAll('.repo-label[data-repo]')]
    .filter(node => node.style.display !== 'none')
    .map(node => node.getAttribute('data-repo'));
  const featured = [...document.querySelectorAll('.star.role-featured[data-repo]')]
    .map(node => node.getAttribute('data-repo'));
  return {
    width: Number(root.getAttribute('width')), projects, labels, featured,
    manualOverlap: root.getAttribute('data-label-limitation') === 'manual-labels-overlap',
    accessible: Boolean(document.querySelector('title')?.textContent && document.querySelector('desc')?.textContent),
  };
}

export function updatePublishingPreviews(host, variants, scene, clarity) {
  host.replaceChildren();
  for (const { width, svg, url, fingerprint } of variants) {
    const info = describePublishingSVG(svg);
    const figure = document.createElement('figure');
    const caption = document.createElement('figcaption');
    caption.textContent = `${width}px ${width === 480 ? 'compact' : 'wide'} README — actual downloadable SVG`;
    const image = document.createElement('img');
    image.width = width;
    image.src = url;
    image.alt = `${width}px export preview`;
    image.dataset.sceneFingerprint = fingerprint || '';
    const list = document.createElement('ul');
    const hidden = new Set(scene.presentation.options.hiddenLabels || []);
    const suppressed = info.projects.filter(id => !info.labels.includes(id) && !hidden.has(id));
    const messages = [
      `Included projects (${info.projects.length}): ${info.projects.join(', ') || 'none'}.`,
      `Featured projects: ${info.featured.join(', ') || 'none assigned'}.`,
      `Visible project labels: ${info.labels.join(', ') || 'none'}.`,
      `Automatically suppressed labels: ${suppressed.join(', ') || 'none'}.`,
      `Authored hidden labels: ${info.projects.filter(id => hidden.has(id)).join(', ') || 'none'}.`,
      info.projects.length && info.projects.length <= 12 && info.accessible
        ? 'Ready to download this Profile Story. Setup and remote publication are not verified.'
        : 'Not ready: a bounded accessible Profile Story with 1–12 projects is required.',
    ];
    if (info.manualOverlap)
      messages.push('Manual labels may overlap. Their positions and visibility have not been changed; this estimate is advisory, not an accessibility failure.');
    for (const edge of (scene.edges || []).filter(edge => edge.metadata?.relationshipEvidence?.length).slice(0, 8))
      messages.push(`${edge.from} connects to ${edge.to}: ${edge.metadata.relationshipEvidence.join(', ')}.`);
    for (const diagnostic of (clarity?.diagnostics || []).slice(0, 8))
      messages.push(`Advisory Story Clarity: ${diagnostic.code} (${(diagnostic.ids || []).join(', ')}). Deterministic estimate, not a publishing blocker.`);
    list.replaceChildren(...messages.map(text => {
      const item = document.createElement('li');
      item.textContent = text;
      return item;
    }));
    figure.append(caption, image, list);
    host.append(figure);
  }
  if (!variants.length) {
    const note = document.createElement('p');
    note.textContent = 'Profile Story preview unavailable for this configuration. Use the current artifact export, or return to editing to select a supported story.';
    host.append(note);
  }
}
