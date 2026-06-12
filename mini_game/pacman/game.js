const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");
const levelEl = document.getElementById("level");
const livesEl = document.getElementById("lives");
const overlay = document.getElementById("overlay");
const overlayTitle = document.getElementById("overlayTitle");
const overlayText = document.getElementById("overlayText");
const startButton = document.getElementById("startButton");
const pauseButton = document.getElementById("pauseButton");
const restartButton = document.getElementById("restartButton");

const TILE = 28;
const HUD = 20;
const COLS = 19;
const ROWS = 21;
const WIDTH = COLS * TILE;
const HEIGHT = ROWS * TILE + HUD;
const CENTER = TILE / 2;
const WALL = "#244cff";
const WALL_DARK = "#07164b";
const PELLET = "#ffe8b6";
const POWER = "#fff6d4";
const DIRS = {
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 },
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    none: { x: 0, y: 0 }
};

const BASE_MAP = [
    "###################",
    "#........#........#",
    "#o##.###.#.###.##o#",
    "#.................#",
    "#.##.#.#####.#.##.#",
    "#....#...#...#....#",
    "####.### # ###.####",
    "   #.#       #.#   ",
    "####.# ##-## #.####",
    "    .  #GGG#  .    ",
    "####.# ##### #.####",
    "   #.#       #.#   ",
    "####.# ##### #.####",
    "#........#........#",
    "#.##.###.#.###.##.#",
    "#o.#.....P.....#.o#",
    "##.#.#.#####.#.#.##",
    "#....#...#...#....#",
    "#.######.#.######.#",
    "#.................#",
    "###################"
];

let map;
let pelletCount;
let score = 0;
let best = Number(localStorage.getItem("pacman-best") || 0);
let level = 1;
let lives = 3;
let state = "ready";
let lastTime = 0;
let pacman;
let ghosts;
let frightTimer = 0;
let waitTimer = 0;

function px(col) {
    return col * TILE + CENTER;
}

function py(row) {
    return row * TILE + CENTER + HUD;
}

function buildMap() {
    pelletCount = 0;
    return BASE_MAP.map((line) => line.split("").map((cell) => {
        if (cell === "." || cell === "o") pelletCount += 1;
        return cell;
    }));
}

function makeActor(col, row, dir, speed) {
    return {
        col,
        row,
        x: px(col),
        y: py(row),
        dir,
        nextDir: dir,
        speed,
        mouth: 0
    };
}

function makeGhost(name, col, row, color, mode) {
    return {
        ...makeActor(col, row, name === "blinky" ? "left" : "right", ghostSpeed()),
        name,
        startCol: col,
        startRow: row,
        color,
        mode,
        eaten: false,
        release: name === "blinky" ? 0 : name === "pinky" ? 1.8 : name === "inky" ? 3.2 : 4.6
    };
}

function pacSpeed() {
    return 116 + Math.min(level - 1, 5) * 5;
}

function ghostSpeed() {
    return 84 + Math.min(level - 1, 5) * 4;
}

function resetGame() {
    map = buildMap();
    score = 0;
    level = 1;
    lives = 3;
    state = "ready";
    frightTimer = 0;
    resetActors();
    showOverlay("PAC-MAN", "방향키 또는 WASD로 이동하세요.", "게임 시작");
    updateStats();
}

function resetActors() {
    pacman = makeActor(9, 15, "left", pacSpeed());
    ghosts = [
        makeGhost("blinky", 9, 9, "#ff3b4f", "chase"),
        makeGhost("pinky", 8, 9, "#ff9ad9", "ambush"),
        makeGhost("inky", 10, 9, "#3ee8ff", "patrol"),
        makeGhost("clyde", 9, 8, "#ff9f2e", "scatter")
    ];
}

function startGame() {
    if (state === "gameover") resetGame();
    if (state !== "playing") {
        state = "playing";
        lastTime = performance.now();
        hideOverlay();
    }
}

function togglePause() {
    if (state === "playing") {
        state = "paused";
        showOverlay("일시정지", "계속하려면 버튼을 누르세요.", "계속");
        return;
    }
    if (state === "paused") startGame();
}

