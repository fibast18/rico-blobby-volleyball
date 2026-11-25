'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('local-wifi.js','utf8');
const html=fs.readFileSync('index.html','utf8');
const worker=fs.readFileSync('vendor/qr-scanner.min.js','utf8');
const sw=fs.readFileSync('sw.js','utf8');
assert(source.includes('iceServers:[]'),'The connection must use Wi-Fi only (no remote STUN/TURN)');
assert(!/stun:|turn:|navigator\.bluetooth|new WebSocket|fetch\(/i.test(source),
 'Offline multiplayer may not depend on internet, Bluetooth, or cloud signaling');
assert(html.includes('id="wifiCreate"')&&html.includes('id="wifiJoin"')&&
 html.includes('id="wifiScan"')&&html.includes('id="wifiStart"')&&
 html.includes('id="wifiStep"')&&html.includes('id="wifiScanProgress"')&&
 html.includes('id="wifiHold"'),
 'A local host, guest, visible step guide, QR scanner and Start flow must exist');
assert(html.includes('.wifi-actions[hidden]'),
 'The previous Create/Join choices must be truly hidden after choosing a role');
assert(html.includes("data.t==='start-request'&&LocalWifi.connected&&!running"),
 'Guest pressing Play must request an authoritative start on the host');
assert(worker.includes('qr-scanner-worker.min.js'),'Offline scanner worker must be bundled');
for(const asset of ['local-wifi.js','vendor/qrcode.js','vendor/qr-scanner.min.js','vendor/qr-scanner-worker.min.js'])
 assert(sw.includes("'./"+asset+"'"),'Offline PWA cache must include '+asset);
assert(html.includes("if(localMode==='host')"),'Host must simulate remote human Blue, not CPU');
assert(html.includes("if(localMode==='guest'&&LocalWifi.connected"),
 'Guest should render state snapshots instead of running CPU physics');
assert(html.includes("onDisconnected:"),'Wi-Fi link failures must pause/close the session');

const qrctx={};vm.createContext(qrctx);
vm.runInContext(fs.readFileSync('vendor/qrcode.js','utf8'),qrctx,{timeout:2000});
assert.equal(typeof qrctx.qrcode,'function','Bundled QR library missing');
const qr=qrctx.qrcode(0,'M');qr.addData('BV1.abc.1.3.'+'a'.repeat(190),'Byte');
qr.make();assert(qr.getModuleCount()>0,'QR page must be scannable without internet');
assert(qr.getModuleCount()<=65,'Pairing QR must be simpler than the previous dense 380-character version');
assert(source.includes('QR_CYCLE_MS=8500'),'QR pages should stay visible at least 8 seconds');
assert(source.includes('margin:20'),'QR quiet zone must be at least four SVG modules');
assert(source.includes("maxScansPerSecond:12"),'Camera must have a responsive frame scan rate');
assert(qr.createSvgTag({cellSize:2,margin:2}).includes('<svg'),'QR generator must draw SVG');

const clients=[];
class FakeChannel{
 constructor(){this.readyState='connecting';this.remote=null;this.sent=[]}
 send(text){this.sent.push(JSON.parse(text));if(this.remote?.onmessage)this.remote.onmessage({data:text})}
 close(){this.readyState='closed';if(this.onclose)this.onclose()}
}
class FakeRTC{
 constructor(config){assert(Array.isArray(config.iceServers)&&config.iceServers.length===0);this.iceGatheringState='complete';this.signalingState='stable';this.connectionState='new';clients.push(this)}
 createDataChannel(){this.channel=new FakeChannel();return this.channel}
 async createOffer(){return {type:'offer',sdp:'v=0\r\na=candidate:1 1 udp 2122260223 192.168.1.20 5000 typ host\r\n'}}
 async createAnswer(){return {type:'answer',sdp:'v=0\r\na=candidate:1 1 udp 2122260223 192.168.1.21 5001 typ host\r\n'}}
 async setLocalDescription(desc){this.localDescription=desc;if(desc.type==='offer')this.signalingState='have-local-offer'}
 async setRemoteDescription(desc){this.remoteDescription=desc;this.signalingState='stable'}
 addEventListener(){}
 removeEventListener(){}
 close(){this.connectionState='closed'}
}
function createPeer(){
 const widgets=new Map();
 function element(id){if(!widgets.has(id)){
  const listeners={};const classes=new Set();
  const o={id,hidden:true,textContent:'',value:'',innerHTML:'',listeners,
   classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name)},
    contains(name){return classes.has(name)}},
   addEventListener(name,fn){(listeners[name]??=[]).push(fn)},
   async fire(name){await Promise.all((listeners[name]||[]).map(fn=>fn({preventDefault(){}})))},
   replaceChildren(){this.innerHTML=''}
  };widgets.set(id,o)
 }return widgets.get(id)}
 const ctx={
  window:{},document:{getElementById:element},navigator:{},
  RTCPeerConnection:FakeRTC,Uint8Array,TextEncoder,TextDecoder,
  Blob,CompressionStream,DecompressionStream,Response,
  btoa,atob,
  qrcode:()=>({addData(){},make(){},createSvgTag(){return '<svg></svg>'}}),
  setInterval:()=>1,clearInterval:()=>{},setTimeout,clearTimeout,
 };
 vm.createContext(ctx);
 vm.runInContext(source,ctx,{timeout:1000});
 const events={connected:[],received:[],started:0,disconnected:0};
 ctx.window.LocalWifi.attach({
  onConnected:who=>events.connected.push(who),
  onMessage:data=>events.received.push(data),
  onStart:()=>events.started++,
  onDisconnected:()=>events.disconnected++
 });
 return {client:ctx.window.LocalWifi,events,element};
}
async function run(){
 const host=createPeer(),guest=createPeer();
 const packed=await host.client._test.pack(JSON.stringify({sdp:'a=candidate:1 typ host\n'.repeat(60)}));
 assert.equal(JSON.parse(await guest.client._test.unpack(packed)).sdp,
  'a=candidate:1 typ host\n'.repeat(60),
  'QR pairing must encode/decode SDP without a server');
 assert.equal(host.client._test.localCandidates('v=0\na=candidate:1 1 udp 2 192.168.0.1 500 typ srflx').length,0);
 assert.equal(host.client._test.localCandidates('v=0\na=candidate:1 1 udp 2 192.168.0.1 500 typ host').length,1);
 await host.element('wifiCreate').fire('click');
 const offer=host.element('wifiPairingText').value;
 assert(offer&&offer.length>20,'Host must display a local offer: '+host.element('wifiStatus').textContent);
 assert(host.element('wifiDialog').classList.contains('presenting'),
  'When showing QR, simplify pairing UI to make it large');
 const pages=host.client._test.qrPages;
 assert(pages.length>0,'Host must generate QR pages');
 assert(pages.every(p=>p.length<=210),'Individual QR payload should remain small enough for smartphone cameras');
 if(pages.length>1){
  assert(pages.every((p,i)=>p.startsWith('BV1.')&&p.includes('.'+(i+1)+'.'+pages.length+'.')),
   'QR pages must be ordered and labeled');
  await host.element('wifiHold').fire('click');
  assert(host.client._test.qrHeld,'Presenter can freeze a QR for slow camera focus');
  await host.element('wifiNext').fire('click');
  assert(host.client._test.qrHeld,'Manual QR navigation must not resume fast cycling');
  await host.element('wifiHold').fire('click');
  assert(!host.client._test.qrHeld,'Presenter can resume auto cycling');
 }
 assert.equal(host.element('wifiStartNew').hidden,true,'Host must hide initial Create/Join buttons after room creation');
 assert.equal(host.element('wifiScan').hidden,false,'Host must display Scan Player 2 Answer QR');
 assert(host.element('wifiStep').textContent.includes('Step 2'),'Host must explain the QR exchange');
 await guest.element('wifiJoin').fire('click');
 assert.equal(guest.element('wifiStartNew').hidden,true,'Guest must hide initial Create/Join buttons');
 assert.equal(guest.element('wifiStart').hidden,true,'Guest Play must not appear before connection');
 async function scan(client,pages){
  for(const page of pages)await client.client._test.receiveQr(page);
 }
 await scan(guest,pages);
 assert.equal(guest.element('wifiScanProgress').value,pages.length,
  'Scanning phone must display captured QR count');
 assert.equal(guest.element('wifiScanProgress').max,pages.length,
  'Scanning phone must know total QR count');
 const answer=guest.element('wifiPairingText').value;
 assert(answer&&answer.length>20,'Guest must generate an answer');
 assert(guest.element('wifiStatus').textContent.includes('Player 1’s camera'),
  'Guest must be instructed to show the answer QR to Player 1');
 assert.equal(guest.element('wifiStart').hidden,true,
  'Guest must not see a Play button until Player 1 scans the answer');
 await scan(host,guest.client._test.qrPages);
 assert(host.element('wifiStep').textContent.includes('connecting'),
  'Host must say the answer is scanned and the LAN connection is in progress');
 assert.equal(clients.length,2,'Pairing should create exactly two LAN peers');
 assert(clients[0].remoteDescription?.type==='answer','Host must import guest answer');
 assert(clients[1].remoteDescription?.type==='offer','Guest must import host offer');
 const h=clients[0].channel,g=new FakeChannel();
 clients[1].ondatachannel({channel:g});
 h.remote=g;g.remote=h;h.readyState=g.readyState='open';
 g.onopen();h.onopen();
 assert.deepEqual(host.events.connected,['host']);
 assert.deepEqual(guest.events.connected,['guest']);
 assert.equal(host.element('wifiStart').hidden,false,
  'Host Play Now appears after local data channel opens');
 assert.equal(guest.element('wifiStart').hidden,false,
  'Guest Play Now also appears after local data channel opens');
 assert.equal(host.element('wifiStartNew').hidden,true);
 assert.equal(guest.element('wifiStartNew').hidden,true);
 assert(host.element('wifiStep').textContent.includes('Connected'));
 assert(guest.element('wifiStep').textContent.includes('Connected'));
 guest.client.send({t:'input',x:.7,jump:true});
 assert.equal(host.events.received.at(-1).jump,true,'Blue controls must reach host over local link');
 await guest.element('wifiStart').fire('click');
 assert.equal(host.events.received.at(-1).t,'start-request',
  'Blue can request the match to start when both phones are connected');
 assert.equal(guest.element('wifiStart').hidden,true,
  'Guest Play button must be disabled immediately to avoid double start');
 await host.element('wifiStart').fire('click');
 assert.equal(host.events.started,1,'Host controls start of match');
 assert.equal(guest.events.received.at(-1).t,'start','Guest must be told to start');
 host.client.leave();guest.client.leave();
 console.log('Offline Wi-Fi signaling, QR pages, direct host/guest exchange, gameplay messages and no remote server passed.');
}
run().catch(error=>{console.error(error);process.exitCode=1});
