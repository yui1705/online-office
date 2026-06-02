(() => {
    const canvas = document.getElementById('game');
    const ctx = canvas.getContext('2d');
    const angleInput = document.getElementById('angle');
    const powerInput = document.getElementById('power');
    const angleValue = document.getElementById('angle-value');
    const powerValue = document.getElementById('power-value');
    const fireButton = document.getElementById('fire-button');
    const newButton = document.getElementById('new-button');
    const soloButton = document.getElementById('solo-button');
    const onlineButton = document.getElementById('online-button');
    const createRoomButton = document.getElementById('create-room-button');
    const joinRoomButton = document.getElementById('join-room-button');
    const roomTools = document.getElementById('room-tools');
    const roomCard = document.getElementById('room-card');
    const roomCodeInput = document.getElementById('room-code-input');
    const roomCodeEl = document.getElementById('room-code');
    const roomMessage = document.getElementById('room-message');
    const playerLabel = document.getElementById('player-label');
    const scoreRow = document.getElementById('score-row');
    const turnBadge = document.getElementById('turn-badge');
    const windLabel = document.getElementById('wind-label');
    const windIndicator = document.getElementById('wind-indicator');
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlayText = document.getElementById('overlay-text');

    const WIDTH = canvas.width;
    const HEIGHT = canvas.height;
    const TANK_W = 42;
    const TANK_H = 18;
    const GRAVITY = 0.145;
    const MAX_PLAYERS = 10;
    const ROOM_COLL = 'scorched-rooms';
    const COLORS = ['#61d394', '#ff7d7d', '#7eb6ff', '#ffd166', '#c891ff', '#62d6d6', '#ff9f66', '#a4d65e', '#f78bd3', '#c7d0d9'];
    const SKY_TOP = '#9de1ff';
    const SKY_BOTTOM = '#d8f2ff';

    const initializeFirebase = () => {
        if (!window.firebase || typeof window.firebase.firestore !== 'function') return null;
        if (Array.isArray(window.firebase.apps) && window.firebase.apps.length === 0 && window.HYOAM_FIREBASE_CONFIG) {
            window.firebase.initializeApp(window.HYOAM_FIREBASE_CONFIG);
        }
        return Array.isArray(window.firebase.apps) && window.firebase.apps.length > 0
            ? window.firebase.firestore()
            : null;
    };
    const db = initializeFirebase();
    const clientId = localStorage.getItem('scorched-client-id') || crypto.randomUUID();
    localStorage.setItem('scorched-client-id', clientId);

    let terrain = [];
    let tanks = [];
    let current = 0;
    let projectile = null;
    let explosions = [];
    let particles = [];
    let wind = 0;
    let locked = false;
    let gameOver = false;
    let lastTime = 0;
    let mode = 'solo';
    let roomCode = '';
    let unsubscribeRoom = null;
    let localPlayerId = '';
    let syncingRemote = false;
    let activeShotId = '';
    let pendingRoomState = null;
    let cpuTimer = null;

    function startSolo() {
        leaveRoom();
        mode = 'solo';
        localPlayerId = 'local-human';
        roomCard.classList.add('is-hidden');
        roomMessage.textContent = '혼자하기: 컴퓨터와 대결합니다.';
        resetGame(2);
    }

    function showOnlineTools() {
        mode = 'online';
        roomTools.classList.remove('is-hidden');
        roomMessage.textContent = db
            ? '방을 만들거나 코드로 참가하세요. 최대 10명까지 가능합니다.'
            : 'Firebase Hosting 주소에서 열어야 온라인 함께하기를 사용할 수 있습니다.';
    }

    async function createRoom() {
        if (!db) {
            roomMessage.textContent = 'Firebase 연결이 없어 방을 만들 수 없습니다. 인터넷 연결이나 배포 주소를 확인해 주세요.';
            return;
        }

        try {
            leaveRoom(false);
            mode = 'online';
            roomCode = makeRoomCode();
            localPlayerId = clientId;
            terrain = generateTerrain();
            tanks = createTanks(1, [clientId]);
            current = 0;
            wind = randomWind();
            locked = false;
            gameOver = false;
            placeTanks();
            await roomRef().set({
                roomCode,
                terrain,
                tanks,
                current,
                wind,
                locked,
                gameOver,
                shot: null,
                updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
            });
            subscribeRoom();
            showRoomInfo();
        } catch (error) {
            console.error('Create room error:', error);
            roomMessage.textContent = '방 만들기에 실패했습니다. Firestore 권한/연결을 확인해 주세요.';
        }
    }

    async function joinRoom() {
        if (!db) {
            roomMessage.textContent = 'Firebase 연결이 없어 참가할 수 없습니다. 인터넷 연결이나 배포 주소를 확인해 주세요.';
            return;
        }
        const code = roomCodeInput.value.trim().toUpperCase();
        if (!/^[A-Z0-9]{4,6}$/.test(code)) {
            roomMessage.textContent = '방 코드를 확인해 주세요.';
            return;
        }
        try {
            leaveRoom(false);
            mode = 'online';
            roomCode = code;
            localPlayerId = clientId;
            const snap = await roomRef().get();
            if (!snap.exists) {
                roomMessage.textContent = '방을 찾을 수 없습니다.';
                roomCode = '';
                return;
            }
            const data = snap.data();
            if ((data.tanks || []).length >= MAX_PLAYERS && !(data.tanks || []).some(tank => tank.playerId === clientId)) {
                roomMessage.textContent = '이미 10명이 참가한 방입니다.';
                roomCode = '';
                return;
            }

            const nextTanks = data.tanks || [];
            if (!nextTanks.some(tank => tank.playerId === clientId)) {
                const playerIds = [...nextTanks.map(tank => tank.playerId), clientId];
                terrain = data.terrain || generateTerrain();
                tanks = createTanks(playerIds.length, playerIds).map((tank, index) => ({
                    ...tank,
                    hp: nextTanks[index]?.hp ?? 100,
                    angle: nextTanks[index]?.angle ?? 45,
                    power: nextTanks[index]?.power ?? 58
                }));
                placeTanks();
                await roomRef().update({
                    tanks,
                    terrain,
                    updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
                });
            }
            subscribeRoom();
            showRoomInfo();
        } catch (error) {
            console.error('Join room error:', error);
            roomMessage.textContent = '방 참가에 실패했습니다. 코드, 권한, 네트워크 상태를 확인해 주세요.';
        }
    }

    function subscribeRoom() {
        if (!db || !roomCode) return;
        unsubscribeRoom = roomRef().onSnapshot(snapshot => {
            if (!snapshot.exists) return;
            const data = snapshot.data();
            if (data.shot && data.shot.id !== activeShotId && !projectile) {
                startRemoteShot(data.shot);
            }
            if (projectile) {
                pendingRoomState = data.shot ? null : data;
                return;
            }
            applyRoomState(data);
        }, error => {
            console.error('Room sync error:', error);
            roomMessage.textContent = '방 동기화 중 오류가 발생했습니다.';
        });
    }

    function applyRoomState(data) {
        syncingRemote = true;
        terrain = data.terrain || terrain;
        tanks = data.tanks || tanks;
        current = data.current || 0;
        wind = Number(data.wind || 0);
        locked = Boolean(data.locked);
        gameOver = Boolean(data.gameOver);
        activeShotId = data.shot?.id || '';
        const me = getMyTank();
        if (me) angleInput.value = me.angle;
        updateUi();
        draw();
        syncingRemote = false;
    }

    async function publishState(extra = {}) {
        if (!db || mode !== 'online' || !roomCode || syncingRemote) return;
        await roomRef().update({
            terrain,
            tanks,
            current,
            wind,
            locked,
            gameOver,
            ...extra,
            updatedAt: window.firebase.firestore.FieldValue.serverTimestamp()
        });
    }

    function leaveRoom(clear = true) {
        if (unsubscribeRoom) unsubscribeRoom();
        unsubscribeRoom = null;
        if (clear) roomCode = '';
    }

    function roomRef() {
        return db.collection(ROOM_COLL).doc(roomCode);
    }

    function showRoomInfo() {
        roomCard.classList.remove('is-hidden');
        roomCodeEl.textContent = roomCode;
        roomMessage.textContent = '방 코드를 동료 선생님께 알려주세요.';
    }

    function makeRoomCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        let code = '';
        for (let i = 0; i < 5; i += 1) code += chars[Math.floor(Math.random() * chars.length)];
        return code;
    }

    function resetGame(count = Math.max(2, tanks.length || 2)) {
        terrain = generateTerrain();
        const playerIds = mode === 'online'
            ? tanks.map(tank => tank.playerId).filter(Boolean).slice(0, MAX_PLAYERS)
            : Array.from({ length: count }, (_, index) => `local-${index}`);
        tanks = createTanks(Math.max(2, playerIds.length), playerIds);
        current = 0;
        projectile = null;
        explosions = [];
        particles = [];
        activeShotId = '';
        pendingRoomState = null;
        clearCpuTimer();
        wind = randomWind();
        locked = false;
        gameOver = false;
        angleInput.value = 45;
        powerInput.value = 58;
        placeTanks();
        updateUi();
        hideOverlay();
        draw();
        publishState();
        scheduleCpuTurn();
    }

    function createTanks(count, playerIds = []) {
        const actualCount = Math.min(MAX_PLAYERS, Math.max(1, count));
        return Array.from({ length: actualCount }, (_, index) => {
            const margin = 90;
            const x = actualCount === 1
                ? WIDTH / 2
                : margin + (WIDTH - margin * 2) * (index / (actualCount - 1));
            return {
                id: index,
                playerId: playerIds[index] || `local-${index}`,
                name: mode === 'solo'
                    ? (index === 0 ? '선생님' : '컴퓨터')
                    : `Player ${index + 1}`,
                x,
                y: 0,
                angle: index < actualCount / 2 ? 45 : 135,
                power: 58,
                isCpu: mode === 'solo' && index > 0,
                hp: 100,
                color: COLORS[index % COLORS.length]
            };
        });
    }

    function generateTerrain() {
        const data = [];
        const base = HEIGHT * 0.67;
        const seedA = Math.random() * Math.PI * 2;
        const seedB = Math.random() * Math.PI * 2;
        for (let x = 0; x < WIDTH; x += 1) {
            data[x] = Math.round(base + Math.sin(x * 0.012 + seedA) * 42 + Math.sin(x * 0.027 + seedB) * 20 + Math.sin(x * 0.005) * 34);
        }
        smoothTerrain(data, 4);
        return data;
    }

    function smoothTerrain(data, passes) {
        for (let pass = 0; pass < passes; pass += 1) {
            const copy = [...data];
            for (let x = 2; x < WIDTH - 2; x += 1) {
                data[x] = Math.round((copy[x - 2] + copy[x - 1] + copy[x] + copy[x + 1] + copy[x + 2]) / 5);
            }
        }
    }

    function placeTanks() {
        tanks.forEach(tank => {
            tank.y = terrain[Math.round(tank.x)] - TANK_H;
            flattenUnderTank(tank);
            tank.y = terrain[Math.round(tank.x)] - TANK_H;
        });
    }

    function flattenUnderTank(tank) {
        const center = Math.round(tank.x);
        const y = terrain[center];
        for (let x = center - TANK_W / 2 - 5; x <= center + TANK_W / 2 + 5; x += 1) {
            if (terrain[x] !== undefined) terrain[x] = y;
        }
    }

    function randomWind() {
        return Math.round((Math.random() * 2 - 1) * 36) / 10;
    }

    function getMyTank() {
        return tanks.find(tank => tank.playerId === localPlayerId);
    }

    function isMyTurn() {
        if (mode === 'solo') return true;
        if (tanks.length < 2) return false;
        return tanks[current]?.playerId === localPlayerId;
    }

    function isHumanControlTurn() {
        return mode !== 'solo' || !tanks[current]?.isCpu;
    }

    function getTankAimAngle(index) {
        const tank = tanks[index];
        const inputAngle = tank?.angle ?? 45;
        return inputAngle * Math.PI / 180;
    }

    function clearCpuTimer() {
        if (cpuTimer) clearTimeout(cpuTimer);
        cpuTimer = null;
    }

    function scheduleCpuTurn() {
        clearCpuTimer();
        if (mode !== 'solo' || gameOver || locked || projectile || !tanks[current]?.isCpu) return;
        cpuTimer = setTimeout(() => {
            runCpuTurn();
        }, 850);
    }

    function runCpuTurn() {
        const cpu = tanks[current];
        const target = tanks.find(tank => tank.hp > 0 && !tank.isCpu);
        if (!cpu || !target || cpu.hp <= 0 || gameOver || locked || projectile) return;

        const solution = findShotSolution(cpu, target);
        const missAngle = (Math.random() - 0.5) * 8;
        const missPower = (Math.random() - 0.5) * 8;
        cpu.angle = clamp(solution.angle + missAngle, 8, 172);
        const cpuPower = clamp(solution.power + missPower, 22, 100);
        cpu.power = Math.round(cpuPower);
        angleInput.value = Math.round(cpu.angle);
        powerInput.value = cpu.power;
        updateUi();
        fireCurrentTank(cpu.power, 'cpu');
    }

    function findShotSolution(shooter, target) {
        const barrelLength = 31;
        let best = { angle: shooter.x < target.x ? 45 : 135, power: 62, error: Infinity };
        for (let angle = 8; angle <= 172; angle += 2) {
            const rad = angle * Math.PI / 180;
            const muzzleX = shooter.x + Math.cos(rad) * barrelLength;
            const muzzleY = shooter.y - 3 - Math.sin(rad) * barrelLength;
            for (let power = 24; power <= 100; power += 2) {
                const hit = simulateShot(muzzleX, muzzleY, Math.cos(rad) * power * 0.18, -Math.sin(rad) * power * 0.18, target);
                if (hit.error < best.error) best = { angle, power, error: hit.error };
                if (best.error < 18) return best;
            }
        }
        return best;
    }

    function simulateShot(x, y, vx, vy, target) {
        let bestError = Infinity;
        for (let step = 0; step < 420; step += 1) {
            vx += wind * 0.0035;
            vy += GRAVITY;
            x += vx;
            y += vy;
            bestError = Math.min(bestError, Math.hypot(x - target.x, y - target.y));
            const tx = Math.round(x);
            if (tx < -30 || tx > WIDTH + 30 || y > HEIGHT + 40) break;
            if (tx >= 0 && tx < WIDTH && y >= terrain[tx]) break;
        }
        return { error: bestError };
    }

    function clamp(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    async function fire() {
        if (locked || gameOver || projectile || !tanks[current] || !isMyTurn() || !isHumanControlTurn()) return;
        tanks[current].angle = Number(angleInput.value);
        tanks[current].power = Number(powerInput.value);
        await fireCurrentTank(Number(powerInput.value), localPlayerId || 'solo');
    }

    async function fireCurrentTank(power, ownerId) {
        const tank = tanks[current];
        const angle = getTankAimAngle(current);
        const barrelLength = 31;
        const shot = {
            id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
            ownerId,
            x: tank.x + Math.cos(angle) * barrelLength,
            y: tank.y - 3 - Math.sin(angle) * barrelLength,
            vx: Math.cos(angle) * power * 0.18,
            vy: -Math.sin(angle) * power * 0.18
        };
        activeShotId = shot.id;
        projectile = {
            ...shot,
            trail: []
        };
        locked = true;
        fireButton.disabled = true;
        await publishState({ locked: true, shot });
    }

    function startRemoteShot(shot) {
        activeShotId = shot.id;
        projectile = {
            ...shot,
            trail: []
        };
        locked = true;
        fireButton.disabled = true;
    }

    function clearRemoteProjectile() {
        projectile = null;
        activeShotId = '';
        if (pendingRoomState) {
            const nextState = pendingRoomState;
            pendingRoomState = null;
            applyRoomState(nextState);
        }
    }

    function makeVisualExplosion(x, y) {
        explosions.push({ x, y, radius: 2, alpha: 1 });
        createParticles(x, y);
    }

    function update(time = 0) {
        const delta = Math.min(32, time - lastTime || 16);
        lastTime = time;
        if (projectile) updateProjectile(delta / 16);
        updateParticles(delta / 16);
        updateExplosions(delta / 16);
        draw();
        requestAnimationFrame(update);
    }

    function updateProjectile(step) {
        projectile.vx += wind * 0.0035 * step;
        projectile.vy += GRAVITY * step;
        projectile.x += projectile.vx * step;
        projectile.y += projectile.vy * step;
        projectile.trail.push({ x: projectile.x, y: projectile.y });
        if (projectile.trail.length > 34) projectile.trail.shift();

        const x = Math.round(projectile.x);
        const y = Math.round(projectile.y);
        if (x < -30 || x > WIDTH + 30 || y > HEIGHT + 40) {
            if (isAuthoritativeProjectile()) endTurn();
            else clearRemoteProjectile();
            return;
        }
        if (x >= 0 && x < WIDTH && y >= terrain[x]) {
            if (isAuthoritativeProjectile()) {
                explode(projectile.x, projectile.y, 42);
                projectile = null;
                setTimeout(endTurn, 650);
            } else {
                makeVisualExplosion(projectile.x, projectile.y);
                clearRemoteProjectile();
            }
        }
    }

    function isAuthoritativeProjectile() {
        return mode === 'solo' || projectile?.ownerId === localPlayerId;
    }

    function explode(cx, cy, radius) {
        explosions.push({ x: cx, y: cy, radius: 2, alpha: 1 });
        carveTerrain(cx, cy, radius);
        damageTanks(cx, cy, radius);
        dropTanks();
        createParticles(cx, cy);
        updateUi();
    }

    function carveTerrain(cx, cy, radius) {
        const minX = Math.max(0, Math.floor(cx - radius));
        const maxX = Math.min(WIDTH - 1, Math.ceil(cx + radius));
        for (let x = minX; x <= maxX; x += 1) {
            const dx = x - cx;
            const depth = Math.sqrt(Math.max(0, radius * radius - dx * dx));
            const craterY = cy + depth * 0.72;
            if (terrain[x] < craterY && terrain[x] > cy - depth) terrain[x] = Math.min(HEIGHT, Math.round(craterY));
        }
        smoothTerrain(terrain, 1);
    }

    function damageTanks(cx, cy, radius) {
        tanks.forEach(tank => {
            if (tank.hp <= 0) return;
            const dist = Math.hypot(tank.x - cx, tank.y - cy);
            if (dist < radius * 1.8) {
                const damage = Math.max(8, Math.round((1 - dist / (radius * 1.8)) * 58));
                tank.hp = Math.max(0, tank.hp - damage);
                tank.hurtUntil = Date.now() + 1400;
            }
        });
    }

    function dropTanks() {
        tanks.forEach(tank => {
            if (tank.hp <= 0) return;
            tank.y = Math.min(HEIGHT + 40, terrain[Math.round(tank.x)] - TANK_H);
            if (tank.y > HEIGHT) tank.hp = 0;
        });
    }

    function createParticles(cx, cy) {
        for (let i = 0; i < 34; i += 1) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.4 + Math.random() * 4.8;
            particles.push({
                x: cx,
                y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 1.8,
                life: 34 + Math.random() * 28,
                color: Math.random() > 0.45 ? '#8f6b3f' : '#ffd166'
            });
        }
    }

    function updateParticles(step) {
        particles = particles.filter(p => {
            p.vy += GRAVITY * 0.8 * step;
            p.x += p.vx * step;
            p.y += p.vy * step;
            p.life -= step;
            return p.life > 0;
        });
    }

    function updateExplosions(step) {
        explosions = explosions.filter(explosion => {
            explosion.radius += 4.8 * step;
            explosion.alpha -= 0.035 * step;
            return explosion.alpha > 0;
        });
    }

    function nextAliveIndex(from) {
        for (let offset = 1; offset <= tanks.length; offset += 1) {
            const index = (from + offset) % tanks.length;
            if (tanks[index]?.hp > 0) return index;
        }
        return from;
    }

    function endTurn() {
        projectile = null;
        const winner = getWinner();
        if (winner !== null) {
            gameOver = true;
            locked = true;
            showOverlay(`${tanks[winner].name} 승리`, 'R 또는 새 게임 버튼');
        } else {
            current = nextAliveIndex(current);
            angleInput.value = tanks[current].angle;
            powerInput.value = tanks[current].power;
            wind = randomWind();
            locked = false;
            fireButton.disabled = false;
        }
        activeShotId = '';
        updateUi();
        publishState({ shot: null });
        scheduleCpuTurn();
    }

    function getWinner() {
        const alive = tanks.filter(tank => tank.hp > 0);
        if (alive.length === 1 && tanks.length > 1) return alive[0].id;
        return null;
    }

    function updateUi() {
        const activeTank = tanks[current];
        const controllableTank = mode === 'online' ? getMyTank() : activeTank;
        if (controllableTank && document.activeElement !== angleInput) angleInput.value = controllableTank.angle;
        if (controllableTank && document.activeElement !== powerInput) powerInput.value = controllableTank.power;
        angleValue.textContent = `${angleInput.value}°`;
        powerValue.textContent = powerInput.value;
        turnBadge.textContent = activeTank ? activeTank.name : '대기 중';
        turnBadge.classList.toggle('p2', current % 2 === 1);
        windLabel.textContent = `${wind > 0 ? '→' : wind < 0 ? '←' : ''} ${Math.abs(wind).toFixed(1)}`;
        windIndicator.style.left = `${50 + (wind / 3.6) * 5}%`;
        fireButton.disabled = locked || gameOver || !isMyTurn() || !isHumanControlTurn();
        newButton.textContent = mode === 'online' ? '방 초기화' : '새 게임';
        playerLabel.textContent = mode === 'online'
            ? `${tanks.length}/${MAX_PLAYERS}명 참여 중${tanks.length < 2 ? ' · 상대 대기 중' : isMyTurn() ? ' · 내 차례' : ''}`
            : (tanks[current]?.isCpu ? '컴퓨터가 조준 중' : '내 차례');
        renderScoreCards();
    }

    function renderScoreCards() {
        scoreRow.innerHTML = tanks.map((tank, index) => `
            <div class="tank-card ${index % 2 ? 'p2' : 'p1'} ${index === current ? 'is-current' : ''} ${tank.playerId === localPlayerId ? 'is-me' : ''}">
                <span>${tank.name}${tank.playerId === localPlayerId ? ' · 나' : ''}</span>
                <strong style="color:${tank.color}">${tank.hp}</strong>
                <small>HP</small>
            </div>
        `).join('');
    }

    function draw() {
        drawSky();
        drawSun();
        drawClouds();
        drawTerrain();
        drawTrails();
        tanks.forEach(drawTank);
        if (projectile) drawProjectile();
        drawParticles();
        drawExplosions();
    }

    function drawSky() {
        const gradient = ctx.createLinearGradient(0, 0, 0, HEIGHT);
        gradient.addColorStop(0, SKY_TOP);
        gradient.addColorStop(1, SKY_BOTTOM);
        ctx.fillStyle = gradient;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
    }

    function drawSun() {
        ctx.fillStyle = 'rgba(255, 219, 111, 0.9)';
        ctx.beginPath();
        ctx.arc(820, 84, 34, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawClouds() {
        ctx.fillStyle = 'rgba(255,255,255,0.72)';
        [[160, 86], [420, 70], [650, 125]].forEach(([x, y]) => {
            ctx.beginPath();
            ctx.arc(x, y, 18, 0, Math.PI * 2);
            ctx.arc(x + 22, y - 8, 25, 0, Math.PI * 2);
            ctx.arc(x + 52, y, 20, 0, Math.PI * 2);
            ctx.rect(x - 4, y, 62, 18);
            ctx.fill();
        });
    }

    function drawTerrain() {
        const gradient = ctx.createLinearGradient(0, HEIGHT * 0.58, 0, HEIGHT);
        gradient.addColorStop(0, '#6eb05f');
        gradient.addColorStop(0.18, '#609349');
        gradient.addColorStop(1, '#5b3e2d');
        ctx.beginPath();
        ctx.moveTo(0, HEIGHT);
        for (let x = 0; x < WIDTH; x += 1) ctx.lineTo(x, terrain[x]);
        ctx.lineTo(WIDTH, HEIGHT);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(37, 84, 42, 0.78)';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, terrain[0]);
        for (let x = 0; x < WIDTH; x += 1) ctx.lineTo(x, terrain[x]);
        ctx.stroke();
    }

    function drawTank(tank) {
        if (tank.hp <= 0) return;
        const angle = getTankAimAngle(tank.id);
        const isHurt = Date.now() < (tank.hurtUntil || 0);
        const wobble = isHurt ? Math.sin(Date.now() / 42) * 2 : 0;
        ctx.save();
        ctx.translate(tank.x + wobble, tank.y);
        ctx.scale(1.12, 1.12);

        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.beginPath();
        ctx.ellipse(0, TANK_H + 5, 31, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        drawCharacterTank(tank, angle, isHurt);

        if (isHurt) drawHurtMarks();

        ctx.restore();
        drawHpBar(tank);
    }

    function drawCharacterTank(tank, angle, isHurt) {
        const type = tank.id % 5;
        if (type === 0) drawRoverTank(tank.color, angle, isHurt);
        if (type === 1) drawHelmetTank(tank.color, angle, isHurt);
        if (type === 2) drawPodTank(tank.color, angle, isHurt);
        if (type === 3) drawWalkerTank(tank.color, angle, isHurt);
        if (type === 4) drawRocketTank(tank.color, angle, isHurt);
    }

    function drawRoverTank(color, angle, isHurt) {
        drawTrack(-26, 11, 52, 13, [-18, -6, 6, 18]);
        ctx.fillStyle = color;
        roundedRect(ctx, -27, 0, 54, 21, 11);
        ctx.fill();
        drawBodyStroke();
        drawGloss(-20, 4, 26, 5);

        ctx.fillStyle = '#d84c5b';
        ctx.beginPath();
        ctx.ellipse(-12, -17, 5, 12, -0.7, 0, Math.PI * 2);
        ctx.ellipse(0, -20, 6, 13, 0, 0, Math.PI * 2);
        ctx.ellipse(12, -17, 5, 12, 0.7, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(18,26,34,0.25)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        drawDome(0, -2, 20, 17, color);
        ctx.fillStyle = '#f0d77a';
        ctx.beginPath();
        ctx.arc(-20, 7, 5, 0, Math.PI * 2);
        ctx.fill();
        drawCannon(angle, 9, -6, 37, 11);
        drawFace(0, -2, isHurt);
        drawCheeks(-13, 1, 13, 1);
    }

    function drawHelmetTank(color, angle, isHurt) {
        drawWheelBase([-20, 0, 20], 17, 7);
        ctx.fillStyle = color;
        roundedRect(ctx, -26, 3, 52, 18, 9);
        ctx.fill();
        drawBodyStroke();

        ctx.fillStyle = '#e7cf68';
        ctx.beginPath();
        ctx.moveTo(17, -8);
        ctx.lineTo(30, -16);
        ctx.lineTo(24, -2);
        ctx.closePath();
        ctx.fill();

        drawDome(-1, -2, 19, 16, color);
        ctx.fillStyle = '#33404f';
        ctx.beginPath();
        ctx.ellipse(-1, -10, 22, 10, 0, Math.PI, 0);
        ctx.fill();
        ctx.fillStyle = '#8bd3ff';
        roundedRect(ctx, -16, -11, 17, 8, 5);
        ctx.fill();
        ctx.strokeStyle = '#1f2832';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.2)';
        ctx.beginPath();
        ctx.ellipse(-10, -10, 5, 2, -0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#f0d77a';
        ctx.beginPath();
        ctx.arc(-22, 7, 4, 0, Math.PI * 2);
        ctx.arc(22, 7, 4, 0, Math.PI * 2);
        ctx.fill();
        drawCannon(angle, 8, -5, 35, 10);
        drawFace(-1, -2, isHurt);
        drawCheeks(-13, 1, 11, 1);
    }

    function drawPodTank(color, angle, isHurt) {
        drawWheelBase([-16, -3, 10, 22], 17, 5);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(0, 7, 27, 16, 0, 0, Math.PI * 2);
        ctx.fill();
        drawBodyStroke();
        ctx.fillStyle = '#f6f8fb';
        ctx.beginPath();
        ctx.ellipse(-2, -3, 16, 11, -0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(18,26,34,0.24)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        drawCannon(angle, 8, -4, 36, 8);
        drawFace(-2, -3, isHurt);
        drawCheeks(-14, 2, 10, 2);
    }

    function drawWalkerTank(color, angle, isHurt) {
        drawLeg(-18, 10);
        drawLeg(0, 12);
        drawLeg(18, 10);
        ctx.fillStyle = color;
        roundedRect(ctx, -23, -1, 46, 20, 10);
        ctx.fill();
        drawBodyStroke();
        ctx.fillStyle = '#f6f8fb';
        ctx.beginPath();
        ctx.ellipse(0, 2, 15, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(18,26,34,0.24)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#e7cf68';
        ctx.beginPath();
        ctx.moveTo(-7, -12);
        ctx.lineTo(0, -20);
        ctx.lineTo(7, -12);
        ctx.closePath();
        ctx.fill();
        drawCannon(angle, 8, -5, 32, 8);
        drawFace(0, 2, isHurt);
        drawCheeks(-12, 5, 12, 5);
    }

    function drawRocketTank(color, angle, isHurt) {
        drawTrack(-23, 11, 46, 12, [-15, -3, 9, 20]);
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.moveTo(-23, 16);
        ctx.quadraticCurveTo(-16, -4, 2, -5);
        ctx.quadraticCurveTo(24, -3, 25, 15);
        ctx.quadraticCurveTo(8, 22, -23, 16);
        ctx.fill();
        drawBodyStroke();
        ctx.fillStyle = '#f6f8fb';
        ctx.beginPath();
        ctx.ellipse(-1, 2, 14, 10, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(18,26,34,0.24)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#90d9ff';
        ctx.beginPath();
        ctx.arc(21, -6, 5, 0, Math.PI * 2);
        ctx.fill();
        drawCannon(angle, 8, -4, 34, 8);
        drawFace(-1, 2, isHurt);
        drawCheeks(-12, 5, 10, 5);
    }

    function drawTrack(x, y, width, height, wheels) {
        ctx.fillStyle = '#1e2a34';
        roundedRect(ctx, x, y, width, height, height / 2);
        ctx.fill();
        wheels.forEach(wheelX => {
            ctx.fillStyle = '#111820';
            ctx.beginPath();
            ctx.arc(wheelX, y + height / 2, 5, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#657383';
            ctx.beginPath();
            ctx.arc(wheelX, y + height / 2, 2, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.strokeStyle = '#111820';
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x + 3, y + height / 2);
        ctx.lineTo(x + width - 3, y + height / 2);
        ctx.stroke();
    }

    function drawWheelBase(wheels, y, radius) {
        ctx.fillStyle = '#1e2a34';
        roundedRect(ctx, -27, y - 6, 54, 13, 7);
        ctx.fill();
        wheels.forEach(x => {
            ctx.fillStyle = '#111820';
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.fillStyle = '#6e7b87';
            ctx.beginPath();
            ctx.arc(x, y, radius * 0.38, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawLeg(x, y) {
        ctx.strokeStyle = '#1e2a34';
        ctx.lineWidth = 6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x - 4, y - 3);
        ctx.lineTo(x, y + 8);
        ctx.stroke();
        ctx.fillStyle = '#111820';
        ctx.beginPath();
        ctx.ellipse(x + 1, y + 10, 8, 3, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawDome(x, y, width, height, color) {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.ellipse(x, y, width, height, 0, Math.PI, 0);
        ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,0.4)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.ellipse(x, y, width, height, 0, Math.PI, 0);
        ctx.stroke();
    }

    function drawCannon(angle, x, y, width, height) {
        ctx.save();
        ctx.rotate(-angle);
        ctx.fillStyle = '#26333f';
        roundedRect(ctx, x, y, width, height, height / 2);
        ctx.fill();
        ctx.fillStyle = '#111820';
        ctx.beginPath();
        ctx.arc(x + width, y + height / 2, height * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        roundedRect(ctx, x + 5, y + 2, Math.max(10, width - 18), 3, 2);
        ctx.fill();
        ctx.restore();
    }

    function drawFace(x, y, isHurt) {
        ctx.fillStyle = '#f6f8fb';
        ctx.beginPath();
        ctx.ellipse(x, y, 14, 11, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(18,26,34,0.24)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.save();
        ctx.translate(x, y);
        drawTankFace(isHurt);
        ctx.restore();
    }

    function drawTankFace(isHurt) {
        ctx.strokeStyle = '#1f2832';
        ctx.fillStyle = '#1f2832';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        if (isHurt) {
            ctx.beginPath();
            ctx.moveTo(-8, -6);
            ctx.lineTo(-3, -2);
            ctx.moveTo(-3, -6);
            ctx.lineTo(-8, -2);
            ctx.moveTo(3, -6);
            ctx.lineTo(8, -2);
            ctx.moveTo(8, -6);
            ctx.lineTo(3, -2);
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(0, 7, 4, Math.PI + 0.2, Math.PI * 2 - 0.2);
            ctx.stroke();
            return;
        }

        ctx.beginPath();
        ctx.arc(-6, -4, 2.1, 0, Math.PI * 2);
        ctx.arc(6, -4, 2.1, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(0, 1, 5, 0.15, Math.PI - 0.15);
        ctx.stroke();
    }

    function drawBodyStroke() {
        ctx.strokeStyle = 'rgba(18,26,34,0.28)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    function drawGloss(x, y, width, height) {
        ctx.fillStyle = 'rgba(255,255,255,0.18)';
        roundedRect(ctx, x, y, width, height, height / 2);
        ctx.fill();
    }

    function drawCheeks(leftX, leftY, rightX, rightY) {
        ctx.fillStyle = 'rgba(255, 153, 166, 0.55)';
        ctx.beginPath();
        ctx.arc(leftX, leftY, 3, 0, Math.PI * 2);
        ctx.arc(rightX, rightY, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawHurtMarks() {
        ctx.strokeStyle = '#ff6f7d';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-23, -15);
        ctx.lineTo(-18, -21);
        ctx.moveTo(23, -15);
        ctx.lineTo(18, -21);
        ctx.stroke();
    }

    function drawHpBar(tank) {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        roundedRect(ctx, tank.x - 25, tank.y - 30, 50, 7, 4);
        ctx.fill();
        ctx.fillStyle = tank.color;
        roundedRect(ctx, tank.x - 25, tank.y - 30, 50 * tank.hp / 100, 7, 4);
        ctx.fill();
    }

    function drawProjectile() {
        ctx.fillStyle = '#1f2832';
        ctx.beginPath();
        ctx.arc(projectile.x, projectile.y, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#ffd166';
        ctx.beginPath();
        ctx.arc(projectile.x - projectile.vx * 0.5, projectile.y - projectile.vy * 0.5, 3, 0, Math.PI * 2);
        ctx.fill();
    }

    function drawTrails() {
        if (!projectile) return;
        projectile.trail.forEach((point, index) => {
            ctx.fillStyle = `rgba(31,40,50,${index / projectile.trail.length * 0.28})`;
            ctx.beginPath();
            ctx.arc(point.x, point.y, 2, 0, Math.PI * 2);
            ctx.fill();
        });
    }

    function drawParticles() {
        particles.forEach(p => {
            ctx.globalAlpha = Math.max(0, Math.min(1, p.life / 40));
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;
        });
    }

    function drawExplosions() {
        explosions.forEach(explosion => {
            ctx.strokeStyle = `rgba(255, 209, 102, ${explosion.alpha})`;
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(explosion.x, explosion.y, explosion.radius, 0, Math.PI * 2);
            ctx.stroke();
        });
    }

    function roundedRect(targetCtx, x, y, width, height, radius) {
        const left = Math.min(x, x + width);
        const top = Math.min(y, y + height);
        const w = Math.abs(width);
        const h = Math.abs(height);
        const r = Math.min(radius, w / 2, h / 2);
        targetCtx.beginPath();
        targetCtx.moveTo(left + r, top);
        targetCtx.lineTo(left + w - r, top);
        targetCtx.quadraticCurveTo(left + w, top, left + w, top + r);
        targetCtx.lineTo(left + w, top + h - r);
        targetCtx.quadraticCurveTo(left + w, top + h, left + w - r, top + h);
        targetCtx.lineTo(left + r, top + h);
        targetCtx.quadraticCurveTo(left, top + h, left, top + h - r);
        targetCtx.lineTo(left, top + r);
        targetCtx.quadraticCurveTo(left, top, left + r, top);
        targetCtx.closePath();
    }

    function showOverlay(title, text) {
        overlayTitle.textContent = title;
        overlayText.textContent = text;
        overlay.classList.remove('is-hidden');
    }

    function hideOverlay() {
        overlay.classList.add('is-hidden');
    }

    angleInput.addEventListener('input', () => {
        if (!isHumanControlTurn()) {
            angleInput.value = tanks[current]?.angle || 45;
            updateUi();
            return;
        }
        const target = mode === 'online' ? getMyTank() : tanks[current];
        if (target) target.angle = Number(angleInput.value);
        updateUi();
        publishState({ tanks });
    });
    powerInput.addEventListener('input', () => {
        if (!isHumanControlTurn()) {
            powerInput.value = tanks[current]?.power || 58;
            updateUi();
            return;
        }
        const target = mode === 'online' ? getMyTank() : tanks[current];
        if (target) target.power = Number(powerInput.value);
        updateUi();
        publishState({ tanks });
    });
    fireButton.addEventListener('click', fire);
    newButton.addEventListener('click', () => resetGame(tanks.length || 2));
    soloButton.addEventListener('click', startSolo);
    onlineButton.addEventListener('click', showOnlineTools);
    createRoomButton.addEventListener('click', createRoom);
    joinRoomButton.addEventListener('click', joinRoom);
    roomCodeInput.addEventListener('input', () => {
        roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '');
    });
    document.addEventListener('keydown', event => {
        const key = event.key.toLowerCase();
        if (['arrowleft', 'arrowright', 'arrowup', 'arrowdown', ' ', 'r'].includes(key)) event.preventDefault();
        if (!isHumanControlTurn() && key !== 'r') return;
        const target = mode === 'online' ? getMyTank() : tanks[current];
        if (key === 'arrowleft') angleInput.value = Math.min(180, Number(angleInput.value) + 1);
        if (key === 'arrowright') angleInput.value = Math.max(0, Number(angleInput.value) - 1);
        if (key === 'arrowdown') powerInput.value = Math.max(18, Number(powerInput.value) - 1);
        if (key === 'arrowup') powerInput.value = Math.min(100, Number(powerInput.value) + 1);
        if (target) target.angle = Number(angleInput.value);
        if (target) target.power = Number(powerInput.value);
        if (key === ' ') fire();
        if (key === 'r') resetGame(tanks.length || 2);
        updateUi();
        publishState({ tanks });
    });

    startSolo();
    requestAnimationFrame(update);
})();
