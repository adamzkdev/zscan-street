import puppeteer from 'puppeteer-core';
const browser=await puppeteer.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true,args:['--use-angle=metal'],defaultViewport:{width:1440,height:900}});
try{
 const page=await browser.newPage();const errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:3017/?debug&theme=night',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>window.street && [...street.nu7.life].some(x=>x>0),{timeout:120000});
 await new Promise(r=>setTimeout(r,700));
 await page.screenshot({path:'shots/birthday-live.png'});
 console.log(await page.evaluate(()=>{
  const n=street.nu7,c=street.rig.camera,v=street.rig.focus.clone();let alive=0,inFrame=0;
  for(let i=0;i<n.life.length;i++)if(n.life[i]>0){alive++;v.fromArray(n.pos,i*3).project(c);if(Math.abs(v.x)<1&&Math.abs(v.y)<1&&v.z>-1&&v.z<1)inFrame++;}
  return{automaticFireworks:true,alive,inFrame,trailDrawn:n.trails.visible};
 }),{pageErrors:errors});
}finally{await browser.close();}
