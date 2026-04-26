/* ============================================
   PFAND FLIP! - Game Engine
   ============================================ */

(() => {
    'use strict';

    // ── roundRect polyfill ──
    if (!CanvasRenderingContext2D.prototype.roundRect) {
        CanvasRenderingContext2D.prototype.roundRect = function(x, y, w, h, radii) {
            const r = Array.isArray(radii) ? radii : [radii || 0];
            const tl = r[0] || 0, tr = r[1] || tl, br = r[2] || tl, bl = r[3] || tr;
            this.moveTo(x + tl, y);
            this.lineTo(x + w - tr, y);
            this.quadraticCurveTo(x + w, y, x + w, y + tr);
            this.lineTo(x + w, y + h - br);
            this.quadraticCurveTo(x + w, y + h, x + w - br, y + h);
            this.lineTo(x + bl, y + h);
            this.quadraticCurveTo(x, y + h, x, y + h - bl);
            this.lineTo(x, y + tl);
            this.quadraticCurveTo(x, y, x + tl, y);
            return this;
        };
    }

    // ── Audio Engine (Web Audio API synth) ──
    let audioCtx = null;
    function initAudio() {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
    }

    function playSound(type) {
        if (!audioCtx) return;
        const now = audioCtx.currentTime;

        if (type === 'flick') {
            // Bright "pop" sound
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, now);
            osc.frequency.exponentialRampToValueAtTime(1600, now + 0.05);
            osc.frequency.exponentialRampToValueAtTime(400, now + 0.15);
            gain.gain.setValueAtTime(0.3, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
            osc.start(now);
            osc.stop(now + 0.2);
        } else if (type === 'combo') {
            // Ascending arpeggio
            [0, 0.05, 0.1].forEach((delay, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(600 + i * 200, now + delay);
                gain.gain.setValueAtTime(0.2, now + delay);
                gain.gain.exponentialRampToValueAtTime(0.001, now + delay + 0.15);
                osc.start(now + delay);
                osc.stop(now + delay + 0.15);
            });
        } else if (type === 'miss') {
            // Low buzzer
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sawtooth';
            osc.frequency.setValueAtTime(200, now);
            osc.frequency.exponentialRampToValueAtTime(80, now + 0.3);
            gain.gain.setValueAtTime(0.2, now);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
            osc.start(now);
            osc.stop(now + 0.3);
        } else if (type === 'coupon') {
            // Victory jingle
            const notes = [523, 659, 784, 1047];
            notes.forEach((freq, i) => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, now + i * 0.12);
                gain.gain.setValueAtTime(0.25, now + i * 0.12);
                gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.3);
                osc.start(now + i * 0.12);
                osc.stop(now + i * 0.12 + 0.3);
            });
        }
    }

    // ── DOM References ──
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const titleScreen = document.getElementById('titleScreen');
    const gameHUD = document.getElementById('gameHUD');
    const resultScreen = document.getElementById('resultScreen');
    const startBtn = document.getElementById('startBtn');
    const retryBtn = document.getElementById('retryBtn');
    const scoreDisplay = document.getElementById('scoreDisplay');
    const comboDisplay = document.getElementById('comboDisplay');
    const comboCount = document.getElementById('comboCount');
    const livesDisplay = document.getElementById('livesDisplay');
    const particlesContainer = document.getElementById('particles');

    // ── Game State ──
    const state = {
        phase: 'title', // title | playing | result
        score: 0,
        combo: 0,
        maxCombo: 0,
        lives: 3,
        totalFlicks: 0,
        bottles: [],
        effects: [],
        bgStars: [],
        lastTime: 0,
        spawnTimer: 0,
        spawnInterval: 2000,
        difficulty: 1,
    };

    // ── Bottle class ──
    class Bottle {
        constructor(x, startY) {
            this.x = x;
            this.y = startY || canvas.height + 80;
            this.width = 60;
            this.height = 120;
            this.vx = (Math.random() - 0.5) * 2;
            this.vy = -(12 + Math.random() * 6); // launch upward
            this.gravity = 0.25;
            this.rotation = (Math.random() - 0.5) * 0.1;
            this.rotationSpeed = (Math.random() - 0.5) * 0.08;
            this.alive = true;
            this.missed = false;
            this.scale = 1;
            this.opacity = 1;
            this.hitFlash = 0;
            this.launched = true;
        }

        update(dt) {
            this.vy += this.gravity;
            this.x += this.vx;
            this.y += this.vy;
            this.rotation += this.rotationSpeed;

            if (this.hitFlash > 0) {
                this.hitFlash -= dt * 5;
            }

            // Bounce off walls
            if (this.x < this.width / 2) {
                this.x = this.width / 2;
                this.vx = Math.abs(this.vx) * 0.7;
                this.rotationSpeed *= -1;
            }
            if (this.x > canvas.width - this.width / 2) {
                this.x = canvas.width - this.width / 2;
                this.vx = -Math.abs(this.vx) * 0.7;
                this.rotationSpeed *= -1;
            }

            // Falls below screen
            if (this.y > canvas.height + 120) {
                this.alive = false;
                if (!this.missed) {
                    this.missed = true;
                    return 'miss';
                }
            }

            return null;
        }

        draw(ctx) {
            ctx.save();
            ctx.translate(this.x, this.y);
            ctx.rotate(this.rotation);
            ctx.globalAlpha = this.opacity;

            const s = this.scale;
            const w = this.width * s;
            const h = this.height * s;

            // Glow if recently hit
            if (this.hitFlash > 0) {
                ctx.shadowColor = '#ffd700';
                ctx.shadowBlur = 30 * this.hitFlash;
            }

            // Bottle body
            const grad = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
            grad.addColorStop(0, 'rgba(173, 216, 230, 0.9)');
            grad.addColorStop(0.5, 'rgba(135, 206, 250, 0.85)');
            grad.addColorStop(1, 'rgba(100, 180, 230, 0.9)');

            // Main body
            ctx.beginPath();
            ctx.roundRect(-w * 0.35, -h * 0.1, w * 0.7, h * 0.55, 6);
            ctx.fillStyle = grad;
            ctx.fill();
            ctx.strokeStyle = 'rgba(70, 130, 180, 0.6)';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Neck
            ctx.beginPath();
            ctx.roundRect(-w * 0.15, -h * 0.4, w * 0.3, h * 0.35, 4);
            ctx.fillStyle = 'rgba(173, 216, 230, 0.8)';
            ctx.fill();
            ctx.stroke();

            // Cap
            ctx.beginPath();
            ctx.roundRect(-w * 0.18, -h * 0.48, w * 0.36, h * 0.1, 3);
            ctx.fillStyle = '#2563eb';
            ctx.fill();

            // Label
            ctx.beginPath();
            ctx.roundRect(-w * 0.32, h * 0, w * 0.64, h * 0.22, 3);
            ctx.fillStyle = 'rgba(59, 130, 246, 0.7)';
            ctx.fill();

            // Label text
            ctx.fillStyle = 'white';
            ctx.font = `bold ${10 * s}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Sprudel', 0, h * 0.11);

            // Bottom of bottle
            ctx.beginPath();
            ctx.roundRect(-w * 0.35, h * 0.4, w * 0.7, h * 0.08, [0, 0, 6, 6]);
            ctx.fillStyle = 'rgba(173, 216, 230, 0.7)';
            ctx.fill();

            // Shine highlight
            ctx.beginPath();
            ctx.ellipse(-w * 0.15, -h * 0.05, w * 0.06, h * 0.25, 0, 0, Math.PI * 2);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
            ctx.fill();

            // Pfand mark
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.font = `${7 * s}px sans-serif`;
            ctx.fillText('0,25€', 0, h * 0.35);

            ctx.restore();
        }

        containsPoint(px, py) {
            // Generous AABB hitbox with large padding around the bottle
            const pad = 40; // extra pixels around the bottle that still count as a hit
            const halfW = (this.width * this.scale) / 2 + pad;
            const halfH = (this.height * this.scale) / 2 + pad;

            // Transform click point into bottle's local (rotated) space
            const dx = px - this.x;
            const dy = py - this.y;
            const cos = Math.cos(-this.rotation);
            const sin = Math.sin(-this.rotation);
            const localX = dx * cos - dy * sin;
            const localY = dx * sin + dy * cos;

            return Math.abs(localX) < halfW && Math.abs(localY) < halfH;
        }

        // Distance from point to bottle center (for magnet snap)
        distanceTo(px, py) {
            const dx = px - this.x;
            const dy = py - this.y;
            return Math.sqrt(dx * dx + dy * dy);
        }

        flick(px, py) {
            // Direction from click point
            const dx = this.x - px;
            const dy = this.y - py;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;

            this.vy = -(10 + Math.random() * 5);
            this.vx += (dx / dist) * 4 + (Math.random() - 0.5) * 3;
            this.rotationSpeed = (Math.random() - 0.5) * 0.2;
            this.hitFlash = 1;
            this.scale = 1.15;
            setTimeout(() => { this.scale = 1; }, 100);
        }
    }

    // ── Effect class ──
    class Effect {
        constructor(x, y, type, value) {
            this.x = x;
            this.y = y;
            this.type = type;
            this.value = value;
            this.life = 1;
            this.decay = 0.02;
        }

        update() {
            this.life -= this.decay;
            this.y -= 1.5;
            return this.life > 0;
        }

        draw(ctx) {
            ctx.save();
            ctx.globalAlpha = this.life;
            ctx.textAlign = 'center';

            if (this.type === 'score') {
                ctx.font = `36px 'Bangers', cursive`;
                ctx.fillStyle = '#ffd700';
                ctx.shadowColor = 'rgba(255, 215, 0, 0.5)';
                ctx.shadowBlur = 10;
                ctx.fillText(`+${this.value}`, this.x, this.y);
            } else if (this.type === 'combo') {
                ctx.font = `28px 'Bangers', cursive`;
                ctx.fillStyle = '#ff6b35';
                ctx.shadowColor = 'rgba(255, 107, 53, 0.5)';
                ctx.shadowBlur = 10;
                ctx.fillText(`${this.value}x COMBO!`, this.x, this.y - 35);
            }

            ctx.restore();
        }
    }

    // ── Background Stars ──
    function initStars() {
        state.bgStars = [];
        for (let i = 0; i < 80; i++) {
            state.bgStars.push({
                x: Math.random() * canvas.width,
                y: Math.random() * canvas.height,
                size: Math.random() * 2 + 0.5,
                twinkle: Math.random() * Math.PI * 2,
                speed: Math.random() * 0.02 + 0.005,
            });
        }
    }

    function drawBackground() {
        // Deep gradient background
        const grad = ctx.createLinearGradient(0, 0, 0, canvas.height);
        grad.addColorStop(0, '#0a0e1a');
        grad.addColorStop(0.4, '#111827');
        grad.addColorStop(1, '#1a1a2e');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Stars
        for (const star of state.bgStars) {
            star.twinkle += star.speed;
            const alpha = 0.3 + Math.sin(star.twinkle) * 0.3;
            ctx.beginPath();
            ctx.arc(star.x, star.y, star.size, 0, Math.PI * 2);
            ctx.fillStyle = `rgba(200, 220, 255, ${alpha})`;
            ctx.fill();
        }

        // Ground area with subtle gradient
        const groundGrad = ctx.createLinearGradient(0, canvas.height - 80, 0, canvas.height);
        groundGrad.addColorStop(0, 'transparent');
        groundGrad.addColorStop(1, 'rgba(0, 212, 170, 0.05)');
        ctx.fillStyle = groundGrad;
        ctx.fillRect(0, canvas.height - 80, canvas.width, 80);

        // Ground line
        ctx.beginPath();
        ctx.moveTo(0, canvas.height - 2);
        ctx.lineTo(canvas.width, canvas.height - 2);
        ctx.strokeStyle = 'rgba(0, 212, 170, 0.15)';
        ctx.lineWidth = 2;
        ctx.stroke();
    }

    // ── Particle burst ──
    function spawnParticles(x, y, count, color) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = Math.random() * 8 + 2;
            const size = Math.random() * 8 + 3;
            const el = document.createElement('div');
            el.className = 'particle';
            el.style.left = x + 'px';
            el.style.top = y + 'px';
            el.style.width = size + 'px';
            el.style.height = size + 'px';
            el.style.background = color || `hsl(${Math.random() * 60 + 30}, 100%, 60%)`;
            el.style.boxShadow = `0 0 ${size}px ${color || 'rgba(255,215,0,0.5)'}`;

            const vx = Math.cos(angle) * speed;
            const vy = Math.sin(angle) * speed;

            particlesContainer.appendChild(el);

            let px = x, py = y, life = 1;
            const particleAnim = () => {
                life -= 0.03;
                px += vx * life;
                py += vy * life + 1;
                el.style.left = px + 'px';
                el.style.top = py + 'px';
                el.style.opacity = life;
                el.style.transform = `scale(${life})`;
                if (life > 0) {
                    requestAnimationFrame(particleAnim);
                } else {
                    el.remove();
                }
            };
            requestAnimationFrame(particleAnim);
        }
    }

    // ── Screen flash ──
    function screenFlash() {
        const flash = document.createElement('div');
        flash.className = 'hit-flash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 300);
    }

    // ── Screen shake ──
    let shakeIntensity = 0;
    function screenShake(intensity) {
        shakeIntensity = intensity;
    }

    // ── Spawn a bottle ──
    function spawnBottle() {
        const margin = 80;
        const x = margin + Math.random() * (canvas.width - margin * 2);
        state.bottles.push(new Bottle(x));
    }

    // ── Update HUD ──
    function updateHUD() {
        scoreDisplay.textContent = state.score;

        const hearts = [];
        for (let i = 0; i < 3; i++) {
            hearts.push(i < state.lives ? '❤️' : '🖤');
        }
        livesDisplay.textContent = hearts.join('');

        if (state.combo >= 2) {
            comboDisplay.style.opacity = '1';
            comboCount.textContent = state.combo;
            comboDisplay.style.transform = `translate(-50%, -50%) scale(${1 + state.combo * 0.05})`;
        } else {
            comboDisplay.style.opacity = '0';
        }
    }

    // ── Handle click/tap ──
    function handleClick(e) {
        if (state.phase !== 'playing') return;

        const rect = canvas.getBoundingClientRect();
        const px = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
        const py = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const cx = px * scaleX;
        const cy = py * scaleY;

        let hitBottle = null;

        // 1) Direct hitbox check (generous padding already applied)
        for (let i = state.bottles.length - 1; i >= 0; i--) {
            const bottle = state.bottles[i];
            if (bottle.alive && bottle.containsPoint(cx, cy)) {
                hitBottle = bottle;
                break;
            }
        }

        // 2) Magnet snap: if no direct hit, find the nearest bottle within 150px
        if (!hitBottle) {
            const MAGNET_RANGE = 150;
            let closestDist = Infinity;
            for (const bottle of state.bottles) {
                if (!bottle.alive) continue;
                const dist = bottle.distanceTo(cx, cy);
                if (dist < MAGNET_RANGE && dist < closestDist) {
                    closestDist = dist;
                    hitBottle = bottle;
                }
            }
        }

        if (hitBottle) {
            // HIT!
            hitBottle.flick(cx, cy);
            state.combo++;
            state.totalFlicks++;
            if (state.combo > state.maxCombo) state.maxCombo = state.combo;

            // Score based on combo
            const baseScore = 25; // 0.25€ per bottle
            const comboMultiplier = Math.min(state.combo, 10);
            const points = baseScore * comboMultiplier;
            state.score += points;

            // Audio feedback
            playSound('flick');
            if (state.combo >= 3) playSound('combo');

            // Visual feedback
            state.effects.push(new Effect(hitBottle.x, hitBottle.y, 'score', points));
            if (state.combo >= 2) {
                state.effects.push(new Effect(hitBottle.x, hitBottle.y, 'combo', state.combo));
            }

            spawnParticles(hitBottle.x, hitBottle.y, 12 + state.combo * 3, 
                state.combo >= 5 ? '#ff6b35' : '#ffd700');
            screenFlash();
            screenShake(3 + state.combo);

            updateHUD();
        } else {
            // Clicked empty space — no penalty, but reset combo
            state.combo = 0;
            updateHUD();
        }
    }

    // ── Game loop ──
    function gameLoop(timestamp) {
        if (!state.lastTime) state.lastTime = timestamp;
        const dt = Math.min((timestamp - state.lastTime) / 16.67, 3); // normalize to ~60fps
        state.lastTime = timestamp;

        // Resize canvas
        if (canvas.width !== window.innerWidth || canvas.height !== window.innerHeight) {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            initStars();
        }

        // Apply shake
        if (shakeIntensity > 0) {
            const sx = (Math.random() - 0.5) * shakeIntensity;
            const sy = (Math.random() - 0.5) * shakeIntensity;
            ctx.setTransform(1, 0, 0, 1, sx, sy);
            shakeIntensity *= 0.85;
            if (shakeIntensity < 0.5) {
                shakeIntensity = 0;
                ctx.setTransform(1, 0, 0, 1, 0, 0);
            }
        }

        drawBackground();

        if (state.phase === 'playing') {
            // Spawn bottles
            state.spawnTimer += dt * 16.67;
            if (state.spawnTimer >= state.spawnInterval) {
                state.spawnTimer = 0;
                spawnBottle();

                // Gradually increase difficulty
                state.difficulty += 0.05;
                state.spawnInterval = Math.max(800, 2000 - state.difficulty * 50);
            }

            // Update bottles
            for (let i = state.bottles.length - 1; i >= 0; i--) {
                const result = state.bottles[i].update(dt);
                if (result === 'miss') {
                    state.lives--;
                    state.combo = 0;
                    updateHUD();
                    playSound('miss');

                    // Show miss effect
                    const miss = document.createElement('div');
                    miss.className = 'miss-indicator';
                    miss.textContent = 'MISS!';
                    document.body.appendChild(miss);
                    setTimeout(() => miss.remove(), 1000);

                    screenShake(8);

                    if (state.lives <= 0) {
                        endGame();
                        break;
                    }
                }
                if (!state.bottles[i].alive) {
                    state.bottles.splice(i, 1);
                }
            }

            // Draw bottles
            for (const bottle of state.bottles) {
                bottle.draw(ctx);
            }

            // Update & draw effects
            for (let i = state.effects.length - 1; i >= 0; i--) {
                if (!state.effects[i].update()) {
                    state.effects.splice(i, 1);
                } else {
                    state.effects[i].draw(ctx);
                }
            }
        }

        // Reset transform
        ctx.setTransform(1, 0, 0, 1, 0, 0);

        requestAnimationFrame(gameLoop);
    }

    // ── Start Game ──
    function startGame() {
        initAudio();
        state.phase = 'playing';
        state.score = 0;
        state.combo = 0;
        state.maxCombo = 0;
        state.lives = 3;
        state.totalFlicks = 0;
        state.bottles = [];
        state.effects = [];
        state.spawnTimer = 0;
        state.spawnInterval = 2000;
        state.difficulty = 1;

        titleScreen.classList.remove('active');
        resultScreen.classList.remove('active');
        gameHUD.classList.add('active');

        updateHUD();

        // First bottle immediately
        setTimeout(() => spawnBottle(), 500);
    }

    // ── End Game ──
    function endGame() {
        state.phase = 'result';
        gameHUD.classList.remove('active');

        // Clear remaining bottles
        state.bottles = [];
        state.effects = [];

        // Show result screen with conveyor phase first
        resultScreen.classList.add('active');
        document.getElementById('conveyorPhase').classList.add('active');
        document.getElementById('couponPhase').classList.remove('active');

        // Update machine text sequence
        const machineText = document.getElementById('machineText');
        const messages = [
            'Flasche erkannt...',
            'PET 0,5L - Einweg',
            'Pfand: 0,25€ × ' + state.totalFlicks,
            'Bon wird gedruckt...',
        ];

        let msgIndex = 0;
        const msgInterval = setInterval(() => {
            if (msgIndex < messages.length) {
                machineText.textContent = messages[msgIndex];
                msgIndex++;
            } else {
                clearInterval(msgInterval);
            }
        }, 800);

        // Transition to coupon phase after 3.5 seconds
        setTimeout(() => {
            document.getElementById('conveyorPhase').classList.remove('active');
            document.getElementById('couponPhase').classList.add('active');
            showCoupon();
            playSound('coupon');
        }, 3500);
    }

    // ── Show Coupon ──
    function showCoupon() {
        // Calculate Pfand amount (score in cents → euros)
        const euros = (state.score / 100).toFixed(2).replace('.', ',');
        document.getElementById('couponAmount').textContent = euros + ' €';
        document.getElementById('couponBottles').textContent = `ボトル: ${state.totalFlicks}本`;

        // Date
        const now = new Date();
        const dateStr = now.toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit'
        });
        document.getElementById('couponDate').textContent = dateStr;

        // Expiry (30 days)
        const expiry = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
        document.getElementById('couponExpiry').textContent = expiry.toLocaleDateString('de-DE');

        // Stats
        document.getElementById('statMaxCombo').textContent = state.maxCombo;
        document.getElementById('statFlicks').textContent = state.totalFlicks;

        // Rank
        const rank = getRank(state.score);
        document.getElementById('statRank').textContent = rank;

        // Generate barcode
        generateBarcode();

        // Celebration particles
        for (let i = 0; i < 5; i++) {
            setTimeout(() => {
                spawnParticles(
                    Math.random() * window.innerWidth,
                    Math.random() * window.innerHeight * 0.5,
                    15,
                    `hsl(${Math.random() * 360}, 80%, 60%)`
                );
            }, i * 300);
        }
    }

    function getRank(score) {
        if (score >= 5000) return 'S+';
        if (score >= 3000) return 'S';
        if (score >= 2000) return 'A';
        if (score >= 1000) return 'B';
        if (score >= 500) return 'C';
        if (score >= 200) return 'D';
        return 'F';
    }

    function generateBarcode() {
        const container = document.getElementById('couponBarcode');
        container.innerHTML = '';
        const numBars = 60;
        for (let i = 0; i < numBars; i++) {
            const bar = document.createElement('div');
            bar.className = 'bar';
            const isThick = Math.random() > 0.6;
            bar.style.width = isThick ? '3px' : '1.5px';
            bar.style.height = (20 + Math.random() * 30) + 'px';
            bar.style.opacity = Math.random() > 0.3 ? '1' : '0.4';
            container.appendChild(bar);
        }
    }

    // ── Event Listeners ──
    canvas.addEventListener('click', handleClick);
    canvas.addEventListener('touchstart', (e) => {
        e.preventDefault();
        handleClick(e);
    }, { passive: false });

    startBtn.addEventListener('click', startGame);
    retryBtn.addEventListener('click', startGame);

    // ── Initialize ──
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    initStars();
    requestAnimationFrame(gameLoop);

})();
