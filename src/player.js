import * as THREE from "three";
import { getGlowTexture } from "./textures.js";

const BASE_SPEED = 8.0;
const FRENZY_SPEED = 9.4;
const FIRE_RATE = 0.145;
const FRENZY_FIRE_RATE = 0.075;

const MOUTH_GAPS = [0.16, 0.3, 0.46, 0.64, 0.82, 0.98, 1.12, 1.22];
const CHOMPS = [0.16, 0.46, 0.82, 1.12, 1.22, 1.12, 0.82, 0.46];

function dampAngle(current, target, lambda, dt) {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * (1 - Math.exp(-lambda * dt));
}

function makeGun() {
  const gun = new THREE.Group();
  const bodyMat = new THREE.MeshStandardMaterial({
    color: 0x4a5c7a,
    metalness: 0.8,
    roughness: 0.26,
    emissive: 0x0e2438,
    emissiveIntensity: 0.9,
  });
  const darkMat = new THREE.MeshStandardMaterial({
    color: 0x111826,
    metalness: 0.7,
    roughness: 0.4,
  });
  const accMat = new THREE.MeshBasicMaterial({ color: 0xffd166 });

  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.3, 0.62), bodyMat);
  receiver.position.set(0, 0, 0.22);
  receiver.castShadow = false;
  gun.add(receiver);

  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.52, 8), darkMat);
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.03, 0.72);
  gun.add(barrel);

  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.34, 0.2), darkMat);
  grip.position.set(0, -0.26, 0.08);
  grip.rotation.x = -0.28;
  gun.add(grip);

  const rail = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.35), darkMat);
  rail.position.set(0, 0.19, 0.26);
  gun.add(rail);

  const sight = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.08, 0.05), accMat);
  sight.position.set(0, 0.25, 0.4);
  gun.add(sight);

  const strip = new THREE.Mesh(
    new THREE.BoxGeometry(0.07, 0.035, 0.46),
    new THREE.MeshBasicMaterial({ color: 0x34ecff })
  );
  strip.position.set(0.09, 0.17, 0.2);
  gun.add(strip);
  const strip2 = strip.clone();
  strip2.position.x = -0.09;
  gun.add(strip2);

  const muzzle = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.025, 6, 12), accMat);
  muzzle.position.set(0, 0.03, 0.98);
  gun.add(muzzle);

  const marker = new THREE.Object3D();
  marker.position.set(0, 0.03, 1.08);
  gun.add(marker);

  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: 0xffc94d,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    })
  );
  glow.position.set(0, 0.03, 1.02);
  glow.scale.setScalar(0.62);
  gun.add(glow);

  return { group: gun, marker, muzzleRing: muzzle, glow };
}

export class Player {
  constructor(scene, maze) {
    this.scene = scene;
    this.maze = maze;
    this.radius = 0.72;
    this.maxHp = 3;
    this.hp = 3;
    this.pos = maze.playerSpawn.clone();
    this.vel = new THREE.Vector3();
    this.aim = new THREE.Vector3(0, 0, 1);
    this.facing = 0;
    this.invuln = 0;
    this.frenzy = false;
    this.fireCd = 0;
    this.gunIndex = 0;
    this.chomp = 0;
    this.hurtFlash = 0;
    this.recoil = [0, 0];
    this.alive = true;
    this._v = new THREE.Vector3();
    this._muzzle = new THREE.Vector3();

    this._build();
    this.reset();
  }

