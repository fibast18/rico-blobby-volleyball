'use strict';
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const begin=html.indexOf("const HISTORY_KEY='rico-blobby-time-history-v1'");
const end=html.indexOf('// Match clock runs for the whole race to 15;',begin);
assert(begin>=0&&end>begin,'Production timing ledger must be present');
assert(html.includes('id="matchTimer" type="button"'),'Match timer must be tappable');
assert(html.includes('id="pointTimer" type="button"'),'Point timer must be tappable');
assert(html.includes('button.clock{pointer-events:auto'),'Clock buttons must receive iPhone touches');
assert(html.includes('id="historyPanel"'),'History dialog missing');
assert(html.includes('id="historyClose"'),'History close control missing');
assert(html.includes("recordPointTime(side);"),'Every scored point must record duration');
assert(html.includes("recordMatchTime('completed');"),'Finished matches must record duration');
assert(html.includes("recordMatchTime('restarted');"),'Restarting a played match must preserve its history');
assert(html.includes('matchId,matchStartedAt,pointNumber,lastVolleySide'),
 'Paused match snapshot must preserve ledger identity');
assert(html.includes('restoreSavedMatch();')&&
 html.includes('requestAnimationFrame(loop);'),
 'Match restore must continue original ledger and first-serve guidance after app exit');
assert(html.includes('history-items{touch-action:pan-y!important}'),
 'The iPhone history list should scroll vertically');

const data=new Map(),elements={};
function node(){
 return {
  textContent:'',hidden:false,children:[],attrs:{},className:'',
  setAttribute(name,value){this.attrs[name]=value},
  append(...kids){this.children.push(...kids)},
  replaceChildren(){this.children=[]},
  focus(){this.focused=true}
 };
}
for(const name of ['historyMatches','historyPoints','historyTitle','historySummary','historyItems',
 'historyPanel','historyClose'])elements[name]=node();
elements.historyPanel.hidden=true;
const state={
 localStorage:{
  getItem:key=>data.has(key)?data.get(key):null,
  setItem:(key,value)=>data.set(key,value),
 },
 red:{score:0},blue:{score:0},pointMs:0,matchMs:0,running:false,paused:false,
 $:id=>elements[id],
 document:{activeElement:node(),createElement:node},
 setPaused(value){this.paused=value},
 clockText(ms){const total=Math.floor(ms/1000);return String(Math.floor(total/60)).padStart(2,'0')
  +':'+String(total%60).padStart(2,'0')}
};
// setPaused() must be a normal function: called without a 'this' binding.
state.setPaused=function(value){state.paused=value};
vm.createContext(state);
vm.runInContext(html.slice(begin,end),state,{timeout:1000});
vm.runInContext('newMatchIdentity()',state);
vm.runInContext('red.score=1;blue.score=0;pointMs=12340;matchMs=26340;recordPointTime("red")',state);
assert(data.has('rico-blobby-time-history-v1'),'Point data must persist immediately');
let saved=JSON.parse(data.get('rico-blobby-time-history-v1'));
assert.equal(saved.points.length,1);
assert.equal(saved.points[0].durationMs,12340);
assert.equal(saved.points[0].number,1);
assert.equal(saved.points[0].redScore,1);
vm.runInContext('red.score=1;blue.score=1;pointMs=7000;matchMs=37000;recordPointTime("blue")',state);
saved=JSON.parse(data.get('rico-blobby-time-history-v1'));
assert.equal(saved.points.length,2);
assert.equal(saved.points[0].durationMs,7000);
assert.equal(saved.points[0].winner,'blue');
assert.equal(saved.points[0].number,2);
vm.runInContext('red.score=15;blue.score=8;matchMs=248000;recordMatchTime("completed")',state);
saved=JSON.parse(data.get('rico-blobby-time-history-v1'));
assert.equal(saved.matches.length,1);
assert.equal(saved.matches[0].durationMs,248000);
assert.equal(saved.matches[0].redScore,15);
assert.equal(saved.matches[0].blueScore,8);
assert.equal(saved.matches[0].winner,'red');
vm.runInContext('recordMatchTime("completed")',state);
saved=JSON.parse(data.get('rico-blobby-time-history-v1'));
assert.equal(saved.matches.length,1,'One match must never be duplicated');

vm.runInContext('timeHistory=loadTimeHistory()',state);
vm.runInContext('showTimeHistory("points")',state);
assert.equal(elements.historyItems.children.length,2,'Point list must show saved rallies');
assert.equal(elements.historySummary.textContent,'2 recorded points • newest first');
vm.runInContext('showTimeHistory("matches")',state);
assert.equal(elements.historyItems.children.length,1,'Match list must show saved games');
assert(elements.historyItems.children[0].children[0].children[0].textContent.includes('Red won'),
 'Completed match must show the winner');
state.running=true;state.paused=false;
vm.runInContext('openTimeHistory("points")',state);
assert(state.paused,'Opening history during a match must pause time');
assert.equal(elements.historyPanel.hidden,false);
vm.runInContext('closeTimeHistory()',state);
assert(!state.paused,'Closing history resumes a match that was previously playing');
assert.equal(elements.historyPanel.hidden,true);

vm.runInContext('newMatchIdentity();red.score=2;blue.score=1;matchMs=42000;recordMatchTime("restarted")',state);
saved=JSON.parse(data.get('rico-blobby-time-history-v1'));
assert.equal(saved.matches.length,2,'Restarted games keep their own duration');
assert.equal(saved.matches[0].status,'restarted');
assert.equal(saved.matches[0].durationMs,42000);
console.log('Match and point time history, local persistence, paused viewing and restart history passed.');
