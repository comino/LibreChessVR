// Scenery around the table, built procedurally (no downloads). Each builder returns
// {group, background, fog?, exposure, hemi: [sky, ground, intensity], sun: [color, intensity, offset]}
// where offset is the sun position relative to the board. Board3D owns the lights.

import * as THREE from 'three'
import { Sky } from 'three/addons/objects/Sky.js'

const std = (color, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.9, ...extra })
const mesh = (geo, mat, [x, y, z] = [0, 0, 0], shadows = true) => {
  const m = new THREE.Mesh(geo, mat)
  m.position.set(x, y, z)
  m.receiveShadow = shadows
  return m
}
const disc = (r, mat) => {
  const m = mesh(new THREE.CircleGeometry(r, 64), mat)
  m.rotation.x = -Math.PI / 2
  return m
}

// Canvas wood grain: wavy darker streaks over a base color.
export function woodTexture(base = '#6b4a30', grain = 'rgba(40,24,12,0.35)', repeat = 1) {
  const c = document.createElement('canvas')
  c.width = c.height = 256
  const ctx = c.getContext('2d')
  ctx.fillStyle = base
  ctx.fillRect(0, 0, 256, 256)
  ctx.strokeStyle = grain
  for (let i = 0; i < 60; i++) {
    const y0 = Math.random() * 256, amp = 2 + Math.random() * 4, f = 0.01 + Math.random() * 0.03
    ctx.lineWidth = 0.5 + Math.random() * 1.5
    ctx.beginPath()
    for (let x = 0; x <= 256; x += 8) ctx.lineTo(x, y0 + Math.sin(x * f + i) * amp)
    ctx.stroke()
  }
  const tex = new THREE.CanvasTexture(c)
  tex.colorSpace = THREE.SRGBColorSpace
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping
  tex.repeat.set(repeat, repeat)
  return tex
}

function minimal() {
  const group = new THREE.Group()
  group.add(disc(3, std(0x2a3038)))
  return { group, background: 0x1b2028, exposure: 1, hemi: [0xffffff, 0x445566, 1.0], sun: [0xffffff, 2.0, [0.8, 1.8, 0.95]] }
}

function study() {
  const group = new THREE.Group()
  const room = mesh(new THREE.BoxGeometry(8, 3.2, 8), std(0xb89c7c, { side: THREE.BackSide }), [0, 1.6, -0.45])
  group.add(room)
  const floor = mesh(new THREE.PlaneGeometry(8, 8), std(0xffffff, { map: woodTexture('#5a3a22', 'rgba(30,16,6,0.4)', 4) }), [0, 0, -0.45])
  floor.rotation.x = -Math.PI / 2
  group.add(floor)
  const rug = disc(1.3, std(0x5a1f1f))
  rug.position.y = 0.003
  group.add(rug)
  // window on the back wall: glowing daylight behind a wooden frame with a cross
  group.add(mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshBasicMaterial({ color: 0xcfe0f5 }), [0.6, 1.8, -4.43], false))
  const frame = std(0x4a3020)
  for (const [w, h, x, y] of [[2.3, 0.08, 0.6, 2.45], [2.3, 0.08, 0.6, 1.15], [0.08, 1.4, -0.5, 1.8], [0.08, 1.4, 1.7, 1.8],
    [2.2, 0.05, 0.6, 1.8], [0.05, 1.3, 0.6, 1.8]]) group.add(mesh(new THREE.BoxGeometry(w, h, 0.06), frame, [x, y, -4.41]))
  // bookshelf with random books on the left wall
  const shelf = new THREE.Group()
  shelf.add(mesh(new THREE.BoxGeometry(0.35, 2.2, 1.8), std(0x3b2616), [0, 1.1, 0]))
  const bookColors = [0x7a2e2e, 0x2e4a7a, 0x2e6a3e, 0x8a6a2a, 0x4a2e6a, 0xd8cbb0]
  for (let row = 0; row < 4; row++) for (let z = -0.8; z < 0.8;) {
    const w = 0.04 + Math.random() * 0.04, h = 0.3 + Math.random() * 0.12
    shelf.add(mesh(new THREE.BoxGeometry(0.25, h, w), std(bookColors[Math.floor(Math.random() * 6)]),
      [0.06, 0.2 + row * 0.52 + h / 2, z + w / 2]))
    z += w + 0.005
  }
  shelf.position.set(-3.8, 0, -1.2)
  group.add(shelf)
  // floor lamp with a warm light
  const lamp = new THREE.Group()
  lamp.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5), std(0x222222, { metalness: 0.6 }), [0, 0.75, 0]))
  lamp.add(mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.22, 24, 1, true),
    std(0xf0dcb0, { emissive: 0x806030, side: THREE.DoubleSide }), [0, 1.55, 0], false))
  const bulb = new THREE.PointLight(0xffc98a, 2.5, 6)
  bulb.position.y = 1.5
  lamp.add(bulb)
  lamp.position.set(1.3, 0, -1.4)
  group.add(lamp)
  return { group, background: 0x2a2018, exposure: 1.1, hemi: [0xffe8cc, 0x5a4030, 1.1], sun: [0xfff1dc, 1.8, [-1.2, 2.2, -2.0]] }
}

