// In-browser karaoke: splits a stereo song into "vocals" and "instrumental" without any server.
//
// How it works: lead vocals are almost always mixed dead-center, so they sound identical in the
// left and right speakers. We cut the song into short overlapping slices (an STFT), and for every
// frequency in every slice we measure how similar the left and right channels are. Sound that is
// the same on both sides (and in the voice's frequency range) goes to the vocal track; everything
// else stays in the instrumental. Bass is kept in the instrumental because it's usually centered too.
//
// Limits: needs a stereo file; other centered instruments (kick, snare) leak into the vocals.
// For cleaner results, use the AI (Demucs) option.

const FRAME = 4096;               // samples per slice (~93 ms at 44.1 kHz)
const HOP = FRAME / 4;            // 75% overlap
const VOCAL_LOW_HZ = 120;         // below this, sound always stays in the instrumental
const VOCAL_HIGH_HZ = 9000;
const SIMILARITY_START = 0.72;    // L/R similarity where a bin starts counting as "vocal"
const SMOOTHING = 0.45;           // how much each mask value carries over to the next slice

self.onmessage = (event) => {
    const { left, right, sampleRate } = event.data;
    try {
        if (isMono(left, right)) {
            self.postMessage({ type: 'mono' });
            return;
        }
        const result = separate(left, right, sampleRate);
        self.postMessage({ type: 'done', ...result },
            [result.vocals.buffer, result.instLeft.buffer, result.instRight.buffer]);
    } catch (err) {
        self.postMessage({ type: 'error', message: String(err && err.message || err) });
    }
};

function isMono(left, right) {
    if (!right || left === right) return true;
    let diff = 0, total = 0;
    for (let i = 0; i < left.length; i += 7) {
        diff += Math.abs(left[i] - right[i]);
        total += Math.abs(left[i]) + Math.abs(right[i]);
    }
    return total === 0 || diff / total < 0.002;
}

