'use strict';
// Check the real moving AI Blue movement code rather than a reimplementation.
// Hard used to snap +/-9.4 px each frame as its target changed, producing
// a vibrating blob. All three levels now ease toward the target and stop.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const begin=html.indexOf('function move(p,dir,jump,dt){');
const end=html.indexOf('// Choose an actual ball trajectory',begin);
assert(begin>=0&&end>begin,'Production movement function not found');
const source=html.slice(begin,end);
assert(source.includes("p===blue&&localMode==='ai'"),
 'Smoothing must apply ONLY to AI Blue, not human controls');
assert(source.includes('distance*.52')&&source.includes('Math.abs(p.vx*dt)>Math.abs(distance)'),
 'AI needs proportional braking and anti-overshoot logic');
assert(html.includes('blue.aiMoveTarget+= (clampBlue(aim)-blue.aiMoveTarget)*targetBlend;'),
 'Predicted CPU interception targets must be smoothed');
assert(html.includes("difficulty==='hard'?.66:difficulty==='normal'?.54:.43"),
 'Each AI level should have responsive but naturally eased steering');
const labelCSS=html.slice(html.indexOf('#stage .hud #difficultyHud{'),
 html.indexOf('#stage .hud .hud-announcement{'));
assert(labelCSS.includes('background:transparent!important')&&
 labelCSS.includes('border:0!important')&&labelCSS.includes('box-shadow:none!important')&&
 labelCSS.includes('padding:0!important'),
 'Top-left Easy / Normal / Hard must appear with no background box or border');

function setup(level){
 const rates={easy:.43,normal:.54,hard:.66};
 const speeds={easy:4.2,normal:6.7,hard:9.4};
 const blue={x:600,y:430,vx:0,vy:0,jelly:0,jellyV:0,movePhase:0,r:49.45,hitCooldown:0,
  aiSmoothRate:rates[level],aiMoveTarget:720,cpuSpeed:speeds[level]};
 const red={x:195,y:430,vx:0,vy:0,jelly:0,jellyV:0,movePhase:0,r:49.45,hitCooldown:0};
 const ctx={W:800,netX:400,netHalf:7,ground:430,localMode:'ai',red,blue,
  slideTargetX:null,playTone(){},updateMovementVisual(){},
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v))};
 vm.createContext(ctx);
 vm.runInContext(source,ctx,{timeout:1000});
 return {ctx,blue,maxSpeed:speeds[level]};
}
for(const level of ['easy','normal','hard']){
 const {ctx,blue,maxSpeed}=setup(level);
 const xs=[],vel=[];
 for(let frame=0;frame<100;frame++){
  vm.runInContext('move(blue,1,false,1)',ctx);
  xs.push(blue.x);vel.push(blue.vx);
 }
 assert(vel[0]>0&&vel[0]<maxSpeed,
  level+': start with eased acceleration instead of full-speed teleport');
 assert(Math.max(...vel)<=maxSpeed+.01,
  level+': easing must preserve legitimate speed limit');
 assert(Math.max(...xs)<=720+.01,
  level+': Blue must brake before overshooting its target');
 assert(Math.abs(blue.x-720)<1.6&&Math.abs(blue.vx)<1.5,
  level+': Blue should settle naturally at a stable target');
 assert(xs.every((x,i)=>i===0||x>=xs[i-1]-.02),
  level+': Blue must not shake back and forth around a fixed target');
 // Small new forecast corrections must not cause full-speed vibration.
 blue.x=720;blue.vx=0;
 const positions=[];
 for(let i=0;i<80;i++){
  blue.aiMoveTarget=720+(i%2===0?3:-3);
  vm.runInContext('move(blue,0,false,1)',ctx);
  positions.push(blue.x);
 }
 assert(Math.max(...positions)-Math.min(...positions)<6,
  level+': rapidly alternating +/-3 px forecasts must not visibly shake the blob');
 assert(Math.max(...positions.map((p,i)=>i?Math.abs(p-positions[i-1]):0))<4,
  level+': small tracking corrections cannot snap at maximum speed');
}
const easy=setup('easy'),normal=setup('normal'),hard=setup('hard');
for(const p of [easy,normal,hard])for(let i=0;i<5;i++)
 vm.runInContext('move(blue,1,false,1)',p.ctx);
assert(hard.blue.x>normal.blue.x+4&&normal.blue.x>easy.blue.x+4,
 'Hard must still travel faster than Normal, and Normal faster than Easy');
// Human guest Blue stays on its established network-controlled path.
const guest=setup('hard');
guest.ctx.localMode='host';
guest.blue.x=600;guest.blue.vx=0;guest.blue.cpuSpeed=6.6;
vm.runInContext('move(blue,1,false,1)',guest.ctx);
assert(Math.abs(guest.blue.vx-6.6)<.001,
 'Human Blue movement in local Wi-Fi mode must remain unchanged');
console.log('Blue AI acceleration, smooth braking, no micro-oscillation, level differences, Wi-Fi human controls, and borderless label passed.');
