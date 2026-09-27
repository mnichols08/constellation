import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseConfig } from './config-schema.mjs';

export async function loadConfig(configPath, inlineConfig) {
  if (configPath && inlineConfig) throw new Error('Use either config or config-json, not both.');
  const config = inlineConfig ? JSON.parse(inlineConfig) : configPath ? JSON.parse(await readFile(configPath, 'utf8')) : {};
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new Error('Configuration must be a JSON object.');
  if (inlineConfig && config.cssFile) throw new Error('Inline configuration must embed CSS in css instead of cssFile.');
  if (config.cssFile) config.css = await readFile(resolve(dirname(configPath), config.cssFile), 'utf8');
  return config.version === undefined ? config : parseConfig(config).options;
}
