'use strict';
// Exercise the actual Android fullscreen helper with simulated smartphone
// browser APIs. Fullscreen requires a genuine Play tap in browser tabs,
// while an installed fullscreen PWA must not repeatedly request it.
const fs=require('node:fs'),vm=require('node:vm'),assert=require('node:assert/strict');
const html=fs.readFileSync('index.html','utf8');
const manifest=JSON.parse(fs.readFileSync('manifest.webmanifest','utf8'));
assert.equal(manifest.display,'fullscreen','Installed Android PWA must hide system status bar');
assert.equal(manifest.display_override[0],'fullscreen','Fullscreen is the preferred PWA display mode');
assert.equal(manifest.orientation,'landscape','Both Android and iPhone prefer landscape game play');
assert(html.includes('html:fullscreen,html:-webkit-full-screen'),
 'Fullscreen document and body must occupy the entire physical display');
assert(html.includes('id="androidFullscreen"'),
 'Android users need a manual fullscreen control after exiting immersive mode');
assert(html.includes("'androidFullscreen').onclick=requestImmersiveGameFullscreen"),
 'Settings fullscreen button must be a real user-triggered action');
assert(html.includes("window.matchMedia?.('(display-mode: fullscreen)').matches"),
 'Installed fullscreen PWA must be recognized even when fullscreenElement is null');
assert(html.includes("document.addEventListener('fullscreenchange'"),
 'Game court must recalculate viewport after entering or exiting Android fullscreen');
assert(html.includes("$('wifiStart').addEventListener('click',requestImmersiveGameFullscreen,{capture:true})"),
 'Multiplayer start must use the phone tap to request Android fullscreen');
assert(html.includes("requestImmersiveGameFullscreen();wakeAudio();LocalWifi.openPairing()"),
 'Wi-Fi pairing screen must enter immersive mode on its opening tap');
const play=html.slice(html.indexOf("$('start').onclick=()=>{"),
 html.indexOf('// iOS can delay',html.indexOf("$('start').onclick=()=>{")));
assert(play.includes('requestImmersiveGameFullscreen();'),
 'Single-player Play must enter fullscreen as a synchronous tap action');
const from=html.indexOf('function isAndroidDevice(){');
const until=html.indexOf('function resizeCourt(){',from);
assert(from>0&&until>from,'Production Android fullscreen implementation not found');
const code=html.slice(from,until);
function device({android=true,installed=false,already=false,optionsRejected=false,
 supported=true}={}){
 const calls=[],fullBtn={hidden:false};
 const root={};
 const document={
  documentElement:root,
  fullscreenElement:already?root:null,
  webkitFullscreenElement:null
 };
 if(supported){
  root.requestFullscreen=opts=>{
   calls.push(['requestFullscreen',opts]);
   if(optionsRejected&&opts)throw Error('Unsupported options');
   document.fullscreenElement=root;
   return Promise.resolve();
  };
 }
 const window={
  matchMedia:q=>({matches:installed&&q==='(display-mode: fullscreen)'})
 };
 const navigator={userAgent:android?
  'Mozilla/5.0 (Linux; Android 16; SAMSUNG SM-S938B) AppleWebKit/537.36 Chrome/130.0':
  'Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X)'};
 const ctx={window,document,navigator,
  $:id=>id==='androidFullscreen'?fullBtn:null,
  lastLayoutSignature:'cached',
  requestLandscapeOrientation:()=>calls.push(['lockLandscape']),
  resizeCourt:()=>calls.push(['resizeCourt'])};
 vm.createContext(ctx);
 vm.runInContext(code,ctx,{timeout:1000});
 return {ctx,calls,fullBtn,document,root};
}
async function flush(){await Promise.resolve();await Promise.resolve()}
(async()=>{
 let x=device();
 vm.runInContext('refreshAndroidFullscreenButton()',x.ctx);
 assert.equal(x.fullBtn.hidden,false,'Fullscreen control visible on Android browser');
 vm.runInContext('requestImmersiveGameFullscreen()',x.ctx);
 assert.equal(x.calls[0][0],'requestFullscreen','Fullscreen requested immediately on tap');
 assert.equal(x.calls[0][1].navigationUI,'hide','Request must hide browser navigation');
 assert.equal(x.document.fullscreenElement,x.root,'Entire HTML root must become fullscreen');
 await flush();
 assert(x.calls.some(c=>c[0]==='lockLandscape'),'Lock landscape only after fullscreen succeeds');
 assert(x.calls.some(c=>c[0]==='resizeCourt'),'Resize the game to newly available screen space');
 assert.equal(x.fullBtn.hidden,true,'Hide redundant fullscreen setting once immersive');
 let n=x.calls.length;
 vm.runInContext('requestImmersiveGameFullscreen()',x.ctx);
 assert(!x.calls.slice(n).some(c=>c[0]==='requestFullscreen'),
  'Do not repeat fullscreen request when already fullscreen');

 x=device({android:true,installed:true});
 vm.runInContext('refreshAndroidFullscreenButton();requestImmersiveGameFullscreen()',x.ctx);
 assert.equal(x.fullBtn.hidden,true,'Installed fullscreen PWA should hide manual control');
 assert(!x.calls.some(c=>c[0]==='requestFullscreen'),
  'Android installed PWA is already fullscreen even with fullscreenElement null');

 x=device({android:false});
 vm.runInContext('refreshAndroidFullscreenButton();requestImmersiveGameFullscreen()',x.ctx);
 assert.equal(x.fullBtn.hidden,true,'Do not show Android fullscreen setting on iPhone');
 assert.equal(x.calls.filter(c=>c[0]==='requestFullscreen').length,0,
  'Do not invoke the browser fullscreen API on iOS');
 assert.equal(x.calls.filter(c=>c[0]==='lockLandscape').length,1,
  'Preserve previous iPhone landscape behavior');

 x=device({optionsRejected:true});
 vm.runInContext('requestImmersiveGameFullscreen()',x.ctx);
 await flush();
 assert.equal(x.calls.filter(c=>c[0]==='requestFullscreen').length,2,
  'Older Android browsers should retry without navigationUI options');
 assert(x.calls.some(c=>c[0]==='lockLandscape'));

 x=device({supported:false});
 vm.runInContext('requestImmersiveGameFullscreen()',x.ctx);
 assert.equal(x.calls.length,0,'Missing Fullscreen API should not crash the game');

 console.log('Android fullscreen PWA launch, Play tap, system UI hide, orientation, iOS compatibility and fallback passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
