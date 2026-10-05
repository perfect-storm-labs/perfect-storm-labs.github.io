/* FrankenBits landing — POC choreography.
   Vanilla JS (no build step → deploys straight to GitHub Pages). Drives video "stages".
   Design notes:
   - Videos lazy-load via data-src → src only when needed (keeps initial paint fast; big
     destination clips never download unless the visitor chooses them).
   - The dive video swaps to a still IMG on 'ended' so the final frame holds cleanly.
   - ELEVATOR JOURNEY: a shared elevator segment (doors close → fade to black) chains into the
     chosen destination (fade from black → doors open). The black boundary hides the handoff, and
     keeping segments separate means the elevator is reused for every destination (forge now;
     lobby/lounge later = just add data-<dest> + a button).
   - Browser autoplay requires muted+playsinline.
*/

const stages = {
  loop:    document.getElementById("stage-loop"),
  dive:    document.getElementById("stage-dive"),
  journey: document.getElementById("stage-journey"),
};

const loopVideo     = document.getElementById("loop-video");
const diveVideo     = document.getElementById("dive-video");
const elevatorVideo = document.getElementById("elevator-video");
const destVideo     = document.getElementById("dest-video");
const heroStill     = document.getElementById("hero-still");
const mirrorSettle  = document.getElementById("mirror-settle");
const mirrorLoop    = document.getElementById("mirror-loop");
const labNav        = document.getElementById("lab-nav");
const wordmark      = document.querySelector(".proj-wordmark");

/** Attach real src from data-src the first time a video is needed.
 *  Returns true if a REAL (non-placeholder) src is present, false otherwise. */
function ensureLoaded(video) {
  const ds = video.dataset.src || "";
  const isReal = ds && !ds.startsWith("REPLACE_");
  if (isReal && !video.src) {
    video.src = ds;
  }
  return isReal;
}

/** Show one stage, hide the rest. Returns the activated stage key. */
function showStage(key) {
  for (const [k, el] of Object.entries(stages)) {
    el.classList.toggle("is-active", k === key);
  }
  return key;
}

/* Return the mirror-ball hub videos to their clean first-load state. Called on "Enter the Lab" so
   a re-entry (after Back outside) runs the dive→settle→loop chain identically to a fresh page load.
   Without this, the videos linger from the previous visit (only paused, still .is-shown / unhidden),
   so their 'playing'/'ended' events may not re-fire → the handoff stalls and the nav stayed hidden.
   Also re-shows the dive video, which the previous visit's handoff had hidden (hidden dive on
   re-entry = black screen until the dive ends). */
function resetHub() {
  for (const v of [mirrorSettle, mirrorLoop]) {
    v.pause();
    v.classList.remove("is-shown");
    v.hidden = true;
    try { v.currentTime = 0; } catch (_) { /* not seekable yet; harmless */ }
  }
  diveVideo.hidden = false;     // first visit's handoff hid it; re-show so the replayed dive is visible
  // Reset the wordmark so it re-ignites (a heartbeat after the nav) on this entry, same as a fresh
  // load — otherwise it would linger lit through the dive on re-entry.
  if (wordmark) wordmark.classList.remove("wordmark-lit");
}

/* ── Stage 1 → 2 : "Enter the Lab" ─────────────────────────── */
document.getElementById("btn-enter").addEventListener("click", () => {
  showStage("dive");
  heroStill.hidden = true;
  labNav.hidden = true;
  resetHub();                   // clean slate so the dive→settle→loop handoff behaves like first load
  const hasVideo = ensureLoaded(diveVideo);
  if (!hasVideo) {
    // no dive clip yet (placeholder) → go straight to the hero still, no racing a failed play()
    revealHero();
    return;
  }
  // real dive clip present → play it; on 'ended' it hands off to the mirror-ball apparatus.
  diveVideo.currentTime = 0;
  const p = diveVideo.play();
  if (p) p.catch(revealHero);   // autoplay blocked → fall back to the hero still, don't strand

  // Preload + warm the SETTLE clip NOW (while the dive plays) so a decoded frame is ready at the
  // handoff — this is what kills the flash/blip between the two videos. We prime it by loading and
  // seeking to frame 0; the browser decodes the first frame without showing it (element hidden).
  if (ensureLoaded(mirrorSettle)) {
    mirrorSettle.load();
    mirrorSettle.currentTime = 0;
  }
  // The loop is warmed later (during the settle) so its first frame is ready for that handoff too.
});

