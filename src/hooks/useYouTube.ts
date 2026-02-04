import { useRef, useEffect, useState } from 'react';
import type { WatchSession } from '../types/Watch';

declare global {
    interface Window {
        onYouTubeIframeAPIReady: () => void;
        YT: any;
    }
}

interface UseYouTubeProps {
    videoId: string;
    containerId: string;
    isHost: boolean;
    onStateChange: (event: any) => void;
    onReady: (event: any) => void;
}

export function useYouTube({ videoId, containerId, isHost, onStateChange, onReady }: UseYouTubeProps) {
    const playerRef = useRef<any>(null);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // 1. Load the IFrame Player API code asynchronously.
        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        }

        // 2. Define global callback
        const initPlayer = () => {
            // Prevent multiple inits
            if (playerRef.current) return;

            playerRef.current = new window.YT.Player(containerId, {
                height: '100%',
                width: '100%',
                videoId,
                playerVars: {
                    'playsinline': 1,
                    'controls': isHost ? 1 : 0, // 0 = Hide controls for viewers
                    'disablekb': !isHost ? 1 : 0, // Disable keyboard for viewers
                    'modestbranding': 1,
                    'rel': 0,
                    'iv_load_policy': 3 // Hide annotations
                },
                events: {
                    'onReady': (event: any) => {
                        setIsReady(true);
                        onReady(event);
                    },
                    'onStateChange': onStateChange
                }
            });
        };

        if (window.YT && window.YT.Player) {
            initPlayer();
        } else {
            // Push to existing queue if function already exists? 
            // Actually standard API overwrites it. We should be careful if multiple components use it.
            // For this app, only one player exists at a time, so it's safe.
            window.onYouTubeIframeAPIReady = initPlayer;
        }

        return () => {
            if (playerRef.current?.destroy) {
                try {
                    playerRef.current.destroy();
                } catch (e) { console.error("YT Clean error", e); }
                playerRef.current = null;
            }
        };
    }, [videoId, containerId, isHost]); // Re-create if these change

    return { player: playerRef.current, isReady };
}
