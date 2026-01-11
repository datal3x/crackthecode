// ============================================
// CODE CASCADE - Main Game Logic
// ============================================

// Game Configuration
const CONFIG = {
    colors: [
        { name: 'red', hex: '#ef4444' },
        { name: 'blue', hex: '#3b82f6' },
        { name: 'green', hex: '#22c55e' },
        { name: 'yellow', hex: '#eab308' },
        { name: 'purple', hex: '#a855f7' },
        { name: 'orange', hex: '#f97316' },
        { name: 'pink', hex: '#ec4899' },
        { name: 'cyan', hex: '#06b6d4' }
    ],
    levels: [
        { codeLength: 2, numColors: 4, maxGuesses: 6, descentTime: 60000, spawnRate: 25000 },  // Level 1-3
        { codeLength: 2, numColors: 4, maxGuesses: 6, descentTime: 55000, spawnRate: 22000 },
        { codeLength: 3, numColors: 4, maxGuesses: 6, descentTime: 50000, spawnRate: 20000 },
        { codeLength: 3, numColors: 5, maxGuesses: 5, descentTime: 50000, spawnRate: 18000 },  // Level 4-6
        { codeLength: 3, numColors: 5, maxGuesses: 5, descentTime: 45000, spawnRate: 16000 },
        { codeLength: 4, numColors: 5, maxGuesses: 5, descentTime: 45000, spawnRate: 15000 },
        { codeLength: 4, numColors: 6, maxGuesses: 5, descentTime: 40000, spawnRate: 14000 },  // Level 7-10
        { codeLength: 4, numColors: 6, maxGuesses: 5, descentTime: 35000, spawnRate: 13000 },
        { codeLength: 5, numColors: 6, maxGuesses: 5, descentTime: 35000, spawnRate: 12000 },
        { codeLength: 5, numColors: 6, maxGuesses: 5, descentTime: 30000, spawnRate: 11000 },
        { codeLength: 5, numColors: 7, maxGuesses: 5, descentTime: 25000, spawnRate: 10000 },  // Level 11+
    ],
    maxCodes: 3,
    pointsPerPeg: 100,
    speedBonus: 1.5,
    comboMultipliers: [1, 1.5, 2, 2.5, 3, 4, 5],
    closeCallBonus: 200
};

// Game State
let gameState = {
    screen: 'menu',
    score: 0,
    level: 1,
    combo: 0,
    codes: [],
    selectedCodeIndex: 0,
    currentGuess: [],
    powerups: { reveal: 2, freeze: 1, nuke: 0 },
    frozen: false,
    freezeEndTime: 0,
    lastSpawnTime: 0,
    lastTickTime: 0,
    gameLoopId: null,
    codesCleared: 0
};

// High Scores
let highScores = JSON.parse(localStorage.getItem('codeCascadeScores')) || [];

// ============================================
// MASTERMIND LOGIC
// ============================================

function generateCode(length, numColors) {
    const code = [];
    for (let i = 0; i < length; i++) {
        code.push(Math.floor(Math.random() * numColors));
    }
    return code;
}

function checkGuess(code, guess) {
    let bulls = 0;
    let cows = 0;
    const codeRemaining = [...code];
    const guessRemaining = [...guess];

    // First pass: find bulls (correct position)
    for (let i = 0; i < code.length; i++) {
        if (guess[i] === code[i]) {
            bulls++;
            codeRemaining[i] = -1;
            guessRemaining[i] = -2;
        }
    }

    // Second pass: find cows (correct color, wrong position)
    for (let i = 0; i < guess.length; i++) {
        if (guessRemaining[i] !== -2) {
            const idx = codeRemaining.indexOf(guessRemaining[i]);
            if (idx !== -1) {
                cows++;
                codeRemaining[idx] = -1;
            }
        }
    }

    return { bulls, cows };
}

// ============================================
// GAME LOGIC
// ============================================

