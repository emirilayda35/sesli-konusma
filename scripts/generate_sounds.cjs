const fs = require('fs');
const { WaveFile } = require('wavefile');

const sampleRate = 44100;

// Envelope helper for soft attack/release
function applyEnvelope(samples, attackMs, releaseMs) {
    const attackSamples = (attackMs / 1000) * sampleRate;
    const releaseSamples = (releaseMs / 1000) * sampleRate;
    const totalSamples = samples.length;

    for (let i = 0; i < totalSamples; i++) {
        let env = 1.0;
        if (i < attackSamples) {
            env = i / attackSamples;
        } else if (i > totalSamples - releaseSamples) {
            env = (totalSamples - i) / releaseSamples;
        }
        samples[i] *= env;
    }
    return samples;
}

// Simple oscillator
function generateWave(freqs, durationMs, type = 'sine') {
    const numSamples = Math.floor((durationMs / 1000) * sampleRate);
    const samples = new Float64Array(numSamples);

    freqs.forEach(freq => {
        for (let i = 0; i < numSamples; i++) {
            const t = i / sampleRate;
            let val = 0;
            if (type === 'sine') val = Math.sin(2 * Math.PI * freq * t);
            if (type === 'square') val = Math.sign(Math.sin(2 * Math.PI * freq * t)) * 0.3;
            if (type === 'triangle') val = 2 * Math.abs(2 * (t * freq - Math.floor(t * freq + 0.5))) - 1;

            samples[i] += val * 0.5; // Mix down
        }
    });

    return samples;
}

// Combine segments (e.g. for a sequence of notes)
function mixAndScale(segments) {
    let totalLen = segments.reduce((acc, s) => acc + s.length, 0);
    const out = new Float64Array(totalLen);
    let offset = 0;

    segments.forEach(seg => {
        out.set(seg, offset);
        offset += seg.length;
    });

    // Convert to 16-bit PCM
    const pcm = new Int16Array(totalLen);
    for (let i = 0; i < totalLen; i++) {
        let s = Math.max(-1, Math.min(1, out[i]));
        pcm[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }
    return pcm;
}

function saveWav(filename, pcm) {
    const wav = new WaveFile();
    wav.fromScratch(1, sampleRate, '16', pcm);
    fs.writeFileSync(filename, wav.toBuffer());
    console.log(`Saved ${filename}`);
}

// 1. message_sent (Short soft pop, high pitch)
const msnt = applyEnvelope(generateWave([880, 1760], 100, 'sine'), 10, 50);
saveWav('./public/assets/sounds/message_sent.wav', mixAndScale([msnt]));

// 2. notification (message received) - classic two-tone (e.g. A5 to E6)
const n1 = applyEnvelope(generateWave([880], 100, 'sine'), 10, 50);
const n2 = applyEnvelope(generateWave([1318.51], 150, 'sine'), 10, 100);
saveWav('./public/assets/sounds/notification.wav', mixAndScale([n1, n2]));

// 3. join (Low to High rising arpeggio)
const j1 = applyEnvelope(generateWave([440], 100, 'sine'), 30, 30);
const j2 = applyEnvelope(generateWave([554.37], 100, 'sine'), 30, 30);
const j3 = applyEnvelope(generateWave([659.25], 200, 'sine'), 30, 150);
saveWav('./public/assets/sounds/join.wav', mixAndScale([j1, j2, j3]));

// 4. call_start (gentle phone ring / connecting sound)
const cs1 = applyEnvelope(generateWave([440, 480], 400, 'sine'), 50, 200);
saveWav('./public/assets/sounds/call_start.wav', mixAndScale([cs1]));

// 5. click (very short interface tick)
const tick = applyEnvelope(generateWave([1200], 30, 'triangle'), 5, 20);
saveWav('./public/assets/sounds/click.wav', mixAndScale([tick]));

console.log("Done generating all UI sounds.");
