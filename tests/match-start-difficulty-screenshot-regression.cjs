'use strict';
// Production regression: the match clock must remain at zero while waiting
// for the opening serve, start ONLY on the physical ball/blob contact,
// keep running across points, and show the true AI difficulty in screenshots.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function section(a,b){
 const x=html.indexOf(a),y=html.indexOf(b,x+a.length);
 assert(x>=0&&y>x,'Could not extract production section '+a);
 return html.slice(x,y);
}
const hud=html.slice(html.indexOf('<div class="hud">'),
 html.indexOf('<button id="playerNameButton"'));
const result=html.slice(html.indexOf('<div id="overlay"'),
 html.indexOf('<div id="playerNamePanel"'));
assert(hud.includes('id="matchTimer"')&&hud.includes('id="difficultyHud"'),
 'Match timer and level must be visible in active-game HUD');
assert(hud.indexOf('id="difficultyHud"')<hud.indexOf('id="matchTimer"'),
 'Difficulty replaces Playing/Paused at upper-left before both clocks');
assert(hud.includes('id="status" class="hud-announcement"'),
 'Playing/Paused stays announced to accessibility tools, not shown in screenshot');
assert(!html.includes('<div id="difficultyHud"'),
 'Separate difficulty badge must be removed from upper-right');
assert(result.includes('id="finalDifficulty" class="final-difficulty" hidden'),
 'Final-score pop-up must include a separate difficulty label');
assert(result.indexOf('id="finalMatchTime"')<result.indexOf('id="finalDifficulty"'),
 'Completed level must appear underneath the score and duration');
assert(html.includes("if(matchStarted&&!awaitServe)matchMs+=rawDelta;"),
 'A match cannot count time before a serve OR between active rallies');
assert(html.includes("if(awaitServe){\n  matchStarted=true;"),
 'Opening serve collision must activate the match clock');
assert(html.includes('firstServeContact();'),
 'First physical serve should be the trigger for the control fade');
assert((html.match(/showFinalMatchLevel\(\);/g)||[]).length>=2,
 'Both host/solo and guest final-score screens must identify the match level');
assert(html.includes("updateMatchLevelBadge();"),
 'Match labels must update when the game mode or AI setting changes');
const elements=new Map();
function el(id){
 if(!elements.has(id))elements.set(id,{
  value:id==='difficulty'?'normal':undefined,textContent:'',hidden:true,
  setAttribute(){}
 });
 return elements.get(id);
}
const sounds=[],hits=[];
const ctx={
 W:800,netX:400,netHalf:7,netTop:262,ground:430,
 red:{x:195,y:430,vx:0,vy:0,r:49.45,hitCooldown:0,jellyV:0},
 blue:{x:600,y:430,vx:0,vy:0,r:49.45,hitCooldown:0,jellyV:0},
 ball:{x:195,y:320,vx:0,vy:5,r:36},
 lastTouch:null,touchLock:0,lastVolleySide:null,consecutiveTouches:0,
 touchFault:null,awaitServe:true,matchStarted:false,
 matchMs:0,pointMs:0,rallyTicks:0,cpuHadTouch:false,cpuJumpPlan:null,
 running:true,paused:false,last:0,lastSnapshotMs:0,localMode:'ai',
 $:el,
 playTone:v=>sounds.push(v),firstServeContact:()=>hits.push('contact'),
 resizeCourt(){},tick(){},draw(){},requestAnimationFrame(){},
 saveMatch(){},setLocalRematchAvailable(){},updateControlGuide(){},
};
vm.createContext(ctx);
vm.runInContext(section('function clockText(ms){','function setPaused(value){'),ctx,{timeout:1000});
vm.runInContext(section('function showFinalMatchTime(durationMs){',
 '// Pause opens an actual pause menu'),ctx,{timeout:1000});
vm.runInContext(section('function collide(p){','function tick(dt){'),ctx,{timeout:1000});
vm.runInContext(section('function loop(now){','const movementPad='),ctx,{timeout:1000});