function showOverlay(title, text, buttonText) {
    overlayTitle.textContent = title;
    overlayText.textContent = text;
    startButton.textContent = buttonText;
    overlay.classList.add("is-visible");
}

function hideOverlay() {
    overlay.classList.remove("is-visible");
}

function updateStats() {
    scoreEl.textContent = score;
    bestEl.textContent = best;
    levelEl.textContent = level;
    livesEl.textContent = lives;
}

function addScore(points) {
    score += points;
    if (score > best) {
        best = score;
        localStorage.setItem("pacman-best", String(best));
    }
    updateStats();
}

function isWall(col, row) {
    if (row < 0 || row >= ROWS) return true;
    if (col < 0 || col >= COLS) return row !== 9;
    return map[row][col] === "#";
}

function canEnter(col, row, dirName) {
    const dir = DIRS[dirName];
    return !isWall(col + dir.x, row + dir.y);
}

function isCentered(actor) {
    return Math.abs(actor.x - px(actor.col)) < 0.001 && Math.abs(actor.y - py(actor.row)) < 0.001;
}

function wrapColumn(col) {
    if (col < 0) return COLS - 1;
    if (col >= COLS) return 0;
    return col;
}

function moveActor(actor, dt) {
    if (actor.dir === "none") return;
    const dir = DIRS[actor.dir];
    if (isCentered(actor) && !canEnter(actor.col, actor.row, actor.dir)) {
        actor.dir = "none";
        return;
    }

    let targetCol = actor.col + dir.x;
    const targetRow = actor.row + dir.y;
    if (targetCol < 0 || targetCol >= COLS) {
        actor.x += dir.x * actor.speed * dt;
        if (actor.x < -CENTER) {
            actor.col = COLS - 1;
            actor.x = px(actor.col);
        } else if (actor.x > WIDTH + CENTER) {
            actor.col = 0;
            actor.x = px(actor.col);
        }
        return;
    }

    targetCol = wrapColumn(targetCol);
    const targetX = px(targetCol);
    const targetY = py(targetRow);
    const distance = actor.speed * dt;

    if (dir.x !== 0) {
        const nextX = actor.x + dir.x * distance;
        if ((dir.x < 0 && nextX <= targetX) || (dir.x > 0 && nextX >= targetX)) {
            actor.x = targetX;
            actor.col = targetCol;
        } else {
            actor.x = nextX;
        }
    }

    if (dir.y !== 0) {
        const nextY = actor.y + dir.y * distance;
        if ((dir.y < 0 && nextY <= targetY) || (dir.y > 0 && nextY >= targetY)) {
            actor.y = targetY;
            actor.row = targetRow;
        } else {
            actor.y = nextY;
        }
    }
}

function updatePacman(dt) {
    if (isCentered(pacman)) {
        if (canEnter(pacman.col, pacman.row, pacman.nextDir)) pacman.dir = pacman.nextDir;
        if (!canEnter(pacman.col, pacman.row, pacman.dir)) pacman.dir = "none";
        eatAtCurrentTile();
    }
    moveActor(pacman, dt);
    pacman.mouth += dt * 9;
}

function eatAtCurrentTile() {
    const cell = map[pacman.row]?.[pacman.col];
    if (cell !== "." && cell !== "o") return;

    map[pacman.row][pacman.col] = " ";
    pelletCount -= 1;
    addScore(cell === "o" ? 50 : 10);

    if (cell === "o") {
        frightTimer = 8;
        ghosts.forEach((ghost) => {
            if (!ghost.eaten) ghost.dir = opposite(ghost.dir);
        });
    }

    if (pelletCount <= 0) {
        level += 1;
        map = buildMap();
        resetActors();
        state = "level";
        waitTimer = 1.2;
        updateStats();
    }
}

function updateGhosts(dt) {
    ghosts.forEach((ghost) => {
        if (ghost.release > 0) {
            ghost.release -= dt;
            return;
        }
        if (isCentered(ghost)) {
            ghost.dir = chooseGhostDirection(ghost);
        }
        moveActor(ghost, dt);
        if (ghost.eaten && ghost.col === ghost.startCol && ghost.row === ghost.startRow && isCentered(ghost)) {
            ghost.eaten = false;
            ghost.speed = ghostSpeed();
        }
    });
}