function separate(left, right, sampleRate) {
    const n = left.length;
    const N = FRAME;
    const half = N / 2;
    const fft = createFFT(N);

    // Hann window, applied on analysis and synthesis; at 75% overlap the squared windows sum to 1.5.
    const win = new Float64Array(N);
    for (let i = 0; i < N; i++) win[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / N);
    const norm = 1 / 1.5;

    const lowBin = Math.max(1, Math.floor((VOCAL_LOW_HZ * N) / sampleRate));
    const highBin = Math.min(half - 1, Math.ceil((VOCAL_HIGH_HZ * N) / sampleRate));

    // Pad so the first and last slices are complete.
    const padded = n + 2 * N;
    const outVocals = new Float32Array(padded);
    const outL = new Float32Array(padded);
    const outR = new Float32Array(padded);

    const re = new Float64Array(N), im = new Float64Array(N);
    const iL_re = new Float64Array(N), iL_im = new Float64Array(N); // instrumental, packed L + iR
    const v_re = new Float64Array(N), v_im = new Float64Array(N);   // vocals
    const mask = new Float64Array(half + 1);

    const frames = Math.ceil((n + N) / HOP);
    let lastReport = 0;

    for (let f = 0; f < frames; f++) {
        const start = f * HOP - N; // position in the original signal (can be negative)

        // Pack two real signals in one complex FFT: z = left + i*right.
        for (let i = 0; i < N; i++) {
            const idx = start + i;
            const inRange = idx >= 0 && idx < n;
            re[i] = inRange ? left[idx] * win[i] : 0;
            im[i] = inRange ? right[idx] * win[i] : 0;
        }
        fft(re, im, false);

        for (let k = 0; k <= half; k++) {
            const nk = (N - k) % N;
            // Unpack: L[k] = (Z[k] + conj(Z[N-k])) / 2,  R[k] = (Z[k] - conj(Z[N-k])) / 2i
            const Lr = 0.5 * (re[k] + re[nk]);
            const Li = 0.5 * (im[k] - im[nk]);
            const Rr = 0.5 * (im[k] + im[nk]);
            const Ri = -0.5 * (re[k] - re[nk]);

            let m = 0;
            if (k >= lowBin && k <= highBin) {
                const powL = Lr * Lr + Li * Li;
                const powR = Rr * Rr + Ri * Ri;
                const total = powL + powR;
                if (total > 1e-12) {
                    // 1.0 when L and R are identical; lower when they differ in level or phase.
                    const similarity = (2 * (Lr * Rr + Li * Ri)) / total;
                    const raw = Math.min(1, Math.max(0, (similarity - SIMILARITY_START) / (1 - SIMILARITY_START)));
                    m = raw * raw;
                }
            }
            m = SMOOTHING * mask[k] + (1 - SMOOTHING) * m;
            mask[k] = m;

            // Vocal = masked center; instrumental = original minus that vocal.
            const Cr = 0.5 * (Lr + Rr) * m;
            const Ci = 0.5 * (Li + Ri) * m;
            const ILr = Lr - Cr, ILi = Li - Ci;
            const IRr = Rr - Cr, IRi = Ri - Ci;

            // Pack instrumental for one inverse FFT: Y = IL + i*IR (both have Hermitian spectra).
            iL_re[k] = ILr - IRi;
            iL_im[k] = ILi + IRr;
            v_re[k] = Cr;
            v_im[k] = Ci;
            if (k > 0 && k < half) {
                // Mirror bin N-k: conj(IL) + i*conj(IR)
                iL_re[N - k] = ILr + IRi;
                iL_im[N - k] = -ILi + IRr;
                v_re[N - k] = Cr;
                v_im[N - k] = -Ci;
            }
        }

        fft(iL_re, iL_im, true);
        fft(v_re, v_im, true);

        for (let i = 0; i < N; i++) {
            const pos = start + i + N; // shift into padded buffer
            const w = win[i] * norm;
            outL[pos] += iL_re[i] * w;
            outR[pos] += iL_im[i] * w;
            outVocals[pos] += v_re[i] * w;
        }

        if (f - lastReport > frames / 100) {
            lastReport = f;
            self.postMessage({ type: 'progress', value: f / frames });
        }
    }

    return {
        vocals: outVocals.slice(N, N + n),
        instLeft: outL.slice(N, N + n),
        instRight: outR.slice(N, N + n),
    };
}

// Iterative radix-2 FFT (in place). inverse = true also divides by N.
function createFFT(N) {
    const levels = Math.log2(N);
    if (!Number.isInteger(levels)) throw new Error('FFT size must be a power of 2');
    const cos = new Float64Array(N / 2), sin = new Float64Array(N / 2);
    for (let i = 0; i < N / 2; i++) {
        cos[i] = Math.cos((2 * Math.PI * i) / N);
        sin[i] = Math.sin((2 * Math.PI * i) / N);
    }
    const rev = new Uint32Array(N);
    for (let i = 0; i < N; i++) {
        let r = 0;
        for (let b = 0, x = i; b < levels; b++, x >>= 1) r = (r << 1) | (x & 1);
        rev[i] = r;
    }

    return function fft(re, im, inverse) {
        for (let i = 0; i < N; i++) {
            const j = rev[i];
            if (j > i) {
                let t = re[i]; re[i] = re[j]; re[j] = t;
                t = im[i]; im[i] = im[j]; im[j] = t;
            }
        }
        const sign = inverse ? 1 : -1;
        for (let size = 2; size <= N; size <<= 1) {
            const halfSize = size >> 1;
            const step = N / size;
            for (let i = 0; i < N; i += size) {
                for (let j = 0, k = 0; j < halfSize; j++, k += step) {
                    const a = i + j, b = a + halfSize;
                    // Twiddle factor w = e^(sign * 2πik/N)
                    const wr = cos[k], wi = sign * sin[k];
                    const xr = re[b] * wr - im[b] * wi;
                    const xi = re[b] * wi + im[b] * wr;
                    re[b] = re[a] - xr; im[b] = im[a] - xi;
                    re[a] += xr; im[a] += xi;
                }
            }
        }
        if (inverse) {
            for (let i = 0; i < N; i++) { re[i] /= N; im[i] /= N; }
        }
    };
}
