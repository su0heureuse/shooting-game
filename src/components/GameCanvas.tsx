import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameMode, Player, Enemy, Bullet, Particle, FloatingText, PowerUpItem, Star } from '../types/game';
import { sound } from '../utils/sound';
import {
  RotateCcw,
  Volume2,
  VolumeX,
  Music,
  Flame,
  Shield,
  Zap,
  Bomb,
  Heart,
  Trophy,
  Play,
  Pause,
  HelpCircle,
  Crosshair,
  Sparkles
} from 'lucide-react';

interface GameCanvasProps {
  mode: GameMode;
  onModeChange: (newMode: GameMode) => void;
}

const CANVAS_WIDTH = 400;
const CANVAS_HEIGHT = 600;

export const GameCanvas: React.FC<GameCanvasProps> = ({ mode, onModeChange }) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  // High score from local storage
  const [highScore, setHighScore] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('space_shooter_highscore');
      return saved ? parseInt(saved, 10) || 0 : 0;
    } catch {
      return 0;
    }
  });

  // Game UI States
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [shield, setShield] = useState(100);
  const [bombs, setBombs] = useState(1);
  const [powerLevel, setPowerLevel] = useState<1 | 2 | 3>(1);
  const [powerTimeLeft, setPowerTimeLeft] = useState(0);
  const [combo, setCombo] = useState(0);
  const [kills, setKills] = useState(0);
  const [isGameOver, setIsGameOver] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [isNewRecord, setIsNewRecord] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [isBgmOn, setIsBgmOn] = useState(true);
  const [autoFire, setAutoFire] = useState(false);
  const [showHowToPlay, setShowHowToPlay] = useState(false);
  const [scanlines, setScanlines] = useState(true);

  // References for continuous 60fps loop without React re-render lag
  const stateRef = useRef<{
    mode: GameMode;
    score: number;
    highScore: number;
    kills: number;
    combo: number;
    comboTimer: number;
    isGameOver: boolean;
    isPaused: boolean;
    autoFire: boolean;
    keys: Record<string, boolean>;
    player: Player;
    bullets: Bullet[];
    enemies: Enemy[];
    particles: Particle[];
    floatingTexts: FloatingText[];
    powerUps: PowerUpItem[];
    stars: Star[];
    lastSpawnTime: number;
    lastShootTime: number;
    screenShake: number;
    bossActive: boolean;
    bossNextThreshold: number;
  }>({
    mode,
    score: 0,
    highScore: 0,
    kills: 0,
    combo: 0,
    comboTimer: 0,
    isGameOver: false,
    isPaused: false,
    autoFire: false,
    keys: {},
    player: {
      x: CANVAS_WIDTH / 2 - 20,
      y: CANVAS_HEIGHT - 55,
      width: 40,
      height: 40,
      speed: 6,
      lives: mode === 'classic' ? 1 : 3,
      maxLives: 3,
      shield: 100,
      powerLevel: 1,
      powerTimer: 0,
      bombs: mode === 'classic' ? 0 : 2,
      invulnerableTime: 0,
    },
    bullets: [],
    enemies: [],
    particles: [],
    floatingTexts: [],
    powerUps: [],
    stars: [],
    lastSpawnTime: 0,
    lastShootTime: 0,
    screenShake: 0,
    bossActive: false,
    bossNextThreshold: 500,
  });

  // Keep stateRef synced with mode and highScore
  useEffect(() => {
    stateRef.current.mode = mode;
    stateRef.current.highScore = highScore;
    resetGame(mode);
  }, [mode]);

  useEffect(() => {
    stateRef.current.autoFire = autoFire;
  }, [autoFire]);

  // Audio mute sync
  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    sound.setMuted(next);
  };

  const toggleBgm = () => {
    const next = !isBgmOn;
    setIsBgmOn(next);
    if (next && !isMuted && !stateRef.current.isGameOver && !stateRef.current.isPaused) {
      sound.startBgm();
    } else {
      sound.stopBgm();
    }
  };

  // Create background stars
  const initStars = useCallback(() => {
    const stars: Star[] = [];
    const count = mode === 'classic' ? 40 : 65;
    for (let i = 0; i < count; i++) {
      const layer = (Math.random() < 0.6 ? 1 : Math.random() < 0.85 ? 2 : 3) as 1 | 2 | 3;
      stars.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        size: layer === 1 ? Math.random() * 1.2 + 0.8 : layer === 2 ? Math.random() * 1.5 + 1.2 : Math.random() * 2 + 1.8,
        speed: layer === 1 ? 0.6 : layer === 2 ? 1.4 : 2.5,
        alpha: layer === 1 ? 0.4 : layer === 2 ? 0.7 : 0.95,
        layer,
      });
    }
    return stars;
  }, [mode]);

  // Spawn powerup
  const spawnPowerUp = (x: number, y: number) => {
    if (stateRef.current.mode === 'classic') return;
    // 25% chance of item drop
    if (Math.random() > 0.28) return;

    const types: ('double' | 'triple' | 'shield' | 'bomb' | 'heal')[] = [
      'double',
      'triple',
      'shield',
      'bomb',
      'heal',
    ];
    // Weighted selection
    const rand = Math.random();
    let type: 'double' | 'triple' | 'shield' | 'bomb' | 'heal' = 'double';
    if (rand < 0.35) type = 'double';
    else if (rand < 0.55) type = 'triple';
    else if (rand < 0.75) type = 'shield';
    else if (rand < 0.9) type = 'bomb';
    else type = 'heal';

    stateRef.current.powerUps.push({
      id: Math.random().toString(36).substring(2, 9),
      x,
      y,
      width: 24,
      height: 24,
      type,
      vy: 1.8,
      bobOffset: Math.random() * Math.PI * 2,
    });
  };

  // Add explosion particles
  const createExplosion = (x: number, y: number, color = '#ff4d4d', count = 16, intensity: 'small' | 'medium' | 'boss' = 'small') => {
    sound.playExplosion(intensity);
    stateRef.current.screenShake = intensity === 'boss' ? 12 : intensity === 'medium' ? 6 : 3;

    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const speed = Math.random() * (intensity === 'boss' ? 6 : 4) + 1;
      stateRef.current.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        size: Math.random() * 3 + 2,
        color,
        alpha: 1,
        decay: Math.random() * 0.03 + 0.02,
      });
    }
  };

  // Floating text feedback (+10, COMBO x2, SHIELD)
  const addFloatingText = (x: number, y: number, text: string, color = '#f1c40f') => {
    stateRef.current.floatingTexts.push({
      id: Math.random().toString(36).substring(2, 9),
      x,
      y,
      text,
      color,
      alpha: 1,
      vy: -1.2,
    });
  };

  // Shoot bullet
  const shootBullet = useCallback(() => {
    const s = stateRef.current;
    if (s.isGameOver || s.isPaused) return;

    const p = s.player;
    const now = performance.now();
    const cooldown = p.powerLevel === 3 ? 120 : p.powerLevel === 2 ? 150 : 190;
    if (now - s.lastShootTime < cooldown) return;
    s.lastShootTime = now;

    if (s.mode === 'classic' || p.powerLevel === 1) {
      // Classic single shot (matching user code 6x15, speed 8)
      sound.playShoot('single');
      s.bullets.push({
        id: Math.random().toString(36).substring(2, 9),
        x: p.x + p.width / 2 - 3,
        y: p.y,
        vx: 0,
        vy: -8,
        width: 6,
        height: 15,
        damage: 1,
        color: '#f1c40f',
        isPlayer: true,
      });
    } else if (p.powerLevel === 2) {
      // Dual shot
      sound.playShoot('double');
      s.bullets.push(
        {
          id: Math.random().toString(36).substring(2, 9),
          x: p.x + 6,
          y: p.y,
          vx: 0,
          vy: -9,
          width: 5,
          height: 16,
          damage: 1,
          color: '#38bdf8',
          isPlayer: true,
        },
        {
          id: Math.random().toString(36).substring(2, 9),
          x: p.x + p.width - 11,
          y: p.y,
          vx: 0,
          vy: -9,
          width: 5,
          height: 16,
          damage: 1,
          color: '#38bdf8',
          isPlayer: true,
        }
      );
    } else {
      // Triple spread shot
      sound.playShoot('triple');
      s.bullets.push(
        {
          id: Math.random().toString(36).substring(2, 9),
          x: p.x + p.width / 2 - 3,
          y: p.y - 2,
          vx: 0,
          vy: -10,
          width: 6,
          height: 18,
          damage: 1.2,
          color: '#a855f7',
          isPlayer: true,
        },
        {
          id: Math.random().toString(36).substring(2, 9),
          x: p.x + 4,
          y: p.y + 4,
          vx: -1.8,
          vy: -9.5,
          width: 5,
          height: 16,
          damage: 1,
          color: '#c084fc',
          isPlayer: true,
        },
        {
          id: Math.random().toString(36).substring(2, 9),
          x: p.x + p.width - 9,
          y: p.y + 4,
          vx: 1.8,
          vy: -9.5,
          width: 5,
          height: 16,
          damage: 1,
          color: '#c084fc',
          isPlayer: true,
        }
      );
    }
  }, []);

  // Use Bomb (clears screen)
  const useBomb = useCallback(() => {
    const s = stateRef.current;
    if (s.isGameOver || s.isPaused || s.player.bombs <= 0 || s.mode === 'classic') return;

    s.player.bombs -= 1;
    setBombs(s.player.bombs);
    sound.playBomb();

    // Shockwave particles across screen
    for (let i = 0; i < 40; i++) {
      s.particles.push({
        x: Math.random() * CANVAS_WIDTH,
        y: Math.random() * CANVAS_HEIGHT,
        vx: (Math.random() - 0.5) * 8,
        vy: (Math.random() - 0.5) * 8,
        size: Math.random() * 5 + 3,
        color: '#38bdf8',
        alpha: 1,
        decay: 0.02,
      });
    }

    // Damage/Destroy all enemies
    let pointsEarned = 0;
    for (let i = s.enemies.length - 1; i >= 0; i--) {
      const e = s.enemies[i];
      if (e.type === 'boss') {
        e.hp -= 30;
        createExplosion(e.x + e.width / 2, e.y + e.height / 2, '#ec4899', 20, 'medium');
        if (e.hp <= 0) {
          pointsEarned += e.points;
          s.enemies.splice(i, 1);
          s.bossActive = false;
        }
      } else {
        pointsEarned += e.points;
        createExplosion(e.x + e.width / 2, e.y + e.height / 2, '#f87171', 12, 'small');
        s.enemies.splice(i, 1);
      }
    }

    // Clear enemy bullets
    s.bullets = s.bullets.filter(b => b.isPlayer);

    if (pointsEarned > 0) {
      s.score += pointsEarned;
      setScore(s.score);
      addFloatingText(CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2, `MEGA BOMB! +${pointsEarned}`, '#38bdf8');
    }
  }, []);

  // Reset Game
  const resetGame = useCallback((targetMode?: GameMode) => {
    const activeMode = targetMode || stateRef.current.mode;
    const isClassic = activeMode === 'classic';

    stateRef.current.score = 0;
    stateRef.current.kills = 0;
    stateRef.current.combo = 0;
    stateRef.current.comboTimer = 0;
    stateRef.current.isGameOver = false;
    stateRef.current.isPaused = false;
    stateRef.current.bossActive = false;
    stateRef.current.bossNextThreshold = 500;
    stateRef.current.bullets = [];
    stateRef.current.enemies = [];
    stateRef.current.particles = [];
    stateRef.current.floatingTexts = [];
    stateRef.current.powerUps = [];
    stateRef.current.stars = initStars();

    stateRef.current.player = {
      x: CANVAS_WIDTH / 2 - 20,
      y: CANVAS_HEIGHT - 55,
      width: 40,
      height: 40,
      speed: 6,
      lives: isClassic ? 1 : 3,
      maxLives: 3,
      shield: 100,
      powerLevel: 1,
      powerTimer: 0,
      bombs: isClassic ? 0 : 2,
      invulnerableTime: 0,
    };

    setScore(0);
    setKills(0);
    setCombo(0);
    setLives(isClassic ? 1 : 3);
    setShield(100);
    setBombs(isClassic ? 0 : 2);
    setPowerLevel(1);
    setPowerTimeLeft(0);
    setIsGameOver(false);
    setIsPaused(false);
    setIsNewRecord(false);

    if (isBgmOn && !isMuted) {
      sound.startBgm();
    }
  }, [initStars, isBgmOn, isMuted]);

  // Handle Game Over
  const triggerGameOver = useCallback(() => {
    const s = stateRef.current;
    if (s.isGameOver) return;
    s.isGameOver = true;
    setIsGameOver(true);
    sound.stopBgm();
    sound.playGameOver();

    // Check high score
    if (s.score > s.highScore) {
      setHighScore(s.score);
      setIsNewRecord(true);
      try {
        localStorage.setItem('space_shooter_highscore', s.score.toString());
      } catch {
        // storage fallback
      }
    }
  }, []);

  // Spawn Enemy Logic
  const spawnEnemy = useCallback(() => {
    const s = stateRef.current;
    if (s.isGameOver || s.isPaused) return;

    // Boss Spawn Check in Arcade Mode
    if (s.mode === 'arcade' && !s.bossActive && s.score >= s.bossNextThreshold) {
      s.bossActive = true;
      s.bossNextThreshold += 800; // Next boss at score + 800
      sound.playPowerUp();
      addFloatingText(CANVAS_WIDTH / 2, 80, '⚠️ WARNING: MOTHERSHIP APPROACHING ⚠️', '#ef4444');

      s.enemies.push({
        id: 'boss-' + Date.now(),
        type: 'boss',
        x: CANVAS_WIDTH / 2 - 60,
        y: -90,
        width: 120,
        height: 70,
        speed: 1.0,
        hp: 40 + Math.floor(s.score / 20),
        maxHp: 40 + Math.floor(s.score / 20),
        points: 250,
        vx: 1.5,
        age: 0,
        shootCooldown: 60,
      });
      return;
    }

    // Classic Mode: exactly as user's original (size 30, speed 2 + random*2.5, red square)
    if (s.mode === 'classic') {
      const size = 30;
      s.enemies.push({
        id: Math.random().toString(36).substring(2, 9),
        type: 'drone',
        x: Math.random() * (CANVAS_WIDTH - size),
        y: -size,
        width: size,
        height: size,
        speed: 2 + Math.random() * 2.5,
        hp: 1,
        maxHp: 1,
        points: 10,
        vx: 0,
        age: 0,
      });
      return;
    }

    // Arcade Mode: varied enemy types based on score
    const rand = Math.random();
    let type: 'drone' | 'swarmer' | 'zigzag' | 'asteroid' = 'drone';
    let size = 30;
    let speed = 2.2 + Math.random() * 2;
    let hp = 1;
    let points = 10;
    let vx = 0;

    if (rand < 0.45) {
      // Standard Drone
      type = 'drone';
      size = 30;
      speed = 2.0 + Math.random() * 2.2;
      hp = 1;
      points = 10;
    } else if (rand < 0.7) {
      // Fast Swarmer
      type = 'swarmer';
      size = 24;
      speed = 3.6 + Math.random() * 2.0;
      hp = 1;
      points = 20;
    } else if (rand < 0.88) {
      // Zigzag Cruiser
      type = 'zigzag';
      size = 32;
      speed = 1.8 + Math.random() * 1.5;
      hp = 2;
      points = 30;
      vx = (Math.random() > 0.5 ? 1 : -1) * 2;
    } else {
      // Armored Asteroid
      type = 'asteroid';
      size = 38;
      speed = 1.3 + Math.random() * 1.2;
      hp = 3;
      points = 40;
    }

    s.enemies.push({
      id: Math.random().toString(36).substring(2, 9),
      type,
      x: Math.random() * (CANVAS_WIDTH - size),
      y: -size,
      width: size,
      height: size,
      speed,
      hp,
      maxHp: hp,
      points,
      vx,
      age: 0,
    });
  }, []);

  // Keyboard Event Handlers
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Prevent default scrolling for game controls
      if (['Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(e.code)) {
        e.preventDefault();
      }

      stateRef.current.keys[e.code] = true;

      // Restart key [R]
      if (e.code === 'KeyR') {
        resetGame();
        return;
      }

      // Pause key [P]
      if (e.code === 'KeyP') {
        setIsPaused(prev => {
          const next = !prev;
          stateRef.current.isPaused = next;
          if (next) sound.stopBgm();
          else if (isBgmOn && !isMuted && !stateRef.current.isGameOver) sound.startBgm();
          return next;
        });
        return;
      }

      // Bomb key [B]
      if (e.code === 'KeyB') {
        useBomb();
        return;
      }

      // Mute key [M]
      if (e.code === 'KeyM') {
        toggleMute();
        return;
      }

      // Space to shoot
      if (e.code === 'Space') {
        shootBullet();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      stateRef.current.keys[e.code] = false;
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [resetGame, shootBullet, useBomb, isBgmOn, isMuted]);

  // Main Game Loop (Canvas RequestAnimationFrame)
  useEffect(() => {
    let animationFrameId: number;
    let spawnTimerId: number;

    // Enemy spawn interval matching user's original 900ms (or slightly faster as score increases)
    const getSpawnInterval = () => {
      const base = 900;
      if (stateRef.current.mode === 'classic') return base;
      const reduction = Math.min(350, Math.floor(stateRef.current.score / 200) * 40);
      return Math.max(500, base - reduction);
    };

    const scheduleSpawn = () => {
      spawnTimerId = window.setTimeout(() => {
        spawnEnemy();
        scheduleSpawn();
      }, getSpawnInterval());
    };
    scheduleSpawn();

    // Game loop
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    stateRef.current.stars = initStars();

    const loop = (timestamp: number) => {
      const s = stateRef.current;
      const p = s.player;

      // 1. UPDATE PHASE
      // Always update background stars
      s.stars.forEach(st => {
        st.y += st.speed;
        if (st.y > CANVAS_HEIGHT) {
          st.y = 0;
          st.x = Math.random() * CANVAS_WIDTH;
        }
      });

      if (!s.isGameOver && !s.isPaused) {
        // Auto-fire if enabled or Space held down
        if (s.autoFire || s.keys['Space']) {
          shootBullet();
        }

        // Power-up countdown in Arcade mode
        if (p.powerTimer > 0) {
          p.powerTimer -= 16.6;
          if (p.powerTimer <= 0) {
            p.powerLevel = 1;
            setPowerLevel(1);
            setPowerTimeLeft(0);
          } else {
            setPowerTimeLeft(Math.ceil(p.powerTimer / 1000));
          }
        }

        // Invulnerable timer decay
        if (p.invulnerableTime > 0) {
          p.invulnerableTime -= 0.016;
        }

        // Combo decay timer
        if (s.combo > 0) {
          s.comboTimer -= 16.6;
          if (s.comboTimer <= 0) {
            s.combo = 0;
            setCombo(0);
          }
        }

        // Player movement [ArrowLeft / A] & [ArrowRight / D]
        const isLeft = s.keys['ArrowLeft'] || s.keys['KeyA'];
        const isRight = s.keys['ArrowRight'] || s.keys['KeyD'];
        const isUp = s.keys['ArrowUp'] || s.keys['KeyW'];
        const isDown = s.keys['ArrowDown'] || s.keys['KeyS'];

        if (isLeft && p.x > 0) {
          p.x -= p.speed;
        }
        if (isRight && p.x < CANVAS_WIDTH - p.width) {
          p.x += p.speed;
        }
        // In Arcade mode, allow slight vertical maneuvering in the bottom quarter of the screen
        if (s.mode === 'arcade') {
          if (isUp && p.y > CANVAS_HEIGHT - 180) {
            p.y -= p.speed * 0.75;
          }
          if (isDown && p.y < CANVAS_HEIGHT - p.height - 10) {
            p.y += p.speed * 0.75;
          }
        }

        // Thruster exhaust particles
        if (Math.random() < 0.6) {
          s.particles.push({
            x: p.x + p.width / 2 + (Math.random() - 0.5) * 8,
            y: p.y + p.height - 4,
            vx: (Math.random() - 0.5) * 0.8,
            vy: Math.random() * 2 + 2,
            size: Math.random() * 2.5 + 1.5,
            color: p.powerLevel > 1 ? '#38bdf8' : '#f59e0b',
            alpha: 0.8,
            decay: 0.05,
          });
        }

        // Update Bullets
        for (let i = s.bullets.length - 1; i >= 0; i--) {
          const b = s.bullets[i];
          b.x += b.vx;
          b.y += b.vy;

          if (b.y < -20 || b.y > CANVAS_HEIGHT + 20 || b.x < -20 || b.x > CANVAS_WIDTH + 20) {
            s.bullets.splice(i, 1);
          }
        }

        // Update Power-ups
        for (let i = s.powerUps.length - 1; i >= 0; i--) {
          const item = s.powerUps[i];
          item.y += item.vy;
          item.bobOffset += 0.05;

          // Check pickup collision with player
          if (
            p.x < item.x + item.width &&
            p.x + p.width > item.x &&
            p.y < item.y + item.height &&
            p.y + p.height > item.y
          ) {
            sound.playPowerUp();
            if (item.type === 'double') {
              p.powerLevel = 2;
              p.powerTimer = 12000;
              setPowerLevel(2);
              addFloatingText(item.x, item.y, 'DUAL LASER! ⚡', '#38bdf8');
            } else if (item.type === 'triple') {
              p.powerLevel = 3;
              p.powerTimer = 10000;
              setPowerLevel(3);
              addFloatingText(item.x, item.y, 'TRIPLE PLASMA! 🔥', '#a855f7');
            } else if (item.type === 'shield') {
              p.shield = Math.min(100, p.shield + 50);
              setShield(p.shield);
              sound.playShield();
              addFloatingText(item.x, item.y, 'SHIELD +50% 🛡️', '#10b981');
            } else if (item.type === 'bomb') {
              p.bombs = Math.min(3, p.bombs + 1);
              setBombs(p.bombs);
              addFloatingText(item.x, item.y, '+1 MEGA BOMB 💣', '#f59e0b');
            } else if (item.type === 'heal') {
              if (p.lives < p.maxLives) {
                p.lives += 1;
                setLives(p.lives);
                addFloatingText(item.x, item.y, '+1 LIFE ❤️', '#ef4444');
              } else {
                p.shield = 100;
                setShield(100);
                addFloatingText(item.x, item.y, 'SHIELD MAX! 🛡️', '#10b981');
              }
            }
            s.powerUps.splice(i, 1);
            continue;
          }

          if (item.y > CANVAS_HEIGHT + 30) {
            s.powerUps.splice(i, 1);
          }
        }

        // Update Enemies
        for (let i = s.enemies.length - 1; i >= 0; i--) {
          const e = s.enemies[i];
          e.age += 1;

          // Movement behavior by type
          if (e.type === 'boss') {
            // Boss descends to y = 50 then hovers side to side
            if (e.y < 50) {
              e.y += e.speed;
            } else {
              e.x += e.vx;
              if (e.x <= 20 || e.x >= CANVAS_WIDTH - e.width - 20) {
                e.vx *= -1;
              }

              // Boss shoots periodic plasma orbs
              e.shootCooldown = (e.shootCooldown || 60) - 1;
              if (e.shootCooldown <= 0) {
                e.shootCooldown = 65;
                sound.playShoot('laser');
                s.bullets.push(
                  {
                    id: Math.random().toString(36).substring(2, 9),
                    x: e.x + 25,
                    y: e.y + e.height,
                    vx: -1.2,
                    vy: 4.5,
                    width: 7,
                    height: 12,
                    damage: 1,
                    color: '#ef4444',
                    isPlayer: false,
                  },
                  {
                    id: Math.random().toString(36).substring(2, 9),
                    x: e.x + e.width - 25,
                    y: e.y + e.height,
                    vx: 1.2,
                    vy: 4.5,
                    width: 7,
                    height: 12,
                    damage: 1,
                    color: '#ef4444',
                    isPlayer: false,
                  }
                );
              }
            }
          } else if (e.type === 'zigzag') {
            e.y += e.speed;
            e.x += Math.sin(e.age * 0.08) * 3;
            // Keep in bounds
            e.x = Math.max(0, Math.min(CANVAS_WIDTH - e.width, e.x));
          } else {
            e.y += e.speed;
          }

          // Check if enemy reached bottom of canvas
          if (e.y > CANVAS_HEIGHT) {
            if (s.mode === 'classic') {
              // Classic Mode: reaching bottom is instant game over! (Matches user code)
              triggerGameOver();
              return;
            } else {
              // Arcade Mode: damage shield/life and shake screen
              s.enemies.splice(i, 1);
              createExplosion(e.x + e.width / 2, CANVAS_HEIGHT - 10, '#ef4444', 10, 'medium');
              if (p.shield > 0) {
                p.shield = Math.max(0, p.shield - 35);
                setShield(p.shield);
                sound.playHit();
              } else {
                p.lives -= 1;
                setLives(p.lives);
                sound.playHit();
                if (p.lives <= 0) {
                  triggerGameOver();
                  return;
                }
              }
              continue;
            }
          }

          // Check collision with player
          if (
            p.x < e.x + e.width &&
            p.x + p.width > e.x &&
            p.y < e.y + e.height &&
            p.y + p.height > e.y
          ) {
            if (p.invulnerableTime <= 0) {
              if (s.mode === 'classic') {
                createExplosion(p.x + p.width / 2, p.y + p.height / 2, '#3498db', 25, 'medium');
                triggerGameOver();
                return;
              } else {
                // Arcade Mode: shield absorbs damage first
                p.invulnerableTime = 1.2; // brief recovery
                if (p.shield >= 40) {
                  p.shield -= 40;
                  setShield(p.shield);
                  sound.playShield();
                  createExplosion(p.x + p.width / 2, p.y + p.height / 2, '#38bdf8', 12, 'small');
                } else if (p.shield > 0) {
                  p.shield = 0;
                  setShield(0);
                  sound.playShield();
                  createExplosion(p.x + p.width / 2, p.y + p.height / 2, '#38bdf8', 12, 'small');
                } else {
                  p.lives -= 1;
                  setLives(p.lives);
                  createExplosion(p.x + p.width / 2, p.y + p.height / 2, '#ef4444', 20, 'medium');
                  if (p.lives <= 0) {
                    triggerGameOver();
                    return;
                  }
                }

                // If non-boss, destroy collided enemy
                if (e.type !== 'boss') {
                  s.enemies.splice(i, 1);
                  continue;
                }
              }
            }
          }

          // Check collision with player bullets
          for (let j = s.bullets.length - 1; j >= 0; j--) {
            const b = s.bullets[j];
            if (!b.isPlayer) continue;

            if (
              b.x < e.x + e.width &&
              b.x + b.width > e.x &&
              b.y < e.y + e.height &&
              b.y + b.height > e.y
            ) {
              // Bullet hit enemy
              s.bullets.splice(j, 1);
              e.hp -= b.damage;

              // Spark on hit
              s.particles.push({
                x: b.x,
                y: b.y,
                vx: (Math.random() - 0.5) * 3,
                vy: (Math.random() - 0.5) * 3,
                size: 2,
                color: '#fef08a',
                alpha: 1,
                decay: 0.08,
              });

              if (e.hp <= 0) {
                // Enemy Destroyed
                const isBoss = e.type === 'boss';
                const explosionColor =
                  e.type === 'swarmer'
                    ? '#facc15'
                    : e.type === 'zigzag'
                    ? '#c084fc'
                    : e.type === 'asteroid'
                    ? '#94a3b8'
                    : isBoss
                    ? '#f43f5e'
                    : '#e74c3c';

                createExplosion(
                  e.x + e.width / 2,
                  e.y + e.height / 2,
                  explosionColor,
                  isBoss ? 45 : 16,
                  isBoss ? 'boss' : e.type === 'asteroid' ? 'medium' : 'small'
                );

                if (isBoss) {
                  s.bossActive = false;
                }

                // Combo calculation (in arcade mode)
                let multiplier = 1;
                if (s.mode === 'arcade') {
                  s.combo += 1;
                  s.comboTimer = 2200; // 2.2s combo window
                  multiplier = s.combo >= 10 ? 3 : s.combo >= 5 ? 2 : s.combo >= 3 ? 1.5 : 1;
                  setCombo(s.combo);
                }

                const gainedPoints = Math.round(e.points * multiplier);
                s.score += gainedPoints;
                s.kills += 1;
                setScore(s.score);
                setKills(s.kills);

                // Floating text
                if (multiplier > 1) {
                  addFloatingText(e.x + e.width / 2, e.y, `+${gainedPoints} (x${multiplier})`, '#facc15');
                } else {
                  addFloatingText(e.x + e.width / 2, e.y, `+${gainedPoints}`, '#ffffff');
                }

                // Chance to drop powerup
                spawnPowerUp(e.x + e.width / 2 - 12, e.y + e.height / 2 - 12);

                s.enemies.splice(i, 1);
                break;
              } else {
                sound.playHit();
              }
            }
          }
        }

        // Check enemy bullets hitting player (boss bullets)
        for (let j = s.bullets.length - 1; j >= 0; j--) {
          const b = s.bullets[j];
          if (b.isPlayer) continue;

          if (
            b.x < p.x + p.width &&
            b.x + b.width > p.x &&
            b.y < p.y + p.height &&
            b.y + b.height > p.y
          ) {
            s.bullets.splice(j, 1);
            if (p.invulnerableTime <= 0) {
              p.invulnerableTime = 0.8;
              if (p.shield > 0) {
                p.shield = Math.max(0, p.shield - 25);
                setShield(p.shield);
                sound.playShield();
              } else {
                p.lives -= 1;
                setLives(p.lives);
                sound.playHit();
                if (p.lives <= 0) {
                  triggerGameOver();
                  return;
                }
              }
            }
          }
        }

        // Update Particles
        for (let i = s.particles.length - 1; i >= 0; i--) {
          const pt = s.particles[i];
          pt.x += pt.vx;
          pt.y += pt.vy;
          pt.alpha -= pt.decay;
          if (pt.alpha <= 0) {
            s.particles.splice(i, 1);
          }
        }

        // Update Floating Texts
        for (let i = s.floatingTexts.length - 1; i >= 0; i--) {
          const ft = s.floatingTexts[i];
          ft.y += ft.vy;
          ft.alpha -= 0.025;
          if (ft.alpha <= 0) {
            s.floatingTexts.splice(i, 1);
          }
        }

        // Screen Shake decay
        if (s.screenShake > 0) {
          s.screenShake *= 0.88;
          if (s.screenShake < 0.2) s.screenShake = 0;
        }
      }

      // 2. RENDER PHASE
      ctx.save();

      // Screen Shake translation
      if (s.screenShake > 0) {
        const shakeX = (Math.random() - 0.5) * s.screenShake * 2;
        const shakeY = (Math.random() - 0.5) * s.screenShake * 2;
        ctx.translate(shakeX, shakeY);
      }

      ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Deep space gradient
      const bgGrad = ctx.createLinearGradient(0, 0, 0, CANVAS_HEIGHT);
      bgGrad.addColorStop(0, '#090b14');
      bgGrad.addColorStop(1, '#0e1428');
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

      // Starfield rendering
      s.stars.forEach(st => {
        ctx.fillStyle = `rgba(255, 255, 255, ${st.alpha})`;
        if (st.layer === 3) {
          // Bright star with subtle glow
          ctx.beginPath();
          ctx.arc(st.x, st.y, st.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(st.x, st.y, st.size, st.size);
        }
      });

      // Render Power-up items
      s.powerUps.forEach(item => {
        const floatY = item.y + Math.sin(item.bobOffset) * 3;
        ctx.save();
        ctx.translate(item.x + item.width / 2, floatY + item.height / 2);

        // Glowing circle container
        const glowColor =
          item.type === 'double'
            ? '#38bdf8'
            : item.type === 'triple'
            ? '#a855f7'
            : item.type === 'shield'
            ? '#10b981'
            : item.type === 'bomb'
            ? '#f59e0b'
            : '#ef4444';

        ctx.shadowColor = glowColor;
        ctx.shadowBlur = 10;
        ctx.fillStyle = '#0f172a';
        ctx.strokeStyle = glowColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(0, 0, item.width / 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();

        // Icon text inside badge
        ctx.font = 'bold 11px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = glowColor;
        const iconChar =
          item.type === 'double'
            ? '2X'
            : item.type === 'triple'
            ? '3X'
            : item.type === 'shield'
            ? 'SH'
            : item.type === 'bomb'
            ? '💣'
            : '❤️';
        ctx.fillText(iconChar, 0, 0);

        ctx.restore();
      });

      // Render Bullets
      s.bullets.forEach(b => {
        ctx.save();
        ctx.shadowColor = b.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = b.color;

        if (b.isPlayer) {
          // Laser beam rounded rectangle
          ctx.beginPath();
          ctx.roundRect(b.x, b.y, b.width, b.height, 3);
          ctx.fill();

          // White hot inner core
          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(b.x + 1.5, b.y + 2, b.width - 3, b.height - 4, 2);
          ctx.fill();
        } else {
          // Enemy orb
          ctx.beginPath();
          ctx.arc(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      });

      // Render Enemies
      s.enemies.forEach(e => {
        ctx.save();
        if (s.mode === 'classic') {
          // Classic mode: exact red rectangle as user's original code `#e74c3c`
          ctx.fillStyle = '#e74c3c';
          ctx.fillRect(e.x, e.y, e.width, e.height);
          // Classic retro inner frame
          ctx.fillStyle = '#c0392b';
          ctx.fillRect(e.x + 4, e.y + 4, e.width - 8, e.height - 8);
        } else {
          // Arcade Mode: Rich vector-rendered spacecrafts
          if (e.type === 'boss') {
            // Giant Mothership
            ctx.shadowColor = '#f43f5e';
            ctx.shadowBlur = 15;

            // Wings
            ctx.fillStyle = '#1e1b4b';
            ctx.strokeStyle = '#f43f5e';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(e.x, e.y + 25);
            ctx.lineTo(e.x + e.width / 2, e.y + e.height);
            ctx.lineTo(e.x + e.width, e.y + 25);
            ctx.lineTo(e.x + e.width - 15, e.y);
            ctx.lineTo(e.x + 15, e.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Glowing cockpit & cannons
            ctx.fillStyle = '#f43f5e';
            ctx.beginPath();
            ctx.arc(e.x + e.width / 2, e.y + 35, 12, 0, Math.PI * 2);
            ctx.fill();

            // Twin cannon tips
            ctx.fillStyle = '#fb7185';
            ctx.fillRect(e.x + 22, e.y + e.height - 8, 8, 8);
            ctx.fillRect(e.x + e.width - 30, e.y + e.height - 8, 8, 8);

            // Boss HP Bar above ship
            const barWidth = 90;
            const barHeight = 6;
            const hpRatio = Math.max(0, e.hp / e.maxHp);
            ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
            ctx.fillRect(e.x + (e.width - barWidth) / 2, e.y - 14, barWidth, barHeight);
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(e.x + (e.width - barWidth) / 2, e.y - 14, barWidth * hpRatio, barHeight);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.strokeRect(e.x + (e.width - barWidth) / 2, e.y - 14, barWidth, barHeight);
          } else if (e.type === 'swarmer') {
            // Fast Arrowhead Swarmer
            ctx.shadowColor = '#facc15';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#854d0e';
            ctx.strokeStyle = '#facc15';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(e.x + e.width / 2, e.y + e.height);
            ctx.lineTo(e.x, e.y);
            ctx.lineTo(e.x + e.width / 2, e.y + 6);
            ctx.lineTo(e.x + e.width, e.y);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
          } else if (e.type === 'zigzag') {
            // Purple Scout Cruiser
            ctx.shadowColor = '#c084fc';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#581c87';
            ctx.strokeStyle = '#c084fc';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(e.x + e.width / 2, e.y + e.height);
            ctx.lineTo(e.x, e.y + 10);
            ctx.lineTo(e.x + 8, e.y);
            ctx.lineTo(e.x + e.width - 8, e.y);
            ctx.lineTo(e.x + e.width, e.y + 10);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Core
            ctx.fillStyle = '#d8b4fe';
            ctx.fillRect(e.x + e.width / 2 - 3, e.y + 10, 6, 8);
          } else if (e.type === 'asteroid') {
            // Armored Polygon Asteroid
            ctx.fillStyle = '#475569';
            ctx.strokeStyle = '#94a3b8';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(e.x + 10, e.y);
            ctx.lineTo(e.x + e.width - 8, e.y + 6);
            ctx.lineTo(e.x + e.width, e.y + e.height - 10);
            ctx.lineTo(e.x + e.width - 12, e.y + e.height);
            ctx.lineTo(e.x + 6, e.y + e.height - 6);
            ctx.lineTo(e.x, e.y + 14);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Craters
            ctx.fillStyle = '#334155';
            ctx.beginPath();
            ctx.arc(e.x + 14, e.y + 14, 4, 0, Math.PI * 2);
            ctx.arc(e.x + 24, e.y + 22, 6, 0, Math.PI * 2);
            ctx.fill();
          } else {
            // Red Drone (Stealth Fighter)
            ctx.shadowColor = '#ef4444';
            ctx.shadowBlur = 8;
            ctx.fillStyle = '#7f1d1d';
            ctx.strokeStyle = '#ef4444';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.moveTo(e.x + e.width / 2, e.y + e.height);
            ctx.lineTo(e.x + 2, e.y + 4);
            ctx.lineTo(e.x + 10, e.y);
            ctx.lineTo(e.x + e.width - 10, e.y);
            ctx.lineTo(e.x + e.width - 2, e.y + 4);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Eye / Core
            ctx.fillStyle = '#f87171';
            ctx.fillRect(e.x + e.width / 2 - 3, e.y + 8, 6, 6);
          }
        }
        ctx.restore();
      });

      // Render Player Ship
      if (!s.isGameOver) {
        ctx.save();
        const isFlickering = p.invulnerableTime > 0 && Math.floor(timestamp / 60) % 2 === 0;

        if (!isFlickering) {
          if (s.mode === 'classic') {
            // Classic player: `#3498db` with clean arcade contour
            ctx.fillStyle = '#3498db';
            ctx.fillRect(p.x, p.y, p.width, p.height);

            // Sleek inner cockpit highlight
            ctx.fillStyle = '#2980b9';
            ctx.fillRect(p.x + 6, p.y + 8, p.width - 12, p.height - 14);
            ctx.fillStyle = '#ecf0f1';
            ctx.fillRect(p.x + p.width / 2 - 3, p.y + 4, 6, 10);
          } else {
            // Arcade high-tech fighter craft
            ctx.shadowColor = p.powerLevel > 1 ? '#38bdf8' : '#0284c7';
            ctx.shadowBlur = 10;

            // Wings
            ctx.fillStyle = '#0369a1';
            ctx.strokeStyle = '#38bdf8';
            ctx.lineWidth = 1.8;
            ctx.beginPath();
            ctx.moveTo(p.x + p.width / 2, p.y); // nose
            ctx.lineTo(p.x + p.width, p.y + p.height - 4); // right wing tip
            ctx.lineTo(p.x + p.width - 10, p.y + p.height - 10);
            ctx.lineTo(p.x + p.width / 2 + 5, p.y + p.height - 2);
            ctx.lineTo(p.x + p.width / 2 - 5, p.y + p.height - 2);
            ctx.lineTo(p.x + 10, p.y + p.height - 10);
            ctx.lineTo(p.x, p.y + p.height - 4); // left wing tip
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Cockpit canopy
            ctx.fillStyle = '#e0f2fe';
            ctx.beginPath();
            ctx.ellipse(p.x + p.width / 2, p.y + 16, 5, 10, 0, 0, Math.PI * 2);
            ctx.fill();

            // Wing cannons
            ctx.fillStyle = '#93c5fd';
            ctx.fillRect(p.x + 2, p.y + p.height - 14, 4, 10);
            ctx.fillRect(p.x + p.width - 6, p.y + p.height - 14, 4, 10);

            // Shield Aura (if shield > 0)
            if (p.shield > 0) {
              ctx.strokeStyle = `rgba(56, 189, 248, ${0.35 + (p.shield / 100) * 0.45})`;
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.arc(p.x + p.width / 2, p.y + p.height / 2, p.width * 0.72, 0, Math.PI * 2);
              ctx.stroke();
            }
          }
        }
        ctx.restore();
      }

      // Render Particles
      s.particles.forEach(pt => {
        ctx.save();
        ctx.fillStyle = pt.color;
        ctx.globalAlpha = Math.max(0, pt.alpha);
        ctx.beginPath();
        ctx.arc(pt.x, pt.y, pt.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });

      // Render Floating Text
      s.floatingTexts.forEach(ft => {
        ctx.save();
        ctx.font = 'bold 13px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillStyle = ft.color;
        ctx.globalAlpha = Math.max(0, ft.alpha);
        ctx.shadowColor = '#000000';
        ctx.shadowBlur = 4;
        ctx.fillText(ft.text, ft.x, ft.y);
        ctx.restore();
      });

      // Render Game Over screen over canvas (matching user spec + enhanced)
      if (s.isGameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.82)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.fillStyle = '#ff4d4d';
        ctx.font = 'bold 32px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.shadowColor = '#ff4d4d';
        ctx.shadowBlur = 10;
        ctx.fillText('GAME OVER', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 45);

        ctx.shadowBlur = 0;
        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 18px Arial, sans-serif';
        ctx.fillText(`최종 점수: ${s.score.toLocaleString()}점`, CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 5);

        if (s.score > 0 && s.score >= s.highScore) {
          ctx.fillStyle = '#fbbf24';
          ctx.font = 'bold 14px Arial, sans-serif';
          ctx.fillText('🏆 최고 기록 갱신! (NEW RECORD)', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 35);
        }

        ctx.fillStyle = '#94a3b8';
        ctx.font = '15px Arial, sans-serif';
        ctx.fillText('[R] 키를 눌러 다시 시작', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 75);
      }

      // Pause Overlay
      if (s.isPaused && !s.isGameOver) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 28px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('PAUSED (일시 정지)', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 - 10);

        ctx.fillStyle = '#ffffff';
        ctx.font = '15px Arial, sans-serif';
        ctx.fillText('[P] 키 또는 재개 버튼을 누르세요', CANVAS_WIDTH / 2, CANVAS_HEIGHT / 2 + 30);
      }

      ctx.restore();

      animationFrameId = requestAnimationFrame(loop);
    };

    animationFrameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animationFrameId);
      clearTimeout(spawnTimerId);
    };
  }, [initStars, resetGame, shootBullet, triggerGameOver, spawnEnemy]);

  // Touch control handlers
  const handleTouchMove = (direction: 'left' | 'right', active: boolean) => {
    stateRef.current.keys[direction === 'left' ? 'ArrowLeft' : 'ArrowRight'] = active;
  };

  // Direct canvas touch/drag interaction
  const handleCanvasTouch = (e: React.TouchEvent<HTMLCanvasElement>) => {
    if (stateRef.current.isGameOver || stateRef.current.isPaused) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const touch = e.touches[0];
    if (!touch) return;

    const scaleX = CANVAS_WIDTH / rect.width;
    const clientX = (touch.clientX - rect.left) * scaleX;

    // Center player on touch X
    const targetX = clientX - stateRef.current.player.width / 2;
    stateRef.current.player.x = Math.max(0, Math.min(CANVAS_WIDTH - stateRef.current.player.width, targetX));
  };

  return (
    <div className="flex flex-col items-center justify-center w-full min-h-screen bg-slate-950 text-slate-100 p-2 sm:p-4 select-none">
      {/* Top Header / Mode Switcher */}
      <header className="w-full max-w-md flex items-center justify-between mb-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-sky-500/20 border border-sky-500/40 flex items-center justify-center text-sky-400">
            <Crosshair className="w-5 h-5 animate-spin" style={{ animationDuration: '10s' }} />
          </div>
          <div>
            <h1 className="text-base sm:text-lg font-bold tracking-tight text-white flex items-center gap-2">
              간단 슈팅 게임
              <span className="text-xs px-2 py-0.5 rounded bg-sky-500/20 border border-sky-400/30 text-sky-300 font-mono">
                v2.0
              </span>
            </h1>
            <p className="text-[11px] text-slate-400">레트로 2D 우주 요격전</p>
          </div>
        </div>

        {/* Mode Selector Tabs */}
        <div className="flex bg-slate-900 border border-slate-800 rounded-lg p-1 text-xs font-medium">
          <button
            onClick={() => {
              onModeChange('classic');
              sound.playClick();
            }}
            className={`px-2.5 py-1 rounded transition-all ${
              mode === 'classic'
                ? 'bg-sky-600 text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            클래식
          </button>
          <button
            onClick={() => {
              onModeChange('arcade');
              sound.playClick();
            }}
            className={`px-2.5 py-1 rounded transition-all ${
              mode === 'arcade'
                ? 'bg-gradient-to-r from-purple-600 to-indigo-600 text-white shadow-sm font-semibold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            아케이드
          </button>
        </div>
      </header>

      {/* Primary Info Bar (Matching user specification: 점수: 0 | 조작법: [← / →] 이동, [Space] 발사) */}
      <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-xl px-4 py-2.5 mb-2.5 flex items-center justify-between text-sm shadow-md backdrop-blur-sm">
        <div className="flex items-center gap-2">
          <span className="text-slate-400 font-medium">점수:</span>
          <span id="score" className="text-xl font-bold font-mono text-amber-400">
            {score.toLocaleString()}
          </span>
          {combo >= 3 && mode === 'arcade' && (
            <span className="text-xs font-bold text-amber-300 px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 animate-pulse">
              {combo} COMBO 🔥
            </span>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-xs text-slate-400">
          <span>조작법:</span>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-[11px]">
            ← / →
          </kbd>
          <span>이동</span>
          <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-slate-200 text-[11px]">
            Space
          </kbd>
          <span>발사</span>
        </div>

        {/* High Score Badge */}
        <div className="flex items-center gap-1 text-xs text-slate-400">
          <Trophy className="w-3.5 h-3.5 text-amber-400" />
          <span className="font-mono font-semibold text-slate-200">{highScore.toLocaleString()}</span>
        </div>
      </div>

      {/* Arcade Status Bar (Lives, Shields, Weapon Power, Bombs) - Only shown in Arcade mode */}
      {mode === 'arcade' && (
        <div className="w-full max-w-md bg-slate-900/80 border border-slate-800/80 rounded-lg px-3 py-1.5 mb-2 flex items-center justify-between text-xs text-slate-300">
          {/* Lives */}
          <div className="flex items-center gap-1">
            <span className="text-slate-400 text-[11px]">생명:</span>
            <div className="flex gap-0.5">
              {[...Array(3)].map((_, i) => (
                <Heart
                  key={i}
                  className={`w-3.5 h-3.5 ${
                    i < lives ? 'text-rose-500 fill-rose-500' : 'text-slate-700'
                  }`}
                />
              ))}
            </div>
          </div>

          {/* Shield Bar */}
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5 text-sky-400" />
            <div className="w-16 h-2 bg-slate-800 rounded-full overflow-hidden border border-slate-700">
              <div
                className="h-full bg-gradient-to-r from-sky-500 to-teal-400 transition-all duration-200"
                style={{ width: `${shield}%` }}
              />
            </div>
            <span className="font-mono text-[10px] text-sky-300">{shield}%</span>
          </div>

          {/* Weapon Power Status */}
          <div className="flex items-center gap-1">
            <Zap className="w-3.5 h-3.5 text-purple-400" />
            <span className="text-[11px] font-semibold text-purple-300">
              {powerLevel === 1 ? '단발' : powerLevel === 2 ? '듀얼' : '트리플'}
            </span>
            {powerTimeLeft > 0 && (
              <span className="text-[10px] font-mono text-amber-400">({powerTimeLeft}s)</span>
            )}
          </div>

          {/* Bombs */}
          <div className="flex items-center gap-1">
            <Bomb className="w-3.5 h-3.5 text-amber-400" />
            <span className="font-mono font-bold text-amber-400">{bombs}</span>
          </div>
        </div>
      )}

      {/* Game Canvas Container */}
      <div className="relative rounded-2xl overflow-hidden border-2 border-slate-700 shadow-2xl shadow-sky-950/40 bg-slate-950">
        <canvas
          ref={canvasRef}
          width={CANVAS_WIDTH}
          height={CANVAS_HEIGHT}
          onTouchMove={handleCanvasTouch}
          onTouchStart={handleCanvasTouch}
          className="block cursor-crosshair touch-none"
          style={{ width: '100%', maxWidth: '400px', height: 'auto', aspectRatio: '400 / 600' }}
        />

        {/* Scanlines Effect Overlay */}
        {scanlines && <div className="absolute inset-0 scanlines pointer-events-none opacity-40" />}

        {/* Pause Button in top-right of canvas */}
        <div className="absolute top-2.5 right-2.5 flex items-center gap-1 z-10">
          <button
            onClick={() => {
              setIsPaused(p => {
                const next = !p;
                stateRef.current.isPaused = next;
                if (next) sound.stopBgm();
                else if (isBgmOn && !isMuted) sound.startBgm();
                return next;
              });
            }}
            className="p-1.5 rounded-lg bg-slate-900/80 hover:bg-slate-800 text-slate-300 border border-slate-700/60 backdrop-blur-sm transition-all"
            title="일시 정지 [P]"
          >
            {isPaused ? <Play className="w-4 h-4 text-emerald-400" /> : <Pause className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Mobile Touch & On-Screen Action Controls */}
      <div className="w-full max-w-md mt-3 flex items-center justify-between gap-2 px-1">
        {/* Left / Right buttons */}
        <div className="flex items-center gap-2">
          <button
            onTouchStart={() => handleTouchMove('left', true)}
            onTouchEnd={() => handleTouchMove('left', false)}
            onMouseDown={() => handleTouchMove('left', true)}
            onMouseUp={() => handleTouchMove('left', false)}
            onMouseLeave={() => handleTouchMove('left', false)}
            className="w-14 h-12 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:bg-sky-600 border border-slate-700 active:border-sky-400 flex items-center justify-center text-xl font-bold text-white shadow active:scale-95 transition-transform select-none"
          >
            ◀
          </button>
          <button
            onTouchStart={() => handleTouchMove('right', true)}
            onTouchEnd={() => handleTouchMove('right', false)}
            onMouseDown={() => handleTouchMove('right', true)}
            onMouseUp={() => handleTouchMove('right', false)}
            onMouseLeave={() => handleTouchMove('right', false)}
            className="w-14 h-12 rounded-xl bg-slate-800/90 hover:bg-slate-700 active:bg-sky-600 border border-slate-700 active:border-sky-400 flex items-center justify-center text-xl font-bold text-white shadow active:scale-95 transition-transform select-none"
          >
            ▶
          </button>
        </div>

        {/* Utility quick toggles */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setAutoFire(v => !v)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-colors flex items-center gap-1 ${
              autoFire
                ? 'bg-amber-500/20 text-amber-300 border-amber-500/40'
                : 'bg-slate-900 text-slate-400 border-slate-800 hover:text-slate-200'
            }`}
            title="연사 모드 토글"
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>자동연사</span>
          </button>

          {mode === 'arcade' && (
            <button
              onClick={useBomb}
              disabled={bombs <= 0}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border flex items-center gap-1 shadow transition-transform active:scale-95 ${
                bombs > 0
                  ? 'bg-rose-500/20 text-rose-300 border-rose-500/40 hover:bg-rose-500/30'
                  : 'bg-slate-900 text-slate-600 border-slate-800 cursor-not-allowed'
              }`}
              title="메가 폭탄 [B]"
            >
              <Bomb className="w-3.5 h-3.5" />
              <span>폭탄 ({bombs})</span>
            </button>
          )}
        </div>

        {/* Fire Button */}
        <button
          onClick={shootBullet}
          className="px-5 h-12 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-400 hover:to-orange-400 active:scale-95 text-slate-950 font-bold text-sm tracking-wide shadow-lg shadow-orange-950/40 border border-amber-300 flex items-center justify-center gap-1.5 select-none"
        >
          <Flame className="w-4 h-4 fill-slate-950" />
          <span>발사</span>
        </button>
      </div>

      {/* Bottom Tool Bar: Audio, Scanlines, Guide, Reset */}
      <footer className="w-full max-w-md mt-3 flex items-center justify-between text-xs text-slate-400 px-1">
        <div className="flex items-center gap-2">
          {/* Mute button */}
          <button
            onClick={toggleMute}
            className="p-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-slate-200 transition-colors"
            title={isMuted ? '음소거 해제' : '음소거'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4 text-emerald-400" />}
          </button>

          {/* BGM Toggle */}
          <button
            onClick={toggleBgm}
            className={`p-1.5 rounded-lg border transition-colors ${
              isBgmOn && !isMuted
                ? 'bg-indigo-500/20 border-indigo-500/40 text-indigo-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
            title="8비트 레트로 BGM 토글"
          >
            <Music className="w-4 h-4" />
          </button>

          {/* CRT Scanline Toggle */}
          <button
            onClick={() => setScanlines(s => !s)}
            className={`px-2 py-1 rounded-lg border text-[11px] transition-colors ${
              scanlines
                ? 'bg-sky-500/20 border-sky-500/40 text-sky-300'
                : 'bg-slate-900 border-slate-800 text-slate-500'
            }`}
          >
            CRT필터
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowHowToPlay(true)}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:text-slate-200 transition-colors text-xs"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            <span>도움말</span>
          </button>

          <button
            onClick={() => resetGame()}
            className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 hover:bg-slate-800 hover:text-slate-200 transition-colors text-xs font-medium"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>재시작 (R)</span>
          </button>
        </div>
      </footer>

      {/* How to Play Modal */}
      {showHowToPlay && (
        <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-5 shadow-2xl text-slate-200">
            <h2 className="text-lg font-bold text-white mb-3 flex items-center gap-2">
              <Crosshair className="w-5 h-5 text-sky-400" />
              게임 가이드 및 조작법
            </h2>

            <div className="space-y-3 text-xs leading-relaxed">
              <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/60">
                <h3 className="font-semibold text-sky-300 mb-1.5">🎮 기본 조작 (키보드 / 터치)</h3>
                <ul className="space-y-1 text-slate-300">
                  <li>• <strong className="text-white">← / →</strong> 또는 <strong className="text-white">A / D</strong>: 우주선 좌우 이동</li>
                  <li>• <strong className="text-white">Space</strong> 또는 <strong className="text-white">발사 버튼</strong>: 레이저 발사</li>
                  <li>• <strong className="text-white">B</strong>: 메가 폭탄 발사 (화면 전체 적 제거)</li>
                  <li>• <strong className="text-white">R</strong>: 게임 재시작 | <strong className="text-white">P</strong>: 일시 정지 | <strong className="text-white">M</strong>: 음소거</li>
                  <li>• <strong className="text-white">화면 터치 드래그</strong>: 스마트폰에서 손가락으로 기체를 직접 조작 가능</li>
                </ul>
              </div>

              <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/60">
                <h3 className="font-semibold text-amber-300 mb-1.5">⚔️ 모드 안내</h3>
                <ul className="space-y-1 text-slate-300">
                  <li>• <strong className="text-white">클래식 모드:</strong> 원작 구현! 적이 바닥에 닿거나 부딪히면 즉시 게임 오버.</li>
                  <li>• <strong className="text-white">아케이드 모드:</strong> 3개의 생명, 쉴드 게이지, 연속 처치 콤보 보너스, 드롭 아이템(듀얼/트리플 샷, 쉴드, 폭탄), 거대 보스전 출현!</li>
                </ul>
              </div>

              <div className="p-2.5 bg-slate-800/80 rounded-xl border border-slate-700/60">
                <h3 className="font-semibold text-emerald-300 mb-1.5">🎁 드롭 아이템 (아케이드)</h3>
                <div className="grid grid-cols-2 gap-1.5 text-[11px] text-slate-300">
                  <div>• <span className="text-sky-300 font-bold">2X</span>: 듀얼 레이저</div>
                  <div>• <span className="text-purple-300 font-bold">3X</span>: 트리플 플라즈마</div>
                  <div>• <span className="text-emerald-300 font-bold">SH</span>: 쉴드 회복</div>
                  <div>• <span className="text-amber-300 font-bold">💣</span>: 메가 폭탄 추가</div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-end">
              <button
                onClick={() => setShowHowToPlay(false)}
                className="px-4 py-2 bg-sky-600 hover:bg-sky-500 rounded-xl text-white font-semibold text-xs transition-colors"
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
