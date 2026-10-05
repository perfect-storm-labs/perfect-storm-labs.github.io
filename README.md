# perfect-storm-labs.github.io

Public landing site for **FrankenBits / Perfect Storm Labs**, served via GitHub Pages at
<https://frankenbits.com> (custom domain; also <https://perfect-storm-labs.github.io>). Vanilla
HTML/CSS/JS (no build step) — a video-choreographed cinematic landing experience. Source/dev
tooling lives in the private `StormForge_web` project; only the shippable page is mirrored here.

## What's live now
- **Full journey, end to end:** outer loop → Enter the Lab → dive → mirror-ball nav hub
  (settle → loop) → "Explore More" → elevator → `forge_cut_1`. All referenced clips are committed
  and serving (HTTP 200 + 206 range, so seeking/looping works).
- Forge cuts 2–N aren't rendered yet; the autochain + silent-film intertitle machinery is in place
  and plays whatever cuts are listed in `data-explore`. The page degrades gracefully if any clip is
  missing (poster/still fallbacks), so nothing strands the visitor.

## Video policy (no CDN — clips hosted in-repo)
Decision: **no CDN** (cost). GitHub Pages hosts the clips directly, which is free and works because
every referenced clip is under GitHub's **100 MB/file** limit. `.gitignore` ignores only clips we
never ship — the replaced 140 MB `forge.mp4` monolith and unreferenced files — so a stray heavy
file can't sneak into history.
- ⚠️ **History bloat:** re-rendering a clip (same filename, overwritten) keeps the OLD copy in git
  history forever → the repo grows with each re-render. Commit a clip only once it's final; if the
  repo bloats, do a deliberate `git filter-repo` history rewrite in its own session (backup first).
- If the forge cut count grows large, revisit CDN (R2 = no egress) and swap `data-src` /
  `data-explore` to hosted URLs then.

## The forge destination = autochained cuts
"Explore More" takes the elevator to the forge, played as a sequence of GitHub-friendly cuts
(`forge_cut_1..N`) rendered on hard scene boundaries. They autochain back to back as one film;
a silent-film intertitle covers each swap/buffer. `data-explore` on `#dest-video` is a
comma-separated cut list — append a filename to add a cut. The cuts collectively replace the old
monolithic `forge.mp4`.

## Local preview
The dev server (`serve.py`, with HTTP range support + no-cache) lives in the `StormForge_web`
project, not here. For a quick static check here, any range-capable static server works.

## Deploy
Pushing to `main` publishes via GitHub Pages. `.nojekyll` disables Jekyll processing (plain static).
