'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync('index.html','utf8');
function section(from,to){
 const begin=page.indexOf(from),end=page.indexOf(to,begin+from.length);
 assert(begin>=0&&end>begin,'Missing section '+from);
 return page.slice(begin,end);
}
assert(page.includes('<body class="fullscreen">'),'The iPhone game must launch in app-sized fullscreen layout');
assert(page.includes('id="pauseBtn"'),'Pause control missing');
assert(page.includes('id="settingsButton"'),'Opening Settings option missing');
const hud=page.slice(page.indexOf('<div class="hud">'),page.indexOf('</div>\n<button id="playerNameButton"'));
const opening=page.slice(page.indexOf('<div id="overlay"'),page.indexOf('<div id="playerNamePanel"'));
assert(!hud.includes('id="settingsButton"'),'Gameplay HUD should no longer show the Settings gear');
assert(hud.includes('<span id="difficultyHud" class="mini difficulty-hud"') &&
 hud.indexOf('id="difficultyHud"')<hud.indexOf('id="matchTimer"'),
 'Difficulty replaces Playing / Paused at upper-left, before both clocks');
assert(hud.includes('id="status" class="hud-announcement"'),
 'Gameplay status must remain accessible but not visible next to the level');
assert(!page.includes('<div id="difficultyHud"'),
 'Remove the separate difficulty badge from the right side of the court');
assert(opening.includes('id="settingsButton"'),'Settings must be in opening pop-up');
assert(opening.indexOf('id="settingsButton"')>opening.indexOf('id="wifiModeButton"'),
 'Settings must appear directly below Local Wi-Fi — 2 Players');
assert(page.includes('id="matchTimer"')&&page.includes('id="pointTimer"'),'Both game timers required');
assert(page.includes('id="settingsPanel"'),'Settings dialog missing');
for(const id of ['difficulty','sound','resetLearning','closeSettings','restart']){
 assert(page.includes('id="'+id+'"'),'Required control missing: '+id);
}
assert(!page.includes('id="outsideFull"')&&!page.includes('id="outsideReset"')&&!page.includes('id="fullscreen"'),
 'Old duplicate buttons and Expand should be removed');
assert(!page.includes('id="aiProgress"'),'Blue learned progress must not clutter the screen');
assert(!page.includes('Original mobile arcade game'),'Unrequested footer must be removed');
assert(!page.includes('id="title">Beach volleyball!'),'Outdated instruction overlay must be removed');
assert(page.includes("document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseOnExit()})"),
 'App backgrounding must pause the match');
assert(page.includes("window.addEventListener('pagehide',pauseOnExit)"),
 'Leaving the game must pause it');
assert(page.includes('function saveMatch()')&&page.includes('function restoreSavedMatch()'),'Paused match must survive iOS app unload');
assert(page.includes("serveReset();restoreSavedMatch();")&&
 page.includes("updateControlGuide();\nrequestAnimationFrame(loop);"),
 'Game should restore a paused match and its first-serve help before animation');

const elements={};
for(const name of ['matchTimer','pointTimer','pauseBtn','status']){
 elements[name]={textContent:'',setAttribute(name,value){this[name]=value}};
}
let clears=0;
const state={
 localMode:'ai',running:true,paused:false,matchStarted:false,matchMs:0,pointMs:0,awaitServe:true,last:0,lastSnapshotMs:0,
 $:id=>elements[id],clearInput:()=>{clears++},
 heldJumpPointers:{clear:()=>{}},saveMatch:()=>{},
 resizeCourt:()=>{},tick:()=>{},draw:()=>{},
 requestAnimationFrame:()=>{},updateTimers:undefined
};
vm.createContext(state);
vm.runInContext(section('function clockText(ms){','function serveReset(side='),state,{timeout:1000});
vm.runInContext(section('function loop(now){','const movementPad='),state,{timeout:1000});
assert.equal(vm.runInContext('clockText(65000)',state),'01:05');
vm.runInContext('updateTimers()',state);
assert.equal(elements.matchTimer.textContent,'Match 00:00');
assert.equal(elements.pointTimer.textContent,'Point 00:00');
vm.runInContext('loop(1000); loop(1100)',state);
assert.equal(state.matchMs,0,'Match clock must stay at zero until the first real ball hit');
assert.equal(state.pointMs,0,'Point clock waits for actual serve');
// Even during an unserved game, pressing Play and waiting must not start it.
state.matchStarted=true;state.awaitServe=false;
vm.runInContext('loop(1200)',state);
assert.equal(state.matchMs,100,'First ball contact starts the match timer');
assert.equal(state.pointMs,100);
vm.runInContext('setPaused(true)',state);
vm.runInContext('loop(1300); loop(1400)',state);
assert.equal(state.matchMs,100,'Pausing freezes match timer');
assert.equal(state.pointMs,100,'Pausing freezes point timer');
assert.equal(elements.pauseBtn.textContent,'▶ Resume');
assert(clears>0,'Pause should release held touches');
vm.runInContext('setPaused(false); loop(1500)',state);
assert.equal(state.matchMs,200,'Resume continues match timer');
assert.equal(state.pointMs,200,'Resume continues point timer');
// Every later serve must freeze both timers, even after matchStarted became true.
state.awaitServe=true;
vm.runInContext('loop(1600);loop(1700);loop(1800)',state);
assert.equal(state.matchMs,200,'Waiting for a later serve cannot consume match time');
assert.equal(state.pointMs,200,'Waiting for a later serve cannot consume point time');
state.awaitServe=false;
vm.runInContext('loop(1900)',state);
assert.equal(state.matchMs,300,'The next rally resumes accumulated match time');
assert.equal(state.pointMs,300);
assert(page.includes("if(awaitServe){\n  matchStarted=true;")&&
 page.includes('firstServeContact();'),
 'First actual serve must start the match clock and dismiss first-serve instructions');
assert(page.includes('if(matchStarted&&!awaitServe)matchMs+=rawDelta;'),
 'Match clock must wait for each serve and count ONLY while the ball is in action');
assert(page.includes('matchMs,pointMs,matchStarted,server'),'Saved matches must preserve start state');
assert(page.includes("typeof v.matchStarted==='boolean'?v.matchStarted:"),
 'Restored older matches must infer whether the clock had started');
assert(page.includes('pointMs=0;scoreTimer=0;serveDelay=0;'),'Scoring must reset point clock');
assert(page.includes('matchMs=0;pointMs=0;updateTimers();'),'Finished match must reset clocks');
assert(page.includes('matchMs=0;pointMs=0;matchStarted=false;paused=false;'),'New match must reset start flag, clocks, and pause state');
console.log('Phone full-screen HUD, pause/background, timers and settings checks passed.');
