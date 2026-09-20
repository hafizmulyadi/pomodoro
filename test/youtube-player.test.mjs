import test from 'node:test';
import assert from 'node:assert/strict';
import {YouTubeMusic} from '../public/youtube.js';
import {parseYouTube} from '../public/youtube-url.mjs';

test('YouTube controller cues videos and playlists, records only playback, and pauses in Zen', async()=>{
 const saved=new Map();
 const set=(key,value)=>{saved.set(key,Object.getOwnPropertyDescriptor(globalThis,key));Object.defineProperty(globalThis,key,{value,configurable:true,writable:true});};
 const elements=new Map();
 const element=id=>{if(!elements.has(id))elements.set(id,{hidden:false,style:{},classList:{contains:()=>false},replaceChildren(){},append(){},setAttribute(){},focus(){}});return elements.get(id);};
 let zen=false,changed=0;
 class Player{
  constructor(id,options){this.options=options;this.state=-1;this.duration=180;this.time=0;this.video='M7lc1UVf-VE';queueMicrotask(()=>options.events.onReady());}
  getIframe(){return element('youtubeFrame');}setVolume(value){this.volume=value;}
  cueVideoById(item){this.video=item.videoId;this.time=item.startSeconds;this.cued=item;}
  cuePlaylist(item){this.playlist=item;}getPlayerState(){return this.state;}
  getDuration(){return this.duration;}getCurrentTime(){return this.time;}
  getVideoUrl(){return 'https://www.youtube.com/watch?v='+this.video;}
  pauseVideo(){this.state=2;}playVideo(){this.state=1;this.options.events.onStateChange({data:1});}
  nextVideo(){this.next=true;}previousVideo(){this.previous=true;}
 }
 try{
  set('document',{hidden:false,getElementById:element,querySelector:()=>element('mini-art'),body:{classList:{contains:name=>name==='zen'&&zen}}});
  set('window',{YT:{Player}});set('YT',{Player});set('location',{origin:'https://focus.example'});
  set('Image',class{});set('fetch',async()=>Response.json({title:'Test video',author:'Test channel',thumbnail:'https://i.ytimg.com/vi/M7lc1UVf-VE/hqdefault.jpg'}));
  const data={settings:{keepPlayer:true}};
  const music=new YouTubeMusic({data,changed:()=>changed++,toast(){},showMusic(){}});
  await music.load(parseYouTube('https://youtu.be/M7lc1UVf-VE?t=90'));
  assert.equal(music.ready,true);assert.equal(music.player.cued.startSeconds,90);
  assert.equal(data.youtube.library.length,1);assert.equal(data.youtube.recent.length,0);
  music.toggle();assert.equal(data.youtube.recent.length,1);music.update();assert.equal(data.youtube.recent.length,1);
  assert.equal(element('songDuration').textContent,'3:00');assert.equal(element('songSeek').value,90);
  zen=true;music.layout();assert.equal(music.player.state,2);assert.equal(element('youtubeDock').hidden,true);
  zen=false;await music.load(parseYouTube('https://www.youtube.com/playlist?list=PL1234567890abc'));
  assert.equal(music.player.playlist.list,'PL1234567890abc');assert.equal(element('musicNext').disabled,false);
  music.step(1);assert.equal(music.player.next,true);music.step(-1);assert.equal(music.player.previous,true);
  const video=data.youtube.library.find(x=>x.videoId);element('playlists').onclick({target:{closest:s=>s==='[data-favorite]'?{dataset:{favorite:video.id}}:null}});
  assert.equal(video.favorite,true);assert.ok(changed>0);
 }finally{for(const [key,descriptor]of saved){if(descriptor)Object.defineProperty(globalThis,key,descriptor);else delete globalThis[key];}}
});
