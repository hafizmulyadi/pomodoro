export function socialStats(sessions,today,dailyGoal=120){
 const totals={};for(const s of sessions)totals[s.day]=(totals[s.day]||0)+s.duration/60;
 const days=Object.keys(totals).sort(),prev=d=>new Date(Date.parse(d+'T12:00:00Z')-86400000).toISOString().slice(0,10);
 let longest=0,run=0,last='',streak=0,cursor=totals[today]?today:prev(today);
 for(const d of days){run=prev(d)===last?run+1:1;longest=Math.max(longest,run);last=d;}while(totals[cursor]){streak++;cursor=prev(cursor);}
 const total=sessions.reduce((n,s)=>n+s.duration/60,0),week=days.filter(d=>Date.parse(d)>=Date.parse(today)-6*86400000&&d<=today).reduce((n,d)=>n+totals[d],0);
 const xp=Math.floor(total)+sessions.length*10+Object.values(totals).filter(n=>n>=dailyGoal).length*20;
 const badges=[['First Focus',sessions.length>=1],['10 Sessions',sessions.length>=10],['10 Hours',total>=600],['7 Day Streak',longest>=7],['30 Day Streak',longest>=30],['Together',sessions.some(s=>s.room_id)],['Deep Focus',sessions.some(s=>s.duration>=3000)],['Early Bird',sessions.some(s=>s.hour>=4&&s.hour<8)],['Night Owl',sessions.some(s=>s.hour>=22||s.hour<4)]];
 return {total,today:totals[today]||0,week,count:sessions.length,average:sessions.length?total/sessions.length:0,streak,longest,xp,level:1+Math.floor(xp/500),badges,days:totals};
}
