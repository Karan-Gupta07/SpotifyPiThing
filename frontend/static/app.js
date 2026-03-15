/**
 * Spotify Pi — touch-optimized frontend.
 * Polls now-playing and drives playback controls.
 */
(function () {
  const API = "/api";

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
  const albumName = $("album-name");
  const btnPlayPause = $("btn-play-pause");
  const btnPrev = $("btn-prev");
  const btnNext = $("btn-next");
  const volumeSlider = $("volume");

  function showScreen(screen) {
    [loginScreen, playerScreen, loadingEl].forEach((s) => hide(s));
    show(screen);
  }

  function setLoading(on) {
    if (on) showScreen(loadingEl);
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
      albumName.textContent = "";
      art.removeAttribute("src");
      art.style.display = "none";
      show(noArt);
      btnPlayPause.textContent = "▶";
      return;
    }
    trackName.textContent = t.name || "—";
    artistName.textContent = t.artist || "—";
    albumName.textContent = t.album || "";
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
  }

  async function refreshNowPlaying() {
    try {
      const data = await fetchJson("/now-playing");
      applyNowPlaying(data);
    } catch (e) {
      if (e.message === "Not authenticated" || e.message.includes("401")) {
        showScreen(loginScreen);
        return;
      }
      trackName.textContent = "Error";
      artistName.textContent = e.message || "—";
    }
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
      const { authenticated, configured } = await checkAuth();
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

  let pollInterval;

  function startPolling() {
    if (pollInterval) clearInterval(pollInterval);
    pollInterval = setInterval(refreshNowPlaying, 3000);
  }

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
