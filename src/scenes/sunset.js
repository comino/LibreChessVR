// Sunset terrace, Mediterranean / Arabian: terracotta tiles inside a low whitewashed wall,
// a day bed with cushions, brass lanterns, potted olive trees; cypresses and hills in the haze.

import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import { rng, std, mesh, disc, canvasTexture, glow, instanced, mergeStatic, props, shadowBlob, shadeMat, mergeInto, cypressGeometry } from './common.js'

const tiles = () => canvasTexture(256, 256, (ctx, w) => {
  const r = rng(21), n = 4, s = w / n
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const l = 54 + r() * 8
    ctx.fillStyle = `hsl(${18 + r() * 6}, 36%, ${l}%)`
    ctx.fillRect(i * s, j * s, s, s)
  }
  ctx.strokeStyle = 'rgba(110,80,60,0.35)'
  ctx.lineWidth = 2
  for (let k = 0; k <= n; k++) {
    ctx.beginPath(); ctx.moveTo(k * s, 0); ctx.lineTo(k * s, w); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, k * s); ctx.lineTo(w, k * s); ctx.stroke()
  }
}, 12)

// Soft cloud puff (normal blending, lit warm by the setting sun).
const cloudTexture = () => canvasTexture(256, 128, (ctx, w, h) => {
  const r = rng(8)
  for (let i = 0; i < 14; i++) {
    const x = w * (0.15 + r() * 0.7), y = h * (0.45 + r() * 0.25), rad = 20 + r() * 34
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad)
    g.addColorStop(0, 'rgba(255,236,220,0.55)')
    g.addColorStop(1, 'rgba(255,236,220,0)')
    ctx.fillStyle = g
    ctx.fillRect(0, 0, w, h)
  }
})

function birds(n, r) {
  const geo = new THREE.BufferGeometry()
  geo.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0, -0.5, 0.15, -0.1, 0, 0, 0.18, 0, 0, 0, 0, 0, 0.18, 0.5, 0.15, -0.1], 3))
  const mat = new THREE.MeshBasicMaterial({ color: 0x2a1a1a, side: THREE.DoubleSide, fog: false })
  return Array.from({ length: n }, (_, i) => {
    const b = new THREE.Mesh(geo, mat)
    b.userData = { radius: 16 + r() * 10, height: 9 + r() * 6, speed: 0.08 + r() * 0.05, phase: r() * Math.PI * 2, flap: 5 + r() * 3 }
    b.scale.setScalar(0.6 + r() * 0.3)
    return b
  })
}

