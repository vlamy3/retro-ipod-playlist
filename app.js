const STORAGE_KEY = "retro-ipod-state-v1";

const defaultPlaylists = {
  "Garage Gold": [
    { title: "Tape Deck Hero", artist: "The Sandwaves", duration: 181 },
    { title: "Neon Arcade", artist: "Cassette Bloom", duration: 204 },
    { title: "Skatepark Sunset", artist: "Glass Signals", duration: 193 }
  ],
  "Pixel Nights": [
    { title: "8-Bit Boulevard", artist: "Data Hearts", duration: 166 },
    { title: "Save Point", artist: "Coin Loop", duration: 176 },
    { title: "CRT Dreams", artist: "Moon Sprite", duration: 212 }
  ],
  "Roadtrip Mix": [
    { title: "Exit 95", artist: "Open Highway", duration: 228 },
    { title: "Diner Coffee", artist: "June & The Miles", duration: 189 },
    { title: "Midnight Polaroid", artist: "Motel Stereo", duration: 201 }
  ]
};

const playlists = JSON.parse(JSON.stringify(defaultPlaylists));

const ui = {
  playlist: document.getElementById("playlist"),
  songPlaylist: document.getElementById("song-playlist"),
  title: document.getElementById("title"),
  artist: document.getElementById("artist"),
  trackNum: document.getElementById("track-num"),
  state: document.getElementById("state"),
  time: document.getElementById("time"),
  progress: document.getElementById("progress"),
  btnMenu: document.getElementById("btn-menu"),
  btnPrev: document.getElementById("btn-prev"),
  btnNext: document.getElementById("btn-next"),
  btnPlay: document.getElementById("btn-play"),
  btnCenter: document.getElementById("btn-center"),
  addPlaylistForm: document.getElementById("add-playlist-form"),
  addSongForm: document.getElementById("add-song-form"),
  newPlaylistName: document.getElementById("new-playlist-name"),
  songTitle: document.getElementById("song-title"),
  songArtist: document.getElementById("song-artist"),
  songDuration: document.getElementById("song-duration"),
  songFile: document.getElementById("song-file"),
  songUrl: document.getElementById("song-url"),
  songLyrics: document.getElementById("song-lyrics"),
  libraryStatus: document.getElementById("library-status"),
  lyricsMode: document.getElementById("lyrics-mode"),
  lyricsPanel: document.getElementById("lyrics-panel")
};

let playlistNames = Object.keys(playlists);
let activePlaylist = playlistNames[0];
let activeTrack = 0;
let elapsed = 0;
let playing = false;
let audioCtx = null;
let masterGain = null;
let noteTimer = null;
let noteStep = 0;
let beatMs = 300;
const audioPlayer = new Audio();
audioPlayer.preload = "metadata";
let pendingAudioSeek = null;
let ytApiPromise = null;
let ytPlayerPromise = null;
let ytPlayer = null;

const motifs = [
  {
    wave: "square",
    bpm: 110,
    notes: [261.63, null, 329.63, 392.0, 329.63, 293.66, 261.63, null]
  },
  {
    wave: "triangle",
    bpm: 96,
    notes: [220.0, 246.94, 261.63, 293.66, 261.63, 246.94, 220.0, null]
  },
  {
    wave: "sawtooth",
    bpm: 124,
    notes: [329.63, 349.23, 392.0, null, 392.0, 349.23, 329.63, 293.66]
  },
  {
    wave: "square",
    bpm: 132,
    notes: [392.0, null, 392.0, 440.0, 392.0, 329.63, 293.66, null]
  }
];

function assignTrackSound(track, seedHint = 0) {
  if (track.sound) return track;
  const key = `${track.title}|${track.artist}|${track.duration}|${seedHint}`;
  let hash = 0;
  for (let i = 0; i < key.length; i += 1) {
    hash = ((hash << 5) - hash + key.charCodeAt(i)) >>> 0;
  }
  track.sound = motifs[hash % motifs.length];
  return track;
}

function hydrateTrackSounds() {
  playlistNames = Object.keys(playlists);
  playlistNames.forEach((name, playlistIndex) => {
    playlists[name] = (playlists[name] || []).map((track, trackIndex) =>
      assignTrackSound(track, playlistIndex * 31 + trackIndex)
    );
  });
}

