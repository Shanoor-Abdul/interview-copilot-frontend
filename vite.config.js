import { defineConfig } from 'vite';  
import react from '@vitejs/plugin-react';  
import { copyFileSync, mkdirSync } from 'fs';  
import { resolve } from 'path';  
  
export default defineConfig({  
  plugins: [  
    react(),  
    {  
      name: 'copy-static-files',  
      writeBundle() {  
        // Copy background.js from public to dist  
        try {  
          copyFileSync('public/background.js', 'dist/background.js');  
          console.log('✅ Copied background.js to dist');  
        } catch (e) {  
          console.error('❌ Failed to copy background.js:', e);  
        }  
      }  
    }  
  ],  
  build: {  
    outDir: 'dist',  
    rollupOptions: {  
      input: {  
        popup: resolve(__dirname, 'index.html'),  
      },  
    },  
  },  
});  