  _build() {
    this.group = new THREE.Group();
    this.scene.add(this.group);

    this.pivot = new THREE.Group();
    this.group.add(this.pivot);

    this.geoms = MOUTH_GAPS.map(
      (gap) =>
        new THREE.SphereGeometry(
          1,
          40,
          26,
          Math.PI / 2 + gap / 2,
          Math.PI * 2 - gap
        )
    );
    this.chompGeoms = CHOMPS.map(
      (gap) =>
        new THREE.SphereGeometry(
          1,
          40,
          26,
          Math.PI / 2 + gap / 2,
          Math.PI * 2 - gap
        )
    );

    this.bodyMat = new THREE.MeshStandardMaterial({
      color: 0xffd400,
      emissive: 0xffb300,
      emissiveIntensity: 0.55,
      roughness: 0.3,
      metalness: 0.18,
    });
    this.body = new THREE.Mesh(this.geoms[0], this.bodyMat);
    this.body.position.y = 1.08;
    this.pivot.add(this.body);

    const eyeWhite = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const eyeBlack = new THREE.MeshBasicMaterial({ color: 0x090d18 });
    const eyeGeo = new THREE.SphereGeometry(0.17, 14, 10);
    const pupilGeo = new THREE.SphereGeometry(0.075, 10, 8);
    this.eyes = [];
    for (const side of [-1, 1]) {
      const white = new THREE.Mesh(eyeGeo, eyeWhite);
      white.position.set(side * 0.32, 1.44, 0.76);
      white.scale.set(0.92, 1.12, 0.62);
      const pupil = new THREE.Mesh(pupilGeo, eyeBlack);
      pupil.position.set(side * 0.34, 1.46, 0.88);
      this.pivot.add(white, pupil);
      this.eyes.push(white, pupil);
    }

    this.gunRig = new THREE.Group();
    this.gunRig.position.y = 0;
    this.pivot.add(this.gunRig);
    this.guns = [];
    const braceMat = new THREE.MeshStandardMaterial({
      color: 0x1a2333,
      metalness: 0.7,
      roughness: 0.38,
    });
    for (const side of [-1, 1]) {
      const brace = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 0.58), braceMat);
      brace.position.set(side * 0.62, 1.16, 0.5);
      this.pivot.add(brace);

