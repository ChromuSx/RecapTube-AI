// rollup.config.background.js - Build configuration for background service worker
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/background/background-main.js',
  output: {
    file: 'dist/background-bundle.js',
    format: 'iife',
    name: 'BackgroundScript',
    sourcemap: false
  },
  plugins: [
    resolve({
      browser: true
    }),
    commonjs(),
    // Minify only in production
    process.env.NODE_ENV === 'production' && terser({
      format: {
        comments: false
      },
      compress: {
        drop_console: false // Keep console logs for debugging
      }
    })
  ].filter(Boolean)
};
