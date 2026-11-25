'use strict';
// Reproduce the iPhone PWA screenshot: landscape visual viewport is shorter
// than the device screen; ensure the court fills the real standalone screen.
// Also test portrait 90° rotation without distorting 2-finger controls.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
assert.equal(manifest.orientation,'landscape','Manifest requests landscape when supported');
assert(html.includes('body.fullscreen.portrait-landscape #stage'),'Portrait orientation fallback missing');
assert(html.includes('rotate(90deg)!important'),'Portrait must render the court in landscape');
assert(html.includes('height:var(--game-screen-h,100dvh)!important'),'Stage must use corrected viewport height');
assert(html.includes('const courtW=stage.clientWidth,courtH=stage.clientHeight'),
 'Physics must measure unrotated court sizes, not transformed bounding rect');

const start=html.indexOf("let lastLayoutSignature='';");
const end=html.indexOf("window.addEventListener('resize',resizeCourt)",start);
assert(start>=0&&end>start,'Production viewport code not found');
const classes=new Set();
const styles=new Map();
let courtWidth=956,courtHeight=440,backdropCount=0;
const document={
 documentElement:{
  clientWidth:956,clientHeight:375,
  style:{setProperty:(name,value)=>styles.set(name,value)}
 },
 body:{classList:{
  toggle:(name,value)=>value?classes.add(name):classes.delete(name),
  contains:name=>classes.has(name)
 }}
};
const screen={width:956,height:440,orientation:{}};
const visualViewport={width:956,height:375,offsetLeft:0,offsetTop:0};
const window={
 innerWidth:956,innerHeight:375,screen,visualViewport,
 matchMedia:()=>({matches:true})
};
const navigator={userAgent:'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)',standalone:true,maxTouchPoints:5};
const stage={get clientWidth(){return courtWidth},get clientHeight(){return courtHeight}};
const canvas={width:800,height:500};
const ctx={window,document,navigator,stage,canvas,
 H:500,W:800,red:{x:195,vx:0},blue:{x:600,vx:0},ball:{x:195,vx:0},
 netX:400,renderBackdrop:()=>{backdropCount++}};
vm.createContext(ctx);
vm.runInContext(html.slice(start,end),ctx,{timeout:1000});
vm.runInContext('syncGameViewport();resizeCourt()',ctx);
assert.equal(styles.get('--game-screen-h'),'440px',
 'Landscape iPhone web app must fill 440px screen despite 375px visual viewport');
assert.equal(styles.get('--game-screen-w'),'956px',
 'Court should extend across landscape screen width');
assert(!classes.has('portrait-landscape'),'Landscape opening must not rotate court');
assert(Math.abs(ctx.W-(500*956/440))<1,'Landscape game physics must preserve aspect ratio');

// The same phone now opens upright. Rotate the court without changing its
// physical proportions; long axis becomes the vertical finger movement.
window.innerWidth=440;window.innerHeight=900;
visualViewport.width=440;visualViewport.height=900;
document.documentElement.clientWidth=440;document.documentElement.clientHeight=900;
vm.runInContext('syncGameViewport()',ctx);
assert(classes.has('portrait-landscape'),'Portrait iPhone must use landscape-rendered mode');
assert.equal(styles.get('--game-portrait-long'),'956px');
assert.equal(styles.get('--game-portrait-short'),'440px');
assert.equal(styles.get('--game-screen-h'),'956px');
// New CSS orientation keeps the *layout* dimensions in landscape.
courtWidth=956;courtHeight=440;
vm.runInContext('resizeCourt()',ctx);
assert(Math.abs(ctx.W-(500*956/440))<1,'Rotating court must not squeeze gameplay');

const beginMove=html.indexOf('function updateMovementTarget(clientX,clientY){');
const endMove=html.indexOf('function updateMovementVisual(){',beginMove);
assert(beginMove>=0&&endMove>beginMove,'Production touch mapping missing');
const slider={value:null,setAttribute(_name,value){this.value=Number(value)}};
ctx.$=()=>slider;ctx.clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
ctx.netHalf=7;ctx.red.r=49.45;
ctx.slideTargetX=null;ctx.localMode='ai';
stage.getBoundingClientRect=()=>classes.has('portrait-landscape')?
 {left:0,top:0,width:440,height:956}:
 {left:0,top:0,width:956,height:440};
vm.runInContext(html.slice(beginMove,endMove),ctx,{timeout:1000});
vm.runInContext('updateMovementTarget(220,239)',ctx);
const expected=ctx.red.r+0.5*(ctx.netX-ctx.netHalf-2*ctx.red.r);
assert(Math.abs(ctx.slideTargetX-expected)<.01,
 'On upright iPhone, vertical touch location must map onto horizontal Red court');
vm.runInContext('updateMovementTarget(220,478)',ctx);
assert.equal(slider.value,100,'Physical Y=half the screen selects right edge of Red court');

classes.delete('portrait-landscape');
vm.runInContext('updateMovementTarget(239,190)',ctx);
assert(Math.abs(ctx.slideTargetX-expected)<.01,
 'Landscape touch should still use the usual physical X position');
// Android phones also need the landscape-rendered fallback and safe sizing.
navigator.userAgent='Mozilla/5.0 (Linux; Android 15; Pixel 9; Mobile)';
navigator.standalone=false;
window.screen.width=393;window.screen.height=873;
window.innerWidth=393;window.innerHeight=873;
visualViewport.width=393;visualViewport.height=873;
document.documentElement.clientWidth=393;document.documentElement.clientHeight=873;
vm.runInContext('syncGameViewport()',ctx);
assert(classes.has('portrait-landscape'),
 'Android portrait phone must render a landscape court even without orientation lock');
assert.equal(styles.get('--game-portrait-long'),'873px');
assert.equal(styles.get('--game-portrait-short'),'393px');
window.innerWidth=873;window.innerHeight=393;
visualViewport.width=873;visualViewport.height=393;
document.documentElement.clientWidth=873;document.documentElement.clientHeight=393;
vm.runInContext('syncGameViewport()',ctx);
assert(!classes.has('portrait-landscape'),'Rotating Android to landscape must remove visual transform');
assert.equal(styles.get('--game-screen-w'),'873px');
assert.equal(styles.get('--game-screen-h'),'393px');
ctx.localMode='guest';ctx.blue.r=49.45;
vm.runInContext('updateMovementTarget(219,150)',ctx);
const guestMin=ctx.netX+ctx.netHalf+ctx.blue.r;
const guestMax=ctx.W-ctx.blue.r;
assert(Math.abs(ctx.slideTargetX-(guestMin+(guestMax-guestMin)*.5))<.01,
 'On different phone sizes, guest finger tracking should map onto Blue court');
console.log('iPhone and Android screen sizing, rotation and both-player touch mappings passed.');
