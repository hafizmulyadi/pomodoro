export function parseYouTube(input){
 const text=String(input||'').trim();let u;try{u=new URL(/^https?:\/\//i.test(text)?text:'https://'+text);}catch{throw new Error('Masukkan tautan video atau playlist YouTube yang valid.');}
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.port)throw new Error('Gunakan tautan YouTube yang valid.');
 const host=u.hostname.toLowerCase();if(!['youtube.com','www.youtube.com','m.youtube.com','music.youtube.com','youtu.be','www.youtube-nocookie.com','youtube-nocookie.com'].includes(host))throw new Error('Tautan harus berasal dari youtube.com atau youtu.be.');
 const parts=u.pathname.split('/').filter(Boolean);let videoId=host==='youtu.be'?parts[0]:u.pathname==='/watch'?u.searchParams.get('v'):['shorts','live','embed'].includes(parts[0])&&parts[1]!=='videoseries'?parts[1]:null;
 const playlistId=u.searchParams.get('list');if(videoId&&!/^[A-Za-z0-9_-]{11}$/.test(videoId))throw new Error('ID video YouTube tidak valid.');if(playlistId&&!/^[A-Za-z0-9_-]{10,100}$/.test(playlistId))throw new Error('ID playlist YouTube tidak valid.');if(!videoId&&!playlistId)throw new Error('Tautan harus menuju video atau playlist, bukan halaman kanal.');
 const stamp=u.searchParams.get('t')||u.searchParams.get('start')||'0';let startSeconds=0;if(/^\d+$/.test(stamp))startSeconds=Number(stamp);else{const m=stamp.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);if(m)startSeconds=Number(m[1]||0)*3600+Number(m[2]||0)*60+Number(m[3]||0);}
 const url=new URL(videoId?'https://www.youtube.com/watch':'https://www.youtube.com/playlist');if(videoId)url.searchParams.set('v',videoId);if(playlistId)url.searchParams.set('list',playlistId);
 return {id:playlistId?'playlist:'+playlistId:'video:'+videoId,videoId:videoId||null,playlistId:playlistId||null,startSeconds:Math.min(startSeconds,86400),url:url.href};
}
