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

/* Shield payoff beat (end of the forge journey): the seamless shield loop, the credits roll
   overlay, and the 4-LED projected nav. Driven by startShieldPayoff() when the last forge cut ends. */
const shieldLoop    = document.getElementById("shield-loop");
const shieldCredits = document.getElementById("shield-credits");
const shieldNav     = document.getElementById("shield-nav");
const forgeSkip     = document.getElementById("forge-skip");  // "Skip to the End" (jumps to payoff)

/* ── TITLE SEQUENCE (movie intro) ───────────────────────────────
   Staged credit cards shown over the loop on EVERY arrival at the loop stage (fresh load AND
   "Back outside" return). Cards fade in/out one at a time, then the Enter button fades in.
   The Enter button carries .is-pending (invisible, non-interactive) until the sequence finishes.
   TODO(skip): add a click/keydown listener on #stage-loop that calls skipTitleSequence() to jump
   straight to the final card + reveal Enter (design asked for click-to-skip eventually). */
const btnEnter      = document.getElementById("btn-enter");
const titleCards    = Array.from(document.querySelectorAll(".title-card"));

/* Per-card hold times (ms) each card stays fully up before fading to the next. Cards 1–4 hold 5s
   each per the brief; the FINAL card (5) persists (its hold is unused — it never fades) and Enter
   is revealed ENTER_AFTER_FINAL ms after it appears. Fade is 0.8s (CSS). */
const TITLE_HOLDS = [5000, 5000, 5000, 5000, 0];
const TITLE_FADE  = 800;   // keep in sync with .title-card transition in styles.css
const ENTER_AFTER_FINAL = 3000;  // reveal Enter 3s after the final card appears

let titleTimers = [];      // outstanding timeouts so a re-run (re-entry) can cancel a prior run
let titleRunToken = 0;     // invalidates an in-flight sequence if the stage changes mid-run

function clearTitleTimers() {
  titleTimers.forEach(clearTimeout);
  titleTimers = [];
}

/* Reset all cards + the Enter button to the pre-sequence state (nothing shown, button pending). */
function resetTitleSequence() {
  clearTitleTimers();
  titleRunToken++;                         // cancel any in-flight run
  titleCards.forEach((c) => {
    c.classList.remove("is-shown");
    c.setAttribute("aria-hidden", "true");
  });
  if (btnEnter) btnEnter.classList.add("is-pending");
}

/* Reveal the Enter button (end of sequence, or on skip). */
function revealEnter() {
  if (btnEnter) btnEnter.classList.remove("is-pending");
}

/* Play the staged title cards, then reveal Enter. Idempotent per-call via a run token so a
   re-entry restarts cleanly without two sequences overlapping. */
function runTitleSequence() {
  resetTitleSequence();
  const token = ++titleRunToken;
  const reduceMotion = window.matchMedia &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // Reduced motion → skip the staged animation: show the FINAL identity card + Enter immediately.
  if (reduceMotion) {
    const finalCard = titleCards[titleCards.length - 1];
    if (finalCard) { finalCard.classList.add("is-shown"); finalCard.setAttribute("aria-hidden", "false"); }
    revealEnter();
    return;
  }

  // Each card: fade IN at t, hold, fade OUT at t+hold; the NEXT card starts only after this one
  // has fully faded out (t + hold + TITLE_FADE) — a clean dissolve, one title at a time, no
  // overlap. The LAST card fades in and PERSISTS (never fades); Enter reveals ENTER_AFTER_FINAL
  // after it appears.
  let t = 0;
  titleCards.forEach((card, i) => {
    const hold = TITLE_HOLDS[i] ?? 5000;
    const isLast = i === titleCards.length - 1;
    // fade this card IN at time t
    titleTimers.push(setTimeout(() => {
      if (token !== titleRunToken) return;              // superseded → bail
      card.classList.add("is-shown");
      card.setAttribute("aria-hidden", "false");
    }, t));
    if (isLast) {
      // final card stays up; reveal Enter a few seconds after it appears
      titleTimers.push(setTimeout(() => {
        if (token !== titleRunToken) return;
        revealEnter();
      }, t + ENTER_AFTER_FINAL));
      return;
    }
    // non-final: fade OUT after its hold
    titleTimers.push(setTimeout(() => {
      if (token !== titleRunToken) return;
      card.classList.remove("is-shown");
      card.setAttribute("aria-hidden", "true");
    }, t + hold));
    // next card starts after this one has fully faded out (no overlap)
    t += hold + TITLE_FADE;
  });
}

