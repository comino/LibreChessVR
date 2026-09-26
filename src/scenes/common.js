// Building blocks for the procedural scenes: materials, canvas textures, glow sprites,
// instancing. Seeded randomness keeps every scene looking the same on each visit.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'

// mulberry32: tiny seeded PRNG in [0, 1)
export function rng(seed) {
  return () => {
    seed = (seed + 0x6D2B79F5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra })

export function mesh(geo, mat, [x, y, z] = [0, 0, 0], receive = true) {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.receiveShadow = receive
  return m
}

export const box = (w, h, d, mat, pos) => mesh(new THREE.BoxGeometry(w, h, d), mat, pos)

export function disc(r, mat, y = 0) {
  const m = mesh(new THREE.CircleGeometry(r, 64), mat, [0, y, 0])
  m.rotation.x = -Math.PI / 2
  return m
}

// A canvas texture drawn once by draw(ctx, w, h).
export function canvasTexture(w, h, draw, repeat = 1) {
  const c = document.createElement('canvas')
  c.width = w
  c.height = h
  draw(c.getContext('2d'), w, h)
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.anisotropy = 8 // clamped to the GPU max; avoids moiré at grazing angles
  tex.repeat.set(repeat, repeat)
  return tex
}

// Wavy darker streaks over a base color.
export function woodTexture(base = '#6b4a30', grain = 'rgba(40,24,12,0.35)', repeat = 1, seed = 7) {
  const r = rng(seed)
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = base
    ctx.fillRect(0, 0, w, h)
    ctx.strokeStyle = grain
    for (let i = 0; i < 60; i++) {
      const y0 = r() * h, amp = 2 + r() * 4, f = 0.01 + r() * 0.03
      ctx.lineWidth = 0.5 + r() * 1.5
      ctx.beginPath()
      for (let x = 0; x <= w; x += 8) ctx.lineTo(x, y0 + Math.sin(x * f + i) * amp)
      ctx.stroke()
    }
  }, repeat)
}

// Soft round glow: white core fading to transparent (tinted via the material color).
let glowTex = null
const glowTexture = () => glowTex ??= canvasTexture(128, 128, (ctx, w) => {
  const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
  g.addColorStop(0, 'rgba(255,255,255,1)')
  g.addColorStop(0.25, 'rgba(255,255,255,0.55)')
  g.addColorStop(1, 'rgba(255,255,255,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, w)
})

// Additive glow sprite (flames, lantern halos, moon halo, mist puffs with normal blending).
export function glow(color, size, opacity = 1, additive = true) {
  const s = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture(), color, opacity, transparent: true, depthWrite: false, fog: false,
    blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending
  }))
  s.scale.setScalar(size)
  return s
}

// One draw call for n copies: place(i, dummy) positions/rotates/scales the dummy Object3D.
export function instanced(geo, mat, n, place, colors) {
  const im = new THREE.InstancedMesh(geo, mat, n)
  const d = new THREE.Object3D()
  for (let i = 0; i < n; i++) {
    d.position.set(0, 0, 0); d.rotation.set(0, 0, 0); d.scale.set(1, 1, 1)
    place(i, d)
    d.updateMatrix()
    im.setMatrixAt(i, d.matrix)
    if (colors) im.setColorAt(i, colors(i))
  }
  im.receiveShadow = true
  return im
}

// Point cloud whose positions update() can move; returns {points, pos}.
export function points(n, color, size, place) {
  const pos = new Float32Array(n * 3)
  for (let i = 0; i < n; i++) place(i, pos)
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  const mat = new THREE.PointsMaterial({
    color, size, map: glowTexture(), transparent: true, depthWrite: false,
    blending: THREE.AdditiveBlending, fog: false
  })
  return { points: new THREE.Points(geo, mat), pos }
}

// Merges the group's static, plain-colored meshes (no map, not metallic/emissive/transparent,
// not flagged userData.dynamic) into one vertex-colored mesh: one draw call instead of dozens.
export function mergeStatic(group) {
  group.updateMatrixWorld(true)
  const parts = [], merged = []
  group.traverse(o => {
    const m = o.material
    if (!o.isMesh || o.isInstancedMesh || !m.isMeshStandardMaterial || o.userData.dynamic || m.map || m.transparent ||
      m.metalness > 0 || m.emissive?.getHex() || m.side !== THREE.FrontSide) return
    const g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone()
    for (const k of Object.keys(g.attributes)) if (k !== 'position' && k !== 'normal') g.deleteAttribute(k)
    g.applyMatrix4(o.matrixWorld)
    const c = m.color, n = g.attributes.position.count
    g.setAttribute('color', new THREE.BufferAttribute(new Float32Array(n * 3).map((_, i) => [c.r, c.g, c.b][i % 3]), 3))
    parts.push(g)
    merged.push(o)
  })
  merged.forEach(o => o.removeFromParent())
  const inUse = new Set()
  group.traverse(o => o.material && inUse.add(o.material))
  for (const o of merged) {
    o.geometry.dispose()
    if (!inUse.has(o.material)) o.material.dispose() // shared ones stay alive for the rest
  }
  if (!parts.length) return
  const one = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.8 }))
  one.receiveShadow = true
  parts.forEach(g => g.dispose())
  group.add(one)
}

// Iron lantern with a glowing body at pos; returns {group, halo} (animate halo.material.opacity).
export function lantern([x, y, z], post = 0) {
  const g = new THREE.Group(), iron = std(0x22242c, { roughness: 0.6 })
  if (post) g.add(mesh(new THREE.CylinderGeometry(0.03, 0.05, post, 8), iron, [x, y - post / 2 - 0.07, z]))
  g.add(mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.14, 8), std(0x2a2420, { emissive: 0xffa040, emissiveIntensity: 1.2 }), [x, y, z]))
  g.add(mesh(new THREE.ConeGeometry(0.11, 0.09, 8), iron, [x, y + 0.11, z]))
  const halo = glow(0xffb060, 0.7, 0.6)
  halo.position.set(x, y, z)
  g.add(halo)
  return { group: g, halo }
}
