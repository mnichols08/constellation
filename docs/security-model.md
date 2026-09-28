# Security model

Configuration, scene JSON, transforms, mappings, timelines, hierarchy and stories are declarative data. No config/share value is passed to `eval`, `Function` or a dynamic module loader. Executable source, layout and renderer extensions are explicitly registered by trusted application code and have that application's privileges; registration is not a sandbox.

Scene validation rejects non-JSON values, cycles, unsafe object keys, invalid IDs/endpoints/styles, malformed temporal/hierarchical/story records and bounded-size violations. Renderer text, attributes, icon descriptors and embedded JSON have separate escaping/validation boundaries. Imported component CSS rejects external URLs/imports/escapes/expressions; trusted local CLI/workflow CSS remains supported. CSS can change presentation and should come from a trusted author.

Offline HTML embeds its WASM and includes a hash-based script CSP. It permits WASM compilation, blocks unapproved scripts/event handlers, and denies network fetching by default. Inline styles are required by SVG presentation. Project links permit only HTTP(S), strip no credentials silently, and reject URLs containing credentials. They use `noopener noreferrer`. Runtime metadata and narration use text APIs. Studio Story previews use a sandboxed iframe.

Source fetches run only for configured/registered sources, use cancellation and are subject to the host's CORS/CSP and network policy. Browser config and share links must not contain tokens. The Action obtains its token through the existing environment/input mechanism; `.env` remains ignored. Public-repository filters and organization coverage notes remain part of compilation. Historical metrics are never manufactured.

WASM is required for supported rendering. Missing assets or restrictive policy produce a clear startup failure; there is no alternate JavaScript layout/traversal fallback. Keep the packaged engine assets and MIME types intact.

Tests cover malformed configs/scenes, prototype keys, escaping, safe links, CSP enforcement, module registration boundaries, private repository scope, cancellation, isolated package loading and browser interactions. Bounds are detailed in [scaling](scaling.md), [timeline](timeline.md), [hierarchy](hierarchical-scenes.md) and [Story](story-mode.md) guides.
