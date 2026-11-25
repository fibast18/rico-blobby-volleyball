'use strict';
// Use production game physics to prove remote Blue is human-controlled,
// without altering AI mode or granting Blue any special collision behavior.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync('index.html','utf8');
const first=page.indexOf('function move(p,dir,jump,dt){');
const last=page.indexOf('/* Cached',first);
assert(first>=0&&last>first,'Production physics missing');
const red={x:195,y:430,vx:0,vy:0,r:49.45,hitCooldown:0,jelly:0,jellyV:0,movePhase:0,score:0};
const blue={x:605,y:430,vx:0,vy:0,r:49.45,hitCooldown:0,jelly:0,jellyV:0,movePhase:0,score:0};
const ball={x:195,y:260,vx:0,vy:0,r:36};
const state={
 W:800,netX:400,netHalf:7,netTop:262,ground:430,red,blue,ball,
 localMode:'host',remoteInput:{x:0,jump:false},slideTargetX:null,
 pressed:{jump:false},lastTouch:null,consecutiveTouches:0,
 lastVolleySide:null,touchLock:0,touchFault:null,awaitServe:true,server:'red',
 frame:0,rallyTicks:0,score:()=>{},playTone:()=>{},sandSound:()=>{},
 updateMovementVisual:()=>{},$:()=>({textContent:''}),
 clamp:(n,a,b)=>Math.max(a,Math.min(b,n))
};
vm.createContext(state);
vm.runInContext(page.slice(first,last),state,{timeout:1000});
vm.runInContext('tick(1)',state);
assert(blue.x<605,'Host should move Blue toward the remote player target on the left');
assert.equal(blue.cpuSpeed,6.6,'Human Blue must have equivalent run speed to Red');
const leftward=blue.vx;assert(leftward<0);
state.remoteInput={x:1,jump:false};
vm.runInContext('tick(1)',state);
assert(blue.vx>0,'Remote player moving right must reverse Blue direction');
state.remoteInput={x:1,jump:true};
vm.runInContext('tick(1)',state);
assert(blue.y<430,'Remote jump input must launch Blue in the host-authoritative simulation');

const begin=page.indexOf('function localPaddleFraction(){');
const end=page.indexOf('LocalWifi.attach({',begin);
assert(begin>=0&&end>begin,'Client snapshot/apply functions missing');
const ids=Object.fromEntries(['status','pauseBtn','movementPad','playerNameButton']
 .map(k=>[k,{textContent:'',setAttribute(){},classList:{toggle(){}}}]));
let sent=null,timers=0;
const guest={
 W:800,netX:400,netHalf:7,ground:430,
 red:{r:49.45},blue:{r:49.45},ball:{r:36},
 localMode:'guest',localSnapshotId:0,slideTargetX:null,
 pressed:{jump:true},
 running:false,paused:false,
 $:id=>ids[id]||{},
 clamp:(n,a,b)=>Math.max(a,Math.min(b,n)),
 LocalWifi:{send:message=>{sent=message;return true}},
 updateTimers:()=>{timers++},updateMovementVisual:()=>{}
};
vm.createContext(guest);
vm.runInContext(page.slice(begin,end),guest,{timeout:1000});
guest.snapshot={
 t:'state',id:1,w:1000,
 red:[250,430,0,0,0,0,2],blue:[750,416,0,0,0,0,3],
 ball:[530,270,-3,-2],matchMs:65000,pointMs:8000,
 matchStarted:true,awaitServe:false,server:'blue',running:true,paused:false
};
vm.runInContext('receiveLocalState(snapshot)',guest);
assert(Math.abs(guest.red.x-200)<.01,'Guest should scale Red x for own phone size');
assert(Math.abs(guest.blue.x-600)<.01,'Guest should scale Blue x for own phone size');
assert(Math.abs(guest.ball.x-424)<.01,'Ball snapshot should scale for phone screen');
assert.equal(guest.red.score,2);assert.equal(guest.blue.score,3);
assert.equal(guest.matchMs,65000);assert.equal(guest.pointMs,8000);
assert.equal(guest.running,true);assert.equal(guest.paused,false);
assert(timers>0,'Guest must render synchronized timers');
guest.snapshot.id=1;guest.snapshot.red[0]=300;
vm.runInContext('receiveLocalState(snapshot)',guest);
assert(Math.abs(guest.red.x-200)<.01,'Old/out-of-order snapshots must be ignored');
guest.slideTargetX=guest.netX+guest.netHalf+guest.blue.r+
  .75*(guest.W-guest.netX-guest.netHalf-guest.blue.r*2);
vm.runInContext('sendLocalInput()',guest);
assert(Math.abs(sent.x-.75)<.0001,'Blue input must use normalized position across different screens');
assert.equal(sent.jump,true,'Guest must send jump state to authoritative host');
console.log('Host-controlled Blue movement/jump and cross-screen authoritative snapshot/input synchronization passed.');
