/* Rico Blobby Volleyball — local-only WebRTC and QR signaling.
   No internet, cloud server, STUN, TURN, Bluetooth or account is used here.
   Both players must have installed/cached the HTTPS PWA in advance.
   Local candidate availability is controlled by browsers and LAN policy. */
(function(){
 'use strict';
 let callbacks={},pc=null,channel=null,role=null,phase='idle',qrPages=[],page=0,
     cycle=null,scanner=null,fragments=new Map(),busy=false,connected=false,closedByUser=false;
 const $=id=>document.getElementById(id);
 const setStatus=s=>{$('wifiStatus').textContent=s};
 const setVisible=(id,visible)=>{$(id).hidden=!visible};
 const isOpen=()=>channel&&channel.readyState==='open';
 const rtcSupported=()=>typeof RTCPeerConnection==='function';
 const byteToBase64=bytes=>{
  let raw='';for(let i=0;i<bytes.length;i+=8192)
    raw+=String.fromCharCode(...bytes.subarray(i,i+8192));
  return btoa(raw).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
 };
 const base64ToByte=text=>{
  const raw=atob(text.replace(/-/g,'+').replace(/_/g,'/')+'==='.slice((text.length+3)%4));
  return Uint8Array.from(raw,c=>c.charCodeAt(0));
 };
 async function pack(text){
  let bytes=new TextEncoder().encode(text),marker='u';
  if(typeof CompressionStream==='function'){
   try{
    const stream=new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
    const smaller=new Uint8Array(await new Response(stream).arrayBuffer());
    if(smaller.length<bytes.length){bytes=smaller;marker='z'}
   }catch{}
  }
  return marker+byteToBase64(bytes);
 }
 async function unpack(code){
  if(typeof code!=='string'||code.length>50000)throw Error('Invalid pairing data');
  let bytes=base64ToByte(code.slice(1));
  if(code[0]==='z'){
   if(typeof DecompressionStream!=='function')
     throw Error('This phone cannot decompress pairing data. Update its browser.');
   bytes=new Uint8Array(await new Response(new Blob([bytes]).stream()
     .pipeThrough(new DecompressionStream('deflate'))).arrayBuffer());
  }else if(code[0]!=='u')throw Error('Unknown pairing data');
  return new TextDecoder().decode(bytes);
 }
 function resetQr(){
  if(cycle){clearInterval(cycle);cycle=null}
  qrPages=[];page=0;$('wifiQr').replaceChildren();
  setVisible('wifiCodeActions',false);
 }
 function drawQr(){
  if(!qrPages.length||typeof qrcode!=='function')return;
  const qr=qrcode(0,'L');
  qr.addData(qrPages[page],'Byte');
  try{
   qr.make();
   $('wifiQr').innerHTML=qr.createSvgTag({cellSize:4,margin:4});
   $('wifiQrCount').textContent='QR '+(page+1)+' of '+qrPages.length;
  }catch{setStatus('Pairing QR is too large. Use the text exchange below.')}
 }
 function showCode(code){
  resetQr();
  const token=Math.random().toString(36).slice(2,7);
  const chunkSize=380;
  const total=Math.ceil(code.length/chunkSize);
  if(total>75)throw Error('Pairing code is too large');
  qrPages=Array.from({length:total},(_,i)=>
   'BV1.'+token+'.'+(i+1)+'.'+total+'.'+code.slice(i*chunkSize,(i+1)*chunkSize));
  page=0;drawQr();setVisible('wifiCodeActions',true);
  $('wifiPairingText').value=code;
  // Rotate pages automatically, so the other phone can scan every frame.
  if(qrPages.length>1)cycle=setInterval(()=>{if($('wifiPanel').hidden)return;
   page=(page+1)%qrPages.length;drawQr()},2800);
 }
 function closeRtc(notify=true){
  closedByUser=true;
  if(channel){try{channel.close()}catch{}}
  if(pc){try{pc.close()}catch{}}
  channel=null;pc=null;connected=false;
  if(notify&&callbacks.onDisconnected)callbacks.onDisconnected();
 }
 function handleOpen(){
  if(connected||!isOpen())return;
  connected=true;stopScan();resetQr();
  setStatus(role==='host'?
   'Connected on local Wi-Fi. Tap Start Match to begin.':
   'Connected to host. The host can start your match.');
  setVisible('wifiStart',role==='host');
  setVisible('wifiScan',false);
  setVisible('wifiStartNew',false);
  if(callbacks.onConnected)callbacks.onConnected(role);
 }
 function prepareConnection(isHost){
  closeRtc(false);closedByUser=false;connected=false;role=isHost?'host':'guest';
  pc=new RTCPeerConnection({iceServers:[],iceTransportPolicy:'all',bundlePolicy:'max-bundle'});
  pc.onconnectionstatechange=()=>{
   if(pc&&['failed','disconnected','closed'].includes(pc.connectionState)&&!closedByUser){
    const state=pc.connectionState;
    if(state==='disconnected'){
      setStatus('Wi-Fi connection interrupted. Trying to reconnect…');
    }else{
      setStatus('Peer connection lost. Re-pair both devices on the same Wi-Fi.');
      if(callbacks.onDisconnected)callbacks.onDisconnected(state);
    }
   }
  };
  pc.ondatachannel=event=>attachChannel(event.channel);
 }
 function attachChannel(ch){
  channel=ch;
  channel.onopen=handleOpen;
  channel.onclose=()=>{
   if(connected&&!closedByUser){
    connected=false;setStatus('Connection closed. Return to Wi-Fi pairing to reconnect.');
    if(callbacks.onDisconnected)callbacks.onDisconnected('closed');
   }
  };
  channel.onmessage=event=>{
   try{
    const message=JSON.parse(event.data);
    if(message&&typeof message.t==='string'&&callbacks.onMessage)callbacks.onMessage(message);
   }catch{}
  };
 }
 function waitForIce(connection){
  return new Promise(resolve=>{
   if(connection.iceGatheringState==='complete'){resolve();return}
   let finished=false;
   const finish=()=>{if(finished)return;finished=true;
     connection.removeEventListener('icegatheringstatechange',onChange);
     clearTimeout(timer);resolve()};
   const onChange=()=>{if(connection.iceGatheringState==='complete')finish()};
   const timer=setTimeout(finish,10000);
   connection.addEventListener('icegatheringstatechange',onChange);
  });
 }
 const localCandidates=sdp=>(sdp.match(/^a=candidate:.*$/gm)||[])
     .filter(line=>/ typ host(?: |$)/.test(line));
 async function makeSignal(kind){
  await waitForIce(pc);
  if(!pc?.localDescription)throw Error('Local pairing data not ready');
  const sdp=pc.localDescription.sdp;
  if(!localCandidates(sdp).length)
    throw Error('This browser did not provide LAN addresses. Wi-Fi-only pairing is blocked on this device.');
  return pack(JSON.stringify({v:1,kind,sdp}));
 }
 async function createHost(){
  if(busy)return;busy=true;
  try{
   stopScan();resetQr();prepareConnection(true);phase='answer';
   const data=pc.createDataChannel('blobby-local',{ordered:true});
   attachChannel(data);
   setStatus('Creating offline Wi-Fi offer…');
   await pc.setLocalDescription(await pc.createOffer());
   const code=await makeSignal('offer');
   showCode(code);
   setStatus('Player 1: show these QR pages to Player 2. Player 2 chooses Join and scans them. Then tap Scan Answer to scan Player 2’s QR pages.');
   setVisible('wifiScan',true);$('wifiScan').textContent='Scan Answer';
   setVisible('wifiStartNew',false);setVisible('wifiStart',false);
  }catch(e){setStatus('Cannot create room: '+e.message);closeRtc(false)}
  finally{busy=false}
 }
 async function receiveOffer(payload){
  if(busy)return;busy=true;
  try{
   stopScan();resetQr();prepareConnection(false);
   phase='offer';
   await pc.setRemoteDescription({type:'offer',sdp:payload.sdp});
   await pc.setLocalDescription(await pc.createAnswer());
   setStatus('Preparing response for the host…');
   const code=await makeSignal('answer');showCode(code);
   setStatus('Player 2: show these QR pages to Player 1. Ask Player 1 to tap Scan Answer and scan all pages.');
   setVisible('wifiScan',false);setVisible('wifiStartNew',false);setVisible('wifiStart',false);
  }catch(e){setStatus('Cannot join: '+e.message);closeRtc(false)}
  finally{busy=false}
 }
 async function receiveAnswer(payload){
  if(!pc||role!=='host')throw Error('Create a room before scanning the answer.');
  if(pc.signalingState!=='have-local-offer')throw Error('This offer was already answered.');
  await pc.setRemoteDescription({type:'answer',sdp:payload.sdp});
  setStatus('Answer received. Connecting locally…');
  setVisible('wifiScan',false);
 }
 async function receiveCode(code){
  if(busy)return;
  const parsed=JSON.parse(await unpack(code));
  if(parsed.v!==1||!['offer','answer'].includes(parsed.kind)||
    typeof parsed.sdp!=='string'||parsed.sdp.length>35000)throw Error('Invalid pairing signal');
  if(parsed.kind==='offer'&&phase==='offer')await receiveOffer(parsed);
  else if(parsed.kind==='answer'&&phase==='answer')await receiveAnswer(parsed);
  else throw Error('Wrong QR: use Create on the host, Join on the guest.');
 }
 async function receiveQr(text){
  if(!text.startsWith('BV1.')){await receiveCode(text);return}
  const match=/^BV1\.([a-z0-9]+)\.(\d+)\.(\d+)\.(.+)$/.exec(text);
  if(!match)throw Error('Invalid QR page');
  const [,id,nRaw,totalRaw,part]=match;
  const n=Number(nRaw),total=Number(totalRaw);
  if(total<1||total>75||n<1||n>total||part.length>1000)throw Error('Invalid QR page index');
  let bag=fragments.get(id);
  if(!bag||bag.total!==total){bag={total,parts:new Map()};fragments.set(id,bag)}
  bag.parts.set(n,part);
  setStatus('Scanned '+bag.parts.size+' of '+total+' QR pages. Keep both screens visible.');
  if(bag.parts.size===total){
   fragments.delete(id);
   await receiveCode(Array.from({length:total},(_,i)=>bag.parts.get(i+1)).join(''));
  }
 }
 async function stopScan(){
  if(scanner){const old=scanner;scanner=null;try{old.stop();old.destroy()}catch{}}
  setVisible('wifiCamera',false);
 }
 async function startScan(){
  if(busy)return;
  if(!navigator.mediaDevices?.getUserMedia){
   setStatus('Camera access is unavailable. Use the pairing-text field instead.');return;
  }
  fragments.clear();stopScan();
  setVisible('wifiCamera',true);
  setStatus('Point your camera at the other phone. Scan all rotating QR pages.');
  try{
   const QrScanner=(await import('./vendor/qr-scanner.min.js')).default;
   const video=$('wifiVideo');
   scanner=new QrScanner(video,async result=>{
    try{await receiveQr(typeof result==='string'?result:result.data)}
    catch(e){setStatus('Pairing code error: '+e.message)}
   },{returnDetailedScanResult:true,maxScansPerSecond:6,highlightScanRegion:false});
   await scanner.start();
  }catch(e){await stopScan();setStatus('Camera unavailable: '+e.message+' — use the text exchange instead.')}
 }
 function openPairing(){
  setVisible('wifiPanel',true);setVisible('wifiStartNew',true);
  setVisible('wifiStart',false);setVisible('wifiScan',false);
  $('wifiPairingText').value='';
  setStatus('Same Wi-Fi or one phone’s hotspot only. No internet server or Bluetooth. Each phone must first have the game installed and cached.');
  if(!rtcSupported())setStatus('This browser does not support WebRTC. Try a recent Safari or Chrome.');
 }
 function leave(){
  stopScan();resetQr();closeRtc(true);role=null;phase='idle';
  setVisible('wifiPanel',false);setVisible('wifiStartNew',true);setVisible('wifiScan',false);setVisible('wifiStart',false);
 }
 function attach(config){
  callbacks=config||{};
  $('wifiCreate').addEventListener('click',createHost);
  $('wifiJoin').addEventListener('click',()=>{closeRtc(false);role='guest';phase='offer';
   resetQr();setVisible('wifiScan',true);$('wifiScan').textContent='Scan Host QR';
   setVisible('wifiStart',false);
   setStatus('Player 2: tap Scan Host QR and scan the QR pages from Player 1.');
  });
  $('wifiScan').addEventListener('click',startScan);
  $('wifiCancel').addEventListener('click',leave);
  $('wifiPrev').addEventListener('click',()=>{if(!qrPages.length)return;
   page=(page+qrPages.length-1)%qrPages.length;drawQr()});
  $('wifiNext').addEventListener('click',()=>{if(!qrPages.length)return;
   page=(page+1)%qrPages.length;drawQr()});
  $('wifiCopy').addEventListener('click',async()=>{
   try{await navigator.clipboard.writeText($('wifiPairingText').value);setStatus('Pairing text copied.')}
   catch{setStatus('Select and copy the text manually.')}
  });
  $('wifiImport').addEventListener('click',async()=>{
   try{await receiveCode($('wifiPeerText').value.trim());$('wifiPeerText').value=''}
   catch(e){setStatus('Cannot import: '+e.message)}
  });
  $('wifiStart').addEventListener('click',()=>{if(role==='host'&&isOpen()){
   send({t:'start'});if(callbacks.onStart)callbacks.onStart();setVisible('wifiPanel',false);
  }});
  $('wifiPanel').addEventListener('keydown',e=>{if(e.key==='Escape'&&!connected)leave()});
 }
 function send(message){
  if(!isOpen())return false;
  try{channel.send(JSON.stringify(message));return true}catch{return false}
 }
 window.LocalWifi={attach,openPairing,leave,send,get connected(){return connected},
  get role(){return role},get active(){return !!role},get peerConnection(){return pc},
  _test:{pack,unpack,receiveQr,localCandidates}};
})();