/* ── ELEVATOR JOURNEY ──────────────────────────────────────────
   startJourney(dest): play the shared elevator segment; when it ENDS (on black), fade up the
   destination video. `dest` names a data-<dest> attribute on #dest-video (e.g. data-explore).
   Add a destination later = render its clip + add data-<dest> + a button with data-goto="<dest>". */
let pendingDest = null;

function startJourney(dest) {
  pendingDest = dest;
  showStage("journey");
  destVideo.hidden = true;
  destVideo.pause();
  elevatorVideo.hidden = false;

  if (!ensureLoaded(elevatorVideo)) {   // elevator clip missing → go straight to destination
    playDestination();
    return;
  }
  elevatorVideo.currentTime = 0;
  const p = elevatorVideo.play();
  if (p) p.catch(() => playDestination());  // if elevator can't play, don't strand the user
}

/* elevator ends on black → swap to destination, which fades up from black (doors open) */
elevatorVideo.addEventListener("ended", playDestination);

/* ── DESTINATION = AUTOCHAINED CUTS ────────────────────────────
   A destination's data-<dest> is a COMMA-SEPARATED list of clips. The forge scene is re-rendered
   in GitHub-friendly cuts on HARD scene boundaries, so they just play back to back as one film
   (no fade/seam engineering). Between cuts we show a silent-film intertitle (#intertitle) that is
   BUFFERING-AWARE: held for a minimum beat AND until the next cut can play through, whichever is
   longer — so fast loads still get the stylistic beat and slow loads never look like a stall.
   To add a cut: append its filename to the list. forge_cut_1..N collectively replace forge.mp4. */
const intertitle     = document.getElementById("intertitle");
const intertitleText = document.getElementById("intertitle-text");

const CARD_MIN_MS = 1600;   // minimum time a card stays up (the stylistic beat)
/* Optional per-gap captions (silent-film intertitles). Index i = card shown BEFORE cut i+1.
   Leave an entry empty ("") for a plain hold with no text. Add/edit freely as cuts are rendered. */
const FORGE_CARDS = [
  "Into the forge\u2026",
];

let destCuts = [];          // the parsed list of clip srcs for the active destination
let destIndex = 0;          // which cut is currently playing

function parseCuts(value) {
  return (value || "")
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s && !s.startsWith("REPLACE_"));
}

function playDestination() {
  destCuts = parseCuts(pendingDest && destVideo.dataset[pendingDest]);
  if (!destCuts.length) return;         // destination not built yet (e.g. lobby)
  elevatorVideo.hidden = true;
  destVideo.hidden = false;
  destIndex = 0;
  playCut(0);                           // first cut plays immediately (doors open from black)
}

/* Play cut `i`. On its 'ended', either hand off to the next cut via an intertitle, or (if it was
   the last cut) stop and leave the controls/last frame — matching the old single-clip behavior. */
function playCut(i) {
  destIndex = i;
  destVideo.src = destCuts[i];
  destVideo.load();
  destVideo.currentTime = 0;
  const p = destVideo.play();
  if (p) p.catch(() => {});             // autoplay/decode blocked → controls shown; user presses play
}

destVideo.addEventListener("ended", () => {
  const next = destIndex + 1;
  if (next >= destCuts.length) return;  // last cut → hold on final frame (controls available)
  showIntertitle(next);                 // cover the swap/buffer, then play the next cut
});

/* Show the silent-film card, preload the next cut underneath, then play it once BOTH the minimum
   beat has elapsed AND the next cut can play through (whichever is longer). */
function showIntertitle(nextIndex) {
  const caption = FORGE_CARDS[nextIndex - 1] || "";
  intertitleText.textContent = caption;
  intertitle.classList.toggle("no-text", !caption);
  intertitle.hidden = false;
  // force reflow so the opacity transition runs even though we just unhid it
  void intertitle.offsetWidth;
  intertitle.classList.add("is-shown");

  // preload the next cut while the card is up (decode its first frame behind the card)
  destVideo.src = destCuts[nextIndex];
  destVideo.load();

  let ready = false;
  let beatDone = false;
  let advanced = false;
  let readyCap = null;
  const tryAdvance = () => {
    if (advanced || !ready || !beatDone) return;
    advanced = true;
    clearTimeout(readyCap);
    destVideo.removeEventListener("canplaythrough", onReady);
    hideIntertitle(() => playCut(nextIndex));
  };
  const onReady = () => { ready = true; tryAdvance(); };
  destVideo.addEventListener("canplaythrough", onReady);
  // safety: if canplaythrough never fires (some browsers are stingy), proceed after a cap
  readyCap = setTimeout(onReady, 8000);
  setTimeout(() => { beatDone = true; tryAdvance(); }, CARD_MIN_MS);
}

