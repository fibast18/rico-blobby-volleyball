'use strict';
// Real offline pairing state machine: CRLF host candidates are valid,
// but a browser with no local ICE address must NEVER show a shareable QR
// or tell Player 2 to scan a nonexistent code.
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('local-wifi.js','utf8');
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('id="wifiNextTitle"')&&html.includes('id="wifiNextDetail"'),
 'Pairing must prominently show the next action');
assert(html.includes('id="wifiRetry"')&&html.includes('id="wifiErrorHelp"'),
 'Browser LAN failure needs an explicit no-QR recovery screen');
assert(source.includes("showNextAction('SHOW THIS QR'"));
assert(source.includes("showNextAction('SCAN THE OTHER PHONE'"));
const fake={offerWithHost:false};
class RTC{
 constructor(config){assert.equal(config.iceServers.length,0);
  this.iceGatheringState='complete';this.signalingState='stable';
 }
 createDataChannel(){return {readyState:'connecting',close(){}}}
 async createOffer(){return {type:'offer',sdp:fake.offerWithHost?
  'v=0\r\na=candidate:1 1 udp 2113937151 192.168.1.11 60115 typ host\r\n':
  'v=0\r\na=ice-options:trickle\r\n'}}
 async setLocalDescription(desc){this.localDescription=desc;this.signalingState='have-local-offer'}
 addEventListener(){}
 removeEventListener(){}
 close(){}
}
const els=new Map();
function $(id){
 if(!els.has(id)){
  const listeners={};const states=new Set();
  els.set(id,{id,textContent:'',hidden:id!=='wifiStartNew',value:'',innerHTML:'',
   listeners,classList:{toggle(name,flag){if(flag)states.add(name);else states.delete(name)}},
   replaceChildren(){this.innerHTML=''},
   addEventListener(name,fn){(listeners[name]??=[]).push(fn)},
   async click(){for(const fn of listeners.click||[])await fn()},
   }
  );
 }
 return els.get(id);
}
const ctx={
 window:{},document:{getElementById:$},
 navigator:{},RTCPeerConnection:RTC,
 TextEncoder,TextDecoder,Uint8Array,btoa,atob,
 qrcode:()=>({addData(){},make(){},createSvgTag(){return '<svg role="img"></svg>'}}),
 setInterval:()=>1,clearInterval:()=>{},setTimeout,clearTimeout,
};
vm.createContext(ctx);
vm.runInContext(source,ctx);
const messages=[];
ctx.window.LocalWifi.attach({onMessage:m=>messages.push(m)});
const candidates=ctx.window.LocalWifi._test.localCandidates;
assert.equal(candidates('v=0\r\na=candidate:1 1 udp 2 192.168.1.4 3012 typ host\r\n').length,1,
 'Typical CRLF WebRTC host candidate must not be falsely rejected');
assert.equal(candidates('v=0\r\na=candidate:1 1 udp 2 abc123.local 3012 typ host\r\n').length,1,
 'Privacy-preserving local mDNS ICE address should be accepted');
assert.equal(candidates('v=0\r\na=candidate:1 1 udp 2 1.1.1.1 3012 typ srflx\r\n').length,0,
 'Reject candidates which are not local LAN host candidates');
(async()=>{
 ctx.window.LocalWifi.openPairing();
 await $('wifiCreate').click();
 assert($('wifiStep').textContent.includes('Cannot pair'),
  'Do not display Show QR after browser fails to supply LAN address');
 assert($('wifiNextTitle').textContent.includes('NO QR GENERATED'),
  'User must know there is no QR to share or scan');
 assert.equal($('wifiQr').innerHTML,'','No fake QR should appear');
 assert.equal($('wifiQr').hidden,true);
 assert.equal($('wifiScan').hidden,true,'Do not offer scanning if local offer cannot be made');
 assert.equal($('wifiStart').hidden,true,'Do not offer Play on failed pairing');
 assert.equal($('wifiErrorHelp').hidden,false,'Show actionable network/browser troubleshooting');
 assert.equal($('wifiRetry').hidden,false,'Retry action must be available');
 assert($('wifiStatus').textContent.includes('room was NOT created'),
  'Pairing error must state clearly no room was created');
 fake.offerWithHost=true;
 await $('wifiRetry').click();
 assert($('wifiStep').textContent.includes('Show this QR'),
  'After valid LAN address is available, prompt Player 1 to share a QR');
 assert.equal($('wifiQr').hidden,false);
 assert($('wifiQr').innerHTML.includes('<svg'),'A real QR must be generated');
 assert.equal($('wifiNextTitle').textContent,'SHOW THIS QR');
 assert.equal($('wifiErrorHelp').hidden,true,'Recovery warning clears after success');
 assert.equal($('wifiRetry').hidden,true,'Retry button hides after success');
 assert.equal($('wifiScan').hidden,false,'Host can now scan Player 2 answer QR');
 await $('wifiJoin').click();
 assert.equal($('wifiNextTitle').textContent,'SCAN THE OTHER PHONE',
  'Joining phone must be told to scan the hosting phone');
 assert.equal($('wifiStart').hidden,true,'No Play until connected');
 console.log('CRLF/mDNS ICE candidate matching, honest missing-LAN error, Retry and show/scan next actions passed.');
})().catch(e=>{console.error(e);process.exitCode=1});
