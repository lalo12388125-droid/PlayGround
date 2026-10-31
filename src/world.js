import * as THREE from "three";
import { getGlowTexture, makeFloorTexture } from "./textures.js";

export const CELL = 2.2;
export const WALL_H = 2.7;

// 21 x 21 — symmetric, four power pellets, open arena rows at the bottom.
export const LAYOUT = [
  "#####################",
  "#.........#.........#",
  "#.###.###.#.###.###.#",
  "#o###.###.#.###.###o#",
  "#...................#",
  "#.###.#.#####.#.###.#",
  "#.....#...#...#.....#",
  "#####.###.#.###.#####",
  "#.......#...#.......#",
  "#.#####.#.#.#.#####.#",
  "#.#.....#.#.#.....#.#",
  "#.#.###.#.#.#.###.#.#",
  "#...#...........#...#",
  "###.#.###.#.###.#.###",
  "#...#...#...#...#...#",
  "#.###.#.#.#.#.#.###.#",
  "#o....#.......#....o#",
  "#.#####.#####.#####.#",
  "#...................#",
  "#...................#",
  "#####################",
];

const PLAYER_CELL = { x: 10, y: 18 };

export class Maze {
  constructor(scene) {
    this.scene = scene;
    this.rows = LAYOUT;
    this.h = this.rows.length;
    this.w = this.rows[0].length;
    this.size = this.w * CELL;

    this.group = new THREE.Group();
    this.group.name = "maze";
    scene.add(this.group);

    this.walls = [];
    this.wallSet = new Set();
    this.openCells = [];
    this.pelletCells = [];
    this.powerCells = [];

    this._dummy = new THREE.Object3D();
    this._color = new THREE.Color();
    this._cell = { x: 0, y: 0 };
    this._pathPrev = new Int32Array(this.w * this.h);
    this._pathQueue = new Int32Array(this.w * this.h);
    this._pathVisited = new Int32Array(this.w * this.h);

    this.playerSpawn = new THREE.Vector3();
    this.ghostSpawns = [];
    this.level = 1;
    this.collected = 0;

    this._parse();
    this._build();
    this.resetPellets(1);
  }

  _parse() {
    for (let y = 0; y < this.h; y++) {
      const row = this.rows[y];
      for (let x = 0; x < this.w; x++) {
        const ch = row[x];
        if (ch === "#") {
          this.walls.push({ x, y });
          this.wallSet.add(y * this.w + x);
        } else {
          this.openCells.push({ x, y });
          if (ch !== "o") {
            this.pelletCells.push({ x, y, alive: true, instance: -1 });
          } else {
            this.powerCells.push({ x, y, alive: true });
          }
        }
      }
    }

    this.cellToWorld(PLAYER_CELL.x, PLAYER_CELL.y, this.playerSpawn);

    // Find eight open cells ringing the maze center for ghost spawns.
    const center = this.nearestOpenCell(Math.floor(this.w / 2), Math.floor(this.h / 2));
    const candidates = [];
    for (const c of this.openCells) {
      const d = Math.hypot(c.x - center.x, c.y - center.y);
      if (d > 0.5 && d < 7) candidates.push({ ...c, d });
    }
    candidates.sort((a, b) => a.d - b.d);
    const chosen = [];
    for (const c of candidates) {
      if (chosen.length >= 8) break;
      if (chosen.every((o) => Math.hypot(o.x - c.x, o.y - c.y) > 2)) chosen.push(c);
    }
    if (chosen.length === 0) chosen.push(center);
    for (const c of chosen) {
      this.ghostSpawns.push(this.cellToWorld(c.x, c.y, new THREE.Vector3()));
    }
    this.centerCell = center;
    this.centerSpawn = this.cellToWorld(center.x, center.y, new THREE.Vector3());
  }

