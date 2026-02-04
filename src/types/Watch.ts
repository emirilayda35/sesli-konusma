export type WatchPlatform = 'youtube' | 'netflix' | 'prime' | 'disney' | 'custom';

export type PlaybackStatus = 'playing' | 'paused' | 'buffering';

export interface PlaybackState {
    status: PlaybackStatus;
    currentTime: number; // in seconds
    lastUpdated: number; // server timestamp (Date.now())
    playbackRate: number; // usually 1.0
}

export interface WatchSession {
    isActive: boolean;
    platform: WatchPlatform;
    contentId: string; // Video ID or full URL
    hostUid: string; // The user who controls the session
    playbackState: PlaybackState;
    startedAt: number;
}

export interface WatchInvitation {
    id: string;
    fromUid: string;
    fromName: string;
    toUid: string; // 'all' for room-wide or specific uid
    roomId: string;
    roomName: string;
    platform: WatchPlatform;
    timestamp: number;
}
