const fs = require('fs');
const path = require('path');
const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const soundsDir = path.join(__dirname, '../public/assets/sounds');

fs.readdir(soundsDir, (err, files) => {
    if (err) throw err;

    files.forEach(file => {
        if (file.endsWith('.wav')) {
            const inputPath = path.join(soundsDir, file);
            const outputPath = path.join(soundsDir, file.replace('.wav', '.mp3'));

            ffmpeg(inputPath)
                .toFormat('mp3')
                .on('end', () => {
                    console.log(`Converted ${file} to mp3`);
                    fs.unlinkSync(inputPath); // remove wav
                })
                .on('error', (err) => {
                    console.error(`Error converting ${file}:`, err);
                })
                .save(outputPath);
        }
    });
});
