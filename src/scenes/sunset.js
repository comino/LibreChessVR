// Sunset terrace: physical sky, drifting clouds, birds circling, a stone terrace with a
// balustrade and glowing lanterns, cypress trees and grass rolling out to hazy hills.

import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'
import { rng, std, mesh, disc, canvasTexture, glow, instanced, mergeStatic, lantern } from './common.js'

const tiles = () => canvasTexture(256, 256, (ctx, w) => {
  const r = rng(21), n = 4, s = w / n
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    const l = 70 + r() * 14
    ctx.fillStyle = `hsl(32, 28%, ${l}%)`
    ctx.fillRect(i * s, j * s, s, s)
  }
  ctx.strokeStyle = 'rgba(90,70,50,0.45)'
  ctx.lineWidth = 3
  for (let k = 0; k <= n; k++) {
    ctx.beginPath(); ctx.moveTo(k * s, 0); ctx.lineTo(k * s, w); ctx.stroke()
    ctx.beginPath(); ctx.moveTo(0, k * s); ctx.lineTo(w, k * s); ctx.stroke()
  }
}, 7)

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

  // terrace, balustrade (instanced posts + rail), lanterns on four posts
  group.add(disc(6, std(0xffffff, { map: tiles(), roughness: 0.95 })))
  const stone = std(0xd8c6a8, { roughness: 0.95 })
  const R = 5.6, N = 40
  group.add(instanced(new THREE.CylinderGeometry(0.07, 0.09, 0.8, 8), stone, N,
    (i, d) => d.position.set(Math.cos(i / N * Math.PI * 2) * R, 0.4, Math.sin(i / N * Math.PI * 2) * R)))
  const rail = mesh(new THREE.TorusGeometry(R, 0.07, 6, 96), stone, [0, 0.85, 0])
  rail.rotation.x = Math.PI / 2
  group.add(rail)
  const lanterns = [0.4, 2.0, 3.6, 5.2].map(a => {
    const l = lantern([Math.cos(a) * R, 0.98, Math.sin(a) * R])
    group.add(l.group)
    return l.halo
  })

  // land, grass tufts, cypress trees, hills in the haze
  const land = disc(48, std(0x8a7a52), -0.02)
  group.add(land)
  const grassColors = [0x9a9a4a, 0x8a8a3a, 0xa8a05a].map(c => new THREE.Color(c))
  group.add(instanced(new THREE.ConeGeometry(0.12, 0.4, 4), std(0xffffff), 500, (i, d) => {
    const a = r() * Math.PI * 2, rr = 6.6 + r() * 14
    d.position.set(Math.cos(a) * rr, 0.18, Math.sin(a) * rr)
    d.scale.set(1, 0.6 + r() * 0.8, 1)
    d.rotation.y = r() * 3
  }, () => grassColors[Math.floor(r() * 3)]))
  const trees = 46, spots = Array.from({ length: trees }, () => {
    const a = r() * Math.PI * 2, rr = 8 + r() * 20
    return { x: Math.cos(a) * rr, z: Math.sin(a) * rr, h: 3 + r() * 3.5 }
  })
  group.add(instanced(new THREE.CylinderGeometry(0.08, 0.12, 1, 6), std(0x4a3222), trees,
    (i, d) => { d.position.set(spots[i].x, 0.4, spots[i].z); d.scale.set(1, 0.8, 1) }))
  const greens = [0x4a6a38, 0x3e5e32, 0x56753e].map(c => new THREE.Color(c))
  group.add(instanced(new THREE.ConeGeometry(0.75, 1, 10), std(0xffffff, { roughness: 1 }), trees,
    (i, d) => { d.position.set(spots[i].x, 0.7 + spots[i].h / 2, spots[i].z); d.scale.set(1, spots[i].h * 0.8, 1) },
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
  const flock = birds(7, r)
  flock.forEach(b => group.add(b))

  mergeStatic(group)

  function update(t) {
    clouds.rotation.y = t * 0.004
    for (const b of flock) {
      const { radius, height, speed, phase, flap } = b.userData, a = phase + t * speed
      b.position.set(Math.cos(a) * radius, height + Math.sin(t * 0.3 + phase) * 0.8, Math.sin(a) * radius)
      b.rotation.y = -a
      b.scale.y = b.scale.x * (0.6 + 0.4 * Math.abs(Math.sin(t * flap + phase)))
    }
    lanterns.forEach((g, i) => { g.material.opacity = 0.55 + 0.08 * Math.sin(t * 6 + i * 1.7) })
  }

  return {
    group, update, background: 0xf0a878, fog: new THREE.Fog(0xd8a890, 14, 48), exposure: 0.8,
    hemi: [0xffd8b0, 0x6a5048, 1.1], sun: [0xffb070, 3.0, sunDir.clone().multiplyScalar(3).toArray()]
  }
}
