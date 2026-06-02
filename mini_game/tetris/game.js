(() => {
    const COLS = 10;
    const ROWS = 20;
    const BLOCK = 30;
    const PREVIEW_BLOCK = 22;
    const STORAGE_KEY = 'hyoam-tetris-best';
    const COLORS = {
        I: '#7de7ff',
        J: '#8da0ff',
        L: '#ffb86b',
        O: '#ffe37a',
        S: '#72e39a',
        T: '#d19cff',
        Z: '#ff8a98'
    };
    const SHAPES = {
        I: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
        J: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
        L: [[0, 0, 1], [1, 1, 1], [0, 0, 0]],
        O: [[1, 1], [1, 1]],
        S: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
        T: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
        Z: [[1, 1, 0], [0, 1, 1], [0, 0, 0]]
    };
    const SCORE_TABLE = [0, 100, 300, 500, 800];

    const boardCanvas = document.getElementById('board');
    const ctx = boardCanvas.getContext('2d');
    const holdCanvas = document.getElementById('hold');
    const holdCtx = holdCanvas.getContext('2d');
    const nextList = document.getElementById('next-list');
    const overlay = document.getElementById('overlay');
    const overlayTitle = document.getElementById('overlay-title');
    const overlayText = document.getElementById('overlay-text');
    const scoreEl = document.getElementById('score');
    const bestEl = document.getElementById('best-score');
    const linesEl = document.getElementById('lines');
    const levelEl = document.getElementById('level');
    const startButton = document.getElementById('start-button');
    const pauseButton = document.getElementById('pause-button');
    const soundToggle = document.getElementById('sound-toggle');
    const soundIcon = document.getElementById('sound-icon');

    let board = createBoard();
    let active = null;
    let holdType = null;
    let canHold = true;
    let queue = [];
    let score = 0;
    let lines = 0;
    let level = 1;
    let best = Number(localStorage.getItem(STORAGE_KEY) || 0);
    let dropCounter = 0;
    let lastTime = 0;
    let running = false;
    let paused = false;
    let gameOver = false;
    let soundOn = false;
    let audioContext = null;

    bestEl.textContent = formatNumber(best);

    function createBoard() {
        return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
    }

    function cloneMatrix(matrix) {
        return matrix.map(row => [...row]);
    }

    function refillQueue() {
        const bag = Object.keys(SHAPES);
        for (let i = bag.length - 1; i > 0; i -= 1) {
            const j = Math.floor(Math.random() * (i + 1));
            [bag[i], bag[j]] = [bag[j], bag[i]];
        }
        queue.push(...bag);
    }

    function takeFromQueue() {
        while (queue.length < 7) refillQueue();
        const type = queue.shift();
        return {
            type,
            matrix: cloneMatrix(SHAPES[type]),
            x: Math.floor(COLS / 2) - Math.ceil(SHAPES[type][0].length / 2),
            y: type === 'I' ? -1 : 0
        };
    }

    function resetGame() {
        board = createBoard();
        queue = [];
        active = takeFromQueue();
        holdType = null;
        canHold = true;
        score = 0;
        lines = 0;
        level = 1;
        dropCounter = 0;
        lastTime = 0;
        running = true;
        paused = false;
        gameOver = false;
        updateStats();
        draw();
        hideOverlay();
        playTone(440, 0.04);
        requestAnimationFrame(update);
    }

    function update(time = 0) {
        if (!running) return;
        const delta = time - lastTime;
        lastTime = time;

        if (!paused && !gameOver) {
            dropCounter += delta;
            if (dropCounter > getDropInterval()) {
                softDrop(false);
            }
            draw();
        }

        requestAnimationFrame(update);
    }

    function getDropInterval() {
        return Math.max(90, 900 - (level - 1) * 70);
    }

    function isColliding(piece, offsetX = 0, offsetY = 0, matrix = piece.matrix) {
        for (let y = 0; y < matrix.length; y += 1) {
            for (let x = 0; x < matrix[y].length; x += 1) {
                if (!matrix[y][x]) continue;
                const boardX = piece.x + x + offsetX;
                const boardY = piece.y + y + offsetY;
                if (boardX < 0 || boardX >= COLS || boardY >= ROWS) return true;
                if (boardY >= 0 && board[boardY][boardX]) return true;
            }
        }
        return false;
    }

    function mergePiece() {
        active.matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (!value) return;
                const boardY = active.y + y;
                const boardX = active.x + x;
                if (boardY >= 0) {
                    board[boardY][boardX] = active.type;
                }
            });
        });
    }

    function clearLines() {
        let cleared = 0;
        for (let y = ROWS - 1; y >= 0; y -= 1) {
            if (board[y].every(Boolean)) {
                board.splice(y, 1);
                board.unshift(Array(COLS).fill(null));
                cleared += 1;
                y += 1;
            }
        }
        if (!cleared) return;

        lines += cleared;
        level = Math.floor(lines / 10) + 1;
        score += SCORE_TABLE[cleared] * level;
        updateStats();
        playTone(cleared === 4 ? 740 : 520, 0.08);
    }

    function spawnNext() {
        active = takeFromQueue();
        canHold = true;
        renderPreviews();
        if (isColliding(active)) {
            endGame();
        }
    }

    function move(dir) {
        if (!canPlay()) return;
        if (!isColliding(active, dir, 0)) {
            active.x += dir;
            playTone(260, 0.02);
            draw();
        }
    }

    function softDrop(addScore = true) {
        if (!canPlay()) return;
        if (!isColliding(active, 0, 1)) {
            active.y += 1;
            dropCounter = 0;
            if (addScore) {
                score += 1;
                updateStats();
            }
        } else {
            lockPiece();
        }
    }

    function hardDrop() {
        if (!canPlay()) return;
        let distance = 0;
        while (!isColliding(active, 0, 1)) {
            active.y += 1;
            distance += 1;
        }
        score += distance * 2;
        lockPiece();
        updateStats();
        playTone(160, 0.05);
    }

    function lockPiece() {
        mergePiece();
        clearLines();
        spawnNext();
        dropCounter = 0;
    }

    function rotatePiece(direction) {
        if (!canPlay() || active.type === 'O') return;
        const rotated = rotateMatrix(active.matrix, direction);
        const kicks = [0, 1, -1, 2, -2];
        for (const kick of kicks) {
            if (!isColliding(active, kick, 0, rotated)) {
                active.matrix = rotated;
                active.x += kick;
                playTone(330, 0.03);
                draw();
                return;
            }
        }
    }

    function rotateMatrix(matrix, direction) {
        const size = matrix.length;
        const rotated = Array.from({ length: size }, () => Array(size).fill(0));
        for (let y = 0; y < size; y += 1) {
            for (let x = 0; x < size; x += 1) {
                if (direction > 0) {
                    rotated[x][size - 1 - y] = matrix[y][x];
                } else {
                    rotated[size - 1 - x][y] = matrix[y][x];
                }
            }
        }
        return rotated;
    }

    function holdPiece() {
        if (!canPlay() || !canHold) return;
        const currentType = active.type;
        if (holdType) {
            active = {
                type: holdType,
                matrix: cloneMatrix(SHAPES[holdType]),
                x: Math.floor(COLS / 2) - Math.ceil(SHAPES[holdType][0].length / 2),
                y: holdType === 'I' ? -1 : 0
            };
            holdType = currentType;
        } else {
            holdType = currentType;
            active = takeFromQueue();
        }
        canHold = false;
        renderHold();
        renderPreviews();
        playTone(610, 0.04);
        if (isColliding(active)) endGame();
        draw();
    }

    function pauseGame() {
        if (!running || gameOver) return;
        paused = !paused;
        pauseButton.textContent = paused ? '계속' : '일시정지';
        if (paused) {
            showOverlay('일시정지', 'P 또는 계속 버튼');
        } else {
            hideOverlay();
            lastTime = performance.now();
        }
    }

    function endGame() {
        running = false;
        gameOver = true;
        if (score > best) {
            best = score;
            localStorage.setItem(STORAGE_KEY, String(best));
        }
        updateStats();
        draw();
        showOverlay('게임 종료', 'Enter 또는 시작 버튼');
        startButton.textContent = '다시 시작';
        playTone(100, 0.18);
    }

    function canPlay() {
        return running && !paused && !gameOver && active;
    }

    function draw() {
        ctx.clearRect(0, 0, boardCanvas.width, boardCanvas.height);
        drawBackgroundGrid();
        board.forEach((row, y) => {
            row.forEach((type, x) => {
                if (type) drawBlock(ctx, x, y, COLORS[type], BLOCK);
            });
        });

        if (active) {
            drawGhost();
            drawMatrix(ctx, active.matrix, active.x, active.y, COLORS[active.type], BLOCK);
        }
    }

    function drawBackgroundGrid() {
        ctx.fillStyle = '#0d1116';
        ctx.fillRect(0, 0, boardCanvas.width, boardCanvas.height);
        ctx.strokeStyle = 'rgba(255,255,255,0.045)';
        ctx.lineWidth = 1;
        for (let x = 0; x <= COLS; x += 1) {
            ctx.beginPath();
            ctx.moveTo(x * BLOCK + 0.5, 0);
            ctx.lineTo(x * BLOCK + 0.5, ROWS * BLOCK);
            ctx.stroke();
        }
        for (let y = 0; y <= ROWS; y += 1) {
            ctx.beginPath();
            ctx.moveTo(0, y * BLOCK + 0.5);
            ctx.lineTo(COLS * BLOCK, y * BLOCK + 0.5);
            ctx.stroke();
        }
    }

    function drawGhost() {
        const ghost = { ...active, matrix: active.matrix };
        while (!isColliding(ghost, 0, 1)) {
            ghost.y += 1;
        }
        drawMatrix(ctx, ghost.matrix, ghost.x, ghost.y, 'rgba(255,255,255,0.18)', BLOCK, true);
    }

    function drawMatrix(targetCtx, matrix, offsetX, offsetY, color, size, ghost = false) {
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (!value) return;
                const drawY = offsetY + y;
                if (drawY < 0) return;
                drawBlock(targetCtx, offsetX + x, drawY, color, size, ghost);
            });
        });
    }

    function roundedRect(targetCtx, x, y, width, height, radius) {
        const r = Math.min(radius, width / 2, height / 2);
        targetCtx.beginPath();
        targetCtx.moveTo(x + r, y);
        targetCtx.lineTo(x + width - r, y);
        targetCtx.quadraticCurveTo(x + width, y, x + width, y + r);
        targetCtx.lineTo(x + width, y + height - r);
        targetCtx.quadraticCurveTo(x + width, y + height, x + width - r, y + height);
        targetCtx.lineTo(x + r, y + height);
        targetCtx.quadraticCurveTo(x, y + height, x, y + height - r);
        targetCtx.lineTo(x, y + r);
        targetCtx.quadraticCurveTo(x, y, x + r, y);
        targetCtx.closePath();
    }

    function drawBlock(targetCtx, x, y, color, size, ghost = false) {
        const px = x * size;
        const py = y * size;
        const gap = ghost ? Math.max(2, Math.floor(size * 0.08)) : Math.max(1, Math.floor(size * 0.045));
        const innerSize = size - gap * 2;
        const radius = Math.max(3, Math.floor(size * 0.11));
        const x0 = px + gap;
        const y0 = py + gap;

        targetCtx.save();
        targetCtx.shadowBlur = ghost ? 0 : Math.max(2, size * 0.08);
        targetCtx.shadowColor = ghost ? 'transparent' : 'rgba(0,0,0,0.28)';
        roundedRect(targetCtx, x0, y0, innerSize, innerSize, radius);
        targetCtx.fillStyle = color;
        targetCtx.fill();

        roundedRect(targetCtx, x0 + 0.5, y0 + 0.5, innerSize - 1, innerSize - 1, radius);
        targetCtx.strokeStyle = ghost ? 'rgba(255,255,255,0.32)' : 'rgba(255,255,255,0.25)';
        targetCtx.lineWidth = ghost ? 1.5 : 1;
        targetCtx.stroke();

        if (!ghost) {
            const gradient = targetCtx.createLinearGradient(x0, y0, x0, y0 + innerSize);
            gradient.addColorStop(0, 'rgba(255,255,255,0.2)');
            gradient.addColorStop(0.48, 'rgba(255,255,255,0.03)');
            gradient.addColorStop(1, 'rgba(0,0,0,0.16)');
            roundedRect(targetCtx, x0 + 1, y0 + 1, innerSize - 2, innerSize - 2, radius - 1);
            targetCtx.fillStyle = gradient;
            targetCtx.fill();

            roundedRect(
                targetCtx,
                x0 + innerSize * 0.16,
                y0 + innerSize * 0.13,
                innerSize * 0.38,
                innerSize * 0.12,
                radius
            );
            targetCtx.fillStyle = 'rgba(255,255,255,0.22)';
            targetCtx.fill();
        }
        targetCtx.restore();
    }

    function renderPreviews() {
        while (queue.length < 5) refillQueue();
        nextList.innerHTML = '';
        queue.slice(0, 3).forEach(type => {
            const canvas = document.createElement('canvas');
            canvas.width = 96;
            canvas.height = 76;
            canvas.setAttribute('aria-label', `다음 블록 ${type}`);
            nextList.appendChild(canvas);
            drawPreview(canvas.getContext('2d'), type, canvas.width, canvas.height);
        });
    }

    function renderHold() {
        holdCtx.clearRect(0, 0, holdCanvas.width, holdCanvas.height);
        holdCtx.fillStyle = '#111820';
        holdCtx.fillRect(0, 0, holdCanvas.width, holdCanvas.height);
        if (holdType) {
            drawPreview(holdCtx, holdType, holdCanvas.width, holdCanvas.height);
        }
    }

    function drawPreview(targetCtx, type, width, height) {
        const matrix = SHAPES[type];
        targetCtx.clearRect(0, 0, width, height);
        targetCtx.fillStyle = '#111820';
        targetCtx.fillRect(0, 0, width, height);
        const usedRows = matrix.filter(row => row.some(Boolean));
        const usedCols = [];
        for (let x = 0; x < matrix[0].length; x += 1) {
            if (matrix.some(row => row[x])) usedCols.push(x);
        }
        const shapeWidth = usedCols.length * PREVIEW_BLOCK;
        const shapeHeight = usedRows.length * PREVIEW_BLOCK;
        const startX = Math.floor((width - shapeWidth) / 2 / PREVIEW_BLOCK);
        const startY = Math.floor((height - shapeHeight) / 2 / PREVIEW_BLOCK);
        const minCol = usedCols[0] || 0;
        const minRow = matrix.findIndex(row => row.some(Boolean));
        matrix.forEach((row, y) => {
            row.forEach((value, x) => {
                if (value) {
                    drawBlock(targetCtx, startX + x - minCol, startY + y - minRow, COLORS[type], PREVIEW_BLOCK);
                }
            });
        });
    }

    function updateStats() {
        scoreEl.textContent = formatNumber(score);
        linesEl.textContent = formatNumber(lines);
        levelEl.textContent = String(level);
        bestEl.textContent = formatNumber(Math.max(best, score));
    }

    function formatNumber(value) {
        return new Intl.NumberFormat('ko-KR').format(value);
    }

    function showOverlay(title, text) {
        overlayTitle.textContent = title;
        overlayText.textContent = text;
        overlay.classList.remove('is-hidden');
    }

    function hideOverlay() {
        overlay.classList.add('is-hidden');
    }

    function playTone(frequency, duration) {
        if (!soundOn) return;
        audioContext ||= new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        oscillator.frequency.value = frequency;
        oscillator.type = 'square';
        gain.gain.setValueAtTime(0.04, audioContext.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + duration);
        oscillator.connect(gain).connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(audioContext.currentTime + duration);
    }

    function bindEvents() {
        document.addEventListener('keydown', event => {
            const key = event.key.toLowerCase();
            if (['arrowleft', 'arrowright', 'arrowdown', 'arrowup', ' ', 'z', 'x', 'c', 'p', 'enter'].includes(key)) {
                event.preventDefault();
            }
            if (key === 'enter' && !running) resetGame();
            if (key === 'arrowleft') move(-1);
            if (key === 'arrowright') move(1);
            if (key === 'arrowdown') softDrop(true);
            if (key === 'arrowup' || key === 'x') rotatePiece(1);
            if (key === 'z') rotatePiece(-1);
            if (key === ' ') {
                if (!running) resetGame();
                else hardDrop();
            }
            if (key === 'c') holdPiece();
            if (key === 'p') pauseGame();
        });

        startButton.addEventListener('click', resetGame);
        pauseButton.addEventListener('click', pauseGame);
        soundToggle.addEventListener('click', () => {
            soundOn = !soundOn;
            soundIcon.textContent = soundOn ? '♫' : '♪';
            soundToggle.setAttribute('aria-label', soundOn ? '효과음 끄기' : '효과음 켜기');
            playTone(500, 0.04);
        });

        document.querySelectorAll('[data-action]').forEach(button => {
            button.addEventListener('click', () => {
                const action = button.dataset.action;
                if (action === 'left') move(-1);
                if (action === 'right') move(1);
                if (action === 'rotate') rotatePiece(1);
                if (action === 'soft') softDrop(true);
                if (action === 'drop') hardDrop();
            });
        });
    }

    bindEvents();
    renderPreviews();
    renderHold();
    draw();
})();
