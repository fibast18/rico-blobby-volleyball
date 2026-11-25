'use strict';
// A real contact test: the SAME production collide() for Red and Blue.
// Different strike angles MUST produce different natural ball trajectories.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync('index.html','utf8');
const start=page.indexOf('function collide(p){');
const end=page.indexOf('function tick(dt){',start);
assert(start>=0&&end>start,'Real collision and net physics not found');
assert(!page.includes('chooseBlueReturn('),
 'Remove automatic target-directed Blue return: contact angle must matter');
const ctx={
 W:800,netX:400,netHalf:7,netTop:262,ground:430,localMode:'ai',
 ball:{x:0,y:0,vx:0,vy:0,r:36},
 red:{x:195,y:430,vy:0,vx:0,r:49.45,hitCooldown:0,jellyV:0},
 blue:{x:600,y:430,vy:0,vx:0,r:49.45,hitCooldown:0,jellyV:0},
 lastTouch:null,touchLock:0,lastVolleySide:null,consecutiveTouches:0,touchFault:null,
 awaitServe:false,rallyTicks:0,cpuHadTouch:false,cpuJumpPlan:null,
 playTone:()=>{},$:()=>({textContent:''})
};
vm.createContext(ctx);
vm.runInContext(page.slice(start,end),ctx,{timeout:1000});
function hit(player,impactX,impactY=-60){
 const blob=player==='red'?ctx.red:ctx.blue;
 blob.vx=0;blob.vy=0;blob.hitCooldown=0;
 ctx.lastTouch=null;ctx.touchLock=0;ctx.lastVolleySide=null;
 ctx.consecutiveTouches=0;ctx.cpuHadTouch=false;
 ctx.ball={x:blob.x+impactX,y:blob.y-blob.r*1.05+impactY,vx:0,vy:5,r:36};
 const ok=vm.runInContext('collide('+player+')',ctx,{timeout:1000});
 assert(ok,player+' must be able to receive a legitimate impact');
 return {vx:ctx.ball.vx,vy:ctx.ball.vy,x:ctx.ball.x,y:ctx.ball.y};
}
const left=hit('blue',-45),center=hit('blue',0),right=hit('blue',45);
assert(left.vx<-2,'Left shoulder impact should send ball toward Red court');
assert(Math.abs(center.vx)<1,'Centered impact should rebound nearly straight upward');
assert(right.vx>2,'Right shoulder impact should send ball back toward Blue court');
assert(left.vx<center.vx&&center.vx<right.vx,
 'Ball direction must vary continuously with impact angle');
assert(left.vy<0&&center.vy<0&&right.vy<0,
 'Upper-body contacts should send the ball upward');
// Equivalent angles on the other player must obey equivalent physics.
const redRight=hit('red',45),redLeft=hit('red',-45);
assert(redRight.vx>2&&redLeft.vx<-2,
 'No player-specific forced left or right ball velocity');
assert(Math.abs(redRight.vx-right.vx)<.001,
 'Red and Blue must have symmetric contact mechanics');
// The net is still solid and may legitimately block a poorly aimed shot.
assert(page.includes('resolveNetCollision(body)'),'Real net collision remains intact');
assert(page.includes("playPointEndSound(side);"),'Point-ending sound remains');
assert(page.includes("playRefereeWhistle('start');"),'Match opening whistle remains');
assert(page.includes("playRefereeWhistle('end');"),'Match ending whistle remains');
assert(page.includes("blue.x=(netX+W)*.5"),'Blue still starts at court center');
console.log('Symmetric angled rebounds passed: left, center, right, sounds and net.');
