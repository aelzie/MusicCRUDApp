// 3D Studio: your library as vinyl records on a curved shelf, a turntable that plays them,
// and a ring of bars that dances to the music. Song data comes from the JSON API (/api/songs).
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { Player, apiJson } from './player.js';

const $ = (sel) => document.querySelector(sel);
const ui = {
    canvasHost: $('#scene'),
    loading: $('#scene-loading'),
    empty: $('#empty-state'),
    panel: $('#panel'),
    closePanel: $('#close-panel'),
    title: $('#song-title'),
    artist: $('#song-artist'),
    meta: $('#song-meta'),
    noAudio: $('#no-audio'),
    audioName: $('#audio-name'),
    uploadInput: $('#upload-input'),
    uploadLabel: $('#upload-label'),
    removeAudio: $('#remove-audio'),
    playerBox: $('#player'),
    playBtn: $('#play-btn'),
    seek: $('#seek'),
    time: $('#time'),
    modeBtns: Array.from(document.querySelectorAll('[data-mode]')),
    engineBtns: Array.from(document.querySelectorAll('[data-engine]')),
    aiNote: $('#ai-note'),
    status: $('#status'),
    statusBar: $('#status-bar'),
    statusFill: $('#status-fill'),
    editLink: $('#edit-link'),
    deleteBtn: $('#delete-btn'),
    prev: $('#prev-btn'),
    next: $('#next-btn'),
    toast: $('#toast'),
};

const player = new Player();
let songs = [];
let records = [];          // { song, group, disc, label }
let selected = null;       // record object
let hovered = null;
let scroll = 0;            // carousel position (record index at the center)
let scrollTarget = 0;
let aiAvailable = false;
let firstBuild = true;

// ---------- Scene setup ----------
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.outputColorSpace = THREE.SRGBColorSpace;
ui.canvasHost.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0d0a1a);
scene.fog = new THREE.Fog(0x0d0a1a, 12, 26);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
camera.position.set(0, 4.2, 9.5);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 1, 0);
controls.enableDamping = true;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 14;
controls.minPolarAngle = 0.5;
controls.maxPolarAngle = 1.45;

scene.add(new THREE.HemisphereLight(0x9a8cff, 0x1a1030, 0.9));
const keyLight = new THREE.SpotLight(0xffffff, 60, 20, 0.6, 0.5, 1.5);
keyLight.position.set(2, 8, 5);
keyLight.target.position.set(0, 0, 1.5);
keyLight.castShadow = true;
keyLight.shadow.mapSize.set(1024, 1024);
scene.add(keyLight, keyLight.target);
const pulseLights = [
    new THREE.PointLight(0xff3d7f, 0, 12),
    new THREE.PointLight(0x3dd2ff, 0, 12),
];
pulseLights[0].position.set(-4, 2.5, 3);
pulseLights[1].position.set(4, 2.5, 3);
scene.add(...pulseLights);
const shelfLight = new THREE.SpotLight(0xffe6c7, 45, 16, 0.75, 0.6, 1.2);
shelfLight.position.set(0, 6, 4);
shelfLight.target.position.set(0, 1.2, -2.8);
scene.add(shelfLight, shelfLight.target);

// Floor with a soft glow in the middle
const floorTex = radialTexture('#2a1d55', '#0d0a1a');
const floor = new THREE.Mesh(
    new THREE.CircleGeometry(30, 64),
    new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.85 }));
floor.rotation.x = -Math.PI / 2;
floor.receiveShadow = true;
scene.add(floor);

// ---------- Turntable ----------
const TT_POS = new THREE.Vector3(0, 0, 2.2);
const turntable = new THREE.Group();
turntable.position.copy(TT_POS);
scene.add(turntable);

const base = new THREE.Mesh(
    new THREE.BoxGeometry(2.6, 0.4, 2.0),
    new THREE.MeshStandardMaterial({ color: 0x2b2238, roughness: 0.45, metalness: 0.2 }));
base.position.y = 0.2;
base.castShadow = base.receiveShadow = true;
turntable.add(base);