function getLevelConfig() {
    const idx = Math.min(gameState.level - 1, CONFIG.levels.length - 1);
    return CONFIG.levels[idx];
}

function createCode() {
    const config = getLevelConfig();
    return {
        id: Date.now() + Math.random(),
        secret: generateCode(config.codeLength, config.numColors),
        guesses: [],
        maxGuesses: config.maxGuesses,
        startTime: Date.now(),
        descentTime: config.descentTime,
        progress: 0
    };
}

function spawnCode() {
    if (gameState.codes.length < CONFIG.maxCodes) {
        const newCode = createCode();
        gameState.codes.unshift(newCode);
        if (gameState.codes.length === 1) {
            gameState.selectedCodeIndex = 0;
        }
        renderCodes();
        playSound('spawn');
    }
}

function submitGuess() {
    const config = getLevelConfig();
    if (gameState.currentGuess.length !== config.codeLength) {
        shakeElement(document.getElementById('current-guess'));
        playSound('error');
        return;
    }

    const selectedCode = gameState.codes[gameState.selectedCodeIndex];
    if (!selectedCode) return;

    const result = checkGuess(selectedCode.secret, gameState.currentGuess);
    selectedCode.guesses.push({
        guess: [...gameState.currentGuess],
        bulls: result.bulls,
        cows: result.cows
    });

    gameState.currentGuess = [];

    // Check if cracked
    if (result.bulls === selectedCode.secret.length) {
        crackCode(selectedCode);
    } else if (selectedCode.guesses.length >= selectedCode.maxGuesses) {
        // Out of guesses - code explodes
        explodeCode(selectedCode);
    } else {
        playSound('guess');
    }

    renderGame();
}

function crackCode(code) {
    const config = getLevelConfig();
    stopTicking();

    // Calculate score
    let points = config.codeLength * CONFIG.pointsPerPeg;

    // Speed bonus for fewer guesses
    if (code.guesses.length <= 3) {
        points *= CONFIG.speedBonus;
    }

    // Close call bonus
    if (code.progress > 0.8) {
        points += CONFIG.closeCallBonus;
    }

    // Combo multiplier
    gameState.combo = Math.min(gameState.combo + 1, CONFIG.comboMultipliers.length - 1);
    points *= CONFIG.comboMultipliers[gameState.combo];

    gameState.score += Math.floor(points);
    gameState.codesCleared++;

    // Level up every 5 codes
    if (gameState.codesCleared % 5 === 0) {
        gameState.level++;
        playSound('levelup');
    }

    // Award powerups
    if (gameState.codesCleared % 3 === 0) {
        gameState.powerups.reveal++;
    }
    if (gameState.codesCleared % 7 === 0) {
        gameState.powerups.freeze++;
    }
    if (gameState.codesCleared % 10 === 0) {
        gameState.powerups.nuke++;
    }

    // Animate and remove
    const codeElement = document.querySelector(`[data-code-id="${code.id}"]`);
    if (codeElement) {
        codeElement.classList.add('cracking');
    }

    playSound('crack');

    setTimeout(() => {
        const idx = gameState.codes.indexOf(code);
        if (idx !== -1) {
            gameState.codes.splice(idx, 1);
            if (gameState.selectedCodeIndex >= gameState.codes.length) {
                gameState.selectedCodeIndex = Math.max(0, gameState.codes.length - 1);
            }
        }
        renderGame();
    }, 300);
}

function explodeCode(code) {
    gameState.combo = 0;
    const idx = gameState.codes.indexOf(code);
    if (idx !== -1) {
        gameState.codes.splice(idx, 1);
        if (gameState.selectedCodeIndex >= gameState.codes.length) {
            gameState.selectedCodeIndex = Math.max(0, gameState.codes.length - 1);
        }
    }
    playSound('explode');
    shakeElement(document.getElementById('game-container'));
    renderGame();
}

