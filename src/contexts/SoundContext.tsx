import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

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

    const updateSettings = (newSettings: Partial<{ enabled: boolean; volume: number }>) => {
        setSettings((prev: any) => {
            const updated = { ...prev, ...newSettings };
            localStorage.setItem('sound_settings', JSON.stringify(updated));
            return updated;
        });
    };

    const playSound = useCallback((soundName: string) => {
        console.log(`[SoundContext] Attempting to play: ${soundName}`);
        if (!settings.enabled) {
            console.log(`[SoundContext] Sound is disabled in settings.`);
            return;
        }

        try {
            const audio = new Audio(`/assets/sounds/${soundName}.mp3`);
            audio.volume = settings.volume;

            const playPromise = audio.play();

            if (playPromise !== undefined) {
                playPromise.catch(err => {
                    console.error(`[SoundContext] Playback failed for ${soundName}:`, err);
                    if (err.name === 'NotAllowedError') {
                        console.warn('[SoundContext] Autoplay blocked. User must interact with the page first.');
                    }
                });
            }
        } catch (err) {
            console.error(`[SoundContext] Error initializing audio for ${soundName}:`, err);
        }
    }, [settings]);

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
