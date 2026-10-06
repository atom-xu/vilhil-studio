/** Build the same dev-only curtain fixture into a self-contained, offline review file.
 * Run from repo root: bun scripts/build-curtain-preview.ts [output-directory]
 * Does not change Next configuration, publish files, or access project data.
 */
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const output = path.resolve(process.argv[2] ?? path.join(root, 'docs/tmp/curtain-lab-preview'))
const result = await Bun.build({
  entrypoints: [path.join(root, 'apps/editor/app/curtain-lab/standalone.tsx')],
  target: 'browser',
  minify: true,
  define: { 'process.env.NODE_ENV': '"production"' },
})
if (!result.success) throw new AggregateError(result.logs, 'Curtain preview build failed')
const javascript = (
  await Promise.all(
    result.outputs.filter((file) => file.path.endsWith('.js')).map((file) => file.text()),
  )
).join('\n')
const styles = (
  await Promise.all(
    result.outputs.filter((file) => file.path.endsWith('.css')).map((file) => file.text()),
  )
).join('\n')
if (!javascript || !styles) throw new Error('Expected JavaScript and CSS outputs')
const font = (await readFile(path.join(root, 'apps/editor/app/fonts/GeistVF.woff'))).toString(
  'base64',
)
const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>VilHil · 纱帘视觉样本</title><style>
@font-face{font-family:GeistLab;src:url(data:font/woff;base64,${font}) format('woff');font-weight:100 900;font-display:swap}
:root{--font-geist-sans:GeistLab;--background:#fafaf9;--foreground:#242424;--muted-foreground:#72726c;--border:#deded8;--primary:#006fff;--ui-radius-panel:16px;--ui-radius-control:12px}body{margin:0}${styles}
</style></head><body><div id="root"></div><script>${javascript.replaceAll('</script', '<\\/script')}</script></body></html>`
await mkdir(output, { recursive: true })
await writeFile(path.join(output, 'index.html'), html)
console.log(
  `Offline preview: ${path.join(output, 'index.html')} (${Buffer.byteLength(html)} bytes)`,
)
