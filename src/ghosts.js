import * as THREE from "three";
import { getGlowTexture } from "./textures.js";

const COLORS = [
  0xff2e63, 0xff6bd6, 0x2ee6ff, 0xffa62e,
  0x7dff6b, 0xb06bff, 0x5b8cff, 0xfff05b,
];
const FLEE_COLOR = new THREE.Color(0x2a3cff);
const FLEE_FLASH = new THREE.Color(0xdce8ff);
const WHITE = new THREE.Color(0xffffff);

function dampAngle(current, target, lambda, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

class Ghost {
  constructor(scene, maze, index) {
    this.scene = scene;
    this.maze = maze;
    this.index = index;
    this.baseColor = new THREE.Color(COLORS[index % COLORS.length]);
    this.color = this.baseColor.clone();

    this.pos = new THREE.Vector3();
    this.path = [];
    this.pathTimer = 0;
    this.pathInterval = 0.3;
    this.active = false;
    this.dead = true;
    this.flee = false;
    this.fleeTime = 0;
    this.flash = 0;
    this.spawnProtect = 0;
    this.scale = 0;
    this.respawnTimer = Infinity;
    this.speed = 4;
    this.hp = 2;
    this.maxHp = 2;
    this.orbTimer = 3;
    this.phase = Math.random() * Math.PI * 2;
    this.facing = 0;
    this._tmp = new THREE.Vector3();

    this._build();
  }

  _build() {
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.mat = new THREE.MeshStandardMaterial({
      color: this.baseColor,
      emissive: this.baseColor,
      emissiveIntensity: 0.42,
      roughness: 0.34,
      metalness: 0.08,
    });

    this.body = new THREE.Mesh(new THREE.SphereGeometry(0.82, 22, 16), this.mat);
    this.body.scale.set(1, 1.04, 1);
    this.body.position.y = 1.08;
    this.group.add(this.body);

    this.skirt = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.74, 0.9, 22, 1, true),
      this.mat
    );
    this.skirt.position.y = 0.54;
    this.group.add(this.skirt);

    const footGeo = new THREE.SphereGeometry(0.21, 10, 8);
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const foot = new THREE.Mesh(footGeo, this.mat);
      foot.position.set(Math.cos(a) * 0.6, 0.13, Math.sin(a) * 0.6);
      foot.scale.y = 1.15;
      this.group.add(foot);
    }

    const whiteMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.pupilMat = new THREE.MeshBasicMaterial({ color: 0x0a0f22 });
    const eyeGeo = new THREE.SphereGeometry(0.21, 14, 10);
    const pupilGeo = new THREE.SphereGeometry(0.1, 10, 8);
    for (const side of [-1, 1]) {
      const eye = new THREE.Mesh(eyeGeo, whiteMat);
      eye.position.set(side * 0.28, 1.3, 0.67);
      eye.scale.set(0.92, 1.15, 0.7);
      const pupil = new THREE.Mesh(pupilGeo, this.pupilMat);
      pupil.position.set(side * 0.3, 1.28, 0.82);
      this.group.add(eye, pupil);
    }

    this.halo = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: this.baseColor,
        transparent: true,
        opacity: 0.16,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.halo.scale.setScalar(3.2);
    this.halo.position.y = 1.1;
    this.group.add(this.halo);

    this.group.visible = false;
  }

  reset(spawn, level, spawnIndex) {
    this.pos.copy(spawn);
    this.active = true;
    this.dead = false;
    this.flee = false;
    this.fleeTime = 0;
    this.flash = 0;
    this.path = [];
    this.pathTimer = 1.1 + Math.random() * 0.5;
    this.spawnProtect = 2.1 + Math.random() * 0.7;
    this.scale = 0;
    this.facing = Math.random() * Math.PI * 2;
    this.orbTimer = 3 + Math.random() * 4;
    this.speed = Math.min(6.9, 4.05 + level * 0.24 + (spawnIndex % 3) * 0.14);
    this.maxHp = 2 + Math.min(2, Math.floor((level - 1) / 3)) + (spawnIndex % 4 === 3 ? 1 : 0);
    this.hp = this.maxHp;
    this.pathInterval = 0.3;

    this.group.visible = true;
    this.group.scale.setScalar(0.01);
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.mat.color.copy(this.baseColor);
    this.mat.emissive.copy(this.baseColor);
    this.mat.emissiveIntensity = 0.42;
    this.pupilMat.color.setHex(0x0a0f22);
    this.halo.material.color.copy(this.baseColor);
    this.halo.material.opacity = 0.16;
  }

  setFlee(on) {
    if (this.flee === on) return;
    this.flee = on;
    this.fleeTime = 0;
    this.pathTimer = 0;
    this.pathInterval = on ? 0.55 : 0.3;
    if (on) {
      this.speed = Math.max(3.3, this.speed * 0.82);
    } else {
      this.speed = Math.min(6.9, this.speed / 0.82);
      this.mat.color.copy(this.baseColor);
      this.mat.emissive.copy(this.baseColor);
      this.mat.emissiveIntensity = 0.42;
      this.pupilMat.color.setHex(0x0a0f22);
      this.halo.material.color.copy(this.baseColor);
    }
  }

  hit(dmg, dir) {
    if (!this.active || this.dead) return false;
    this.hp -= dmg;
    this.flash = 0.14;
    this.spawnProtect = 0;
    if (dir) {
      this.pos.x += dir.x * 0.42;
      this.pos.z += dir.z * 0.42;
      this.maze.resolveCircle(this.pos, 0.6);
    }
    this.pathTimer = 0;
    if (this.hp <= 0) {
      this.die();
      return true;
    }
    return false;
  }

  die() {
    this.active = false;
    this.dead = true;
    this.group.visible = false;
    this.respawnTimer = 4.6 + Math.random() * 2.4;
  }

  respawn(spawn) {
    this.pos.copy(spawn);
    this.active = true;
    this.dead = false;
    this.hp = this.maxHp;
    this.spawnProtect = 1.5;
    this.scale = 0.01;
    this.path = [];
    this.pathTimer = 0;
    this.orbTimer = 2.5 + Math.random() * 3;
    this.group.visible = true;
    this.mat.color.copy(this.flee ? FLEE_COLOR : this.baseColor);
    this.mat.emissive.copy(this.flee ? FLEE_COLOR : this.baseColor);
    this.pathInterval = this.flee ? 0.55 : 0.3;
  }

  update(dt, t, playerPos, maze, level, manager) {
    if (!this.active) {
      return;
    }
    this.spawnProtect = Math.max(0, this.spawnProtect - dt);
    this.flash = Math.max(0, this.flash - dt);
    this.scale += (1 - this.scale) * Math.min(1, dt * 9);
    if (this.scale > 0.995) this.scale = 1;

    this.pathTimer -= dt;
    if (this.pathTimer <= 0) {
      this.pathTimer = this.pathInterval * (0.8 + Math.random() * 0.4);
      this._repath(playerPos, maze);
    }

    let target;
    let direct = false;
    if (this.path.length > 0) {
      const cell = this.path[0];
      target = maze.cellToWorld(cell.x, cell.y, this._tmp);
      const dx = target.x - this.pos.x;
      const dz = target.z - this.pos.z;
      if (dx * dx + dz * dz < 0.08) {
        this.path.shift();
        if (this.path.length > 0) {
          const n = this.path[0];
          target = maze.cellToWorld(n.x, n.y, this._tmp);
        }
      }
    } else if (this.flee) {
      target = this._tmp.copy(this.pos);
    } else {
      target = this._tmp.copy(playerPos);
      direct = true;
    }

    let dx = target.x - this.pos.x;
    let dz = target.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 0.0001) {
      dx /= dist;
      dz /= dist;
    }

    // Group separation so packs fan out instead of stacking.
    let sepX = 0;
    let sepZ = 0;
    for (const other of manager.ghosts) {
      if (other === this || !other.active) continue;
      const ox = this.pos.x - other.pos.x;
      const oz = this.pos.z - other.pos.z;
      const d2 = ox * ox + oz * oz;
      if (d2 > 0.0001 && d2 < 2.4) {
        const d = Math.sqrt(d2);
        const push = (1.55 - d) * 0.75;
        sepX += (ox / d) * push;
        sepZ += (oz / d) * push;
      }
    }

    const speed = this.speed * (this.flee ? 0.94 : 1);
    const step = speed * dt;
    this.pos.x += (dx + sepX) * step;
    this.pos.z += (dz + sepZ) * step;
    maze.resolveCircle(this.pos, 0.62);

    if (dist > 0.25 || this.flee) {
      const targetAngle = this.flee
        ? Math.atan2(dx, dz)
        : Math.atan2(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
      this.facing = dampAngle(this.facing, targetAngle, 9, dt);
    }

    const bob = Math.sin(t * 3.4 + this.phase) * 0.07;
    this.group.position.set(this.pos.x, 0.03 + bob, this.pos.z);
    this.group.rotation.y = this.facing;
    this.group.scale.setScalar(this.scale);

    // eyes / flash colours
    if (this.flash > 0) {
      this.mat.color.copy(WHITE);
      this.mat.emissive.copy(WHITE);
      this.mat.emissiveIntensity = 2.2;
    } else if (this.flee) {
      this.fleeTime += dt;
      const on = Math.floor(this.fleeTime * 8) % 2 === 0;
      this.mat.color.copy(on ? FLEE_FLASH : FLEE_COLOR);
      this.mat.emissive.copy(on ? FLEE_FLASH : FLEE_COLOR);
      this.mat.emissiveIntensity = 0.85;
      this.pupilMat.color.setHex(0xdce8ff);
      this.halo.material.color.copy(FLEE_COLOR);
    } else {
      this.mat.color.copy(this.baseColor);
      this.mat.emissive.copy(this.baseColor);
      this.mat.emissiveIntensity = 0.42 + Math.sin(t * 2 + this.phase) * 0.08;
      this.pupilMat.color.setHex(0x0a0f22);
      this.halo.material.color.copy(this.baseColor);
    }
    this.halo.material.opacity = this.flee ? 0.34 : 0.16;

    // Spitters start at sector 2. They only shoot with a clear lane.
    const playerDist = Math.hypot(playerPos.x - this.pos.x, playerPos.z - this.pos.z);
    if (!this.flee && level >= 2 && this.spawnProtect <= 0 && playerDist < 15) {
      this.orbTimer -= dt;
      if (this.orbTimer <= 0) {
        const toPlayer = this._tmp
          .copy(playerPos)
          .sub(this.pos);
        toPlayer.y = 0;
        if (maze.hasLineOfSight(this.pos, playerPos)) {
          const len = toPlayer.length();
          if (len > 0.1) {
            toPlayer.multiplyScalar(1 / len);
            manager.shoot({
              x: this.pos.x,
              z: this.pos.z,
              y: 1.15,
              dirX: toPlayer.x,
              dirZ: toPlayer.z,
            });
          }
        }
        this.orbTimer = Math.max(2.6, 5.2 - level * 0.18) + Math.random() * 2.6;
      }
    }
  }

  _repath(playerPos, maze) {
    const cell = maze.worldToCell(this.pos.x, this.pos.z);
    const sx = cell.x;
    const sy = cell.y;
    let target;
    if (this.flee) {
      target = maze.farthestCorner(playerPos);
    } else {
      target = maze.worldToCell(playerPos.x, playerPos.z);
    }
    this.path = maze.findPath(sx, sy, target.x, target.y);
    if (this.path.length > 1 && Math.random() < 0.2) this.path.shift();
  }

  get worldPos() {
    return new THREE.Vector3(this.pos.x, 1.05, this.pos.z);
  }
}

