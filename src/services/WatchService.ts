import { db } from '../firebase';
import { doc, updateDoc, serverTimestamp, getDoc } from 'firebase/firestore';
import type { WatchSession, PlaybackState, WatchPlatform } from '../types/Watch';

export const WatchService = {
    /**
     * Starts a new watch session in the given room.
     * Only one session can be active at a time.
     */
    async startSession(roomId: string, hostUid: string, platform: WatchPlatform, contentId: string) {
        const roomRef = doc(db, 'rooms', roomId);

        const initialPlaybackState: PlaybackState = {
            status: 'paused',
            currentTime: 0,
            lastUpdated: Date.now(),
            playbackRate: 1.0
        };

        const session: WatchSession = {
            isActive: true,
            platform,
            contentId,
            hostUid,
            playbackState: initialPlaybackState,
            startedAt: Date.now()
        };

        await updateDoc(roomRef, {
            watchSession: session
        });
    },

    /**
     * Updates the playback state (Play/Pause, Seek).
     * Should only be called by the Host.
     */
    async updatePlaybackState(roomId: string, newState: Partial<PlaybackState>) {
        const roomRef = doc(db, 'rooms', roomId);

        // optimize: we might want to pass the full object to avoid read-before-write if possible,
        // but here we just merge into watchSession.playbackState
        // Firestore dot notation for nested fields

        const updateData: any = {};
        if (newState.status) updateData['watchSession.playbackState.status'] = newState.status;
        if (newState.currentTime !== undefined) updateData['watchSession.playbackState.currentTime'] = newState.currentTime;
        if (newState.playbackRate) updateData['watchSession.playbackState.playbackRate'] = newState.playbackRate;

        // Always update lastUpdated
        updateData['watchSession.playbackState.lastUpdated'] = Date.now(); // Use server-side time ideally, but client time for sync calc locally is okay if clocks are close. Better: use Date.now() and let clients compute offset. 
        // Actually, for sync, we need a common reference. Firestore serverTimestamp() is an object, not a number, so it's hard to use for math in JS without converting.
        // We will use Date.now() from the HOST as the "Truth". Viewers calculate based on "Host's Update Time".

        await updateDoc(roomRef, updateData);
    },

    /**
     * End the session.
     * Should only be called by the Host.
     */
    async endSession(roomId: string) {
        const roomRef = doc(db, 'rooms', roomId);
        await updateDoc(roomRef, {
            watchSession: null // or { isActive: false }
        });
    },

    /**
     * Join the session (Client-side helper, maybe not needed in DB if we don't track viewers strictly)
     * We don't strictly need to "join" in DB for this MVP, as anyone in the room can watch.
     */
};
