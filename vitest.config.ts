import { configDefaults, defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(
  viteConfig,
  defineConfig({
    test: {
      globals: true,
      environment: 'jsdom',
      setupFiles: './src/test/setup.ts',
      // other sessions' working copies live under .claude/worktrees; their tests are not this project's
      exclude: [...configDefaults.exclude, '.claude/**'],
    },
  })
)
