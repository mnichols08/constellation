import { parseConfig, configFields } from './config-schema.mjs';

export function validateConfig(value) {
  try {
    const input = typeof value === 'string' ? JSON.parse(value) : value;
    const options = input?.version !== undefined && input?.options ? input.options : input;
    if (options && typeof options === 'object' && !Array.isArray(options)) {
      const unknown = Object.keys(options).filter(key => !configFields.includes(key) && !['version', 'account', 'cssFile'].includes(key));
      if (unknown.length) return { valid: false, errors: unknown.map(path => ({ path, message: `Unknown setting "${path}". Check the configuration field name.` })) };
    }
    // Legacy CLI/workflow configs permit trusted CSS. Keep that contract;
    // versioned studio imports retain their existing stricter CSS validation.
    const legacyCSS = input?.version === undefined && options && typeof options === 'object'
      ? Object.fromEntries(['css', 'customCSS'].filter(key => typeof options[key] === 'string').map(key => [key, options[key]])) : {};
    const config = parseConfig(Object.keys(legacyCSS).length ? { ...input, ...Object.fromEntries(Object.keys(legacyCSS).map(key => [key, ''])) } : input);
    Object.assign(config.options, legacyCSS);
    return { valid: true, errors: [], config };
  } catch (error) {
    return { valid: false, errors: [{ path: '$', message: error.message }] };
  }
}
