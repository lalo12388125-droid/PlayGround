import * as THREE from "three";
import { Maze } from "./world.js";
import { Player } from "./player.js";
import { GhostManager } from "./ghosts.js";
import { FX } from "./fx.js";
import { UI } from "./ui.js";
import { Input } from "./input.js";
import { AudioEngine } from "./audio.js";
import { getGlowTexture } from "./textures.js";

const STATE = {
  MENU: "menu",
  PLAYING: "playing",
  PAUSED: "paused",
  DYING: "dying",
  CLEARED: "cleared",
  OVER: "over",
};

const BULLET_COUNT = 72;
const ORB_COUNT = 32;
const BULLET_SPEED = 44;
const ORB_SPEED = 7.2;
const FRENZY_BASE = 8.2;

function pad(n, w = 2) {
  return String(n).padStart(w, "0");
}

function segmentDist2(ax, az, bx, bz, cx, cz) {
  const abx = bx - ax;
  const abz = bz - az;
  const acx = cx - ax;
  const acz = cz - az;
  const len2 = abx * abx + abz * abz;
  let t = len2 > 0 ? (acx * abx + acz * abz) / len2 : 0;
  t = Math.max(0, Math.min(1, t));
  const px = ax + abx * t - cx;
  const pz = az + abz * t - cz;
  return px * px + pz * pz;
}

class Game {
  constructor() {
    this.canvas = document.getElementById("scene");
    this.isTouch =
      (window.matchMedia && window.matchMedia("(pointer: coarse)").matches) ||
      navigator.maxTouchPoints > 0;

    this.state = STATE.MENU;
    this.time = 0;
    this.menuTime = 0;
    this.stateTimer = 0;
    this.score = 0;
    this.level = 1;
    this.combo = 0;
    this.kills = 0;
    this.frenzy = 0;
    this.frenzyMax = FRENZY_BASE;
    this.best = 0;
    this.heartTimer = 0;

    this._move = { x: 0, y: 0 };
    this._stickAim = { x: 0, y: 0 };
    this._aimDir = new THREE.Vector3(0, 0, 1);
    this._aimPoint = new THREE.Vector3();
    this._aimFallback = new THREE.Vector3(0, 0, 1);
    this._ndc = new THREE.Vector2(0, 0);
    this._raycaster = new THREE.Raycaster();
    this._plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -1.0);
    this._desired = new THREE.Vector3();
    this._look = new THREE.Vector3();
    this._cameraLook = new THREE.Vector3();
    this._tmp = new THREE.Vector3();
    this._prev = new THREE.Vector3();

    this._initRenderer();
    this._initScene();

    this.audio = new AudioEngine();
    this.ui = new UI();
    this.input = new Input(this.canvas, {
      onPause: () => this.togglePause(),
      onMute: () => this.toggleMute(),
      onEnter: () => this.handleEnter(),
      onGesture: () => this.audio.init(),
    });
    this.isTouch = this.input.isTouch;

    this.maze = new Maze(this.scene);
    this.player = new Player(this.scene, this.maze);
    this.fx = new FX(this.scene, this.camera, document.getElementById("popups"));
    this.ghosts = new GhostManager(this.scene, this.maze);
    this.ghosts.shoot = (spec) => this._spawnOrb(spec);

    this._buildBullets();
    this._buildOrbs();
    this._bindUI();
    this._resetWorld();
    this._resize();

    this.ui.setMuted(this.audio.muted);
    this.ui.showScreen("menu");
    this.camera.position.set(0, 26, 34);
    this.camera.lookAt(0, 0, 0);
    this._cameraLook.set(0, 0, 0);
    this.playerLight.position.copy(this.player.pos).setY(3);

    window.addEventListener("resize", () => this._resize());
    window.addEventListener("orientationchange", () => setTimeout(() => this._resize(), 120));
    document.addEventListener("visibilitychange", () => {
      if (document.hidden && this.state === STATE.PLAYING) this.pause();
    });

