
const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const readline = require('readline');

const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
});

const DIST_UPDATES = path.resolve(__dirname, '../dist/updates');
if (!fs.existsSync(DIST_UPDATES)) {
    fs.mkdirSync(DIST_UPDATES, { recursive: true });
}

console.log("🚀 Starting Release Process...");

rl.question('Select version bump type (patch/minor/major) [patch]: ', (answer) => {
    const bumpType = answer.trim() || 'patch';
    rl.close();

    try {
        // 1. Bump Version
        if (process.argv[3] !== 'skip-bump') {
            console.log(`\n📦 Bumping version (${bumpType})...`);
            execSync(`node scripts/bump-version.cjs ${bumpType}`, { stdio: 'inherit' });
        } else {
            console.log(`\n📦 Skipping version bump... (Using current version)`);
        }

        // Reload package.json to get new version
        const pkg = require('../package.json');
        const version = pkg.version;

        // 2. Build Windows
        console.log('\n🪟 Building Windows Installer...');
        execSync('npm run build', { stdio: 'inherit' }); // Vite build

        // Set signing environment variables
        // Set signing environment variables
        if (fs.existsSync('private.key')) {
            const privateKey = fs.readFileSync('private.key', 'utf-8');
            const buildEnv = { ...process.env, TAURI_SIGNING_PRIVATE_KEY: privateKey, TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "" };
            console.log("🔑 Signing keys loaded from private.key");
            execSync('npm run tauri build -- --target x86_64-pc-windows-msvc', { stdio: 'inherit', env: buildEnv });
        } else {
            console.warn("⚠️ private.key not found - Windows build will not be auto-signed!");
            execSync('npm run tauri build -- --target x86_64-pc-windows-msvc', { stdio: 'inherit' });
        }

        // Move Windows Artifacts
        const winBuildDir = path.resolve(__dirname, '../src-tauri/target/x86_64-pc-windows-msvc/release/bundle/nsis');
        // Find specific version files
        const setupFile = fs.readdirSync(winBuildDir).find(f => f.includes(version) && f.endsWith('.exe'));
        const nsisZip = fs.readdirSync(winBuildDir).find(f => f.includes(version) && f.endsWith('.nsis.zip'));
        const sigFile = `sesli_konusma_${version}_x64_en-US.nsis.zip.sig`; // Check structure

        // Simply find the generated .msi or .exe and signature
        // Actually for updater we need the content of target/.../release/bundle/nsis/
        // The updater JSON expects signature and url.

        // 3. Build Android
        console.log('\n🤖 Building Android APK/AAB...');
        // Ensure environment variables for signing are set or key.properties is valid
        execSync('npm run tauri android build -- --apk true', { stdio: 'inherit' });

        // Move Android Artifacts
        const androidBuildDir = path.resolve(__dirname, '../src-tauri/gen/android/app/build/outputs/apk/universal/release');
        const apkFile = 'app-universal-release.apk';

        if (!fs.existsSync(DIST_UPDATES)) {
            fs.mkdirSync(DIST_UPDATES, { recursive: true });
        }

        const targetApk = path.join(DIST_UPDATES, `sesli_konusma_${version}.apk`);

        if (fs.existsSync(path.join(androidBuildDir, apkFile))) {
            fs.copyFileSync(path.join(androidBuildDir, apkFile), targetApk);
            console.log(`✅ Android APK copied to ${targetApk}`);
        } else {
            console.error("❌ Android APK not found!");
        }

        // 4. Generate Update JSONs
        console.log('\n📝 Generating Update Manifests...');

        // Windows 'latest.json'
        let signature = "";
        try {
            // Find signature file in the nsis folder
            const sigFileName = fs.readdirSync(winBuildDir).find(f => f.endsWith('.zip.sig'));
            if (sigFileName) {
                signature = fs.readFileSync(path.join(winBuildDir, sigFileName), 'utf-8');
                console.log("✅ Windows signature read successfully.");
            } else {
                console.warn("⚠️ Windows signature file not found!");
            }
        } catch (e) {
            console.warn("⚠️ Could not read Windows signature:", e.message);
        }

        const winUpdate = {
            version: version,
            notes: "Automatic Update",
            pub_date: new Date().toISOString(),
            platforms: {
                "windows-x86_64": {
                    "signature": signature,
                    "url": `https://sesli-konusma-web.vercel.app/updates/sesli_konusma_${version}_x64_en-US.nsis.zip`
                }
            }
        };
        fs.writeFileSync(path.join(DIST_UPDATES, 'latest.json'), JSON.stringify(winUpdate, null, 4));

        // Copy NSIS zip for updater
        if (nsisZip) {
            fs.copyFileSync(path.join(winBuildDir, nsisZip), path.join(DIST_UPDATES, nsisZip));
            console.log(`✅ Windows Update Artifact (Zip) copied.`);
        }

        // Also copy the setup.exe for fresh installs
        if (setupFile) {
            fs.copyFileSync(path.join(winBuildDir, setupFile), path.join(DIST_UPDATES, setupFile));
            console.log(`✅ Windows Installer (Exe) copied.`);
        }

        const androidUpdate = {
            version: version,
            notes: "Update via App",
            pub_date: new Date().toISOString(),
            platforms: {
                "android": {
                    "url": `https://sesli-konusma-web.vercel.app/updates/sesli_konusma_${version}.apk`
                }
            }
        };
        fs.writeFileSync(path.join(DIST_UPDATES, 'android.json'), JSON.stringify(androidUpdate, null, 4));

        console.log("\n✨ Release Build Complete!");
        console.log(`Artifacts are in ${DIST_UPDATES}`);
        console.log("Upload these files to your Vercel/Web Server.");

    } catch (error) {
        console.error("\n❌ Release Failed:", error.message);
        process.exit(1);
    }
});
