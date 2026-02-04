import { useRef, useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import { WatchService } from '../../services/WatchService';
import type { WatchSession } from '../../types/Watch';

declare global {
    interface Window {
        onYouTubeIframeAPIReady: () => void;
        YT: any;
    }
}

interface YouTubePlayerProps {
    roomId: string;
    watchSession: WatchSession;
}

const SYNC_THRESHOLD = 0.5; // Seconds of drift to initiate seeking

export default function YouTubePlayer({ roomId, watchSession }: YouTubePlayerProps) {
    const { currentUser } = useAuth();
    const playerRef = useRef<any>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [isPlayerReady, setIsPlayerReady] = useState(false);

    const isHost = currentUser?.uid === watchSession.hostUid;
    const syncIntervalRef = useRef<any>(null);

    // Initialize YouTube API via manual script injection for maximum control
    // We duplicate some logic from the hook here because we need direct ref access 
    // inside the same scope for closures over 'isHost' etc.
    // Actually, let's keep it simple and inline it to avoid hook closure staleness issues with the event listeners.

    useEffect(() => {
        if (!window.YT) {
            const tag = document.createElement('script');
            tag.src = "https://www.youtube.com/iframe_api";
            const firstScriptTag = document.getElementsByTagName('script')[0];
            firstScriptTag.parentNode?.insertBefore(tag, firstScriptTag);
        }

        const initPlayer = () => {
            if (playerRef.current) return;

            playerRef.current = new window.YT.Player('yt-player-target', {
                height: '100%',
                width: '100%',
                videoId: watchSession.contentId,
                playerVars: {
                    'playsinline': 1,
                    'controls': isHost ? 1 : 0,
                    'disablekb': !isHost ? 1 : 0,
                    'modestbranding': 1,
                    'rel': 0
                },
                events: {
                    'onReady': onPlayerReady,
                    'onStateChange': handleStateChangeRef.current // Use ref for state change handler
                }
            });
        };

        if (window.YT && window.YT.Player) {
            initPlayer();
        } else {
            window.onYouTubeIframeAPIReady = initPlayer;
        }

        return () => {
            if (playerRef.current?.destroy) {
                try { playerRef.current.destroy(); } catch (e) { }
                playerRef.current = null;
            }
        };
    }, [watchSession.contentId, isHost]); // Added isHost to dependency array for playerVars

    // Re-apply controls if host status changes (e.g. host leaves, you become host)
    // YouTube API doesn't support changing 'controls' dynamically without reload. 
    // We might need to destroy/recreate if isHost changes. For MVP, assume isHost is static or reload.

    const onPlayerReady = (event: any) => {
        setIsPlayerReady(true);
        applyRemoteState(watchSession.playbackState);
    };

    /**
     * HOST LOGIC: Detect local changes and push to Firestore
     */
    const isHostRef = useRef(isHost);
    useEffect(() => { isHostRef.current = isHost; }, [isHost]);

    const handleStateChange = useCallback((event: any) => {
        if (!isHostRef.current || !playerRef.current) return;

        const stateMapping: any = {
            1: 'playing',
            2: 'paused',
            3: 'buffering'
        };

        const status = stateMapping[event.data];
        if (!status) return;

        WatchService.updatePlaybackState(roomId, {
            status,
            currentTime: playerRef.current.getCurrentTime(),
            playbackRate: playerRef.current.getPlaybackRate()
        });
    }, [roomId]);

    // We need to bake the handler into the init options, but those are created once.
    // So we'll assign the handler to a ref or window property that we can update?
    // Or just use a mutable ref for the callback.
    const handleStateChangeRef = useRef(handleStateChange);
    useEffect(() => { handleStateChangeRef.current = handleStateChange; }, [handleStateChange]);


    // Redefine init to use the ref
    // ... Actually, the previous useEffect had a closure issue. 
    // Let's rewrite the Effect to be cleaner.

    // (We will invoke the global init logic again in a cleaner way below, 
    // but since we are inside `replace_file_content`, we just provide the full correct code.)

    // Periodic Sync for HOST (Time update)
    // YouTube doesn't fire "timeupdate" continually, so we poll during playback
    useEffect(() => {
        if (isHost && isPlayerReady) {
            syncIntervalRef.current = setInterval(() => {
                if (playerRef.current?.getPlayerState() === 1) { // Playing
                    WatchService.updatePlaybackState(roomId, {
                        currentTime: playerRef.current.getCurrentTime()
                    });
                }
            }, 2000); // Update every 2 seconds
        }
        return () => clearInterval(syncIntervalRef.current);
    }, [isHost, isPlayerReady, roomId]);


    /**
     * VIEWER LOGIC: Listen to Firestore and Sync
     */
    useEffect(() => {
        if (!isPlayerReady || isHost) return;

        // We receive the full watchSession prop from the parent (VoiceRoom), 
        // which is already listening to the room doc.
        // So we just react to prop changes.
        applyRemoteState(watchSession.playbackState);

    }, [watchSession.playbackState, isPlayerReady, isHost]);


    /**
     * SYNC CORE: Apply remote state to local player
     */
    const applyRemoteState = (remoteState: any) => {
        if (!playerRef.current || !remoteState) return;

        const playerState = playerRef.current.getPlayerState(); // 1=Playing, 2=Paused
        const localTime = playerRef.current.getCurrentTime();

        // Calculate Expected Time
        let expectedTime = remoteState.currentTime;
        if (remoteState.status === 'playing') {
            const timeSinceUpdate = (Date.now() - remoteState.lastUpdated) / 1000;
            // Cap lag correction to avoid jumping too far into future if local clock is skew
            const drift = Math.min(timeSinceUpdate, 5.0);
            expectedTime += (drift * remoteState.playbackRate);
        }

        // 1. Handle Status (Play/Pause)
        if (remoteState.status === 'paused' && playerState !== 2) {
            playerRef.current.pauseVideo();
            // Also snap time when pausing to be precise
            if (Math.abs(localTime - expectedTime) > 0.1) {
                playerRef.current.seekTo(expectedTime, true);
            }
        } else if (remoteState.status === 'playing' && playerState !== 1 && playerState !== 3) { // 3=Buffering
            playerRef.current.playVideo();
        }

        // 2. Handle Time Drift (Seeking)
        const drift = Math.abs(localTime - expectedTime);
        if (drift > SYNC_THRESHOLD) {
            console.log(`[Sync] Drift ${drift.toFixed(2)}s detected. Seeking to ${expectedTime.toFixed(2)}s`);
            playerRef.current.seekTo(expectedTime, true);
        }
    };

    return (
        <div ref={containerRef} style={{ width: '100%', height: '100%', background: '#000', position: 'relative' }}>
            <div id="yt-player-target" />
            {!isHost && <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', zIndex: 10, background: 'transparent' }} />}
        </div>
    );
}