function persistTrack(track) {
  const safeTrack = {
    title: track.title,
    artist: track.artist,
    duration: Number.isFinite(track.duration) ? track.duration : 180
  };

  if (typeof track.youtubeId === "string" && track.youtubeId.trim()) {
    safeTrack.youtubeId = track.youtubeId.trim();
  }
  if (typeof track.audioSrc === "string" && track.audioSrc.trim() && !track.audioSrc.startsWith("blob:")) {
    safeTrack.audioSrc = track.audioSrc.trim();
  }
  if (typeof track.lyrics === "string" && track.lyrics.trim()) {
    safeTrack.lyrics = track.lyrics;
  }

  return safeTrack;
}

function sanitizeLoadedTrack(track, seedHint) {
  if (!track || typeof track !== "object") return null;
  const title = typeof track.title === "string" ? track.title.trim() : "";
  const artist = typeof track.artist === "string" ? track.artist.trim() : "";
  if (!title || !artist) return null;

  const rawDuration = Number.parseInt(track.duration, 10);
  const duration = Number.isFinite(rawDuration) && rawDuration > 0 ? rawDuration : 180;
  const safeTrack = { title, artist, duration };

  if (typeof track.youtubeId === "string" && track.youtubeId.trim()) {
    safeTrack.youtubeId = track.youtubeId.trim();
  }
  if (typeof track.audioSrc === "string" && track.audioSrc.trim() && !track.audioSrc.startsWith("blob:")) {
    safeTrack.audioSrc = track.audioSrc.trim();
  }
  if (typeof track.lyrics === "string" && track.lyrics.trim()) {
    safeTrack.lyrics = track.lyrics.trim();
  }

  return assignTrackSound(safeTrack, seedHint);
}

function saveLibraryState() {
  try {
    const savedPlaylists = {};
    playlistNames.forEach((name) => {
      savedPlaylists[name] = (playlists[name] || []).map(persistTrack);
    });

    const payload = {
      playlists: savedPlaylists,
      activePlaylist,
      activeTrack
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // Ignore storage failures (private mode, quota, blocked storage).
  }
}

function loadLibraryState() {
  hydrateTrackSounds();

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || !parsed.playlists || typeof parsed.playlists !== "object") {
      return;
    }

    const loadedPlaylists = {};
    Object.entries(parsed.playlists).forEach(([rawName, rawTracks], playlistIndex) => {
      const name = typeof rawName === "string" ? rawName.trim() : "";
      if (!name) return;

      const tracks = Array.isArray(rawTracks) ? rawTracks : [];
      loadedPlaylists[name] = tracks
        .map((track, trackIndex) => sanitizeLoadedTrack(track, playlistIndex * 31 + trackIndex))
        .filter(Boolean);
    });

    const loadedNames = Object.keys(loadedPlaylists);
    if (loadedNames.length === 0) return;

    Object.keys(playlists).forEach((name) => delete playlists[name]);
    loadedNames.forEach((name) => {
      playlists[name] = loadedPlaylists[name];
    });

    playlistNames = loadedNames;

    if (typeof parsed.activePlaylist === "string" && playlists[parsed.activePlaylist]) {
      activePlaylist = parsed.activePlaylist;
    } else {
      activePlaylist = playlistNames[0];
    }

    const currentTracks = playlists[activePlaylist] || [];
    const rawIndex = Number.parseInt(parsed.activeTrack, 10);
    if (!Number.isFinite(rawIndex) || rawIndex < 0 || currentTracks.length === 0) {
      activeTrack = 0;
    } else {
      activeTrack = Math.min(rawIndex, currentTracks.length - 1);
    }
    elapsed = 0;
  } catch {
    // Fall back to defaults if saved state is malformed.
  }
}

loadLibraryState();

const formatTime = (secs) => {
  const min = Math.floor(secs / 60);
  const sec = secs % 60;
  return `${min}:${String(sec).padStart(2, "0")}`;
};

function currentTrack() {
  const tracks = playlists[activePlaylist] || [];
  return tracks[activeTrack] || null;
}

