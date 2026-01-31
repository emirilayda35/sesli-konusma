declare global {
    interface Window {
        __TAURI__?: {
            window: {
                appWindow: {
                    minimize: () => Promise<void>;
                    toggleMaximize: () => Promise<void>;
                    close: () => Promise<void>;
                    isMaximized: () => Promise<boolean>;
                };
            };
        };
    }
}

export { };
