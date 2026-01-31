import React, { useEffect, useState } from 'react';
import { FaMinus, FaRegSquare, FaTimes } from 'react-icons/fa';
import { getCurrentWindow } from '@tauri-apps/api/window';
const isTauri = Boolean((window as any).__TAURI__);

const TitleBar = () => {
    const appWindow = isTauri ? getCurrentWindow() : null;
    const [isMaximized, setIsMaximized] = useState(false);

    useEffect(() => {
        if (!isTauri || !appWindow) return;

        appWindow.isMaximized().then(setIsMaximized);
    }, []);

    if (!isTauri || !appWindow) return null;

    const minimize = () => appWindow.minimize();
    const maximize = async () => {
        await appWindow.toggleMaximize();
        setIsMaximized(await appWindow.isMaximized());
    };
    const close = () => appWindow.close();

    return (
        <div
            data-tauri-drag-region
            style={{
                height: '32px',
                background: '#2b2b2b',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                paddingLeft: 12,
                position: 'fixed',
                top: 0,
                left: 0,
                right: 0,
                zIndex: 9999,
                color: '#fff'
            }}
        >
            <div style={{ pointerEvents: 'none' }}>Sesli Konuşma</div>

            <div style={{ display: 'flex' }}>
                <button onClick={minimize}>–</button>
                <button onClick={maximize}>▢</button>
                <button onClick={close}>✕</button>
            </div>
        </div>
    );
};

export default TitleBar;