export function sunset() {
  const group = new THREE.Group()
  const r = rng(31)
  const sky = new Sky()
  sky.scale.setScalar(45) // inside the camera far plane; the shader only uses view direction
  const u = sky.material.uniforms
  u.turbidity.value = 8
  u.rayleigh.value = 2.5
  u.mieCoefficient.value = 0.005
  u.mieDirectionalG.value = 0.85
  u.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(84), THREE.MathUtils.degToRad(200))
  group.add(sky)
  const sunDir = u.sunPosition.value
  const sunGlow = glow(0xffc27a, 9, 0.5)
  sunGlow.position.copy(sunDir).multiplyScalar(38)
  group.add(sunGlow)

  // terrace inside a low whitewashed wall (one lathe ring, rounded cap)
  group.add(disc(6, std(0xffffff, { map: tiles(), roughness: 0.95 })))
  const R = 5.6, wall = []
  for (let a = 0; a <= Math.PI; a += Math.PI / 8) wall.push(new THREE.Vector2(R + 0.12 * Math.sin(a), 0.62 + 0.12 * Math.cos(a)))
  group.add(new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(R + 0.12, 0), ...wall.reverse(), new THREE.Vector2(R - 0.12, 0)], 96),
    std(0xf2e6d4, { roughness: 1 })))
  // potted olive trees: clay pot (scanned) with a trunk and a soft silver-green crown
  const olives = [[3.2, -2.4], [-3.6, -2.2], [4.0, 1.6]]
  const leaf = std(0x8f9a74, { roughness: 1 }), bark = std(0x5a4632)
  for (const [x, z] of olives) {
    group.add(mesh(new THREE.CylinderGeometry(0.035, 0.05, 1.3, 6), bark, [x, 1.0, z]))
    for (let i = 0; i < 10; i++) group.add(mesh(new THREE.IcosahedronGeometry(0.15 + r() * 0.1, 1), leaf,
      [x + (r() - 0.5) * 0.7, 1.55 + r() * 0.4, z + (r() - 0.5) * 0.7]))
  }
  const lanterns = [[-3.0, 0.78, -0.95], [3.45, 0.98, -2.2]].map(([x, y, z]) => {
    const h = glow(0xffb060, 0.8, 0.55)
    h.position.set(x, y, z)
    group.add(h)
    return h
  })
  const blob = shadeMat(0.8)
  group.add(mergeInto([[2.2, 1.2, -3.4, 0.3], [1.0, 1.0, -3.0, -0.95], [0.7, 1.4, 4.85, -0.2], ...olives.map(([x, z]) => [0.9, 0.9, x, z])]
    .map(([w, d, x, z]) => shadowBlob(w, d, [x, z], 1, 0.012, blob))))

  // land, cypress trees, hills in the haze
  const land = disc(48, std(0x8a7a52), -0.02)
  group.add(land)
  const trees = 30, spots = Array.from({ length: trees }, () => {
    const a = r() * Math.PI * 2, rr = 8 + r() * 20
    return { x: Math.cos(a) * rr, z: Math.sin(a) * rr, h: 3 + r() * 3.5 }
  })
  group.add(instanced(new THREE.CylinderGeometry(0.08, 0.12, 1, 6), std(0x4a3222), trees,
    (i, d) => { d.position.set(spots[i].x, 0.4, spots[i].z); d.scale.set(1, 0.8, 1) }))
  const greens = [0x4a6a38, 0x3e5e32, 0x56753e].map(c => new THREE.Color(c))
  group.add(instanced(cypressGeometry(), std(0xffffff, { roughness: 1 }), trees,
    (i, d) => { d.position.set(spots[i].x, 0.5 + spots[i].h / 2, spots[i].z); d.scale.set(0.5, spots[i].h, 0.5) },
    i => greens[i % 3]))
  group.add(instanced(new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), std(0x6a5a78), 12, (i, d) => {
    const a = (i / 12) * Math.PI * 2 + r() * 0.3, rr = 34 + r() * 6
    d.position.set(Math.cos(a) * rr, -0.5, Math.sin(a) * rr)
    d.scale.set(10 + r() * 6, 3 + r() * 4, 10 + r() * 6)
  }))

  // clouds drift around the horizon, birds circle overhead
  const clouds = new THREE.Group()
  const cloudTex = cloudTexture()
  for (let i = 0; i < 10; i++) {
    const c = new THREE.Sprite(new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, color: 0xffd8c8, opacity: 0.85 }))
    const a = r() * Math.PI * 2
    c.position.set(Math.cos(a) * 36, 9 + r() * 7, Math.sin(a) * 36)
    c.scale.set(14 + r() * 10, 5 + r() * 3, 1)
    clouds.add(c)
  }
  group.add(clouds)
  const flock = birds(5, r)
  flock.forEach(b => group.add(b))

  mergeStatic(group)
  const ready = props(group, [
    ['vintage_day_bed', [-3.4, 0, 0.3], Math.PI / 2],      // lounge on the left, facing the table
    ['throw_pillows_01', [-3.45, 0.42, 0.3], Math.PI / 2],
    ['round_wooden_table_02', [-3.0, 0, -0.95], 0, 0.8],
    ['brass_diya_lantern', [-3.0, 0.6, -0.95]],
    ['jug_01', [-2.85, 0.6, -0.75], 2],
    ['brass_diya_lantern', [3.45, 0.66, -2.2], 0, 2.5],      // hangs from the olive tree
    ['painted_wooden_bench', [4.85, 0, -0.2], -Math.PI / 2],
    ...olives.map(([x, z]) => ['planter_pot_clay', [x, 0, z], 0, 2.6]),
  ])

  function update(t) {
    clouds.rotation.y = t * 0.004
    for (const b of flock) {
      const { radius, height, speed, phase, flap } = b.userData, a = phase + t * speed
      b.position.set(Math.cos(a) * radius, height + Math.sin(t * 0.3 + phase) * 0.8, Math.sin(a) * radius)
      b.rotation.y = -a
      b.scale.y = b.scale.x * (0.6 + 0.4 * Math.abs(Math.sin(t * flap + phase)))
    }
    lanterns.forEach((g, i) => { g.material.opacity = 0.5 + 0.06 * Math.sin(t * 6 + i * 1.7) + 0.03 * Math.sin(t * 17 + i) })
  }

  return {
    group, update, ready, background: 0xf0a878, fog: new THREE.Fog(0xd8a890, 14, 48), exposure: 0.8,
    hemi: [0xffd8b0, 0x6a5048, 1.1], sun: [0xffb070, 3.0, sunDir.clone().multiplyScalar(3).toArray()],
    lamp: [0xffa860, 1.5, [-3.0, 0.9, -0.95]]               // lounge lantern
  }
}
