const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DOWNLOADS_DIR = path.join(ROOT, 'public', 'downloads');

// Ensure downloads directory exists
if (!fs.existsSync(DOWNLOADS_DIR)) {
    fs.mkdirSync(DOWNLOADS_DIR, { recursive: true });
}

const SOURCES = [
    {
        name: 'Windows',
        pattern: /.*_x64-setup\.exe$/i,
        searchDir: path.join(ROOT, 'src-tauri', 'target', 'release', 'bundle', 'nsis'),
        targetName: 'SesliKonusma_Setup.exe'
    },
    {
        name: 'Android',
        pattern: /app-universal-release-unsigned\.apk$/,
        searchDir: path.join(ROOT, 'src-tauri', 'gen', 'android', 'app', 'build', 'outputs', 'apk', 'universal', 'release'),
        targetName: 'sesli-konusma-android.apk'
    }
];

function updateBuilds() {
    console.log('🚀 Güncel build dosyaları kopyalanıyor...');

    SOURCES.forEach(source => {
        if (!fs.existsSync(source.searchDir)) {
            console.warn(`⚠️  [${source.name}] Kaynak dizin bulunamadı: ${source.searchDir}`);
            return;
        }

        const files = fs.readdirSync(source.searchDir);
        const match = files.find(f => source.pattern.test(f));

        if (match) {
            const srcPath = path.join(source.searchDir, match);
            const destPath = path.join(DOWNLOADS_DIR, source.targetName);

            fs.copyFileSync(srcPath, destPath);
            console.log(`✅ [${source.name}] Güncellendi: ${source.targetName}`);
        } else {
            console.warn(`❌ [${source.name}] Uygun dosya bulunamadı.`);
        }
    });

    console.log('\n✨ Tüm linkler en son sürüme güncellendi!');
}

updateBuilds();
