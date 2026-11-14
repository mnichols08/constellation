// Importing this module loads the ConstellationSpec engine and connects it to
// configuration validation and layout. Import it (dynamically, where page
// weight matters) before rendering options that carry `constellationSpec`.
import { registerSpecHost } from './spec-host.mjs';
import { specHost } from './constellation-spec.mjs';

registerSpecHost(specHost);
export * from './constellation-spec.mjs';