export class GhostManager {
  constructor(scene, maze) {
    this.maze = maze;
    this.ghosts = [];
    for (let i = 0; i < 8; i++) this.ghosts.push(new Ghost(scene, maze, i));
    this.level = 1;
    this.shoot = () => {};
    this.initialSpawns = false;
  }

  reset(level) {
    this.level = level;
    const count = Math.min(8, 3 + level);
    for (let i = 0; i < this.ghosts.length; i++) {
      const ghost = this.ghosts[i];
      if (i < count) {
        const spawn =
          this.maze.ghostSpawns[i % this.maze.ghostSpawns.length] ||
          this.maze.centerSpawn;
        ghost.reset(spawn, level, i);
      } else {
        ghost.active = false;
        ghost.dead = true;
        ghost.respawnTimer = Infinity;
        ghost.group.visible = false;
      }
    }
  }

  setFlee(on) {
    for (const g of this.ghosts) g.setFlee(on);
  }

  update(dt, t, playerPos, maze) {
    for (const g of this.ghosts) {
      if (!g.active) {
        if (g.dead) {
          g.respawnTimer -= dt;
          if (g.respawnTimer <= 0) {
            const spawn =
              this.maze.ghostSpawns[Math.floor(Math.random() * this.maze.ghostSpawns.length)] ||
              this.maze.centerSpawn;
            g.respawn(spawn);
          }
        }
        continue;
      }
      g.update(dt, t, playerPos, maze, this.level, this);
    }
  }

  spawnPositions() {
    return this.maze.ghostSpawns;
  }
}