function escapeHtml(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function parseLyrics(rawLyrics) {
  if (!rawLyrics || !rawLyrics.trim()) {
    return { timed: [], plain: [] };
  }

  const lines = rawLyrics.replace(/\r/g, "").split("\n");
  const timed = [];
  const plain = [];
  const timePattern = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

  lines.forEach((line) => {
    const text = line.replace(timePattern, "").trim();
    timePattern.lastIndex = 0;

    const stamps = [];
    let match;
    while ((match = timePattern.exec(line)) !== null) {
      const min = Number.parseInt(match[1], 10);
      const sec = Number.parseInt(match[2], 10);
      const fractionRaw = match[3] || "0";
      const fraction = Number.parseInt(fractionRaw.padEnd(3, "0").slice(0, 3), 10);
      if (!Number.isFinite(min) || !Number.isFinite(sec) || sec > 59) continue;
      stamps.push(min * 60 + sec + (fraction / 1000));
    }

    if (stamps.length > 0 && text) {
      stamps.forEach((stamp) => timed.push({ time: stamp, text }));
      return;
    }
    if (text) {
      plain.push(text);
    }
  });

  timed.sort((a, b) => a.time - b.time);
  return { timed, plain };
}

function renderLyrics(track) {
  if (!track) {
    ui.lyricsMode.textContent = "No Track";
    ui.lyricsPanel.textContent = "Pick a song to view lyrics.";
    return;
  }

  const parsed = parseLyrics(track.lyrics || "");
  if (parsed.timed.length > 0) {
    ui.lyricsMode.textContent = "Synced";
    let activeIndex = -1;
    for (let i = 0; i < parsed.timed.length; i += 1) {
      if (elapsed >= parsed.timed[i].time) {
        activeIndex = i;
      } else {
        break;
      }
    }

    const start = Math.max(0, (activeIndex === -1 ? 0 : activeIndex - 2));
    const end = Math.min(parsed.timed.length, (activeIndex === -1 ? 3 : activeIndex + 3));
    const linesHtml = parsed.timed
      .slice(start, end)
      .map((line, idx) => {
        const lineIndex = start + idx;
        const cls = lineIndex === activeIndex ? "lyrics-line active" : "lyrics-line";
        return `<div class="${cls}">${escapeHtml(line.text)}</div>`;
      })
      .join("");

    ui.lyricsPanel.innerHTML = linesHtml || "No synced lyric lines yet.";
    return;
  }

  if (parsed.plain.length > 0) {
    ui.lyricsMode.textContent = "Static";
    ui.lyricsPanel.textContent = parsed.plain.join("\n");
    return;
  }

  ui.lyricsMode.textContent = "None";
  ui.lyricsPanel.textContent = "No lyrics for this song yet.";
}

function isAudioTrack(track) {
  return Boolean(track && track.audioSrc);
}

function isYouTubeTrack(track) {
  return Boolean(track && track.youtubeId);
}

function setLibraryStatus(message, isError = false) {
  ui.libraryStatus.textContent = message;
  ui.libraryStatus.style.color = isError ? "#7d1a07" : "#2c4c1c";
}

function extractYouTubeId(rawUrl) {
  if (!rawUrl) return "";

  try {
    const url = new URL(rawUrl);
    const host = url.hostname.replace(/^www\./, "");

    if (host === "youtu.be") {
      return url.pathname.slice(1).split("/")[0] || "";
    }
    if (host === "youtube.com" || host === "m.youtube.com") {
      if (url.pathname === "/watch") {
        return url.searchParams.get("v") || "";
      }
      if (url.pathname.startsWith("/shorts/")) {
        return url.pathname.split("/")[2] || "";
      }
      if (url.pathname.startsWith("/embed/")) {
        return url.pathname.split("/")[2] || "";
      }
    }
  } catch {
    return "";
  }

  return "";
}

function normalizeAudioUrl(rawUrl) {
  if (!rawUrl) return "";
  try {
    const url = new URL(rawUrl);

    if (url.hostname === "www.dropbox.com" || url.hostname === "dropbox.com") {
      url.hostname = "dl.dropboxusercontent.com";
      url.searchParams.delete("dl");
      return url.toString();
    }

    if (url.hostname === "github.com") {
      const parts = url.pathname.split("/").filter(Boolean);
      if (parts.length >= 5 && parts[2] === "blob") {
        const owner = parts[0];
        const repo = parts[1];
        const branch = parts[3];
        const path = parts.slice(4).join("/");
        return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${path}`;
      }
    }

    if (url.hostname === "drive.google.com") {
      const match = url.pathname.match(/\/file\/d\/([^/]+)/);
      if (match && match[1]) {
        return `https://drive.google.com/uc?export=download&id=${match[1]}`;
      }
      const id = url.searchParams.get("id");
      if (id) {
        return `https://drive.google.com/uc?export=download&id=${id}`;
      }
    }

    return url.toString();
  } catch {
    return rawUrl;
  }
}

function mediaErrorMessage() {
  if (!audioPlayer.error) {
    return "Audio failed to load. Use a direct audio file URL.";
  }
  const code = audioPlayer.error.code;
  if (code === MediaError.MEDIA_ERR_ABORTED) return "Audio request was aborted.";
  if (code === MediaError.MEDIA_ERR_NETWORK) return "Network error while loading audio URL.";
  if (code === MediaError.MEDIA_ERR_DECODE) return "Audio file could not be decoded.";
  if (code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return "Source not supported. Use a direct .mp3/.wav/.ogg URL.";
  }
  return "Audio failed to load. Use a direct audio file URL.";
}

function ensureYouTubeApi() {
  if (window.YT && typeof window.YT.Player === "function") {
    return Promise.resolve();
  }
  if (ytApiPromise) return ytApiPromise;

  ytApiPromise = new Promise((resolve, reject) => {
    const existing = document.querySelector('script[src="https://www.youtube.com/iframe_api"]');
    if (!existing) {
      const script = document.createElement("script");
      script.src = "https://www.youtube.com/iframe_api";
      script.async = true;
      script.onerror = () => reject(new Error("Failed to load YouTube API."));
      document.head.appendChild(script);
    }

    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === "function") prev();
      resolve();
    };
  });

  return ytApiPromise;
}

