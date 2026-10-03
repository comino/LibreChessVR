// Building blocks for the procedural scenes: materials, canvas textures, glow sprites,
// instancing. Seeded randomness keeps every scene looking the same on each visit.

import * as THREE from 'three'
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'

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

// Tree crowns, 1 unit tall, centered (scale per instance): a pine of three stacked tiers and
// a cypress spindle (rounded bottom, pointed top).
export const pineGeometry = () => mergeGeometries([[0.9, -0.22], [0.68, 0.05], [0.45, 0.28]].map(([r, y]) =>
  new THREE.ConeGeometry(r, 0.45, 8).translate(0, y, 0)))
export const cypressGeometry = () => new THREE.LatheGeometry([[0, -0.5], [0.55, -0.42], [0.75, -0.2], [0.7, 0.05],
  [0.5, 0.3], [0.22, 0.45], [0, 0.5]].map(([x, y]) => new THREE.Vector2(x, y)), 10)

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

// Flame tongue: wide hot base narrowing to a tip (lean -1..1 bends it), soft edges, bright core.
const flameTexture = lean => canvasTexture(64, 128, (ctx, w, h) => {
  const tongue = (sx, a) => {
    const tip = w / 2 + lean * w * 0.2 * sx
    ctx.beginPath()
    ctx.moveTo(w / 2, h * 0.98)
    ctx.bezierCurveTo(w / 2 - w * 0.45 * sx, h * 0.95, w / 2 - w * 0.36 * sx, h * (1 - 0.5 * sx), tip, h * (1 - 0.95 * sx))
    ctx.bezierCurveTo(w / 2 + w * 0.36 * sx, h * (1 - 0.5 * sx), w / 2 + w * 0.45 * sx, h * 0.95, w / 2, h * 0.98)
    const g = ctx.createLinearGradient(0, h * (1 - sx), 0, h)
    g.addColorStop(0, 'rgba(255,70,10,0)'); g.addColorStop(0.35, `rgba(255,120,30,${0.7 * a})`)
    g.addColorStop(0.7, `rgba(255,190,80,${0.95 * a})`); g.addColorStop(1, `rgba(255,240,200,${a})`)
    ctx.fillStyle = g
    ctx.fill()
  }
  ctx.filter = 'blur(2px)'
  tongue(1, 1)
  tongue(0.55, 0.9) // hot core
})

// Fire: crossed logs, flame tongues growing from their base that flicker and sway, sparks rising.
// Place .group at the fire's base; call update(t) every frame. Logs merge via mergeStatic.
export function fire(size, n, seed = 1) {
  const r = rng(seed), group = new THREE.Group(), tex = [-1, 0, 1].map(flameTexture)
  const bark = std(0x22160e), logGeo = new THREE.CylinderGeometry(size * 0.07, size * 0.09, size * 0.8, 7)
  for (let i = 0; i < 4; i++) {                       // teepee: leaning in, tops meeting over the center
    const a = i * Math.PI / 2 + r() * 0.4, log = mesh(logGeo, bark, [Math.sin(a) * size * 0.26, size * 0.12, Math.cos(a) * size * 0.26])
    log.rotation.set(-1.25, a, 0, 'YXZ')
    group.add(log)
  }
  const flames = Array.from({ length: n }, (_, i) => {
    const f = new THREE.Sprite(new THREE.SpriteMaterial({
      map: tex[i % 3], blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, fog: false
    }))
    f.center.set(0.5, 0.02)
    const x = (r() - 0.5) * size * 0.5
    f.position.set(x, 0, (r() - 0.5) * size * 0.3)
    f.userData = { x, s: size * (0.6 + r() * 0.5), phase: r() * 6 }
    group.add(f)
    return f
  })
  const N = 14, sparks = points(N, 0xffa040, size * 0.06, () => {})
  const seeds = Array.from({ length: N }, () => [r(), 0.25 + r() * 0.3, (r() - 0.5) * size * 0.5])
  group.add(sparks.points)
  function update(t) {
    for (const f of flames) {
      const { x, s, phase } = f.userData, k = 1 + 0.22 * Math.sin(t * (8 + phase) + phase) + 0.12 * Math.sin(t * 17.3 + phase * 2)
      f.scale.set(s * 0.5 * (1.6 - 0.6 * k), s * 1.25 * k, 1)
      f.position.x = x + s * 0.05 * Math.sin(t * 5 + phase)
      f.material.opacity = 0.8 + 0.2 * Math.sin(t * 11 + phase)
    }
    const p = sparks.pos
    seeds.forEach(([o, speed, x], i) => {
      const life = (t * speed + o) % 1
      p[i * 3] = x + Math.sin(t * 3 + i) * size * 0.15 * life
      p[i * 3 + 1] = size * (0.2 + life * 2.6)
      p[i * 3 + 2] = Math.cos(t * 2.3 + i) * size * 0.12 * life
    })
    sparks.points.geometry.attributes.position.needsUpdate = true
  }
  return { group, update }
}