/* skipTitleSequence(): fast-forward to the end — show the final card, reveal Enter. Wired to a
   future click/keydown on the loop stage (TODO above). Exposed now so the hook is trivial to add. */
function skipTitleSequence() {
  clearTitleTimers();
  titleRunToken++;
  titleCards.forEach((c, i) => {
    const show = i === titleCards.length - 1;
    c.classList.toggle("is-shown", show);
    c.setAttribute("aria-hidden", show ? "false" : "true");
  });
  revealEnter();
}

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
  // "Enter the Lab" card (enter_lab.jpg — "Entering the Lab…") covers the stage switch + dive
  // load. The dive plays UNDER the card and is revealed as the card lifts (buffering-aware: min
  // beat AND dive ready, whichever is longer).
  let diveReady = null;
  showCard(CARD.enterLab, {
    minMs: 1500,
    waitFor: (signalReady) => { diveReady = signalReady; },
  });

  resetTitleSequence();           // cancel any in-flight title cards (defensive; sequence is done)

  showStage("dive");
  heroStill.hidden = true;
  labNav.hidden = true;
  resetHub();                   // clean slate so the dive→settle→loop handoff behaves like first load
  const hasVideo = ensureLoaded(diveVideo);
  if (!hasVideo) {
    // no dive clip yet (placeholder) → go straight to the hero still, no racing a failed play()
    if (diveReady) diveReady();
    revealHero();
    return;
  }
  // real dive clip present → play it; on 'ended' it hands off to the mirror-ball apparatus.
  // lift the TO LAB card once the dive is actually painting (or quickly, via canplay fallback).
  const liftOnDive = () => { if (diveReady) diveReady(); };
  diveVideo.addEventListener("playing", liftOnDive, { once: true });
  diveVideo.addEventListener("canplay", liftOnDive, { once: true });
  setTimeout(liftOnDive, 2500);  // hard fallback so the card never sticks
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
const intertitle      = document.getElementById("intertitle");
const intertitleText  = document.getElementById("intertitle-text");
const intertitleFrame = document.getElementById("intertitle-frame");

const CARD_MIN_MS = 1600;   // minimum time a card stays up (the stylistic beat)

/* Rendered silent-film title cards (sliced from the reference art; swap for clean PNGs anytime —
   same filenames). Shown at key transitions via showCard(). card_standby exists for a future
   "STANDBY, joining live stream" beat (not wired yet). */
const CARD = {
  pleaseWait: "assets/card_please_wait.png",   // initial load
  enterLab:   "assets/enter_lab.jpg",          // "Enter the Lab" click (recreated card: "Entering the Lab…")
  toLab:      "assets/card_to_lab.png",         // (old) superseded by enter_lab.jpg
  intoDepths: "assets/card_into_depths.png",   // "Explore More" click
  standby:    "assets/card_standby.png",       // (future) joining live stream
};

/* showCard(src, {minMs, onDone, waitFor, text}) — fade a card up over everything, hold it, fade
   out. If `text` is given (and no `src`), show a styled silent-film TEXT card instead of a PNG
   (used for "Enter the Lab" while the rendered cards are being reworked). If onDone is given it
   fires after the fade-out (so you can start the next thing UNDER the card and reveal it as the
   card lifts). Buffering-aware via waitFor (hold until BOTH minMs elapsed AND a readiness signal). */
let cardAdvanced = false;

/* Shared card-image helpers (used by both showCard and the between-cuts showIntertitle).
   setCardImage: put the frame into image mode, show `src`, and size the frame to the image's own
   aspect ratio (cards differ: 648×330 vs 1408×768) so nothing letterboxes/crops. */