function hideIntertitle(done) {
  intertitle.classList.remove("is-shown");
  // wait out the fade before hiding + running the callback (keeps the card over the swap)
  setTimeout(() => {
    intertitle.hidden = true;
    intertitleText.textContent = "";
    if (done) done();
  }, 450);
}

/* when the dive finishes, hand off to the LIVE mirror-ball apparatus + reveal the lab nav.
   TWO-STAGE HUB:
     dive ends → SETTLE plays once (balls roll into alignment) → LOOP runs forever (720f rotate).
   Anti-flash technique (same as the old dive→bench handoff): the incoming clip starts transparent
   and is only faded IN once it's actually painting a frame ('playing'), with the previous clip's
   last frame held underneath. Stills (HERO3) are the fallback at each step so we never strand on a
   frozen/blank frame if autoplay or decode is blocked. */
diveVideo.addEventListener("ended", revealHero);

function revealHero() {
  // NOTE: the lab nav is intentionally NOT revealed here. The projected links should ignite only
  // AFTER the mirror balls have settled (they anchor to the settled ball positions), so the reveal
  // is deferred to revealNav(), fired when the LOOP starts (post-settle). See startMirrorLoop().

  // Stage A: play the SETTLE once. When it's painting, fade it over the dive's last frame.
  if (ensureLoaded(mirrorSettle)) {
    mirrorSettle.hidden = false;
    mirrorSettle.classList.remove("is-shown");   // start transparent
    heroStill.hidden = true;

    let settleShown = false;
    const showSettle = () => {
      if (settleShown) return;
      settleShown = true;
      mirrorSettle.classList.add("is-shown");     // fade settle in over the dive's last frame
      setTimeout(() => { diveVideo.hidden = true; }, 950);
      mirrorSettle.removeEventListener("playing", showSettle);
      clearTimeout(settleFallback);
    };
    mirrorSettle.addEventListener("playing", showSettle);
    // fallback: 'playing' may not re-fire on a resumed element (re-entry) → show anyway so the
    // settle doesn't stay transparent (which would leave a black frame once the dive is hidden).
    const settleFallback = setTimeout(showSettle, 400);

    // warm the LOOP now so its first frame is decoded and ready for the settle→loop handoff
    if (ensureLoaded(mirrorLoop)) {
      mirrorLoop.load();
      mirrorLoop.currentTime = 0;
    }

    mirrorSettle.currentTime = 0;
    const p = mirrorSettle.play();
    if (p) p.catch(() => startMirrorLoop());  // settle can't play → skip straight to the loop
    return;
  }
  // no settle clip → try the loop directly, else fall back to the still
  startMirrorLoop();
}

/* Reveal the projected lab-nav links. Fired AFTER the balls have settled (loop start / fallback)
   so the links ignite in sync with the live rotating hub, not during the settle animation.
   LATER: when the ring/LED-dot energize is baked into the render, trigger this off that moment
   instead (e.g. a timed point in the loop) so each link lights as its ball's dots power on. */
function revealNav() {
  labNav.hidden = false;
  // Ignite the projected wordmark a HEARTBEAT after the nav so it reads as its own entity powering
  // on (not part of the same flash as the links). ~700ms after the links ignite. Idempotent via
  // the class, so re-entry (Back outside → Enter) doesn't re-trigger a double ignite.
  if (wordmark && !wordmark.classList.contains("wordmark-lit")) {
    setTimeout(() => wordmark.classList.add("wordmark-lit"), 700);
  }
}

/* Stage A→B: settle finished → start the seamless LOOP (the live hub). Fade the loop in over the
   settle's held last frame (frame 215 ≈ loop frame 216, so this is frame-perfect). */
mirrorSettle.addEventListener("ended", startMirrorLoop);