const platter = new THREE.Mesh(
    new THREE.CylinderGeometry(0.9, 0.9, 0.08, 64),
    new THREE.MeshStandardMaterial({ color: 0x8a8a96, metalness: 0.8, roughness: 0.3 }));
platter.position.set(-0.25, 0.44, 0);
platter.castShadow = true;
turntable.add(platter);

const PLATTER_TOP = new THREE.Vector3().copy(TT_POS).add(new THREE.Vector3(-0.25, 0.5, 0));

// Tonearm: pivot at the back-right corner
const armPivot = new THREE.Group();
armPivot.position.set(0.95, 0.5, -0.65);
turntable.add(armPivot);
const armMat = new THREE.MeshStandardMaterial({ color: 0xd8d8e0, metalness: 0.9, roughness: 0.25 });
const arm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 1.25, 12), armMat);
arm.rotation.x = Math.PI / 2;
arm.position.z = 0.62;
armPivot.add(arm);
const headshell = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.05, 0.2), armMat);
headshell.position.set(0, -0.02, 1.27);
armPivot.add(headshell);
const ARM_REST = 0.15, ARM_PLAY = -0.42;
armPivot.rotation.y = ARM_REST;

// ---------- Visualizer ring ----------
const BAR_COUNT = 64;
const bars = [];
const barGeo = new THREE.BoxGeometry(0.09, 1, 0.09);
barGeo.translate(0, 0.5, 0); // grow upward from the floor
for (let i = 0; i < BAR_COUNT; i++) {
    const angle = (i / BAR_COUNT) * Math.PI * 2;
    const color = new THREE.Color().setHSL(i / BAR_COUNT, 0.85, 0.55);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.6, roughness: 0.4 });
    const bar = new THREE.Mesh(barGeo, mat);
    bar.position.set(TT_POS.x + Math.cos(angle) * 2.5, 0, TT_POS.z + Math.sin(angle) * 2.15);
    bar.scale.y = 0.04;
    scene.add(bar);
    bars.push(bar);
}

// ---------- Records on the shelf ----------
const SHELF_CENTER = new THREE.Vector3(0, 0, 2.2);
const SHELF_RADIUS = 5.0;
const SPACING = 0.27;          // radians between records
const VISIBLE_ARC = 1.05;      // records beyond this angle fade away

const shelf = new THREE.Mesh(
    new THREE.CylinderGeometry(SHELF_RADIUS + 0.5, SHELF_RADIUS + 0.5, 0.3, 96, 1, true, Math.PI - VISIBLE_ARC - 0.2, 2 * (VISIBLE_ARC + 0.2)),
    new THREE.MeshStandardMaterial({ color: 0x3a2b5c, side: THREE.DoubleSide, roughness: 0.6 }));
shelf.position.set(SHELF_CENTER.x, 0.15, SHELF_CENTER.z);
scene.add(shelf);

const grooveTex = grooveTexture();
const discGeo = new THREE.CylinderGeometry(0.75, 0.75, 0.03, 64);
const labelGeo = new THREE.CircleGeometry(0.26, 48);

function makeRecord(song) {
    const group = new THREE.Group();
    const disc = new THREE.Mesh(discGeo, [
        new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.35 }),                 // edge
        new THREE.MeshStandardMaterial({ map: grooveTex, roughness: 0.3, metalness: 0.2 }),   // top
        new THREE.MeshStandardMaterial({ map: grooveTex, roughness: 0.3, metalness: 0.2 }),   // bottom
    ]);
    disc.castShadow = true;
    group.add(disc);

    const labelMat = new THREE.MeshStandardMaterial({ map: labelTexture(song), roughness: 0.6 });
    const front = new THREE.Mesh(labelGeo, labelMat);
    front.rotation.x = -Math.PI / 2;
    front.position.y = 0.017;
    const back = new THREE.Mesh(labelGeo, labelMat);
    back.rotation.x = Math.PI / 2;
    back.position.y = -0.017;
    group.add(front, back);

    group.userData.record = true;
    disc.userData.owner = front.userData.owner = back.userData.owner = group;
    scene.add(group);
    return { song, group, disc, spin: 0, lift: 0 };
}

