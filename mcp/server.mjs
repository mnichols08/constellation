#!/usr/bin/env node
// Constellation MCP server: lets an assistant you already use (Claude Desktop,
// Claude Code, or any other MCP client) build your sky with the same engine
// the Studio uses. Local, over stdio, with no dependencies and no API key.
//
//   node mcp/server.mjs
//
// It speaks JSON-RPC 2.0, one message per line, as the Model Context Protocol
// stdio transport defines. stdout carries only protocol messages.
// See docs/mcp.md.

import { createInterface } from 'node:readline';
import { readFileSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createConstellationTools, GUIDANCE } from './tools.mjs';

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];
const MAX_LINE = 1_000_000;
const MAX_RESULT = 400_000;
const version = () => { try { return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version; } catch { return '0.0.0'; } };

/**
 * A protocol handler with no I/O of its own.
 * @returns {{ handle(message: unknown): Promise<object | null>, close(): void }}
 */
export function createServer(host = {}) {
  const tools = createConstellationTools(host);
  const result = (id, value) => ({ jsonrpc: '2.0', id, result: value });
  const error = (id, code, message) => ({ jsonrpc: '2.0', id: id ?? null, error: { code, message } });
  return {
    async handle(message) {
      if (message === null || typeof message !== 'object' || Array.isArray(message) || message.jsonrpc !== '2.0') return error(null, -32600, 'Invalid request');
      const { id, method, params } = message;
      // Notifications and responses need no answer.
      if (typeof method !== 'string') return id === undefined || 'result' in message || 'error' in message ? null : error(id, -32600, 'Invalid request');
      if (id === undefined) return null;
      switch (method) {
        case 'initialize':
          return result(id, {
            protocolVersion: PROTOCOL_VERSIONS.includes(params?.protocolVersion) ? params.protocolVersion : PROTOCOL_VERSIONS[0],
            capabilities: { tools: { listChanged: false } },
            serverInfo: { name: 'constellation', title: 'GitHub Constellation', version: version() },
            instructions: GUIDANCE,
          });
        case 'ping':
          return result(id, {});
        case 'tools/list':
          return result(id, { tools: tools.definitions });
        case 'tools/call': {
          if (typeof params?.name !== 'string') return error(id, -32602, 'tools/call needs a tool name');
          if (!tools.definitions.some((tool) => tool.name === params.name)) return error(id, -32602, `Unknown tool: ${params.name.slice(0, 80)}`);
          const outcome = await tools.call(params.name, params.arguments);
          let text = JSON.stringify(outcome.value);
          if (text.length > MAX_RESULT) text = JSON.stringify({ ok: false, message: 'The result was too large to return. Narrow the request.' });
          return result(id, { content: [{ type: 'text', text }], isError: !outcome.ok });
        }
        default:
          return error(id, -32601, `Method not found: ${method.slice(0, 80)}`);
      }
    },
    close: () => tools.close(),
  };
}

/** Run over stdio until the input closes. */
export function serve({ input = process.stdin, output = process.stdout, host } = {}) {
  const server = createServer(host);
  const lines = createInterface({ input, crlfDelay: Infinity });
  const send = (message) => { if (message) output.write(`${JSON.stringify(message)}\n`); };
  // One at a time, in order: tools share the loaded account.
  let queue = Promise.resolve();
  lines.on('line', (line) => {
    if (!line.trim()) return;
    queue = queue.then(async () => {
      if (line.length > MAX_LINE) return send({ jsonrpc: '2.0', id: null, error: { code: -32600, message: 'Message too large' } });
      let message;
      try { message = JSON.parse(line); } catch { return send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } }); }
      try { send(await server.handle(message)); } catch { send({ jsonrpc: '2.0', id: message?.id ?? null, error: { code: -32603, message: 'Internal error' } }); }
    });
  });
  lines.on('close', () => { queue.then(() => server.close()); });
  return server;
}

const invoked = () => { try { return realpathSync(process.argv[1]) === fileURLToPath(import.meta.url); } catch { return false; } };
if (invoked()) serve();
