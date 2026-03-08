
export const isAndroid = () => {
    return /Android/i.test(navigator.userAgent);
};

export const isTauri = () => {
    return !!(window as any).__TAURI__;
};


// openUrl removed as part of Screen Sharing pivot

