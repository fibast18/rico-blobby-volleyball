'use strict';
// Execute the REAL game physics and tick code for a CPU serve.
// The Nov 24 23:00 iPhone recording shows a stuck 0:1 score and a
// suspended Blue serve while the match clock continues.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const start=html.indexOf('function move(p,dir,jump,dt){');
const end=html.indexOf('/* Cached',start);
assert(start>=0&&end>start,'Actual game physics and CPU tick must exist');
const source=html.slice(start,end);
function simulateServe(mode='normal'){
 const red={x:195,y:430,vx:0,vy:0,r:49.45,jelly:0,jellyV:0,movePhase:0,hitCooldown:0,score:0};
 const blue={x:600,y:430,vx:0,vy:0,r:49.45,jelly:0,jellyV:0,movePhase:0,hitCooldown:0,score:1};
 const ball={x:600,y:260,vx:0,vy:0,r:36};
 const s={W:800,netX:400,netHalf:7,netTop:262,ground:430,red,blue,ball,
  frame:0,rallyTicks:0,touchLock:0,pressed:{jump:false},slideTargetX:null,
  awaitServe:true,server:'blue',serveDelay:0,
  cpuJumpCooldown:0,cpuJumpArmed:true,cpuJumpPlan:null,
  lastTouch:null,lastVolleySide:null,consecutiveTouches:0,touchFault:null,
  cpuAttempt:null,cpuHadTouch:false,
  learning:{positionBias:0,jumpBias:0},clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),
  $:id=>id==='difficulty'?{value:mode}:{textContent:''},
  updateMovementVisual:()=>{},playTone:()=>{},sandSound:()=>{},
  score:()=>{},serveReset:()=>{},
 };
 vm.createContext(s);vm.runInContext(source,s,{timeout:1000});
 let hitAt=null,firstJump=null;
 for(let i=0;i<180;i++){
  vm.runInContext('tick(1)',s,{timeout:1000});
  if(blue.y<429.9&&firstJump===null)firstJump=i+1;
  if(!s.awaitServe){hitAt=i+1;break}
 }
 return {s,hitAt,firstJump};
}
for(const mode of ['easy','normal','hard']){
 const {s,hitAt,firstJump}=simulateServe(mode);
 assert(hitAt!==null,
  mode+': Blue must not get stuck at its stationary serve. First jump: '+firstJump+
  ', Blue x:'+s.blue.x.toFixed(1)+' y:'+s.blue.y.toFixed(1));
 assert(hitAt<140,mode+': Auto-serve should occur within a reasonable period');
 assert(s.ball.vx<0,mode+': Ball must launch toward Red based on physical left shoulder contact');
}
console.log('CPU serves within limited frames on Easy, Normal and Hard.');
