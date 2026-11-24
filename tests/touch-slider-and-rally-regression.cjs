'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const between=(start,end)=>{
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert(a>=0&&b>a,'Missing production function: '+start);
  return html.slice(a,b);
};
assert(html.includes('id="movementPad" data-control="slide"'),'Full-left touch slider missing');
assert(!html.includes('data-control="left"')&&!html.includes('data-control="right"'),'Old direction buttons must be removed');
assert(html.includes('data-control="jump"'),'Independent right-half jump control missing');
assert(html.includes("movementPad.addEventListener('pointermove'"),'Dragging must update the slider');
assert(html.includes("jumpPad.addEventListener('pointerdown'"),'Jump must work simultaneously');
assert(html.includes('width:50%!important;height:100%!important'),'Slider must cover the left half of the court');
assert(html.includes('left:50%!important;right:0!important;top:0!important;bottom:0!important;'),'Jump must cover right half');

const sandbox={
 W:800,netX:400,netHalf:7,netTop:262,ground:430,
 red:{x:195,y:430,vx:0,vy:0,r:49.45,jelly:0,jellyV:0,movePhase:0,hitCooldown:0},
 blue:{x:605,y:430,vx:0,vy:0,r:49.45,jelly:0,jellyV:0,movePhase:0,hitCooldown:0},
 ball:{x:0,y:0,vx:0,vy:5,r:36},
 slideTargetX:null,slidePointerId:1,pressed:{jump:false},
 clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
 stage:{getBoundingClientRect:()=>({left:0,width:800})},
 $:()=>({setAttribute:()=>{},textContent:''}),
 updateMovementVisual:()=>{},playTone:()=>{},
 lastVolleySide:null,consecutiveTouches:0,touchFault:null,
 lastTouch:null,touchLock:0,awaitServe:false,rallyTicks:0,
 cpuHadTouch:false,cpuJumpPlan:null
};
vm.createContext(sandbox);
vm.runInContext(between('function updateMovementTarget(clientX){','function updateMovementVisual(){'),sandbox);
vm.runInContext(between('function move(p,dir,jump,dt){','function collide(p){'),sandbox);
vm.runInContext(between('function collide(p){','function tick(dt){'),sandbox);
vm.runInContext('updateMovementTarget(0)',sandbox);
assert(Math.abs(sandbox.slideTargetX-sandbox.red.r)<.01,'Left edge should map to legal Red left boundary');
vm.runInContext('updateMovementTarget(400)',sandbox);
assert(Math.abs(sandbox.slideTargetX-(sandbox.netX-sandbox.netHalf-sandbox.red.r))<.01,'Middle net boundary must map to Red right boundary');
vm.runInContext('updateMovementTarget(340)',sandbox);
for(let i=0;i<20;i++)vm.runInContext('move(red,1,false,1)',sandbox);
assert(sandbox.red.x>260,'Red must follow a rightward finger drag');
const rightX=sandbox.red.x;
vm.runInContext('updateMovementTarget(45)',sandbox);
for(let i=0;i<20;i++)vm.runInContext('move(red,-1,false,1)',sandbox);
assert(sandbox.red.x<rightX-50,'Red must follow a leftward finger drag');
vm.runInContext('updateMovementTarget(400)',sandbox);
for(let i=0;i<60;i++)vm.runInContext('move(red,1,false,1)',sandbox);
assert(sandbox.red.x<=sandbox.netX-sandbox.netHalf-sandbox.red.r+.001,'Red must never cross the net');
sandbox.slideTargetX=null;

function repeatedHit(p,dx){
  sandbox.lastTouch=null;sandbox.touchLock=0;
  p.hitCooldown=0;p.vx=0;p.vy=0;
  sandbox.ball.x=p.x+dx;
  sandbox.ball.y=p.y-p.r*1.05-50;
  sandbox.ball.vx=0;sandbox.ball.vy=5;
  return vm.runInContext(p===sandbox.blue?'collide(blue)':'collide(red)',sandbox);
}
for(let n=0;n<3;n++){
  assert(repeatedHit(sandbox.blue,-25),'Blue contact '+(n+1)+' should be allowed');
  assert(sandbox.ball.vx<0,'Blue left-side hit should rebound toward the left');
}
assert(!repeatedHit(sandbox.blue,-25),'Blue fourth contact must be a fault');
assert.equal(sandbox.touchFault,'blue','Fourth same-side touch should penalize Blue');
sandbox.lastVolleySide=null;sandbox.consecutiveTouches=0;sandbox.touchFault=null;
for(let n=0;n<3;n++)assert(repeatedHit(sandbox.red,25),'Red contact '+(n+1)+' should be allowed');
assert(!repeatedHit(sandbox.red,25),'Red fourth contact must be a fault');
assert.equal(sandbox.touchFault,'red','Three-touch rule must also apply to Red');
console.log('Full-left touch slider, finger tracking, fair angles and three-touch regression tests passed.');
