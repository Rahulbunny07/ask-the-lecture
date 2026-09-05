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
  /** Set for YouTube lectures. */
  videoId?: string;
  /** Set for lectures served as a direct media file. */
  mediaUrl?: string;
  onTime?: (seconds: number) => void;
}

/**
 * Two very different players behind one handle. Course platforms serve
 * lectures straight off a CDN, where a plain media element seeks more
 * precisely than the IFrame API does anyway.
 */
const Player = forwardRef<PlayerHandle, Props>(function Player(
  { videoId, mediaUrl, onTime },
  ref,
) {
  const mountRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const ytRef = useRef<YTPlayer | null>(null);
  const onTimeRef = useRef(onTime);
  onTimeRef.current = onTime;

  useImperativeHandle(ref, () => ({
    seekTo(seconds: number) {
      if (videoRef.current) {
        videoRef.current.currentTime = seconds;
        void videoRef.current.play().catch(() => {
          /* autoplay can be blocked; the seek still landed */
        });
        return;
      }
      ytRef.current?.seekTo(seconds, true);
      ytRef.current?.playVideo();
    },
  }));

  useEffect(() => {
    if (!videoId) return;

    let cancelled = false;
    let ticker: ReturnType<typeof setInterval> | undefined;

    void loadPlayerApi().then(() => {
      if (cancelled || !mountRef.current || !window.YT) return;

      ytRef.current = new window.YT.Player(mountRef.current, {
        videoId,
        playerVars: { rel: 0, modestbranding: 1 },
      });

      ticker = setInterval(() => {
        const seconds = ytRef.current?.getCurrentTime?.();
        if (typeof seconds === "number") onTimeRef.current?.(seconds);
      }, 500);
    });

    return () => {
      cancelled = true;
      if (ticker) clearInterval(ticker);
      ytRef.current?.destroy();
      ytRef.current = null;
    };
  }, [videoId]);

  if (!videoId && mediaUrl) {
    return (
      <div className="player">
        <video
          ref={videoRef}
          src={mediaUrl}
          controls
          playsInline
          preload="metadata"
          onTimeUpdate={(e) => onTimeRef.current?.(e.currentTarget.currentTime)}
        />
      </div>
    );
  }

  return (
    <div className="player">
      <div ref={mountRef} />
    </div>
  );
});

export default Player;