function chooseGhostDirection(ghost) {
    const options = ["left", "right", "up", "down"].filter((dirName) => canEnter(ghost.col, ghost.row, dirName));
    const forwardOnly = options.filter((dirName) => dirName !== opposite(ghost.dir));
    const choices = forwardOnly.length ? forwardOnly : options;
    if (!choices.length) return "none";

    if (ghost.eaten) return nearestDirection(ghost, choices, { col: ghost.startCol, row: ghost.startRow });
    if (frightTimer > 0) return choices[Math.floor(Math.random() * choices.length)];
    return nearestDirection(ghost, choices, ghostTarget(ghost));
}

function ghostTarget(ghost) {
    const dir = DIRS[pacman.dir] || DIRS.left;
    if (ghost.mode === "ambush") {
        return { col: pacman.col + dir.x * 4, row: pacman.row + dir.y * 4 };
    }
    if (ghost.mode === "patrol") {
        return { col: COLS - 2, row: 2 };
    }
    if (ghost.mode === "scatter" && tileDistance(ghost, pacman) < 6) {
        return { col: 1, row: ROWS - 2 };
    }
    return { col: pacman.col, row: pacman.row };
}

function nearestDirection(actor, options, target) {
    let bestDir = options[0];
    let bestDistance = Infinity;
    options.forEach((dirName) => {
        const dir = DIRS[dirName];
        const col = actor.col + dir.x;
        const row = actor.row + dir.y;
        const distance = Math.hypot(col - target.col, row - target.row);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestDir = dirName;
        }
    });
    return bestDir;
}

function tileDistance(a, b) {
    return Math.hypot(a.col - b.col, a.row - b.row);
}

function opposite(dirName) {
    if (dirName === "left") return "right";
    if (dirName === "right") return "left";
    if (dirName === "up") return "down";
    if (dirName === "down") return "up";
    return "none";
}

function checkCollisions() {
    ghosts.forEach((ghost) => {
        if (ghost.eaten || Math.hypot(pacman.x - ghost.x, pacman.y - ghost.y) > TILE * 0.55) return;
        if (frightTimer > 0) {
            ghost.eaten = true;
            ghost.speed = 140;
            ghost.dir = nearestDirection(ghost, ["left", "right", "up", "down"].filter((dir) => canEnter(ghost.col, ghost.row, dir)), { col: ghost.startCol, row: ghost.startRow });
            addScore(200);
            return;
        }
        lives -= 1;
        updateStats();
        if (lives <= 0) {
            state = "gameover";
            showOverlay("GAME OVER", "다시 시작해서 최고 점수에 도전하세요.", "다시 시작");
        } else {
            state = "ready";
            resetActors();
            showOverlay("준비", "목숨이 하나 줄었습니다.", "계속");
        }
    });
}

function update(timestamp) {
    const dt = Math.min((timestamp - lastTime) / 1000 || 0, 0.033);
    lastTime = timestamp;

    if (state === "playing") {
        frightTimer = Math.max(0, frightTimer - dt);
        updatePacman(dt);
        updateGhosts(dt);
        checkCollisions();
    } else if (state === "level") {
        waitTimer -= dt;
        if (waitTimer <= 0) {
            state = "ready";
            showOverlay(`LEVEL ${level}`, "미로가 다시 채워졌습니다.", "계속");
        }
    }

    draw();
    requestAnimationFrame(update);
}

function draw() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawMaze();
    drawPellets();
    ghosts.forEach(drawGhost);
    drawPacman();
    drawFrightTimer();
}

function drawMaze() {
    ctx.fillStyle = "#04050a";
    ctx.fillRect(0, HUD, WIDTH, ROWS * TILE);

    for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
            if (map[row][col] !== "#") continue;
            const x = col * TILE;
            const y = row * TILE + HUD;
            ctx.fillStyle = WALL_DARK;
            ctx.fillRect(x + 3, y + 3, TILE - 6, TILE - 6);
            ctx.strokeStyle = WALL;
            ctx.lineWidth = 3;
            ctx.strokeRect(x + 4, y + 4, TILE - 8, TILE - 8);
        }
    }

    ctx.fillStyle = "#f4d173";
    ctx.fillRect(8 * TILE + 5, 8 * TILE + HUD + TILE - 2, TILE * 3 - 10, 4);
}

