'use strict';
// Deterministic regression tests for the ACTUAL tick() used by the game.
// No browser, remote service, or physics substitutions are needed to check
// CPU navigation and the jump command. The game loop is read from index.html.
const fs=require('node:fs');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const page=fs.readFileSync('index.html','utf8');
const head=page.indexOf('function tick(dt){'),tail=page.indexOf('/* Cached',head);
assert(head>=0&&tail>head,'Could not locate actual game tick function');
const tickCode=page.slice(head,tail);

function runScenario({ball,blueX,frames=10}) {
  const moves=[],jumps=[];
  const game={
    frame:0,rallyTicks:0,touchLock:0,W:800,netX:400,ground:430,netTop:262,netHalf:7,
    red:{x:195,y:430,r:49.45,vy:0,hitCooldown:0},
    blue:{x:blueX,y:430,r:49.45,vy:0,hitCooldown:0},
    ball:{...ball,r:36},
    pressed:{left:false,right:false,jump:false},
    awaitServe:false,server:'red',serveDelay:0,
    cpuJumpCooldown:0,cpuJumpArmed:true,cpuJumpPlan:null,
    cpuAttempt:null,cpuHadTouch:false,
    learning:{positionBias:0,jumpBias:0},
    clamp:(x,lo,hi)=>Math.max(lo,Math.min(hi,x)),
    $:()=>({value:'normal'}),
    collide:()=>false,score:()=>{},sandSound:()=>{},serveReset:()=>{},
    move(p,dir,jump,dt) {
      if(p!==game.blue)return;
      moves.push(dir);
      p.x=Math.max(400+7+p.r,Math.min(800-p.r,p.x+dir*6.6*dt));
      if(jump){
        jumps.push(game.frame);
        p.y=429; // airborne for remainder of this short command test
      }
    }
  };
  vm.createContext(game);
  vm.runInContext(tickCode,game,{timeout:1000});
  for(let i=0;i<frames;i++)vm.runInContext('tick(1)',game,{timeout:1000});
  return {moves,jumps,game};
}

const highNearNet=runScenario({ball:{x:470,y:220,vx:2,vy:2},blueX:510,frames:9});
assert(highNearNet.jumps.length>0,
  'Blue must jump to meet an incoming high near-net ball');
assert(highNearNet.jumps.length===1,
  'Blue must not repeatedly jump in the same incoming volley');

const lowNearNet=runScenario({ball:{x:460,y:300,vx:1,vy:3},blueX:500,frames:4});
assert.equal(lowNearNet.jumps.length,0,
  'Blue should stay grounded when a low ball can be met directly');

const approaching=runScenario({ball:{x:425,y:175,vx:4,vy:2},blueX:620,frames:8});
assert(approaching.moves.some(x=>x<0),
  'Blue must move toward a high incoming ball near the net');

assert(page.includes('bottom:max(34px,env(safe-area-inset-bottom,0px))'),
  'Fullscreen iPhone touch controls must stay above the Home indicator');
console.log('Blue interception, jump timing and iPhone safe-area tests passed.');