function stopYouTube() {
  if (ytPlayer && typeof ytPlayer.pauseVideo === "function") {
    ytPlayer.pauseVideo();
  }
}

function ensureYouTubePlayer() {
  if (ytPlayer) return Promise.resolve(ytPlayer);
  if (ytPlayerPromise) return ytPlayerPromise;

  ytPlayerPromise = ensureYouTubeApi().then(
    () =>
      new Promise((resolve) => {
        ytPlayer = new window.YT.Player("youtube-player", {
          width: "0",
          height: "0",
          playerVars: {
            autoplay: 0,
            controls: 0,
            rel: 0,
            playsinline: 1
          },
          events: {
            onReady: () => resolve(ytPlayer),
            onStateChange: (event) => {
              const current = currentTrack();
              if (!current || !isYouTubeTrack(current)) return;

              if (event.data === window.YT.PlayerState.ENDED && playing) {
                nextTrack();
                return;
              }

              if (event.data === window.YT.PlayerState.PLAYING) {
                const duration = Math.round(ytPlayer.getDuration() || 0);
                if (duration > 0) {
                  current.duration = duration;
                  render();
                  saveLibraryState();
                }
              }
            },
            onError: () => {
              playing = false;
              setLibraryStatus("YouTube link could not be played.", true);
              render();
            }
          }
        });
      })
  );

  return ytPlayerPromise;
}

function ensureAudio() {
  if (audioCtx) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  audioCtx = new AudioCtx();
  masterGain = audioCtx.createGain();
  masterGain.gain.value = 0.08;
  masterGain.connect(audioCtx.destination);
}

function playNote(freq, wave, lengthSecs) {
  if (!audioCtx || !masterGain || !freq) return;
  const start = audioCtx.currentTime;
  const stop = start + Math.max(0.08, lengthSecs);

  const osc = audioCtx.createOscillator();
  const amp = audioCtx.createGain();

  osc.type = wave;
  osc.frequency.setValueAtTime(freq, start);

  amp.gain.setValueAtTime(0.0001, start);
  amp.gain.linearRampToValueAtTime(0.2, start + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.0001, stop);

  osc.connect(amp);
  amp.connect(masterGain);
  osc.start(start);
  osc.stop(stop);
}

function stopSynth() {
  if (noteTimer) {
    clearInterval(noteTimer);
    noteTimer = null;
  }
}