function shelfTransform(index) {
    const angle = (index - scroll) * SPACING;
    const pos = new THREE.Vector3(
        SHELF_CENTER.x + Math.sin(angle) * SHELF_RADIUS,
        1.25,
        SHELF_CENTER.z - Math.cos(angle) * SHELF_RADIUS);
    // Stand the disc upright, facing the turntable.
    const quat = new THREE.Quaternion()
        .setFromEuler(new THREE.Euler(Math.PI / 2, 0, 0))
        .premultiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -angle));
    return { pos, quat, angle };
}

function rebuildRecords() {
    records.forEach((r) => {
        scene.remove(r.group);
        r.group.traverse((o) => o.material && [].concat(o.material).forEach((m) => m.map !== grooveTex && m.map?.dispose()));
    });
    records = songs.map(makeRecord);
    ui.empty.hidden = songs.length > 0;
    if (selected) {
        selected = records.find((r) => r.song.id === selected.song.id) || null;
        if (!selected) closePanel();
    }
    if (firstBuild) {
        scrollTarget = scroll = Math.floor((songs.length - 1) / 2); // start with the shelf centered
        firstBuild = false;
    }
    scrollTarget = Math.min(scrollTarget, Math.max(0, songs.length - 1));
    records.forEach((r, i) => {
        const t = shelfTransform(i);
        r.group.position.copy(t.pos);
        r.group.quaternion.copy(t.quat);
    });
}

// ---------- Interaction ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
let downAt = null;

function pick(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects(records.map((r) => r.group), true);
    const owner = hits.find((h) => h.object.userData.owner)?.object.userData.owner;
    return owner ? records.find((r) => r.group === owner) : null;
}

renderer.domElement.addEventListener('pointermove', (e) => {
    hovered = pick(e);
    renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
});
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
    // Treat it as a click only if the mouse barely moved (otherwise the user was orbiting).
    if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 6) return;
    const rec = pick(e);
    if (rec) select(rec);
});

ui.prev.addEventListener('click', () => moveCarousel(-1));
ui.next.addEventListener('click', () => moveCarousel(1));
window.addEventListener('keydown', (e) => {
    if (e.target.closest('input, textarea, select')) return;
    if (e.key === 'ArrowLeft') moveCarousel(-1);
    if (e.key === 'ArrowRight') moveCarousel(1);
    if (e.key === ' ' && selected) { e.preventDefault(); player.toggle(); }
    if (e.key === 'Escape') closePanel();
});

function moveCarousel(step) {
    scrollTarget = Math.max(0, Math.min(songs.length - 1, Math.round(scrollTarget) + step));
}

async function select(rec) {
    if (selected === rec) return;
    selected = rec;
    scrollTarget = records.indexOf(rec);
    renderPanel();
    ui.panel.hidden = false;
    await player.load(rec.song);
}

function closePanel() {
    player.load(null);
    selected = null;
    ui.panel.hidden = true;
}
ui.closePanel.addEventListener('click', closePanel);

// ---------- Side panel ----------
function renderPanel() {
    if (!selected) return;
    const s = selected.song;
    ui.title.textContent = s.title;
    ui.artist.textContent = s.artist;
    ui.meta.textContent = [s.album, s.year].filter(Boolean).join(' · ');
    ui.editLink.href = `/Music/Edit/${s.id}?returnTo=studio`;
    ui.noAudio.hidden = s.hasAudio;
    ui.playerBox.hidden = !s.hasAudio;
    ui.removeAudio.hidden = !s.hasAudio;
    ui.audioName.textContent = s.hasAudio ? `🎧 ${s.audioName}` : '';
    ui.uploadLabel.textContent = s.hasAudio ? 'Replace audio' : 'Upload audio';
    renderPlayer();
}

