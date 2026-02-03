
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const versionType = process.argv[2] || 'patch'; // patch, minor, major

// 1. Bump package.json
const packageJsonPath = path.resolve(__dirname, '../package.json');
const packageJson = require(packageJsonPath);
const currentVersion = packageJson.version;
const [major, minor, patch] = currentVersion.split('.').map(Number);

let newVersion = '';
if (versionType === 'major') newVersion = `${major + 1}.0.0`;
else if (versionType === 'minor') newVersion = `${major}.${minor + 1}.0`;
else newVersion = `${major}.${minor}.${patch + 1}`;

packageJson.version = newVersion;
fs.writeFileSync(packageJsonPath, JSON.stringify(packageJson, null, 2));
console.log(`Updated package.json to ${newVersion}`);

// 2. Bump tauri.conf.json
const tauriConfPath = path.resolve(__dirname, '../src-tauri/tauri.conf.json');
const tauriConf = require(tauriConfPath);
tauriConf.version = newVersion;
fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 4));
console.log(`Updated tauri.conf.json to ${newVersion}`);

// 3. Bump Android tauri.properties (Version Code & Name)
const tauriPropsPath = path.resolve(__dirname, '../src-tauri/gen/android/app/tauri.properties');
let propsContent = '';
if (fs.existsSync(tauriPropsPath)) {
    propsContent = fs.readFileSync(tauriPropsPath, 'utf-8');
} else {
    // Create if not exists (default)
    propsContent = 'tauri.android.versionCode=1\ntauri.android.versionName=1.0\n';
}

const codeMatch = propsContent.match(/tauri\.android\.versionCode=(\d+)/);
let newVersionCode = 1;
if (codeMatch) {
    newVersionCode = parseInt(codeMatch[1]) + 1;
    propsContent = propsContent.replace(/tauri\.android\.versionCode=\d+/, `tauri.android.versionCode=${newVersionCode}`);
} else {
    propsContent += `\ntauri.android.versionCode=${newVersionCode}`;
}

const nameMatch = propsContent.match(/tauri\.android\.versionName=.+/);
if (nameMatch) {
    propsContent = propsContent.replace(/tauri\.android\.versionName=.+/, `tauri.android.versionName=${newVersion}`);
} else {
    propsContent += `\ntauri.android.versionName=${newVersion}`;
}

fs.writeFileSync(tauriPropsPath, propsContent);
console.log(`Updated Android tauri.properties to Code: ${newVersionCode}, Name: ${newVersion}`);

// 4. Git Commit (Optional, strictly for version bump)
// execSync(`git add . && git commit -m "chore: bump version to ${newVersion}"`);
