import {build} from 'esbuild';
if (!process.env.SKIP_SOCIAL_BUNDLE) await build({entryPoints:['client/social.js'],bundle:true,format:'esm',target:'es2022',minify:true,outfile:'public/social.bundle.js'});
import fs from 'node:fs';
fs.mkdirSync('dist/client', { recursive: true });
fs.cpSync('public', 'dist/client', { recursive: true, filter: p => !p.endsWith('base.css') && !p.endsWith('.zip') });
console.log('Vercel frontend ready. API functions are built from api/router.js.');



