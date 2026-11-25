'use strict';
// Reuse the REAL guest input and draw functions. Both phones should see
// themselves on the LEFT with a left-side slider, while the one host keeps
// unmirrored physics, scores, jumps, and the network transport.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
function between(start,end){
 const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
 assert(a>=0&&b>a,'Missing production section '+start);
 return html.slice(a,b);
}
assert(html.includes('#playerNameButton.blue-local{left:11%!important}'),
 'Blue local name must be at the LEFT on Player 2 screen');
assert(html.includes('const visibleBallX=localMode===\'guest\'?W-ball.x:ball.x'),
 'Offscreen ball locator must follow mirrored view');
assert(html.includes("ctx.restore(); // Player names, score and BALL text stay readable"),
 'The world transform must be restored before rendering text');

function checkSlider(width){
 const state={
  W:width,netX:width/2,netHalf:7,localMode:'guest',
  red:{r:49.45,x:width*.25},blue:{r:49.45,x:width*.75},
  clamp:(v,a,b)=>Math.max(a,Math.min(b,v)),
  slideTargetX:null,slidePointerId:null,
  slider:{attributes:{},style:{},setAttribute(n,v){this.attributes[n]=v}},
  thumb:{style:{}},
  stage:{getBoundingClientRect:()=>({left:0,top:0,width,height:450})},
  document:{body:{classList:{contains:()=>false}}}
 };
 state.$=id=>id==='movementPad'?state.slider:state.thumb;
 vm.createContext(state);
 vm.runInContext(between('function updateMovementTarget(clientX,clientY){',
  '// Bounded online adaptation.'),state,{timeout:1000});
 vm.runInContext(between('function localPaddleFraction(){','function sendLocalSnapshot(){'),
  Object.assign(state,{LocalWifi:{send(){}}}),{timeout:1000});
 const min=state.netX+state.netHalf+state.blue.r,max=state.W-state.blue.r;
 vm.runInContext('updateMovementTarget(0,20)',state);
 assert(Math.abs(state.slideTargetX-max)<.001,'Guest LEFT finger -> host Blue far right');
 assert(Math.abs(vm.runInContext('localPaddleFraction()',state)-1)<.001,
  'Guest LEFT finger -> authoritative input x=1');
 vm.runInContext('updateMovementTarget('+width/2+',20)',state);
 assert(Math.abs(state.slideTargetX-min)<.001,'Guest RIGHT finger -> host Blue near net');
 assert(Math.abs(vm.runInContext('localPaddleFraction()',state))<.001,
  'Guest RIGHT finger -> authoritative input x=0');
 vm.runInContext('updateMovementTarget('+width/4+',20)',state);
 assert(Math.abs(state.slideTargetX-(min+max)/2)<.001,
  'Middle of local slider -> middle of physical Blue half');
 assert.equal(state.slider.attributes['aria-valuenow'],'50',
  'Slider accessibility must read 0 to 100 from local LEFT to RIGHT');
 // Displayed thumb must follow the new local-left perspective, not host X.
 state.blue.x=min;
 vm.runInContext('updateMovementVisual()',state);
 assert.equal(state.thumb.style.left,'100%',
  'Blue by host net is visibly at the RIGHT edge of guest slider');
 state.blue.x=max;
 vm.runInContext('updateMovementVisual()',state);
 assert.equal(state.thumb.style.left,'0%',
  'Blue by host outside wall is visibly at the LEFT edge of guest slider');
 state.localMode='ai';
 vm.runInContext('updateMovementTarget(0,20)',state);
 assert.equal(state.slideTargetX,state.red.r,'Single player Red must still map LEFT to Red wall');
 vm.runInContext('updateMovementTarget('+width/2+',20)',state);
 assert(Math.abs(state.slideTargetX-(state.netX-state.netHalf-state.red.r))<.001,
  'Single-player Red RIGHT finger must still map near the net');
}
checkSlider(800);
checkSlider(1080);

function render(mode,highBall=false){
 const texts=[],drawn=[],transforms=[];
 const context={
  mirrored:false,saveStack:[],
  save(){this.saveStack.push(this.mirrored)},
  restore(){this.mirrored=this.saveStack.pop()},
  translate(x,y){transforms.push(['translate',x,y])},
  scale(x,y){if(x===-1)this.mirrored=true;transforms.push(['scale',x,y])},
  createLinearGradient(){return {addColorStop(){}}},
  createRadialGradient(){return {addColorStop(){}}},
  beginPath(){},moveTo(){},lineTo(){},quadraticCurveTo(){},
  closePath(){},fill(){},stroke(){},ellipse(){},fillRect(){},drawImage(){},
  fillText(t,x,y){texts.push({t:String(t),x,y,mirrored:this.mirrored})},
  strokeText(t,x,y){texts.push({t:String(t),x,y,mirrored:this.mirrored})}
 };
 const W=800,H=500,red={x:200,score:3},blue={x:610,score:9};
 const ball={x:660,y:highBall?10:180,r:36};
 const state={ctx:context,W,H,netX:400,netHalf:7,netTop:262,
  ground:430,ball,red,blue,localMode:mode,
  peerName:'Rico Opponent',
  backdrop:{width:800,height:500},
  canvas:{width:800},
  renderBackdrop(){},
  drawBlob(p,color){drawn.push({color,x:context.mirrored?W-p.x:p.x})},
  drawBall(){drawn.push({color:'ball',x:context.mirrored?W-ball.x:ball.x})}
 };
 vm.createContext(state);
 vm.runInContext(between('function draw(){','// iOS Home Screen PWAs'),state,{timeout:1000});
 vm.runInContext('draw()',state);
 return {texts,drawn,transforms,ctx:context};
}
const host=render('host');
assert.deepEqual(host.drawn.map(p=>[p.color,p.x]),[['red',200],['blue',610],['ball',660]],
 'Host must retain Red at left and Blue at right');
assert(!host.transforms.some(t=>t[0]==='scale'&&t[1]===-1),
 'Do not mirror the host court');
assert(host.texts.some(p=>p.t==='3 : 9'&&!p.mirrored),
 'Host scoreboard must remain Red:Blue');
assert(host.texts.some(p=>p.t==='RICO OPPONENT'&&p.x===712&&!p.mirrored),
 'Host opponent label remains readable on the RIGHT');

const guest=render('guest');
assert.deepEqual(guest.drawn.map(p=>[p.color,p.x]),[['red',600],['blue',190],['ball',140]],
 'Guest must see Blue on LEFT and Red on RIGHT, with the same mirrored ball');
assert(guest.transforms.some(t=>t[0]==='translate'&&t[1]===800),
 'Guest drawing needs court-width translation');
assert(guest.transforms.some(t=>t[0]==='scale'&&t[1]===-1),
 'Guest drawing needs horizontal mirror');
assert(guest.texts.some(p=>p.t==='9 : 3'&&!p.mirrored),
 'Guest score on LEFT must be its own Blue score');
assert(guest.texts.some(p=>p.t==='RICO OPPONENT'&&p.x===712&&!p.mirrored),
 'Guest opponent label should stay on RIGHT and not be backwards');
assert(guest.ctx.saveStack.length===0&&guest.ctx.mirrored===false,
 'Guest must restore canvas drawing transforms for the next frame');

const guestSky=render('guest',true);
assert(guestSky.texts.some(p=>p.t==='BALL'&&p.x===140&&!p.mirrored),
 'Guest offscreen-ball marker must follow the visually flipped ball');
console.log('Mirrored Blue guest view, local-left slide/jump, scores, names, ball and unchanged Red host view passed.');