function setCardImage(src) {
  intertitleText.textContent = "";
  intertitle.classList.add("has-card");
  intertitle.classList.remove("no-text");
  if (!intertitleFrame) return;
  intertitleFrame.style.backgroundImage = `url("${src}")`;
  const probe = new Image();
  probe.onload = () => {
    if (probe.naturalWidth && probe.naturalHeight) {
      intertitleFrame.style.setProperty("--card-ar", `${probe.naturalWidth} / ${probe.naturalHeight}`);
    }
  };
  probe.src = src;
}
function clearCardImage() {
  intertitle.classList.remove("has-card");
  if (intertitleFrame) {
    intertitleFrame.style.backgroundImage = "";
    intertitleFrame.style.removeProperty("--card-ar");
  }
}

function showCard(src, opts = {}) {
  const minMs = opts.minMs ?? CARD_MIN_MS;
  const asText = !src && !!opts.text;
  if (asText) {
    // TEXT MODE: styled intertitle text, no PNG. Drop image-card chrome.
    clearCardImage();
    intertitle.classList.remove("no-text");
    intertitleText.textContent = opts.text;
  } else {
    setCardImage(src);
  }
  intertitle.hidden = false;
  void intertitle.offsetWidth;              // reflow so the fade runs
  intertitle.classList.add("is-shown");

  cardAdvanced = false;
  let beatDone = false;
  let ready = !opts.waitFor;                 // if no readiness gate, we're ready immediately
  const tryLift = () => {
    if (cardAdvanced || !beatDone || !ready) return;
    cardAdvanced = true;
    hideCard(opts.onDone);
  };
  setTimeout(() => { beatDone = true; tryLift(); }, minMs);
  if (opts.waitFor) {
    opts.waitFor(() => { ready = true; tryLift(); });  // caller signals readiness
  }
}

function hideCard(done) {
  intertitle.classList.remove("is-shown");
  setTimeout(() => {
    intertitle.hidden = true;
    clearCardImage();                     // drop has-card + background-image + --card-ar
    if (done) done();
  }, 450);
}

/* Per-gap intertitles (shown BETWEEN autochained forge cuts). Index i = card shown BEFORE cut i+1.
   Each entry is either:
     • "" (empty)              → clean black hold, no card
     • "some text"             → styled silent-film TEXT card
     • { img: "assets/x.jpg" } → rendered image card (ornate silent-film art)
   Add/edit freely as cuts are rendered. */
const FORGE_CARDS = [
  "Meanwhile, in the Lab\u2026",             // before cut 2 (cut_2 opens on the arcane lab bench)
  { img: "assets/back_to_forge.jpg" },      // before cut 3 — "Back to the Forge.." rendered card
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
  resetShieldPayoff();                  // clean slate so the shield beat replays on this journey
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
  if (forgeSkip) forgeSkip.hidden = false;   // a cut is playing → offer "Skip to the End"
  const p = destVideo.play();
  if (p) p.catch(() => {});             // autoplay/decode blocked → controls shown; user presses play
}

/* "Skip to the End" → jump past the rest of the forge journey straight to the shield payoff.
   Stops the current cut, hides the skip button, and runs the payoff (shield loop → credits → nav),
   exactly as if the last cut had ended naturally. Guarded so it's a no-op if the payoff already ran. */
function skipToPayoff() {
  if (shieldPayoffRan) return;
  if (forgeSkip) forgeSkip.hidden = true;
  destVideo.pause();
  // if a between-cuts intertitle card is up (skip pressed mid-gap), drop it so it doesn't linger
  // over the payoff. hideIntertitle fades it out; harmless if it's already hidden.
  hideIntertitle();
  // make sure the autochain's 'ended' handler won't also fire a second payoff mid-skip
  destIndex = destCuts.length - 1;
  startShieldPayoff();
}
if (forgeSkip) forgeSkip.addEventListener("click", skipToPayoff);