function renderPlayer() {
    const ready = !!player.buffers.original;
    ui.playBtn.disabled = !ready || player.busy;
    ui.playBtn.textContent = player.playing ? '❚❚ Pause' : '▶ Play';
    ui.seek.disabled = !ready;
    ui.modeBtns.forEach((b) => {
        b.classList.toggle('active', b.dataset.mode === player.mode);
        b.disabled = !ready || player.busy;
    });
    ui.engineBtns.forEach((b) => {
        b.classList.toggle('active', b.dataset.engine === player.engine);
        b.disabled = player.busy || (b.dataset.engine === 'ai' && !aiAvailable);
    });
    updateTime();
}

function updateTime() {
    const d = player.duration;
    const t = player.currentTime;
    if (document.activeElement !== ui.seek) ui.seek.value = d ? (t / d) * 1000 : 0;
    ui.time.textContent = `${fmt(t)} / ${fmt(d)}`;
}

player.addEventListener('change', renderPlayer);
player.addEventListener('status', (e) => {
    const { text, error, busy, progress } = e.detail;
    ui.status.textContent = text || '';
    ui.status.classList.toggle('error', !!error);
    ui.statusBar.hidden = !busy;
    ui.statusFill.classList.toggle('indeterminate', progress === undefined);
    ui.statusFill.style.width = progress === undefined ? '35%' : `${Math.round(progress * 100)}%`;
    renderPlayer();
});

ui.playBtn.addEventListener('click', () => player.toggle());
ui.seek.addEventListener('input', () => {
    ui.time.textContent = `${fmt((ui.seek.value / 1000) * player.duration)} / ${fmt(player.duration)}`;
});
ui.seek.addEventListener('change', () => {
    player.seek((ui.seek.value / 1000) * player.duration);
    ui.seek.blur();
});
ui.modeBtns.forEach((b) => b.addEventListener('click', () => player.setMode(b.dataset.mode)));
ui.engineBtns.forEach((b) => b.addEventListener('click', () => {
    if (b.dataset.engine === player.engine) return;
    const mode = player.mode;
    player.engine = b.dataset.engine;
    if (mode !== 'original') player.setMode(mode, b.dataset.engine);
    renderPlayer();
}));

ui.uploadInput.addEventListener('change', async () => {
    const file = ui.uploadInput.files[0];
    ui.uploadInput.value = '';
    if (!file || !selected) return;
    const songId = selected.song.id;
    const form = new FormData();
    form.append('file', file);
    ui.status.textContent = `Uploading ${file.name}…`;
    ui.status.classList.remove('error');
    ui.statusBar.hidden = false;
    ui.statusFill.classList.add('indeterminate');
    try {
        const updated = await apiJson(`/api/songs/${songId}/audio`, { method: 'POST', body: form });
        replaceSong(updated);
        ui.status.textContent = 'Uploaded!';
        if (selected && selected.song.id === songId) {
            renderPanel();
            await player.load(updated);
        }
    } catch (err) {
        ui.status.textContent = err.message;
        ui.status.classList.add('error');
    } finally {
        ui.statusBar.hidden = true;
    }
});

ui.removeAudio.addEventListener('click', async () => {
    if (!selected || !confirm(`Remove the audio file from "${selected.song.title}"?`)) return;
    try {
        const updated = await apiJson(`/api/songs/${selected.song.id}/audio`, { method: 'DELETE' });
        replaceSong(updated);
        await player.load(null);
        renderPanel();
        toast('Audio removed.');
    } catch (err) {
        toast(err.message, true);
    }
});

ui.deleteBtn.addEventListener('click', async () => {
    if (!selected) return;
    const { id, title } = selected.song;
    if (!confirm(`Delete "${title}"? Its audio file will be removed too. This can't be undone.`)) return;
    try {
        await apiJson(`/api/songs/${id}`, { method: 'DELETE' });
        closePanel();
        songs = songs.filter((s) => s.id !== id);
        rebuildRecords();
        toast(`"${title}" was deleted.`);
    } catch (err) {
        toast(err.message, true);
    }
});

function replaceSong(updated) {
    const i = songs.findIndex((s) => s.id === updated.id);
    if (i >= 0) songs[i] = updated;
    const rec = records.find((r) => r.song.id === updated.id);
    if (rec) rec.song = updated;
}

