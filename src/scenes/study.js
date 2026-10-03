// Study: a cozy room in an old European house — crackling fireplace (its flicker lights the board),
// ticking grandfather clock with the real time, scanned antique furniture, dust in the window light.

import * as THREE from 'three'
import { rng, std, mesh, box, canvasTexture, woodTexture, glow, instanced, points, mergeStatic, shadowBlob, edgeShade, shadeMat, mergeInto, props, fire as flames } from './common.js'

const W = 8, H = 3.2, Z0 = -0.45           // room size and center z (table sits at the center)
const BACK = Z0 - W / 2, RIGHT = W / 2, LEFT = -W / 2

const wallpaper = () => canvasTexture(256, 256, (ctx, w, h) => {
  ctx.fillStyle = '#6e5238'
  ctx.fillRect(0, 0, w, h)
  for (let x = 0; x < w; x += 32) {       // soft damask stripes
    ctx.fillStyle = 'rgba(255,230,190,0.06)'
    ctx.fillRect(x, 0, 14, h)
    ctx.fillStyle = 'rgba(40,20,10,0.08)'
    ctx.fillRect(x + 16, 0, 2, h)
  }
}, 6)

const rugTexture = () => canvasTexture(512, 384, (ctx, w, h) => {
  ctx.fillStyle = '#5c1c1c'
  ctx.fillRect(0, 0, w, h)
  ctx.strokeStyle = '#c99a4b'
  for (const [i, lw] of [[12, 6], [30, 2], [44, 3]]) {
    ctx.lineWidth = lw
    ctx.strokeRect(i, i, w - 2 * i, h - 2 * i)
  }
  ctx.fillStyle = '#23304a'
  ctx.beginPath(); ctx.ellipse(w / 2, h / 2, 120, 80, 0, 0, Math.PI * 2); ctx.fill()
  ctx.strokeStyle = '#c99a4b'; ctx.lineWidth = 4; ctx.stroke()
  ctx.fillStyle = '#8a2f2a'
  ctx.beginPath(); ctx.ellipse(w / 2, h / 2, 60, 40, 0, 0, Math.PI * 2); ctx.fill()
  for (let a = 0; a < 16; a++) {           // medallion petals
    ctx.save(); ctx.translate(w / 2, h / 2); ctx.rotate(a * Math.PI / 8)
    ctx.fillStyle = a % 2 ? '#c99a4b' : '#d9c7a0'
    ctx.beginPath(); ctx.ellipse(90, 0, 16, 6, 0, 0, Math.PI * 2); ctx.fill()
    ctx.restore()
  }
})

// Evening seen through the window: dusk gradient, first stars, tree silhouettes.
const outsideTexture = () => canvasTexture(512, 320, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, '#1d2a4a'); g.addColorStop(0.55, '#6a5a8a'); g.addColorStop(0.85, '#e8a07a'); g.addColorStop(1, '#f2c48a')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const r = rng(3)
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  for (let i = 0; i < 40; i++) ctx.fillRect(r() * w, r() * h * 0.45, 1.5, 1.5)
  ctx.fillStyle = '#1a1712'
  for (let x = -20; x < w + 20; x += 30 + r() * 30) {   // pines: three stacked tiers
    const th = 60 + r() * 90
    ctx.fillRect(x - 2, h - th * 0.3, 4, th * 0.3)
    for (const [hw, y0] of [[26, 0.15], [19, 0.42], [12, 0.66]]) {
      ctx.beginPath(); ctx.moveTo(x - hw, h - th * y0); ctx.lineTo(x, h - th * (y0 + 0.36)); ctx.lineTo(x + hw, h - th * y0); ctx.fill()
    }
  }
})

// Small abstract canvases for the frames.
const painting = (seed, hues) => canvasTexture(256, 192, (ctx, w, h) => {
  const r = rng(seed)
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, hues[0]); g.addColorStop(1, hues[1])
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 5; i++) {
    ctx.fillStyle = `rgba(${40 + r() * 60},${30 + r() * 50},${20 + r() * 40},0.55)`
    ctx.beginPath()
    ctx.moveTo(0, h * (0.55 + r() * 0.3))
    for (let x = 0; x <= w; x += 32) ctx.lineTo(x, h * (0.5 + r() * 0.35))
    ctx.lineTo(w, h); ctx.lineTo(0, h); ctx.fill()
  }
})