destVideo.addEventListener("ended", () => {
  const next = destIndex + 1;
  if (next >= destCuts.length) {        // LAST cut (forge_cut_3) ended on the shield frame →
    startShieldPayoff();                // swap to the live shield loop + run the payoff beat
    return;
  }
  showIntertitle(next);                 // cover the swap/buffer, then play the next cut
});

/* ── SHIELD PAYOFF BEAT ─────────────────────────────────────────────────────
   The bottom of the descent. forge_cut_3 ends on the shield fully present (no fade-to-black);
   we swap to a seamless shield_loop (slow beaker energy-pulse — the "alive" second hub), hold a
   short beat so the reveal lands, roll the credits over the loop (silent-film bookend + CC display),
   then ignite the 4 LED-anchored projected nav. Anti-flash handoff mirrors the mirror settle→loop:
   the loop starts transparent and is faded in only once it's actually painting, with cut_3's last
   frame (held on #dest-video) underneath — so the swap is invisible even though they're two clips. */
const SHIELD_BEAT_MS   = 2000;   // let the shield breathe before the credits roll
const CREDITS_ROLL_MS  = 22000;  // keep in sync with .credits-scroll animation duration in CSS
/* Nav ignites part-way through the credits roll and COEXISTS with it (no longer kills the credits —
   they roll to completion and self-dismiss on animationend). ~7s in: enough credits have shown to
   read, the nav joins below while they keep rolling above. Credits band = upper/mid; nav = lower. */
const NAV_AFTER_CREDITS_START_MS = 7000;

function startShieldPayoff() {
  if (forgeSkip) forgeSkip.hidden = true;   // past the journey now → no more "skip"
  if (!ensureLoaded(shieldLoop)) {      // no shield_loop clip → stay on cut_3's last frame, still
    runShieldCreditsThenNav();          // run credits + nav over the held frame (graceful fallback)
    return;
  }
  shieldLoop.hidden = false;
  shieldLoop.classList.remove("is-shown");   // start transparent (anti-flash)

  let shown = false;
  const showLoop = () => {
    if (shown) return;
    shown = true;
    shieldLoop.classList.add("is-shown");     // fade loop in over cut_3's held last frame
    setTimeout(() => { destVideo.hidden = true; }, 950);  // then drop the dest video underneath
    shieldLoop.removeEventListener("playing", showLoop);
    clearTimeout(loopFallback);
    runShieldCreditsThenNav();                // start the timed beat once the loop is live
  };
  shieldLoop.addEventListener("playing", showLoop);
  const loopFallback = setTimeout(showLoop, 1200);  // 'playing' may not fire fast → reveal anyway

  shieldLoop.currentTime = 0;
  const p = shieldLoop.play();
  if (p) p.catch(() => { runShieldCreditsThenNav(); });  // autoplay blocked → still run the beat
}

/* beat → credits roll → nav ignite. Separated so both the real-loop and the fallback paths reuse it. */
let shieldPayoffRan = false;
function runShieldCreditsThenNav() {
  if (shieldPayoffRan) return;          // guard: only once per journey (both event + fallback call it)
  shieldPayoffRan = true;

  // 1) short beat (shield breathes), 2) credits roll, 3) nav ignites after the roll.
  setTimeout(() => {
    if (shieldCredits) {
      shieldCredits.hidden = false;
      void shieldCredits.offsetWidth;              // reflow so the fade/scroll run
      shieldCredits.classList.add("is-shown", "is-rolling");
    }
    // ignite the shield nav part-way through the roll (credits keep rolling/fading underneath)
    setTimeout(revealShieldNav, NAV_AFTER_CREDITS_START_MS);
  }, SHIELD_BEAT_MS);
}

/* reduced-motion / no-clip fallback also lands here; show nav without waiting on a long roll. */
function revealShieldNav() {
  if (shieldNav) shieldNav.hidden = false;
  // Do NOT fade the credits out here — they should finish their roll naturally (yanking them
  // mid-scroll looked wrong). The credits self-dismiss when their scroll animation ends (below).
}

/* when the credits scroll finishes, fade the layer out on its own (nav is already lit by now). */
if (shieldCredits) {
  shieldCredits.addEventListener("animationend", (e) => {
    if (e.animationName === "creditsRoll") shieldCredits.classList.remove("is-shown");
  });
}