let toastTimer;
function toast(text, error = false) {
    ui.toast.textContent = text;
    ui.toast.classList.toggle('error', error);
    ui.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { ui.toast.hidden = true; }, 3500);
}

// ---------- Animation loop ----------
const clock = new THREE.Clock();
const tmpPos = new THREE.Vector3();
const tmpQuat = new THREE.Quaternion();
const flatQuat = new THREE.Quaternion(); // lying flat on the platter
const SPIN_SPEED = (33.33 / 60) * Math.PI * 2; // 33⅓ rpm

function animate() {
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    scroll += (scrollTarget - scroll) * Math.min(1, dt * 6);

    records.forEach((r, i) => {
        if (r === selected) {
            // Fly to the turntable and spin while playing.
            tmpPos.copy(PLATTER_TOP);
            if (player.playing) r.spin += SPIN_SPEED * dt;
            tmpQuat.copy(flatQuat).multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -r.spin));
            r.group.position.lerp(tmpPos, Math.min(1, dt * 5));
            r.group.quaternion.slerp(tmpQuat, Math.min(1, dt * 5));
            r.group.visible = true;
            return;
        }
        const s = shelfTransform(i);
        const target = r === hovered ? 1 : 0;
        r.lift += (target - r.lift) * Math.min(1, dt * 10);
        s.pos.y += r.lift * 0.25;
        r.group.position.lerp(s.pos, Math.min(1, dt * 6));
        r.group.quaternion.slerp(s.quat, Math.min(1, dt * 6));
        r.group.visible = Math.abs(s.angle) < VISIBLE_ARC + 0.15;
        r.group.scale.setScalar(Math.abs(s.angle) < VISIBLE_ARC ? 1 : Math.max(0.01, 1 - (Math.abs(s.angle) - VISIBLE_ARC) * 6));
    });

    platter.rotation.y -= player.playing ? SPIN_SPEED * dt : 0;
    const armTarget = player.playing ? ARM_PLAY : ARM_REST;
    armPivot.rotation.y += (armTarget - armPivot.rotation.y) * Math.min(1, dt * 3);

    // Visualizer: map frequency bins around the ring (mirrored so it's symmetric).
    const levels = player.levels();
    let bass = 0;
    for (let i = 0; i < BAR_COUNT; i++) {
        const mirrored = i < BAR_COUNT / 2 ? i : BAR_COUNT - 1 - i;
        let v;
        if (levels) {
            const bin = Math.floor((mirrored / (BAR_COUNT / 2)) * levels.length * 0.7);
            v = levels[bin] / 255;
            if (mirrored < 4) bass += v / 4;
        } else {
            v = 0.03 + 0.02 * Math.sin(t * 1.5 + i * 0.4); // gentle idle wave
        }
        const bar = bars[i];
        // Bars in front of the turntable stay shorter so they never hide it.
        const front = Math.max(0, Math.sin((i / BAR_COUNT) * Math.PI * 2));
        const maxHeight = 1.5 - front * 0.9;
        bar.scale.y += (Math.max(0.03, v * maxHeight) - bar.scale.y) * Math.min(1, dt * 18);
        bar.material.emissiveIntensity = 0.35 + v * 1.4;
    }
    pulseLights[0].intensity = levels ? 4 + bass * 40 : 0;
    pulseLights[1].intensity = levels ? 4 + bass * 40 : 0;

    if (selected) updateTime();
    controls.update();
    renderer.render(scene, camera);
    requestAnimationFrame(animate);
}

function resize() {
    const { clientWidth: w, clientHeight: h } = ui.canvasHost;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);

// ---------- Textures (drawn with canvas, no image files needed) ----------
function hashHue(text) {
    let h = 0;
    for (const ch of text) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return h % 360;
}