// Soft dark radial blob (contact shadows / baked-looking occlusion), shared texture.
let blobTex = null
export const blobTexture = () => blobTex ??= canvasTexture(128, 128, (ctx, w) => {
  const g = ctx.createRadialGradient(w / 2, w / 2, 0, w / 2, w / 2, w / 2)
  g.addColorStop(0, 'rgba(0,0,0,0.6)')
  g.addColorStop(0.55, 'rgba(0,0,0,0.3)')
  g.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, w)
})
export const shadeMat = opacity => new THREE.MeshBasicMaterial({
  map: blobTexture(), transparent: true, opacity, depthWrite: false, toneMapped: false,
  polygonOffset: true, polygonOffsetFactor: -2
})

// Flat soft shadow on the floor: w × d meters at (x, z).
export function shadowBlob(w, d, [x, z], opacity = 1, y = 0.012, mat = shadeMat(opacity)) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), mat)
  m.rotation.x = -Math.PI / 2
  m.position.set(x, y, z)
  return m
}

// Occlusion strip where a wall meets the floor: dark at the wall, fading into the room.
let edgeTex = null
export function edgeShade(length, [x, z], rotY, depth = 0.7, y = 0.011, mat) {
  edgeTex ??= canvasTexture(8, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, 'rgba(0,0,0,0.5)'); g.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  })
  const m = new THREE.Mesh(new THREE.PlaneGeometry(length, depth), mat ?? new THREE.MeshBasicMaterial({
    map: edgeTex, transparent: true, depthWrite: false, toneMapped: false
  }))
  m.geometry.translate(0, -depth / 2, 0) // top edge (dark) on the wall line
  m.rotation.set(-Math.PI / 2, 0, rotY, 'YXZ')
  m.position.set(x, y, z)
  return m
}

// Merges meshes that share one material into a single mesh (one draw call).
export function mergeInto(meshes) {
  const geos = meshes.map(m => { m.updateMatrix(); return m.geometry.clone().applyMatrix4(m.matrix) })
  const one = new THREE.Mesh(mergeGeometries(geos), meshes[0].material)
  meshes.forEach(m => m.geometry.dispose())
  geos.forEach(g => g.dispose())
  return one
}

// Scanned CC0 props (assets/props/<id>.glb, built by tools/build-props.mjs) added to group
// once loaded, so a scene shows at once. items: [id, [x, y, z], rotY = 0, scale = 1]; repeats
// share geometry. Resolves when all are in; a group disposed meanwhile gets nothing.
const loader = new GLTFLoader()
export async function props(group, items) {
  const ids = [...new Set(items.map(i => i[0]))]
  const scenes = await Promise.all(ids.map(id => loader.loadAsync(`assets/props/${id}.glb`).then(g => g.scene)))
  if (group.userData.disposed) return scenes.forEach(disposeObject)
  for (const [id, [x, y, z], rotY = 0, scale = 1] of items) {
    const o = scenes[ids.indexOf(id)].clone()
    o.position.set(x, y, z)
    o.rotation.y = rotY
    o.scale.setScalar(scale)
    group.add(o)
  }
}

// Frees an object's geometries, materials and every texture they use.
export function disposeObject(root) {
  root.traverse(o => {
    if (o.isInstancedMesh) o.dispose() // frees the per-instance buffers
    o.geometry?.dispose()
    for (const m of [o.material].flat()) {
      if (!m) continue
      for (const v of Object.values(m)) if (v?.isTexture) v.dispose()
      m.dispose()
    }
  })
}
