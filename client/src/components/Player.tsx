import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

interface YTPlayer {
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  getCurrentTime(): number;
  destroy(): void;
}

interface YTPlayerOptions {
  videoId: string;
  playerVars?: Record<string, string | number>;
  events?: { onReady?: () => void };
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement, o: YTPlayerOptions) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiPromise: Promise<void> | null = null;

/** The IFrame API is a global singleton - load the script at most once. */
function loadPlayerApi(): Promise<void> {
  if (window.YT?.Player) return Promise.resolve();
  if (apiPromise) return apiPromise;

  apiPromise = new Promise<void>((resolve) => {
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve();
    };
    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    document.head.appendChild(script);
  });
  return apiPromise;
}

export interface PlayerHandle {
  /** Jump the video to a second and start playing - this is what a citation does. */
  seekTo(seconds: number): void;
}

interface Props {
  videoId: string;
  onTime?: (seconds: number) => void;
}

const Player = forwardRef<PlayerHandle, Props>(function Player(
  { videoId, onTime },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const playerRef = useRef<YTPlayer | null>(null);
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;

  useImperativeHandle(ref, () => ({
    seekTo(seconds: number) {
      playerRef.current?.seekTo(seconds, true);
      playerRef.current?.playVideo();
    },
  }));

  useEffect(() => {
    let cancelled = false;
    let ticker: ReturnType<typeof setInterval> | undefined;

    loadPlayerApi().then(() => {
      if (cancelled || !mountRef.current || !window.YT) return;

      playerRef.current = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
      });

      ticker = setInterval(() => {
        const seconds = playerRef.current?.getCurrentTime?.();
        if (typeof seconds === "number") onTimeRef.current?.(seconds);
      }, 500);
    });

    return () => {
      cancelled = true;
      if (ticker) clearInterval(ticker);
      playerRef.current?.destroy();
      playerRef.current = null;
    };
  }, [videoId]);

  return (
    <div className="player">
      <div ref={mountRef} />
    </div>
  );
});

export default Player;
