import test from 'node:test';
import assert from 'node:assert/strict';
import { techStackEvidence, formatYears, CURRENT_DAYS, SUSTAINED_DAYS } from '../src/tech-stack/evidence.mjs';
import { renderTechStackCardSVG, renderTechStackMarkdown, replaceTechStackMarkdown, MARKDOWN_START, MARKDOWN_END } from '../src/tech-stack/card.mjs';
import { isToolingTech } from '../src/tech-stack/catalog.mjs';
import { validatePublicationArtifact } from '../src/publication-integrity.mjs';

const record = (name, { created, pushed, languages = { JavaScript: 100 }, dependencies = [], stars = 0, archived = false, description = `About ${name}` } = {}) => ({
  name, full_name: `ada/${name}`, html_url: `https://github.com/ada/${name}`, description, fork: false, private: false, archived,
  created_at: `${created}T00:00:00Z`, pushed_at: `${pushed}T00:00:00Z`, updated_at: `${pushed}T00:00:00Z`,
  stargazers_count: stars, forks_count: 0, language: Object.keys(languages)[0] ?? null, languages, topics: [], dependencies,
});
const scanOf = (records, coverage = {}) => ({ login: 'ada', scannedAt: '2026-11-01T00:00:00.000Z', records, coverage: { discovered: records.length + 2, forks: 2, empty: 0, withManifest: records.length, noLanguage: 0, unreadable: 0, missing: 0, refused: 0, stopped: null, ...coverage } });
const MERN = ['Express', 'MongoDB', 'React'];
const account = () => scanOf([
  record('shop', { created: '2022-03-01', pushed: '2026-10-01', languages: { TypeScript: 900, CSS: 100 }, dependencies: [...MERN, 'Jest', 'Vite', 'Tailwind CSS'], stars: 12, description: 'Storefront with carts and checkout' }),
  record('chat', { created: '2023-01-10', pushed: '2026-08-15', languages: { TypeScript: 500 }, dependencies: [...MERN, 'Socket.IO'], stars: 3 }),
  record('blog', { created: '2024-05-01', pushed: '2025-12-20', languages: { TypeScript: 300 }, dependencies: [...MERN, 'Jest'], stars: 40 }),
  record('notes', { created: '2021-02-01', pushed: '2021-02-03', languages: { JavaScript: 200 }, dependencies: ['Express', 'React'] }),
  record('old-api', { created: '2019-06-01', pushed: '2020-09-01', languages: { Python: 400 }, dependencies: ['Django', 'PostgreSQL'], archived: true }),
  record('old-site', { created: '2019-01-01', pushed: '2019-08-01', languages: { Python: 100, Shell: 5 }, dependencies: ['Django', 'PostgreSQL'] }),
  record('engine', { created: '2025-01-01', pushed: '2026-10-30', languages: { Rust: 800 }, dependencies: [] , stars: 7 }),
  record('scratch', { created: '2026-10-28', pushed: '2026-10-29', languages: { Rust: 20 }, dependencies: [] }),
]);

