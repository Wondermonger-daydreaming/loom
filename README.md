# loom

A maintained continuation of **[Loom](https://github.com/cosmicoptima/loom)** — celeste's
recursively-branching language-model interface for Obsidian. Upstream has had no commits since
**March 2025**; this repository carries the build forward with a few small fixes so it keeps
working, and so a friend (and anyone else) can install it.

Maintained here by **[@wondermonger](https://github.com/Wondermonger-daydreaming)**.
Original plugin by **celeste** ([celeste.exposed](https://celeste.exposed) ·
[Patreon](https://patreon.com/parafactual)). Loom's original concept is by
[socketteer](https://github.com/socketteer/loom).

> **License:** AGPL-3.0 (inherited from upstream — see [LICENSE](LICENSE)). This is a modified
> redistribution; it stays AGPL-3.0, and celeste's copyright and license are preserved intact.

---

## What Loom is

Loom is a recursively branching interface to language models, built for exploratory and
experimental use of base models. From any point in your text you hit `Ctrl+Space` and Loom
generates `n` child nodes — each a different completion of the text leading up to the cursor —
presented in a tree interface and a settings panel in the right sidebar. It can request
completions from Cohere, TextSynth, OpenAI, Azure OpenAI, OpenRouter-style endpoints, and any
implementation of [openai-cd2-proxy](https://github.com/cosmicoptima/openai-cd2-proxy).

For the full original documentation, see the [upstream README](https://github.com/cosmicoptima/loom).

## Changes in this continuation

Per AGPL-3.0 §5, the modifications carried in this build (2026) over upstream are:

- **Flexible API-key resolution** (`resolveLoomApiKey`). A preset's `apiKey` can now be:
  1. a literal key (as before);
  2. `$ENV_VAR_NAME` — resolved from that environment variable; or
  3. left to fall back to a key file at `~/.loom-<provider>.key`.

  This lets you keep keys **out of** the plugin's `data.json` settings file entirely.
- **OpenRouter quantization fix** — corrects how the quantization setting is sent with
  completion requests.

These changes live in the bundled `main.js` (esbuild output). The corresponding upstream source
is at [cosmicoptima/loom](https://github.com/cosmicoptima/loom).

## Install

This repo ships the built plugin — no build step needed.

1. In your vault, create the folder `.obsidian/plugins/loom/`.
2. Copy **`main.js`**, **`manifest.json`**, and **`styles.css`** into it.
3. In Obsidian → **Settings → Community plugins**, enable **Loom**.
4. Open the right sidebar (network icon) to see the tree interface.

## Configure your keys

Open the **Loom** tab in Settings and add a provider/preset. To avoid storing a key in plaintext,
use this build's new options: set the preset's API key to `$OPENAI_API_KEY` (any env var name),
or drop the key into `~/.loom-<provider>.key` (e.g. `~/.loom-openai.key`).

> ⚠️ Your settings and generation trees live in `data.json` inside the plugin folder. **That file
> contains your API keys and your writing — it is `.gitignore`d here and must never be committed.**

## Default hotkeys

| Action | Hotkey |
|---|---|
| Generate | `Ctrl+Space` |
| Generate siblings | `Ctrl+Shift+Space` |
| Split at point | `Alt+s` |
| Split at point + create child | `Alt+c` |
| Delete current node | `Alt+Backspace` |
| Merge with parent | `Alt+m` |
| Next / previous sibling | `Alt+Down` / `Alt+Up` |
| To parent / to child | `Alt+Left` / `Alt+Right` |
| Switch to a node | `Shift+click` its text |

## Credits & license

- **Original plugin:** celeste — [cosmicoptima/loom](https://github.com/cosmicoptima/loom)
- **Loom concept:** socketteer — [socketteer/loom](https://github.com/socketteer/loom)
- **This continuation:** [@wondermonger](https://github.com/Wondermonger-daydreaming)

Licensed under **AGPL-3.0**. See [LICENSE](LICENSE). If you find Loom valuable, consider
[supporting celeste on Patreon](https://patreon.com/parafactual).
