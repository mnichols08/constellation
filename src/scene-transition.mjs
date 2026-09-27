// DOM-only interpolation of already computed scenes; no layout or graph algorithms.
export function replaceInteractiveSVG(canvas, markup, previous, next, { duration = 300 } = {}) {
  const oldSVG = canvas.querySelector('svg');
  const oldGroups = new Map([...oldSVG?.querySelectorAll('.repository') || []].map(group => [group.querySelector('.star')?.dataset.repo, group]));
  const oldNodes = new Map((previous?.nodes || []).map(node => [node.id, node]));
  const nextNodes = new Map(next.nodes.map(node => [node.id, node]));
  const focused = canvas.getRootNode().activeElement?.querySelector?.('.star')?.dataset.repo;
  const template = document.createElement('template'); template.innerHTML = markup;
  const svg = template.content.querySelector('svg');
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const animate = previous && duration > 0 && !motion.matches;
  const animations = [], ghosts = [];
  for (const target of [...svg.querySelectorAll('.repository')]) {
    const id = target.querySelector('.star')?.dataset.repo, old = oldGroups.get(id);
    let group = target;
    if (old) {
      for (const attribute of [...old.attributes]) old.removeAttribute(attribute.name);
      for (const attribute of [...target.attributes]) old.setAttribute(attribute.name, attribute.value);
      old.replaceChildren(...target.childNodes); target.replaceWith(old); group = old;
      oldGroups.delete(id);
    }
    const from = oldNodes.get(id)?.geometry, to = nextNodes.get(id)?.geometry;
    if (animate && group.animate && to) {
      const opacity = nextNodes.get(id).style.opacity ?? 1;
      const initial = from ? { transform: `translate(${from.x - to.x}px,${from.y - to.y}px) scale(${to.radius ? from.radius / to.radius : 1})`, opacity: oldNodes.get(id).style.opacity ?? 1 } : { transform: 'scale(.7)', opacity: 0 };
      group.style.transformOrigin = `${to.x}px ${to.y}px`;
      animations.push(group.animate([initial, { transform: 'translate(0,0) scale(1)', opacity }], { duration, easing: 'ease-out' }));
    }
  }
  if (animate) for (const group of oldGroups.values()) {
    const ghost = group.cloneNode(true); ghost.removeAttribute('id'); ghost.setAttribute('aria-hidden', 'true'); ghost.setAttribute('tabindex', '-1'); ghost.style.pointerEvents = 'none';
    ghost.classList.remove('repository'); ghost.classList.add('departing-node');
    for (const star of ghost.querySelectorAll('.star')) { star.classList.remove('star'); star.removeAttribute('data-repo'); }
    svg.append(ghost); ghosts.push(ghost);
    animations.push(ghost.animate([{ opacity: .8 }, { opacity: 0 }], { duration, easing: 'ease-out', fill: 'forwards' }));
  }
  canvas.replaceChildren(svg);
  if (focused) [...svg.querySelectorAll('.repository')].find(group => group.querySelector('.star')?.dataset.repo === focused)?.focus();
  const cleanup = () => { for (const animation of animations) animation.cancel(); for (const ghost of ghosts) ghost.remove(); motion.removeEventListener('change', changed); };
  const changed = event => { if (event.matches) cleanup(); };
  motion.addEventListener('change', changed);
  Promise.allSettled(animations.map(animation => animation.finished)).then(cleanup);
  return cleanup;
}