function gameOver() {
    cancelAnimationFrame(gameState.gameLoopId);
    stopTicking();
    gameState.screen = 'explosion';

    // Play explosion sound
    playSound('explosion');

    // Show explosion screen
    showScreen('explosion');

    // Reset explosion animation
    const explosionFlash = document.querySelector('.explosion-flash');
    const explosionText = document.querySelector('.explosion-text');
    explosionFlash.style.animation = 'none';
    explosionText.style.animation = 'none';
    setTimeout(() => {
        explosionFlash.style.animation = 'explode-flash 1.5s ease-out forwards';
        explosionText.style.animation = 'explode-text 1.5s ease-out forwards';
    }, 10);

    // After explosion, show game over screen
    setTimeout(() => {
        gameState.screen = 'gameover';

        // Update high scores
        const newScore = { score: gameState.score, level: gameState.level, date: new Date().toLocaleDateString() };
        highScores.push(newScore);
        highScores.sort((a, b) => b.score - a.score);
        highScores = highScores.slice(0, 10);
        localStorage.setItem('codeCascadeScores', JSON.stringify(highScores));

        // Check if new high score
        const isNewHigh = highScores[0].score === gameState.score;

        playSound('gameover');
        showScreen('gameover');

        document.getElementById('final-score-value').textContent = gameState.score;
        document.getElementById('final-level-value').textContent = gameState.level;
        document.getElementById('new-high').classList.toggle('hidden', !isNewHigh);
    }, 2000);
}

// ============================================
// POWERUPS
// ============================================

function usePowerup(type) {
    if (gameState.powerups[type] <= 0) return;

    switch (type) {
        case 'reveal':
            revealPeg();
            break;
        case 'freeze':
            freezeGame();
            break;
        case 'nuke':
            nukeCode();
            break;
    }

    gameState.powerups[type]--;
    renderGame();
}

function revealPeg() {
    const selectedCode = gameState.codes[gameState.selectedCodeIndex];
    if (!selectedCode) return;

    // Find a position that hasn't been revealed
    const config = getLevelConfig();
    for (let i = 0; i < config.codeLength; i++) {
        if (gameState.currentGuess[i] === undefined) {
            gameState.currentGuess[i] = selectedCode.secret[i];
            playSound('reveal');
            break;
        }
    }
}

function freezeGame() {
    gameState.frozen = true;
    gameState.freezeEndTime = Date.now() + 10000;
    playSound('freeze');
    document.getElementById('game-container').classList.add('frozen');
}

function nukeCode() {
    const selectedCode = gameState.codes[gameState.selectedCodeIndex];
    if (selectedCode) {
        crackCode(selectedCode);
    }
}

// ============================================
// GAME LOOP
// ============================================

function gameLoop() {
    if (gameState.screen !== 'game') return;

    const now = Date.now();
    const config = getLevelConfig();

    // Unfreeze if time's up
    if (gameState.frozen && now >= gameState.freezeEndTime) {
        gameState.frozen = false;
        document.getElementById('game-container').classList.remove('frozen');
    }

    // Update code descent (unless frozen)
    if (!gameState.frozen) {
        for (const code of gameState.codes) {
            const elapsed = now - code.startTime;
            code.progress = Math.min(elapsed / code.descentTime, 1);

            // Game over if code reaches bottom
            if (code.progress >= 1) {
                gameOver();
                return;
            }
        }

        // Auto-select the bomb with least time remaining (highest progress)
        if (gameState.codes.length > 0) {
            let mostUrgentIndex = 0;
            let highestProgress = gameState.codes[0].progress;
            for (let i = 1; i < gameState.codes.length; i++) {
                if (gameState.codes[i].progress > highestProgress) {
                    highestProgress = gameState.codes[i].progress;
                    mostUrgentIndex = i;
                }
            }
            gameState.selectedCodeIndex = mostUrgentIndex;

            // Play continuous ticking sound when bomb timer is low (>80% progress)
            if (highestProgress > 0.80) {
                startTicking();
            } else {
                stopTicking();
            }
        } else {
            stopTicking();
        }

        // Spawn new codes
        if (now - gameState.lastSpawnTime > config.spawnRate && gameState.codes.length < CONFIG.maxCodes) {
            spawnCode();
            gameState.lastSpawnTime = now;
        }
    }

    renderCodes();
    gameState.gameLoopId = requestAnimationFrame(gameLoop);
}