test('each technology says when it appeared, whether it is current, and where to look', () => {
  const evidence = techStackEvidence(account());
  const of = (name) => [...evidence.core, ...evidence.tooling].find((tech) => tech.name === name);
  assert.deepEqual([of('TypeScript').repositories, of('TypeScript').first, of('TypeScript').last, of('TypeScript').current], [3, 2022, 2026, true]);
  assert.equal(formatYears(of('TypeScript')), '2022–now');
  assert.deepEqual([of('Python').current, formatYears(of('Python'))], [false, '2019–2020']);
  assert.equal(formatYears(of('Django'), ' to '), '2019 to 2020');
  // Worked on over time is not the same as existing: two-day repositories don't count as sustained.
  assert.deepEqual([of('Rust').repositories, of('Rust').sustained, of('Rust').recent], [2, 1, 2]);
  assert.deepEqual([of('JavaScript').repositories, of('JavaScript').sustained, formatYears(of('JavaScript'))], [1, 0, '2021']);
  // Current and sustained work leads; a stale technology with as many repositories does not.
  assert.deepEqual(evidence.core.slice(0, 3).map((tech) => tech.name), ['Express', 'React', 'MongoDB']);
  assert.ok(evidence.core.findIndex((tech) => tech.name === 'Rust') < evidence.core.findIndex((tech) => tech.name === 'Python'));
  // Examples: live before archived, then most starred.
  assert.deepEqual(of('React').examples.map((example) => example.name), ['blog', 'shop']);
  assert.deepEqual(of('Django').examples.map((example) => [example.name, example.archived]), [['old-site', false], ['old-api', true]]);
  assert.equal(of('React').examples[1].description, 'Storefront with carts and checkout');
  assert.equal(of('React').examples[0].url, 'https://github.com/ada/blog');
  // Incidental languages never appear.
  assert.equal(of('Shell'), undefined);
  assert.equal(evidence.headline, 'Mostly TypeScript and Rust. 5 of 8 public repositories updated in the last year.');
  assert.deepEqual([evidence.total, evidence.recent, evidence.discovered, evidence.partial], [8, 5, 10, false]);
  assert.deepEqual(techStackEvidence(account()), evidence, 'the same scan always reads the same');
  assert.ok(CURRENT_DAYS === 365 && SUSTAINED_DAYS === 30);
});

test('the developer’s featured repositories are the first examples', () => {
  const evidence = techStackEvidence(account(), { featured: ['ada/chat', 'ENGINE', 'not-a-repo'] });
  assert.deepEqual(evidence.core.find((tech) => tech.name === 'React').examples.map((example) => example.name), ['chat', 'blog']);
  assert.equal(evidence.core.find((tech) => tech.name === 'Rust').examples[0].name, 'engine');
});

test('stacks are found from the account’s own repositories, largest common combination first', () => {
  const { stacks, tooling, core } = techStackEvidence(account());
  assert.deepEqual(stacks.map((stack) => [stack.name, stack.repositories, formatYears(stack)]), [['React + Express + MongoDB', 3, '2022–now'], ['Django + PostgreSQL', 2, '2019–2020']]);
  assert.deepEqual(stacks[0].examples.map((example) => example.name), ['blog', 'shop']);
  // "React + Express" (4 repositories) is inside the stack already shown, so it isn't repeated.
  assert.ok(!stacks.some((stack) => stack.name === 'React + Express'));
  // Test runners and build tools are listed apart and never name a stack.
  assert.deepEqual(tooling.map((tool) => tool.name), ['Jest', 'Vite']);
  assert.ok(isToolingTech('Playwright') && !isToolingTech('Docker') && !isToolingTech('React'));
  assert.ok(core.some((tech) => tech.name === 'Tailwind CSS') && !stacks.some((stack) => stack.techs.includes('Tailwind CSS')));

  // A large account needs a combination to appear twice; a small one may show a single project's stack.
  const many = scanOf([...Array.from({ length: 6 }, (_, index) => record(`a${index}`, { created: '2024-01-01', pushed: '2026-06-01', dependencies: ['Next.js', 'Prisma'] })), record('one-off', { created: '2024-01-01', pushed: '2026-06-01', dependencies: ['Flask', 'Redis'] })]);
  assert.deepEqual(techStackEvidence(many).stacks.map((stack) => stack.name), ['Next.js + Prisma']);
  const small = scanOf([record('solo', { created: '2024-01-01', pushed: '2026-06-01', dependencies: ['Flask', 'Redis', 'pytest'] })]);
  assert.deepEqual(techStackEvidence(small).stacks.map((stack) => [stack.name, stack.repositories]), [['Flask + Redis', 1]]);
  // Never more than four, and work stays bounded for a repository that declares everything.
  const wide = scanOf(Array.from({ length: 40 }, (_, index) => record(`w${index}`, { created: '2024-01-01', pushed: '2026-06-01', dependencies: ['React', 'Vue', 'Angular', 'Svelte', 'Next.js', 'Express', 'NestJS', 'Django', 'MongoDB', 'PostgreSQL', 'MySQL', 'Redis'].slice(index % 5) })));
  assert.ok(techStackEvidence(wide).stacks.length <= 4);
});