function startMirrorLoop() {
  if (ensureLoaded(mirrorLoop)) {
    mirrorLoop.hidden = false;
    mirrorLoop.classList.remove("is-shown");       // start transparent
    heroStill.hidden = true;

    // showLoop fades the loop in + reveals the nav. Guarded so it runs ONCE whether it's triggered
    // by the 'playing' event (first entry: fresh decode) OR the fallback timer below (re-entry:
    // the element was only paused, so 'playing' may not re-fire — this is what left the nav hidden
    // after Back outside → Enter the Lab).
    let shown = false;
    const showLoop = () => {
      if (shown) return;
      shown = true;
      mirrorLoop.classList.add("is-shown");         // fade loop in over the settle's last frame
      revealNav();                                  // balls are settled → ignite the projected links
      setTimeout(() => {                            // then drop settle (+ dive) underneath
        mirrorSettle.hidden = true;
        diveVideo.hidden = true;
      }, 950);
      mirrorLoop.removeEventListener("playing", showLoop);
      clearTimeout(revealFallback);
    };
    mirrorLoop.addEventListener("playing", showLoop);
    // fallback: if 'playing' doesn't fire within 400ms (resumed-from-paused on re-entry), reveal
    // anyway so the nav never gets stranded hidden.
    const revealFallback = setTimeout(showLoop, 400);

    mirrorLoop.currentTime = 0;
    const p = mirrorLoop.play();                     // loops forever (loop attr)
    if (p) p.catch(showHeroStill);                   // autoplay/decode blocked → static still
    return;
  }
  showHeroStill();                                   // no loop clip → static hub
}

/* static fallback hub: the HERO3 bench still (balls already settled in the still) */
function showHeroStill() {
  mirrorSettle.hidden = true;
  mirrorLoop.hidden = true;
  mirrorSettle.classList.remove("is-shown");
  mirrorLoop.classList.remove("is-shown");
  heroStill.hidden = false;
  diveVideo.hidden = true;
  revealNav();                                       // still shows settled balls → links available
}

/* ── nav buttons (data-goto) ───────────────────────────────── */
function pauseHub() {                 // stop the live mirror-ball apparatus (both stages)
  mirrorSettle.pause();
  mirrorLoop.pause();
}

document.querySelectorAll("[data-goto]").forEach((btn) => {
  btn.addEventListener("click", () => {
    const dest = btn.dataset.goto;
    if (dest === "explore") {
      pauseHub();                       // leaving the lab → stop the hub
      startJourney("explore");          // take the elevator → reception (forge clip stand-in for now)
    } else if (dest === "loop") {
      pauseHub();                       // leaving the lab → stop the hub
      showStage("loop");
    } else if (dest === "dive") {
      // back to the lab = the live mirror-ball hub (don't re-run the dive or elevator).
      // Resume directly at the LOOP (skip replaying the one-time settle on return). Balls are
      // already settled here, so reveal the nav immediately rather than waiting on loop-start.
      showStage("dive");
      elevatorVideo.pause();
      destVideo.pause();
      revealNav();                      // settled balls already present → links available at once
      startMirrorLoop();                // restart the loop hub (or still fallback)
    }
  });
});

/* ── startup: wire the always-on loop video + report any remaining placeholders ───── */
window.addEventListener("DOMContentLoaded", () => {
  // the loop is on the active first stage → load + play it now (muted autoplay).
  // ANTI-TEAR: keep the poster (Image5_002.png) visible and only fade the VIDEO in once it's
  // actually painting a frame (not just on play()). This hides the poster→first-decoded-frame
  // swap that was tearing on first load; the poster simply holds for the ~1-2s until the clip is
  // ready. 'playing' is the real "painting" signal; 'canplay' + a short timer are fallbacks so the
  // loop never gets stranded transparent if 'playing' doesn't fire (cached/fast-start cases).
  const showLoopVideo = () => {
    loopVideo.classList.add("is-shown");
    const poster = document.getElementById("loop-poster");
    if (poster) poster.classList.add("is-hidden");   // fade the held poster out from underneath
    loopVideo.removeEventListener("playing", showLoopVideo);
    loopVideo.removeEventListener("canplay", showLoopVideo);
    clearTimeout(loopRevealFallback);
  };
  const loopRevealFallback = setTimeout(showLoopVideo, 2000);  // never hold the poster > ~2s
  loopVideo.addEventListener("playing", showLoopVideo);
  loopVideo.addEventListener("canplay", showLoopVideo);

  if (ensureLoaded(loopVideo)) {
    const p = loopVideo.play();
    if (p) p.catch(() => {});   // poster (hero still) remains if autoplay is blocked
  }

  const unset = [loopVideo, diveVideo, elevatorVideo, mirrorSettle, mirrorLoop]
    .filter((v) => v.dataset.src && v.dataset.src.startsWith("REPLACE_"));
  if (unset.length) {
    console.info(
      `[FrankenBits POC] ${unset.length} video src(s) still placeholders. ` +
      `Set data-src on #${unset.map((v) => v.id).join(", #")} to your hosted URLs.`
    );
  }
});
