'use strict';
window.JigChampionship = (() => {
 let dialog, timer, generation=0;
 const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};
 function button(title,fn){const b=node('button',title);b.type='button';b.onclick=fn;return b;}
 async function open(post){
  const call=(route,body={})=>post('/api/championship/'+route,body);
  const opener=document.activeElement;
  let status=await call('status');
  if(!status?.active)return false;
  if(dialog?.open)return true;
  dialog=node('dialog');dialog.className='championship-dialog';dialog.setAttribute('aria-label','Weekly Championship');
  const main=node('section'),close=button('Close',()=>dialog.close());
  dialog.append(close,main);document.body.append(dialog);dialog.showModal();
  dialog.onclose=()=>{generation++;clearInterval(timer);dialog.remove();if(opener?.isConnected)opener.focus({preventScroll:true});};
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
   heading(status.name);if(status.instructions)main.append(node('p',status.instructions));
   main.append(node('p','Five rounds. Each solve earns 200 points. A complete ordered answer can earn partial credit for its correct starting steps. Your six best days count.'));
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
   prefs.append(node('p',status.reminder?'Daily reminder enabled.':'Daily reminder off.'));
   function input(label,type,value){const wrap=node('label',label+' '),field=node('input');field.type=type;field.value=value;wrap.append(field);prefs.append(wrap);return field;}
   const time=input('Reminder time (UTC)','time','17:00'),from=input('Quiet from (UTC hour)','number','22'),to=input('Quiet until','number','8');
   if(status.reminder){time.value=[Math.floor(status.reminder.minute/60),status.reminder.minute%60].map(n=>String(n).padStart(2,'0')).join(':');from.value=status.reminder.quiet_from;to.value=status.reminder.quiet_to;}
   const result=node('p');result.setAttribute('role','status');
   prefs.append(button('Enable daily reminder',()=>{const save=async()=>{const [h,m]=time.value.split(':').map(Number);
    const res=await call('reminder',{enabled:true,minute:h*60+m,quietFrom:Number(from.value),quietTo:Number(to.value)});
    result.textContent=res.enabled?'Daily reminder enabled.':res.reason||'Permission required. Try again after allowing bot messages.';};
    const app=window.Telegram?.WebApp;if(app?.requestWriteAccess)app.requestWriteAccess(allowed=>{if(allowed)save();else result.textContent='Telegram permission declined.';});else save();}),
    button('Disable daily reminder',async()=>{const res=await call('reminder',{enabled:false});result.textContent=res.enabled===false?'Daily reminder disabled.':'Could not confirm. Try again.';}),result);main.append(prefs);
   const ties=node('details');ties.append(node('summary','How tied scores are ranked'),node('p','Ties use your six counted scores, highest first, then your total first-ranked-run points on those days. If days share the same best score, we count the better first run. For identical records, the lowest SHA-256 hash of jigcoin-champ-v2/YYYY-MM-DD/PLAYER wins. The date is the Monday UTC and PLAYER is the numeric player ID. This last tie-break rotates weekly.'));main.append(ties);heading('Previous champions');for(const r of status.history)main.append(node('p',r.week+' · #'+r.place+' '+r.name+' · '+r.score+' points · '+r.coins+' coins'));
   if(!status.history.length)main.append(node('p','The first podium appears after the week closes.'));
  }
  function play(run){
   clearInterval(timer);const stamp=++generation;main.replaceChildren();heading(run.name);
   if(run.lastCorrect!==undefined)main.append(node('p',run.lastCorrect?'Correct':'Round missed'));
   if(run.finished){heading('Result · '+run.score+' / 1,000');main.append(button('View standings',()=>retry(reload)));return;}
   const p=run.board, actions=[...(run.flips||[])];
   const prompt=node('p',p.prompt),scene=node('div'),tray=node('div'),selection=node('p');
   main.append(node('p','Round '+(run.round+1)+' of 5'),prompt,scene);
   if(p.targetsByTray)main.append(node('p','Tray A: '+p.targetsByTray[0]+' coins · Tray B: '+p.targetsByTray[1]+' coins'));
   if(p.reference)main.append(node('p','Reference · '+p.reference.join('   ')));
   if(p.targets)main.append(node('p','Targets · '+p.targets.join(' then ')));
   if(p.target!==undefined)main.append(node('p','Starting total '+p.start+' · Target '+p.target));
   main.append(selection,tray);
   function controls(){
    if(stamp!==generation)return;scene.replaceChildren();const buttons=[];if(p.grid||p.kind==='pairs')tray.className='champ-grid';
    for(const [i,label] of p.tiles.entries()){
     const b=button(label,async()=>{
      if(actions.length>=20)return;
      if(p.hidden){
       if(actions.length>=2*p.turns)return;
       tray.inert=true;
       try{
        const step=actions.length,last=actions.at(-1);
        const res=await call('flip',{id:run.id,round:run.round,step,tile:i});
        if(generation!==stamp)return;
        if(!res.face){selection.textContent='Flip unavailable. Try the same tile again.';return;}
        actions.push(i);b.textContent=res.face;
        if(step%2===1){
         if(res.matched){b.disabled=true;buttons[last].disabled=true;}
         else{await new Promise(resolve=>setTimeout(resolve,550));buttons[last].textContent=p.tiles[last];b.textContent=p.tiles[i];}
        }
        selection.textContent=Math.ceil(actions.length/2)+' of '+p.turns+' turns';
       }catch{selection.textContent='Connection interrupted. Tap the same tile to retry.';}finally{tray.inert=false;}
       return;
      }
      if(p.kind==='pairs'){
       const last=actions.at(-1);
       if(actions.length%2===1 && last===i)return;
       if(actions.length%2===1){
        const faces=p.tiles;
        const pairs={'◇':'◆','○':'●','△':'▲','□':'■'};
        const a=pairs[faces[i]]||faces[i],other=pairs[faces[last]]||faces[last];
        if(a===other){b.disabled=true;buttons[last].disabled=true;}
       }
      }
      actions.push(i);selection.textContent=actions.map(k=>p.tiles[k]).join(' → ');
      if(p.switchAt&&actions.length>=p.switchAt)prompt.textContent='Switch rule: assign each piece by Light or Dark finish.';
     });buttons.push(b);tray.append(b);
    }
    if(run.matched)for(const i of run.matched){buttons[i].disabled=true;buttons[i].textContent='Matched';}
    if(run.pendingFace)buttons[actions.at(-1)].textContent=run.pendingFace;
    if(p.kind!=='pairs')tray.append(button('Undo',()=>{actions.pop();selection.textContent=actions.map(k=>p.tiles[k]).join(' → ');if(p.switchAt&&actions.length<p.switchAt)prompt.textContent=p.prompt;}));
    tray.append(button('Submit answer',()=>retry(async()=>{
     tray.inert=true;try{const next=await call('answer',{id:run.id,round:run.round,actions:[...actions]});if(!next.id)throw Error();if(generation===stamp)play(next);}finally{tray.inert=false;}
    })));
   }
   if(!p.observe){controls();return;}
   async function show(){
    if(stamp!==generation)return;
    let state;try{state=await call('observe',{id:run.id,round:run.round});}catch{state={};}
    if(stamp!==generation)return;
    if(state.done){controls();return;}
    if(state.frame===undefined){scene.replaceChildren(button('Retry observation',show));return;}
    scene.replaceChildren();
    if(p.grid){
     scene.className='champ-grid';
     for(let j=0;j<p.tiles.length;j++){
      const tile=node('span',p.hidden?state.frame[j]:String(j+1));
      if(!p.hidden&&String(j+1)===state.frame)tile.className='champ-lit';
      scene.append(tile);
     }
    }else if(p.moving){
     scene.className='champ-cross';const coin=node('span',state.frame);scene.append(coin);
     coin.animate([{transform:'translateX(-32%)'},{transform:'translateX(32%)'}],state.wait);
    }else scene.textContent=Array.isArray(state.frame)?state.frame.join(' '):state.frame;
    setTimeout(()=>{scene.replaceChildren();void show();},state.wait);
   }
   void show();
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
