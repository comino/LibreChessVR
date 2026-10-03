// Downloads Poly Haven CC0 models and writes Quest-friendly copies to assets/props/<id>.glb:
// meshes sharing a material joined (fewer draw calls), textures as WebP (512 px, or id@256).
// Dev tool only (the app has no npm):
//   npm i --prefix tools @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp   (gitignored)
//   node tools/build-props.mjs ArmChair_01 wooden_candlestick@256 …
import { mkdirSync, writeFileSync, mkdtempSync, statSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join } from 'path'
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune, dedup, flatten, join as joinMeshes, weld, textureCompress } from '@gltf-transform/functions'
import sharp from 'sharp'

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)

async function download(id) {
  const files = await (await fetch(`https://api.polyhaven.com/files/${id}`)).json()
  const gltf = files.gltf['1k'].gltf, dir = mkdtempSync(join(tmpdir(), id))
  for (const [path, { url }] of [[`${id}.gltf`, gltf], ...Object.entries(gltf.include)]) {
    mkdirSync(dirname(join(dir, path)), { recursive: true })
    writeFileSync(join(dir, path), Buffer.from(await (await fetch(url)).arrayBuffer()))
  }
  return join(dir, `${id}.gltf`)
}

for (const arg of process.argv.slice(2)) {
  const [id, size = 512] = arg.split('@')
  const doc = await io.read(await download(id))
  await doc.transform(prune(), dedup(), flatten(), joinMeshes(), weld(), prune(),
    textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [+size, +size], quality: 85 }))
  const out = `assets/props/${id}.glb`
  mkdirSync('assets/props', { recursive: true })
  await io.write(out, doc)
  const prims = doc.getRoot().listMeshes().flatMap(m => m.listPrimitives())
  const tris = prims.reduce((n, p) => n + (p.getIndices()?.getCount() ?? 0) / 3, 0)
  console.log(`${id}: ${prims.length} draws, ${tris} tris, ${Math.round(statSync(out).size / 1024)} KB`)
}
