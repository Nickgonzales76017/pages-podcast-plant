import {
  RATE,MAX_CLIPS,MAX_SOURCES,MAX_SOURCE_FLOATS,MAX_SECONDS,
  duration,fmt,validateProject,exampleSession,exampleAudio,sourcePeaks,
  emptyProject,trimClip,wavEncode,showNotes,handoffYaff,selectedFrames
} from "./mix-model.mjs";
const $=id=>document.getElementById(id);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
let project=emptyProject(),sources=new Map(),selected="",currentRevision=0,db=null;
let worker=null,requestId=0,pending=new Map(),rendered=null,audio=null,playing=null,
  playStart=0,playOffset=0,playhead=0,raf=0,zoom=72,undoStack=[],redoStack=[],renderTimer=0,
  dirty=false,busy=false,lastRenderedRevision=-1,editRevision=0;
const palette=["#bedfb6","#e4ca91","#85c3d4","#b7aaec","#e5ada9","#b2d2aa","#d9b67b"];
const IDB_NAME="bonfyre-creator-native-session-v1";
const toast=(message,error=false)=>{
  const e=$("notice");e.textContent=message;e.style.background=error?"#f3c6bd":"#d2e6c1";
  e.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove("show"),3800);
};
const msg=(message)=>{$("renderStatus").textContent=message;};
const safe=fn=>Promise.resolve().then(fn).catch(e=>{toast(e.message||String(e),true);msg(e.message||"Operation refused.");});
function openDB(){
 return new Promise((resolve,reject)=>{
  const r=indexedDB.open(IDB_NAME,1);
  r.onupgradeneeded=()=>{if(!r.result.objectStoreNames.contains("projects"))r.result.createObjectStore("projects");};
  r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error||Error("Project store unavailable."));
 });
}
const getProject=id=>new Promise((resolve,reject)=>{
  const t=db.transaction("projects","readonly"),r=t.objectStore("projects").get(id);
  r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);
});
const allProjects=()=>new Promise((resolve,reject)=>{
  const t=db.transaction("projects","readonly"),r=t.objectStore("projects").getAll();
  r.onsuccess=()=>resolve(r.result||[]);r.onerror=()=>reject(r.error);
});
function storeProject(id,rev,data){
 return new Promise((resolve,reject)=>{
  const t=db.transaction("projects","readwrite"),store=t.objectStore("projects"),r=store.get(id);
  let next;
  r.onsuccess=()=>{
   const current=r.result;
   if((current?.revision||0)!==rev){t.abort();return;}
   next=rev+1;
   store.put({id,revision:next,updatedAt:Date.now(),data:structuredClone(data)},id);
  };
  t.oncomplete=()=>resolve(next);
  t.onabort=()=>reject(Error("Saved session changed in another tab. Open the saved version before overwriting."));
  t.onerror=()=>reject(t.error||Error("Session cannot be stored."));
 });
}
const snapshot=()=>structuredClone(project);
function remember(){
 undoStack.push(snapshot());if(undoStack.length>35)undoStack.shift();redoStack=[];
 $("undo").disabled=false;$("redo").disabled=true;
}
function validMutation(mutator){
 const before=snapshot();
 try{
  mutator();validateProject(project,sources);
 }catch(error){project=before;throw error;}
 markDirty();
}
function markDirty(){
 dirty=true;editRevision++;
 $("save").textContent="Save session •";
 if(rendered){rendered=null;$("play").disabled=true;$("wav16").disabled=true;$("wav32").disabled=true;$("preparePodcast").disabled=true;msg("Arrangement changed. Render to hear the current version.");}
 refreshMetrics();drawMaster();scheduleRender();
}
function scheduleRender(){
 clearTimeout(renderTimer);
 if(project.clips.length&&duration(project)<=30&&sources.size<=8)
  renderTimer=setTimeout(()=>{if(!busy)safe(render);},500);
}
function setSelection(){
 project.selection={from:Math.max(0,Number($("rangeFrom").value)||0),to:Math.max(0,Number($("rangeTo").value)||0)};
}
async function refreshSaves(){
 if(!db)return;
 const rows=await allProjects(),select=$("savedProjects");
 select.replaceChildren(new Option("Saved projects",""));
 for(const r of rows.sort((a,b)=>b.updatedAt-a.updatedAt))select.add(new Option(r.data?.project?.title||r.id,r.id));
}
async function saveProject(){
 if(!db)throw Error("Local project storage is unavailable. You can still export audio and notes.");
 validateProject(project,sources);
 const data={project:snapshot(),sources:[...sources].map(([id,s])=>[id,{name:s.name,kind:s.kind,rights:s.rights,pcm:s.pcm}])};
 currentRevision=await storeProject(project.id,currentRevision,data);
 dirty=false;$("save").textContent="Saved ✓";
 await refreshSaves();$("savedProjects").value=project.id;
 toast("Session saved with source PCM in this browser. Nothing was uploaded.");
}
async function restoreProject(id){
 if(!db)throw Error("Local project storage is unavailable.");
 const row=await getProject(id);if(!row)throw Error("Saved session not found.");
 stop();clearTimeout(renderTimer);
 const src=new Map();
 for(const [key,s] of row.data.sources){
  if(!(s.pcm instanceof Float32Array))throw Error("Saved source PCM is unreadable.");
  src.set(key,{...s,peaks:sourcePeaks(s.pcm)});
 }
 validateProject(row.data.project,src);
 await resetWorker();for(const [key,s] of src)await send("source",{sourceId:key,name:s.name,pcm:s.pcm});
 sources=src;project=structuredClone(row.data.project);currentRevision=row.revision||0;dirty=false;undoStack=[];redoStack=[];
 selected=project.clips[0]?.id||"";editRevision++;rendered=null;
 $("save").textContent="Saved ✓";renderUI();await render();
 toast("Restored "+project.title+" from this browser.");
}
async function resetWorker(){await send("reset",{});}
function configureWorker(){
 worker=new Worker(new URL("./mix-worker.mjs",import.meta.url),{type:"module"});
 worker.onmessage=({data})=>{
  if(data.type==="progress"){const p=Math.round(data.ratio*100);$("progressFill").style.width=p+"%";msg("Mixing native blocks · "+p+"%");return;}
  const q=pending.get(data.id);if(!q)return;
  pending.delete(data.id);clearTimeout(q.timer);
  if(data.type==="error")q.reject(Error(data.message));
  else q.resolve(data);
 };
 worker.onerror=()=>{for(const q of pending.values()){clearTimeout(q.timer);q.reject(Error("The native audio worker stopped."));}pending.clear();worker.terminate();};
}
function send(type,extra){
 const id=requestId++;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error("Native audio operation timed out."));},90000);
  pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,...extra});
 });
}
async function initExample(){
 stop();clearTimeout(renderTimer);
 sources=exampleAudio();project=exampleSession();project.id="demo-session";selected=project.clips[0]?.id||"";currentRevision=0;
 undoStack=[];redoStack=[];editRevision++;dirty=false;rendered=null;
 await resetWorker();
 for(const [id,s] of sources)await send("source",{sourceId:id,name:s.name,pcm:s.pcm});
 $("save").textContent="Save session";renderUI();await render();
 toast("Four synthetic source stems loaded. Edit the timeline or import your recording.");
}
async function importAudio(files){
 if(!files?.length)return;
 if(sources.size+files.length>MAX_SOURCES||project.clips.length+files.length>MAX_CLIPS)throw Error("Maximum sixteen sources and thirty-two clips.");
 if(!audio)audio=new AudioContext({sampleRate:RATE});
 let total=[...sources.values()].reduce((n,s)=>n+s.pcm.length,0);
 const imported=[];
 for(const file of files){
  if(file.size>35*1024*1024||file.size<40)throw Error("Audio file must be between 40 bytes and 35 MB.");
  const array=await file.arrayBuffer();
  const decoded=await audio.decodeAudioData(array.slice(0)).catch(()=>{throw Error("This browser cannot decode "+file.name+". Use WAV or a supported audio format.");});
  let body=decoded;
  if(decoded.sampleRate!==RATE){
   const frames=Math.ceil(decoded.duration*RATE),offline=new OfflineAudioContext(Math.min(2,decoded.numberOfChannels),frames,RATE);
   const source=offline.createBufferSource();source.buffer=decoded;source.connect(offline.destination);source.start();
   body=await offline.startRendering();
  }
  const frames=body.length,pcm=new Float32Array(frames*2);
  if(frames<1||frames>RATE*MAX_SECONDS)throw Error("Each imported clip must be shorter than three minutes.");
  for(let f=0;f<frames;f++){
   const l=body.getChannelData(0)[f],r=(body.numberOfChannels>1?body.getChannelData(1):body.getChannelData(0))[f];
   if(!Number.isFinite(l)||!Number.isFinite(r))throw Error("Audio contains nonfinite samples.");
   pcm[2*f]=l;pcm[2*f+1]=r;
  }
  total+=pcm.length;if(total>MAX_SOURCE_FLOATS)throw Error("Source memory exceeded; try shorter recordings.");
  const id="src-"+crypto.randomUUID().slice(0,12),name=file.name.replace(/[\u0000-\u001f]/g," ").slice(0,90);
  imported.push([id,{name,pcm,kind:"user-supplied",rights:"unreviewed",peaks:sourcePeaks(pcm)}]);
 }
 remember();
 for(const [id,s] of imported){
  await send("source",{sourceId:id,name:s.name,pcm:s.pcm});sources.set(id,s);
  const at=project.clips.length?Math.max(0,Math.min(duration(project),MAX_SECONDS-s.pcm.length/(RATE*2))):0;
  const clip={id:"clip-"+crypto.randomUUID().slice(0,12),sourceId:id,label:s.name,
    at,start:0,end:s.pcm.length/(RATE*2),gain:1,pan:0,fadeIn:.03,fadeOut:.03,
    mute:false,solo:false,tint:palette[project.clips.length%palette.length]};
  project.clips.push(clip);selected=clip.id;
 }
 validateProject(project,sources);markDirty();renderUI();
 toast(imported.length+" local source file(s) imported. No upload occurred.");
}
const selectedClip=()=>project.clips.find(c=>c.id===selected);
const sourceOf=c=>sources.get(c.sourceId);
function refreshMetrics(){
 $("sourceCounter").textContent=sources.size+" SOURCE FILE"+(sources.size===1?"":"S");
 $("trackCounter").textContent=project.clips.length+" CLIP"+(project.clips.length===1?"":"S");
 $("sessionTitle").value=project.title;
 $("totalTime").textContent="/ "+fmt(duration(project));
 $("master").value=project.master;$("masterValue").textContent=Math.round(project.master*100)+"%";
 $("normalize").checked=Boolean(project.normalize);
 $("undo").disabled=!undoStack.length;$("redo").disabled=!redoStack.length;
 $("chapterCount").textContent=String(project.chapters.length);
 $("sessionNotes").value=project.notes;
 $("rights").value=project.rights;
}
function displayClip(){
 const clip=selectedClip();$("inspectorEmpty").hidden=!!clip;$("inspectorControls").hidden=!clip;
 if(!clip)return;
 $("clipSwatch").style.background=clip.tint;$("clipName").textContent=clip.label;
 $("clipSource").textContent=sourceOf(clip)?.name||"Source missing";
 const map={clipLabel:"label",clipAt:"at",clipStart:"start",clipEnd:"end",
  clipGain:"gain",clipPan:"pan",clipFadeIn:"fadeIn",clipFadeOut:"fadeOut"};
 for(const [id,key] of Object.entries(map))$(id).value=clip[key];
 $("clipMute").checked=clip.mute;$("clipSolo").checked=clip.solo;
}
function chapterUI(){
 const list=$("chapterList");list.replaceChildren();
 for(let i=0;i<project.chapters.length;i++){
  const c=project.chapters[i],row=document.createElement("div");row.className="chapter";
  const code=document.createElement("code");code.textContent=fmt(c.at);
  const input=document.createElement("input");input.value=c.title;input.maxLength=100;input.setAttribute("aria-label","Chapter "+(i+1)+" title");
  input.addEventListener("change",()=>safe(()=>{remember();project.chapters[i].title=input.value.trim().slice(0,100);markDirty();}));
  const del=document.createElement("button");del.textContent="×";del.setAttribute("aria-label","Remove chapter");
  del.addEventListener("click",()=>safe(()=>{remember();project.chapters.splice(i,1);markDirty();chapterUI();}));
  row.append(code,input,del);list.append(row);
 }
}
function paintClip(canvas,clip,samples){
 const w=Math.max(1,canvas.clientWidth),h=canvas.clientHeight||54,dpr=devicePixelRatio||1;
 canvas.width=Math.ceil(w*dpr);canvas.height=Math.ceil(h*dpr);
 const p=canvas.getContext("2d");p.setTransform(dpr,0,0,dpr,0,0);
 const from=Math.max(0,Math.floor(clip.start*RATE)),to=Math.min(samples.length/2,Math.ceil(clip.end*RATE));
 const stride=Math.max(1,Math.floor((to-from)/Math.max(1,w))),mid=h/2;
 p.strokeStyle="#effce6";p.lineWidth=1;
 p.beginPath();
 for(let x=0;x<w;x++){
  const a=from+Math.floor(x/w*(to-from)),b=Math.min(to,Math.max(a+1,a+stride));let peak=0;
  for(let f=a;f<b;f++)peak=Math.max(peak,Math.abs(samples[f*2]),Math.abs(samples[f*2+1]));
  const amp=Math.max(1,peak*mid*.90);
  p.moveTo(x,mid-amp);p.lineTo(x,mid+amp);
 }
 p.stroke();
}
function setCursor(){
 const x=playhead*zoom;
 $("rulerCursor").style.left=x+"px";
 $("clock").textContent=fmt(playhead);
}
function setPlayhead(t){
 playhead=Math.max(0,Math.min(duration(project),t));setCursor();
}
function renderTimeline(){
 const clipSpan=Math.max(18,duration(project)+3),width=Math.ceil(clipSpan*zoom);
 const ruler=$("ruler"),ticks=$("rulerTicks");
 ruler.style.width=width+"px";ticks.replaceChildren();
 for(let sec=0;sec<=clipSpan;sec+=2){
  const div=document.createElement("span");div.className="ruler-tick";div.style.left=(sec*zoom)+"px";
  div.textContent=fmt(sec);ticks.append(div);
 }
 setCursor();
 const root=$("lanes");root.replaceChildren();
 if(!project.clips.length){const e=document.createElement("div");e.className="empty-timeline";
  e.textContent="The session is open. Import an audio file or load the synthetic example.";root.append(e);return;}
 const anySolo=project.clips.some(c=>c.solo&&!c.mute);
 for(const c of project.clips){
  const lane=document.createElement("div");lane.className="lane";
  const label=document.createElement("div");label.className="lane-label";
  label.innerHTML='<div class="lane-name"><span class="swatch"></span><div><strong></strong><small></small></div></div><div class="lane-button-row"><button data-mute aria-label="Mute clip">M</button><button data-solo aria-label="Solo clip">S</button></div>';
  label.querySelector(".swatch").style.background=c.tint;label.querySelector("strong").textContent=c.label;
  label.querySelector("small").textContent=fmt(c.end-c.start)+" · "+sourceOf(c)?.kind;
  const mute=label.querySelector("[data-mute]"),solo=label.querySelector("[data-solo]");
  mute.setAttribute("aria-pressed",String(c.mute));solo.setAttribute("aria-pressed",String(c.solo));
  mute.addEventListener("click",()=>safe(()=>{remember();c.mute=!c.mute;markDirty();renderTimeline();displayClip();}));
  solo.addEventListener("click",()=>safe(()=>{remember();c.solo=!c.solo;markDirty();renderTimeline();displayClip();}));
  const laneScroller=document.createElement("div");laneScroller.className="lane-timeline";laneScroller.style.setProperty("--tick",(2*zoom)+"px");
  const inner=document.createElement("div");inner.className="lane-inner";inner.style.width=width+"px";
  const clip=document.createElement("div");clip.className="clip"+(c.id===selected?" selected":"")+(c.mute||anySolo&&!c.solo?" muted":"");
  clip.style.background=c.tint;clip.style.borderColor=c.tint;
  clip.style.left=Math.round(c.at*zoom)+"px";clip.style.width=Math.max(5,Math.round((c.end-c.start)*zoom))+"px";
  clip.setAttribute("role","button");clip.tabIndex=0;clip.setAttribute("aria-label",c.label+", at "+fmt(c.at)+"; press Enter to edit");
  clip.innerHTML='<span class="clip-title"></span><canvas height="53"></canvas><span class="clip-handle left" data-edge="left"></span><span class="clip-handle right" data-edge="right"></span>';
  clip.querySelector(".clip-title").textContent=c.label;
  clip.addEventListener("click",()=>{selected=c.id;displayClip();renderTimeline();});
  clip.addEventListener("keydown",e=>{if(e.key==="Enter"){selected=c.id;displayClip();renderTimeline();$("clipAt").focus();}});
  clip.addEventListener("pointerdown",e=>{
   if(e.button!==0)return;
   const edge=e.target.dataset.edge||"move",startX=e.clientX,before=structuredClone(c);
   selected=c.id;remember();clip.setPointerCapture(e.pointerId);
   clip.addEventListener("pointermove",function move(ev){
     if(!clip.hasPointerCapture(ev.pointerId))return;
     let delta=(ev.clientX-startX)/zoom;if($("snap").checked)delta=Math.round(delta*4)/4;
     Object.assign(c,before);
     if(edge==="move")c.at=Math.max(0,Math.min(MAX_SECONDS-(c.end-c.start),before.at+delta));
     if(edge==="left"){
      const proposed=Math.max(0,Math.min(before.end-.04,before.start+delta));
      c.start=proposed;c.at=Math.max(0,Math.min(MAX_SECONDS-(c.end-proposed),before.at+proposed-before.start));
     }
     if(edge==="right")c.end=Math.min(sourceOf(c).pcm.length/(RATE*2),Math.max(before.start+.04,before.end+delta));
     if(c.at+c.end-c.start>MAX_SECONDS)c.end=MAX_SECONDS-c.at+c.start;
     clip.style.left=Math.round(c.at*zoom)+"px";clip.style.width=Math.max(5,Math.round((c.end-c.start)*zoom))+"px";
   });
   clip.addEventListener("pointerup",()=>{
    if(clip.hasPointerCapture(e.pointerId))clip.releasePointerCapture(e.pointerId);
    markDirty();renderUI();
   },{once:true});
  });
  inner.append(clip);laneScroller.append(inner);lane.append(label,laneScroller);root.append(lane);
  paintClip(clip.querySelector("canvas"),c,sourceOf(c).pcm);
 }
 for(const lane of root.querySelectorAll(".lane-timeline"))lane.addEventListener("scroll",()=>{
  const target=lane.scrollLeft;for(const other of root.querySelectorAll(".lane-timeline"))if(other!==lane)other.scrollLeft=target;
  $("rulerScroll").scrollLeft=target;
 },{passive:true});
}
function drawMaster(){
 const canvas=$("masterWave"),context=canvas.getContext("2d");
 const w=canvas.clientWidth,h=canvas.clientHeight,dpr=devicePixelRatio||1;
 if(!w)return;canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);
 context.setTransform(dpr,0,0,dpr,0,0);context.clearRect(0,0,w,h);
 context.strokeStyle="#324e3a";context.beginPath();context.moveTo(0,h/2);context.lineTo(w,h/2);context.stroke();
 if(!rendered)return;
 const data=rendered.samples,frames=data.length/2,part=frames/w;
 context.strokeStyle="#b7ddba";context.lineWidth=1;context.beginPath();
 for(let x=0;x<w;x++){
  let peak=0;const from=Math.floor(x*part),to=Math.min(frames,Math.floor((x+1)*part));
  const step=Math.max(1,Math.floor((to-from)/180));
  for(let j=from;j<to;j+=step)peak=Math.max(peak,Math.abs(data[j*2]),Math.abs(data[j*2+1]));
  const amplitude=Math.min(h/2-3,peak*h*.43);
  context.moveTo(x,h/2-amplitude);context.lineTo(x,h/2+amplitude);
 }
 context.stroke();
}
function renderUI(){
 refreshMetrics();displayClip();chapterUI();renderTimeline();drawMaster();
 $("zoom").value=zoom;
}
function stop(){
 if(playing){playing.onended=null;try{playing.stop();}catch{}playing.disconnect();playing=null;}
 cancelAnimationFrame(raf);$("play").textContent="▶";$("stop").disabled=true;
}
async function render(){
 if(busy||!project.clips.length)return;
 clearTimeout(renderTimer);stop();validateProject(project,sources);
 busy=true;$("render").disabled=true;$("play").disabled=true;
 const current=editRevision;
 try{
  msg("Mixing native audio blocks…");$("progressFill").style.width="2%";
  const result=await send("render",{project:snapshot()});
  if(editRevision!==current){msg("Arrangement changed before render finished. Render again.");return;}
  rendered={samples:new Float32Array(result.buffer),frames:result.frames,stats:result};
  lastRenderedRevision=current;
  $("progressFill").style.width="100%";$("peak").textContent="PEAK "+(result.peak||0).toFixed(3);
  $("rms").textContent="RMS "+(result.rms||0).toFixed(3);
  $("overs").textContent="OVER 0dB "+result.overs;
  $("play").disabled=false;$("wav16").disabled=false;$("wav32").disabled=false;
  $("preparePodcast").disabled=false;
  msg("Render ready · "+fmt(result.frames/RATE)+
    " · native C/WASM · "+(result.overs?result.overs+" samples above 0 dB":"no clipping"));
  drawMaster();
 }finally{busy=false;$("render").disabled=false;}
}
async function play(){
 if(!rendered)throw Error("Render the current arrangement before playback.");
 stop();audio??=new AudioContext({sampleRate:RATE});await audio.resume();
 const p=rendered.samples,frames=rendered.frames;
 const buffer=audio.createBuffer(2,frames,RATE);
 const l=buffer.getChannelData(0),r=buffer.getChannelData(1);
 for(let i=0;i<frames;i++){l[i]=p[i*2];r[i]=p[i*2+1];}
 playing=audio.createBufferSource();playing.buffer=buffer;playing.connect(audio.destination);
 playOffset=playhead>=frames/RATE?0:playhead;playStart=audio.currentTime;
 const node=playing;
 node.onended=()=>{if(playing===node){playing.disconnect();playing=null;playhead=0;setCursor();$("play").textContent="▶";$("stop").disabled=true;}};
 node.start(0,playOffset);$("play").textContent="▶ Playing";$("stop").disabled=false;
 const tick=()=>{if(!playing)return;setPlayhead(Math.min(frames/RATE,playOffset+audio.currentTime-playStart));raf=requestAnimationFrame(tick);};tick();
}
function download(name,body,type){
 const u=URL.createObjectURL(new Blob([body],{type})),a=document.createElement("a");
 a.href=u;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(u),2500);
}
function exportWav(format,prepared=false){
 if(!rendered)throw Error("Render the arrangement first.");
 setSelection();const {from,to}=selectedFrames(project,rendered.frames);
 const samples=rendered.samples.subarray(from*2,to*2);
 const body=wavEncode(samples,{format});
 const basename=project.title.replace(/[^a-z0-9-]+/gi,"-").slice(0,55)||"creator";
 const filename=(prepared?"podcast-intake-":"aurekai-")+basename+"-"+format+".wav";
 download(filename,body,"audio/wav");
 toast("Prepared "+fmt((to-from)/RATE)+" of stereo audio; source content stays in your browser.");
 return filename;
}
$("audioFiles").addEventListener("change",e=>safe(async()=>{await importAudio([...e.target.files]);e.target.value="";}));
$("loadDemo").addEventListener("click",()=>safe(initExample));
$("sessionTitle").addEventListener("change",e=>safe(()=>{
 const title=e.target.value.trim().slice(0,100)||"Untitled session";
 remember();project.title=title;markDirty();refreshMetrics();
}));
$("save").addEventListener("click",()=>safe(saveProject));
$("savedProjects").addEventListener("change",e=>safe(()=>e.target.value?restoreProject(e.target.value):null));
$("undo").addEventListener("click",()=>safe(()=>{
 if(!undoStack.length)return;redoStack.push(snapshot());project=undoStack.pop();
 if(!project.clips.some(c=>c.id===selected))selected=project.clips[0]?.id||"";
 markDirty();renderUI();
}));
$("redo").addEventListener("click",()=>safe(()=>{
 if(!redoStack.length)return;undoStack.push(snapshot());project=redoStack.pop();
 markDirty();renderUI();
}));
$("render").addEventListener("click",()=>safe(render));
$("play").addEventListener("click",()=>safe(play));
$("stop").addEventListener("click",stop);
$("master").addEventListener("input",e=>{const n=Number(e.target.value);if(n>=0&&n<=2){project.master=n;markDirty();$("masterValue").textContent=Math.round(n*100)+"%";}});
$("normalize").addEventListener("change",e=>{project.normalize=e.target.checked;markDirty();});
$("zoom").addEventListener("input",e=>{zoom=Number(e.target.value);renderTimeline();});
$("ruler").addEventListener("click",e=>{
 const box=$("ruler").getBoundingClientRect();
 setPlayhead((e.clientX-box.left)/zoom);
});
$("ruler").addEventListener("keydown",e=>{
 if(["ArrowLeft","ArrowRight","Home","End"].includes(e.key)){
  e.preventDefault();if(e.key==="Home")setPlayhead(0);else if(e.key==="End")setPlayhead(duration(project));
  else setPlayhead(playhead+(e.key==="ArrowRight"?.25:-.25));
 }
});
$("addChapter").addEventListener("click",()=>safe(()=>{
 if(project.chapters.length>=80)throw Error("Maximum 80 chapters.");
 remember();project.chapters.push({at:Math.max(0,Math.min(playhead,MAX_SECONDS)),title:"Chapter "+(project.chapters.length+1)});
 project.chapters.sort((a,b)=>a.at-b.at);markDirty();chapterUI();toast("Cue point added.");
}));
const fields={clipLabel:"label",clipAt:"at",clipStart:"start",clipEnd:"end",
 clipGain:"gain",clipPan:"pan",clipFadeIn:"fadeIn",clipFadeOut:"fadeOut"};
