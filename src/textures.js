import * as THREE from "three";

let glow = null;

/** Soft radial glow texture shared by sprites, particles and pellets. */
export function getGlowTexture() {
  if (glow) return glow;
  const size = 128;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.22, "rgba(255,255,255,0.92)");
  g.addColorStop(0.48, "rgba(255,255,255,0.32)");
  g.addColorStop(0.74, "rgba(255,255,255,0.07)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  glow = new THREE.CanvasTexture(canvas);
  glow.colorSpace = THREE.SRGBColorSpace;
  glow.needsUpdate = true;
  return glow;
}

/** Subtle floor-gradient texture, keeps the arena from feeling flat. */
export function makeFloorTexture(accent) {
  const size = 512;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#03050d";
  ctx.fillRect(0, 0, size, size);
  const r = Math.round((accent.r ?? 0.2) * 255);
  const g0 = Math.round((accent.g ?? 0.8) * 255);
  const b = Math.round((accent.b ?? 1) * 255);
  const g = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size * 0.68);
  g.addColorStop(0, `rgba(${r},${g0},${b},0.10)`);
  g.addColorStop(0.55, "rgba(10,26,58,0.05)");
  g.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, size, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
