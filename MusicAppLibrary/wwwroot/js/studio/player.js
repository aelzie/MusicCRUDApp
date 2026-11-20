// Audio engine for the 3D studio: plays a song, switches between Original / Instrumental / Vocals
// without losing your place, and feeds the 3D visualizer.

export const MODES = { original: 'Original', instrumental: 'Instrumental', vocals: 'Vocals only' };

export class Player extends EventTarget {
    constructor() {
        super();
        this.ctx = null;
        this.analyser = null;
        this.freqData = new Uint8Array(0);
        this.songId = null;
        this.buffers = {};            // original, quick:instrumental, quick:vocals, ai:instrumental, ai:vocals
        this.mode = 'original';
        this.engine = 'quick';        // 'quick' (in browser) or 'ai' (Demucs on the server)
        this.source = null;
        this.playing = false;
        this.startedAt = 0;           // ctx time when playback (re)started
        this.offset = 0;              // song position at startedAt
        this.loadToken = 0;
        this.busy = false;
    }

    // Browsers only allow audio after a click, so the context is created lazily.
    ensureContext() {
        if (!this.ctx) {
            const Ctx = window.AudioContext || window.webkitAudioContext;
            this.ctx = new Ctx();
            this.gain = this.ctx.createGain();
            this.analyser = this.ctx.createAnalyser();
            this.analyser.fftSize = 256;
            this.analyser.smoothingTimeConstant = 0.78;
            this.freqData = new Uint8Array(this.analyser.frequencyBinCount);
            this.gain.connect(this.analyser);
            this.analyser.connect(this.ctx.destination);
        }
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return this.ctx;
    }

    emit(type, detail = {}) {
        this.dispatchEvent(new CustomEvent(type, { detail }));
    }

    get duration() {
        return this.buffers.original ? this.buffers.original.duration : 0;
    }

    get currentTime() {
        if (!this.playing) return this.offset;
        const t = this.offset + (this.ctx.currentTime - this.startedAt);
        return Math.min(t, this.duration);
    }

    async load(song) {
        this.stop();
        this.buffers = {};
        this.offset = 0;
        this.mode = 'original';
        this.songId = song ? song.id : null;
        const token = ++this.loadToken;
        if (!song || !song.audioUrl) {
            this.emit('change');
            return false;
        }

        this.emit('status', { text: 'Loading audio…', busy: true });
        try {
            const ctx = this.ensureContext();
            const response = await fetch(song.audioUrl);
            if (!response.ok) throw new Error('The audio file could not be loaded.');
            const data = await response.arrayBuffer();
            const buffer = await ctx.decodeAudioData(data);
            if (token !== this.loadToken) return false; // another song was picked meanwhile
            this.buffers.original = buffer;
            this.emit('status', { text: '' });
            this.emit('change');
            return true;
        } catch (err) {
            if (token === this.loadToken) {
                this.emit('status', { text: 'This audio file couldn’t be played. Try uploading an MP3 or WAV.', error: true });
                this.emit('change');
            }
            return false;
        }
    }

    play() {
        if (!this.buffers.original || this.busy) return;
        this.ensureContext();
        if (this.offset >= this.duration - 0.05) this.offset = 0;
        this.startSource(this.offset);
        this.playing = true;
        this.emit('change');
    }

    pause() {
        if (!this.playing) return;
        this.offset = this.currentTime;
        this.stopSource();
        this.playing = false;
        this.emit('change');
    }

    toggle() {
        this.playing ? this.pause() : this.play();
    }

    stop() {
        this.stopSource();
        this.playing = false;
        this.offset = 0;
    }

    seek(seconds) {
        const t = Math.max(0, Math.min(seconds, this.duration));
        if (this.playing) {
            this.startSource(t);
        } else {
            this.offset = t;
        }
        this.emit('change');
    }

    currentBuffer() {
        if (this.mode === 'original') return this.buffers.original;
        return this.buffers[`${this.engine}:${this.mode}`] || this.buffers.original;
    }

    startSource(offset) {
        this.stopSource();
        const src = this.ctx.createBufferSource();
        src.buffer = this.currentBuffer();
        src.connect(this.gain);
        src.onended = () => {
            if (this.source === src) {
                this.playing = false;
                this.offset = this.duration;
                this.emit('change');
                this.emit('ended');
            }
        };
        src.start(0, offset);
        this.source = src;
        this.startedAt = this.ctx.currentTime;
        this.offset = offset;
    }

    stopSource() {
        if (this.source) {
            const src = this.source;
            this.source = null;
            try { src.stop(); } catch { /* already stopped */ }
            src.disconnect();
        }
    }

    /** Switches mode/engine, preparing the karaoke tracks first if needed. Keeps the playback position. */
    async setMode(mode, engine = this.engine) {
        if (!this.buffers.original || this.busy) return;
        const needs = mode !== 'original' && !this.buffers[`${engine}:${mode}`];
        if (needs) {
            const ok = engine === 'ai' ? await this.prepareAi() : await this.prepareQuick();
            if (!ok) {
                this.emit('change');
                return;
            }
        }
        const position = this.currentTime;
        this.mode = mode;
        this.engine = engine;
        if (this.playing) this.startSource(position);
        this.emit('change');
    }