function labelTexture(song) {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const hue = hashHue(song.album || song.title);
    const grad = g.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size / 2);
    grad.addColorStop(0, `hsl(${hue}, 70%, 62%)`);
    grad.addColorStop(1, `hsl(${(hue + 40) % 360}, 75%, 40%)`);
    g.fillStyle = grad;
    g.fillRect(0, 0, size, size);

    g.fillStyle = '#fff';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.shadowColor = 'rgba(0,0,0,0.35)';
    g.shadowBlur = 6;
    g.font = 'bold 50px system-ui, sans-serif';
    wrapText(g, song.title, size / 2, size * 0.3, size * 0.78, 54, 2);
    g.font = '38px system-ui, sans-serif';
    wrapText(g, song.artist, size / 2, size * 0.72, size * 0.7, 42, 1);
    if (song.year) {
        g.font = '30px system-ui, sans-serif';
        g.fillText(String(song.year), size / 2, size * 0.84);
    }
    g.shadowBlur = 0;
    g.fillStyle = '#111';
    g.beginPath();
    g.arc(size / 2, size / 2, 16, 0, Math.PI * 2);
    g.fill();

    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = 4;
    return tex;
}

function wrapText(g, text, x, y, maxWidth, lineHeight, maxLines) {
    const words = String(text).split(/\s+/);
    const lines = [];
    let line = '';
    for (const word of words) {
        const test = line ? `${line} ${word}` : word;
        if (g.measureText(test).width > maxWidth && line) {
            lines.push(line);
            line = word;
        } else {
            line = test;
        }
    }
    if (line) lines.push(line);
    if (lines.length > maxLines) {
        lines.length = maxLines;
        let last = lines[maxLines - 1];
        while (g.measureText(last + '…').width > maxWidth && last.length > 1) last = last.slice(0, -1);
        lines[maxLines - 1] = last + '…';
    }
    const startY = y - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((l, i) => g.fillText(l, x, startY + i * lineHeight));
}

function grooveTexture() {
    const size = 512;
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#0b0b0d';
    g.fillRect(0, 0, size, size);
    for (let r = size * 0.18; r < size / 2; r += 2.2) {
        g.strokeStyle = `rgba(255,255,255,${0.025 + Math.random() * 0.04})`;
        g.lineWidth = 1;
        g.beginPath();
        g.arc(size / 2, size / 2, r, 0, Math.PI * 2);
        g.stroke();
    }
    // A faint highlight band gives the vinyl its shine.
    const shine = g.createLinearGradient(0, 0, size, size);
    shine.addColorStop(0.35, 'rgba(255,255,255,0)');
    shine.addColorStop(0.5, 'rgba(255,255,255,0.08)');
    shine.addColorStop(0.65, 'rgba(255,255,255,0)');
    g.fillStyle = shine;
    g.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function radialTexture(inner, outer) {
    const c = document.createElement('canvas');
    c.width = c.height = 512;
    const g = c.getContext('2d');
    const grad = g.createRadialGradient(256, 256, 10, 256, 256, 256);
    grad.addColorStop(0, inner);
    grad.addColorStop(1, outer);
    g.fillStyle = grad;
    g.fillRect(0, 0, 512, 512);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
}

function fmt(seconds) {
    if (!isFinite(seconds) || seconds < 0) seconds = 0;
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
}

// ---------- Start ----------
async function init() {
    resize();
    animate();
    try {
        songs = await apiJson('/api/songs');
        rebuildRecords();
        // Open a song straight away if the URL asks for one (e.g. after editing).
        const wanted = Number(new URLSearchParams(location.search).get('song'));
        const rec = records.find((r) => r.song.id === wanted);
        if (rec) select(rec);
    } catch (err) {
        toast(`Couldn't load your songs: ${err.message}`, true);
    } finally {
        ui.loading.hidden = true;
    }

    try {
        const status = await apiJson('/api/karaoke/status');
        aiAvailable = status.available;
        ui.aiNote.textContent = status.message;
    } catch {
        ui.aiNote.textContent = 'AI karaoke status unavailable.';
    }
    renderPlayer();
}

// Exposed for automated tests and debugging in the browser console.
window.studio = { player, get songs() { return songs; }, get selected() { return selected?.song ?? null }, select: (id) => {
    const rec = records.find((r) => r.song.id === id);
    if (rec) return select(rec);
} };

init();
