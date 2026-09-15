# Changelog

## Loom 1.23.0 / Companion 0.2.0 — 2026-09-15

- Shared OpenRouter model browser with search, favorites, refresh, offline catalog, context limits, prices, custom IDs and capability-aware sampling settings.
- Refreshed sanitized example presets: 57 models. The bundled shared catalog contains 369 usable text-model entries, excluding batch-only variants.
- Companion edits capture the original file, editor and passage. Changed, renamed or closed targets reject stale results.
- Recast displays selectable revision diffs, supports retry instructions, and provides a visible Cancel button in direct mode.
- Description updates change only the YAML value source range, preserving unrelated comments, quoting, whitespace and line endings. Unsafe or ambiguous YAML edits are refused.
- Seed and Christen read live editor text; H1 insertion respects frontmatter. Link candidates use note paths to distinguish duplicate names.
- Local generation history records prompts, parameters, results and status. New Loom nodes link to their generation details.
- Requests support cancellation, bounded concurrency, explicit streaming failures and recovery of partial output. State/settings saves are serialized.
- Fixed shared-module loading by injecting Obsidian's API through its plugin loader.
- Added editable local source, pinned dependencies, regression tests, release packaging and a code-only backup/install script.

Validation: 36 automated behavior checks, TypeScript/syntax checks, and five live Obsidian UI checks in an isolated vault with mocked responses. No paid generation calls were used for these checks. Live testing used Obsidian 1.13.7 on Linux.

Compatibility: this update requires the shared runtime alongside either plugin. The installer copies all required files. Existing data.json files are not modified. Do not mix an old shared runtime with new plugin bundles.
