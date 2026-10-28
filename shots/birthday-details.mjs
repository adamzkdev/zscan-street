import puppeteer from 'puppeteer-core';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const film=process.argv.includes('--film');
const out=resolve('../../video/public/birthday');
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal'],protocolTimeout:180000,defaultViewport:{width:1440,height:810}});
try{
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3017/?debug&capture&theme=night',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.capture && window.street && !document.getElementById('boot'),{timeout:120000});
 await page.evaluate(()=>{capture.rain(false);capture.ui(false);});
 async function take(name,setCamera){
  const dir=resolve(out,'frames',name);mkdirSync(dir,{recursive:true});
  const total=film?180:1;
  if(!film){await setCamera(0);for(let i=0;i<12;i++){await page.evaluate(()=>capture.step(1/30));await new Promise(r=>setTimeout(r,20));}}
  for(let f=0;f<total;f++){
   await setCamera(f/Math.max(1,total-1));
   await page.evaluate(()=>capture.step(1/30));
   await page.screenshot({path:film?`${dir}/${String(f).padStart(4,'0')}.jpg`:`${out}/${name}.jpg`,type:'jpeg',quality:93});
   if(f%60===0)console.log(name,f,total);
  }
  if(film)execFileSync('ffmpeg',['-y','-loglevel','error','-framerate','30','-i',`${dir}/%04d.jpg`,'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',`${out}/${name}.mp4`]);
 }
 await take('blimp',async k=>page.evaluate(k=>{
  const b=street.sky.blimp.group;b.updateWorldMatrix(true,true);
  const v=(x,y,z)=>b.localToWorld(b.position.clone().set(x,y,z)).toArray();
  capture.shot({pos:v(14-8*k,7,48-4*k),look:v(0,-.4,0),fov:48,far:1000});
 },k));
 await page.evaluate(()=>{capture.shot({pos:[80,95,145],look:[45,36,-22],fov:60,far:1000});street.nu7.party(12);for(let i=0;i<50;i++)capture.step(1/30);});
 await take('fireworks',async k=>page.evaluate(k=>capture.shot({pos:[80-15*k,95,145-5*k],look:[45,36,-22],fov:60,far:1000}),k));
 console.log('fireworks',await page.evaluate(()=>{
  let alive=0,min=Infinity,max=-Infinity;
  for(let i=0;i<street.nu7.life.length;i++)if(street.nu7.life[i]>0){alive++;const y=street.nu7.pos[i*3+1];min=Math.min(min,y);max=Math.max(max,y);}
  return{alive,minY:min,maxY:max};
 }));
 // Let the real residents' images arrive before choosing someone to frame.
 for(let i=0;i<40;i++){await page.evaluate(()=>capture.step(1/30));await new Promise(r=>setTimeout(r,100));}
 const chosen=await page.evaluate(()=>{
  const actors=[...street.director.snarks].filter(s=>s.root.visible && s.root.parent && ['resident','waiting'].includes(s.state));
  actors.sort((a,b)=>a.root.position.distanceToSquared(a.root.position.clone().set(0,0,19))-b.root.position.distanceToSquared(b.root.position.clone().set(0,0,19)));
  const s=actors[0];if(!s)return null;
  window.__birthdayActor=s;
  street.chatter.update(4.1,s.root.position);
  return{id:s.id,at:s.root.position.toArray(),count:actors.length};
 });
 console.log('resident',chosen);
 if(chosen){
  await page.evaluate(()=>window.__birthdayActor.say('Happy 10 years, Zcash!',12,'shout'));
  await take('greeting',async k=>page.evaluate(k=>{
   const s=window.__birthdayActor,p=s.root.position;
   capture.shot({pos:[p.x+4-k,p.y+2.8,p.z+6],look:[p.x,p.y+1.35,p.z],fov:42,far:400});
  },k));
 }
 console.log('pageErrors',errors);
}finally{await browser.close();}