// ============================================
// RENDERING
// ============================================

function renderGame() {
    document.getElementById('score').textContent = gameState.score;
    document.getElementById('level').textContent = gameState.level;
    document.getElementById('combo').textContent = `x${CONFIG.comboMultipliers[gameState.combo]}`;

    renderCodes();
    renderGuessInput();
    renderPowerups();
}

function renderCodes() {
    const container = document.getElementById('codes-area');
    const config = getLevelConfig();
    const nextPuzzleMsg = document.getElementById('next-puzzle-msg');
    const spawnTimer = document.getElementById('spawn-timer');

    // Show/hide "next puzzle cooking" message with countdown
    if (gameState.codes.length === 0) {
        nextPuzzleMsg.classList.remove('hidden');
        const timeUntilSpawn = Math.max(0, config.spawnRate - (Date.now() - gameState.lastSpawnTime));
        const secondsLeft = Math.ceil(timeUntilSpawn / 1000);
        spawnTimer.textContent = secondsLeft;
    } else {
        nextPuzzleMsg.classList.add('hidden');
    }

    // Keep existing elements and update them
    const existingIds = new Set();
    gameState.codes.forEach((code, index) => {
        existingIds.add(code.id);
        let codeEl = container.querySelector(`[data-code-id="${code.id}"]`);

        if (!codeEl) {
            codeEl = createCodeElement(code, index);
            container.appendChild(codeEl);
        }

        updateCodeElement(codeEl, code, index);
    });

    // Remove elements for codes that no longer exist
    container.querySelectorAll('.code-block').forEach(el => {
        if (!existingIds.has(parseFloat(el.dataset.codeId))) {
            el.remove();
        }
    });
}

function createCodeElement(code, index) {
    const config = getLevelConfig();
    const el = document.createElement('div');
    el.className = 'code-block';
    el.dataset.codeId = code.id;
    el.onclick = () => selectCode(index);

    el.innerHTML = `
        <div class="code-header">
            <span class="bomb-label">💣 Bomb #${gameState.codes.length - index}</span>
            <span class="selected-label">ACTIVE</span>
            <span class="guess-count">0/${code.maxGuesses}</span>
        </div>
        <div class="code-pegs">
            ${code.secret.map(() => '<div class="peg hidden-peg"></div>').join('')}
        </div>
        <div class="descent-bar"><div class="descent-fill"></div></div>
        <div class="guess-history"></div>
    `;

    return el;
}

function updateCodeElement(el, code, index) {
    const config = getLevelConfig();

    // Update selection
    el.classList.toggle('selected', index === gameState.selectedCodeIndex);
    el.classList.toggle('danger', code.progress > 0.8);

    // Update guess count
    el.querySelector('.guess-count').textContent = `${code.guesses.length}/${code.maxGuesses}`;

    // Update descent bar
    el.querySelector('.descent-fill').style.width = `${code.progress * 100}%`;

    // Update guess history
    const historyEl = el.querySelector('.guess-history');
    if (historyEl.children.length !== code.guesses.length) {
        historyEl.innerHTML = code.guesses.map(g => `
            <div class="guess-row">
                <div class="guess-pegs">
                    ${g.guess.map(colorIdx => `<div class="peg" style="background: ${CONFIG.colors[colorIdx].hex}"></div>`).join('')}
                </div>
                <div class="feedback">
                    ${Array(g.bulls).fill('<div class="feedback-dot bull"></div>').join('')}
                    ${Array(g.cows).fill('<div class="feedback-dot cow"></div>').join('')}
                    ${Array(config.codeLength - g.bulls - g.cows).fill('<div class="feedback-dot"></div>').join('')}
                </div>
            </div>
        `).join('');
    }
}

