// Night: twinkling stars, shooting stars, an aurora rippling over the horizon, a haloed moon,
// fireflies, drifting ground mist, pine silhouettes and a warm lantern by the table.

import * as THREE from 'three'
import { rng, std, mesh, disc, canvasTexture, glow, instanced, points, mergeStatic, lantern } from './common.js'

// Aurora curtain: bright green hem fading upward into violet, soft at the edges.
const auroraTexture = () => canvasTexture(64, 256, (ctx, w, h) => {
  const g = ctx.createLinearGradient(0, h, 0, 0)
  g.addColorStop(0, 'rgba(120,255,170,0)'); g.addColorStop(0.08, 'rgba(120,255,170,0.9)')
  g.addColorStop(0.45, 'rgba(80,200,160,0.35)'); g.addColorStop(0.8, 'rgba(140,90,220,0.15)'); g.addColorStop(1, 'rgba(140,90,220,0)')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  const fade = ctx.createLinearGradient(0, 0, w, 0) // soft side edges: no visible curtain ends
  fade.addColorStop(0, 'rgba(0,0,0,0)'); fade.addColorStop(0.25, 'rgba(0,0,0,1)')
  fade.addColorStop(0.75, 'rgba(0,0,0,1)'); fade.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.globalCompositeOperation = 'destination-in'
  ctx.fillStyle = fade
  ctx.fillRect(0, 0, w, h)
})

function aurora(radius, arcFrom, arcTo, height, y) {
  const seg = 64
  const geo = new THREE.PlaneGeometry(1, height, seg, 1)
  const pos = geo.attributes.position
  const base = []
  for (let i = 0; i < pos.count; i++) {
    const k = (pos.getX(i) + 0.5), a = arcFrom + (arcTo - arcFrom) * k
    pos.setXYZ(i, Math.cos(a) * radius, pos.getY(i) + y, Math.sin(a) * radius)
    base.push([a, pos.getY(i)])
  }
  const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({
    map: auroraTexture(), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    side: THREE.DoubleSide, fog: false
  }))
  m.userData = { base, radius }
  return m
}