test('accounts with nothing current, no dates or no repositories still read sensibly', () => {
  const stale = scanOf([record('a', { created: '2018-01-01', pushed: '2018-06-01', languages: { PHP: 10 }, dependencies: ['Laravel', 'MySQL'] })]);
  assert.equal(techStackEvidence(stale).headline, 'Earlier work in PHP. 0 of 1 public repository updated in the last year.');
  const undated = scanOf([{ ...record('b', { created: '2020-01-01', pushed: '2020-01-01' }), created_at: null, pushed_at: 'nonsense', updated_at: undefined }]);
  const tech = techStackEvidence(undated).core[0];
  assert.deepEqual([tech.first, tech.last, tech.current, formatYears(tech)], [null, null, false, '']);
  assert.match(renderTechStackCardSVG(undated), /JavaScript/);
  const empty = techStackEvidence(scanOf([]));
  assert.deepEqual([empty.headline, empty.stacks, empty.core], ['No public repositories to count.', [], []]);
  assert.throws(() => renderTechStackCardSVG(scanOf([])), /No languages or technologies were found/);
  assert.equal(techStackEvidence(scanOf(account().records, { stopped: 'rate-limit' })).partial, true);
});

test('the card is a self-explaining static image: headline, stacks, dated rows and the caveat', () => {
  const svg = renderTechStackCardSVG(account());
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg" viewBox="0 0 840 \d+" width="840" height="\d+" role="img" aria-labelledby="title tech-stack-description"/);
  assert.ok(svg.trimEnd().endsWith('</svg>'));
  const visible = [...svg.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((match) => match[1]);
  for (const expected of ['Tech stack · @ada', 'Mostly TypeScript and Rust. 5 of 8 public repositories updated in the last year.', 'USED TOGETHER', 'React + Express + MongoDB', '3 repositories · 2022–now', 'See blog, shop', 'LANGUAGES AND TECHNOLOGIES', 'TypeScript', '2019–2020', 'Testing and build tools: Jest, Vite']) {
    assert.ok(visible.includes(expected), `missing "${expected}" in ${JSON.stringify(visible).slice(0, 600)}`);
  }
  assert.match(visible.at(-1), /^8 of 10 public repositories · 2026-11-01 · declared in manifests, not proof of use · public work only$/);
  // Stale technologies are visibly faded, current ones are not.
  assert.match(svg, /opacity="0\.38"/);
  assert.match(svg, /opacity="1"/);
  // The same content is available to someone who cannot see the image.
  const description = /<desc id="tech-stack-description">([^<]*)<\/desc>/.exec(svg)[1];
  assert.match(description, /Used together: React \+ Express \+ MongoDB \(3 repositories, 2022 to now\)/);
  assert.match(description, /Django \(2 repositories, 2019 to 2020\)/);
  assert.match(description, /does not prove use\. Public repositories only\.$/);
  // Static and inert: nothing that runs, loads or links.
  assert.ok(!/<script|<a |href|<foreignObject|<image|style=|on\w+=|url\(/i.test(svg));
  assert.equal(renderTechStackCardSVG(account()), svg);
  // It passes the same checks every published image must pass.
  assert.doesNotThrow(() => validatePublicationArtifact(Buffer.from(svg), { format: 'svg', filename: 'tech-stack.svg' }));
  assert.ok(svg.length < 12000, `card is ${svg.length} bytes`);
  // Nothing in it rates the person.
  assert.ok(!/senior|expert|skilled|proficien|strong|best|score|rating|years of experience/i.test(svg));
  // A partial scan says so where it will be read.
  assert.match(renderTechStackCardSVG(scanOf(account().records, { missing: 2 })), /public repositories \(partial scan\) · /);
});

test('hostile repository text cannot break out of the card or the Markdown', () => {
  const nasty = scanOf([
    record('x', { created: '2024-01-01', pushed: '2026-06-01', dependencies: ['React', 'Express'], description: '</text><script>alert(1)</script> [click](javascript:alert(1)) @everyone **bold** <img src=x onerror=1> `code` | table\u202e reversed\nnew line ![i](http://evil.example/p.png)' }),
    { ...record('y', { created: '2024-01-01', pushed: '2026-06-01', dependencies: ['React', 'Express'] }), html_url: 'javascript:alert(1)', name: 'y](http://evil.example)<b>' },
  ]);
  nasty.login = 'ada';
  const svg = renderTechStackCardSVG(nasty);
  assert.ok(!/<script|<b>|<img/i.test(svg));
  assert.match(svg, /y\]\(http:\/\/evil\.example\)&lt;b&gt;/);
  const markdown = renderTechStackMarkdown(nasty);
  assert.ok(!/<script|<img|<b>/i.test(markdown), markdown);
  assert.ok(!/\]\((?!https:\/\/github\.com\/ada\/)/.test(markdown.replace(/\\\]\\\(/g, '')), 'the only links go to the account’s own repositories');
  assert.ok(!markdown.includes('javascript:alert(1))') || markdown.includes('\\(javascript:alert\\(1\\)\\)'));
  assert.ok(!/@everyone/.test(markdown) && !markdown.includes('\u202e') && !/\*\*bold\*\*/.test(markdown) && !/`code`/.test(markdown));
  assert.ok(markdown.split('\n').filter((line) => /click|new line/.test(line)).every((line) => line.startsWith('- **')), 'a description stays inside its own list item');
});

test('the Markdown block carries the links an image cannot, and can be refreshed in place', () => {
  const markdown = renderTechStackMarkdown(account());
  const lines = markdown.trimEnd().split('\n');
  assert.equal(lines[0], MARKDOWN_START);
  assert.equal(lines.at(-1), MARKDOWN_END);
  assert.equal(lines[1], '**Mostly TypeScript and Rust. 5 of 8 public repositories updated in the last year.**');
  assert.ok(lines.includes('- **React \\+ Express \\+ MongoDB** · 3 repositories · 2022–now · [blog](https://github.com/ada/blog), [shop](https://github.com/ada/shop)'));
  assert.ok(lines.includes('- **Rust** · 2 repositories · 2025–now · [engine](https://github.com/ada/engine), [scratch](https://github.com/ada/scratch): About engine'));
  assert.ok(lines.includes('Testing and build tools: Jest, Vite.'));
  assert.equal(lines.at(-2), '<sub>Counted from 8 of 10 public repositories on 2026-11-01. Declared in manifests, which does not prove use. Public repositories only.</sub>');
  assert.equal(lines.filter((line) => line.startsWith('- **')).length, 2 + 8);

  const readme = `# Hi\n\nIntro.\n`;
  const added = replaceTechStackMarkdown(readme, markdown);
  assert.ok(added.startsWith('# Hi\n\nIntro.\n\n<!-- constellation:tech-stack:start -->'));
  const later = renderTechStackMarkdown(scanOf(account().records.slice(0, 3)));
  const refreshed = replaceTechStackMarkdown(`${added}\n## After\n`, later);
  assert.equal(refreshed.split(MARKDOWN_START).length, 2, 'one block, replaced');
  assert.ok(refreshed.includes('3 of 5 public repositories') && !refreshed.includes('8 of 10') && refreshed.endsWith('\n## After\n') && refreshed.startsWith('# Hi\n\nIntro.'));
});