      const gun = makeGun();
      gun.group.scale.setScalar(1.4);
      gun.group.position.set(side * 0.92, 1.34, 0.5);
      gun.group.rotation.y = side * 0.13;
      gun.group.rotation.z = side * -0.05;
      gun.baseZ = 0.5;
      gun.side = side;
      this.gunRig.add(gun.group);
      this.guns.push(gun);
    }

    this.shadow = new THREE.Mesh(
      new THREE.CircleGeometry(1.12, 28),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.34,
        depthWrite: false,
      })
    );
    this.shadow.rotation.x = -Math.PI / 2;
    this.shadow.position.y = 0.025;
    this.group.add(this.shadow);

    this.aura = new THREE.Mesh(
      new THREE.RingGeometry(1.18, 1.46, 48),
      new THREE.MeshBasicMaterial({
        color: 0x34ecff,
        transparent: true,
        opacity: 0.7,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.DoubleSide,
      })
    );
    this.aura.rotation.x = -Math.PI / 2;
    this.aura.position.y = 0.07;
    this.aura.visible = false;
    this.group.add(this.aura);

    this.auraSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: getGlowTexture(),
        color: 0xffd400,
        transparent: true,
        opacity: 0.2,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
      })
    );
    this.auraSprite.scale.setScalar(5.2);
    this.auraSprite.position.y = 1.15;
    this.auraSprite.visible = false;
    this.group.add(this.auraSprite);
  }

  reset() {
    this.pos.copy(this.maze.playerSpawn);
    this.vel.set(0, 0, 0);
    this.aim.set(0, 0, 1);
    this.facing = 0;
    this.hp = this.maxHp;
    this.invuln = 0;
    this.frenzy = false;
    this.fireCd = 0;
    this.alive = true;
    this.hurtFlash = 0;
    this.recoil[0] = 0;
    this.recoil[1] = 0;
    this.group.visible = true;
    this.pivot.visible = true;
    this.aura.visible = false;
    this.auraSprite.visible = false;
    this.group.position.set(this.pos.x, 0, this.pos.z);
    this.pivot.rotation.y = 0;
    this.body.geometry = this.geoms[0];
    this.bodyMat.color.set(0xffd400);
    this.bodyMat.emissive.set(0xffb300);
    this.bodyMat.emissiveIntensity = 0.55;
    this.body.visible = true;
    for (const gun of this.guns) gun.group.visible = true;
    for (const e of this.eyes) e.visible = true;
  }

  setFrenzy(on) {
    this.frenzy = on;
    this.aura.visible = on;
    this.auraSprite.visible = on;
    if (!on) {
      this.bodyMat.color.set(0xffd400);
      this.bodyMat.emissive.set(0xffb300);
    }
  }

  heal(n) {
    this.hp = Math.min(this.maxHp, this.hp + n);
  }

  damage() {
    if (this.invuln > 0 || !this.alive) return false;
    this.hp -= 1;
    this.invuln = 2.1;
    this.hurtFlash = 0.22;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      this.group.visible = false;
    }
    return true;
  }

  tryFire(targets) {
    if (this.fireCd > 0 || !this.alive) return null;
    this.fireCd = this.frenzy ? FRENZY_FIRE_RATE : FIRE_RATE;
    const gun = this.guns[this.gunIndex];
    this.gunIndex = (this.gunIndex + 1) % 2;
    this.recoil[this.guns.indexOf(gun)] = 1;
    this.group.updateMatrixWorld(true);
    gun.marker.getWorldPosition(this._muzzle);
    const dir = this._v.copy(this.aim).setY(0).normalize().clone();
    return { pos: this._muzzle.clone(), dir, muzzle: this._muzzle.clone(), side: gun.side };
  }

  update(dt, move, aimDir, maze, t) {
    if (!this.alive) return;
    this.invuln = Math.max(0, this.invuln - dt);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.hurtFlash = Math.max(0, this.hurtFlash - dt);

    const speed = this.frenzy ? FRENZY_SPEED : BASE_SPEED;
    const targetVX = move.x * speed;
    const targetVZ = move.y * speed;
    const smoothing = 1 - Math.exp(-15 * dt);
    this.vel.x += (targetVX - this.vel.x) * smoothing;
    this.vel.z += (targetVZ - this.vel.z) * smoothing;
    if (Math.abs(this.vel.x) < 0.01) this.vel.x = 0;
    if (Math.abs(this.vel.z) < 0.01) this.vel.z = 0;

    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.z * dt;
    maze.resolveCircle(this.pos, this.radius);

    this.group.position.set(this.pos.x, 0, this.pos.z);

    if (aimDir && (aimDir.x !== 0 || aimDir.z !== 0)) {
      this.aim.copy(aimDir).setY(0).normalize();
    }
    const targetAngle = Math.atan2(this.aim.x, this.aim.z);
    this.facing = dampAngle(this.facing, targetAngle, 16, dt);
    this.pivot.rotation.y = this.facing;

    const spd = Math.hypot(this.vel.x, this.vel.z);
    this.chomp += dt * (spd > 0.6 ? 7.5 + spd * 1.15 : 1.8);
    let idx;
    if (spd > 0.6) {
      const phase = (this.chomp * 0.55) % CHOMPS.length;
      idx = Math.floor(phase) % CHOMPS.length;
    } else {
      idx = 0;
    }
    const geo = this.chompGeoms[idx];
    if (this.body.geometry !== geo) this.body.geometry = geo;

    this.body.position.y = 1.08 + Math.sin(this.chomp * 2) * 0.035;
    this.body.rotation.z = Math.sin(this.chomp * 0.9) * 0.04;
    this.body.rotation.x = -Math.min(0.16, spd * 0.012);

    for (let i = 0; i < this.guns.length; i++) {
      const gun = this.guns[i];
      this.recoil[i] = Math.max(0, this.recoil[i] - dt * 8);
      const kick = this.recoil[i] * this.recoil[i];
      gun.group.position.z = gun.baseZ - kick * 0.17;
      gun.group.rotation.x = -kick * 0.14;
      gun.muzzleRing.material.color.setHex(this.frenzy ? 0x34ecff : 0xffd166);
    }

    if (this.frenzy) {
      this.aura.rotation.z += dt * 1.6;
      const pulse = 1 + Math.sin(t * 7) * 0.12;
      this.aura.scale.setScalar(pulse);
      this.aura.material.opacity = 0.45 + Math.sin(t * 8) * 0.2;
      this.auraSprite.material.opacity = 0.15 + Math.sin(t * 6) * 0.06;
      this.bodyMat.emissive.setHex(0xffa200);
      this.bodyMat.emissiveIntensity = 0.7 + Math.sin(t * 10) * 0.18;
    } else if (this.hurtFlash > 0) {
      this.bodyMat.emissive.setHex(0xff2038);
      this.bodyMat.emissiveIntensity = 1.4;
    } else {
      this.bodyMat.emissive.setHex(0xffb300);
      this.bodyMat.emissiveIntensity = 0.55;
    }

    const blink = this.invuln > 0 ? Math.floor(this.invuln * 14) % 2 === 0 : true;
    this.body.visible = blink;
    for (const e of this.eyes) e.visible = blink;
    for (const gun of this.guns) gun.group.visible = blink;
  }
}