  _build() {
    const wallCount = this.walls.length;

    // Floor — a huge dark plane so the arena floats in the void instead of
    // ending at the maze wall.
    const accent = new THREE.Color().setHSL(190 / 360, 1, 0.58);
    this.accent = accent;
    this.borderColor = new THREE.Color(0xff3fbe);
    this.floorTex = makeFloorTexture(accent);
    this.floor = new THREE.Mesh(
      new THREE.PlaneGeometry(300, 300),
      new THREE.MeshBasicMaterial({ map: this.floorTex, color: 0xffffff })
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.position.y = -0.02;
    this.group.add(this.floor);

    // Faint outer grid, fading into the fog.
    const outerHalf = 150;
    const outerPts = [];
    const OUTER_STEP = CELL * 2;
    for (let x = -outerHalf; x <= outerHalf; x += OUTER_STEP) {
      outerPts.push(x, 0, -outerHalf, x, 0, outerHalf);
    }
    for (let z = -outerHalf; z <= outerHalf; z += OUTER_STEP) {
      outerPts.push(-outerHalf, 0, z, outerHalf, 0, z);
    }
    const outerGeo = new THREE.BufferGeometry();
    outerGeo.setAttribute("position", new THREE.Float32BufferAttribute(outerPts, 3));
    this.outerMat = new THREE.LineBasicMaterial({
      color: accent.clone().multiplyScalar(0.45),
      transparent: true,
      opacity: 0.28,
      depthWrite: false,
    });
    this.outerGrid = new THREE.LineSegments(outerGeo, this.outerMat);
    this.outerGrid.position.y = -0.006;
    this.group.add(this.outerGrid);

    // Center glow wash
    this.glowDisc = new THREE.Mesh(
      new THREE.PlaneGeometry(this.size * 1.35, this.size * 1.35),
      new THREE.MeshBasicMaterial({
        map: getGlowTexture(),
        color: accent.clone(),
        transparent: true,
        opacity: 0.12,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.glowDisc.rotation.x = -Math.PI / 2;
    this.glowDisc.position.y = 0.015;
    this.glowDisc.renderOrder = 1;
    this.group.add(this.glowDisc);

    // Grid lines aligned with cell boundaries
    const half = this.size / 2;
    const pts = [];
    for (let i = 0; i <= this.w; i++) {
      const x = -half + i * CELL;
      pts.push(x, 0, -half, x, 0, half);
    }
    for (let i = 0; i <= this.h; i++) {
      const z = -half + i * CELL;
      pts.push(-half, 0, z, half, 0, z);
    }
    const gridGeo = new THREE.BufferGeometry();
    gridGeo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    this.grid = new THREE.LineSegments(
      gridGeo,
      new THREE.LineBasicMaterial({
        color: accent.clone().offsetHSL(0, 0, -0.12),
        transparent: true,
        opacity: 0.26,
        depthWrite: false,
      })
    );
    this.grid.position.y = 0.008;
    this.group.add(this.grid);

    // Walls — dark slabs with bright neon rims.
    const wallGeo = new THREE.BoxGeometry(CELL * 0.98, WALL_H, CELL * 0.98);
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x081226,
      emissive: 0x071633,
      emissiveIntensity: 0.65,
      roughness: 0.52,
      metalness: 0.45,
    });
    this.wallMesh = new THREE.InstancedMesh(wallGeo, wallMat, wallCount);
    this.wallMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.wallMesh.frustumCulled = false;

    const edgeGeo = new THREE.BoxGeometry(CELL * 0.985, 0.065, 0.075);
    this.edgeMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.edgeMesh = new THREE.InstancedMesh(edgeGeo, this.edgeMat, wallCount * 4);
    this.edgeMesh.instanceMatrix.setUsage(THREE.StaticDrawUsage);
    this.edgeMesh.frustumCulled = false;
    this.edgeMesh.renderOrder = 3;

    const glowGeo = new THREE.PlaneGeometry(CELL * 1.16, CELL * 1.16);
    this.underMat = new THREE.MeshBasicMaterial({
      color: accent.clone(),
      transparent: true,
      opacity: 0.13,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      side: THREE.DoubleSide,
    });
    this.underMesh = new THREE.InstancedMesh(glowGeo, this.underMat, wallCount);
    this.underMesh.frustumCulled = false;
    this.underMesh.renderOrder = 1;

    const edgeOff = CELL * 0.492;
    this.walls.forEach((cell, i) => {
      this.cellToWorld(cell.x, cell.y, this._dummy.position);
      const bx = this._dummy.position.x;
      const bz = this._dummy.position.z;

      this._dummy.position.y = WALL_H / 2;
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.updateMatrix();
      this.wallMesh.setMatrixAt(i, this._dummy.matrix);

      this._dummy.position.set(bx, 0.035, bz);
      this._dummy.rotation.set(-Math.PI / 2, 0, 0);
      this._dummy.updateMatrix();
      this.underMesh.setMatrixAt(i, this._dummy.matrix);

      this._dummy.position.y = WALL_H + 0.02;
      this._dummy.rotation.set(0, 0, 0);
      const edges = [
        [bx, bz - edgeOff, 0],
        [bx, bz + edgeOff, 0],
        [bx - edgeOff, bz, Math.PI / 2],
        [bx + edgeOff, bz, Math.PI / 2],
      ];
      const isBorder =
        cell.x === 0 || cell.y === 0 || cell.x === this.w - 1 || cell.y === this.h - 1;
      const col = isBorder ? this.borderColor : accent;
      for (let k = 0; k < 4; k++) {
        this._dummy.position.set(edges[k][0], WALL_H + 0.02, edges[k][1]);
        this._dummy.rotation.set(0, edges[k][2], 0);
        this._dummy.updateMatrix();
        this.edgeMesh.setMatrixAt(i * 4 + k, this._dummy.matrix);
        this.edgeMesh.setColorAt(i * 4 + k, col);
      }
      this._dummy.rotation.set(0, 0, 0);

      this.underMesh.setColorAt(i, isBorder ? this.borderColor : accent);
    });
    this.wallMesh.instanceMatrix.needsUpdate = true;
    this.edgeMesh.instanceMatrix.needsUpdate = true;
    this.edgeMesh.instanceColor.needsUpdate = true;
    this.underMesh.instanceMatrix.needsUpdate = true;
    this.underMesh.instanceColor.needsUpdate = true;
    this.group.add(this.wallMesh, this.edgeMesh, this.underMesh);

    // Perimeter line outside the border walls
    const edge = half + CELL * 0.56;
    const borderGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-edge, 0, -edge),
      new THREE.Vector3(edge, 0, -edge),
      new THREE.Vector3(edge, 0, edge),
      new THREE.Vector3(-edge, 0, edge),
      new THREE.Vector3(-edge, 0, -edge),
    ]);
    this.edge = new THREE.Line(
      borderGeo,
      new THREE.LineBasicMaterial({
        color: this.borderColor,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      })
    );
    this.edge.position.y = 0.06;
    this.group.add(this.edge);

