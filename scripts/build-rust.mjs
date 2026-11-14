import { spawnSync } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
function run(command, args) {
  const result = spawnSync(command, args, { cwd: root, stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
run('cargo', ['build', '--locked', '--manifest-path', 'rust/constellation-core/Cargo.toml', '--target', 'wasm32-unknown-unknown', '--release']);
await mkdir(new URL('../src/wasm/', import.meta.url), { recursive: true });
run('wasm-bindgen', ['rust/constellation-core/target/wasm32-unknown-unknown/release/constellation_core.wasm', '--target', 'web', '--out-dir', 'src/wasm', '--no-typescript']);
// The semantic spec engine is a separate module so the core binary, and every
// standalone HTML export that embeds it, stays within its size budget.
run('cargo', ['build', '--locked', '--manifest-path', 'rust/constellation-spec/Cargo.toml', '--target', 'wasm32-unknown-unknown', '--release']);
run('wasm-bindgen', ['rust/constellation-spec/target/wasm32-unknown-unknown/release/constellation_spec.wasm', '--target', 'web', '--out-dir', 'src/wasm', '--no-typescript']);
await import('./build-inline-wasm.mjs');