function renderGuessInput() {
    const config = getLevelConfig();
    const guessEl = document.getElementById('current-guess');

    guessEl.innerHTML = '';
    for (let i = 0; i < config.codeLength; i++) {
        const peg = document.createElement('div');
        peg.className = 'peg';
        if (gameState.currentGuess[i] !== undefined) {
            peg.style.background = CONFIG.colors[gameState.currentGuess[i]].hex;
        } else {
            peg.classList.add('empty');
        }
        peg.onclick = () => removeFromGuess(i);
        guessEl.appendChild(peg);
    }

    // Render color palette
    const paletteEl = document.getElementById('color-palette');
    paletteEl.innerHTML = '';
    for (let i = 0; i < config.numColors; i++) {
        const color = document.createElement('div');
        color.className = 'palette-color';
        color.style.background = CONFIG.colors[i].hex;
        color.onclick = () => addToGuess(i);
        paletteEl.appendChild(color);
    }
}

function renderPowerups() {
    document.getElementById('reveal-count').textContent = gameState.powerups.reveal;
    document.getElementById('freeze-count').textContent = gameState.powerups.freeze;
    document.getElementById('nuke-count').textContent = gameState.powerups.nuke;

    document.querySelectorAll('.powerup-btn').forEach(btn => {
        const type = btn.dataset.power;
        btn.disabled = gameState.powerups[type] <= 0;
    });
}

function renderHighScores() {
    const list = document.getElementById('scores-list');
    if (highScores.length === 0) {
        list.innerHTML = '<div class="score-entry">No scores yet!</div>';
    } else {
        list.innerHTML = highScores.map((s, i) => `
            <div class="score-entry ${i === 0 ? 'highlight' : ''}">
                <span>#${i + 1}</span>
                <span>${s.score}</span>
                <span>LV${s.level}</span>
            </div>
        `).join('');
    }
}

// ============================================
// INPUT HANDLING
// ============================================

function selectCode(index) {
    gameState.selectedCodeIndex = index;
    renderCodes();
}

function addToGuess(colorIndex) {
    const config = getLevelConfig();
    // Find first empty slot
    for (let i = 0; i < config.codeLength; i++) {
        if (gameState.currentGuess[i] === undefined) {
            gameState.currentGuess[i] = colorIndex;
            playSound('click');
            renderGuessInput();
            return;
        }
    }
}

function removeFromGuess(index) {
    if (gameState.currentGuess[index] !== undefined) {
        gameState.currentGuess[index] = undefined;
        // Compact the array
        gameState.currentGuess = gameState.currentGuess.filter(c => c !== undefined);
        playSound('click');
        renderGuessInput();
    }
}

function clearGuess() {
    gameState.currentGuess = [];
    playSound('click');
    renderGuessInput();
}

// ============================================
// SCREENS
// ============================================

function showScreen(screenName) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    document.getElementById(`${screenName}-screen`).classList.remove('hidden');
    gameState.screen = screenName;
}

function startGame() {
    // Reset state
    gameState = {
        screen: 'game',
        score: 0,
        level: 1,
        combo: 0,
        codes: [],
        selectedCodeIndex: 0,
        currentGuess: [],
        powerups: { reveal: 2, freeze: 1, nuke: 0 },
        frozen: false,
        freezeEndTime: 0,
        lastSpawnTime: Date.now(),
        gameLoopId: null,
        codesCleared: 0
    };

    showScreen('game');
    spawnCode();
    renderGame();
    gameLoop();
    playSound('start');
}

// ============================================
// SOUND EFFECTS (Web Audio API)
// ============================================

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

