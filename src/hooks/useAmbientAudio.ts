import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Ambient space-music manager.
 *
 * Plays a randomised, gap-free queue of royalty-free tracks through a single
 * <audio> element. Tracks live in public/audio and are referenced by URL path
 * (never imported through the bundler) so the count is trivial to change here.
 */
const TRACK_COUNT = 10;
const TRACKS = Array.from({ length: TRACK_COUNT }, (_, i) =>
  `/audio/track-${String(i + 1).padStart(2, '0')}.mp3`,
);

const STORAGE_KEY = 'chronograph-audio';
const VOLUME = 0.5;

/** Persisted on/off preference — defaults on (anything but the literal "off"). */
function prefEnabled(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off';
  } catch {
    return true; // storage unavailable (private mode etc.) → default on
  }
}

/** Fisher–Yates shuffle into a new array. */
function shuffle(source: readonly string[]): string[] {
  const a = [...source];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export interface AmbientAudio {
  /** Whether sound is enabled (the persisted preference). */
  enabled: boolean;
  /** Flip the preference: muting pauses, unmuting resumes (+ persists). */
  toggle: () => void;
}

/**
 * Call once near the app root. Returns the current on/off state and a toggle.
 * Playback never starts on load (browsers reject autoplay with sound); it begins
 * on the first user gesture, or immediately when the user unmutes via the toggle.
 */
export function useAmbientAudio(): AmbientAudio {
  const [enabled, setEnabled] = useState(prefEnabled);

  const audioRef    = useRef<HTMLAudioElement | null>(null);
  const queueRef    = useRef<string[]>([]);
  const indexRef    = useRef(0);
  const unlockedRef = useRef(false);  // has playback successfully started once?
  const enabledRef  = useRef(enabled); // live value for the gesture/audio listeners

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  /** Start playback. Must be called *synchronously* inside a user gesture (iOS
   *  ties media playback to the activating event) — never after an await. The
   *  src is assigned up front with preload="none", so play() both downloads and
   *  plays as part of the gesture, which mobile permits. Catch so it never throws. */
  const play = useCallback(() => {
    audioRef.current?.play().catch(() => { /* not a valid activation yet — ignore */ });
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.volume  = VOLUME;
    audio.preload = 'none'; // lazy: the fetch only happens on play()
    audioRef.current = audio;

    queueRef.current = shuffle(TRACKS);
    indexRef.current = 0;
    audio.src = queueRef.current[0]; // selected up front, not fetched (preload="none")

    // Advance to the next track when one finishes, reshuffling at the end of the
    // queue and guaranteeing the new shuffle doesn't repeat the track that just
    // played (no audible back-to-back repeats). Only the new current track is
    // pointed at the element, so just one file is ever fetched at a time.
    function handleEnded() {
      const queue = queueRef.current;
      const justPlayed = queue[indexRef.current];
      let next = indexRef.current + 1;

      if (next >= queue.length) {
        const reshuffled = shuffle(TRACKS);
        if (reshuffled[0] === justPlayed && reshuffled.length > 1) {
          [reshuffled[0], reshuffled[1]] = [reshuffled[1], reshuffled[0]];
        }
        queueRef.current = reshuffled;
        next = 0;
      }

      indexRef.current = next;
      audio.src = queueRef.current[next]; // lazy-load the new current track
      play();                             // keep playing seamlessly
    }
    audio.addEventListener('ended', handleEnded);

    // ── First-gesture unlock ─────────────────────────────────────────────────
    // Capture phase on window so a child handler calling stopPropagation() (e.g.
    // a node tap) can never prevent it — a node tap is the typical first gesture
    // on mobile. Several gesture types are tried (iOS only grants activation on
    // touchend/click, not pointerdown), all routed to one idempotent handler that
    // calls play() synchronously and only detaches once playback actually starts.
    const GESTURES = ['pointerdown', 'touchend', 'click', 'keydown'] as const;

    function detachUnlock() {
      for (const type of GESTURES) window.removeEventListener(type, unlock, true);
    }

    function unlock() {
      if (unlockedRef.current) { detachUnlock(); return; }
      if (!enabledRef.current) return; // muted — the toggle will start playback
      const el = audioRef.current;
      if (!el) return;
      const p = el.play();
      if (p && typeof p.then === 'function') {
        // Only mark unlocked / detach when the gesture genuinely started audio;
        // a rejected attempt leaves the listeners armed for the next gesture.
        p.then(() => { unlockedRef.current = true; detachUnlock(); }).catch(() => { /* retry next gesture */ });
      } else {
        unlockedRef.current = true;
        detachUnlock();
      }
    }

    for (const type of GESTURES) {
      window.addEventListener(type, unlock, { capture: true, passive: true });
    }

    return () => {
      audio.removeEventListener('ended', handleEnded);
      detachUnlock();
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [play]);

  const toggle = useCallback(() => {
    const next = !enabledRef.current;
    enabledRef.current = next;
    try { localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off'); } catch { /* ignore */ }

    // Tapping the toggle is itself a user gesture, so drive play()/pause()
    // *synchronously* here (not inside the setEnabled updater, which React would
    // defer out of the gesture and trip iOS's NotAllowedError).
    const audio = audioRef.current;
    if (audio) {
      if (next) { unlockedRef.current = true; play(); } // unmute → resume
      else      { audio.pause(); }                      // mute → pause in place
    }

    setEnabled(next);
  }, [play]);

  return { enabled, toggle };
}