// Waiting to serve must never increment elapsed time; the Play button
// or a pause/resume before the first contact is not a valid timer start.
vm.runInContext('loop(1000);loop(1100);loop(1200)',ctx);
assert.equal(ctx.matchMs,0);
assert.equal(ctx.pointMs,0);
assert.equal(ctx.matchStarted,false);
assert.equal(el('matchTimer').textContent,'Match 00:00');
assert.equal(hits.length,0);

// Call the actual physics collision in the initial serving formation.
ctx.ball={x:ctx.red.x,y:ctx.red.y-ctx.red.r*1.05-60,vx:0,vy:5,r:36};
assert.equal(vm.runInContext('collide(red)',ctx),true,
 'The real opening serve must result in a valid physics collision');
assert.equal(ctx.matchStarted,true,'The first hit begins the match clock');
assert.equal(ctx.awaitServe,false,'The serve changes to an active rally');
assert.equal(hits.length,1,'Instructions should dismiss when the ball is struck');
vm.runInContext('loop(1250)',ctx);
assert.equal(ctx.matchMs,50,'Only elapsed time AFTER the first hit counts');
assert.equal(ctx.pointMs,50);
vm.runInContext('loop(1300)',ctx);
assert.equal(ctx.matchMs,100,'Match clock advances after opening serve');
ctx.paused=true;
vm.runInContext('loop(1400);loop(1500)',ctx);
assert.equal(ctx.matchMs,100,'Pause freezes the clock');
ctx.paused=false;
vm.runInContext('loop(1550)',ctx);
assert.equal(ctx.matchMs,150,'Resume continues from saved duration');

// A later point resets the rally clock but NOT the match clock.
// Remain idle before its next serve and verify NO match time is charged.
ctx.pointMs=0;ctx.awaitServe=true;
vm.runInContext('loop(1600);loop(1700);loop(1800)',ctx);
assert.equal(ctx.matchMs,150,'Waiting for second serve must freeze match duration');
assert.equal(ctx.pointMs,0,'Point clock must remain 00:00 while the ball sits idle');
ctx.lastTouch=null;ctx.touchLock=0;ctx.lastVolleySide=null;
ctx.consecutiveTouches=0;ctx.red.hitCooldown=0;
ctx.ball={x:ctx.red.x,y:ctx.red.y-ctx.red.r*1.05-60,vx:0,vy:5,r:36};
assert.equal(vm.runInContext('collide(red)',ctx),true);
assert.equal(ctx.matchMs,150,'Subsequent serves must not reset the match clock');
vm.runInContext('loop(1850)',ctx);
assert.equal(ctx.matchMs,200,'Match resumes counting after the next actual hit');
assert.equal(ctx.pointMs,50,'Only point clock restarts on the next serve');

// Screenshot metadata must show the SAME difficulty value the CPU's
// actual tick() reads, not a hardcoded level.
assert(html.includes("const difficulty=$('difficulty').value;"),
 'AI difficulty must come from the same setting shown in the label');
for(const value of ['easy','normal','hard']){
 el('difficulty').value=value;
 vm.runInContext('updateMatchLevelBadge()',ctx);
 assert.equal(el('difficultyHud').textContent,
  value[0].toUpperCase()+value.slice(1));
 vm.runInContext('showFinalMatchLevel()',ctx);
 assert.equal(el('finalDifficulty').textContent,
  'Difficulty: '+value[0].toUpperCase()+value.slice(1));
 assert.equal(el('finalDifficulty').hidden,false);
}
el('difficulty').value='easy';
assert.equal(el('finalDifficulty').textContent,'Hard',
 'Completed screenshot must retain its finished difficulty if Settings changes');
ctx.localMode='host';
vm.runInContext('updateMatchLevelBadge();showFinalMatchLevel()',ctx);
assert.equal(el('difficultyHud').textContent,'Wi-Fi');
assert.equal(el('finalDifficulty').textContent,'Wi-Fi');
ctx.localMode='guest';
vm.runInContext('updateMatchLevelBadge()',ctx);
assert.equal(el('difficultyHud').textContent,'Mode: Wi-Fi • 2 Players');
console.log('Match timer freezes before every serve and resumes on ball contact; concise Easy/Normal/Hard replaces top-left status in snapshots.');
