'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync('index.html','utf8');
const begin=page.indexOf('function chooseBlueReturn(x,y){');
const end=page.indexOf('function tick(dt){',begin);
assert(begin>=0&&end>begin,'CPU shot planning and actual physics must be present');
const ctx={
  W:800,netX:400,netHalf:7,netTop:262,ground:430,
  ball:{x:600,y:345,vx:0,vy:0,r:36},
  red:{x:195,y:430,vy:0,vx:0,r:49.45,hitCooldown:0,jellyV:0},
  blue:{x:600,y:430,vy:0,vx:0,r:49.45,hitCooldown:0,jellyV:0},
  lastTouch:null,touchLock:0,lastVolleySide:null,consecutiveTouches:0,touchFault:null,
  awaitServe:false,rallyTicks:0,cpuHadTouch:false,cpuJumpPlan:null,
  playTone:()=>{},$:()=>({textContent:''})
};
vm.createContext(ctx);
vm.runInContext(page.slice(begin,end),ctx,{timeout:1000});
function shotCheck(x,y){
  ctx.testShot={x,y};
  const shot=vm.runInContext('chooseBlueReturn(testShot.x,testShot.y)',ctx,{timeout:2000});
  assert(shot,'Blue must have a playable return for x='+x+', y='+y);
  assert(shot.vx<0&&shot.vx>=-10.7,'Blue aims left within real velocity caps');
  assert(shot.vy<0&&shot.vy>=-15,'Return has legal vertical speed');
  ctx.trajectory={x,y,vx:shot.vx,vy:shot.vy,r:36};
  let crossed=false,landing=null;
  for(let i=0;i<110;i++){
   vm.runInContext('advanceBall(trajectory,1)',ctx,{timeout:1000});
   if(ctx.trajectory.x<400-7-36-4&&ctx.trajectory.y<262-36-5)crossed=true;
   if(ctx.trajectory.y+ctx.trajectory.r>=430){landing=ctx.trajectory.x;break}
  }
  assert(crossed,'Return must pass ABOVE the net to the left');
  assert(landing!==null&&landing<400-36,'Return must land on Red court');
}
shotCheck(600,345); // normal middle-court defense
shotCheck(485,345); // near-net return rather than upward juggling
shotCheck(690,355); // far-right recovery

ctx.ball={x:575,y:328,vx:0,vy:5,r:36};
vm.runInContext('collide(blue)',ctx,{timeout:2000});
assert(ctx.cpuHadTouch,'Blue must make a genuine contact');
assert(ctx.ball.vx<0,'Blue first legal contact aims toward Red');
assert(ctx.ball.vy<0,'Blue first legal contact has a rising trajectory');
assert(ctx.consecutiveTouches===1,'First touch still counts against Blue');

assert(page.includes("playPointEndSound(side);"),'Each completed point has its own sound');
assert(page.includes("playRefereeWhistle('start');"),'Match opening whistle required');
assert(page.includes("playRefereeWhistle('end');"),'Match closing whistle required');
assert(page.includes("if(!sound)return;"),'Mute setting must apply to all effects');
assert(page.includes("blue.x=(netX+W)*.5"),'Blue still starts in center of its half');
console.log('Blue return planning crosses net from near, middle and far right; whistle/point cues verified.');