    // Pellets
    const pelletGeo = new THREE.SphereGeometry(0.18, 9, 7);
    this.pelletMat = new THREE.MeshBasicMaterial({ color: 0x28e7ff });
    const pelletCount = this.pelletCells.length;
    this.pelletMesh = new THREE.InstancedMesh(pelletGeo, this.pelletMat, pelletCount);
    this.pelletMesh.frustumCulled = false;
    this.pelletMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.group.add(this.pelletMesh);

    this._dummy.position.set(0, 0.58, 0);
    this._dummy.rotation.set(0, 0, 0);
    this._dummy.scale.set(1, 1, 1);
    this._dummy.updateMatrix();
    this._basePelletMatrix = this._dummy.matrix.clone();
    this._zeroMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

    // Power pellets (separate meshes so they can pulse)
    const powerGeo = new THREE.SphereGeometry(0.32, 16, 12);
    this.powerObjs = [];
    for (const p of this.powerCells) {
      const pos = this.cellToWorld(p.x, p.y, new THREE.Vector3());
      const group = new THREE.Group();
      group.position.copy(pos);
      const core = new THREE.Mesh(
        powerGeo,
        new THREE.MeshBasicMaterial({ color: 0xfff0a0 })
      );
      core.position.y = 0.62;
      const halo = new THREE.Sprite(
        new THREE.SpriteMaterial({
          map: getGlowTexture(),
          color: 0xffd34d,
          transparent: true,
          opacity: 0.65,
          blending: THREE.AdditiveBlending,
          depthWrite: false,
        })
      );
      halo.scale.setScalar(3.1);
      halo.position.y = 0.62;
      group.add(core, halo);
      this.group.add(group);
      this.powerObjs.push({ cell: p, pos, group, core, halo, phase: Math.random() * 6.28 });
      p.obj = this.powerObjs[this.powerObjs.length - 1];
    }