// Background Music System - Dark/Batman style
let musicPlaying = false;
let musicNodes = [];

function startMusic() {
    if (musicPlaying) return;
    musicPlaying = true;
    musicNodes = [];

    // Sub bass for depth
    const subOsc = audioCtx.createOscillator();
    const subGain = audioCtx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(27.5, audioCtx.currentTime); // Sub bass
    subGain.gain.setValueAtTime(0.08, audioCtx.currentTime);
    subOsc.connect(subGain);
    subGain.connect(audioCtx.destination);
    subOsc.start();
    musicNodes.push(subOsc, subGain);

    // Dark pad chord (minor)
    const padFreqs = [110, 130.81, 164.81]; // Am chord
    padFreqs.forEach(freq => {
        const padOsc = audioCtx.createOscillator();
        const padGain = audioCtx.createGain();
        const padFilter = audioCtx.createBiquadFilter();

        padOsc.type = 'sawtooth';
        padOsc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        padFilter.type = 'lowpass';
        padFilter.frequency.setValueAtTime(400, audioCtx.currentTime);
        padFilter.Q.setValueAtTime(1, audioCtx.currentTime);

        padGain.gain.setValueAtTime(0.03, audioCtx.currentTime);

        padOsc.connect(padFilter);
        padFilter.connect(padGain);
        padGain.connect(audioCtx.destination);
        padOsc.start();
        musicNodes.push(padOsc, padGain, padFilter);
    });

    // Tension pulse (rhythmic element)
    const pulseOsc = audioCtx.createOscillator();
    const pulseGain = audioCtx.createGain();
    const pulseLfo = audioCtx.createOscillator();
    const pulseLfoGain = audioCtx.createGain();

    pulseOsc.type = 'triangle';
    pulseOsc.frequency.setValueAtTime(82.41, audioCtx.currentTime); // E

    pulseLfo.frequency.setValueAtTime(0.5, audioCtx.currentTime); // Slow pulse
    pulseLfoGain.gain.setValueAtTime(0.02, audioCtx.currentTime);

    pulseLfo.connect(pulseLfoGain);
    pulseLfoGain.connect(pulseGain.gain);
    pulseGain.gain.setValueAtTime(0.02, audioCtx.currentTime);

    pulseOsc.connect(pulseGain);
    pulseGain.connect(audioCtx.destination);

    pulseOsc.start();
    pulseLfo.start();
    musicNodes.push(pulseOsc, pulseGain, pulseLfo, pulseLfoGain);

    // High tension string
    const stringOsc = audioCtx.createOscillator();
    const stringGain = audioCtx.createGain();
    const stringFilter = audioCtx.createBiquadFilter();
    const stringLfo = audioCtx.createOscillator();
    const stringLfoGain = audioCtx.createGain();

    stringOsc.type = 'sawtooth';
    stringOsc.frequency.setValueAtTime(220, audioCtx.currentTime);

    stringFilter.type = 'lowpass';
    stringFilter.frequency.setValueAtTime(600, audioCtx.currentTime);

    stringLfo.frequency.setValueAtTime(4, audioCtx.currentTime); // Vibrato
    stringLfoGain.gain.setValueAtTime(3, audioCtx.currentTime);
    stringLfo.connect(stringLfoGain);
    stringLfoGain.connect(stringOsc.frequency);

    stringGain.gain.setValueAtTime(0.015, audioCtx.currentTime);

    stringOsc.connect(stringFilter);
    stringFilter.connect(stringGain);
    stringGain.connect(audioCtx.destination);

    stringOsc.start();
    stringLfo.start();
    musicNodes.push(stringOsc, stringGain, stringFilter, stringLfo, stringLfoGain);
}

function stopMusic() {
    if (!musicPlaying) return;

    musicNodes.forEach(node => {
        try {
            if (node.stop) node.stop();
            if (node.disconnect) node.disconnect();
        } catch (e) {}
    });

    musicNodes = [];
    musicPlaying = false;
}

