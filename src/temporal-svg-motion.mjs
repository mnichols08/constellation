import { temporalGeometryDrawing } from './temporal-geometry-drawing.mjs';
import { temporalMotion } from './temporal-motion.mjs';

// Script-free projected animation for SVG images. Interactive HTML uses the
// same drawing function live, including painter reordering, instead of samples.
export function animateTemporalSVG(svg, scene) {
  const options = scene.presentation.options;
  if (!temporalMotion(options).active) return svg;
  const ring = options.ringAnimation || {}, perspective = options.perspective || {}, floating = options.floatingAnimation || {};
  const periods = [];
  if (ring.enabled) for (const speed of ring.speeds || [1, 1, 1, 1]) if (speed) periods.push(60 / speed);
  if (perspective.enabled && perspective.animate) periods.push(perspective.duration || 20);
  if (floating.enabled) periods.push(floating.duration || 12);
  if (!periods.length) return svg;
  // A common cycle keeps independent parts in phase at the loop boundary.
  const gcd = (a, b) => b ? gcd(b, a % b) : a;
  let milliseconds = 1;
  for (const period of periods) { const value = Math.round(period * 1000); milliseconds = milliseconds / gcd(milliseconds, value) * value; }
  // Complex asynchronous cycles are still available in the offline runtime;
  // SVG sampling is bounded rather than allocating an unbounded animation.
  if (milliseconds > 600000) return svg;
  const duration = milliseconds / 1000, count = Math.min(144, Math.max(24, Math.ceil(duration / Math.min(...periods) * 16)));
  const values = new Map(), number = value => Number(value.toFixed(2));
  const add = (key, attribute, value) => {
    if (!values.has(key)) values.set(key, { attribute, values: [] });
    values.get(key).values.push(value);
  };
  for (let i = 0; i <= count; i++) {
    const drawing = temporalGeometryDrawing(scene, { elapsed: i * duration / count });
    for (const item of drawing.items) {
      if (item.kind === 'dust') continue;
      if (item.kind === 'node') {
        const { x, y } = item.node.geometry, { scale } = item.point;
        add(item.key, 'transform', `${Number(scale.toFixed(4))} 0 0 ${Number(scale.toFixed(4))} ${number(item.point.x - x * scale)} ${number(item.point.y - y * scale)}`);
      } else add(item.key, 'd', item.points.map((p, j) => `${j ? 'L' : 'M'}${number(p.x)} ${number(p.y)}`).join('') + (item.kind === 'surface' ? 'Z' : ''));
    }
    for (const item of drawing.labels) add(item.key, 'transform', `1 0 0 1 ${number(item.x - item.label.x)} ${number(item.y - item.label.y)}`);
    for (const item of drawing.years) add(`year:${item.year}`, 'transform', `1 0 0 1 ${number(item.x)} ${number(item.y)}`);
  }
  const unescape = value => value.replace(/&(amp|lt|gt|quot|apos);/g, (_, name) => ({ amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" })[name]);
  const animated = svg.replace(/<(?:g|path|text)\b[^>]*\bdata-(?:geometry-key|temporal-year)="[^"]+"[^>]*>/g, tag => {
    const key = tag.match(/data-geometry-key="([^"]+)"/)?.[1] || `year:${tag.match(/data-temporal-year="([^"]+)"/)[1]}`;
    const motion = values.get(unescape(key));
    if (!motion || motion.values.every(value => value === motion.values[0])) return tag;
    const timing = `data-temporal-motion="" dur="${duration}s" repeatCount="indefinite"`;
    const matrices = motion.attribute === 'transform' ? motion.values.map(value => value.split(' ')) : null;
    const animation = matrices
      ? `<animateTransform ${timing} attributeName="transform" type="translate" values="${matrices.map(m => `${m[4]} ${m[5]}`).join(';')}"/><animateTransform ${timing} attributeName="transform" type="scale" additive="sum" values="${matrices.map(m => `${m[0]} ${m[3]}`).join(';')}"/>`
      : `<animate ${timing} attributeName="d" values="${motion.values.join(';')}"/>`;
    return tag.endsWith('/>') ? tag.slice(0, -2) + '>' + animation + `</${tag.match(/^<(\w+)/)[1]}>` : tag + animation;
  });
  if (animated === svg) return svg;
  const end = animated.indexOf('>') + 1, [x, y, width, height] = scene.viewport.viewBox;
  return `${animated.slice(0, end)}<style>.temporal-motion-still{display:none}@media(prefers-reduced-motion:reduce){.temporal-motion-active{display:none}.temporal-motion-still{display:inline}}</style><g class="temporal-motion-active">${animated.slice(end, animated.lastIndexOf('</svg>'))}</g><image class="temporal-motion-still" x="${x}" y="${y}" width="${width}" height="${height}" href="data:image/svg+xml,${encodeURIComponent(svg).replace(/'/g, '%27')}"/></svg>`;
}
