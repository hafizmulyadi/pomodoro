import test from 'node:test';import assert from 'node:assert/strict';
import {socialHandler,safePreviewURL} from '../src/social.mjs';import {socialStats} from '../public/social-stats.mjs';
test('Social endpoints hide server keys and reject anonymous and cross-origin writes',async()=>{
 const env={SUPABASE_URL:'https://example.supabase.co',SUPABASE_ANON_KEY:'public-anon',SUPABASE_SERVICE_ROLE_KEY:'secret-service',LIVEKIT_API_SECRET:'secret-voice'};
 const config=await (await socialHandler(new Request('https://app.test/api/social/config'),env)).json();assert.equal(config.configured,true);assert.ok(!JSON.stringify(config).includes('secret'));
 assert.equal((await socialHandler(new Request('https://app.test/api/social/action',{method:'POST',headers:{Origin:'https://evil.test'}}),env)).status,403);
 assert.equal((await socialHandler(new Request('https://app.test/api/social/action',{method:'POST',headers:{Origin:'https://app.test'}}),env)).status,401);
 assert.equal((await socialHandler(new Request('https://app.test/api/social/action'),{})).status,503);
});
test('Link preview only fetches explicitly approved HTTPS origins',()=>{
 for(const url of ['http://127.0.0.1/','https://localhost/','https://169.254.169.254/','https://github.com.evil.test/','https://github.com@evil.test/','https://user:pass@github.com/','https://github.com:8443/','javascript:alert(1)','file:///etc/passwd'])assert.equal(safePreviewURL(url),null,url);
 assert.equal(safePreviewURL('https://github.com/example/project').hostname,'github.com');
});
test('Focus XP, streaks and badges derive only from completed sessions',()=>{
 const sessions=Array.from({length:7},(_,i)=>({day:'2026-09-'+String(14+i),duration:3600,hour:6,room_id:'room'}));const x=socialStats(sessions,'2026-09-20');assert.equal(x.total,420);assert.equal(x.streak,7);assert.equal(x.longest,7);assert.equal(x.xp,490);assert.equal(x.badges.find(b=>b[0]==='Together')[1],true);assert.equal(socialStats(sessions,'2026-09-22').streak,0);assert.equal(socialStats([],'2026-09-20').xp,0);
});
