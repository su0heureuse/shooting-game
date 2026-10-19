export type GameMode = 'classic' | 'arcade';

export interface Player {
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  lives: number;
  maxLives: number;
  shield: number; // 0 to 100
  powerLevel: 1 | 2 | 3;
  powerTimer: number; // in milliseconds
  bombs: number;
  invulnerableTime: number; // seconds
}

export type EnemyType = 'drone' | 'swarmer' | 'zigzag' | 'asteroid' | 'boss';

export interface Enemy {
  id: string;
  type: EnemyType;
  x: number;
  y: number;
  width: number;
  height: number;
  speed: number;
  hp: number;
  maxHp: number;
  points: number;
  vx: number;
  age: number;
  shootCooldown?: number;
}

export interface Bullet {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  width: number;
  height: number;
  damage: number;
  color: string;
  isPlayer: boolean;
  trail?: { x: number; y: number }[];
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  decay: number;
}

export interface FloatingText {
  id: string;
  x: number;
  y: number;
  text: string;
  color: string;
  alpha: number;
  vy: number;
}

export type PowerUpType = 'double' | 'triple' | 'shield' | 'bomb' | 'heal';

export interface PowerUpItem {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: PowerUpType;
  vy: number;
  bobOffset: number;
}

export interface Star {
  x: number;
  y: number;
  size: number;
  speed: number;
  alpha: number;
  layer: 1 | 2 | 3;
}