function framedPicture(tex, w, h, pos, rotY = 0) {
  const g = new THREE.Group()
  g.add(box(w + 0.12, h + 0.12, 0.05, std(0x3a2414, { roughness: 0.5 })))
  g.add(mesh(new THREE.PlaneGeometry(w, h), std(0xffffff, { map: tex, roughness: 0.8 }), [0, 0, 0.028]))
  g.position.set(...pos)
  g.rotation.y = rotY
  return g
}

// Old brick: staggered courses of warm, slightly varied bricks in pale mortar.
const bricks = () => canvasTexture(256, 256, (ctx, w, h) => {
  const r = rng(13)
  ctx.fillStyle = '#5a4a40'
  ctx.fillRect(0, 0, w, h)
  for (let row = 0; row < 8; row++) for (let col = -1; col < 4; col++) {
    ctx.fillStyle = `hsl(${12 + r() * 10}, ${30 + r() * 15}%, ${30 + r() * 10}%)`
    ctx.fillRect(col * 64 + (row % 2) * 32 + 2, row * 32 + 2, 60, 28)
  }
})

function fireplace() {
  const g = new THREE.Group()
  const brick = std(0xffffff, { map: bricks(), roughness: 1 })      // surround + pillars: one draw
  g.add(mergeInto([box(1.7, 1.2, 0.35, brick, [0, 0.6, 0]),
    ...[-0.62, 0.62].map(x => box(0.26, 1.15, 0.42, brick, [x, 0.6, 0.02]))]))
  g.add(box(1.9, 0.08, 0.65, std(0x463b33, { roughness: 1 }), [0, 0.04, 0.2])) // raised hearth
  g.add(box(1.9, 0.1, 0.45, std(0x3a2414, { roughness: 0.6 }), [0, 1.25, 0.03])) // mantel
  g.add(box(0.9, 0.7, 0.3, std(0x0c0908), [0, 0.42, 0.04]))     // firebox
  const flame = flames(0.4, 5, 3)
  flame.group.position.set(0, 0.08, 0.24)                          // just before the black firebox face
  g.add(flame.group)
  const embers = glow(0xff7a2a, 0.5, 0.55)                        // clear of the firebox face: no cut edge
  embers.position.set(0, 0.2, 0.48)
  g.add(embers)
  // mantel decor: two candlesticks and a brass orb (not metallic, so they merge into one draw)
  const brass = std(0xb08a3e, { roughness: 0.35 })
  for (const x of [-0.7, 0.7]) g.add(box(0.05, 0.22, 0.05, brass, [x, 1.41, 0.05]))
  g.add(mesh(new THREE.SphereGeometry(0.08, 16, 12), brass, [0, 1.38, 0.05]))
  return { group: g, flame, embers }
}

function grandfatherClock() {
  const g = new THREE.Group()
  const wood = std(0x4a2c18, { roughness: 0.55 })
  g.add(box(0.5, 1.9, 0.32, wood, [0, 0.95, 0]))
  g.add(box(0.58, 0.12, 0.38, wood, [0, 1.96, 0]))
  const face = canvasTexture(128, 128, (ctx, w) => {
    ctx.fillStyle = '#efe4c8'; ctx.beginPath(); ctx.arc(w / 2, w / 2, w / 2 - 2, 0, Math.PI * 2); ctx.fill()
    ctx.strokeStyle = '#2a1a10'; ctx.lineWidth = 3
    for (let i = 0; i < 12; i++) {
      const a = i * Math.PI / 6
      ctx.beginPath(); ctx.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); ctx.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); ctx.stroke()
    }
  })
  g.add(mesh(new THREE.CircleGeometry(0.19, 32), std(0xffffff, { map: face, roughness: 0.6 }), [0, 1.62, 0.165]))
  const hand = (len, wdt) => {
    const h = new THREE.Group()
    h.add(box(wdt, len, 0.005, std(0x1a120c), [0, len / 2, 0]))
    h.position.set(0, 1.62, 0.172)
    g.add(h)
    return h
  }
  const hour = hand(0.1, 0.014), minute = hand(0.16, 0.009)
  const dynamic = o => o.traverse(m => { m.userData.dynamic = true })
  g.add(mesh(new THREE.PlaneGeometry(0.3, 0.9), std(0x1a100a), [0, 0.95, 0.162]))  // pendulum window
  const pendulum = new THREE.Group()
  pendulum.add(box(0.012, 0.6, 0.01, std(0xb08a3e, { metalness: 0.7, roughness: 0.3 }), [0, -0.3, 0]))
  pendulum.add(mesh(new THREE.CircleGeometry(0.07, 24), std(0xc9a24e, { metalness: 0.8, roughness: 0.25 }), [0, -0.62, 0.006]))
  pendulum.position.set(0, 1.38, 0.168)
  g.add(pendulum)
  for (const part of [hour, minute, pendulum]) dynamic(part)
  return { group: g, hour, minute, pendulum }
}