    this.clock = new THREE.Clock();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  _initRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      canvas: this.canvas,
      antialias: true,
      powerPreference: "high-performance",
      alpha: false,
    });
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.isTouch ? 1.5 : 2)
    );
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.06;
    this.renderer.setClearColor(0x03040c, 1);
  }

  _initScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x03040c);
    this.scene.fog = new THREE.FogExp2(0x03040c, 0.0105);

    this.camera = new THREE.PerspectiveCamera(52, 1, 0.1, 180);
    this.camera.position.set(0, 26, 34);
    this.camera.lookAt(0, 0, 0);

    const hemi = new THREE.HemisphereLight(0x4a7dff, 0x05060d, 0.6);
    this.scene.add(hemi);

    const key = new THREE.DirectionalLight(0xfff1cf, 1.25);
    key.position.set(20, 32, 12);
    this.scene.add(key);

    const rim = new THREE.DirectionalLight(0x2d7bff, 0.55);
    rim.position.set(-18, 14, -24);
    this.scene.add(rim);

    const centerGlow = new THREE.PointLight(0x34ecff, 38, 32, 2);
    centerGlow.position.set(0, 9, 0);
    this.scene.add(centerGlow);

    this.playerLight = new THREE.PointLight(0xffd400, 15, 13, 2);
    this.playerLight.position.set(0, 3, 0);
    this.scene.add(this.playerLight);
  }

  _buildBullets() {
    const geo = new THREE.CapsuleGeometry(0.065, 0.85, 3, 6);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    const glowMat = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: 0xff8a1e,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.bullets = [];
    for (let i = 0; i < BULLET_COUNT; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      mesh.visible = false;
      mesh.frustumCulled = false;
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(1.55);
      mesh.add(glow);
      this.scene.add(mesh);
      this.bullets.push({
        mesh,
        active: false,
        life: 0,
        fresh: false,
        dir: new THREE.Vector3(),
        vel: new THREE.Vector3(),
      });
    }
    this.bulletCursor = 0;
  }

  _buildOrbs() {
    const geo = new THREE.SphereGeometry(0.23, 12, 10);
    const mat = new THREE.MeshBasicMaterial({ color: 0xff4fd8 });
    const glowMat = new THREE.SpriteMaterial({
      map: getGlowTexture(),
      color: 0xff3fbe,
      transparent: true,
      opacity: 0.85,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    this.orbs = [];
    for (let i = 0; i < ORB_COUNT; i++) {
      const mesh = new THREE.Mesh(geo, mat);
      const glow = new THREE.Sprite(glowMat);
      glow.scale.setScalar(2.1);
      mesh.add(glow);
      mesh.visible = false;
      mesh.frustumCulled = false;
      this.scene.add(mesh);
      this.orbs.push({
        mesh,
        active: false,
        life: 0,
        phase: Math.random() * 6.28,
        dir: new THREE.Vector3(),
      });
    }
    this.orbCursor = 0;
  }

  _bindUI() {
    this.ui.bind({
      onStart: () => this.startRun(),
      onResume: () => this.resume(),
      onRestart: () => this.startRun(),
      onMenu: () => this.goMenu(),
      onPause: () => this.togglePause(),
      onMute: () => this.toggleMute(),
      onGesture: () => this.audio.init(),
    });
  }

  _resetWorld() {
    this.maze.resetPellets(1);
    this.player.reset();
    this.ghosts.reset(1);
    this.fx.clear();
    for (const b of this.bullets) {
      b.active = false;
      b.mesh.visible = false;
    }
    for (const o of this.orbs) {
      o.active = false;
      o.mesh.visible = false;
    }
    this.score = 0;
    this.level = 1;
    this.combo = 0;
    this.kills = 0;
    this.frenzy = 0;
    this.frenzyMax = FRENZY_BASE;
    this.playerLight.intensity = 15;
    this.player.setFrenzy(false);
    this.ghosts.setFlee(false);
    this.ui.update({
      score: 0,
      level: 1,
      pellets: this.maze.pelletsLeft,
      hp: this.player.maxHp,
      maxHp: this.player.maxHp,
      frenzy: 0,
      frenzyMax: this.frenzyMax,
    });
  }

  _resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.renderer.setPixelRatio(
      Math.min(window.devicePixelRatio || 1, this.isTouch ? 1.5 : 2)
    );
    const aspect = w / h;
    this.camera.aspect = aspect;
    this.camera.fov = aspect < 0.8 ? 62 : 52;
    this.camera.updateProjectionMatrix();
    this.viewW = w;
    this.viewH = h;
  }

  startRun() {
    this.audio.init();
    this.audio.startAmbience();
    this.audio.startGame();
    this._resetWorld();
    this.player.aim.set(0, 0, -1);
    this.player.facing = Math.PI;
    this._aimDir.set(0, 0, -1);
    this._aimFallback.set(0, 0, -1);
    this.state = STATE.PLAYING;
    this.menuTime = 0;
    this.stateTimer = 0;
    this.heartTimer = 0;
    this.ui.showScreen("none");
    this.ui.toast("SECTOR 01 // CLEAR THE MAZE", "cool", 1900);
    this._snapCameraBehind(true);
  }

  _snapCameraBehind(dropIn = false) {
    this._desired.copy(this.player.pos).add(this._cameraOffset());
    if (dropIn) this._desired.y += 8;
    this.camera.position.copy(this._desired);
    this._cameraLook.copy(this.player.pos).setY(0.7);
    this._clampLook(this._cameraLook);
    this.camera.lookAt(this._cameraLook);
  }

  _clampLook(target) {
    const lim = Math.max(0, this.maze.size * 0.5 - 8);
    target.x = THREE.MathUtils.clamp(target.x, -lim, lim);
    target.z = THREE.MathUtils.clamp(target.z, -lim, lim);
    return target;
  }

  _cameraOffset() {
    const portrait = this.viewW / this.viewH < 0.8;
    return portrait
      ? this._tmp.set(0, 30, 19)
      : this._tmp.set(0, 26, 14);
  }

  goMenu() {
    this.audio.stopAmbience();
    if (this.audio.ctx && this.audio.ctx.state === "suspended") this.audio.ctx.resume();
    this._resetWorld();
    this.state = STATE.MENU;
    this.menuTime = 0;
    this.ui.showScreen("menu");
    this.camera.position.set(0, 26, 34);
    this._cameraLook.set(0, 0, 0);
    this.camera.lookAt(0, 0, 0);
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.ui.showScreen("pause");
    if (this.audio.ctx) this.audio.ctx.suspend().catch(() => {});
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    this.ui.showScreen("none");
    if (this.audio.ctx) this.audio.ctx.resume().catch(() => {});
    this.clock.getDelta();
  }

  togglePause() {
    if (this.state === STATE.PLAYING) this.pause();
    else if (this.state === STATE.PAUSED) this.resume();
  }

  handleEnter() {
    if (this.state === STATE.MENU || this.state === STATE.OVER) this.startRun();
    else if (this.state === STATE.PAUSED) this.resume();
  }

  toggleMute() {
    this.audio.init();
    const muted = this.audio.toggleMuted();
    this.ui.setMuted(muted);
    if (!muted && this.state !== STATE.MENU && this.state !== STATE.PAUSED) {
      this.audio.startAmbience();
    }
  }

  _loop() {
    requestAnimationFrame(this._loop);
    const dt = Math.min(0.05, this.clock.getDelta());
    if (this.state !== STATE.PAUSED) {
      this.time += dt;
      this._update(dt);
    }
    this.renderer.render(this.scene, this.camera);
  }

  _update(dt) {
    const t = this.time;
    this.fx.update(dt, this.camera, this.viewW, this.viewH);
    this.maze.update(dt, t);
    this._updateOrbs(dt, t);

    if (this.state === STATE.MENU) {
      this.menuTime += dt;
      const angle = this.menuTime * 0.09;
      this.camera.position.set(Math.sin(angle) * 32, 24, Math.cos(angle) * 32);
      this._cameraLook.set(0, 0.6, 0);
      this.camera.lookAt(this._cameraLook);
      this.player.update(dt, this._moveZero(), this._aimFallback.set(0, 0, -1), this.maze, t);
      this.ghosts.update(dt, t, this._tmp.set(0, 0, 0), this.maze);
      return;
    }

    if (this.state === STATE.PLAYING) {
      this._updatePlaying(dt, t);
      return;
    }

    if (this.state === STATE.DYING) {
      this.stateTimer -= dt;
      this._updateCamera(dt, 0.5);
      this.ui.update(this._hudState());
      if (this.stateTimer <= 0) this._finishGameOver();
      return;
    }

    if (this.state === STATE.CLEARED) {
      this.stateTimer -= dt;
      this.player.update(
        dt,
        this._moveZero(),
        this._aimFallback.copy(this.player.aim),
        this.maze,
        t
      );
      this._updateCamera(dt, 0.8);
      this.ui.update(this._hudState());
      if (this.stateTimer <= 0) this._nextLevel();
      return;
    }

    if (this.state === STATE.OVER) {
      this._updateCamera(dt, 0.25);
      this.ui.update(this._hudState());
    }
  }

  _moveZero() {
    this._move.x = 0;
    this._move.y = 0;
    return this._move;
  }

  _hudState() {
    return {
      score: this.score,
      level: this.level,
      pellets: this.maze.pelletsLeft,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      frenzy: this.frenzy,
      frenzyMax: this.frenzyMax,
    };
  }

  _updatePlaying(dt, t) {
    const input = this.input;
    input.getMove(this._move);

    const stickAim = input.getStickAim(this._stickAim);
    if (stickAim) {
      this._aimDir.set(stickAim.x, 0, stickAim.y);
      if (this._aimDir.lengthSq() > 0.0001) this._aimDir.normalize();
      this._aimFallback.copy(this._aimDir);
    } else if (input.pointer.active) {
      const rect = this.canvas.getBoundingClientRect();
      this._ndc.x = ((input.pointer.x - rect.left) / rect.width) * 2 - 1;
      this._ndc.y = -((input.pointer.y - rect.top) / rect.height) * 2 + 1;
      this._raycaster.setFromCamera(this._ndc, this.camera);
      if (this._raycaster.ray.intersectPlane(this._plane, this._aimPoint)) {
        const dx = this._aimPoint.x - this.player.pos.x;
        const dz = this._aimPoint.z - this.player.pos.z;
        const len = Math.hypot(dx, dz);
        if (len > 1.4) {
          this._aimDir.set(dx / len, 0, dz / len);
          this._aimFallback.copy(this._aimDir);
        }
      }
    }

    this.player.update(dt, this._move, this._aimDir, this.maze, t);
    this.playerLight.position.copy(this.player.pos).setY(3.2);

    if (this.frenzy > 0) {
      this.frenzy -= dt;
      if (this.frenzy <= 0) this._endFrenzy();
    }

    if (input.firing()) {
      const shot = this.player.tryFire();
      if (shot) {
        this._spawnBullet(shot);
        this.fx.flash(shot.muzzle, this.player.frenzy ? 0x6ff6ff : 0xffd166, 1.15);
        this.fx.spawnSparks(shot.muzzle, shot.dir, 0xffe27a, 3);
        this.fx.addShake(0.045);
        this.audio.shoot(this.player.frenzy);
      }
    }

    if (!this.audio.ambience && !this.audio.muted && this.audio.ctx) {
      this.audio.startAmbience();
    }

    this._updateBullets(dt);

    const got = this.maze.collectAt(this.player.pos, 0.92);
    if (got.pellets > 0) {
      this.score += got.pellets * 10;
      this.audio.chomp();
      this.fx.addShake(0.012);
    }
    if (got.power > 0) this._startFrenzy();

    this.ghosts.update(dt, t, this.player.pos, this.maze);

    // Ghost / player contact
    if (this.player.alive) {
      for (const g of this.ghosts.ghosts) {
        if (!g.active || g.spawnProtect > 0) continue;
        const dx = g.pos.x - this.player.pos.x;
        const dz = g.pos.z - this.player.pos.z;
        if (dx * dx + dz * dz > 2.35) continue;
        if (this.player.frenzy) {
          g.die();
          this._ghostKilled(g);
          this.audio.eatGhost(this.combo);
        } else if (this.player.invuln <= 0) {
          this._damagePlayer(g.pos);
          const away = this._tmp.copy(g.pos).sub(this.player.pos).setY(0);
          if (away.lengthSq() > 0.001) {
            away.normalize();
            g.pos.addScaledVector(away, 1.1);
            this.maze.resolveCircle(g.pos, 0.62);
          }
          break;
        }
      }
    }

    this._updateCamera(dt, 1);
    this.ui.update(this._hudState());

    const pointerActive = !this.isTouch && this.input.pointer.active;
    this.ui.crosshair(
      this.input.pointer.x,
      this.input.pointer.y,
      pointerActive,
      this.input.firing()
    );

    if (this.player.hp === 1 && this.player.alive) {
      this.heartTimer -= dt;
      if (this.heartTimer <= 0) {
        this.audio.heartbeat();
        this.heartTimer = 1.05;
      }
    } else {
      this.heartTimer = 0;
    }

    if (this.maze.pelletsLeft <= 0 && this.state === STATE.PLAYING) this._levelClear();
  }

  _updateCamera(dt, followStrength = 1) {
    const offset = this._cameraOffset();
    this._desired.copy(this.player.pos).add(offset);
    const k = 1 - Math.exp(-4.5 * dt * followStrength);
    this.camera.position.lerp(this._desired, k);

    this._look
      .copy(this.player.pos)
      .addScaledVector(this.player.aim, 1.9)
      .setY(0.7 + this.player.pos.y * 0);
    this._clampLook(this._look);
    const lk = 1 - Math.exp(-7 * dt * followStrength);
    this._cameraLook.lerp(this._look, lk);
    this.camera.lookAt(this._cameraLook);
    this.camera.position.add(this.fx.shakeOffset);
    this.camera.rotation.z += this.fx.roll;
  }

  _spawnBullet(shot) {
    const b = this.bullets[this.bulletCursor];
    this.bulletCursor = (this.bulletCursor + 1) % BULLET_COUNT;
    b.active = true;
    b.life = 1.3;
    b.fresh = true;
    b.dir.copy(shot.dir);
    b.vel.copy(shot.dir).multiplyScalar(BULLET_SPEED);
    const spawn = this._tmp.copy(shot.pos);
    if (this.maze.isWallAtWorld(spawn.x, spawn.z)) {
      spawn.copy(this.player.pos).addScaledVector(shot.dir, 1.25);
      spawn.y = 1.03;
    }
    b.mesh.position.copy(spawn);
    b.mesh.rotation.set(0, Math.atan2(shot.dir.x, shot.dir.z), 0);
    b.mesh.visible = true;
  }

  _updateBullets(dt) {
    for (const b of this.bullets) {
      if (!b.active) continue;
      if (b.fresh) {
        this._prev.set(this.player.pos.x, b.mesh.position.y, this.player.pos.z);
        b.fresh = false;
      } else {
        this._prev.copy(b.mesh.position);
      }
      b.mesh.position.addScaledVector(b.vel, dt);
      b.life -= dt;
      if (b.life <= 0) {
        b.active = false;
        b.mesh.visible = false;
        continue;
      }

      let hitWall = false;
      const steps = 4;
      for (let i = 1; i <= steps; i++) {
        const t = i / steps;
        const x = this._prev.x + (b.mesh.position.x - this._prev.x) * t;
        const z = this._prev.z + (b.mesh.position.z - this._prev.z) * t;
        if (this.maze.isWallAtWorld(x, z)) {
          hitWall = true;
          b.mesh.position.set(x, this._prev.y, z);
          break;
        }
      }
      if (hitWall) {
        this.fx.impact(b.mesh.position, 0xffd166);
        this.audio.hit();
        b.active = false;
        b.mesh.visible = false;
        continue;
      }

      for (const g of this.ghosts.ghosts) {
        if (!g.active) continue;
        const d2 = segmentDist2(
          this._prev.x,
          this._prev.z,
          b.mesh.position.x,
          b.mesh.position.z,
          g.pos.x,
          g.pos.z
        );
        if (d2 < 0.98) {
          const killed = g.hit(this.player.frenzy ? 99 : 1, b.dir);
          this.fx.spawnSparks(
            this._tmp.set(g.pos.x, 1.1, g.pos.z),
            b.dir,
            g.baseColor,
            6
          );
          this.fx.flash(this._tmp, g.baseColor, 1.5);
          this.fx.addShake(0.09);
          if (killed) this._ghostKilled(g);
          else this.audio.hit();
          b.active = false;
          b.mesh.visible = false;
          break;
        }
      }
    }
  }

  _ghostKilled(g) {
    this.kills++;
    const inFrenzy = this.player.frenzy;
    let value;
    if (inFrenzy) {
      this.combo += 1;
      value = 200 * Math.pow(2, Math.min(4, this.combo - 1));
    } else {
      value = 150;
    }
    this.score += value;
    const wp = g.worldPos;
    this.fx.spawnBurst(wp, g.baseColor, 44, 10.5, { life: 0.85, up: 0.55, gravity: 11 });
    this.fx.spawnBurst(wp, 0xffffff, 12, 5.5, { life: 0.4, gravity: 5, up: 0.8 });
    this.fx.ring(g.pos, g.baseColor, 1, 4.4, 0.45, 0.55);
    this.fx.flash(wp, g.baseColor, 2.6);
    this.fx.addShake(0.4);
    this.fx.popup(wp, `+${value}`, inFrenzy ? "combo" : "");
    if (inFrenzy && this.combo >= 2) {
      this.ui.toast(`GHOST CHAIN \u00d7${this.combo}`, "", 900);
    }
    if (!inFrenzy) this.audio.ghostDie();
  }

  _damagePlayer(sourcePos) {
    if (!this.player.damage()) return;
    this.audio.hurt();
    const p = new THREE.Vector3(this.player.pos.x, 1.15, this.player.pos.z);
    this.fx.spawnBurst(p, 0xff3b5f, 34, 8.5, { life: 0.7 });
    this.fx.spawnBurst(p, 0xffd400, 18, 6, { life: 0.6 });
    this.fx.flash(p, 0xff3b5f, 3.2);
    this.fx.ring(this.player.pos, 0xff3b5f, 1, 4.8, 0.5, 0.55);
    this.fx.addShake(0.85);
    this.ui.flashDamage();
    const away = this._tmp.copy(this.player.pos).sub(sourcePos).setY(0);
    if (away.lengthSq() > 0.001) {
      away.normalize();
      this.player.pos.addScaledVector(away, 1.7);
      this.player.vel.addScaledVector(away, 5);
      this.maze.resolveCircle(this.player.pos, this.player.radius);
    }
    if (!this.player.alive) this._playerDied();
    else this.ui.toast(`HULL BREACH // ${this.player.hp} LEFT`, "danger", 1100);
  }

  _playerDied() {
    this.state = STATE.DYING;
    this.stateTimer = 1.65;
    this.audio.stopAmbience();
    this.audio.gameOver();
    const p = new THREE.Vector3(this.player.pos.x, 1.15, this.player.pos.z);
    this.fx.spawnBurst(p, 0xffd400, 80, 14, { life: 1.2, up: 0.7, gravity: 8 });
    this.fx.spawnBurst(p, 0xff3b5f, 40, 10, { life: 0.9 });
    this.fx.ring(this.player.pos, 0xffd400, 1, 9, 0.9, 0.6);
    this.fx.flash(p, 0xff6a5f, 5);
    this.fx.addShake(1);
    this.playerLight.intensity = 0;
  }

  _finishGameOver() {
    this.state = STATE.OVER;
    this.best = Math.max(this.score, this.ui.best);
    this.ui.setBest(this.best);
    this.ui.showOver({
      score: this.score,
      best: this.best,
      level: this.level,
      kills: this.kills,
    });
    this.playerLight.intensity = 15;
  }

  _startFrenzy() {
    this.frenzyMax = Math.max(5.0, FRENZY_BASE - (this.level - 1) * 0.22);
    this.frenzy = this.frenzyMax;
    this.combo = 0;
    this.player.setFrenzy(true);
    this.ghosts.setFlee(true);
    this.audio.power();
    this.audio.setFrenzy(true);
    const p = new THREE.Vector3(this.player.pos.x, 1.1, this.player.pos.z);
    this.fx.ring(this.player.pos, 0x34ecff, 1, 7.5, 0.7, 0.65);
    this.fx.spawnBurst(p, 0x34ecff, 46, 9, { life: 0.9, up: 0.8 });
    this.fx.flash(p, 0x8df7ff, 4);
    this.fx.addShake(0.45);
    this.ui.toast("FRENZY // SHOOT ANYTHING THAT MOVES", "", 1700);
  }

  _endFrenzy() {
    this.frenzy = 0;
    this.combo = 0;
    this.player.setFrenzy(false);
    this.ghosts.setFlee(false);
    this.audio.setFrenzy(false);
    this.audio.powerEnd();
    this.ui.toast("FRENZY SPENT", "cool", 1100);
  }

  _levelClear() {
    this.state = STATE.CLEARED;
    this.stateTimer = 2.6;
    const bonus = 500 * this.level + this.player.hp * 100;
    this.score += bonus;
    this.frenzy = 0;
    this.combo = 0;
    this.player.setFrenzy(false);
    this.ghosts.setFlee(false);
    this.audio.setFrenzy(false);
    this.audio.levelClear(this.level);
    this.ui.showClear(this.level, bonus);
    const p = new THREE.Vector3(this.player.pos.x, 1.1, this.player.pos.z);
    this.fx.spawnBurst(p, 0xffd400, 50, 10, { life: 1, up: 0.8 });
    this.fx.ring(this.player.pos, 0xffd400, 1.5, 8.5, 0.8, 0.55);
    this.fx.addShake(0.5);
  }

  _nextLevel() {
    this.level += 1;
    this.maze.resetPellets(this.level);
    this.ghosts.reset(this.level);
    this.player.heal(1);
    this.player.invuln = Math.max(this.player.invuln, 1.2);
    this.frenzy = 0;
    this.combo = 0;
    this.state = STATE.PLAYING;
    this.ui.showScreen("none");
    this.ui.toast(`SECTOR ${pad(this.level)} // ${Math.min(8, 3 + this.level)} HOSTILES`, "cool", 1700);
    this.audio.startGame();
    this.audio.startAmbience();
    this._snapCameraBehind(true);
  }

  _spawnOrb(spec) {
    if (this.state !== STATE.PLAYING) return;
    const o = this.orbs[this.orbCursor];
    this.orbCursor = (this.orbCursor + 1) % ORB_COUNT;
    o.active = true;
    o.life = 5;
    o.dir.set(spec.dirX, 0, spec.dirZ).normalize();
    o.phase = Math.random() * 6.28;
    o.mesh.position.set(spec.x, spec.y ?? 1.15, spec.z);
    o.mesh.visible = true;
    this.fx.flash(o.mesh.position, 0xff3fbe, 1.2);
    this.audio.orbFire();
  }

  _updateOrbs(dt, t) {
    for (const o of this.orbs) {
      if (!o.active) continue;
      this._prev.copy(o.mesh.position);
      o.mesh.position.addScaledVector(o.dir, ORB_SPEED * dt);
      o.mesh.position.y = 1.12 + Math.sin(t * 9 + o.phase) * 0.06;
      o.life -= dt;
      if (o.life <= 0) {
        o.active = false;
        o.mesh.visible = false;
        continue;
      }
      let hitWall = false;
      const steps = 3;
      for (let i = 1; i <= steps; i++) {
        const k = i / steps;
        const x = this._prev.x + (o.mesh.position.x - this._prev.x) * k;
        const z = this._prev.z + (o.mesh.position.z - this._prev.z) * k;
        if (this.maze.isWallAtWorld(x, z)) {
          hitWall = true;
          o.mesh.position.set(x, o.mesh.position.y, z);
          break;
        }
      }
      if (hitWall) {
        this.fx.spawnBurst(o.mesh.position, 0xff3fbe, 14, 5, { life: 0.4 });
        this.fx.flash(o.mesh.position, 0xff3fbe, 1.6);
        this.audio.orbPop();
        o.active = false;
        o.mesh.visible = false;
        continue;
      }
      if (this.state === STATE.PLAYING && this.player.alive) {
        const dx = o.mesh.position.x - this.player.pos.x;
        const dz = o.mesh.position.z - this.player.pos.z;
        if (dx * dx + dz * dz < 1.0) {
          if (this.player.invuln <= 0) this._damagePlayer(o.mesh.position);
          this.fx.spawnBurst(o.mesh.position, 0xff3fbe, 18, 6, { life: 0.45 });
          this.audio.orbPop();
          o.active = false;
          o.mesh.visible = false;
        }
      }
    }
  }
}

const game = new Game();
window.__PACSTRIKE__ = game;