// Continuous ticking sound system
let tickingOscillator = null;
let tickingLfo = null;
let tickingGain = null;
let isTickingPlaying = false;

function startTicking() {
    if (isTickingPlaying) return;

    tickingOscillator = audioCtx.createOscillator();
    tickingLfo = audioCtx.createOscillator();
    tickingGain = audioCtx.createGain();
    const lfoGain = audioCtx.createGain();

    tickingOscillator.connect(tickingGain);
    tickingGain.connect(audioCtx.destination);

    // Create a rhythmic ticking pattern using LFO
    tickingLfo.frequency.setValueAtTime(8, audioCtx.currentTime); // 8 ticks per second
    lfoGain.gain.setValueAtTime(0.15, audioCtx.currentTime);

    tickingLfo.connect(lfoGain);
    lfoGain.connect(tickingGain.gain);

    tickingOscillator.type = 'square';
    tickingOscillator.frequency.setValueAtTime(1000, audioCtx.currentTime);
    tickingGain.gain.setValueAtTime(0.08, audioCtx.currentTime);

    tickingOscillator.start();
    tickingLfo.start();

    isTickingPlaying = true;
}

function stopTicking() {
    if (!isTickingPlaying) return;

    try {
        if (tickingOscillator) {
            tickingOscillator.stop();
            tickingOscillator.disconnect();
        }
        if (tickingLfo) {
            tickingLfo.stop();
            tickingLfo.disconnect();
        }
        if (tickingGain) {
            tickingGain.disconnect();
        }
    } catch (e) {
        // Ignore errors if already stopped
    }

    tickingOscillator = null;
    tickingLfo = null;
    tickingGain = null;
    isTickingPlaying = false;
}

function playSound(type) {
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.connect(gain);
    gain.connect(audioCtx.destination);

    const now = audioCtx.currentTime;

    switch (type) {
        case 'click':
            osc.frequency.setValueAtTime(800, now);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.exponentialDecayTo && gain.gain.exponentialDecayTo(0.01, now + 0.05);
            osc.start(now);
            osc.stop(now + 0.05);
            break;

        case 'guess':
            osc.frequency.setValueAtTime(400, now);
            osc.frequency.linearRampToValueAtTime(600, now + 0.1);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;

        case 'crack':
            osc.type = 'square';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(800, now + 0.1);
            osc.frequency.linearRampToValueAtTime(1200, now + 0.2);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
            break;

        case 'explode':
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.linearRampToValueAtTime(50, now + 0.3);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
            break;

        case 'explosion':
            // Big dramatic explosion for game over
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(150, now);
            osc.frequency.linearRampToValueAtTime(30, now + 0.8);
            gain.gain.setValueAtTime(0.5, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.8);
            osc.start(now);
            osc.stop(now + 0.8);
            // Add a second oscillator for rumble
            const osc2 = audioCtx.createOscillator();
            const gain2 = audioCtx.createGain();
            osc2.connect(gain2);
            gain2.connect(audioCtx.destination);
            osc2.type = 'square';
            osc2.frequency.setValueAtTime(60, now);
            osc2.frequency.linearRampToValueAtTime(20, now + 1);
            gain2.gain.setValueAtTime(0.4, now);
            gain2.gain.linearRampToValueAtTime(0.01, now + 1);
            osc2.start(now);
            osc2.stop(now + 1);
            break;

        case 'error':
            osc.type = 'square';
            osc.frequency.setValueAtTime(150, now);
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;

        case 'spawn':
            osc.frequency.setValueAtTime(300, now);
            osc.frequency.linearRampToValueAtTime(500, now + 0.1);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.1);
            osc.start(now);
            osc.stop(now + 0.1);
            break;

        case 'tick':
            // Loud clicking tick sound
            osc.type = 'square';
            osc.frequency.setValueAtTime(1200, now);
            osc.frequency.setValueAtTime(600, now + 0.03);
            gain.gain.setValueAtTime(0.4, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.08);
            osc.start(now);
            osc.stop(now + 0.08);
            break;

        case 'levelup':
            osc.type = 'square';
            [400, 500, 600, 800].forEach((freq, i) => {
                osc.frequency.setValueAtTime(freq, now + i * 0.1);
            });
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.4);
            osc.start(now);
            osc.stop(now + 0.4);
            break;

        case 'reveal':
        case 'freeze':
            osc.type = 'sine';
            osc.frequency.setValueAtTime(600, now);
            osc.frequency.linearRampToValueAtTime(1000, now + 0.15);
            gain.gain.setValueAtTime(0.1, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
            osc.start(now);
            osc.stop(now + 0.15);
            break;

        case 'start':
            osc.type = 'square';
            [200, 300, 400, 600].forEach((freq, i) => {
                osc.frequency.setValueAtTime(freq, now + i * 0.08);
            });
            gain.gain.setValueAtTime(0.15, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.35);
            osc.start(now);
            osc.stop(now + 0.35);
            break;

        case 'gameover':
            osc.type = 'sawtooth';
            [400, 350, 300, 200].forEach((freq, i) => {
                osc.frequency.setValueAtTime(freq, now + i * 0.15);
            });
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.linearRampToValueAtTime(0.01, now + 0.6);
            osc.start(now);
            osc.stop(now + 0.6);
            break;
    }
}

