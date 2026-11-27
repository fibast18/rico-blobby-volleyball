'use strict';
// Run the actual Menu/Resume and pause logic. Returning to the opening
// pop-up must not restart a rally, reset the match, or tear down local Wi-Fi.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const extract=(start,end)=>{
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert(a>=0&&b>a,'Missing production function: '+start);
 return html.slice(a,b);
};
const hud=html.slice(html.indexOf('<div class="hud">'),html.indexOf('</div>\n<button id="playerNameButton"'));
const popup=html.slice(html.indexOf('<div id="overlay"'),html.indexOf('<div id="playerNamePanel"'));
assert(hud.includes('id="menuButton"'),'An in-game Menu button is required');
assert(!hud.includes('id="restart"')&&hud.includes('id="pauseBtn"'),
 'Restart moves to the pause panel; only Pause and Menu stay in the HUD');
assert(html.includes('id="pausePanel"')&&html.includes('id="restart" type="button"'),
 'Restart must be in the pause pop-up');
assert(!hud.includes('id="settingsButton"'),'Settings must stay in opening menu, not HUD');
assert(popup.includes('id="resumeMatch" type="button" hidden'),
 'Opening pop-up must have an initially hidden Resume Match option');
assert(popup.indexOf('id="resumeMatch"')<popup.indexOf('id="start"'),
 'Resume Match should appear before switching game modes');
assert(popup.indexOf('id="wifiModeButton"')<popup.indexOf('id="settingsButton"'),
 'Settings stays below Local Wi-Fi on menu');
assert(html.includes("bindHudButton('menuButton',openGameMenu)"),
 'Menu button must use the fast iPhone/Android pointer handler');
assert(html.includes("$('resumeMatch').onclick=()=>{"),
 'Resume Match must be a functional button');

function simulate(role){
 const ids=new Map();
 const element=id=>{
  if(!ids.has(id))ids.set(id,{textContent:'',hidden:id!=='overlay',
   disabled:false,setAttribute(){}});
  return ids.get(id);
 };
 const calls={clear:0,saved:0,network:[],timers:0};
 const ctx={
  localMode:role,running:true,paused:false,
  matchMs:98760,pointMs:12400,matchStarted:true,red:{score:8},
  blue:{score:5},ball:{x:376,y:285,vx:4,vy:-7},
  $:element,heldJumpPointers:{clear(){}},
  clearInput:()=>{calls.clear++},saveMatch:()=>{calls.saved++},
  updateTimers:()=>{calls.timers++},
  LocalWifi:{connected:role!=='ai',send:m=>{calls.network.push({...m});return true}},
  setLocalRematchAvailable:available=>{element('wifiRematch').hidden=!available}
 };
 vm.createContext(ctx);
 vm.runInContext(extract('function setPaused(value){','function pauseOnExit(){'),ctx);
 vm.runInContext(extract('function openGameMenu(){','function setLocalRematchAvailable(available){'),ctx);
 return {ctx,calls,element};
}
for(const role of ['ai','host','guest']){
 const p=simulate(role),v=p.ctx;
 vm.runInContext('openGameMenu()',v);
 assert.equal(p.element('overlay').hidden,false,role+': Menu must open');
 assert.equal(p.element('resumeMatch').hidden,false,role+': Resume must appear');
 assert.equal(p.element('title').textContent,'Game Menu');
 assert.match(p.element('detail').textContent,/Match paused/);
 assert.equal(p.element('settingsButton').hidden,true,'Settings button is already in opening popup');
 assert.equal(p.element('wifiRematch').hidden,true,'Menu must not offer a new game as Wi-Fi rematch');
 assert.equal(v.matchMs,98760,role+': opening Menu must not reset match clock');
 assert.equal(v.pointMs,12400,role+': opening Menu must not reset point clock');
 assert.equal(v.red.score,8,role+': opening Menu must not reset score');
 assert.equal(v.blue.score,5,role+': opening Menu must not reset opponent score');
 assert.equal(v.ball.vx,4,role+': opening Menu must preserve live ball velocity');
 assert.equal(v.ball.vy,-7,role+': opening Menu must preserve ball trajectory');
 if(role==='guest'){
  assert.deepEqual(p.calls.network.map(m=>m.t),['pause']);
  assert.equal(p.calls.network[0].paused,true,
   'Guest Menu must request authoritative host pause without disconnection');
  v.paused=true; // Host confirms pause through an incoming state snapshot
 }else{
  assert.equal(v.paused,true,role+': opening Menu must pause match');
  assert.equal(p.calls.network.length,0,'Host keeps local Wi-Fi connected');
 }
 vm.runInContext('resumeGameFromMenu()',v);
 assert.equal(p.element('overlay').hidden,true,role+': Resume must close Menu');
 assert.equal(p.element('resumeMatch').hidden,true);
 if(role==='guest'){
  assert.deepEqual(p.calls.network.map(m=>m.paused),[true,false],
   'Guest must request host resume over the original connection');
 }else assert.equal(v.paused,false,role+': Resume must restart clock from same state');
 assert.equal(v.matchMs,98760);
 assert.equal(v.pointMs,12400);
 assert.deepEqual([v.red.score,v.blue.score],[8,5]);
 assert.equal(v.ball.x,376);
 assert.equal(v.LocalWifi.connected,role!=='ai','No new QR pairing or disconnection');

 // Opening from an already paused match should still expose the menu.
 v.paused=true;
 vm.runInContext('openGameMenu()',v);
 assert.equal(p.element('resumeMatch').hidden,false);
}
console.log('Menu opens during AI/host/guest matches; Settings remains in menu; Resume keeps ball, scores, timers and Wi-Fi session.');