for(const [id,key] of Object.entries(fields))$(id).addEventListener("change",e=>safe(()=>{
 const clip=selectedClip();if(!clip)return;const n=key==="label"?e.target.value.slice(0,80):Number(e.target.value);
 remember();validMutation(()=>{clip[key]=n;});
 renderUI();
}));
for(const [id,key] of [["clipMute","mute"],["clipSolo","solo"]])$(id).addEventListener("change",e=>safe(()=>{
 const clip=selectedClip();if(!clip)return;remember();clip[key]=e.target.checked;markDirty();renderUI();
}));
$("duplicate").addEventListener("click",()=>safe(()=>{
 const clip=selectedClip();if(!clip||project.clips.length>=MAX_CLIPS)throw Error("The session is at its clip limit.");
 const next=structuredClone(clip);next.id="clip-"+crypto.randomUUID().slice(0,12);
 next.at=Math.min(MAX_SECONDS-(next.end-next.start),next.at+.5);
 remember();project.clips.push(next);selected=next.id;markDirty();renderUI();
}));
$("split").addEventListener("click",()=>safe(()=>{
 const clip=selectedClip();if(!clip)throw Error("Select a clip first.");
 const local=playhead-clip.at;
 if(local<=.04||local>=clip.end-clip.start-.04)throw Error("Put the cursor inside the clip before splitting.");
 if(project.clips.length>=MAX_CLIPS)throw Error("The session is at its clip limit.");
 const first=structuredClone(clip),next=structuredClone(clip);
 next.id="clip-"+crypto.randomUUID().slice(0,12);
 first.end=first.start+local;first.fadeOut=Math.min(first.fadeOut,local);
 next.start=first.end;next.at=playhead;next.fadeIn=Math.min(next.fadeIn,next.end-next.start);
 next.fadeOut=Math.min(next.fadeOut,next.end-next.start);
 remember();Object.assign(clip,first);project.clips.push(next);selected=next.id;
 validateProject(project,sources);markDirty();renderUI();toast("Split at "+fmt(playhead));
}));
$("remove").addEventListener("click",()=>safe(()=>{
 const clip=selectedClip();if(!clip)return;remember();project.clips=project.clips.filter(c=>c.id!==clip.id);
 selected=project.clips[0]?.id||"";markDirty();renderUI();
}));
$("rangeFrom").addEventListener("change",()=>safe(setSelection));
$("rangeTo").addEventListener("change",()=>safe(setSelection));
$("wav16").addEventListener("click",()=>safe(()=>exportWav("pcm16")));
$("wav32").addEventListener("click",()=>safe(()=>exportWav("float32")));
$("downloadNotes").addEventListener("click",()=>safe(()=>{download("creator-show-notes.md",showNotes(project),"text/markdown");toast("Chapter notes exported.");}));
$("downloadHandoff").addEventListener("click",()=>safe(()=>{download("creator-session.yaff",handoffYaff(project),"text/plain");toast("Typed review proposal exported. No publication requested.");}));
$("sessionNotes").addEventListener("change",e=>{project.notes=e.target.value.slice(0,5000);markDirty();});
$("rights").addEventListener("change",e=>{project.rights=e.target.value;markDirty();});
$("preparePodcast").addEventListener("click",()=>safe(()=>{
 if(!["self-owned","licensed"].includes(project.rights))
  throw Error("Review source rights before preparing a publishing handoff.");
 const filename=exportWav("pcm16",true);
 $("deliveryStatus").textContent="Downloaded "+filename+". Upload with GitHub's own input workflow if authorized, then inspect the resulting episode. No publishing request has been sent.";
 toast("Podcast intake audio prepared locally.");
}));
new ResizeObserver(()=>{drawMaster();}).observe($("masterWave"));
addEventListener("pagehide",()=>{stop();worker?.terminate();audio?.close();});
const publicSnapshot=()=>({
 title:project.title,sources:sources.size,clips:project.clips.length,chapters:project.chapters.length,
 duration:duration(project),rendered:Boolean(rendered),kernel:$("kernelStatus").textContent,
 selected,selection:structuredClone(project.selection),rights:project.rights,
 lastPeak:rendered?.stats.peak??null
});
Object.defineProperty(window,"aurekaiCreatorWitness",{get:()=>publicSnapshot});
(async()=>{
 try{
  configureWorker();db=await openDB().catch(()=>null);
  await refreshSaves();await initExample();
  $("kernelStatus").textContent="Native C/WASM · verified";
 }catch(error){
  $("kernelStatus").textContent="Native audio unavailable";
  msg(error.message);toast(error.message,true);
 }
})();