function stopAudio() {
  audioPlayer.pause();
}

function isSameAudioSource(source) {
  try {
    return new URL(source, window.location.href).href === audioPlayer.src;
  } catch {
    return audioPlayer.src === source;
  }
}

function applyAudioSeek(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return;

  if (audioPlayer.readyState >= 1 && Number.isFinite(audioPlayer.duration) && audioPlayer.duration > 0) {
    const maxStart = Math.max(0, audioPlayer.duration - 0.25);
    audioPlayer.currentTime = Math.min(seconds, maxStart);
    pendingAudioSeek = null;
    return;
  }

  pendingAudioSeek = seconds;
}

async function startAudioTrack(track) {
  if (!track || !track.audioSrc) return;
  stopSynth();
  if (!isSameAudioSource(track.audioSrc)) {
    audioPlayer.src = track.audioSrc;
    audioPlayer.load();
  }

  applyAudioSeek(elapsed);
  try {
    await audioPlayer.play();
  } catch (error) {
    playing = false;
    const isPermission = error && error.name === "NotAllowedError";
    const message = isPermission
      ? "Browser blocked audio. Click play again directly."
      : "Audio failed to start. Use a direct audio file/URL (.mp3, .wav, .ogg).";
    setLibraryStatus(message, true);
    render();
  }
}

async function startYouTubeTrack(track) {
  if (!track || !track.youtubeId) return;
  stopSynth();
  stopAudio();

  try {
    const player = await ensureYouTubePlayer();
    if (!playing) return;
    player.loadVideoById({
      videoId: track.youtubeId,
      startSeconds: Math.max(0, elapsed)
    });
    player.playVideo();
  } catch {
    playing = false;
    setLibraryStatus("YouTube API failed to initialize.", true);
    render();
  }
}

function startSynth() {
  if (!audioCtx || !masterGain) return;
  const track = currentTrack();
  if (!track) return;
  const sound = track.sound;
  const noteLength = sound.notes.length;
  beatMs = Math.round(60000 / sound.bpm);
  noteStep = Math.floor(elapsed / (beatMs / 1000)) % noteLength;

  stopSynth();

  playNote(sound.notes[noteStep], sound.wave, (beatMs / 1000) * 0.85);
  noteStep = (noteStep + 1) % noteLength;

  noteTimer = setInterval(() => {
    if (!playing) return;
    playNote(sound.notes[noteStep], sound.wave, (beatMs / 1000) * 0.85);
    noteStep = (noteStep + 1) % noteLength;
  }, beatMs);
}

function startCurrentTrackPlayback() {
  const track = currentTrack();
  if (!track) return;

  if (isYouTubeTrack(track)) {
    startYouTubeTrack(track);
    return;
  }

  if (isAudioTrack(track)) {
    startAudioTrack(track);
    return;
  }

  stopYouTube();
  stopAudio();
  ensureAudio();
  if (!audioCtx) return;
  if (audioCtx.state === "suspended") {
    audioCtx.resume().then(startSynth);
    return;
  }
  startSynth();
}

function getAudioDuration(src) {
  return new Promise((resolve) => {
    const probe = document.createElement("audio");
    probe.preload = "metadata";
    probe.src = src;
    probe.addEventListener("loadedmetadata", () => resolve(probe.duration), { once: true });
    probe.addEventListener("error", () => resolve(Number.NaN), { once: true });
  });
}

function renderPlaylistOptions() {
  const mainValue = activePlaylist;
  const songValue = ui.songPlaylist.value || activePlaylist;
  ui.playlist.innerHTML = "";
  ui.songPlaylist.innerHTML = "";

  playlistNames.forEach((name) => {
    const mainOption = document.createElement("option");
    mainOption.value = name;
    mainOption.textContent = name;
    ui.playlist.appendChild(mainOption);

    const songOption = document.createElement("option");
    songOption.value = name;
    songOption.textContent = name;
    ui.songPlaylist.appendChild(songOption);
  });
  ui.playlist.value = mainValue;
  ui.songPlaylist.value = playlistNames.includes(songValue) ? songValue : mainValue;
}

