/** Local test artifact only; leaves the existing Next runtime configuration unchanged. */
import { mkdir, symlink, writeFile } from 'node:fs/promises'
import path from 'node:path'

const root = path.resolve(import.meta.dir, '..')
const app = path.join(root, 'apps/editor')
const output = path.resolve(
  process.argv[2] ?? path.join(root, 'docs/tmp/sheer-integration-2026-10-06/browser'),
)
const result = await Bun.build({
  entrypoints: [path.join(app, 'test-fixtures/sheer-device-integration.tsx')],
  target: 'browser',
  minify: true,
  define: { 'process.env.NODE_ENV': '"development"' },
  plugins: [
    {
      name: 'existing-workspace-singletons',
      setup(builder) {
        // Local harness only: dependency preloads can run before application initialization.
        builder.onLoad({ filter: /\/drei\/core\/Gltf\.js$/ }, async (args) => ({
          contents: (await Bun.file(args.path).text()).replace(
            'https://www.gstatic.com/draco/versioned/decoders/1.5.5/',
            '/draco/',
          ),
          loader: 'js',
        }))
        builder.onResolve(
          {
            filter:
              /^(react|react-dom|three|zustand|@react-three\/fiber|@react-three\/drei)(\/.*)?$/,
          },
          (args) => ({
            path: Bun.resolveSync(
              args.path,
              args.path.startsWith('zustand') ? path.join(root, 'packages/core') : app,
            ),
          }),
        )
      },
    },
  ],
})
if (!result.success) throw new AggregateError(result.logs, 'Integration fixture build failed')
const javascript = (
  await Promise.all(
    result.outputs.filter((file) => file.path.endsWith('.js')).map((file) => file.text()),
  )
).join('\n')
await mkdir(output, { recursive: true })
await symlink(path.join(app, 'public/items'), path.join(output, 'items'), 'dir').catch((error) => {
  if (error.code !== 'EEXIST') throw error
})
await symlink(
  path.join(app, 'node_modules/three/examples/jsm/libs/draco/gltf'),
  path.join(output, 'draco'),
  'dir',
).catch((error) => {
  if (error.code !== 'EEXIST') throw error
})
await writeFile(
  path.join(output, 'index.html'),
  `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="icon" href="data:,"><title>Studio sheer integration</title><style>body{margin:0;background:#f5f3ed;color:#292d29;font:15px system-ui}header,nav{display:flex;gap:16px;align-items:center;padding:14px 24px}header{justify-content:space-between}header span{font-size:13px;color:#686d65}nav{flex-wrap:wrap;border-block:1px solid #d8d9d0}button{padding:8px 12px;background:#fff;border:1px solid #cecec7;border-radius:8px;cursor:pointer}output{font-size:13px}main{height:calc(100vh - 148px);min-height:450px}canvas{display:block}</style><div id="root"></div><script type="module">${javascript.replaceAll('</script', '<\\/script')}</script></html>`,
)
console.log(output)
