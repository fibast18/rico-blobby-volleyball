'use strict';
// Exercise real first-serve instruction state, including mobile graphics,
// the first legally registered serve, and the Settings replay override.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('Slide left side to move • Tap right side to jump and serve'),
 'The first-serve message must name the left slider and right jump/serve area');
assert(html.includes('id="serveGuide"')&&html.includes('id="controlGuideSetting"'),
 'Instruction overlay and replay control must exist');
assert(html.includes('#controls.guide-active .slide-track')&&
 html.includes('#controls.guide-active [data-control=jump]'),
 'The slider AND jump area must visibly brighten for the first serve');
assert(html.includes("if(awaitServe){\n  matchStarted=true;")&&
 html.includes('firstServeContact();'),
 'The actual serve collision must dismiss the instructions, not Play tap or a timer');
assert(html.includes("if(matchStarted)firstServeContact()"),
 'Player 2 must dismiss hints after the authoritative host reports the first serve');
const start=html.indexOf('let firstServeCompleted=true,guidePinned=false,guideFadeSerial=0;');
const end=html.indexOf("let localMode='ai'",start);
assert(start>=0&&end>start,'Game hint implementation not found');
const pending=[],els=new Map();
function makeElement(){
 const states=new Set();
 return {hidden:true,textContent:'',classList:{
  add(name){states.add(name)},remove(name){states.delete(name)},
  contains(name){return states.has(name)}
 }};
}
for(const id of ['serveGuide','controls','controlGuideSetting'])els.set(id,makeElement());
const context={running:true,$:id=>els.get(id),setTimeout:fn=>{pending.push(fn);return pending.length}};
vm.createContext(context);
vm.runInContext(html.slice(start,end),context,{timeout:1000});
const guide=els.get('serveGuide'),controls=els.get('controls');
vm.runInContext('firstServeCompleted=false;updateControlGuide()',context);
assert.equal(guide.hidden,false,'Guide must show while waiting for first serve');
assert.equal(controls.classList.contains('guide-active'),true,'Touch areas must be highlighted');
vm.runInContext('firstServeContact()',context);
assert.equal(guide.classList.contains('fading'),true,'Guide should fade after first contact');
assert.equal(controls.classList.contains('guide-active'),false,'Touch highlight must dim after serve');
pending.splice(0).forEach(fn=>fn());
assert.equal(guide.hidden,true,'Guide must become invisible after fade');
vm.runInContext('firstServeContact()',context);
assert.equal(guide.hidden,true,'Later contacts must not re-open help');
vm.runInContext('guidePinned=true;updateControlGuide()',context);
assert.equal(guide.hidden,false,'Settings can re-show controls after first serve');
assert.equal(controls.classList.contains('guide-active'),true);
assert.match(els.get('controlGuideSetting').textContent,/Hide controls/);
vm.runInContext('firstServeContact()',context);
assert.equal(guide.hidden,false,'Manual guide remains until Settings hides it');
vm.runInContext('guidePinned=false;updateControlGuide()',context);
pending.splice(0).forEach(fn=>fn());
assert.equal(guide.hidden,true,'Settings can hide replayed instructions');
assert.match(els.get('controlGuideSetting').textContent,/Show controls/);
vm.runInContext('running=false;firstServeCompleted=false;updateControlGuide()',context);
assert.equal(guide.hidden,true,'Instructions do not cover opening/final result screen');
assert(html.includes('firstServeCompleted=false;')&&
 html.includes("serveReset('red');running=true;\n updateControlGuide();"),
 'Every new match must give new players a visible first-serve introduction');
console.log('First-serve slider and jump cues, fade, AI/Wi-Fi serve timing and Settings replay passed.');
