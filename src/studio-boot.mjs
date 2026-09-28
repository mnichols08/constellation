try { await import('./preview.mjs'); }
catch (error) {
  const status = document.querySelector('#status');
  if (status) { status.setAttribute('role', 'alert'); status.textContent = error.message; }
  const engine = document.querySelector('#engine-status');
  if (engine) engine.textContent = 'The required rendering engine could not start. Check that the bundled WASM asset is served correctly and permitted by your browser policy.';
  document.querySelector('#open-studio')?.setAttribute('disabled', '');
}
