// rollup.config.content.js - Build configuration for content script
import resolve from '@rollup/plugin-node-resolve';
import commonjs from '@rollup/plugin-commonjs';
import terser from '@rollup/plugin-terser';

export default {
  input: 'src/content/content-main.js',
  output: {
    file: 'dist/content-bundle.js',
    format: 'iife',
    name: 'ContentScript',
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
