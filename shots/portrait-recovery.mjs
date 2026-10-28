import puppeteer from 'puppeteer-core';
const origin = process.env.STREET_TEST_URL ?? 'http://127.0.0.1:3017';
const browser = await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal'],defaultViewport:{width:1440,height:960}});
try {
 const page=await browser.newPage();
 await page.setRequestInterception(true);
 page.on('request', request => new URL(request.url()).pathname === '/__portrait-test.html'
  ? request.respond({status:200,contentType:'text/html',body:'<!doctype html><html><body></body></html>'})
  : request.continue());
 await page.goto(`${origin}/__portrait-test.html`);
 console.log('portrait tests', await page.evaluate(async()=>{
  const NativeImage=window.Image, nativeTimeout=window.setTimeout;
  const calls={},active=new Set();let peak=0;
  window.setTimeout=(f,ms,...args)=>nativeTimeout(f,ms===25000?60:ms>=2000?1:ms,...args);
  class FakeImage {
   set src(url){this.url=url; calls[url]=(calls[url]||0)+1;active.add(this);peak=Math.max(peak,active.size);
    if(url==='hung') return;
    nativeTimeout(()=>{active.delete(this); if(url==='failure'||(url==='retry'&&calls[url]===1)) this.onerror?.();else this.onload?.();},10);
   }
   removeAttribute(){active.delete(this);}
  }
  window.Image=FakeImage;
  try {
   const {portraitImage}=await import('/src/data/portrait.ts');
   const a=portraitImage('retry'),b=portraitImage('retry');
   if(a!==b) throw Error('concurrent requests not deduplicated');
   await Promise.all([a,b,...Array.from({length:8},(_,i)=>portraitImage('ok'+i))]);
   if(calls.retry!==2||peak>3||active.size) throw Error('retry/queue failed '+JSON.stringify({calls,peak}));
   await portraitImage('failure').then(()=>{throw Error('expected rejection');},()=>{});
   const first=calls.failure;
   await portraitImage('failure').catch(()=>{});
   if(first!==5||calls.failure!==10)throw Error('failure cached or retries unbounded');
   await Promise.all([portraitImage('hung').catch(()=>{}),portraitImage('after-hung')]);
   if(calls.hung!==5||active.size)throw Error('timeout did not release slot');
   return {deduplicated:true,recovered:true,maxConcurrent:peak,retryAfterFailure:true,timeoutReleasesSlot:true};
  }finally{window.Image=NativeImage;window.setTimeout=nativeTimeout;}
 }));
 console.log('anniversary tests', await page.evaluate(async () => {
  const THREE=await import('/node_modules/three/build/three.module.js');
  const {Anniversary}=await import('/src/scene/anniversary.ts');
  const parties=[];
  const anniversary=new Anniversary(new THREE.Scene(), {party: seconds=>parties.push(seconds)});
  anniversary.update(8,true);
  anniversary.update(49,true);
  if(parties.length!==1) throw Error('firework interval');
  anniversary.update(1,true);
  anniversary.update(100,false);
  if(parties.length!==2 || anniversary.group.visible) throw Error('indoor pause');
  window.__birthday={anniversary,parties};
  return {balloonGroups:anniversary.group.children.length,periodicFireworks:true,pausedIndoors:true};
 }));
 await page.emulateMediaFeatures([{name:'prefers-reduced-motion',value:'reduce'}]);
 await page.evaluate(()=>{
  const {anniversary,parties}=window.__birthday;
  const before=parties.length, floating=anniversary.group.children.at(-1), rotation=floating.rotation.z;
  anniversary.update(100,true);
  if(parties.length!==before||floating.rotation.z!==rotation)throw Error('reduced motion');
 });
 console.log('reduced motion passed');
}finally{await browser.close();}
