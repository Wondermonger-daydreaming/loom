# Loom + Loom Companion

A maintained continuation of [celeste's Loom](https://github.com/cosmicoptima/loom), a recursively branching writing interface for Obsidian, with revision tools and a shared OpenRouter model browser.

Maintained by [@wondermonger](https://github.com/Wondermonger-daydreaming). Original Loom by [celeste](https://celeste.exposed), based on [socketteer's Loom](https://github.com/socketteer/loom). Companion originated with Tomás P. Pavan and Claude.

Loom remains **AGPL-3.0**. Copyright and license notices are preserved in [LICENSE](LICENSE). See [Companion notices](companion/NOTICE.md) for additional attribution.

## Install or update

Requires Obsidian desktop 1.13 or newer. Built files are included; Node is only needed for the optional installer or rebuilding.

Close Obsidian, download/clone this repository, and run:

    node scripts/install.mjs /path/to/your/vault/.obsidian

The installer backs up existing plugin code, then installs Loom, Companion and their shared support module. It does not read or write your notes, generation trees, API keys, or data.json files.

Restart Obsidian and enable **Loom** and **Loom Companion** in Community plugins. The loom-shared folder is a support module, not a separately enabled plugin.

For manual installation:

| Repository files | Destination inside your vault |
| --- | --- |
| main.js, manifest.json, styles.css | .obsidian/plugins/loom/ |
| All runtime files in companion/ | .obsidian/plugins/loom-companion/ |
| shared/main.js | .obsidian/plugins/loom-shared/main.js |

**Copy all three components together.** The shared runtime is required by both plugins; replacing only Loom's main.js is no longer sufficient. Preserve your existing data.json files. Custom configuration folders can use the manual installation layout.

## What the plugins do

### Loom: explore branches

From a point in your text, generate alternative continuations and explore them in a tree. Existing provider integrations and navigation shortcuts remain available.

New generated nodes include **Generation details** in their context menu. If a source branch changes during generation, results remain in history instead of being attached to a stale parent. Moving to another note prevents automatic navigation to a generated child.

### Companion: revise and develop passages

Open the sprout ribbon icon or run **Loom Companion: Open panel**.

- **Recast:** Tighten, Expand, Rephrase, Shift register, Smooth the seam, or apply a custom instruction. Preview changes, reject individual changes, copy the selected result, or retry with an additional instruction.
- **Christen:** suggest titles, review a note description, or suggest links to existing notes.
- **Seed:** generate lateral fragments to insert into a note.

Actions capture the original editor, file, document text and range. Moving the cursor does not redirect the edit. Changing, renaming or closing the original document blocks stale results; recover them from history or copy them from the preview. An original note still open in another split remains a valid target.

Description updates edit only the YAML value's source range, preserving unrelated formatting and comments. Unsafe structures such as duplicate keys, collection-valued descriptions, or an anchor defined by the description are refused. Headings are inserted after frontmatter.

Direct Recast has a visible **Cancel** button in its progress notification. The command palette also provides **Cancel active generations**. Seed/Christen have a panel cancel button.

## Shared model management

Use **Choose model (shared catalog)** from either plugin's command palette, **Browse models** in Loom settings, or the model button in Companion.

- Search models, mark favorites, and filter to favorites.
- Inspect context limits, supported parameters and base input/output prices per million tokens. Variable pricing is marked.
- Refresh the public OpenRouter catalog manually; failed refreshes preserve the cached catalog.
- Enter a custom model ID even when it is absent from the catalog.

Both plugins share the catalog and favorites while keeping independent active-model choices. The bundled September 15, 2026 snapshot contains 369 text-input/text-output entries, excluding batch-only variants. Refresh does not delete custom presets or change your active model.

Known models omit unsupported sampling parameters and cap requested output at their published completion limit. Custom models keep supplied settings because their capabilities are unknown.

[presets.example.json](presets.example.json) contains 57 sanitized OpenRouter presets. Every API key is the placeholder "$OPENROUTER_API_KEY". Prefer the shared picker for current catalog entries; copy example presets into settings only after backing up your data.

The implementation follows the [OpenRouter model schema](https://openrouter.ai/docs/guides/overview/models) and [parameter reference](https://openrouter.ai/docs/api_reference/parameters). Catalog availability does not guarantee every provider or quantization route works.

## API keys

For both plugins' OpenRouter requests, set the OPENROUTER_API_KEY environment variable before launching Obsidian, or store the key in the file named .loom-openrouter.key in your home directory.

Loom also preserves its flexible preset key resolution: literal keys, "$ENV_VAR_NAME" references, and provider-specific key-file fallbacks. Existing OpenRouter quantization preferences remain supported.

**Never commit data.json:** it can contain API keys and writing state. This repository excludes user data, history, vault notes and backups.

## Local history and recovery

Use **Generation history** from either plugin, or **Generation details** on a new Loom node.

Records include model, timestamps, prompts, parameters, results, status, and provider response IDs/usage when returned. Credentials are excluded. Failed/cancelled Companion requests keep partial output; accepted revisions record the text applied.

History is stored locally under your configuration folder's loom-shared/history directory. It contains private writing and has no automatic expiry. Cache and favorites also live under loom-shared in the configuration folder, separate from the runtime module in plugins.

Copy previous output or load a record's model/settings without sending a request. Original prompts remain available for inspection. Restoring settings cannot guarantee identical output when sampling, providers or models change. Existing nodes are not retroactively attributed.

## Build and test

Editable source:

- development/loom-companion/src — Companion TypeScript.
- development/shared — shared catalog, model UI and provenance service.
- development/loom-main.js — maintained Loom bundle; upstream TypeScript remains at cosmicoptima/loom.
- development/tests — automated and live regression checks.

From the development directory:

    npm ci
    npm run check
    npm test
    npm run build
    npm run package

Build writes staged files under development/dist. Package runs checks/tests and refreshes the tracked root, companion and shared runtime files. Neither command installs into a vault. Use scripts/install.mjs explicitly to install.

The live harness, development/tests/live-obsidian.cjs, requires Playwright Core, an isolated running Obsidian profile with a local CDP endpoint, both plugins installed, and a fixture Second.md containing "This note must remain unchanged." plus a newline. Set LOOM_TEST_VAULT to that exact temporary vault path; the harness refuses another vault. Optional variables are LOOM_TEST_CDP_URL, LOOM_TEST_PLAYWRIGHT_PATH and LOOM_TEST_SCREENSHOT. It uses mocked responses and modifies fixture notes only.

Validation: **36 automated behavior checks and five live Obsidian UI checks**, plus type/syntax checks. Live testing used Obsidian 1.13.7 on Linux with mocked responses, not paid generation calls.

## Limits and next steps

- Target validation is conservative: edits elsewhere in the original note also require a fresh review.
- Long-passage diffs may use a larger grouped change to bound memory.
- Link candidates use canonical note paths but are capped at 1,000, without semantic ranking.
- Generation history has no retention controls yet.
- Promising additions: selection-only seeding, ranked related-note retrieval, a revision queue, and a context preview.

## Rollback

The installer prints the code backup directory. With Obsidian closed, restore the previous runtime files for Loom, Companion and loom-shared together. Do not restore older data.json files merely to roll back code: they also contain older writing state.

## Default Loom hotkeys

| Action | Hotkey |
| --- | --- |
| Generate | Ctrl+Space |
| Generate siblings | Ctrl+Shift+Space |
| Split at point | Alt+s |
| Split and create child | Alt+c |
| Delete current node | Alt+Backspace |
| Merge with parent | Alt+m |
| Next / previous sibling | Alt+Down / Alt+Up |
| Parent / child | Alt+Left / Alt+Right |
| Switch to a node | Shift+click its text |

See [CHANGELOG.md](CHANGELOG.md) for this continuation's modifications and [upstream documentation](https://github.com/cosmicoptima/loom) for the original interface.
