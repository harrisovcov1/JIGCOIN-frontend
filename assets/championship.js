'use strict';
window.JigChampionship = (() => {
 let dialog, timer, generation=0;
 const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 function button(title,fn){const b=node('button',title);b.type='button';b.onclick=fn;return b;}
 async function open(post){
  const call=(route,body={})=>post('/api/championship/'+route,body);
  let status=await call('status');
  if(!status?.active)return false;
  if(dialog?.open)return true;
  dialog=node('dialog');dialog.className='championship-dialog';dialog.setAttribute('aria-label','Weekly Championship');
  const main=node('section'),close=button('Close',()=>dialog.close());
  dialog.append(close,main);document.body.append(dialog);dialog.showModal();
  dialog.onclose=()=>{generation++;clearInterval(timer);dialog.remove();};
  let scope='global';
  const heading=t=>main.append(node('h2',t));
  async function retry(fn){
   try{await fn();}catch{main.append(node('p','Connection interrupted.'),button('Try again',()=>retry(fn)));}
  }
  async function reload(){status=await call('status',{scope});if(!status.active)throw Error();lobby();}
  function lobby(){
   generation++;clearInterval(timer);main.replaceChildren();heading('Weekly Championship');
   main.append(node('p','Global podium · Gold 100,000 · Silver 50,000 · Bronze 25,000 game coins'));
   const clock=node('p');main.append(clock);
   const tick=()=>{const minutes=Math.max(0,Math.ceil((Date.parse(status.close+'T00:00:00Z')-Date.now())/60000));clock.textContent='Closes in '+Math.floor(minutes/1440)+'d '+Math.floor(minutes%1440/60)+'h '+minutes%60+'m · Monday 00:00 UTC';};tick();timer=setInterval(tick,30000);
   heading(status.name);
   main.append(node('p','Five rounds · 200 points per correct round. Your six best days count.'));
   for(const mode of ['practice','ranked']){
    const key=crypto.randomUUID();
    main.append(button((mode==='practice'?'Practice':'Ranked run')+' · '+status.remaining[mode]+' left / resume',()=>retry(async()=>{
     const run=await call('start',{mode,request:key});if(!run.id){main.append(node('p',run.reason||'Unable to start'));return;}play(run);
    })));
   }
   heading(status.me?'Your week · #'+status.me.place:'Your week');
   main.append(node('p',(status.me?.total||0)+' points · '+status.daily.filter(Boolean).length+'/7 scoring days'),
    node('p',status.daily.map((v,i)=>['M','Tu','W','Th','F','Sa','Su'][i]+' '+v).join(' · ')),
    node('p','Third-place score: '+status.podium));
   if(status.rival)main.append(node('p','To pass '+status.rival.name+': '+(status.rival.total-status.me.total+1)+' points'));
   for(const s of ['global','friends'])main.append(button(s==='global'?'Global standings':'Friends comparison',()=>retry(async()=>{scope=s;await reload();})));
   const list=node('ol');for(const r of status.rows)list.append(node('li','#'+r.place+' '+r.name+' · '+r.total));main.append(list);
   const prefs=node('details'),title=node('summary','Daily Telegram reminder');prefs.append(title);
   function input(label,type,value){const wrap=node('label',label+' '),field=node('input');field.type=type;field.value=value;wrap.append(field);prefs.append(wrap);return field;}
   const time=input('Reminder time (UTC)','time','17:00'),from=input('Quiet from (UTC hour)','number','22'),to=input('Quiet until','number','8');
   const result=node('p');result.setAttribute('role','status');
   prefs.append(button('Enable daily reminder',()=>{const save=async()=>{const [h,m]=time.value.split(':').map(Number);
    const res=await call('reminder',{enabled:true,minute:h*60+m,quietFrom:Number(from.value),quietTo:Number(to.value)});
    result.textContent=res.enabled?'Daily reminder enabled.':res.reason||'Permission required. Try again after allowing bot messages.';};
    const app=window.Telegram?.WebApp;if(app?.requestWriteAccess)app.requestWriteAccess(allowed=>{if(allowed)save();else result.textContent='Telegram permission declined.';});else save();}),
    button('Disable daily reminder',async()=>{const res=await call('reminder',{enabled:false});result.textContent=res.enabled===false?'Daily reminder disabled.':'Could not confirm. Try again.';}),result);main.append(prefs);
   heading('Previous champions');for(const r of status.history)main.append(node('p',r.week+' · #'+r.place+' '+r.name+' · '+r.score+' points · '+r.coins+' coins'));
   if(!status.history.length)main.append(node('p','The first podium appears after the week closes.'));
  }
  function play(run){
   clearInterval(timer);const stamp=++generation;main.replaceChildren();heading(run.name);
   if(run.lastCorrect!==undefined)main.append(node('p',run.lastCorrect?'Correct':'Round missed'));
   if(run.finished){heading('Result · '+run.score+' / 1,000');main.append(button('View standings',()=>retry(reload)));return;}
   const p=run.board, actions=[];
   const prompt=node('p',p.prompt),scene=node('div'),tray=node('div'),selection=node('p');
   main.append(node('p','Round '+(run.round+1)+' of 5'),prompt,scene,selection,tray);
   if(p.reference)main.append(node('p','Reference · '+p.reference.join('   ')));
   if(p.targets)main.append(node('p','Targets · '+p.targets.join(' then ')));
   if(p.target!==undefined)main.append(node('p','Starting total '+p.start+' · Target '+p.target));
   function controls(){
    if(stamp!==generation)return;scene.replaceChildren();const buttons=[];
    for(const [i,label] of p.tiles.entries()){
     const b=button(label,()=>{if(actions.length>=20)return;actions.push(i);selection.textContent=actions.map(k=>p.tiles[k]).join(' → ');
      if(p.switchAt&&actions.length>=p.switchAt)prompt.textContent='Switch rule: assign each piece by Light or Dark finish.';
     });buttons.push(b);tray.append(b);
    }
    tray.append(button('Undo',()=>{actions.pop();selection.textContent=actions.map(k=>p.tiles[k]).join(' → ');if(p.switchAt&&actions.length<p.switchAt)prompt.textContent=p.prompt;}));
    tray.append(button('Submit answer',()=>retry(async()=>{
     tray.inert=true;try{const next=await call('answer',{id:run.id,round:run.round,actions:[...actions]});if(!next.id)throw Error();if(generation===stamp)play(next);}finally{tray.inert=false;}
    })));
   }
   if(p.crossings||p.reveal){
    const sequence=p.crossings||p.reveal;let i=0;
    const show=()=>{if(stamp!==generation)return;if(i>=sequence.length){controls();return;}
     scene.textContent=p.flash?sequence.join(' '):sequence[i];if(p.crossings){scene.className='champ-cross';scene.animate([{transform:'translateX(-32%)'},{transform:'translateX(32%)'}],600);}
     i=p.flash?sequence.length:i+1;setTimeout(show,p.flash?2200:700);
    };show();
   }else controls();
  }
  lobby();return true;
 }
 return {open};
})();
document.getElementById('champTrophies')?.addEventListener('toggle',async function(){
 if(!this.open)return;
 const result=await apiPost('/api/championship/status',{});
 const awards=result.trophies || [];
 this.querySelector('p').textContent=result.ok===false?'Unable to check trophies. Reopen to retry.':
  awards.map(a=>['Gold','Silver','Bronze'][a.place-1]+' · Week of '+a.week+' · #'+a.place+' · '+a.score+' points · '+a.coins+' game coins').join('\n')||'No Weekly Championship trophies yet.';
});
