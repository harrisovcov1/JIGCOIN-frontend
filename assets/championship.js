'use strict';
window.JigChampionship = (() => {
 let dialog, timer, generation=0;
 const node=(tag,text)=>{const e=document.createElement(tag);if(text!==undefined)e.textContent=text;return e;};

 // Entry state is presentation-only, scoped to the current signed account.
 // Unknown/network errors must never be interpreted as legacy permission.
 let entry={owner:null,mode:'unknown',result:null,checked:0},entryPending=null;
 function classifyEntry(s){
  if(!s || s.ok===false)return 'unknown';
  if(s.active===true && typeof s.name==='string' && s.name.length>0 &&
   Number.isInteger(s.remaining?.ranked)&&s.remaining.ranked>=0&&s.remaining.ranked<=3&&
   Number.isInteger(s.remaining?.practice)&&s.remaining.practice>=0&&s.remaining.practice<=1)return 'active';
  if(s.active===false)return Array.isArray(s.ownerPractice?.variants)&&s.ownerPractice.variants.length===30?'preview':'legacy';
  return 'unknown';
 }
 function currentOwner(){return typeof accountIsReady==='function'&&accountIsReady()?homeUserId():null;}
 function entryMode(){return entry.owner!==null&&entry.owner===currentOwner()?entry.mode:'unknown';}
 function entryLabel(compact=false){
  const mode=entryMode();
  return mode==='active'?(compact?'Championship':'Weekly Championship'):mode==='preview'?'Owner practice':mode==='legacy'?(compact?'Weekly race':'Weekly Race'):(compact?'Weekly play':'Weekly competition');
 }
 function renderEntry(){
  const mode=entryMode(),title=entryLabel(),result=entry.result;
  const set=(id,value)=>{const el=document.getElementById(id);if(el&&el.textContent!==value)el.textContent=value;};
  set('rewardsWeeklyTitle',title);
  const invite=document.getElementById('inviteWeeklyRace');
  if(invite?.firstChild?.nodeType===3)invite.firstChild.nodeValue=title+' ';
  set('lbWeeklyEntry',title);
  const home=document.getElementById('homeBoostAction');
  if(home?.dataset.focus==='weekly'){
   home.textContent=entryLabel(true);home.ariaLabel='Open '+title;home.title=home.ariaLabel;
  }
  if(mode==='active'){
   set('rewardsWeeklyStatus',result.name+' · '+result.remaining.ranked+'/3 ranked left');
   set('rewardsWeeklyAction','View podium & play ›');
  }else if(mode==='preview'){
   set('rewardsWeeklyStatus','Practice only · no awards');
   set('rewardsWeeklyAction','Open owner practice ›');
  }else if(mode==='unknown'){
   set('rewardsWeeklyStatus','Competition status unavailable');
   set('rewardsWeeklyAction','Check again ›');
  }else{
   set('rewardsWeeklyStatus','Free ranked runs · 45s each');
   set('rewardsWeeklyAction','Check Weekly Race ›');
  }
 }
 async function refreshEntry(post,force=false){
  const owner=currentOwner();
  if(owner===null){entry={owner:null,mode:'unknown',result:null,checked:0};renderEntry();return 'unknown';}
  if(entry.owner!==owner)entry={owner,mode:'unknown',result:null,checked:0};
  if(!force&&Date.now()-entry.checked<15000){renderEntry();return entryMode();}
  if(entryPending?.owner===owner)return entryPending.promise;
  const request={owner,promise:null};entryPending=request;
  request.promise=(async()=>{
   let result;try{result=await post('/api/championship/status',{}, {tapOwner:owner,timeoutMs:9000,fastAuth:true,silent:true});}catch(_){}
   if(currentOwner()!==owner||entryPending!==request)return 'unknown';
   entry={owner,mode:classifyEntry(result),result,checked:Date.now()};renderEntry();return entry.mode;
  })().finally(()=>{if(entryPending===request)entryPending=null;});
  return request.promise;
 }
 const refresh=()=>{if(!document.hidden&&typeof apiPost==='function')void refreshEntry(apiPost);};
 window.addEventListener('jigcoin:account-ready',refresh);
 document.addEventListener('visibilitychange',refresh);
 // Cover a session which became ready before this deferred script ran.
 setTimeout(refresh,0);
 setInterval(refresh,30000);

 function button(title,fn){const b=node('button',title);b.type='button';b.onclick=fn;return b;}
 async function open(post){
  let preview = false;
  const call = (route, body = {}) => {
    const prefix = preview && route !== 'status' ? 'owner-practice/' : '';
    return post('/api/championship/' + prefix + route, body);
  };
  const opener=document.activeElement;
  const mode=await refreshEntry(post,true);
  if(mode==='legacy')return false;
  if(mode==='unknown'){if(typeof showToast==='function')showToast('Competition status unavailable. Please try again.');return true;}
  let status=entry.result;
  preview=mode==='preview';
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
  async function reload(){
   status=await call('status',{scope});
   if(preview && status?.ownerPractice){practiceMenu();return;}
   if(!status?.active)throw Error();
   preview=false;lobby();
  }
  function practiceMenu(){
   generation++;clearInterval(timer);main.replaceChildren();heading('Owner practice');
   main.append(node('p','Explore all 30 Championship challenges. Practice scores stay out of standings and earn no coins or medals.'));
   const {variants,run}=status.ownerPractice;
   const label=node('label','Challenge'),select=node('select'),instructions=node('p');
   select.id='ownerPracticeChallenge';label.htmlFor=select.id;
   for(const item of variants){
    const option=node('option',item.name);option.value=String(item.id);select.append(option);
   }
   select.value=String(run?.variant ?? variants[0].id);
   const update=()=>{instructions.textContent=variants.find(v=>v.id===Number(select.value))?.instructions||'';};
   select.onchange=update;update();main.append(label,select,instructions);
   const message=node('p');message.setAttribute('role','status');
   let request=crypto.randomUUID();
   select.addEventListener('change',()=>{request=crypto.randomUUID();});
   async function launch(route,body){
    main.inert=true;
    try{
     const result=await call(route,body);
     if(result?.id){play(result);return;}
     if(result?.reason==='REOPEN_PRACTICE'){await reload();return;}
     message.textContent='Practice could not open. Try again.';
    }finally{main.inert=false;}
   }
   if(run && !run.finished)main.append(button('Resume '+variants.find(v=>v.id===run.variant).name,()=>retry(()=>launch('resume',{id:run.id}))));
   main.append(button(run && !run.finished?'Replace current practice':'Start practice',()=>retry(()=>launch('start',{
    mode:'practice',variant:Number(select.value),previous:run?.id??null,request
   }))),message);
   const rules=node('details');
   rules.append(node('summary','Official championship prizes and rules'),
    node('p','Gold 100,000 · Silver 50,000 · Bronze 25,000 game coins. Only the global podium awards prizes.'),
    node('p','One practice and three ranked runs per UTC day. Your best six daily scores count each week. The first ranked week begins on the first full Monday after activation.'));
   main.append(rules);
  }
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
   if(run.finished){heading('Result · '+run.score+' / 1,000');main.append(button(preview?'Choose another challenge':'View standings',()=>retry(reload)));return;}
   if(preview)main.append(button('Back to challenges',()=>retry(reload)));
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
  if(preview)practiceMenu();else lobby();return true;
 }
 return {open,refreshEntry,entryMode,entryLabel};
})();
document.getElementById('champTrophies')?.addEventListener('toggle',async function(){
 if(!this.open)return;
 const result=await apiPost('/api/championship/status',{});
 const awards=result.trophies || [];
 this.querySelector('p').textContent=result.ok===false?'Unable to check trophies. Reopen to retry.':
  awards.map(a=>['Gold','Silver','Bronze'][a.place-1]+' · Week of '+a.week+' · #'+a.place+' · '+a.score+' points · '+a.coins+' game coins').join('\n')||'No Weekly Championship trophies yet.';
});
