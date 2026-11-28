'use strict';
// Pause and Menu must be safe. Restart and switching modes require a
// deliberate confirmation before losing scores, timer or the Wi-Fi session.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const hud=html.slice(html.indexOf('<div class="hud">'),html.indexOf('</div>\n<button id="playerNameButton"'));
const pauseMarkup=html.slice(html.indexOf('id="pausePanel"'),html.indexOf('<div id="overlay"'));
assert(hud.includes('id="pauseBtn"')&&hud.includes('id="menuButton"'));
assert(!hud.includes('id="restart"'),'Restart should not remain a dangerous in-game top button');
assert(pauseMarkup.includes('id="restart"')&&pauseMarkup.includes('id="pauseResume"')&&
 pauseMarkup.includes('id="pauseToMenu"'),'Pause dialog must contain Resume, Restart and Menu');
assert(pauseMarkup.includes('id="discardPanel"')&&pauseMarkup.includes('id="discardCancel"')&&
 pauseMarkup.includes('id="discardConfirm"'),'Discard needs explicit Cancel/Confirm buttons');
assert(html.includes("$('restart').onclick=()=>requestDiscardConfirmation("),
 'Restart must ask before clearing an active match');
assert(html.includes("$('wifiModeButton').onclick=openWifiFromMenu;"),
 'Opening Wi-Fi while playing must ask before abandoning the match');
assert(html.includes("$('start').onclick=startAiFromMenu;"),
 'Starting another AI match must ask before abandoning the current match');
const extract=(start,end)=>{const i=html.indexOf(start),j=html.indexOf(end,i+start.length);
 assert(i>=0&&j>i,'Code section missing '+start);return html.slice(i,j)};
const pauseCode=extract('function setPaused(value){','function pauseOnExit(){');
const menuCode=extract('// Pause opens an actual pause menu','// Opening the menu is NOT a restart');
function peer(mode='ai'){
 const elements=new Map();
 const $=id=>{
  if(!elements.has(id))elements.set(id,{hidden:id!=='overlay',textContent:'',
   setAttribute(){}});
  return elements.get(id);
 };
 $('overlay').hidden=true;
 const calls={clears:0,network:[],discarded:0,opened:0,starts:0,restarts:0};
 const ctx={
  localMode:mode,running:true,paused:false,matchMs:74000,pointMs:18000,
  red:{score:6},blue:{score:3},ball:{x:382,y:196,vx:2,vy:-7},
  $,
  clearInput:()=>calls.clears++,
  heldJumpPointers:{clear(){}},saveMatch(){},updateTimers(){},
  LocalWifi:{active:mode!=='ai',connected:mode!=='ai',send:m=>{calls.network.push(m);return true},leave(){calls.discarded++;this.active=false;this.connected=false}},
  recordMatchTime:()=>calls.discarded++,clearSavedMatch(){},
  updatePeerLabel(){},updateControlGuide(){},updateMatchLevelBadge(){},
  setLocalRematchAvailable(){},
  requestImmersiveGameFullscreen(){},
  wakeAudio(){},
  begin:()=>{calls.starts++},
  restart:()=>{calls.restarts++},
  }
 vm.createContext(ctx);
 vm.runInContext(pauseCode,ctx,{timeout:1000});
 vm.runInContext(menuCode,ctx,{timeout:1000});
 ctx.LocalWifi.openPairing=()=>{calls.opened++};
 return {ctx,calls,$};
}
const a=peer('ai'),g=peer('guest');
for(const p of [a,g]){
 const ctx=p.ctx;
 vm.runInContext('openPauseMenu()',ctx);
 assert.equal(p.$('pausePanel').hidden,false);
 if(ctx.localMode==='ai')assert.equal(ctx.paused,true);
 else assert.deepEqual(p.calls.network.map(m=>m.paused),[true]);
 assert.deepEqual([ctx.matchMs,ctx.pointMs,ctx.red.score,ctx.blue.score],[74000,18000,6,3]);
 assert.equal(ctx.ball.vy,-7);

 // Cancelling an offered restart must preserve the original rally.
 vm.runInContext("requestDiscardConfirmation('Restart match?',()=>restart())",ctx);
 assert.equal(p.$('discardPanel').hidden,false);
 assert.equal(p.calls.restarts,0,'No restart before confirmation');
 vm.runInContext('cancelDiscard()',ctx);
 assert.equal(p.$('discardPanel').hidden,true);
 assert.equal(p.calls.restarts,0);
 assert.equal(ctx.red.score,6);

 // The confirmed restart executes exactly once.
 vm.runInContext("requestDiscardConfirmation('Restart match?',()=>restart())",ctx);
 vm.runInContext('confirmDiscard()',ctx);
 assert.equal(p.calls.restarts,1);
 assert.equal(p.$('discardPanel').hidden,true);

 vm.runInContext('resumePauseMenu()',ctx);
 assert.equal(p.$('pausePanel').hidden,true);
 if(ctx.localMode==='ai')assert.equal(ctx.paused,false);
 else assert.deepEqual(p.calls.network.map(m=>m.paused),[true,false]);
 assert.deepEqual([ctx.matchMs,ctx.pointMs,ctx.red.score,ctx.blue.score],[74000,18000,6,3]);
}

