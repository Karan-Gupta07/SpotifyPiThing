/**
 * Spotify Pi — touch-optimized frontend.
 * Polls now-playing and drives playback controls.
 *
 * Boot-resilience: retries auth check on cold boot so the token cache
 * has time to become readable from a slow SD card.
 *
 * Polling-resilience: uses recursive setTimeout (not setInterval) so a
 * stalled fetch can't pile up callbacks. Restarts polling on
 * visibilitychange and touch/click so the screen always refreshes
 * after the Pi display wakes up or the user taps.
 */
(function () {
  const API = "/api";
  const POLL_MS = 3000;           // normal polling cadence
  const AUTH_RETRY_MAX = 10;      // how many times to retry auth on boot
  const AUTH_RETRY_DELAY = 3000;  // ms between auth retries

  const $ = (id) => document.getElementById(id);
  const show = (el) => { el.classList.remove("hidden"); };
  const hide = (el) => { el.classList.add("hidden"); };

  const loginScreen = $("login-screen");
  const playerScreen = $("player-screen");
  const loadingEl = $("loading");
  const loginBtn = $("login-btn");
  const loginError = $("login-error");
  const art = $("art");
  const noArt = $("no-art");
  const trackName = $("track-name");
  const artistName = $("artist-name");
  const btnPlayPause = $("btn-play-pause");
  const btnPrev = $("btn-prev");
  const btnNext = $("btn-next");
  const volumeSlider = $("volume");
  const progressFill = $("progress-fill");
  const timeCurrent = $("time-current");
  const timeRemaining = $("time-remaining");

  function msToTime(ms) {
    if (ms == null || !isFinite(ms) || ms < 0) return "0:00";
    const totalSec = Math.floor(ms / 1000);
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return m + ":" + (s < 10 ? "0" : "") + s;
  }

  function showScreen(screen) {
    [loginScreen, playerScreen, loadingEl].forEach((s) => hide(s));
    show(screen);
  }

  function setLoading(on) {
    if (on) showScreen(loadingEl);
  }

  /** Helper: delay for ms. */
  function sleep(ms) {
    return new Promise((r) => setTimeout(r, ms));
  }

  async function fetchJson(path, options = {}) {
    const res = await fetch(API + path, { ...options, credentials: "same-origin" });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(err.detail || res.statusText);
    }
    return res.json();
  }

  async function post(path) {
    return fetchJson(path, { method: "POST" });
  }

  async function checkAuth() {
    const data = await fetchJson("/auth/status");
    return { authenticated: data.authenticated, configured: data.configured !== false };
  }

  async function loadLoginUrl() {
    const { url } = await fetchJson("/auth/login-url");
    return url;
  }

  function applyNowPlaying(data) {
    const t = data?.track;
    if (!t) {
      trackName.textContent = "Nothing playing";
      artistName.textContent = "—";
      art.removeAttribute("src");
      art.style.display = "none";
      show(noArt);
      btnPlayPause.textContent = "▶";
      progressFill.style.width = "0%";
      timeCurrent.textContent = "0:00";
      timeRemaining.textContent = "-0:00";
      return;
    }
    trackName.textContent = t.name || "—";
    artistName.textContent = t.artist || "—";
    if (t.art_url) {
      art.src = t.art_url;
      art.alt = t.album ? `Album: ${t.album}` : "";
      art.style.display = "block";
      hide(noArt);
    } else {
      art.removeAttribute("src");
      art.style.display = "none";
      show(noArt);
    }
    btnPlayPause.textContent = t.is_playing ? "⏸" : "▶";
    const duration = t.duration_ms || 0;
    const progress = t.progress_ms || 0;
    const pct = duration > 0 ? Math.min(100, (progress / duration) * 100) : 0;
    progressFill.style.width = pct + "%";
    timeCurrent.textContent = msToTime(progress);
    timeRemaining.textContent = "-" + msToTime(Math.max(0, duration - progress));
  }

  async function refreshNowPlaying() {
    try {
      const data = await fetchJson("/now-playing");
      applyNowPlaying(data);
    } catch (e) {
      if (e.message === "Not authenticated" || e.message.includes("401")) {
        showScreen(loginScreen);
        stopPolling();
        return;
      }
      trackName.textContent = "Error";
      artistName.textContent = e.message || "—";
    }
  }

  // ---------- Auth with boot retry ----------

  /**
   * On a cold boot the SD card / backend may not have the token cache
   * ready immediately.  Retry several times before falling through to
   * the login screen.
   */
  async function checkAuthWithRetry() {
    for (let attempt = 1; attempt <= AUTH_RETRY_MAX; attempt++) {
      try {
        const result = await checkAuth();
        // If credentials are configured and we're authenticated, great
        if (result.authenticated) return result;
        // If not configured at all, no point retrying
        if (!result.configured) return result;
        // Configured but not authenticated yet — maybe the cache isn't
        // warm.  Retry unless this is the last attempt.
        if (attempt < AUTH_RETRY_MAX) {
          console.log(`Auth attempt ${attempt}/${AUTH_RETRY_MAX}: not yet authenticated, retrying in ${AUTH_RETRY_DELAY}ms…`);
          await sleep(AUTH_RETRY_DELAY);
        }
      } catch (e) {
        // Network error (backend still booting?) — retry
        if (attempt < AUTH_RETRY_MAX) {
          console.log(`Auth attempt ${attempt}/${AUTH_RETRY_MAX}: ${e.message}, retrying…`);
          await sleep(AUTH_RETRY_DELAY);
        } else {
          throw e;
        }
      }
    }
    // Final attempt — return whatever we get
    return checkAuth();
  }

  async function init() {
    const params = new URLSearchParams(window.location.search);
    if (params.get("error")) {
      showScreen(loginScreen);
      loginError.textContent = params.get("error") === "auth_failed" ? "Login failed. Try again." : "Authorization was denied.";
      show(loginError);
      window.history.replaceState({}, "", window.location.pathname);
      return;
    }
    if (params.get("auth") === "ok") {
      window.history.replaceState({}, "", window.location.pathname);
    }

    setLoading(true);
    try {
      const { authenticated, configured } = await checkAuthWithRetry();
      if (!configured) {
        showScreen(loginScreen);
        loginBtn.style.display = "none";
        loginError.textContent = "Add SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET to the .env file in the project root.";
        show(loginError);
        return;
      }
      if (!authenticated) {
        const url = await loadLoginUrl();
        loginBtn.href = url;
        loginBtn.style.display = "";
        showScreen(loginScreen);
        hide(loginError);
        return;
      }
      showScreen(playerScreen);
      await refreshNowPlaying();
      startPolling();
    } catch (e) {
      showScreen(loginScreen);
      loginBtn.style.display = "";
      loginError.textContent = e.message || "Could not connect.";
      show(loginError);
    }
  }

  // ---------- Resilient polling ----------

  let pollTimer = null;
  let polling = false;

  /**
   * Recursive-setTimeout pattern: waits for the fetch to finish before
   * scheduling the next one.  This avoids piling up stalled requests
   * and survives Chromium's background-tab throttling better than
   * setInterval.
   */
  function startPolling() {
    if (polling) return;          // already running
    polling = true;
    scheduleNextPoll();
  }

  function stopPolling() {
    polling = false;
    if (pollTimer) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }
  }

  function scheduleNextPoll() {
    if (!polling) return;
    pollTimer = setTimeout(async () => {
      await refreshNowPlaying();
      scheduleNextPoll();         // schedule next only after fetch done
    }, POLL_MS);
  }

  /**
   * When Chromium's tab becomes visible again (e.g. after the Pi
   * display wakes from DPMS / screensaver) we do an immediate refresh
   * and restart the polling chain in case it was throttled.
   */
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible" && polling) {
      // Restart the chain immediately
      stopPolling();
      refreshNowPlaying();
      startPolling();
    }
  });

  /**
   * Any touch/click on the document triggers an immediate refresh so
   * the user never has to wait the full 3 s after tapping the screen.
   * Also restarts the polling chain to reset the timer.
   */
  let wakeDebounce = 0;
  function onWakeInteraction() {
    const now = Date.now();
    if (now - wakeDebounce < 1000) return;  // at most once per second
    wakeDebounce = now;
    if (polling) {
      stopPolling();
      refreshNowPlaying();
      startPolling();
    }
  }
  document.addEventListener("click", onWakeInteraction, true);
  document.addEventListener("touchstart", onWakeInteraction, true);

  // ---------- Playback controls ----------

  async function playPause() {
    try {
      const data = await fetchJson("/now-playing");
      const isPlaying = data?.track?.is_playing;
      if (isPlaying) await post("/pause");
      else await post("/play");
      await refreshNowPlaying();
    } catch (e) {
      console.error(e);
      refreshNowPlaying();
    }
  }

  async function next() {
    try {
      await post("/next");
      setTimeout(refreshNowPlaying, 400);
    } catch (e) {
      console.error(e);
      refreshNowPlaying();
    }
  }

  async function previous() {
    try {
      await post("/previous");
      setTimeout(refreshNowPlaying, 400);
    } catch (e) {
      console.error(e);
      refreshNowPlaying();
    }
  }

  let volumeDebounce;
  function onVolumeChange() {
    const val = parseInt(volumeSlider.value, 10);
    clearTimeout(volumeDebounce);
    volumeDebounce = setTimeout(() => {
      fetch(API + "/volume?volume_percent=" + val, { method: "POST", credentials: "same-origin" }).catch(() => {});
    }, 150);
  }

  btnPlayPause.addEventListener("click", playPause);
  btnPrev.addEventListener("click", previous);
  btnNext.addEventListener("click", next);
  volumeSlider.addEventListener("input", onVolumeChange);

  init();
})();
