const fs = require('fs');

const createDummyPNG = (path, size) => {
    // A tiny valid 1x1 transparent PNG, we can just write a valid blank image.
    // Or just a standard 1x1 base64 decoded.
    const base64Data = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=";
    fs.writeFileSync(path, Buffer.from(base64Data, 'base64'));
    console.log(`Created dummy icon at ${path} (Size intended: ${size}x${size}, actual: 1x1)`);
};

createDummyPNG('./public/pwa-192x192.png', 192);
createDummyPNG('./public/pwa-512x512.png', 512);
