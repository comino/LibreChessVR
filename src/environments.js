// Scenery around the table: procedural shell + scanned props; one file per scene in scenes/.
// Each builder returns {group, background, fog?, exposure, hemi: [sky, ground, intensity],
// sun: [color, intensity, offset], lamp?: [color, intensity, position], update?(t, dt, {lamp}),
// ready?: Promise (scanned props loaded)}.
// Sun offset is relative to the board. Board3D owns the lights (fixed count: adding/removing
// lights would recompile every shader on a scene switch); update() may animate the lamp.

import * as THREE from 'three'
import { std, disc, disposeObject } from './scenes/common.js'
import { study } from './scenes/study.js'
import { sunset } from './scenes/sunset.js'
import { night } from './scenes/night.js'
export { woodTexture } from './scenes/common.js'

function minimal() {
  const group = new THREE.Group()
  group.add(disc(3, std(0x2a3038)))
  return { group, background: 0x1b2028, exposure: 1, hemi: [0xffffff, 0x445566, 1.0], sun: [0xffffff, 2.0, [0.8, 1.8, 0.95]] }
}

const BUILDERS = { minimal, study, sunset, night }
// Unknown names fall back to minimal; the result's name says which one was built.
export function buildEnvironment(name) {
  const key = Object.hasOwn(BUILDERS, name) ? name : 'minimal'
  return { name: key, ...BUILDERS[key]() }
}

// Frees GPU resources of a built environment group; props still loading are dropped.
export function disposeGroup(group) {
  group.userData.disposed = true
  disposeObject(group)
}
