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

  const audioRef   = useRef<HTMLAudioElement | null>(null);
  const queueRef   = useRef<string[]>([]);
  const indexRef   = useRef(0);
  const startedRef = useRef(false);   // has the first gesture happened?
  const enabledRef = useRef(enabled); // live value for document/audio listeners

  useEffect(() => { enabledRef.current = enabled; }, [enabled]);

  /** Wrapped so a rejected autoplay/gesture promise never throws. */
  const play = useCallback(() => {
    audioRef.current?.play().catch(() => { /* gesture/autoplay rejection — ignore */ });
  }, []);

  useEffect(() => {
    const audio = new Audio();
    audio.volume  = VOLUME;
    audio.preload = 'none'; // lazy: the fetch only happens on play()
    audioRef.current = audio;

    queueRef.current = shuffle(TRACKS);
    indexRef.current = 0;
    audio.src = queueRef.current[0]; // select, don't fetch (preload="none")

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

    // One-time first-gesture starter (autoplay-with-sound is blocked until then).
    function handleFirstGesture() {
      document.removeEventListener('pointerdown', handleFirstGesture);
      document.removeEventListener('keydown', handleFirstGesture);
      startedRef.current = true;
      if (enabledRef.current) play();
    }

    audio.addEventListener('ended', handleEnded);
    document.addEventListener('pointerdown', handleFirstGesture);
    document.addEventListener('keydown', handleFirstGesture);

    return () => {
      audio.removeEventListener('ended', handleEnded);
      document.removeEventListener('pointerdown', handleFirstGesture);
      document.removeEventListener('keydown', handleFirstGesture);
      audio.pause();
      audio.src = '';
      audioRef.current = null;
    };
  }, [play]);

  const toggle = useCallback(() => {
    setEnabled(prev => {
      const next = !prev;
      try { localStorage.setItem(STORAGE_KEY, next ? 'on' : 'off'); } catch { /* ignore */ }

      const audio = audioRef.current;
      if (audio) {
        if (next) { startedRef.current = true; play(); } // unmute → resume
        else      { audio.pause(); }                     // mute → pause in place
      }
      return next;
    });
  }, [play]);

  return { enabled, toggle };
}