function render() {
  const tracks = playlists[activePlaylist] || [];
  const track = currentTrack();
  if (!track || tracks.length === 0) {
    if (playing) {
      playing = false;
      stopSynth();
      stopYouTube();
      stopAudio();
    }
    ui.title.textContent = "No Songs";
    ui.artist.textContent = "Add one below";
    ui.trackNum.textContent = "0/0";
    ui.state.textContent = "Paused";
    ui.time.textContent = "0:00 / 0:00";
    ui.progress.style.width = "0%";
    renderLyrics(null);
    return;
  }

  const safeDuration = Math.max(1, Math.round(track.duration || 0));
  ui.title.textContent = track.title;
  ui.artist.textContent = track.artist;
  ui.trackNum.textContent = `${activeTrack + 1}/${tracks.length}`;
  ui.state.textContent = playing ? "Playing" : "Paused";
  ui.time.textContent = `${formatTime(elapsed)} / ${formatTime(safeDuration)}`;
  ui.progress.style.width = `${Math.min(100, (elapsed / safeDuration) * 100)}%`;
  renderLyrics(track);
}

function setPlaylist(name) {
  if (!playlists[name]) return;
  stopYouTube();
  stopAudio();
  activePlaylist = name;
  activeTrack = 0;
  elapsed = 0;
  renderPlaylistOptions();
  ui.songPlaylist.value = name;
  if (playing) startCurrentTrackPlayback();
  render();
  saveLibraryState();
}

async function togglePlay() {
  if (playing) {
    playing = false;
    stopSynth();
    stopYouTube();
    stopAudio();
    render();
    return;
  }

  if (!currentTrack()) {
    setLibraryStatus("Add a song before pressing play.", true);
    render();
    return;
  }

  playing = true;
  if (isYouTubeTrack(currentTrack())) {
    await startYouTubeTrack(currentTrack());
    render();
    return;
  }

  if (isAudioTrack(currentTrack())) {
    await startAudioTrack(currentTrack());
    render();
    return;
  }

  ensureAudio();
  if (audioCtx && audioCtx.state === "suspended") {
    await audioCtx.resume();
  }
  startSynth();
  render();
}

function nextTrack() {
  const tracks = playlists[activePlaylist] || [];
  if (tracks.length === 0) return;
  stopYouTube();
  stopAudio();
  activeTrack = (activeTrack + 1) % tracks.length;
  elapsed = 0;
  if (playing) startCurrentTrackPlayback();
  render();
  saveLibraryState();
}

function prevTrack() {
  const tracks = playlists[activePlaylist] || [];
  if (tracks.length === 0) return;
  stopYouTube();
  stopAudio();
  activeTrack = (activeTrack - 1 + tracks.length) % tracks.length;
  elapsed = 0;
  if (playing) startCurrentTrackPlayback();
  render();
  saveLibraryState();
}

ui.playlist.addEventListener("change", (e) => {
  setPlaylist(e.target.value);
});

ui.btnMenu.addEventListener("click", () => {
  const idx = playlistNames.indexOf(activePlaylist);
  const nextIdx = (idx + 1) % playlistNames.length;
  setPlaylist(playlistNames[nextIdx]);
});

ui.btnNext.addEventListener("click", nextTrack);
ui.btnPrev.addEventListener("click", prevTrack);
ui.btnPlay.addEventListener("click", togglePlay);
ui.btnCenter.addEventListener("click", togglePlay);

audioPlayer.addEventListener("timeupdate", () => {
  const track = currentTrack();
  if (!playing || !isAudioTrack(track)) return;
  elapsed = Math.floor(audioPlayer.currentTime || 0);
  render();
});

audioPlayer.addEventListener("loadedmetadata", () => {
  const track = currentTrack();
  if (!track || !isAudioTrack(track)) return;
  if (pendingAudioSeek !== null) {
    applyAudioSeek(pendingAudioSeek);
  }
  if (Number.isFinite(audioPlayer.duration) && audioPlayer.duration > 0) {
    track.duration = Math.round(audioPlayer.duration);
    render();
    saveLibraryState();
  }
});

audioPlayer.addEventListener("ended", () => {
  if (!playing) return;
  nextTrack();
});

audioPlayer.addEventListener("error", () => {
  playing = false;
  setLibraryStatus(mediaErrorMessage(), true);
  render();
});