export function study() {
  const group = new THREE.Group()
  const r = rng(11)
  // shell: wallpapered walls, plaster ceiling with beams, plank floor
  group.add(mesh(new THREE.BoxGeometry(W, H, W), std(0xffffff, { map: wallpaper(), side: THREE.BackSide }), [0, H / 2, Z0]))
  const ceiling = mesh(new THREE.PlaneGeometry(W, W), std(0xd8ccb8), [0, H - 0.01, Z0])
  ceiling.rotation.x = Math.PI / 2
  group.add(ceiling)
  for (const z of [-2.6, -0.45, 1.7]) group.add(box(W, 0.18, 0.22, std(0x3a2414, { roughness: 0.6 }), [0, H - 0.1, z]))
  const floor = mesh(new THREE.PlaneGeometry(W, W), std(0xffffff, { map: woodTexture('#5a3a22', 'rgba(30,16,6,0.4)', 4), roughness: 0.6 }), [0, 0.004, Z0]) // above the box's bottom face
  floor.rotation.x = -Math.PI / 2
  group.add(floor)
  const rug = mesh(new THREE.PlaneGeometry(3.4, 2.5), std(0xffffff, { map: rugTexture() }), [0, 0.01, Z0])
  rug.rotation.x = -Math.PI / 2
  group.add(rug)
  // wainscot panelling + chair rail around the walls
  const panel = std(0x3e2616, { roughness: 0.55 })
  for (const [w, d, x, z] of [[W, 0.04, 0, BACK + 0.02], [0.04, W, LEFT + 0.02, Z0], [0.04, W, RIGHT - 0.02, Z0], [W, 0.04, 0, Z0 + W / 2 - 0.02]]) {
    group.add(box(w, 1.0, d, panel, [x, 0.5, z]))
    group.add(box(w + 0.02, 0.05, d + 0.04, std(0x5a3a22), [x, 1.02, z]))
  }
  // back wall: window with the evening outside, curtains, two paintings
  group.add(mesh(new THREE.PlaneGeometry(2.2, 1.3), new THREE.MeshBasicMaterial({ map: outsideTexture() }), [0.6, 1.8, BACK + 0.02], false))
  const frame = std(0x4a3020)
  for (const [w, h, x, y] of [[2.3, 0.08, 0.6, 2.45], [2.3, 0.08, 0.6, 1.15], [0.08, 1.4, -0.5, 1.8], [0.08, 1.4, 1.7, 1.8],
    [2.2, 0.05, 0.6, 1.8], [0.05, 1.3, 0.6, 1.8]]) group.add(box(w, h, 0.06, frame, [x, y, BACK + 0.04]))
  const curtainTex = canvasTexture(64, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0)
    for (let i = 0; i <= 4; i++) g.addColorStop(i / 4, i % 2 ? '#7a1f22' : '#4a1014')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
  })
  for (const x of [-0.85, 2.05]) group.add(box(0.55, 2.3, 0.08, std(0xffffff, { map: curtainTex, roughness: 1 }), [x, 1.95, BACK + 0.12]))
  group.add(box(3.4, 0.05, 0.05, std(0xb08a3e, { metalness: 0.7, roughness: 0.3 }), [0.6, 3.07, BACK + 0.16]))
  group.add(framedPicture(painting(9, ['#8ab0c8', '#2a3a4a']), 0.6, 0.8, [3.0, 1.9, BACK + 0.05]))
  // left wall: bookshelf (instanced books) and the grandfather clock
  const shelf = new THREE.Group()
  shelf.add(box(0.35, 2.2, 1.8, std(0x3b2616), [0, 1.1, 0]))
  const books = []
  for (let row = 0; row < 4; row++) for (let z = -0.8; z < 0.8;) {
    const w = 0.04 + r() * 0.04, h = 0.3 + r() * 0.12
    books.push({ h, w, y: 0.2 + row * 0.52 + h / 2, z: z + w / 2 })
    z += w + 0.005
  }
  const bookColors = [0x7a2e2e, 0x2e4a7a, 0x2e6a3e, 0x8a6a2a, 0x4a2e6a, 0xd8cbb0].map(c => new THREE.Color(c))
  shelf.add(instanced(new THREE.BoxGeometry(1, 1, 1), std(0xffffff), books.length,
    (i, d) => { d.position.set(0.06, books[i].y, books[i].z); d.scale.set(0.25, books[i].h, books[i].w) },
    i => bookColors[Math.floor(r() * 6)]))
  shelf.position.set(LEFT + 0.2, 0, -1.2)
  group.add(shelf)
  const clock = grandfatherClock()
  clock.group.position.set(LEFT + 0.2, 0, -3.3)
  clock.group.rotation.y = Math.PI / 2
  group.add(clock.group)
  // right wall: fireplace (its light is the board's warm flicker)
  const fire = fireplace()
  fire.group.position.set(RIGHT - 0.18, 0, -1.9)
  fire.group.rotation.y = -Math.PI / 2
  group.add(fire.group)
  const lampGlow = glow(0xffc070, 0.35, 0.5)               // oil lamp on the nightstand
  lampGlow.position.set(3.68, 1.08, 0.1)
  group.add(lampGlow)
  // floor lamp (glow only; the room's point light is the fire)
  group.add(mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.5), std(0x222222, { metalness: 0.6 }), [1.3, 0.75, -1.4]))
  group.add(mesh(new THREE.CylinderGeometry(0.12, 0.2, 0.22, 24, 1, true),
    std(0xf0dcb0, { emissive: 0x806030, side: THREE.DoubleSide }), [1.3, 1.55, -1.4], false))
  // dust motes drifting in the window light
  const dust = points(160, 0xffe2b8, 0.025, (i, p) => p.set([-0.6 + r() * 2.6, 0.4 + r() * 2.4, BACK + 0.3 + r() * 3.2], i * 3))
  dust.points.material.opacity = 0.55
  group.add(dust.points)
  const dustBase = dust.pos.slice()

  // grounding: soft occlusion along the walls and under the furniture
  const edge = edgeShade(W, [0, BACK], 0)
  group.add(mergeInto([edge, edgeShade(W, [LEFT, Z0], Math.PI / 2, 0.7, 0.011, edge.material),
    edgeShade(W, [RIGHT, Z0], -Math.PI / 2, 0.7, 0.011, edge.material)]))
  const blobMat = shadeMat(0.85)
  group.add(mergeInto([[0.8, 2.3, LEFT + 0.25, -1.2], [0.8, 0.8, LEFT + 0.3, -3.3], [1.2, 1.2, 2.6, -0.3],
    [1.0, 0.8, 3.0, -1.0], [0.7, 0.8, 3.68, 0.1], [1.0, 1.0, 3.0, -3.6], [0.9, 2.2, RIGHT - 0.3, -1.9],
    [3.0, 1.1, 0, Z0 + W / 2 - 0.5], [1.5, 0.8, -2.4, BACK + 0.3]]
    .map(([w, d, x, z]) => shadowBlob(w, d, [x, z], 1, 0.012, blobMat))))
  // light falling from the window: two crossed soft beams toward the floor
  const beamTex = canvasTexture(64, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h)
    g.addColorStop(0, 'rgba(255,236,205,0.3)'); g.addColorStop(1, 'rgba(255,236,205,0)')
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h)
    const side = ctx.createLinearGradient(0, 0, w, 0)       // soft sides
    side.addColorStop(0, 'rgba(0,0,0,1)'); side.addColorStop(0.3, 'rgba(0,0,0,0)')
    side.addColorStop(0.7, 'rgba(0,0,0,0)'); side.addColorStop(1, 'rgba(0,0,0,1)')
    ctx.globalCompositeOperation = 'destination-out'
    ctx.fillStyle = side; ctx.fillRect(0, 0, w, h)
  })
  const beamMat = new THREE.MeshBasicMaterial({
    map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, toneMapped: false, fog: false
  })
  const beams = mergeInto([0, Math.PI / 2].map(rot => {
    const b = new THREE.Mesh(new THREE.PlaneGeometry(1.9, 3.4), beamMat)
    b.geometry.translate(0, -1.7, 0)                       // hang from the window
    b.position.set(0.6, 2.3, BACK + 0.1)
    b.rotation.set(0.62, rot, 0, 'YXZ')
    return b
  }))
  group.add(beams)
  // front wall (behind the player): sofa under a landscape
  group.add(framedPicture(painting(5, ['#e8b67a', '#6a3a2a']), 1.2, 0.8, [0, 1.85, Z0 + W / 2 - 0.05], Math.PI))

  mergeStatic(group) // panelling, fireplace stone, clock case… in one draw call
  const ready = props(group, [
    ['ArmChair_01', [2.6, 0, -0.3], 2.5],                // by the fire, with a footstool
    ['Ottoman_01', [3.0, 0, -1.0], 2.5],
    ['ClassicNightstand_01', [3.68, 0, 0.1], -Math.PI / 2],
    ['vintage_oil_lamp', [3.68, 0.7, 0.1]],
    ['Rockingchair_01', [3.0, 0, -3.6], -0.76],
    ['sofa_03', [0, 0, Z0 + W / 2 - 0.5], Math.PI],
    ['GothicCommode_01', [-2.4, 0, BACK + 0.3]],            // back wall: commode, painting above
    ['potted_plant_04', [-2.8, 1.21, BACK + 0.32]],
    ['fancy_picture_frame_01', [-2.4, 2.1, BACK + 0.03], 0, 1.6]
  ])
  const firePos = new THREE.Vector3(RIGHT - 0.75, 0.45, -1.9)
  function update(t, dt, { lamp }) {
    // fire: flames and embers dance, the point light flickers (a few % only: the board stays readable)
    fire.flame.update(t)
    fire.embers.material.opacity = 0.45 + 0.12 * Math.sin(t * 3.1) + 0.06 * Math.sin(t * 11)
    lamp.position.copy(firePos)
    lamp.intensity = 3.2 + 0.35 * Math.sin(t * 9) + 0.25 * Math.sin(t * 23 + 1)
    lampGlow.material.opacity = 0.5 + 0.05 * Math.sin(t * 17) + 0.03 * Math.sin(t * 29)
    beamMat.opacity = 0.85 + 0.15 * Math.sin(t * 0.3)
    // clock: real time, pendulum swings once per second
    const now = new Date(), min = now.getMinutes() + now.getSeconds() / 60
    clock.minute.rotation.z = -min / 60 * Math.PI * 2
    clock.hour.rotation.z = -((now.getHours() % 12) + min / 60) / 12 * Math.PI * 2
    clock.pendulum.rotation.z = 0.14 * Math.sin(t * Math.PI)
    // dust drifts slowly
    const p = dust.pos
    for (let i = 0; i < p.length; i += 3) {
      p[i] = dustBase[i] + 0.08 * Math.sin(t * 0.21 + i)
      p[i + 1] = dustBase[i + 1] + 0.12 * Math.sin(t * 0.13 + i * 0.7)
      p[i + 2] = dustBase[i + 2] + 0.08 * Math.cos(t * 0.17 + i)
    }
    dust.points.geometry.attributes.position.needsUpdate = true
  }

  return {
    group, update, ready, background: 0x2a2018, exposure: 1.1,
    hemi: [0xffe8cc, 0x6a4a34, 1.3], sun: [0xfff1dc, 1.7, [-1.2, 2.2, -2.0]],
    lamp: [0xff9a4a, 3.2, firePos.toArray()]
  }
}
