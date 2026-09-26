import { themes } from './constellation.mjs';

export function defaultVisualStyle() {
  return { light: { ...themes.light }, dark: { ...themes.midnight }, lineWidth: .9, lineOpacity: .8, secondaryOpacity: .13, bridgeOpacity: .35, glow: 2, dustOpacity: .6, labelSize: 11, labels: true };
}

export function visualCSS(style) {
  const palette = values => Object.entries(values).map(([key, value]) => {
    if (!Object.hasOwn(themes.light, key) || !/^#[0-9a-f]{6}$/i.test(value)) throw new Error('Invalid visual palette.');
    return `  --sky-${key}: ${value};`;
  }).join('\n');
  for (const [key, min, max] of [['lineWidth', .5, 3], ['lineOpacity', 0, 1], ['secondaryOpacity', 0, 1], ['bridgeOpacity', 0, 1], ['glow', 0, 5], ['dustOpacity', 0, 1], ['labelSize', 9, 20]]) {
    if (!Number.isFinite(style[key]) || style[key] < min || style[key] > max) throw new Error(`Invalid ${key}.`);
  }
  return `/* Visual controls: light palette, then the viewer’s dark preference. */
svg {
${palette(style.light)}
}
@media (prefers-color-scheme: dark) {
  svg {
${palette(style.dark).split('\n').map(line => '  ' + line).join('\n')}
  }
}
.connections { stroke-width: ${style.lineWidth}; opacity: ${style.lineOpacity}; }
.shared-language[data-emphasis="secondary"] { opacity: ${style.secondaryOpacity}; }
.bridges { stroke-width: ${style.lineWidth}; opacity: ${style.bridgeOpacity}; }
.star { filter: ${style.glow ? `drop-shadow(0 0 ${style.glow}px var(--sky-star))` : 'none'}; }
.dust { opacity: ${style.dustOpacity}; }
.language text, .repo-label { font-size: ${style.labelSize}px; }
.language, .repo-label { display: ${style.labels ? 'inline' : 'none'}; }`;
}
