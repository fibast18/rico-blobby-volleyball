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
function simulateServe(mode='normal',width=800){
 const courtNet=width/2;
 const red={x:width*.245,y:430,vx:0,vy:0,r:49.45,jelly:0,jellyV:0,movePhase:0,hitCooldown:0,score:0};
 const blue={x:(courtNet+width)*.5,y:430,vx:0,vy:0,r:49.45,jelly:0,jellyV:0,movePhase:0,hitCooldown:0,score:1};
 const ball={x:blue.x,y:260,vx:0,vy:0,r:36};
 const s={localMode:'ai',W:width,netX:courtNet,netHalf:7,netTop:262,ground:430,red,blue,ball,
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
 s.firstServeContact=()=>{};
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
 for(const width of [800,1085]){
  const {s,hitAt,firstJump}=simulateServe(mode,width);
  assert(hitAt!==null,
   mode+' at '+width+'px: Blue must not get stuck at its stationary serve. First jump: '+firstJump+
   ', Blue x:'+s.blue.x.toFixed(1)+' y:'+s.blue.y.toFixed(1));
  assert(hitAt<140,mode+': Auto-serve should occur within a reasonable period');
  assert(s.ball.vx<0,mode+': Ball must launch toward Red based on physical left shoulder contact');
 }
}
// Replay the identical incoming volley on each level, using production
// trajectory prediction and movement. Hard must demonstrably move sooner.
function defend(mode,frames=5){
 const red={x:195,y:430,vx:0,vy:0,r:49.45,jelly:0,jellyV:0,movePhase:0,hitCooldown:0,score:0};
 const blue={x:670,y:430,vx:0,vy:0,r:49.45,jelly:0,jellyV:0,movePhase:0,hitCooldown:0,score:0};
 const ball={x:420,y:190,vx:5,vy:1,r:36};
 const s={localMode:'ai',W:800,netX:400,netHalf:7,netTop:262,ground:430,red,blue,ball,
  frame:0,rallyTicks:0,touchLock:0,pressed:{jump:false},slideTargetX:null,
  awaitServe:false,server:'red',serveDelay:0,
  cpuJumpCooldown:0,cpuJumpArmed:true,cpuJumpPlan:null,
  lastTouch:null,lastVolleySide:null,consecutiveTouches:0,touchFault:null,
  cpuAttempt:null,cpuHadTouch:false,
  learning:{positionBias:0,jumpBias:0},clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),
  $:id=>id==='difficulty'?{value:mode}:{textContent:''},
  updateMovementVisual:()=>{},playTone:()=>{},sandSound:()=>{},score:()=>{},serveReset:()=>{}
 };
 s.firstServeContact=()=>{};
 vm.createContext(s);vm.runInContext(source,s,{timeout:1000});
 for(let i=0;i<frames;i++)vm.runInContext('tick(1)',s,{timeout:1000});
 const moved=670-s.blue.x;
 const priorAim=s.blue.aiAim;
 // Change the incoming trajectory abruptly: quick AI should update its target.
 s.ball={x:735,y:190,vx:0,vy:2,r:36};
 for(let i=0;i<2;i++)vm.runInContext('tick(1)',s,{timeout:1000});
 return {moved,priorAim,newAim:s.blue.aiAim,reactionLeft:s.blue.aiDelay,speed:s.blue.cpuSpeed};
}
const easy=defend('easy'),normal=defend('normal'),hard=defend('hard');
assert(easy.speed<normal.speed&&normal.speed<hard.speed,
 'Difficulty must change actual CPU running speed');
assert(easy.moved+4<normal.moved&&normal.moved+4<hard.moved,
 'Hard must cover more court than Normal, and Normal more than Easy');
assert(easy.newAim===easy.priorAim,
 'Easy should retain a stale interception for noticeable reaction delay');
assert(hard.newAim!==hard.priorAim,
 'Hard must rapidly react to a different incoming ball position');
assert(html.includes('id="difficultyDescription"')&&
 html.includes('Hard • fast movement, quick reactions, precise interception'),
 'Each difficulty should explain the actual gameplay differences in Settings');
console.log('Blue auto-serves on all difficulties and screen sizes; levels change real speed and reaction.');
