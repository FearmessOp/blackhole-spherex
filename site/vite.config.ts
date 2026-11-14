import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Static site: all target data is served as plain files from public/data.
export default defineConfig({
    plugins: [react()],
    base: './',
    build: {
        outDir: 'dist',
        sourcemap: false
    }
})