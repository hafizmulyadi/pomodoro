import fs from 'node:fs';
fs.mkdirSync('dist/client', { recursive: true });
fs.cpSync('public', 'dist/client', { recursive: true, filter: p => !p.endsWith('base.css') && !p.endsWith('.zip') });
console.log('Vercel frontend ready. API functions are built from api/router.js.');
