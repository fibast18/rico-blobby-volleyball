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
assert(page.includes('id="settingsButton"'),'Gear settings missing');
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

const elements={};
for(const name of ['matchTimer','pointTimer','pauseBtn','status']){
 elements[name]={textContent:'',setAttribute(name,value){this[name]=value}};
}
let clears=0;
const state={
 running:true,paused:false,matchMs:0,pointMs:0,awaitServe:true,last:0,
 $:id=>elements[id],clearInput:()=>{clears++},
 heldJumpPointers:{clear:()=>{}},
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
assert.equal(state.matchMs,100,'Match clock runs before serve');
assert.equal(state.pointMs,0,'Point clock waits for actual serve');
state.awaitServe=false;
vm.runInContext('loop(1200)',state);
assert.equal(state.matchMs,200);
assert.equal(state.pointMs,100);
vm.runInContext('setPaused(true)',state);
vm.runInContext('loop(1300); loop(1400)',state);
assert.equal(state.matchMs,200,'Pausing freezes match timer');
assert.equal(state.pointMs,100,'Pausing freezes point timer');
assert.equal(elements.pauseBtn.textContent,'▶ Resume');
assert(clears>0,'Pause should release held touches');
vm.runInContext('setPaused(false); loop(1500)',state);
assert.equal(state.matchMs,300,'Resume continues match timer');
assert.equal(state.pointMs,200,'Resume continues point timer');
assert(page.includes('pointMs=0;scoreTimer=0;serveDelay=0;'),'Scoring must reset point clock');
assert(page.includes('matchMs=0;pointMs=0;updateTimers();'),'Finished match must reset clocks');
assert(page.includes('matchMs=0;pointMs=0;paused=false;'),'New match must reset clock and pause state');
console.log('Phone full-screen HUD, pause/background, timers and settings checks passed.');