    // ---- Quick karaoke: separation runs in a Web Worker in this browser ----
    prepareQuick() {
        const original = this.buffers.original;
        const token = this.loadToken;
        this.busy = true;
        this.emit('status', { text: 'Separating vocals in your browser…', busy: true, progress: 0 });

        return new Promise((resolve) => {
            const worker = new Worker('/js/studio/karaoke-worker.js');
            const left = original.getChannelData(0).slice();
            const right = original.numberOfChannels > 1 ? original.getChannelData(1).slice() : null;

            const finish = (ok, status) => {
                worker.terminate();
                this.busy = false;
                this.emit('status', status);
                resolve(ok && token === this.loadToken);
            };

            worker.onmessage = (event) => {
                const msg = event.data;
                if (msg.type === 'progress') {
                    this.emit('status', { text: 'Separating vocals in your browser…', busy: true, progress: msg.value });
                } else if (msg.type === 'mono') {
                    finish(false, {
                        text: 'This file is mono, so quick karaoke can’t find the vocals. Try the AI option instead.',
                        error: true,
                    });
                } else if (msg.type === 'error') {
                    finish(false, { text: `Karaoke failed: ${msg.message}`, error: true });
                } else if (msg.type === 'done') {
                    if (token === this.loadToken) {
                        const { sampleRate, length } = original;
                        const vocals = this.ctx.createBuffer(2, length, sampleRate);
                        vocals.copyToChannel(msg.vocals, 0);
                        vocals.copyToChannel(msg.vocals, 1);
                        const inst = this.ctx.createBuffer(2, length, sampleRate);
                        inst.copyToChannel(msg.instLeft, 0);
                        inst.copyToChannel(msg.instRight, 1);
                        this.buffers['quick:vocals'] = vocals;
                        this.buffers['quick:instrumental'] = inst;
                    }
                    finish(true, { text: 'Karaoke tracks ready (quick mode).' });
                }
            };
            worker.onerror = () => finish(false, { text: 'Karaoke failed to start in this browser.', error: true });

            const transfer = right ? [left.buffer, right.buffer] : [left.buffer];
            worker.postMessage({ left, right, sampleRate: original.sampleRate }, transfer);
        });
    }

    // ---- AI karaoke: Demucs runs on the server; we poll until the stems are ready ----
    async prepareAi() {
        const songId = this.songId;
        const token = this.loadToken;
        this.busy = true;
        this.emit('status', { text: 'Starting AI separation…', busy: true });

        try {
            let status = await apiJson(`/api/songs/${songId}/karaoke`, { method: 'POST' });
            while (status.state === 'queued' || status.state === 'running') {
                this.emit('status', { text: status.message || 'Separating with AI…', busy: true });
                await new Promise((r) => setTimeout(r, 3000));
                if (token !== this.loadToken) return false;
                status = await apiJson(`/api/songs/${songId}/karaoke`);
            }
            if (status.state !== 'done') {
                throw new Error(status.message || 'AI separation failed.');
            }

            this.emit('status', { text: 'Downloading AI tracks…', busy: true });
            const [inst, vocals] = await Promise.all(
                ['instrumental', 'vocals'].map(async (stem) => {
                    const res = await fetch(`/api/songs/${songId}/karaoke/${stem}`);
                    if (!res.ok) throw new Error('Could not download the AI tracks.');
                    return this.ctx.decodeAudioData(await res.arrayBuffer());
                }));
            if (token !== this.loadToken) return false;
            this.buffers['ai:instrumental'] = inst;
            this.buffers['ai:vocals'] = vocals;
            this.emit('status', { text: 'Karaoke tracks ready (AI mode).' });
            return true;
        } catch (err) {
            this.emit('status', { text: err.message, error: true });
            return false;
        } finally {
            this.busy = false;
        }
    }

    /** Frequency levels 0–1 for the visualizer (all zeros when nothing is playing). */
    levels() {
        if (!this.analyser || !this.playing) return null;
        this.analyser.getByteFrequencyData(this.freqData);
        return this.freqData;
    }
}

export function csrfToken() {
    return document.querySelector('meta[name="csrf-token"]')?.content || '';
}

/** fetch() wrapper for the JSON API. Adds the anti-forgery token and turns errors into readable messages. */
export async function apiJson(url, options = {}) {
    const headers = { 'X-CSRF-TOKEN': csrfToken(), ...(options.headers || {}) };
    if (options.json !== undefined) {
        headers['Content-Type'] = 'application/json';
        options.body = JSON.stringify(options.json);
    }
    const res = await fetch(url, { ...options, headers });
    if (res.status === 204) return null;
    let body = null;
    try { body = await res.json(); } catch { /* not JSON */ }
    if (!res.ok) {
        const firstError = body && body.errors && Object.values(body.errors).flat()[0];
        throw new Error(firstError || (body && (body.message || body.title)) || `Request failed (${res.status}).`);
    }
    return body;
}
