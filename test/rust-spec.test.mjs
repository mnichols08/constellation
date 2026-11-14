import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readFile, readdir, stat } from 'node:fs/promises';

const root = fileURLToPath(new URL('../', import.meta.url));
const cargo = spawnSync('cargo', ['--version'], { encoding: 'utf8' });

// The spec crate's own suite (validation, compilation, engine, deterministic
// fuzzing, and the generated-schema drift check) runs with the Node tests so
// every CI run and every local `npm test` covers it.
test('constellation-spec Rust tests pass, including fuzzing and schema drift', { skip: cargo.status !== 0 && 'cargo is not installed', timeout: 600000 }, () => {
  const result = spawnSync('cargo', ['test', '--locked', '--manifest-path', 'rust/constellation-spec/Cargo.toml'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`.slice(-4000));
  const passed = Number(/test result: ok\. (\d+) passed/.exec(result.stdout)?.[1]);
  assert.ok(passed >= 30, `expected the full suite, ran ${passed}`);
  assert.match(result.stdout, /fuzz_arbitrary_json_never_panics_the_validator \.\.\. ok/);
  assert.match(result.stdout, /published_schema_files_match_the_rust_contract \.\.\. ok/);
});

test('the spec engine is isolated: no DOM, network, clock or randomness, and core does not link it', async () => {
  const directory = new URL('../rust/constellation-spec/src/', import.meta.url);
  for (const file of await readdir(directory)) {
    const source = await readFile(new URL(file, directory), 'utf8');
    assert.ok(!/web_sys|js_sys|std::net|std::time|SystemTime|Instant::|rand::|std::fs|std::process|std::env/.test(source.split('#[cfg(test)]')[0].replace(/^use .*tests.*$/gm, '')) || file === 'tests.rs', `${file} reaches outside the engine`);
  }
  const manifest = await readFile(new URL('../rust/constellation-spec/Cargo.toml', import.meta.url), 'utf8');
  assert.deepEqual([...manifest.matchAll(/^(\w[\w-]*) = /gm)].map((match) => match[1]).filter((name) => ['wasm-bindgen', 'serde', 'serde_json'].includes(name)).sort(), ['serde', 'serde_json', 'wasm-bindgen']);
  assert.ok(!/reqwest|tokio|web-sys|js-sys|getrandom|openai|anthropic/.test(manifest));
  const core = await readFile(new URL('../rust/constellation-core/Cargo.toml', import.meta.url), 'utf8');
  assert.ok(!core.includes('constellation-spec'));
});

test('size budgets: the spec module stays small and the core binary is not burdened with it', async () => {
  const size = async (path) => (await stat(new URL(path, import.meta.url))).size;
  assert.ok(await size('../src/wasm/constellation_spec_bg.wasm') < 300 * 1024, 'spec WASM exceeds 300 KiB');
  let bytes = 0;
  const walk = async (directory) => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const url = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await walk(url); else bytes += (await stat(url)).size;
    }
  };
  await walk(new URL('../packages/spec/', import.meta.url));
  assert.ok(bytes < 512 * 1024, `@constellation/spec exceeds 512 KiB: ${bytes}`);
  const bindings = await readFile(new URL('../src/wasm/constellation_core.js', import.meta.url), 'utf8');
  assert.ok(!/ConstellationEngine|validate_constellation_spec/.test(bindings), 'the core WASM must not contain the spec engine');
});
