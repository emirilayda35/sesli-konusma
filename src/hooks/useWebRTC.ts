import { useEffect, useRef, useState } from 'react';
import { db } from '../firebase';
import {
    collection,
    doc,
    setDoc,
    onSnapshot,
    addDoc,
    query,
    where,
    deleteDoc,
    getDocs
} from 'firebase/firestore';

const servers = {
    iceServers: [
        {
            urls: ['stun:stun1.l.google.com:19302', 'stun:stun2.l.google.com:19302'],
        },
    ],
    iceCandidatePoolSize: 10,
};

export function useWebRTC(roomId: string, userId: string, userName: string) {
    const [peers, setPeers] = useState<Map<string, MediaStream>>(new Map());
    const [peerNames, setPeerNames] = useState<Map<string, string>>(new Map());
    const localStream = useRef<MediaStream | null>(null);
    const pcRef = useRef<Map<string, RTCPeerConnection>>(new Map());

    useEffect(() => {
        let membersUnsubscribe: () => void;
        let signalingUnsubscribe: () => void;
        let iceUnsubscribe: () => void;
        const memberDoc = doc(db, `rooms/${roomId}/members`, userId);

        async function setupStream() {
            const inputId = localStorage.getItem('voice_inputId') || 'default';
            const echo = localStorage.getItem('voice_echoCancellation') !== 'false';
            const noise = localStorage.getItem('voice_noiseSuppression') !== 'false';

            if (localStream.current) {
                localStream.current.getTracks().forEach(t => t.stop());
            }

            try {
                const stream = await navigator.mediaDevices.getUserMedia({
                    audio: {
                        deviceId: inputId !== 'default' ? { exact: inputId } : undefined,
                        echoCancellation: echo,
                        noiseSuppression: noise,
                        autoGainControl: true
                    },
                    video: false
                });
                localStream.current = stream;

                // Replace tracks in all active peer connections
                pcRef.current.forEach(pc => {
                    const sender = pc.getSenders().find(s => s.track?.kind === 'audio');
                    if (sender) {
                        sender.replaceTrack(stream.getAudioTracks()[0]);
                    }
                });
            } catch (err) {
                console.error("Error getting user media:", err);
            }
        }

        const handleSettingsUpdate = (e: any) => {
            const { key } = e.detail;
            if (['inputId', 'echoCancellation', 'noiseSuppression'].includes(key)) {
                setupStream();
            }
        };

        window.addEventListener('voice_settings_updated', handleSettingsUpdate);

        async function setup() {
            await setupStream();

            // 2. Register in Room
            await setDoc(memberDoc, { name: userName, joinedAt: Date.now() });

            // 3. Listen for other members
            membersUnsubscribe = onSnapshot(collection(db, `rooms/${roomId}/members`), async (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    const data = change.doc.data();
                    const remoteUserId = change.doc.id;

                    if (change.type === 'added' || change.type === 'modified') {
                        if (remoteUserId !== userId) {
                            setPeerNames(prev => new Map(prev).set(remoteUserId, data.name));
                            if (change.type === 'added') {
                                createPeerConnection(remoteUserId, true);
                            }
                        }
                    }
                    if (change.type === 'removed') {
                        closePeerConnection(remoteUserId);
                        setPeerNames(prev => {
                            const next = new Map(prev);
                            next.delete(remoteUserId);
                            return next;
                        });
                    }
                });
            });

            // 4. Listen for signaling messages
            signalingUnsubscribe = onSnapshot(collection(db, `rooms/${roomId}/signaling`), async (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.targetId === userId) {
                            if (data.type === 'offer') {
                                await handleOffer(data.senderId, data.sdp);
                            } else if (data.type === 'answer') {
                                await handleAnswer(data.senderId, data.sdp);
                            }
                        }
                    }
                });
            });

            // 5. Listen for ICE candidates
            iceUnsubscribe = onSnapshot(collection(db, `rooms/${roomId}/iceCandidates`), (snapshot) => {
                snapshot.docChanges().forEach(async (change) => {
                    if (change.type === 'added') {
                        const data = change.doc.data();
                        if (data.targetId === userId) {
                            const pc = pcRef.current.get(data.senderId);
                            if (pc) {
                                try {
                                    await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
                                } catch (e) {
                                    console.error('Error adding ice candidate', e);
                                }
                            }
                        }
                    }
                });
            });
        }

        setup();

        return () => {
            window.removeEventListener('voice_settings_updated', handleSettingsUpdate);
            if (membersUnsubscribe) membersUnsubscribe();
            if (signalingUnsubscribe) signalingUnsubscribe();
            if (iceUnsubscribe) iceUnsubscribe();
            localStream.current?.getTracks().forEach(t => t.stop());
            pcRef.current.forEach(pc => pc.close());
            deleteDoc(memberDoc);
        };
    }, [roomId, userId, userName]);

    async function createPeerConnection(remoteUserId: string, isOffer: boolean) {
        if (pcRef.current.has(remoteUserId)) return;

        const pc = new RTCPeerConnection(servers);
        pcRef.current.set(remoteUserId, pc);

        if (localStream.current) {
            localStream.current.getTracks().forEach(track => {
                pc.addTrack(track, localStream.current!);
            });
        }

        pc.ontrack = (event) => {
            setPeers(prev => {
                const next = new Map(prev);
                next.set(remoteUserId, event.streams[0]);
                return next;
            });
        };

        pc.onicecandidate = (event) => {
            if (event.candidate) {
                addDoc(collection(db, `rooms/${roomId}/iceCandidates`), {
                    senderId: userId,
                    targetId: remoteUserId,
                    candidate: event.candidate.toJSON(),
                    createdAt: Date.now()
                });
            }
        };

        if (isOffer) {
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            await addDoc(collection(db, `rooms/${roomId}/signaling`), {
                type: 'offer',
                senderId: userId,
                targetId: remoteUserId,
                sdp: offer.sdp,
                createdAt: Date.now()
            });
        }
    }

    async function handleOffer(senderId: string, sdp: string) {
        await createPeerConnection(senderId, false);
        const pc = pcRef.current.get(senderId);
        if (!pc) return;

        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'offer', sdp }));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);

        await addDoc(collection(db, `rooms/${roomId}/signaling`), {
            type: 'answer',
            senderId: userId,
            targetId: senderId,
            sdp: answer.sdp,
            createdAt: Date.now()
        });
    }

    async function handleAnswer(senderId: string, sdp: string) {
        const pc = pcRef.current.get(senderId);
        if (!pc) return;
        await pc.setRemoteDescription(new RTCSessionDescription({ type: 'answer', sdp }));
    }

    function closePeerConnection(remoteUserId: string) {
        const pc = pcRef.current.get(remoteUserId);
        if (pc) {
            pc.close();
            pcRef.current.delete(remoteUserId);
            setPeers(prev => {
                const next = new Map(prev);
                next.delete(remoteUserId);
                return next;
            });
        }
    }

    return { peers, peerNames, localStream: localStream.current };
}
