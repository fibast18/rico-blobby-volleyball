'use strict';
// Run the actual host/guest rematch handlers. Reproduces a completed
// first-to-15 match, then verifies both phones start another match over
// the EXISTING local WebRTC channel, with no QR negotiation.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const section=(a,b)=>{
 const i=html.indexOf(a),j=html.indexOf(b,i+a.length);
 assert(i>=0&&j>i,'Production section not found: '+a);
 return html.slice(i,j);
};
const modal=html.slice(html.indexOf('<div id="overlay"'),html.indexOf('<div id="playerNamePanel"'));
assert(modal.includes('id="wifiRematch"')&&modal.includes('hidden'),
 'Replay button must exist on the game-over panel, initially hidden');
assert(modal.indexOf('id="wifiRematch"')<modal.indexOf('id="start"'),
 'Play Again must appear before Leave Wi-Fi so players do not disconnect by mistake');
assert(html.includes("Leave Wi-Fi • Play vs AI"),
 'Leaving the Wi-Fi session for single-player must be clearly labeled');
assert(html.includes("id='not real'")===false);
assert(html.includes("if(localMode==='ai'&&applyPendingUpdate())return"),
 'Local rematch must never reload the app and discard the Wi-Fi connection');
assert(html.includes("if(LocalWifi.connected){\n   $('status').textContent='Update ready';"),
 'Background PWA updates must not reload a paired phone between matches');
assert(html.includes("setLocalRematchAvailable(localMode==='host'&&LocalWifi.connected)"),
 'Host finish screen must offer replay without pairing');
assert(html.includes("setLocalRematchAvailable(LocalWifi.connected)"),
 'Guest finish screen must offer replay without pairing');
assert(html.includes("data.t==='rematch-request'")&&html.includes("data.t==='rematch-start'"),
 'Replay needs guest request and host authoritative start messages');

const core=section('function setLocalRematchAvailable(available){','function score(side){');
const peer=section('function localPaddleFraction(){','LocalWifi.attach({');
function createPeer(role){
 const ids=new Map();
 const element=id=>{
  if(!ids.has(id))ids.set(id,{hidden:id==='overlay',disabled:false,textContent:'',
   setAttribute(){},classList:{toggle(){}}});
  return ids.get(id);
 };
 const sent=[],history=[],calls={sounds:[],clears:0,snapshot:0};
 const red={x:195,y:430,vx:0,vy:0,jelly:0,movePhase:0,score:15,r:49.45};
 const blue={x:605,y:430,vx:0,vy:0,jelly:0,movePhase:0,score:10,r:49.45};
 const ball={x:195,y:260,vx:0,vy:0,r:36};
 const ctx={
  W:800,netX:400,netHalf:7,ground:430,
  red,blue,ball,frame:0,
  localMode:role,running:true,paused:false,
  matchMs:123400,pointMs:9100,matchStarted:true,awaitServe:false,
  server:'red',localSnapshotId:0,remoteInput:{x:.4,jump:true},
  $:element,
  LocalWifi:{connected:true,active:true,send:m=>{sent.push(structuredClone(m));return true}},
  applyPendingUpdate:()=>{throw Error('App reload would end existing local Wi-Fi room')},
  playRefereeWhistle:what=>calls.sounds.push(what),
  playPointEndSound:()=>{},playTone:()=>{},
  recordMatchTime:status=>history.push({status,red:ctx.red.score,blue:ctx.blue.score,ms:ctx.matchMs}),
  recordPointTime:()=>{},
  clearInput:()=>{calls.clears++},
  clearSavedMatch:()=>{},newMatchIdentity:()=>{},
  updateLearningLabel:()=>{},
  serveReset:side=>{
   ctx.server=side;ctx.awaitServe=true;ctx.ball.x=195;ctx.ball.y=260;
  },
  updateTimers:()=>{},updateMovementVisual:()=>{},
  clamp:(n,a,b)=>Math.min(Math.max(n,a),b),
  normalizePlayerName:s=>s,
  requestImmersiveGameFullscreen:()=>{},
  wakeAudio:()=>{},
  document:{hidden:false}
 };
 vm.createContext(ctx);
 vm.runInContext(core,ctx,{timeout:1000});
 vm.runInContext(peer,ctx,{timeout:1000});
 return {ctx,ids,element,sent,history,calls};
}
const host=createPeer('host'),guest=createPeer('guest');
const deliver=(source,target)=>{
 const messages=source.sent.splice(0);
 for(const message of messages){
  target.ctx.msg=message;
  vm.runInContext('localWifiMessage(msg)',target.ctx,{timeout:1000});
 }
 return messages;
};
// One match ends: both phones show Play Again, network connection stays up.
vm.runInContext('finish()',host.ctx,{timeout:1000});
const endMessages=deliver(host,guest);
assert.equal(endMessages.length,1,'Host must send one final result');
assert.equal(endMessages[0].t,'end');
for(const p of [host,guest]){
 assert.equal(p.ctx.LocalWifi.connected,true,'Finish must not close Wi-Fi channel');
 assert.equal(p.ctx.localMode,p===host?'host':'guest','Paired role must survive result');
 assert.equal(p.ctx.running,false,'Both game loops stop on final score');
 assert.equal(p.element('wifiRematch').hidden,false,'Replay button must show on both phones');
 assert.equal(p.element('wifiRematch').disabled,false,'Replay must be immediately tappable');
 assert.match(p.element('wifiRematch').textContent,/Play Again/);
 assert.equal(p.element('overlay').hidden,false,'Final score panel remains visible');
 assert.equal(p.history.length,1,'Completed first match must be recorded once');
}
assert.equal(host.history[0].red,15);
assert.equal(guest.history[0].blue,10);