// ============================================
// UTILITIES
// ============================================

function shakeElement(el) {
    el.classList.add('shake');
    setTimeout(() => el.classList.remove('shake'), 300);
}

// ============================================
// EVENT LISTENERS
// ============================================

document.addEventListener('DOMContentLoaded', () => {
    // Menu buttons
    document.getElementById('play-btn').onclick = startGame;
    document.getElementById('scores-btn').onclick = () => {
        renderHighScores();
        showScreen('scores');
    };

    // Game buttons
    document.getElementById('submit-btn').onclick = submitGuess;
    document.getElementById('clear-btn').onclick = clearGuess;

    // Powerup buttons
    document.querySelectorAll('.powerup-btn').forEach(btn => {
        btn.onclick = () => usePowerup(btn.dataset.power);
    });

    // Game over buttons
    document.getElementById('restart-btn').onclick = startGame;
    document.getElementById('menu-btn').onclick = () => showScreen('menu');

    // High scores back button
    document.getElementById('back-btn').onclick = () => showScreen('menu');

    // Instructions screen buttons
    document.getElementById('instructions-btn').onclick = () => showScreen('instructions');
    document.getElementById('instructions-back-btn').onclick = () => showScreen('menu');

    // Keyboard controls
    document.addEventListener('keydown', (e) => {
        if (gameState.screen !== 'game') return;

        const config = getLevelConfig();

        // Number keys 1-8 for colors
        if (e.key >= '1' && e.key <= '8') {
            const colorIdx = parseInt(e.key) - 1;
            if (colorIdx < config.numColors) {
                addToGuess(colorIdx);
            }
        }

        // Enter to submit
        if (e.key === 'Enter') {
            submitGuess();
        }

        // Backspace to clear last
        if (e.key === 'Backspace') {
            if (gameState.currentGuess.length > 0) {
                gameState.currentGuess.pop();
                renderGuessInput();
            }
        }


        // Q, W, E for powerups
        if (e.key === 'q') usePowerup('reveal');
        if (e.key === 'w') usePowerup('freeze');
        if (e.key === 'e') usePowerup('nuke');
    });

    // Update best score display
    const bestScore = highScores.length > 0 ? highScores[0].score : 0;
    document.getElementById('best-score-value').textContent = bestScore;

    // Resume audio context on first interaction
    document.addEventListener('click', () => {
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
    }, { once: true });
});
