// Render the same server-issued result as a portable image. The Telegram link
// reopens the interactive card, including its Rematch action.
window.JigRaceCard = (() => {
  function imageFrom(src) {
    return new Promise((resolve,reject)=>{
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error('Coin art unavailable'));
      image.src = src;
    });
  }

  async function coinImage(key) {
    if (Object.hasOwn(MINT_FINISHES,key) && MINT_FINISHES[key].art) return imageFrom(MINT_FINISHES[key].art);
    if (!key) return null;
    const box = document.createElement('div');
    box.innerHTML = mintFinishArtwork(key);
    const svg = box.querySelector('svg');
    if (!svg) return null;
    svg.setAttribute('xmlns','http://www.w3.org/2000/svg');
    svg.setAttribute('width','240');
    svg.setAttribute('height','240');
    return imageFrom('data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg.outerHTML));
  }

  function text(ctx,value,x,y,color,size,maxWidth,face='system-ui',weight=600) {
    ctx.fillStyle=color;
    ctx.font=weight+' '+size+'px '+face;
    ctx.fillText(String(value),x,y,maxWidth);
  }

  async function render(card,date) {
    const canvas=document.createElement('canvas');
    canvas.width=880;canvas.height=540;
    const ctx=canvas.getContext('2d');
    const photos=await Promise.all(card.players.map(p=>coinImage(p.finish)));
    const fill=ctx.createLinearGradient(0,0,880,540);
    fill.addColorStop(0,'#303332');fill.addColorStop(.6,'#17232d');fill.addColorStop(1,'#101820');
    ctx.fillStyle=fill;ctx.fillRect(0,0,880,540);
    ctx.strokeStyle='#b39660';ctx.lineWidth=2;ctx.strokeRect(14,14,852,512);
    text(ctx,'JIGCOIN  /  FRIEND RACE',42,58,'#e8c78b',21,460);
    ctx.textAlign='right';text(ctx,date,838,58,'#c5cbd1',20,310);
    ctx.textAlign='center';
    const winner=card.players[0];
    const title=card.margin ? winner.name+' wins by '+card.margin+' '+(card.margin===1?'pair':'pairs') : 'Draw · '+winner.score+' each';
    text(ctx,title,440,126,'#fff0d8',46,786,'Georgia');
    ctx.strokeStyle='#43505a';ctx.beginPath();ctx.moveTo(440,160);ctx.lineTo(440,500);ctx.stroke();
    card.players.forEach((p,i)=>{
      const x=i===0?228:652;
      ctx.save();ctx.beginPath();ctx.arc(x,248,77,0,Math.PI*2);ctx.clip();
      if(photos[i]) ctx.drawImage(photos[i],x-77,171,154,154);
      else {ctx.fillStyle='#45525d';ctx.fillRect(x-77,171,154,154);text(ctx,'J',x,273,'#e2e9ef',72,120,'Georgia');}
      ctx.restore();
      text(ctx,p.name,x,365,'#f4f3ef',31,360);
      text(ctx,mintFinishName(p.finish),x,398,'#c4d0d8',23,354);
      text(ctx,p.score+' '+(p.score===1?'pair':'pairs'),x,453,'#f1ce8a',37,350);
      text(ctx,'Run '+p.slot,x,489,'#c4d0d8',19,320);
    });
    return new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('Image unavailable')),'image/png'));
  }
  return {render};
})();