function sunset() {
  const group = new THREE.Group()
  const sky = new Sky()
  sky.scale.setScalar(45) // inside the camera far plane; the shader only uses view direction
  const u = sky.material.uniforms
  Object.assign(u.turbidity, { value: 8 })
  Object.assign(u.rayleigh, { value: 2.5 })
  Object.assign(u.mieCoefficient, { value: 0.005 })
  Object.assign(u.mieDirectionalG, { value: 0.85 })
  u.sunPosition.value.setFromSphericalCoords(1, THREE.MathUtils.degToRad(84), THREE.MathUtils.degToRad(200))
  group.add(sky)
  group.add(disc(7, std(0xc8b8a0, { map: woodTexture('#c8b8a0', 'rgba(90,70,50,0.12)', 6) })))
  const land = disc(48, std(0x8a7060)) // fades into the fog; hides the sky's lower half
  land.position.y = -0.02
  group.add(land)
  // soft rolling hills far away in the haze
  const hillGeo = new THREE.SphereGeometry(1, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2 + Math.random() * 0.3, r = 34 + Math.random() * 6
    const hill = mesh(hillGeo, std(0x6a5a78), [Math.cos(a) * r, -0.5, Math.sin(a) * r], false)
    hill.scale.set(10 + Math.random() * 6, 3 + Math.random() * 4, 10 + Math.random() * 6)
    group.add(hill)
  }
  const sunDir = u.sunPosition.value
  return {
    group, background: 0xf0a878, fog: new THREE.Fog(0xd8a890, 12, 48), exposure: 0.8,
    hemi: [0xffd8b0, 0x6a5048, 1.1], sun: [0xffb070, 3.0, sunDir.clone().multiplyScalar(3).toArray()]
  }
}

function night() {
  const group = new THREE.Group()
  const n = 1500, pos = new Float32Array(n * 3), v = new THREE.Vector3()
  for (let i = 0; i < n; i++) {
    v.randomDirection().multiplyScalar(40)
    v.y = Math.abs(v.y) + 2 // upper hemisphere only
    v.toArray(pos, i * 3)
  }
  const starGeo = new THREE.BufferGeometry()
  starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
  group.add(new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.12, fog: false })))
  group.add(mesh(new THREE.SphereGeometry(1.4, 32, 16), new THREE.MeshBasicMaterial({ color: 0xeef0ff, fog: false }), [-9, 12, -24], false))
  group.add(disc(9, std(0x10141f, { roughness: 0.35, metalness: 0.3 })))
  return { group, background: 0x04060d, exposure: 1, hemi: [0x6a7fbf, 0x0a0c14, 0.55], sun: [0xb8c8ff, 1.4, [-1.4, 2.4, -2.2]] }
}

const BUILDERS = { minimal, study, sunset, night }
export const buildEnvironment = name => (BUILDERS[name] ?? minimal)()

// Frees GPU resources of a built environment group.
export function disposeGroup(group) {
  group.traverse(o => {
    o.geometry?.dispose()
    for (const m of [o.material].flat()) {
      if (!m) continue
      m.map?.dispose()
      m.dispose()
    }
  })
}
