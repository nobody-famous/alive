const esbuild = require('esbuild')

const production = process.argv.includes('--production')
const watch = process.argv.includes('--watch')

async function main() {
  // Extension
  const extCtx = await esbuild.context({
    entryPoints: ['src/extension.ts'],
    bundle: true,
    format: 'cjs',
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: 'node',
    outfile: 'out/extension.js',
    external: ['vscode'],
    logLevel: 'warning',
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin('extension')
    ]
  })
  // Webview
  const webCtx = await esbuild.context({
    entryPoints: ['webview/index.tsx'],
    bundle: true,
    format: 'esm',
    outdir: 'resources/repl',
    minify: production,
    sourcemap: !production,
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin('webview')
    ]
  })

  if (watch) {
    await extCtx.watch()
    await webCtx.watch()
  } else {
    await extCtx.rebuild()
    await webCtx.rebuild()
    await extCtx.dispose()
    await webCtx.dispose()
  }
}

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = (contextName) => ({
  name: `esbuild-problem-matcher-${contextName}`,

  setup(build) {
    build.onStart(() => {
      console.log(`[${contextName}] [${watch ? 'watch' : 'build'}] build started`)
    })
    build.onEnd(result => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`)
        if (location == null) return
        console.error(`    ${location.file}:${location.line}:${location.column}:`)
      })
      console.log(`[${contextName}] [${watch ? 'watch' : 'build'}] build finished`)
    })
  }
})

main().catch(e => {
  console.error(e)
  process.exit(1)
})