function drawPellets() {
    const pulse = 1 + Math.sin(performance.now() / 160) * 0.12;
    for (let row = 0; row < ROWS; row += 1) {
        for (let col = 0; col < COLS; col += 1) {
            const cell = map[row][col];
            if (cell !== "." && cell !== "o") continue;
            ctx.beginPath();
            ctx.fillStyle = cell === "o" ? POWER : PELLET;
            ctx.arc(px(col), py(row), cell === "o" ? 7 * pulse : 3, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

function drawPacman() {
    const dir = DIRS[pacman.dir] || DIRS.left;
    const angle = Math.atan2(dir.y, dir.x);
    const open = pacman.dir === "none" ? 0.12 : 0.18 + Math.abs(Math.sin(pacman.mouth)) * 0.28;
    ctx.beginPath();
    ctx.moveTo(pacman.x, pacman.y);
    ctx.fillStyle = "#ffd43b";
    ctx.arc(pacman.x, pacman.y, TILE * 0.43, angle + open, angle + Math.PI * 2 - open);
    ctx.closePath();
    ctx.fill();
}

function drawGhost(ghost) {
    const frightened = frightTimer > 0 && !ghost.eaten;
    const r = TILE * 0.42;
    ctx.save();
    ctx.globalAlpha = ghost.release > 0 ? 0.5 : 1;
    ctx.fillStyle = ghost.eaten ? "#dce9ff" : frightened ? "#223bff" : ghost.color;
    ctx.beginPath();
    ctx.arc(ghost.x, ghost.y - 2, r, Math.PI, 0);
    ctx.lineTo(ghost.x + r, ghost.y + r);
    for (let i = 0; i < 3; i += 1) {
        ctx.lineTo(ghost.x + r - (i + 0.5) * (r * 2 / 3), ghost.y + r - 6);
        ctx.lineTo(ghost.x + r - (i + 1) * (r * 2 / 3), ghost.y + r);
    }
    ctx.lineTo(ghost.x - r, ghost.y + r);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(ghost.x - 7, ghost.y - 3, 4, 0, Math.PI * 2);
    ctx.arc(ghost.x + 7, ghost.y - 3, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = frightened ? "#ffffff" : "#121827";
    ctx.beginPath();
    ctx.arc(ghost.x - 6, ghost.y - 3, 2, 0, Math.PI * 2);
    ctx.arc(ghost.x + 8, ghost.y - 3, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
}

function drawFrightTimer() {
    if (state !== "playing" || frightTimer <= 0) return;
    ctx.fillStyle = "#fff6d4";
    ctx.font = "700 14px Segoe UI, Arial";
    ctx.textAlign = "center";
    ctx.fillText(`파워 ${Math.ceil(frightTimer)}`, WIDTH / 2, 14);
}

function setDirection(dirName) {
    if (!DIRS[dirName]) return;
    pacman.nextDir = dirName;
    if (state === "ready") startGame();
}

window.addEventListener("keydown", (event) => {
    const keyMap = {
        ArrowLeft: "left",
        a: "left",
        A: "left",
        ArrowRight: "right",
        d: "right",
        D: "right",
        ArrowUp: "up",
        w: "up",
        W: "up",
        ArrowDown: "down",
        s: "down",
        S: "down"
    };
    if (keyMap[event.key]) {
        event.preventDefault();
        setDirection(keyMap[event.key]);
        return;
    }
    if (event.key === " " || event.key === "Escape") {
        event.preventDefault();
        togglePause();
    }
});

document.querySelectorAll("[data-dir]").forEach((button) => {
    button.addEventListener("pointerdown", () => setDirection(button.dataset.dir));
});

startButton.addEventListener("click", startGame);
pauseButton.addEventListener("click", togglePause);
restartButton.addEventListener("click", resetGame);

resetGame();
requestAnimationFrame(update);
