# perfect-storm-labs.github.io

Public landing site for **FrankenBits / Perfect Storm Labs**, served via GitHub Pages at
<https://perfect-storm-labs.github.io>. Vanilla HTML/CSS/JS (no build step) — a video-choreographed
cinematic landing experience. Source/dev tooling lives in the private `StormForge_web` project; only
the shippable page is mirrored here.

## What's live now
- **Outer loop** — the ambient exterior loop (`assets/intro_loop.mp4`) autoplays as the hero
  background. This is the deployment proof.
- The downstream journey (Enter the Lab → dive → mirror-ball hub → forge cuts) is wired in `app.js`
  but its heavier clips are **not committed** (see Video policy). The page degrades gracefully:
  missing clips fall back to posters/stills, so nothing strands the visitor.

## Video policy (important)
GitHub's 100 MB/file limit + ~1 GB repo budget mean big clips **do not** go in this repo. They are
hosted on a CDN (Cloudflare R2 or S3+CloudFront) and referenced by URL via `data-src` /
`data-explore`. The one committed exception is `assets/intro_loop.mp4` (25 MB), kept so the live
site shows motion immediately; `.gitignore` ignores all other `assets/*.mp4`.

When the CDN is set up: upload the clips, then point the `data-src` (loop/dive/elevator/mirror) and
`data-explore` (forge cuts) attributes at the hosted URLs.

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
