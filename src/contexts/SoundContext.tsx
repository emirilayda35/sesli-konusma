import React, { createContext, useContext, useState, useCallback, useRef } from 'react';

interface SoundContextType {
    playSound: (soundName: 'click' | 'message_sent' | 'notification' | 'call_start' | 'join') => void;
    settings: {
        enabled: boolean;
        volume: number;
    };
    updateSettings: (newSettings: Partial<{ enabled: boolean; volume: number }>) => void;
}

const SoundContext = createContext<SoundContextType | undefined>(undefined);

export const SoundProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [settings, setSettings] = useState(() => {
        const saved = localStorage.getItem('sound_settings');
        return saved ? JSON.parse(saved) : { enabled: true, volume: 0.5 };
    });
    const audioCtxRef = useRef<AudioContext | null>(null);

    const getCtx = (): AudioContext => {
        if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
            audioCtxRef.current = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtxRef.current.state === 'suspended') {
            audioCtxRef.current.resume();
        }
        return audioCtxRef.current;
    };

    const updateSettings = (newSettings: Partial<{ enabled: boolean; volume: number }>) => {
        setSettings((prev: any) => {
            const updated = { ...prev, ...newSettings };
            localStorage.setItem('sound_settings', JSON.stringify(updated));
            return updated;
        });
    };

    // Helper: play a tone sequence
    const playTone = useCallback((
        notes: { freq: number; duration: number; type?: OscillatorType; delay?: number }[],
        vol: number
    ) => {
        const ctx = getCtx();
        notes.forEach(({ freq, duration, type = 'sine', delay = 0 }) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.type = type;
            osc.frequency.setValueAtTime(freq, ctx.currentTime + delay);

            const t = ctx.currentTime + delay;
            const attack = 0.01;
            const release = Math.min(duration * 0.4, 0.06);

            gain.gain.setValueAtTime(0, t);
            gain.gain.linearRampToValueAtTime(vol, t + attack);
            gain.gain.setValueAtTime(vol, t + duration - release);
            gain.gain.linearRampToValueAtTime(0, t + duration);

            osc.start(t);
            osc.stop(t + duration + 0.01);
        });
    }, []);

    const playSound = useCallback((soundName: string) => {
        if (!settings.enabled) return;
        const vol = Math.min(1, Math.max(0, settings.volume));

        try {
            switch (soundName) {
                // Short UI tick
                case 'click':
                    playTone([{ freq: 1200, duration: 0.03, type: 'triangle' }], vol * 0.3);
                    break;

                // Upward two-note: message received
                case 'notification':
                    playTone([
                        { freq: 880, duration: 0.10, delay: 0 },
                        { freq: 1318, duration: 0.14, delay: 0.10 },
                    ], vol * 0.5);
                    break;

                // Soft high pop: message sent
                case 'message_sent':
                    playTone([
                        { freq: 1047, duration: 0.08, delay: 0 },
                        { freq: 1568, duration: 0.07, delay: 0.07 },
                    ], vol * 0.4);
                    break;

                // Rising arpeggio: voice room join
                case 'join':
                    playTone([
                        { freq: 440, duration: 0.10, delay: 0.00 },
                        { freq: 554, duration: 0.10, delay: 0.10 },
                        { freq: 659, duration: 0.18, delay: 0.20 },
                    ], vol * 0.5);
                    break;

                // Gentle descending tone: call start / connecting
                case 'call_start':
                    playTone([
                        { freq: 660, duration: 0.20, delay: 0.00 },
                        { freq: 440, duration: 0.30, delay: 0.18 },
                    ], vol * 0.5);
                    break;

                default:
                    break;
            }
        } catch (err) {
            console.error('[SoundContext] Error playing sound:', err);
        }
    }, [settings, playTone]);

    return (
        <SoundContext.Provider value={{ playSound, settings, updateSettings }}>
            {children}
        </SoundContext.Provider>
    );
};

export const useSound = () => {
    const context = useContext(SoundContext);
    if (!context) throw new Error('useSound must be used within a SoundProvider');
    return context;
};