window.addEventListener("beforeunload", () => {
  Object.values(playlists).forEach((trackList) => {
    trackList.forEach((track) => {
      if (track.audioSrc && track.audioSrc.startsWith("blob:")) {
        URL.revokeObjectURL(track.audioSrc);
      }
    });
  });
});

ui.addPlaylistForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const newName = ui.newPlaylistName.value.trim();
  if (!newName) {
    setLibraryStatus("Playlist name is required.", true);
    return;
  }

  const exists = playlistNames.some((name) => name.toLowerCase() === newName.toLowerCase());
  if (exists) {
    setLibraryStatus("Playlist already exists.", true);
    return;
  }

  playlists[newName] = [];
  playlistNames.push(newName);
  setPlaylist(newName);
  ui.newPlaylistName.value = "";
  setLibraryStatus(`Added playlist: ${newName}`);
  saveLibraryState();
});

ui.addSongForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const targetPlaylist = ui.songPlaylist.value;
  const title = ui.songTitle.value.trim();
  const artist = ui.songArtist.value.trim();
  let duration = Number.parseInt(ui.songDuration.value, 10);
  const file = ui.songFile.files[0];
  const urlValue = ui.songUrl.value.trim();
  const lyrics = ui.songLyrics.value.trim();
  const youtubeId = extractYouTubeId(urlValue);
  let audioSrc = "";

  if (!playlists[targetPlaylist]) {
    setLibraryStatus("Choose a valid playlist first.", true);
    return;
  }
  if (!title || !artist) {
    setLibraryStatus("Song title and artist are required.", true);
    return;
  }
  if (!file && !urlValue && (!Number.isFinite(duration) || duration < 10 || duration > 900)) {
    setLibraryStatus("Duration must be between 10 and 900 seconds.", true);
    return;
  }

  if (file) {
    audioSrc = URL.createObjectURL(file);
  } else if (urlValue && !youtubeId) {
    audioSrc = normalizeAudioUrl(urlValue);
  }

  if (youtubeId) {
    if (!Number.isFinite(duration) || duration < 10 || duration > 900) {
      duration = 180;
    }
  } else if (audioSrc) {
    const detectedDuration = await getAudioDuration(audioSrc);
    if (Number.isFinite(detectedDuration) && detectedDuration > 0) {
      duration = Math.round(detectedDuration);
    } else if (!Number.isFinite(duration) || duration < 10 || duration > 900) {
      setLibraryStatus("Could not read audio length. Enter duration manually.", true);
      return;
    }
  }

  const track = assignTrackSound({ title, artist, duration, audioSrc, youtubeId, lyrics }, Date.now());
  playlists[targetPlaylist].push(track);

  if (targetPlaylist === activePlaylist && playlists[targetPlaylist].length === 1) {
    activeTrack = 0;
    elapsed = 0;
  }
  if (targetPlaylist === activePlaylist) {
    render();
  }

  ui.songTitle.value = "";
  ui.songArtist.value = "";
  ui.songFile.value = "";
  ui.songUrl.value = "";
  ui.songLyrics.value = "";
  const sourceLabel = youtubeId
    ? " with YouTube audio"
    : (audioSrc ? " with real audio" : " with synth sound");
  setLibraryStatus(`Added "${title}" to ${targetPlaylist}${sourceLabel}`);
  if (audioSrc && audioSrc.startsWith("blob:")) {
    setLibraryStatus(`${ui.libraryStatus.textContent} (local files won't persist after refresh)`);
  }
  saveLibraryState();
});

setInterval(() => {
  const track = currentTrack();
  if (!playing || !track) return;
  if (isYouTubeTrack(track)) {
    if (ytPlayer && typeof ytPlayer.getCurrentTime === "function") {
      elapsed = Math.floor(ytPlayer.getCurrentTime() || 0);
      const duration = Math.floor(ytPlayer.getDuration() || 0);
      if (duration > 0 && track.duration !== duration) {
        track.duration = duration;
        saveLibraryState();
      }
      render();
    }
    return;
  }
  if (isAudioTrack(track)) return;
  elapsed += 1;
  if (elapsed >= track.duration) {
    nextTrack();
    return;
  }
  render();
}, 1000);

renderPlaylistOptions();
render();
