'use strict';
// Executes the production player-name storage/editor functions and verifies
// an accessible tappable label above the full-screen movement touch surface.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const page=fs.readFileSync('index.html','utf8');
assert(page.includes('id="playerNameButton"'),'PLAYER must be a real tappable button');
assert(page.includes("bindHudButton('playerNameButton',openPlayerNameEditor)"),
 'Player label should share the proven immediate iPhone touch handler');
assert(page.includes('id="playerNamePanel"'),'Editing modal missing');
assert(page.includes('id="playerNameInput"'),'Name input missing');
assert(page.includes('id="playerNameForm"'),'Name save form missing');
assert(page.includes('id="playerNameCancel"'),'Cancel option missing');
assert(page.includes('id="playerNameSave"'),'Save action missing');
assert(page.includes('z-index:20;left:11%;top:15.1%'),
 'Name label must sit above invisible movement controls at original PLAYER position');
assert(page.includes('background:transparent;border:0;box-shadow:none;'),
 'Player label must have no distracting box');
assert(!page.includes("ctx.strokeText('PLAYER'"),
 'Old drawn PLAYER text must not be duplicated behind button');
assert(page.includes("localMode==='ai'?'OPPONENT':peerName"),
 'CPU opponent label must remain while LAN mode shows the human opponent');

const begin=page.indexOf("const PLAYER_NAME_KEY='rico-blobby-player-name-v1';");
const end=page.indexOf('function updateMovementTarget(clientX,clientY){',begin);
assert(begin>=0&&end>begin,'Production player-name editor helpers absent');
const saved=new Map(),elements={};
for(const id of ['playerNameButton','playerNamePanel','playerNameInput']){
 elements[id]={textContent:'',value:'',hidden:id==='playerNamePanel',focus(){this.focused=true}};
}
let pauses=[];
const ctx={
 localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},
 $:id=>elements[id],running:true,paused:false,localMode:'ai',
 setPaused:value=>{ctx.paused=value;pauses.push(value)},
 document:{hidden:false}
};
vm.createContext(ctx);
vm.runInContext(page.slice(begin,end),ctx,{timeout:1000});
assert.equal(vm.runInContext('playerName',ctx),'PLAYER','Default label must be PLAYER');
vm.runInContext('openPlayerNameEditor()',ctx);
assert(ctx.paused,'Editing name during active match must pause the game');
assert.equal(elements.playerNamePanel.hidden,false,'Editor must open');
assert.equal(elements.playerNameInput.value,'','Default PLAYER opens with empty editable field');
assert(elements.playerNameInput.focused,'Editing input should focus automatically');
vm.runInContext('savePlayerName("  Rico   J Pono  ");closePlayerNameEditor()',ctx);
assert.equal(elements.playerNameButton.textContent,'Rico J Pono');
assert.equal(saved.get('rico-blobby-player-name-v1'),'Rico J Pono');
assert.equal(elements.playerNamePanel.hidden,true);
assert.equal(ctx.paused,false,'Closing editor resumes a previously playing match');
assert.deepEqual(pauses,[true,false],'Editor should pause and resume exactly once');
assert(elements.playerNameButton.focused,'Focus returns to player label');

ctx.paused=true;
vm.runInContext('openPlayerNameEditor()',ctx);
vm.runInContext('closePlayerNameEditor()',ctx);
assert.equal(ctx.paused,true,'Editing during a paused game should leave it paused');
vm.runInContext('savePlayerName("    ")',ctx);
assert.equal(elements.playerNameButton.textContent,'PLAYER','Blank name resets to PLAYER');
vm.runInContext('savePlayerName("123456789012345678901234")',ctx);
assert.equal(elements.playerNameButton.textContent.length,18,'Name must remain short enough for score HUD');
vm.runInContext('savePlayerName("<img src=x>")',ctx);
assert.equal(elements.playerNameButton.textContent,'<img src=x>',
 'Names must render as plain text, not HTML');
assert(page.includes("$('playerNameForm').addEventListener('submit',event=>"),
 'Save should handle keyboard Done and the Save button');
console.log('Player-name tap UI, local saving, input validation and pause/resume tests passed.');