// Choosing Wi-Fi from a live AI match cannot discard silently.
vm.runInContext('openWifiFromMenu()',a.ctx);
assert.equal(a.$('discardPanel').hidden,false);
assert.equal(a.calls.opened,0);
vm.runInContext('cancelDiscard()',a.ctx);
assert.equal(a.calls.opened,0);
assert.equal(a.ctx.running,true);
vm.runInContext('openWifiFromMenu()',a.ctx);
vm.runInContext('confirmDiscard()',a.ctx);
assert.equal(a.calls.opened,1,'Confirmed mode change should open local pairing');
assert.equal(a.ctx.running,false,'Only confirmed mode change discards active match');
assert.equal(a.ctx.red.score,6,'History must record match before score reset');
assert(a.calls.discarded>=1,'Abandoned match should be recorded');

// AI match switch also needs confirmation.
const b=peer('ai');
vm.runInContext('startAiFromMenu()',b.ctx);
assert.equal(b.calls.starts,0);
vm.runInContext('cancelDiscard()',b.ctx);
assert.equal(b.calls.starts,0);
vm.runInContext('startAiFromMenu()',b.ctx);
vm.runInContext('confirmDiscard()',b.ctx);
assert.equal(b.calls.starts,1,'Only confirmed New AI Match may restart gameplay');

console.log('Pause popup, restart confirmation, mode-switch cancellation, Wi-Fi match protection and resume passed.');

// Difficulty change must not modify the active setting until confirmed.
const d=peer('ai');
d.$('difficulty').value='normal';
d.ctx.closeSettings=()=>{};
d.ctx.updateDifficultyDescription=()=>{};
vm.runInContext(extract("let selectedDifficulty=","$('difficulty').addEventListener('change',changeDifficulty);"),d.ctx);
d.$('difficulty').value='hard';
vm.runInContext('changeDifficulty()',d.ctx);
assert.equal(d.$('difficulty').value,'normal');
assert.equal(d.calls.starts,0);
assert.equal(d.ctx.paused,true);
vm.runInContext('cancelDiscard()',d.ctx);
assert.equal(d.$('difficulty').value,'normal');
assert.equal(d.ctx.red.score,6);
d.$('difficulty').value='hard';
vm.runInContext('changeDifficulty();confirmDiscard()',d.ctx);
assert.equal(d.$('difficulty').value,'hard');
assert.equal(d.calls.starts,1);
vm.runInContext('changeDifficulty()',d.ctx);
assert.equal(d.calls.starts,1,'Same difficulty must not restart');
d.ctx.localMode='host';
d.$('difficulty').value='easy';
vm.runInContext('changeDifficulty()',d.ctx);
assert.equal(d.calls.starts,1,'Wi-Fi match must not restart');
d.ctx.localMode='ai';d.ctx.running=false;
d.$('difficulty').value='normal';
vm.runInContext('changeDifficulty()',d.ctx);
assert.equal(d.calls.starts,1,'Idle difficulty selection must not start a match');
