import puppeteer from 'puppeteer-core';
import {mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
const out=resolve(process.env.BIRTHDAY_ASSETS ?? '../../video/public/birthday');
const frames=process.argv.includes('--film');
mkdirSync(out,{recursive:true});
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,protocolTimeout:180000,args:['--use-angle=metal'],defaultViewport:{width:1440,height:810,deviceScaleFactor:1}});
try {
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3017/?debug&capture&theme=night',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.capture && window.street && !document.getElementById('boot'),{timeout:120000});
 await page.evaluate(()=>{capture.rain(false);capture.ui(false);});
 console.log('landmarks',await page.evaluate(()=>[...street.city.landmarks.keys()]));
 const takes=[
  {name:'square',a:[19,26,39],b:[12,24,36],look:[0,7,18],fov:46},
  {name:'avenue',a:[26,20,46],b:[15,17,36],look:[-7,7,-6],fov:54},
  {name:'towers',a:[170,95,130],b:[148,90,123],look:[104,54,-32],fov:48},
  {name:'skyline',a:[340,250,330],b:[290,215,300],look:[20,12,-15],fov:49},
 ];
 for(const take of takes){
  const n=frames?180:1;const dir=resolve(out,'frames',take.name);mkdirSync(dir,{recursive:true});
  await page.evaluate(()=>street.nu7.party(30));
  for(let f=0;f<n;f++){
   const t=frames?f/(n-1):0;
   const pos=take.a.map((v,i)=>v+(take.b[i]-v)*t);
   await page.evaluate(s=>{capture.shot(s);capture.step(1/30);},{pos,look:take.look,fov:take.fov,far:1000});
   const path=frames?`${dir}/${String(f).padStart(4,'0')}.jpg`:`${out}/${take.name}.jpg`;
   await page.screenshot({path,type:'jpeg',quality:92});
   if(frames&&f%60===0)console.log(take.name,f,n);
  }
  if(frames)execFileSync('ffmpeg',['-y','-loglevel','error','-framerate','30','-i',`${dir}/%04d.jpg`,'-c:v','libx264','-crf','18','-pix_fmt','yuv420p','-movflags','+faststart',`${out}/${take.name}.mp4`]);
  console.log('finished',take.name);
 }
 console.log('pageErrors',errors);
}finally{await browser.close();}
