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
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const {Anniversary}=await import('/src/scene/anniversary.ts');
  const parties=[];
  const anniversary=new Anniversary(new THREE.Scene(), {party: seconds=>parties.push(seconds)});
  anniversary.update(1.5,true);
  anniversary.update(17,true);
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
 console.log('birthday integration', await page.evaluate(async()=>{
  const THREE=await import('/node_modules/.vite/deps/three.js');
  const {Anniversary}=await import('/src/scene/anniversary.ts');
  const {Chatter}=await import('/src/scene/chatter.ts');
  const {Nu7}=await import('/src/scene/nu7.ts');
  const full=new THREE.Group();
  const wall=new THREE.Mesh(new THREE.BoxGeometry(12,60,12),new THREE.MeshBasicMaterial());
  wall.position.y=30;full.add(wall);full.updateMatrixWorld(true);
  const box=new THREE.Box3().setFromObject(full);
  const occluder={full,box,extras:new THREE.Group()};
  const city={landmarks:new Map([['noir',{door:new THREE.Vector3(0,0,30),yaw:0,occluder}]]),facades:[],occluders:[occluder]};
  const anniversary=new Anniversary(new THREE.Scene(),{party(){}},city);
  const decals=anniversary.group.children.filter(o=>o.name==='Zcash birthday facade');
  if(decals.length!==2)throw Error('Missing projected banners');
  for(const decal of decals){
   const p=decal.geometry.getAttribute('position');
   for(let i=0;i<p.count;i++)if(Math.abs(Math.abs(p.getZ(i))-6)>.001)throw Error('Poster floats off wall');
  }
  const scene=new THREE.Group(),root=new THREE.Group();scene.add(root);
  const said=[];
  const actor={root,state:'resident',say:(...args)=>said.push(args)};
  const chatter=new Chatter({snarks:new Set([actor])},{landmarks:new Map()},scene);
  chatter.update(4.1,new THREE.Vector3());
  if(said[0]?.[0]!=='Happy 10 years, Zcash!')throw Error('Missing birthday greeting');
  chatter.update(4.1,new THREE.Vector3());
  if(said.length!==1)throw Error('Greeting cooldown failed');
  const roofBox=new THREE.Box3(new THREE.Vector3(-100,0,-100),new THREE.Vector3(100,80,100));
  const fireworks=new Nu7(new THREE.Scene(),{occluders:[{box:roofBox}],factory:null},{setLive(){}});
  fireworks.party(8);fireworks.update(.1,new THREE.Vector3());
  let sparks=0;
  for(let i=0;i<fireworks.life.length;i++)if(fireworks.life[i]>0){
   sparks++;if(fireworks.pos[i*3+1]<90)throw Error('Firework burst below roof');
  }
  if(!sparks)throw Error('No fireworks spawned');
  return {postersOnActualWalls:true,birthdayGreeting:true,greetingCooldown:true,fireworksAboveRoofs:true};
 }));

}finally{await browser.close();}