    // Spawn pad
    const pad = new THREE.Mesh(
      new THREE.RingGeometry(1.0, 1.3, 40),
      new THREE.MeshBasicMaterial({
        color: 0xffd400,
        transparent: true,
        opacity: 0.3,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    pad.rotation.x = -Math.PI / 2;
    pad.position.copy(this.playerSpawn).setY(0.04);
    this.spawnPad = pad;
    this.group.add(pad);

    // Floating dust
    const dustCount = 240;
    const dustPos = new Float32Array(dustCount * 3);
    for (let i = 0; i < dustCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 6 + Math.random() * (this.size * 0.75);
      dustPos[i * 3] = Math.cos(a) * r;
      dustPos[i * 3 + 1] = 1.5 + Math.random() * 16;
      dustPos[i * 3 + 2] = Math.sin(a) * r;
    }
    const dustGeo = new THREE.BufferGeometry();
    dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
    this.dustMat = new THREE.PointsMaterial({
      color: 0x67d9ff,
      size: 0.18,
      map: getGlowTexture(),
      transparent: true,
      opacity: 0.6,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.dust = new THREE.Points(dustGeo, this.dustMat);
    this.dust.frustumCulled = false;
    this.group.add(this.dust);
  }

  cellToWorld(x, y, target = new THREE.Vector3()) {
    return target.set(
      (x - (this.w - 1) / 2) * CELL,
      0,
      (y - (this.h - 1) / 2) * CELL
    );
  }

  worldToCell(x, z) {
    this._cell.x = Math.round(x / CELL + (this.w - 1) / 2);
    this._cell.y = Math.round(z / CELL + (this.h - 1) / 2);
    return this._cell;
  }

  isWallCell(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return true;
    return this.wallSet.has(y * this.w + x);
  }

  isWallAtWorld(x, z) {
    const c = this.worldToCell(x, z);
    return this.isWallCell(c.x, c.y);
  }

  nearestOpenCell(x, y) {
    let best = this.openCells[0];
    let bestD = Infinity;
    for (const c of this.openCells) {
      const d = (c.x - x) * (c.x - x) + (c.y - y) * (c.y - y);
      if (d < bestD) {
        bestD = d;
        best = c;
      }
    }
    return best;
  }

  farthestCorner(playerPos) {
    const corners = [
      [1, 1],
      [this.w - 2, 1],
      [1, this.h - 2],
      [this.w - 2, this.h - 2],
    ];
    let best = this.centerCell;
    let bestD = -1;
    for (const [cx, cy] of corners) {
      const c = this.nearestOpenCell(cx, cy);
      const wx = (c.x - (this.w - 1) / 2) * CELL;
      const wz = (c.y - (this.h - 1) / 2) * CELL;
      const d = (wx - playerPos.x) ** 2 + (wz - playerPos.z) ** 2;
      if (d > bestD) {
        bestD = d;
        best = { x: c.x, y: c.y };
      }
    }
    return best;
  }

  resolveCircle(pos, radius) {
    for (let pass = 0; pass < 2; pass++) {
      const cx = Math.round(pos.x / CELL + (this.w - 1) / 2);
      const cz = Math.round(pos.z / CELL + (this.h - 1) / 2);
      const half = CELL / 2;
      for (let oy = -1; oy <= 1; oy++) {
        for (let ox = -1; ox <= 1; ox++) {
          const gx = cx + ox;
          const gy = cz + oy;
          if (!this.isWallCell(gx, gy)) continue;
          const bx = (gx - (this.w - 1) / 2) * CELL;
          const bz = (gy - (this.h - 1) / 2) * CELL;
          const nx = Math.max(bx - half, Math.min(pos.x, bx + half));
          const nz = Math.max(bz - half, Math.min(pos.z, bz + half));
          let dx = pos.x - nx;
          let dz = pos.z - nz;
          const d2 = dx * dx + dz * dz;
          if (d2 >= radius * radius) continue;
          if (d2 > 1e-9) {
            const d = Math.sqrt(d2);
            pos.x += (dx / d) * (radius - d);
            pos.z += (dz / d) * (radius - d);
          } else {
            const px = pos.x - bx;
            const pz = pos.z - bz;
            const penX = half + radius - Math.abs(px);
            const penZ = half + radius - Math.abs(pz);
            if (penX < penZ) pos.x += (px < 0 ? -1 : 1) * penX;
            else pos.z += (pz < 0 ? -1 : 1) * penZ;
          }
        }
      }
    }
  }

  hasLineOfSight(a, b) {
    const dx = b.x - a.x;
    const dz = b.z - a.z;
    const dist = Math.hypot(dx, dz);
    const steps = Math.max(2, Math.ceil(dist / 0.45));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      if (this.isWallAtWorld(a.x + dx * t, a.z + dz * t)) return false;
    }
    return true;
  }

  findPath(sx, sy, tx, ty) {
    if (this.isWallCell(sx, sy) || this.isWallCell(tx, ty)) return [];
    const W = this.w;
    const start = sy * W + sx;
    const goal = ty * W + tx;
    if (start === goal) return [];
    const prev = this._pathPrev;
    const visited = this._pathVisited;
    const queue = this._pathQueue;
    visited.fill(0);
    prev.fill(-1);
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    let found = false;
    while (head < tail) {
      const cur = queue[head++];
      if (cur === goal) {
        found = true;
        break;
      }
      const cx = cur % W;
      const cy = (cur - cx) / W;
      if (cx > 0 && !this.isWallCell(cx - 1, cy) && !visited[cur - 1]) {
        visited[cur - 1] = 1;
        prev[cur - 1] = cur;
        queue[tail++] = cur - 1;
      }
      if (cx < W - 1 && !this.isWallCell(cx + 1, cy) && !visited[cur + 1]) {
        visited[cur + 1] = 1;
        prev[cur + 1] = cur;
        queue[tail++] = cur + 1;
      }
      if (cy > 0 && !this.isWallCell(cx, cy - 1) && !visited[cur - W]) {
        visited[cur - W] = 1;
        prev[cur - W] = cur;
        queue[tail++] = cur - W;
      }
      if (cy < this.h - 1 && !this.isWallCell(cx, cy + 1) && !visited[cur + W]) {
        visited[cur + W] = 1;
        prev[cur + W] = cur;
        queue[tail++] = cur + W;
      }
    }
    if (!found) return [];
    const path = [];
    let cur = goal;
    while (cur !== start && cur !== -1) {
      const x = cur % W;
      const y = (cur - x) / W;
      path.push({ x, y });
      cur = prev[cur];
    }
    path.reverse();
    return path;
  }

  collectAt(pos, radius) {
    let pellets = 0;
    let power = 0;
    const r2 = radius * radius;
    for (let i = 0; i < this.pelletCells.length; i++) {
      const p = this.pelletCells[i];
      if (!p.alive) continue;
      const px = (p.x - (this.w - 1) / 2) * CELL;
      const pz = (p.y - (this.h - 1) / 2) * CELL;
      const dx = px - pos.x;
      const dz = pz - pos.z;
      if (dx * dx + dz * dz <= r2) {
        p.alive = false;
        this.collected++;
        this._dummy.position.set(px, 0.58, pz);
        this._dummy.scale.setScalar(0);
        this._dummy.rotation.set(0, 0, 0);
        this._dummy.updateMatrix();
        this.pelletMesh.setMatrixAt(i, this._dummy.matrix);
        this.pelletMesh.instanceMatrix.needsUpdate = true;
        pellets++;
      }
    }
    for (const p of this.powerCells) {
      if (!p.alive) continue;
      const dx = p.obj.pos.x - pos.x;
      const dz = p.obj.pos.z - pos.z;
      if (dx * dx + dz * dz <= r2 + 0.35) {
        p.alive = false;
        p.obj.group.visible = false;
        power++;
      }
    }
    return { pellets, power };
  }

  get pelletsLeft() {
    let n = 0;
    for (const p of this.pelletCells) if (p.alive) n++;
    for (const p of this.powerCells) if (p.alive) n++;
    return n;
  }

  resetPellets(level) {
    this.level = level;
    this.collected = 0;
    for (let i = 0; i < this.pelletCells.length; i++) {
      const p = this.pelletCells[i];
      p.alive = true;
      const px = (p.x - (this.w - 1) / 2) * CELL;
      const pz = (p.y - (this.h - 1) / 2) * CELL;
      this._dummy.position.set(px, 0.58, pz);
      this._dummy.rotation.set(0, 0, 0);
      this._dummy.scale.set(1, 1, 1);
      this._dummy.updateMatrix();
      this.pelletMesh.setMatrixAt(i, this._dummy.matrix);
    }
    this.pelletMesh.instanceMatrix.needsUpdate = true;
    for (const p of this.powerCells) {
      p.alive = true;
      p.obj.group.visible = true;
    }
    this.setLevel(level);
  }

  setLevel(level) {
    const hue = ((190 + (level - 1) * 21) % 360) / 360;
    const accent = this.accent.setHSL(hue, 1, 0.58);
    this.grid.material.color.copy(accent).offsetHSL(0, 0, -0.14);
    this.outerMat.color.copy(accent).multiplyScalar(0.32);
    this.glowDisc.material.color.copy(accent);
    this.underMat.color.copy(accent);
    this.edge.material.color.copy(this.borderColor);
    for (let i = 0; i < this.walls.length; i++) {
      const cell = this.walls[i];
      const isBorder =
        cell.x === 0 || cell.y === 0 || cell.x === this.w - 1 || cell.y === this.h - 1;
      const col = isBorder ? this.borderColor : accent;
      for (let k = 0; k < 4; k++) this.edgeMesh.setColorAt(i * 4 + k, col);
      this.underMesh.setColorAt(i, col);
    }
    this.edgeMesh.instanceColor.needsUpdate = true;
    this.underMesh.instanceColor.needsUpdate = true;
    this.dustMat.color.copy(accent).offsetHSL(0.04, 0, 0.18);
  }

  update(dt, t) {
    this.dust.rotation.y += dt * 0.012;
    this.dust.position.y = Math.sin(t * 0.3) * 0.4;
    for (const p of this.powerObjs) {
      if (!p.group.visible) continue;
      const pulse = 1 + Math.sin(t * 4.4 + p.phase) * 0.16;
      p.core.scale.setScalar(pulse);
      p.halo.scale.setScalar(3.1 * (1 + Math.sin(t * 4.4 + p.phase) * 0.12));
      p.halo.material.opacity = 0.45 + Math.sin(t * 4.4 + p.phase) * 0.18;
    }
    this.pelletMat.color.setHSL(0.52 + Math.sin(t * 1.4) * 0.015, 1, 0.64);
    this.spawnPad.material.opacity = 0.2 + Math.sin(t * 2.2) * 0.08;
  }
}
