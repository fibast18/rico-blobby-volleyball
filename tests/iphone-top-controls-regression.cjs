'use strict';
// Check the production iPhone top-HUD handler, not just element existence.
// Touch pointerup should activate a top action once, even if iOS also
// sends a synthetic click; keyboard/mouse click must remain usable.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync('index.html','utf8');
const ids=['pauseBtn','menuButton','settingsButton','matchTimer','pointTimer','playerNameButton'];
for(const id of ids)assert(page.includes("bindHudButton('"+id+"'"),
 'The '+id+' control must use immediate touch activation');
const transparentHud=page.slice(page.indexOf('/* v2.7.2: transparent HUD;'));
assert(transparentHud.includes('background:transparent!important;'),
 'Top controls must not display distracting opaque rectangles');
assert(transparentHud.includes('border:0!important;'),
 'Top controls must have no surrounding boxes or borders');
assert(transparentHud.includes('text-shadow:'),
 'Transparent labels must remain readable against the bright sky');
assert(transparentHud.includes('button:is(:active,.tapping)'),
 'Tap feedback must remain lightweight without a colored rectangle');
assert(page.includes('min-height:48px!important;'),'Landscape top buttons need 48px touch targets');
assert(page.includes('min-height:44px!important;'),'Compact screens need at least 44px touch targets');
assert(page.includes('pointer-events:auto!important;'),'HUD buttons must receive pointer events');
assert(page.includes('z-index:30!important;'),'HUD must sit above both touch court zones');
assert(page.includes('touch-action:manipulation!important;'),'iPhone buttons must allow direct taps');
assert(page.includes('env(safe-area-inset-top,0px)'),'Top buttons must avoid iOS status/gesture areas');
const from=page.indexOf('function bindHudButton(id,handler){');
const to=page.indexOf("$('playerNameButton').textContent=playerName;",from);
assert(from>=0&&to>from,'Production HUD pointer handler is missing');
const all=new Map();
function makeButton(){
 const listeners={};const names=new Set();
 return {
  listeners,names,disabled:false,
  classList:{add:n=>names.add(n),remove:n=>names.delete(n)},
  addEventListener(name,fn){(listeners[name]??=[]).push(fn)},
  fire(name,pointerType='touch'){
   const event={pointerType,prevented:false,preventDefault(){this.prevented=true}};
   for(const fn of listeners[name]||[])fn(event);
   return event;
  }
 };
}
const ctx={$:id=>all.get(id),playerName:'PLAYER',openPlayerNameEditor:()=>{}};
for(const id of ids)all.set(id,makeButton());
vm.createContext(ctx);
vm.runInContext(page.slice(from,to),ctx,{timeout:1000});
const invoke=(id,cb)=>vm.runInContext('bindHudButton('+JSON.stringify(id)+',cb)',Object.assign(ctx,{cb}),{timeout:1000});
let pauseCount=0;
invoke('pauseBtn',()=>{pauseCount++});
let pause=all.get('pauseBtn');
pause.fire('pointerdown');
assert(pause.names.has('tapping'),'Pressed state should appear immediately');
let tap=pause.fire('pointerup');
assert(tap.prevented,'Touch pointerup should suppress delayed synthesized click');
assert.equal(pauseCount,1,'Single tap should respond immediately');
assert(!pause.names.has('tapping'),'Pressed state should clear');
pause.fire('click');
assert.equal(pauseCount,1,'Synthesized click must not double-toggle Pause');
pause.fire('pointercancel');
assert(!pause.names.has('tapping'),'Cancelled gestures must clear pressed state');
// Restart is inside the pause dialog, not a top HUD touch button.
let menuCount=0;
invoke('menuButton',()=>menuCount++);
all.get('menuButton').fire('pointerdown','touch');
all.get('menuButton').fire('pointerup','touch');
all.get('menuButton').fire('click');
assert.equal(menuCount,1,'Menu must open exactly once from a mobile touch');
all.get('menuButton').fire('click','mouse');
assert.equal(menuCount,1,'Synthetic follow-up click must not reopen menu');
let settingsCount=0;
invoke('settingsButton',()=>settingsCount++);
all.get('settingsButton').fire('pointerup','touch');
all.get('settingsButton').fire('click');
assert.equal(settingsCount,1,'Settings should open only once per finger tap');
let historyCount=0;
invoke('matchTimer',()=>historyCount++);
all.get('matchTimer').fire('pointerup','touch');
all.get('matchTimer').fire('click');
assert.equal(historyCount,1,'Match history should open on one finger tap');
let pointHistory=0;
invoke('pointTimer',()=>pointHistory++);
all.get('pointTimer').fire('pointerup','touch');
all.get('pointTimer').fire('click');
assert.equal(pointHistory,1,'Point history should open on one finger tap');
all.get('pointTimer').disabled=true;
all.get('pointTimer').fire('pointerup','touch');
assert.equal(pointHistory,1,'Disabled top controls must ignore touch');
console.log('iPhone top HUD touch sizing, pointer precedence, deduplication and keyboard/mouse access passed.');