export function night() {
  const group = new THREE.Group()
  const r = rng(41)
  // stars in three groups that twinkle out of phase
  const starGroups = [0, 1, 2].map(k => {
    const s = points(600, 0xffffff, 0.22 + k * 0.06, (i, p) => {
      const v = new THREE.Vector3().setFromSphericalCoords(40, Math.acos(0.05 + r() * 0.95), r() * Math.PI * 2)
      p.set([v.x, Math.abs(v.y) + 1, v.z], i * 3)
    })
    group.add(s.points)
    return s.points
  })
  // moon with halo
  const moonPos = [-9, 12, -24]
  const moonTex = canvasTexture(128, 128, (ctx, w) => {       // pale disc with soft maria
    ctx.fillStyle = '#eef0ff'; ctx.fillRect(0, 0, w, w)
    const r2 = rng(5)
    for (let i = 0; i < 9; i++) {
      ctx.fillStyle = `rgba(150,160,190,${0.15 + r2() * 0.2})`
      ctx.beginPath(); ctx.arc(r2() * w, r2() * w, 8 + r2() * 18, 0, Math.PI * 2); ctx.fill()
    }
  })
  group.add(mesh(new THREE.SphereGeometry(1.4, 32, 16), new THREE.MeshBasicMaterial({ map: moonTex, fog: false }), moonPos, false))
  const halo = glow(0x9ab0ff, 9, 0.35)
  halo.position.set(...moonPos)
  group.add(halo)
  // aurora curtains behind the board
  const curtains = [aurora(30, -2.3, -0.9, 10, 9), aurora(33, -1.6, -0.2, 12, 11)]
  curtains.forEach(c => group.add(c))
  // ground, pines on the horizon, low mist
  group.add(disc(9, std(0x10141f, { roughness: 0.35, metalness: 0.3 })))
  group.add(disc(40, std(0x0a0d16, { roughness: 1 }), -0.02))
  const pines = 70
  group.add(instanced(new THREE.ConeGeometry(0.9, 1, 7), std(0x05070c, { roughness: 1 }), pines, (i, d) => {
    const a = r() * Math.PI * 2, rr = 14 + r() * 14, h = 3 + r() * 5
    d.position.set(Math.cos(a) * rr, h / 2, Math.sin(a) * rr)
    d.scale.set(1 + r() * 0.5, h, 1 + r() * 0.5)
  }))
  const mist = Array.from({ length: 8 }, (_, i) => {
    const m = glow(0x6a7ab0, 6 + r() * 4, 0.07, false)
    const a = (i / 8) * Math.PI * 2
    m.position.set(Math.cos(a) * 7, 0.4, Math.sin(a) * 7)
    m.userData.a = a
    group.add(m)
    return m
  })
  // fireflies wander near the ground
  const flies = points(50, 0xd8ff7a, 0.06, (i, p) => {
    const a = r() * Math.PI * 2, rr = 2 + r() * 7
    p.set([Math.cos(a) * rr, 0.3 + r() * 1.3, Math.sin(a) * rr], i * 3)
  })
  const flyBase = flies.pos.slice()
  group.add(flies.points)
  // stone lantern by the table: the warm point light of the scene
  const lanternPos = [-1.5, 0.82, -1.7]
  const lamp1 = lantern(lanternPos, 0.75)
  group.add(lamp1.group)
  const lanternGlow = lamp1.halo
  // one shooting star at a time
  const streak = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 0.03), new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false
  }))
  group.add(streak)
  let shot = { start: 3, from: new THREE.Vector3(), dir: new THREE.Vector3() }
  const launch = t => {
    const a = -Math.PI / 2 + (r() - 0.5) * 2.2
    shot = { start: t, from: new THREE.Vector3(Math.cos(a) * 30, 14 + r() * 8, Math.sin(a) * 30),
      dir: new THREE.Vector3((r() - 0.5) * 2, -0.6, (r() - 0.5) * 0.5).normalize() }
  }

  mergeStatic(group)

  function update(t, dt, { lamp }) {
    starGroups.forEach((s, k) => { s.material.opacity = 0.65 + 0.35 * Math.sin(t * (1.3 + k * 0.4) + k * 2) })
    for (const c of curtains) {                // ripple the curtain along its arc
      const pos = c.geometry.attributes.position, { base, radius } = c.userData
      for (let i = 0; i < pos.count; i++) {
        const [a, y] = base[i], rr = radius + Math.sin(a * 6 + t * 0.6) * 1.2
        pos.setXYZ(i, Math.cos(a + 0.02 * Math.sin(t * 0.3 + a * 4)) * rr, y, Math.sin(a) * rr)
      }
      pos.needsUpdate = true
      c.material.opacity = 0.75 + 0.25 * Math.sin(t * 0.4 + radius)
    }
    mist.forEach((m, i) => {
      const a = m.userData.a + t * 0.01
      m.position.set(Math.cos(a) * (7 + Math.sin(t * 0.1 + i)), 0.4, Math.sin(a) * (7 + Math.sin(t * 0.1 + i)))
    })
    const p = flies.pos
    for (let i = 0; i < p.length; i += 3) {
      p[i] = flyBase[i] + 0.4 * Math.sin(t * 0.5 + i)
      p[i + 1] = flyBase[i + 1] + 0.2 * Math.sin(t * 0.8 + i * 1.3)
      p[i + 2] = flyBase[i + 2] + 0.4 * Math.cos(t * 0.45 + i)
    }
    flies.points.geometry.attributes.position.needsUpdate = true
    flies.points.material.opacity = 0.6 + 0.4 * Math.sin(t * 2.3)
    // shooting star: 1.2 s flight every ~7 s
    const k = (t - shot.start) / 1.2
    if (k > 6) launch(t)
    streak.material.opacity = k >= 0 && k <= 1 ? Math.sin(k * Math.PI) * 0.9 : 0
    if (k >= 0 && k <= 1) {
      streak.position.copy(shot.from).addScaledVector(shot.dir, k * 14)
      streak.lookAt(0, 1.2, 0)
      streak.rotation.z = Math.atan2(shot.dir.y, shot.dir.x)
    }
    lamp.intensity = 1.6 + 0.12 * Math.sin(t * 7) + 0.08 * Math.sin(t * 17)
    lanternGlow.material.opacity = 0.55 + 0.06 * Math.sin(t * 7)
  }

  return {
    group, update, background: 0x04060d, exposure: 1,
    hemi: [0x6a7fbf, 0x0a0c14, 0.55], sun: [0xb8c8ff, 1.4, [-1.4, 2.4, -2.2]],
    lamp: [0xffa860, 1.6, [lanternPos[0], lanternPos[1] + 0.1, lanternPos[2]]]
  }
}