// Guest requests a replay; host starts the only authoritative game.
vm.runInContext('requestLocalRematch()',guest.ctx,{timeout:1000});
assert.equal(guest.element('wifiRematch').disabled,true,
 'Pending guest request must not permit duplicate taps');
assert.match(guest.element('wifiRematch').textContent,/Waiting/);
const request=deliver(guest,host);
assert.deepEqual(request.map(m=>m.t),['rematch-request'],
 'Guest requests a rematch through the already-open data channel');
assert.equal(host.ctx.running,true,'Host starts the second game without pairing');
assert.equal(host.ctx.red.score,0);assert.equal(host.ctx.blue.score,0);
assert.equal(host.ctx.matchMs,0);assert.equal(host.ctx.pointMs,0);
assert.equal(host.ctx.awaitServe,true);
assert.equal(host.element('wifiRematch').hidden,true);
assert.equal(host.element('overlay').hidden,true);
assert.equal(host.ctx.remoteInput.jump,false,'Old guest Jump state must not bleed into rematch');
assert.equal(host.ctx.remoteInput.x,.5,'New match starts with neutral remote movement');
const response=deliver(host,guest);
assert.deepEqual(response.map(m=>m.t),['rematch-start','state'],
 'Host must send start before the first second-match snapshot');
assert.equal(guest.ctx.running,true,'Guest enters the new match without QR exchange');
assert.equal(guest.ctx.red.score,0);assert.equal(guest.ctx.blue.score,0);
assert.equal(guest.ctx.matchMs,0);assert.equal(guest.ctx.pointMs,0);
assert.equal(guest.ctx.awaitServe,true);
assert.equal(guest.element('wifiRematch').hidden,true);
assert.equal(guest.element('overlay').hidden,true);
assert.equal(host.ctx.LocalWifi.connected,true);
assert.equal(guest.ctx.LocalWifi.connected,true);
assert.equal(host.history.length,1);
assert.equal(guest.history.length,1);
assert(host.calls.sounds.includes('end')&&host.calls.sounds.includes('start'),
 'Host should whistle for each match independently');
assert(guest.calls.sounds.includes('end')&&guest.calls.sounds.includes('start'),
 'Guest should whistle for each match independently');
// Re-pressing the replay action during an active match cannot create a
// second start or duplicate score reset.
vm.runInContext('requestLocalRematch()',guest.ctx);
assert.equal(guest.sent.length,0,'An active game must ignore duplicate replay requests');
vm.runInContext('requestLocalRematch()',host.ctx);
assert.equal(host.sent.length,0,'Host must ignore another Play Again while playing');

// Finish the second game too. Host can now initiate third round directly.
host.ctx.red.score=8;host.ctx.blue.score=15;host.ctx.matchMs=88000;
vm.runInContext('finish()',host.ctx);
deliver(host,guest);
assert.equal(host.history.length,2);
assert.equal(guest.history.length,2);
vm.runInContext('requestLocalRematch()',host.ctx);
assert.equal(host.ctx.running,true);
assert.deepEqual(deliver(host,guest).map(m=>m.t),['rematch-start','state']);
assert.equal(guest.ctx.running,true);
assert.equal(host.ctx.LocalWifi.connected,true);
assert.equal(guest.ctx.LocalWifi.connected,true);
assert.equal(host.history.length,2,'Starting next game must not erase history');
assert.equal(guest.history.length,2);

// If Wi-Fi drops, replay must no longer appear or attempt a new game.
host.ctx.running=false;
host.ctx.LocalWifi.connected=false;
vm.runInContext('setLocalRematchAvailable(false);requestLocalRematch()',host.ctx);
assert.equal(host.element('wifiRematch').hidden,true);
assert.equal(host.sent.length,0);
console.log('Two finished Wi-Fi matches, replay from either phone, new scores/timers, retained history and no QR reconnection passed.');
