// Builds assets/pieces.glb from Poly Haven's CC0 "Chess Set" (Riley Queen): one piece per
// type and color, no board, textures resized to 512 px WebP. Dev tool only (the app has no npm):
//   npm i --prefix tools @gltf-transform/core@4 @gltf-transform/functions@4 @gltf-transform/extensions@4 sharp   (gitignored)
//   node tools/build-pieces.mjs <dir with chess_set_1k.gltf>
import { NodeIO } from '@gltf-transform/core'
import { ALL_EXTENSIONS } from '@gltf-transform/extensions'
import { prune, dedup, textureCompress } from '@gltf-transform/functions'
import sharp from 'sharp'

const src = process.argv[2]
const KEEP = /^piece_(pawn|rook|knight|bishop)_(white|black)_01$|^piece_(queen|king)_(white|black)$/
const io = new NodeIO().registerExtensions(ALL_EXTENSIONS)
const doc = await io.read(`${src}/chess_set.gltf`)
for (const node of doc.getRoot().listNodes()) if (!KEEP.test(node.getName())) node.dispose()
await doc.transform(
  prune(),
  dedup(),
  textureCompress({ encoder: sharp, targetFormat: 'webp', resize: [512, 512], quality: 85 })
)
await io.write(process.argv[3] ?? 'assets/pieces.glb', doc)
console.log('nodes:', doc.getRoot().listNodes().map(n => n.getName()).join(' '))
