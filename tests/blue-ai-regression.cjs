'use strict';
// Execute production move/collision/net/CPU tick code, not an imitation
// of its behavior. Scenarios reproduce the low/near-net misses in the
// Nov 24 iPhone recording (Red scored 15:0).
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync('index.html','utf8');
const begin=page.indexOf('function move(p,dir,jump,dt){');
const end=page.indexOf('/* Cached',begin);
assert(begin>=0&&end>begin,'Real game movement and CPU tick not found');
const production=page.slice(begin,end);
function scenario({x,y,vx,vy,blueX=605,frames=25,learned=0}){
 const red={x:195,y:430,vx:0,vy:0,r:49.45,hitCooldown:0,jelly:0,jellyV:0,movePhase:0,score:0};
 const blue={x:blueX,y:430,vx:0,vy:0,r:49.45,hitCooldown:0,jelly:0,jellyV:0,movePhase:0,score:0};
 const ball={x,y,vx,vy,r:36};
 const ctx={
  W:800,netX:400,ground:430,netTop:262,netHalf:7,
  red,blue,ball,frame:0,rallyTicks:0,touchLock:0,slideTargetX:null,
  pressed:{jump:false},awaitServe:false,server:'red',serveDelay:0,
  cpuJumpCooldown:0,cpuJumpArmed:true,cpuJumpPlan:null,
  cpuAttempt:null,cpuHadTouch:false,
  touchFault:null,lastTouch:null,lastVolleySide:null,consecutiveTouches:0,
  learning:{positionBias:learned,jumpBias:0},
  clamp:(x,a,b)=>Math.max(a,Math.min(b,x)),
  $:id=>id==='difficulty'?{value:'normal'}:{textContent:''},
  updateMovementVisual:()=>{},playTone:()=>{},sandSound:()=>{},serveReset:()=>{},
  score:side=>{ctx.scoreResult=side},scoreResult:null
 };
 vm.createContext(ctx);
 vm.runInContext(production,ctx,{timeout:1000});
 const trace=[];
 for(let i=0;i<frames;i++){
  vm.runInContext('tick(1)',ctx,{timeout:1000});
  trace.push({tick:i+1,ballX:ball.x,ballY:ball.y,blueX:blue.x,blueY:blue.y,
   jumped:blue.y<429.9,contact:ctx.cpuHadTouch,score:ctx.scoreResult});
  if(ctx.cpuHadTouch||ctx.scoreResult)break;
 }
 return {ctx,trace};
}
const lowNet=scenario({x:465,y:282,vx:3,vy:3,blueX:605,frames:25});
assert(lowNet.ctx.cpuHadTouch,
 'Blue must intercept a reachable low incoming ball near the net (recorded failure)');
assert(lowNet.trace.every(row=>row.blueY>=429.9),
 'Blue must stay grounded instead of jumping above the low near-net ball');
assert(!lowNet.ctx.scoreResult,'Low near-net interception must occur before Red scores');

const shortShot=scenario({x:490,y:312,vx:1,vy:2,blueX:530,frames:16,learned:22});
assert(shortShot.ctx.cpuHadTouch,
 'Learned angle bias must not stop a grounded near-net interception');
assert(shortShot.trace.every(row=>row.blueY>=429.9),
 'No early jump is allowed for an already low ball');

const approaching=scenario({x:300,y:185,vx:5,vy:0,blueX:650,frames:8});
assert(approaching.trace.every(row=>row.blueY>=429.9),
 'Blue must not jump while the shot is still far inside Red court');
assert(approaching.trace.at(-1).blueX<650,
 'Blue must proactively move from far right to guard the net');

const high=scenario({x:470,y:160,vx:2,vy:-3,blueX:510,frames:22});
assert(high.trace.some(row=>row.jumped)||high.ctx.cpuHadTouch,
 'Blue must offer an airborne defense against a high, reachable shot');
assert(high.trace.filter(row=>row.blueY<429.9).length<=22,
 'Blue should not initiate an uncontrollable jump loop');

assert(page.includes('bottom:max(34px,env(safe-area-inset-bottom,0px))'),
 'iPhone controls must still avoid the Home indicator');
console.log('Video-based Blue defense tests passed: near-net, low shot, learned bias, early-jump guard, and high ball.');
