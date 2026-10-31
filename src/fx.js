import * as THREE from "three";
import { getGlowTexture } from "./textures.js";

const PARTICLE_COUNT = 760;
const RING_COUNT = 10;
const FLASH_COUNT = 18;

export class FX {
  constructor(scene, camera, popupContainer) {
    this.scene = scene;
    this.camera = camera;
    this.popupContainer = popupContainer;
    this.trauma = 0;
    this.roll = 0;
    this.shakeOffset = new THREE.Vector3();
    this.time = 0;

    this._tmp = new THREE.Vector3();
    this._tmpColor = new THREE.Color();
    this._proj = new THREE.Vector3();

    this._buildParticles();
    this._buildRings();
    this._buildFlashes();

    this.popups = [];
  }

  _buildParticles() {
    const positions = new Float32Array(PARTICLE_COUNT * 3);
    const colors = new Float32Array(PARTICLE_COUNT * 3);
    positions.fill(-999);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
    const mat = new THREE.PointsMaterial({
      size: 0.24,
      map: getGlowTexture(),
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
    this.scene.add(this.points);

    this.pVel = new Float32Array(PARTICLE_COUNT * 3);
    this.pLife = new Float32Array(PARTICLE_COUNT);
    this.pMax = new Float32Array(PARTICLE_COUNT);
    this.pDrag = new Float32Array(PARTICLE_COUNT);
    this.pGrav = new Float32Array(PARTICLE_COUNT);
    this.pBase = new Float32Array(PARTICLE_COUNT * 3);
    this.pCursor = 0;
  }

  _buildRings() {
    this.rings = [];
    const geo = new THREE.RingGeometry(0.87, 0.98, 48, 1);
    for (let i = 0; i < RING_COUNT; i++) {
      const mat = new THREE.MeshBasicMaterial({
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.rotation.x = -Math.PI / 2;
      mesh.visible = false;
      mesh.renderOrder = 3;
      this.scene.add(mesh);
      this.rings.push({ mesh, life: 0, max: 0.5, from: 1, to: 6, baseOpacity: 0.8 });
    }
    this.ringCursor = 0;
  }

  _buildFlashes() {
    this.flashes = [];
    for (let i = 0; i < FLASH_COUNT; i++) {
      const mat = new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: 0xffffff,
        transparent: true,
        opacity: 0,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        depthTest: true,
      });
      const sprite = new THREE.Sprite(mat);
      sprite.visible = false;
      sprite.renderOrder = 5;
      this.scene.add(sprite);
      this.flashes.push({ sprite, life: 0, max: 0.08, size: 1 });
    }
    this.flashCursor = 0;
  }

  addShake(amount) {
    this.trauma = Math.min(1, this.trauma + amount);
  }

  spawnBurst(pos, color, count = 22, speed = 7, opts = {}) {
    const base = this._tmpColor.set(color);
    const grav = opts.gravity ?? 9;
    for (let n = 0; n < count; n++) {
      const i = this.pCursor;
      this.pCursor = (this.pCursor + 1) % PARTICLE_COUNT;
      const i3 = i * 3;
      const theta = Math.random() * Math.PI * 2;
      const phi = Math.acos(2 * Math.random() - 1);
      const v = speed * (0.35 + Math.random() * 0.85);
      const sx = Math.sin(phi) * Math.cos(theta);
      const sy = Math.cos(phi) * 0.8 + (opts.up ?? 0.35);
      const sz = Math.sin(phi) * Math.sin(theta);
      const posAttr = this.points.geometry.attributes.position.array;
      posAttr[i3] = pos.x + (Math.random() - 0.5) * 0.4;
      posAttr[i3 + 1] = pos.y + (Math.random() - 0.5) * 0.4;
      posAttr[i3 + 2] = pos.z + (Math.random() - 0.5) * 0.4;
      this.pVel[i3] = sx * v;
      this.pVel[i3 + 1] = sy * v;
      this.pVel[i3 + 2] = sz * v;
      this.pGrav[i] = grav;
      this.pDrag[i] = opts.drag ?? 2.1;
      const life = (opts.life ?? 0.65) * (0.55 + Math.random() * 0.8);
      this.pLife[i] = life;
      this.pMax[i] = life;
      const tint = 0.72 + Math.random() * 0.28;
      this.pBase[i3] = base.r * tint;
      this.pBase[i3 + 1] = base.g * tint;
      this.pBase[i3 + 2] = base.b * tint;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  spawnSparks(pos, dir, color, count = 8) {
    const base = this._tmpColor.set(color);
    for (let n = 0; n < count; n++) {
      const i = this.pCursor;
      this.pCursor = (this.pCursor + 1) % PARTICLE_COUNT;
      const i3 = i * 3;
      const posAttr = this.points.geometry.attributes.position.array;
      const spread = 2.4;
      const v = 4 + Math.random() * 5;
      posAttr[i3] = pos.x;
      posAttr[i3 + 1] = pos.y;
      posAttr[i3 + 2] = pos.z;
      this.pVel[i3] = (dir.x + (Math.random() - 0.5) * spread) * v * 0.55;
      this.pVel[i3 + 1] = (0.2 + Math.random() * 0.7) * 3;
      this.pVel[i3 + 2] = (dir.z + (Math.random() - 0.5) * spread) * v * 0.55;
      this.pGrav[i] = 12;
      this.pDrag[i] = 3;
      const life = 0.18 + Math.random() * 0.28;
      this.pLife[i] = life;
      this.pMax[i] = life;
      this.pBase[i3] = base.r;
      this.pBase[i3 + 1] = base.g;
      this.pBase[i3 + 2] = base.b;
    }
    this.points.geometry.attributes.position.needsUpdate = true;
    this.points.geometry.attributes.color.needsUpdate = true;
  }

  ring(pos, color, from = 1, to = 6, duration = 0.5, opacity = 0.85, y = 0.12) {
    const r = this.rings[this.ringCursor];
    this.ringCursor = (this.ringCursor + 1) % RING_COUNT;
    r.mesh.position.set(pos.x, y, pos.z);
    r.mesh.material.color.set(color);
    r.mesh.material.opacity = opacity;
    r.mesh.visible = true;
    r.mesh.scale.setScalar(from);
    r.life = duration;
    r.max = duration;
    r.from = from;
    r.to = to;
    r.baseOpacity = opacity;
  }

  flash(pos, color, size = 1.6) {
    const f = this.flashes[this.flashCursor];
    this.flashCursor = (this.flashCursor + 1) % FLASH_COUNT;
    f.sprite.position.copy(pos);
    f.sprite.material.color.set(color);
    f.sprite.material.opacity = 1;
    f.sprite.scale.setScalar(size);
    f.sprite.visible = true;
    f.life = 0.075;
    f.max = 0.075;
    f.size = size;
  }

  impact(pos, color = 0xffd166) {
    this.spawnSparks(pos, { x: 0, z: 0 }, color, 6);
    this.flash(pos, color, 0.9);
  }

  popup(worldPos, text, cls = "") {
    const el = document.createElement("div");
    el.className = `popup ${cls}`;
    el.textContent = text;
    this.popupContainer.appendChild(el);
    this.popups.push({
      el,
      pos: new THREE.Vector3(worldPos.x, worldPos.y, worldPos.z),
      life: 1.05,
      max: 1.05,
    });
  }

  clear() {
    const posAttr = this.points?.geometry.attributes.position;
    if (posAttr) {
      const a = posAttr.array;
      for (let i = 0; i < PARTICLE_COUNT; i++) {
        a[i * 3 + 1] = -999;
        this.pLife[i] = 0;
      }
      posAttr.needsUpdate = true;
    }
    for (const r of this.rings) {
      r.life = 0;
      r.mesh.visible = false;
    }
    for (const f of this.flashes) {
      f.life = 0;
      f.sprite.visible = false;
    }
    for (const p of this.popups) p.el.remove();
    this.popups.length = 0;
    this.trauma = 0;
  }

  update(dt, camera, width, height) {
    this.time += dt;
    this.trauma = Math.max(0, this.trauma - dt * 2.4);
    const amp = this.trauma * this.trauma;
    this.shakeOffset.set(
      (Math.random() - 0.5) * amp * 1.5,
      (Math.random() - 0.5) * amp * 1.1,
      (Math.random() - 0.5) * amp * 1.2
    );
    this.roll = (Math.random() - 0.5) * amp * 0.035;

    // particles
    const posAttr = this.points.geometry.attributes.position.array;
    const colAttr = this.points.geometry.attributes.color.array;
    let anyAlive = false;
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      if (this.pLife[i] <= 0) continue;
      anyAlive = true;
      const i3 = i * 3;
      this.pLife[i] -= dt;
      const life = this.pLife[i];
      if (life <= 0) {
        posAttr[i3 + 1] = -999;
        continue;
      }
      const drag = Math.max(0, 1 - this.pDrag[i] * dt);
      this.pVel[i3] *= drag;
      this.pVel[i3 + 2] *= drag;
      this.pVel[i3 + 1] = this.pVel[i3 + 1] * drag - this.pGrav[i] * dt;
      posAttr[i3] += this.pVel[i3] * dt;
      posAttr[i3 + 1] += this.pVel[i3 + 1] * dt;
      posAttr[i3 + 2] += this.pVel[i3 + 2] * dt;
      if (posAttr[i3 + 1] < 0.08) {
        posAttr[i3 + 1] = 0.08;
        this.pVel[i3 + 1] *= -0.32;
      }
      const fade = Math.pow(Math.max(0, life / this.pMax[i]), 1.35);
      colAttr[i3] = this.pBase[i3] * fade;
      colAttr[i3 + 1] = this.pBase[i3 + 1] * fade;
      colAttr[i3 + 2] = this.pBase[i3 + 2] * fade;
    }
    if (anyAlive || this.points.geometry.attributes.position.needsUpdate) {
      this.points.geometry.attributes.position.needsUpdate = true;
      this.points.geometry.attributes.color.needsUpdate = true;
    }

    // rings
    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.mesh.visible = false;
        continue;
      }
      const k = 1 - r.life / r.max;
      const s = r.from + (r.to - r.from) * (1 - Math.pow(1 - k, 2.4));
      r.mesh.scale.setScalar(s);
      r.mesh.material.opacity = r.baseOpacity * Math.pow(1 - k, 1.4);
    }

    // muzzle flashes
    for (const f of this.flashes) {
      if (f.life <= 0) continue;
      f.life -= dt;
      if (f.life <= 0) {
        f.sprite.visible = false;
        continue;
      }
      const k = 1 - f.life / f.max;
      f.sprite.material.opacity = 1 - k;
      f.sprite.scale.setScalar(f.size * (0.5 + k * 1.7));
    }

    // floating score popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      p.life -= dt;
      if (p.life <= 0) {
        p.el.remove();
        this.popups.splice(i, 1);
        continue;
      }
      const k = 1 - p.life / p.max;
      this._proj.copy(p.pos);
      this._proj.y += k * 2.1;
      this._proj.project(camera);
      if (this._proj.z > 1) {
        p.el.style.opacity = "0";
        continue;
      }
      const x = (this._proj.x * 0.5 + 0.5) * width;
      const y = (-this._proj.y * 0.5 + 0.5) * height;
      const scale = k < 0.12 ? 0.6 + (k / 0.12) * 0.65 : 1.25 - Math.min(0.25, (k - 0.12) * 0.6);
      p.el.style.left = `${x}px`;
      p.el.style.top = `${y}px`;
      p.el.style.opacity = String(Math.min(1, (1 - k) * 2.2));
      p.el.style.transform = `translate(-50%, -50%) scale(${scale.toFixed(3)})`;
    }
  }
}
