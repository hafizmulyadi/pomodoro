export const defaults = () => ({settings:{focusMinutes:25,breakMinutes:5,sessionCount:4,autoBreak:true,autoFocus:false,dailyGoal:120,weeklyGoal:600,voiceMode:'auto',voiceName:'',soundVolume:75,chime:true,notifications:false,theme:'auto',animation:true,keepPlayer:true,brightness:90,blur:0,masterVolume:70},scene:'terrace',favorites:[],youtube:{library:[],recent:[],volume:60},backgrounds:[],tasks:[],activeTask:null,logs:[],ambience:{rain:35,thunder:0,fireplace:0,keyboard:0,cafe:0,wind:0,forest:0,ocean:0,night:0,white:0},timer:null});
export function dateKey(date=new Date()){return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;}
export function freshTimer(settings,mode='focus',session=1){const total=(mode==='focus'?settings.focusMinutes:settings.breakMinutes)*60;return {mode,session,total,remaining:total,running:false,deadline:null,id:crypto.randomUUID(),taskId:null,warned:false};}
export function remaining(timer,now=Date.now()){return timer.running?Math.max(0,Math.ceil((timer.deadline-now)/1000)):timer.remaining;}
export function start(timer,taskId,now=Date.now()){if(timer.running)return;timer.deadline=now+timer.remaining*1000;timer.running=true;if(timer.remaining===timer.total)timer.taskId=taskId;}
export function pause(timer,now=Date.now()){timer.remaining=remaining(timer,now);timer.deadline=null;timer.running=false;}
export function transition(data,skipped=false,now=Date.now()){
 const t=data.timer;let finished=false;
 if(t.mode==='focus'&&!skipped){const at=new Date(now);if(!data.logs.some(l=>l.id===t.id)){data.logs.push({id:t.id,minutes:t.total/60,at:at.toISOString(),date:dateKey(at),hour:at.getHours(),taskId:t.taskId});const task=data.tasks.find(x=>x.id===t.taskId);if(task)task.completed=(task.completed||0)+1;}}
 if(t.mode==='focus')data.timer=freshTimer(data.settings,'break',t.session);
 else if(t.session>=data.settings.sessionCount){data.timer=freshTimer(data.settings);finished=true;}
 else data.timer=freshTimer(data.settings,'focus',t.session+1);
 const auto=data.timer.mode==='break'?data.settings.autoBreak:data.settings.autoFocus;
 if(auto&&!finished&&!skipped)start(data.timer,data.activeTask,now);
 return {finished,previous:t.mode};
}
export function statistics(logs,now=new Date()){
 const days=Array.from({length:7},(_,i)=>{const d=new Date(now);d.setDate(d.getDate()-6+i);return {key:dateKey(d),label:d.toLocaleDateString('id-ID',{weekday:'short'}),minutes:0};});
 const totals={};let total=0;for(const l of logs){totals[l.date]=(totals[l.date]||0)+l.minutes;total+=l.minutes;}
 for(const d of days)d.minutes=totals[d.key]||0;
 let streak=0;const cursor=new Date(now);if(!totals[dateKey(cursor)])cursor.setDate(cursor.getDate()-1);
 while(totals[dateKey(cursor)]){streak++;cursor.setDate(cursor.getDate()-1);}
 const best=Object.entries(totals).sort((a,b)=>b[1]-a[1])[0];
 return {days,total,today:totals[dateKey(now)]||0,week:days.reduce((n,d)=>n+d.minutes,0),count:logs.length,average:logs.length?total/logs.length:0,streak,best,night:logs.some(l=>l.hour>=22||l.hour<4),early:logs.some(l=>l.hour>=4&&l.hour<8)};
}
