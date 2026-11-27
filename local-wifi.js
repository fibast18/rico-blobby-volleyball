/* Rico Blobby Volleyball — local-only WebRTC and QR signaling.
   No internet, cloud server, STUN, TURN, Bluetooth or account is used here.
   Both players must have installed/cached the HTTPS PWA in advance.
   Local candidate availability is controlled by browsers and LAN policy. */
(function(){
 'use strict';
 let callbacks={},pc=null,channel=null,role=null,phase='idle',qrPages=[],page=0,
     cycle=null,scanner=null,fragments=new Map(),busy=false,connected=false,closedByUser=false,
     qrHeld=false;
 const QR_CHUNK_SIZE=190;
 const QR_CYCLE_MS=8500;
 const $=id=>document.getElementById(id);
 const setStatus=s=>{$('wifiStatus').textContent=s};
 const setStep=s=>{$('wifiStep').textContent=s};
 function showNextAction(title,description){
  $('wifiNextAction').hidden=false;
  $('wifiNextTitle').textContent=title;
  $('wifiNextDetail').textContent=description;
 }
 function hideNextAction(){$('wifiNextAction').hidden=true}
 function showPairingError(error){
  stopScan();resetQr();
  setVisible('wifiStart',false);
  setVisible('wifiScan',false);
  setVisible('wifiStartNew',false);
  setVisible('wifiCamera',false);
  setVisible('wifiRetry',true);
  setVisible('wifiErrorHelp',true);
  $('wifiPairingText').value='';
  setStep('Cannot pair on this browser yet');
  showNextAction('NO QR GENERATED','No code is available to share or scan. Try the fixes below, then tap Retry.');
  const missing=error&&error.code==='NO_LAN_CANDIDATE';
  setStatus(missing?
   'This browser has not exposed a local Wi-Fi address for WebRTC. The room was NOT created.':
   'Wi-Fi pairing could not continue: '+(error?.message||'Unknown browser error'));
 }
 const setScanProgress=(done,total=0)=>{
  $('wifiScanProgress').max=Math.max(1,total);
  $('wifiScanProgress').value=done;
  $('wifiScanCounter').textContent=total?
   'Scanned '+done+' of '+total+' QR pages':
   'Searching for the first QR page…';
 };
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
  qrPages=[];page=0;qrHeld=false;$('wifiQr').replaceChildren();
  $('wifiDialog').classList.toggle('presenting',false);
  setVisible('wifiQr',false);setVisible('wifiCodeActions',false);
 }
 function drawQr(){
  if(!qrPages.length||typeof qrcode!=='function')return;
  // Lower-density pages with medium error correction are easier for phone
  // cameras to focus on than the previous 380-character QR at 215px.
  const qr=qrcode(0,'M');
  qr.addData(qrPages[page],'Byte');
  try{
   qr.make();
   // Four QR modules of white quiet-zone margin improve recognition.
   $('wifiQr').innerHTML=qr.createSvgTag({cellSize:5,margin:20});
   $('wifiQrCount').textContent='QR '+(page+1)+' of '+qrPages.length+
     (qrHeld?' • Held':' • 8.5 sec');
   $('wifiHold').textContent=qrHeld?'▶ Auto':'⏸ Hold';
  }catch{setStatus('Pairing QR is too large. Use the text exchange below.')}
 }
 function showCode(code){
  resetQr();
  const token=Math.random().toString(36).slice(2,7);
  const chunkSize=QR_CHUNK_SIZE;
  const total=Math.ceil(code.length/chunkSize);
  if(total>75)throw Error('Pairing code is too large');
  qrPages=Array.from({length:total},(_,i)=>
   'BV1.'+token+'.'+(i+1)+'.'+total+'.'+code.slice(i*chunkSize,(i+1)*chunkSize));
  page=0;qrHeld=false;setVisible('wifiQr',true);drawQr();
  setVisible('wifiCodeActions',true);
  $('wifiPairingText').value=code;
  $('wifiDialog').classList.toggle('scanning',false);
  $('wifiDialog').classList.toggle('presenting',true);
  // Keep each QR stable long enough for focus, exposure, and decoding.
  // The presenter can hold one page or navigate manually if needed.
  if(qrPages.length>1)cycle=setInterval(()=>{
   if($('wifiPanel').hidden||qrHeld)return;
   page=(page+1)%qrPages.length;drawQr();
  },QR_CYCLE_MS);
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
  setVisible('wifiRetry',false);setVisible('wifiErrorHelp',false);
  showNextAction('CONNECTED — PLAY NOW','Both phones are paired on the same local network.');
  if(role==='host'){
   setStep('Step 3 of 3 — Connected! Tap Play Now to start.');
   setStatus('Both phones are connected locally. You can tap Play Now on EITHER phone to start the same match.');
  }else{
   setStep('Step 3 of 3 — Connected! Tap Play Now to start.');
   setStatus('Ready! Both phones are connected. You can tap Play Now here or on Player 1’s phone. The match starts simultaneously.');
  }
  setVisible('wifiStart',true);
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
 // SDP normally uses CRLF lines. Match host candidates even when the
 // final character is \r or a privacy-preserving .local mDNS hostname.
 const localCandidates=sdp=>(String(sdp||'').match(/^a=candidate:[^\r\n]*/gm)||[])
     .filter(line=>/\btyp\s+host(?:\s|$)/i.test(line));
 async function makeSignal(kind){
  await waitForIce(pc);
  if(!pc?.localDescription)throw Error('Local pairing data not ready');
  const sdp=pc.localDescription.sdp;
  if(!localCandidates(sdp).length){
   const error=new Error('No local host ICE candidate after browser gathering.');
   error.code='NO_LAN_CANDIDATE';
   throw error;
  }
  return pack(JSON.stringify({v:1,kind,sdp}));
 }
 async function createHost(){
  if(busy)return;busy=true;
  try{
   stopScan();resetQr();prepareConnection(true);phase='answer';
   setVisible('wifiRetry',false);setVisible('wifiErrorHelp',false);
   setVisible('wifiStartNew',false);setVisible('wifiScan',false);
   showNextAction('PREPARING QR','Checking for a local Wi-Fi address. Do not scan yet.');
   const data=pc.createDataChannel('blobby-local',{ordered:true});
   attachChannel(data);
   setStep('Step 2 of 3 — Checking local Wi-Fi address…');
   setStatus('Creating offline Wi-Fi offer…');
   await pc.setLocalDescription(await pc.createOffer());
   const code=await makeSignal('offer');
   showCode(code);
   if(!$('wifiQr').innerHTML.includes('<svg'))
    throw Error('Unable to draw the QR code on this device.');
   setStep('Step 2 of 3 — Show this QR to Player 2');
   showNextAction('SHOW THIS QR','Hold this screen steady while Player 2 scans every QR page.');
   setStatus('Player 1: show these QR pages to Player 2. After they scan, tap Scan Player 2 Answer QR.');
   setVisible('wifiScan',true);$('wifiScan').textContent='📷 Scan Player 2 Answer QR';
   setVisible('wifiStartNew',false);setVisible('wifiStart',false);
  }catch(e){closeRtc(false);showPairingError(e)}
  finally{busy=false}
 }
 async function receiveOffer(payload){
  if(busy)return;busy=true;
  try{
   stopScan();resetQr();prepareConnection(false);
   phase='offer';
   await pc.setRemoteDescription({type:'offer',sdp:payload.sdp});
   await pc.setLocalDescription(await pc.createAnswer());
   setStep('Step 2 of 3 — Preparing answer QR…');
   showNextAction('PREPARING ANSWER QR','Wait for the browser to provide its local Wi-Fi address.');
   setStatus('Preparing response for the host…');
   const code=await makeSignal('answer');showCode(code);
   if(!$('wifiQr').innerHTML.includes('<svg'))
    throw Error('Unable to draw the answer QR code on this device.');
   showNextAction('SHOW THIS QR','Player 1 must now scan your answer QR pages.');
   setStep('Step 2 of 3 — Show your answer QR to Player 1');
   setStatus('Player 2: hold this answer QR toward Player 1’s camera. Play Now appears only after both devices connect.');
   setVisible('wifiScan',false);setVisible('wifiStartNew',false);setVisible('wifiStart',false);
  }catch(e){closeRtc(false);showPairingError(e)}
  finally{busy=false}
 }
 async function receiveAnswer(payload){
  if(!pc||role!=='host')throw Error('Create a room before scanning the answer.');
  if(pc.signalingState!=='have-local-offer')throw Error('This offer was already answered.');
  await pc.setRemoteDescription({type:'answer',sdp:payload.sdp});
  await stopScan();
  resetQr();setVisible('wifiQr',false);
  showNextAction('CONNECTING…','The QR exchange is complete. Waiting for the direct Wi-Fi link.');
  setStep('Step 3 of 3 — Answer scanned; connecting both phones…');
  setStatus('Player 1: answer accepted. Connecting locally. The yellow Play Now button appears when both devices connect.');
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
  const firstScan=!bag.parts.has(n);
  bag.parts.set(n,part);
  setScanProgress(bag.parts.size,total);
  if(firstScan&&navigator.vibrate)try{navigator.vibrate(45)}catch{}
  setStatus('QR '+n+' captured. '+bag.parts.size+' of '+total+
    ' pages saved. Keep scanning until all pages are collected.');
  if(bag.parts.size===total){
   fragments.delete(id);
   await receiveCode(Array.from({length:total},(_,i)=>bag.parts.get(i+1)).join(''));
  }
 }
 async function stopScan(){
  if(scanner){const old=scanner;scanner=null;try{old.stop();old.destroy()}catch{}}
  setVisible('wifiCamera',false);
  setVisible('wifiScanFeedback',false);
  $('wifiDialog').classList.toggle('scanning',false);
  $('wifiDialog').classList.toggle('presenting',qrPages.length>0);
  setVisible('wifiQr',qrPages.length>0);
  setVisible('wifiCodeActions',qrPages.length>0);
 }
 async function startScan(){
  if(busy)return;
  if(!navigator.mediaDevices?.getUserMedia){
   setStatus('Camera access is unavailable. Use the pairing-text field instead.');return;
  }
  fragments.clear();await stopScan();
  if(cycle){clearInterval(cycle);cycle=null}
  setVisible('wifiQr',false);setVisible('wifiCodeActions',false);
  setVisible('wifiCamera',true);setVisible('wifiScanFeedback',true);
  $('wifiDialog').classList.toggle('scanning',true);
  $('wifiDialog').classList.toggle('presenting',false);
  setScanProgress(0);
  setStep(role==='host'?
   'Step 3 of 3 — Scan Player 2’s answer QR':
   'Step 2 of 3 — Scan Player 1’s QR');
  showNextAction('SCAN THE OTHER PHONE','Keep the other phone’s entire QR in your camera frame.');
  setStatus('Hold both phones steady, about 15–30 cm apart, with the entire QR visible. A progress counter confirms each page.');
  try{
   const QrScanner=(await import('./vendor/qr-scanner.min.js')).default;
   const video=$('wifiVideo');
   scanner=new QrScanner(video,async result=>{
    try{await receiveQr(typeof result==='string'?result:result.data)}
    catch(e){setStatus('Pairing code error: '+e.message)}
   },{returnDetailedScanResult:true,maxScansPerSecond:12,highlightScanRegion:true,
       highlightCodeOutline:true,preferredCamera:'environment'});
   await scanner.start();
  }catch(e){await stopScan();setStatus('Camera unavailable: '+e.message+' — use the text exchange instead.')}
 }
 function openPairing(){
  stopScan();resetQr();fragments.clear();
  setVisible('wifiPanel',true);setVisible('wifiStartNew',true);
  setVisible('wifiStart',false);setVisible('wifiScan',false);
  $('wifiPairingText').value='';
  setVisible('wifiRetry',false);setVisible('wifiErrorHelp',false);
  hideNextAction();
  setStep('Step 1 of 3 — Choose Create or Join');
  setStatus('Connect both phones to the same Wi-Fi or phone hotspot. Choose Create on the first phone and Join on the second. No Bluetooth or online game server.');
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
   resetQr();setVisible('wifiQr',false);
   setVisible('wifiStartNew',false);
   setVisible('wifiScan',true);$('wifiScan').textContent='📷 Scan Player 1 QR';
   setVisible('wifiStart',false);
   setStep('Step 2 of 3 — Scan Player 1’s QR');
   showNextAction('SCAN THE OTHER PHONE','Tap the camera button below and scan Player 1’s QR pages.');
   setStatus('Player 2: tap Scan Player 1 QR and scan ALL the QR pages shown on the first phone. Then your phone will show an answer QR.');
  });
  $('wifiScan').addEventListener('click',startScan);
  $('wifiRetry').addEventListener('click',()=>{
   if(role==='host')createHost();
   else{
    $('wifiJoin').click();
   }
  });
  $('wifiCancel').addEventListener('click',leave);
  $('wifiPrev').addEventListener('click',()=>{if(!qrPages.length)return;
   qrHeld=true;page=(page+qrPages.length-1)%qrPages.length;drawQr()});
  $('wifiNext').addEventListener('click',()=>{if(!qrPages.length)return;
   qrHeld=true;page=(page+1)%qrPages.length;drawQr()});
  $('wifiHold').addEventListener('click',()=>{
   if(!qrPages.length)return;
   qrHeld=!qrHeld;drawQr();
  });
  $('wifiCopy').addEventListener('click',async()=>{
   try{await navigator.clipboard.writeText($('wifiPairingText').value);setStatus('Pairing text copied.')}
   catch{setStatus('Select and copy the text manually.')}
  });
  $('wifiImport').addEventListener('click',async()=>{
   try{await receiveCode($('wifiPeerText').value.trim());$('wifiPeerText').value=''}
   catch(e){setStatus('Cannot import: '+e.message)}
  });
  $('wifiStart').addEventListener('click',()=>{
   if(!isOpen())return;
   setVisible('wifiStart',false);
   if(role==='host'){
    send({t:'start'});
    if(callbacks.onStart)callbacks.onStart();
    setVisible('wifiPanel',false);
   }else if(role==='guest'){
    send({t:'start-request'});
    setStatus('Request sent. Starting on both phones…');
   }
  });
  $('wifiPanel').addEventListener('keydown',e=>{if(e.key==='Escape'&&!connected)leave()});
 }
 function send(message){
  if(!isOpen())return false;
  try{channel.send(JSON.stringify(message));return true}catch{return false}
 }
 window.LocalWifi={attach,openPairing,leave,send,get connected(){return connected},
  get role(){return role},get active(){return !!role},get peerConnection(){return pc},
  _test:{pack,unpack,receiveQr,localCandidates,showCode,
   get qrPages(){return [...qrPages]},get qrHeld(){return qrHeld}}};
})();