/* reset the shield payoff so re-entering the forge journey replays it cleanly (mirrors resetHub). */
function resetShieldPayoff() {
  shieldPayoffRan = false;
  if (shieldLoop) {
    shieldLoop.pause();
    shieldLoop.classList.remove("is-shown");
    shieldLoop.hidden = true;
    try { shieldLoop.currentTime = 0; } catch (_) {}
  }
  if (shieldCredits) {
    shieldCredits.classList.remove("is-shown", "is-rolling");
    shieldCredits.hidden = true;
  }
  if (shieldNav) shieldNav.hidden = true;
  if (forgeSkip) forgeSkip.hidden = true;   // hidden until a cut plays again (playCut shows it)
}

/* Show the silent-film card, preload the next cut underneath, then play it once BOTH the minimum
   beat has elapsed AND the next cut can play through (whichever is longer). */
function showIntertitle(nextIndex) {
  const entry = FORGE_CARDS[nextIndex - 1];
  const isImg = entry && typeof entry === "object" && entry.img;
  const caption = typeof entry === "string" ? entry : "";
  if (isImg) {
    setCardImage(entry.img);                 // rendered art card ("Back to the Forge..")
  } else {
    clearCardImage();                        // text or empty hold
    intertitleText.textContent = caption;
    intertitle.classList.toggle("no-text", !caption);
  }
  intertitle.hidden = false;
  // force reflow so the opacity transition runs even though we just unhid it
  void intertitle.offsetWidth;
  intertitle.classList.add("is-shown");

  // ANTI-FLASH: the card fades in over ~0.45s (CSS transition). Do NOT swap destVideo.src until
  // the card is actually OPAQUE — otherwise setting .src + .load() repaints #dest-video with the
  // next cut's first frame WHILE the card is still semi-transparent, so it flashes THROUGH the
  // card (the "cut_2 shows before Meanwhile" bug). Wait out the fade, then load behind the opaque
  // card. INTERTITLE_FADE_MS must match the .intertitle opacity transition in styles.css (0.45s).
  const INTERTITLE_FADE_MS = 450;

  let ready = false;
  let beatDone = false;
  let advanced = false;
  let readyCap = null;
  const tryAdvance = () => {
    if (advanced || !ready || !beatDone) return;
    advanced = true;
    clearTimeout(readyCap);
    destVideo.removeEventListener("canplaythrough", onReady);
    // Anti-flash handoff: the next cut is already loaded + decoded BEHIND the opaque card.
    // Start it playing WHILE the card still fully covers it, then only fade the card out once
    // the video is actually painting frames ('playing'). This prevents the brief reveal of the
    // next cut's static first frame during the fade (the "cut3 image → card → cut3 video" hitch).
    destIndex = nextIndex;
    const reveal = () => {
      destVideo.removeEventListener("playing", reveal);
      clearTimeout(revealCap);
      hideIntertitle();                 // fade the card off the already-moving video
    };
    let revealCap = null;
    destVideo.addEventListener("playing", reveal);
    // safety: if 'playing' never fires, lift the card anyway so we never strand on the card
    revealCap = setTimeout(reveal, 1200);
    destVideo.currentTime = 0;
    const p = destVideo.play();
    if (p) p.catch(() => { reveal(); }); // autoplay blocked → lift card, controls shown
  };
  const onReady = () => { ready = true; tryAdvance(); };

  // Preload + decode the next cut ONLY ONCE THE CARD IS OPAQUE (after the fade-in), so its first
  // frame paints behind a card that already fully covers the screen.
  setTimeout(() => {
    destVideo.src = destCuts[nextIndex];
    destVideo.load();
    destVideo.addEventListener("canplaythrough", onReady);
    // safety: if canplaythrough never fires (some browsers are stingy), proceed after a cap
    readyCap = setTimeout(onReady, 8000);
  }, INTERTITLE_FADE_MS);

  // the minimum card beat is measured from the card becoming opaque too (so short loads still
  // get the stylistic hold AFTER the fade, not during it)
  setTimeout(() => { beatDone = true; tryAdvance(); }, INTERTITLE_FADE_MS + CARD_MIN_MS);
}

