
import { GoogleGenAI } from "@google/genai";
import { COUNTRIES } from './constants';

const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

// AdMob/AdSense Interstitial Trigger Placeholder
const showInterstitialAd = () => {
    console.log("Interstitial Ad Triggered");
    // আপনি যখন AdSense/AdMob SDK ব্যবহার করবেন, তখন এখানে অ্যাড দেখানোর কোড বসাবেন।
    // window.adsbygoogle.push({ ... });
};

const startMain = () => {
    const Matter = (window as any).Matter;
    if (!Matter) {
        setTimeout(startMain, 100);
        return;
    }

    const container = document.getElementById('game-container');
    const homeScreen = document.getElementById('home-screen');
    const uiLayer = document.getElementById('ui-layer');
    const startBtn = document.getElementById('start-game-btn');
    const backHomeBtn = document.getElementById('back-home-btn');
    const winnerHomeBtn = document.getElementById('winner-home-btn');
    const restartBtn = document.getElementById('restart-btn');
    
    const toggleSoundBtn = document.getElementById('toggle-sound') as HTMLButtonElement;
    const speedSlider = document.getElementById('speed-slider') as HTMLInputElement;
    const speedValLabel = document.getElementById('speed-val') as HTMLSpanElement;
    const countryModeSelect = document.getElementById('country-mode') as HTMLSelectElement;

    if (!container || !homeScreen || !uiLayer || !startBtn || !backHomeBtn || !winnerHomeBtn || !restartBtn) return;

    const { Engine, World, Bodies, Body, Vector, Events, Composite, Sleeping } = Matter;

    let engine: any;
    let animationFrameId: number;
    let rotationInterval: any;
    let countdownInterval: any;
    let canvas: HTMLCanvasElement;
    let ctx: CanvasRenderingContext2D;
    
    let isGameOver = false;
    let currentRotation = 0;
    let rotationSpeed = 0.015;
    
    let soundEnabled = true;
    let speedMultiplier = 1.0;
    let targetZoom = 1;
    let currentZoom = 1;
    let cameraTarget = { x: 0, y: 0 };
    let currentCamera = { x: 0, y: 0 };

    let audioCtx: AudioContext;
    let bgMusicNode: OscillatorNode | null = null;
    let bgMusicGain: GainNode | null = null;

    const initAudio = () => {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') audioCtx.resume();
        startBackgroundMusic();
    };

    const startBackgroundMusic = () => {
        if (!soundEnabled || bgMusicNode) return;
        try {
            bgMusicGain = audioCtx.createGain();
            bgMusicGain.gain.setValueAtTime(0.015, audioCtx.currentTime);
            bgMusicGain.connect(audioCtx.destination);
            bgMusicNode = audioCtx.createOscillator();
            bgMusicNode.type = 'sine';
            bgMusicNode.frequency.setValueAtTime(45, audioCtx.currentTime);
            bgMusicNode.connect(bgMusicGain);
            bgMusicNode.start();
        } catch (e) {}
    };

    const stopBackgroundMusic = () => {
        if (bgMusicNode) {
            try { bgMusicNode.stop(); bgMusicNode.disconnect(); } catch(e) {}
            bgMusicNode = null;
        }
    };

    toggleSoundBtn.onclick = () => {
        soundEnabled = !soundEnabled;
        toggleSoundBtn.innerText = soundEnabled ? 'Sound ON' : 'Sound OFF';
        if (!soundEnabled) stopBackgroundMusic();
        else if (audioCtx) startBackgroundMusic();
    };

    speedSlider.oninput = () => {
        speedMultiplier = parseFloat(speedSlider.value);
        speedValLabel.innerText = speedMultiplier.toFixed(1) + 'x';
    };

    const playBounceSound = () => {
        if (!audioCtx || !soundEnabled || audioCtx.state === 'suspended') return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(150 + Math.random() * 50, audioCtx.currentTime);
        gain.gain.setValueAtTime(0.02, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.1);
    };

    const playElimSound = () => {
        if (!audioCtx || !soundEnabled || audioCtx.state === 'suspended') return;
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(80, audioCtx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(40, audioCtx.currentTime + 0.5);
        gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.5);
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.5);
    };

    const textureCache: { [key: string]: HTMLImageElement } = {};
    const getFlagTexture = (code: string) => {
        if (textureCache[code]) return textureCache[code];
        const img = new Image();
        img.src = `https://flagcdn.com/w160/${code}.png`;
        textureCache[code] = img;
        return img;
    };

    const drawRoundedRect = (ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) => {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.arcTo(x + width, y, x + width, y + radius, radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.arcTo(x + width, y + height, x + width - radius, y + height, radius);
        ctx.lineTo(x + radius, y + height);
        ctx.arcTo(x, y + height, x, y + height - radius, radius);
        ctx.lineTo(x, y + radius);
        ctx.arcTo(x, y, x + radius, y, radius);
        ctx.closePath();
    };

    function initGame() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        const centerX = width / 2;
        const centerY = height / 2 - 50;
        const isMobile = width < 768;
        const RING_RADIUS = Math.min(width * 0.42, height * 0.35, isMobile ? 180 : 280);
        const FLAG_SIZE = isMobile ? 15 : 22; 
        const PHYS_RADIUS = FLAG_SIZE * 0.7; 
        const GAP_SIZE_RAD = isMobile ? 0.7 : 0.6; 

        if (engine) { World.clear(engine.world, false); Engine.clear(engine); }
        if (canvas) canvas.remove();
        cancelAnimationFrame(animationFrameId);
        if (rotationInterval) clearInterval(rotationInterval);
        if (countdownInterval) clearInterval(countdownInterval);

        canvas = document.createElement('canvas');
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        container!.appendChild(canvas);
        ctx = canvas.getContext('2d', { alpha: false })!;
        ctx.scale(dpr, dpr);

        isGameOver = false;
        rotationSpeed = 0.015;
        currentRotation = 0;
        targetZoom = 1;
        currentZoom = 1;
        cameraTarget = { x: centerX, y: centerY };
        currentCamera = { x: centerX, y: centerY };
        updateLeaderboardUI();
        document.getElementById('winner-overlay')?.classList.add('hidden');

        engine = Engine.create({ enableSleeping: true });
        engine.gravity.y = 0;

        const ground = Bodies.rectangle(centerX, height - 20, width * 10, 40, { 
            isStatic: true, label: 'floor', friction: 0.8, restitution: 0.1,
            collisionFilter: { category: 0x0008, mask: 0x0004 }
        });
        World.add(engine.world, ground);

        const segments: any[] = [];
        const segmentCount = isMobile ? 80 : 120;
        const gapSegmentsCount = Math.floor(segmentCount * (GAP_SIZE_RAD / (Math.PI * 2)));

        for (let i = 0; i < segmentCount; i++) {
            if (i < gapSegmentsCount) continue;
            const angle = (i / segmentCount) * Math.PI * 2;
            const segment = Bodies.rectangle(centerX, centerY, (RING_RADIUS * 2 * Math.PI / segmentCount) * 1.4, 24, {
                isStatic: true, angle: angle, friction: 0, restitution: 1.15, label: 'ring_seg',
                collisionFilter: { category: 0x0001, mask: 0x0002 }
            });
            segments.push(segment);
        }
        World.add(engine.world, segments);

        let filteredCountries = [...COUNTRIES];
        const mode = countryModeSelect.value;
        if (mode === 'random-20') filteredCountries = [...COUNTRIES].sort(() => 0.5 - Math.random()).slice(0, 20);
        else if (mode === 'random-50') filteredCountries = [...COUNTRIES].sort(() => 0.5 - Math.random()).slice(0, 50);
        else if (mode === 'top-10') {
            const champs = JSON.parse(localStorage.getItem('flag_champions') || '[]');
            filteredCountries = champs.slice(0, 10).map((c:any) => COUNTRIES.find(cnt => cnt.code === c.code)).filter(Boolean);
        }

        const marbles = filteredCountries.map((c) => {
            const angle = Math.random() * Math.PI * 2;
            const r = Math.random() * (RING_RADIUS - 40);
            const marble = Bodies.circle(centerX + Math.cos(angle) * r, centerY + Math.sin(angle) * r, PHYS_RADIUS, {
                restitution: 1.05, friction: 0.0005, frictionAir: 0, density: 0.001,
                label: `flag|${c!.code}|${c!.name}|active`,
                collisionFilter: { category: 0x0002, mask: 0x0001 | 0x0002 }
            });
            const s = isMobile ? 5 : 7;
            Body.setVelocity(marble, { x: (Math.random() - 0.5) * s, y: (Math.random() - 0.5) * s });
            return marble;
        });
        World.add(engine.world, marbles);

        Events.on(engine, 'collisionStart', (event: any) => {
            if (!soundEnabled) return;
            for (let pair of event.pairs) {
                if (pair.bodyA.label.includes('active') || pair.bodyB.label.includes('active')) {
                    playBounceSound(); break;
                }
            }
        });

        rotationInterval = setInterval(() => {
            if (!isGameOver) {
                rotationSpeed += (0.001 * speedMultiplier);
                if (rotationSpeed > 0.12) rotationSpeed = 0.12;
            }
        }, 3000);

        const runLoop = () => {
            if (!canvas || !ctx) return;
            const allBodies = Composite.allBodies(engine.world);
            let activeCount = 0;
            let activeMarbles: any[] = [];
            let pileMarbles: any[] = [];

            for (let b of allBodies) {
                if (!b.label?.startsWith('flag|')) continue;
                const parts = b.label.split('|');
                if (parts[3] === 'active') { activeCount++; activeMarbles.push(b); }
                else if (parts[3] === 'pile') { pileMarbles.push(b); }
            }

            if (!isGameOver) {
                currentRotation += (rotationSpeed * speedMultiplier);
                const gapOffset = Math.floor(segmentCount * (GAP_SIZE_RAD / (Math.PI * 2)));
                for (let i = 0; i < segments.length; i++) {
                    const angle = ((i + gapOffset) / segmentCount) * Math.PI * 2 + currentRotation;
                    Body.setPosition(segments[i], { x: centerX + Math.cos(angle) * RING_RADIUS, y: centerY + Math.sin(angle) * RING_RADIUS });
                    Body.setAngle(segments[i], angle);
                }
            }

            for (let b of activeMarbles) {
                const dx = b.position.x - centerX, dy = b.position.y - centerY;
                const distSq = dx*dx + dy*dy;
                Sleeping.set(b, false); 
                if (!isGameOver) {
                    if (distSq > (RING_RADIUS - PHYS_RADIUS * 4) ** 2) {
                        const dist = Math.sqrt(distSq);
                        Body.applyForce(b, b.position, { x: -dx/dist * 0.00018, y: -dy/dist * 0.00018 });
                    }
                    const minSpeed = (activeCount < 10 ? 9 : 7) * speedMultiplier; 
                    if (Vector.magnitude(b.velocity) < minSpeed) {
                       const dir = Vector.normalise(b.velocity.x !== 0 || b.velocity.y !== 0 ? b.velocity : {x: (Math.random()-0.5), y: (Math.random()-0.5)});
                       Body.setVelocity(b, Vector.mult(dir, minSpeed));
                    }
                    if (distSq > (RING_RADIUS + 50) ** 2) {
                        const p = b.label.split('|');
                        b.label = `flag|${p[1]}|${p[2]}|pile`;
                        b.collisionFilter.category = 0x0004;
                        b.collisionFilter.mask = 0x0008 | 0x0004;
                        b.frictionAir = 0.06; b.restitution = 0.1; b.friction = 0.9;
                        Body.setAngularVelocity(b, (Math.random() - 0.5) * 0.4);
                        playElimSound();
                    }
                }
            }

            for (let b of pileMarbles) {
                if (b.isSleeping) continue;
                Body.applyForce(b, b.position, { x: 0, y: 0.0018 * b.mass * speedMultiplier });
                if (b.position.y > height - 70 && Vector.magnitude(b.velocity) < 0.2) Sleeping.set(b, true);
                if (b.position.y > height + 300) World.remove(engine.world, b);
            }

            if (activeCount === 1 && !isGameOver) {
                isGameOver = true;
                const p = activeMarbles[0].label.split('|');
                const champs = JSON.parse(localStorage.getItem('flag_champions') || '[]');
                const existing = champs.find((c: any) => c.code === p[1]);
                if (existing) existing.wins += 1;
                else champs.push({ code: p[1], name: p[2], wins: 1 });
                champs.sort((a: any, b: any) => b.wins - a.wins);
                localStorage.setItem('flag_champions', JSON.stringify(champs.slice(0, 10)));
                targetZoom = isMobile ? 3.0 : 4.5;
                updateLeaderboardUI();
                setTimeout(() => showWinnerUI(p[1], p[2]), 1200);
            }

            if (isGameOver && activeMarbles.length === 1) cameraTarget = { x: activeMarbles[0].position.x, y: activeMarbles[0].position.y };

            currentZoom += (targetZoom - currentZoom) * 0.04;
            currentCamera.x += (cameraTarget.x - currentCamera.x) * 0.04;
            currentCamera.y += (cameraTarget.y - currentCamera.y) * 0.04;

            Engine.update(engine, (1000 / 60) * speedMultiplier);

            ctx.fillStyle = '#020617';
            ctx.fillRect(0, 0, width, height);

            ctx.save();
            ctx.translate(width / 2, height / 2);
            ctx.scale(currentZoom, currentZoom);
            ctx.translate(-currentCamera.x, -currentCamera.y);
            
            const fW = FLAG_SIZE * 1.5, fH = FLAG_SIZE, r = 4;

            for (let b of pileMarbles) {
                const img = getFlagTexture(b.label.split('|')[1]);
                ctx.save();
                ctx.translate(b.position.x, b.position.y);
                ctx.rotate(b.angle);
                ctx.globalAlpha = 0.4;
                drawRoundedRect(ctx, -fW/2, -fH/2, fW, fH, r);
                ctx.clip();
                if (img.complete && img.naturalWidth) ctx.drawImage(img, -fW/2, -fH/2, fW, fH);
                ctx.restore();
            }

            ctx.beginPath();
            ctx.arc(centerX, centerY, RING_RADIUS, currentRotation + GAP_SIZE_RAD, currentRotation + Math.PI * 2);
            ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = isMobile ? 5 : 8; ctx.lineCap = 'round'; ctx.stroke();

            for (let b of activeMarbles) {
                const img = getFlagTexture(b.label.split('|')[1]);
                ctx.save();
                ctx.translate(b.position.x, b.position.y);
                ctx.rotate(b.angle);
                ctx.beginPath(); drawRoundedRect(ctx, -fW/2 - 1.5, -fH/2 - 1.5, fW + 3, fH + 3, r + 1);
                ctx.fillStyle = '#ffffff'; ctx.fill();
                ctx.save(); drawRoundedRect(ctx, -fW/2, -fH/2, fW, fH, r); ctx.clip();
                if (img.complete && img.naturalWidth) ctx.drawImage(img, -fW/2, -fH/2, fW, fH);
                ctx.restore(); ctx.restore();
            }
            ctx.restore();

            const counterEl = document.getElementById('counter');
            if (counterEl) counterEl.innerText = `${activeCount} FIGHTING`;
            animationFrameId = requestAnimationFrame(runLoop);
        };
        runLoop();
    }

    function updateLeaderboardUI() {
        const lb = document.getElementById('leaderboard');
        if (!lb) return;
        const champs = JSON.parse(localStorage.getItem('flag_champions') || '[]').slice(0, 5); 
        lb.innerHTML = champs.map((e: any, i: number) => `
            <div class="flex items-center justify-between py-1 border-b border-white/5">
                <div class="flex items-center gap-2">
                    <span class="text-[9px] font-bold text-sky-400 w-3">${i + 1}</span>
                    <img src="https://flagcdn.com/w40/${e.code}.png" class="w-4 h-3 object-cover rounded-sm">
                    <span class="text-[9px] text-white/70 truncate max-w-[70px]">${e.name}</span>
                </div>
                <div class="text-[9px] font-bold text-sky-300">${e.wins}</div>
            </div>
        `).join('') || '<div class="text-[9px] text-white/20 text-center py-2">BATTLE TO WIN</div>';
    }

    function showWinnerUI(code: string, name: string) {
        const overlay = document.getElementById('winner-overlay');
        const nameEl = document.getElementById('winner-name');
        const flagEl = document.getElementById('winner-flag') as HTMLImageElement;
        const countdownEl = document.getElementById('restart-countdown');
        if (overlay && nameEl && flagEl) {
            nameEl.innerText = name;
            flagEl.src = `https://flagcdn.com/w320/${code}.png`;
            overlay.classList.remove('hidden');
            let timeLeft = 6;
            if (countdownInterval) clearInterval(countdownInterval);
            countdownInterval = setInterval(() => {
                timeLeft--;
                if (countdownEl) countdownEl.innerText = `NEXT BATTLE IN ${timeLeft}S`;
                if (timeLeft <= 0) { clearInterval(countdownInterval); initGame(); }
            }, 1000);
        }
    }

    const goHome = () => {
        if (engine) { World.clear(engine.world, false); Engine.clear(engine); }
        if (canvas) canvas.remove();
        cancelAnimationFrame(animationFrameId);
        if (rotationInterval) clearInterval(rotationInterval);
        if (countdownInterval) clearInterval(countdownInterval);
        homeScreen.style.display = 'flex';
        uiLayer.classList.add('hidden');
        document.getElementById('winner-overlay')?.classList.add('hidden');
        stopBackgroundMusic();
    };

    startBtn.onclick = () => { initAudio(); homeScreen.style.display = 'none'; uiLayer.classList.remove('hidden'); initGame(); };
    backHomeBtn.onclick = goHome;
    winnerHomeBtn.onclick = goHome;
    restartBtn.onclick = () => {
        showInterstitialAd(); // রিস্টার্ট দিলে অ্যাড ট্রিগার হবে
        initGame();
    };
    
    window.addEventListener('resize', () => { if (uiLayer && !uiLayer.classList.contains('hidden')) initGame(); });
};

window.onload = startMain;