function hideIntertitle(done) {
  intertitle.classList.remove("is-shown");
  // wait out the fade before hiding + running the callback (keeps the card over the swap)
  setTimeout(() => {
    intertitle.hidden = true;
    clearCardImage();                     // drop has-card + background-image + --card-ar
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
      // INTO THE DEPTHS card covers the hand-off into the elevator journey. The journey starts
      // UNDER the card; lift when the elevator clip is painting (or a timed fallback).
      let journeyReady = null;
      showCard(CARD.intoDepths, {
        minMs: 1600,
        waitFor: (signalReady) => { journeyReady = signalReady; },
      });
      const liftOnElevator = () => { if (journeyReady) journeyReady(); };
      elevatorVideo.addEventListener("playing", liftOnElevator, { once: true });
      elevatorVideo.addEventListener("canplay", liftOnElevator, { once: true });
      setTimeout(liftOnElevator, 2500); // hard fallback so the card never sticks
      startJourney("explore");          // take the elevator → reception (forge clip stand-in for now)
    } else if (dest === "reception") {
      // Visit Reception — the research-access gate (built in Twinmotion; its clip isn't wired into
      // the site yet). Graceful placeholder until assets/reception.mp4 lands: when it exists, make
      // this a destination like "explore" (startJourney("reception") with data-reception on
      // #dest-video). For now, no-op with a console note so the link never strands the visitor.
      // TODO(reception): render reception.mp4 (doors-open-from-black) → add data-reception on
      //   #dest-video → swap this branch to the elevator-journey pattern used by "explore".
      console.info("[FrankenBits] Reception clip not wired yet — render reception.mp4 + add data-reception.");
    } else if (dest === "loop") {
      pauseHub();                       // leaving the lab → stop the hub
      shieldLoop.pause();               // and the shield loop, if we came from the shield payoff
      resetShieldPayoff();
      showStage("loop");
      runTitleSequence();               // movie-intro: replay the title cards on every return
    } else if (dest === "dive") {
      // back to the lab = the live mirror-ball hub (don't re-run the dive or elevator).
      // Resume directly at the LOOP (skip replaying the one-time settle on return). Balls are
      // already settled here, so reveal the nav immediately rather than waiting on loop-start.
      shieldLoop.pause();               // stop the shield loop if returning from the shield payoff
      resetShieldPayoff();
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
  // INITIAL-LOAD CARD state (declared before showLoopVideo, which signals it): the PLEASE WAIT
  // card lifts when loopReady() is called (loop ready) AND its minimum beat has elapsed.
  let loopReady = null;
  const showLoopVideo = () => {
    loopVideo.classList.add("is-shown");
    const poster = document.getElementById("loop-poster");
    if (poster) poster.classList.add("is-hidden");   // fade the held poster out from underneath
    loopVideo.removeEventListener("playing", showLoopVideo);
    loopVideo.removeEventListener("canplay", showLoopVideo);
    clearTimeout(loopRevealFallback);
    if (loopReady) loopReady();                      // signal the PLEASE WAIT card it can lift
  };
  const loopRevealFallback = setTimeout(showLoopVideo, 2000);  // never hold the poster > ~2s
  loopVideo.addEventListener("playing", showLoopVideo);
  loopVideo.addEventListener("canplay", showLoopVideo);

  // INITIAL-LOAD CARD: "PLEASE WAIT — the projector is preparing the feature." Held over the
  // opening (silent-film style) until the loop is actually ready to paint, then lifts to reveal
  // the live loop. Buffering-aware: minimum beat AND loop-ready (whichever is longer). The poster
  // sits under it; if the card's own art fails to load the poster still shows, so nothing strands.
  // When it lifts, the TITLE SEQUENCE begins (movie intro) over the now-playing loop.
  showCard(CARD.pleaseWait, {
    minMs: 1800,
    waitFor: (signalReady) => { loopReady = signalReady; },
    onDone: runTitleSequence,
  });

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
