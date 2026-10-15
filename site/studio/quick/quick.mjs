/* A compact, real-content production surface over the same native C/Wasm
 * mixer as the full Creator Studio. No uploads or auto-publication.
 */
import {RATE,fmt,wavEncode,showNotes,selectedFrames,validateProject} from "../mix-model.mjs";
import {loadEditorialSession} from "../editorial-kit.mjs";
const $=id=>document.getElementById(id);
let project=null,sources=new Map(),worker=null,context=null,playing=null,rendered=null,playStarted=0;
let pending=new Map(),requestId=0,revision=0,busy=false,clockRaf=0;
const presets={
 interview:{label:"Spoken opener",voice:1,music:.32,ambience:.07,fx:.06,depth:15},
 documentary:{label:"Documentary scene",voice:.9,music:.30,ambience:.2,fx:.13,depth:10},
 voice:{label:"Voice forward",voice:1.15,music:.10,ambience:0,fx:0,depth:18},
 promo:{label:"Short-form teaser",voice:.9,music:.55,ambience:.13,fx:.26,depth:8}
};
const labels={voice:"Human narration",music:"Music score",ambience:"Location ambience",fx:"Recorded Foley"};
function toast(s,error=false){
 const e=$("toast");e.textContent=s;e.style.background=error?"#edc7be":"#c2e1b8";
 e.classList.add("show");clearTimeout(toast.timer);toast.timer=setTimeout(()=>e.classList.remove("show"),4000);
}
const safe=fn=>Promise.resolve().then(fn).catch(e=>{toast(e.message||String(e),true);$("status").textContent=e.message||String(e);});
function stop(){
 if(playing){playing.onended=null;try{playing.stop();}catch{}playing.disconnect();playing=null;}
 cancelAnimationFrame(clockRaf);$("play").textContent="▶";$("stop").disabled=true;$("clock").textContent="00:00.00";
}
function workerSetup(){
 worker=new Worker(new URL("../mix-worker.mjs",import.meta.url),{type:"module"});
 worker.onmessage=({data})=>{
  if(data.type==="progress"){$("status").textContent="Mixing real audio · "+Math.round(data.ratio*100)+"%";return;}
  const t=pending.get(data.id);if(!t)return;
  pending.delete(data.id);clearTimeout(t.timer);
  data.type==="error"?t.reject(Error(data.message)):t.resolve(data);
 };
 worker.onerror=()=>{for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error("Native mixer worker failed."));}pending.clear();};
}
function send(type,payload){
 const id=requestId++;
 return new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>{pending.delete(id);reject(Error("Native render timed out."));},90000);
  pending.set(id,{resolve,reject,timer});worker.postMessage({id,type,...payload});
 });
}
async function load(){
 context??=new AudioContext({sampleRate:RATE});
 $("status").textContent="Verifying source licences and decoded audio…";
 const result=await loadEditorialSession(context,m=>$("status").textContent=m);
 await send("reset",{});
 for(const [id,src] of result.sources)await send("source",{sourceId:id,name:src.name,pcm:src.pcm});
 project=result.project;sources=result.sources;project.id="quick-radio-"+crypto.randomUUID().slice(0,10);
 setPreset("interview");
 renderCredits();buildRows();await render();
 $("engineStatus").textContent="Native C/Wasm · 4 verified source recordings";
 toast("Real editorial material loaded. Try the spoken opener, then compare production presets.");
}
function clipByRole(role){return project.clips.find(c=>c.role===role);}
const dbFromGain=g=>g>0?Math.round(20*Math.log10(g)*10)/10:-60;
const gainFromDb=d=>d<=-60?0:Math.pow(10,d/20);
function setPreset(name){
 if(!presets[name]||!project)throw Error("Unknown production treatment.");
 const p=presets[name];
 for(const role of ["voice","music","ambience","fx"]){
  const clip=clipByRole(role);if(clip)clip.gain=p[role];
 }
 project.ducking={enabled:true,depthDb:p.depth,thresholdDb:-37,attackMs:45,releaseMs:340};
 project.normalize=true;project.voiceHighpass=true;
 document.querySelectorAll(".preset").forEach(b=>b.classList.toggle("selected",b.dataset.preset===name));
 $("duck").checked=true;$("duckDepth").value=p.depth;$("duckValue").textContent=p.depth+" dB";
 $("highpass").checked=true;$("peakLimit").checked=true;
 changed();
}
function sourceHTML(s){
 const node=document.createElement("div");node.className="source";
 const c=project.clips.find(c=>sources.get(c.sourceId)===s);
 if(!c)return node;
 const top=document.createElement("div");top.className="source-top";
 const left=document.createElement("div");
 const heading=document.createElement("strong");heading.textContent=labels[c.role]||c.label;
 const sub=document.createElement("small");sub.textContent=s.name;
 left.append(heading,sub);
 const tag=document.createElement("span");tag.className="tag";tag.textContent=s.kind||"recording";
 top.append(left,tag);node.append(top);
 const level=document.createElement("div");level.className="level";
 const label=document.createElement("label");label.textContent="FADER / DECIBELS";
 const input=document.createElement("input");input.type="range";input.min="-60";input.max="6";
 input.step=".5";input.value=Math.round(dbFromGain(c.gain)*2)/2;input.dataset.role=c.role;
 input.setAttribute("aria-label",(labels[c.role]||c.label)+" level");
 label.append(input);
 const output=document.createElement("output");output.textContent=Number(input.value)+" dB";
 input.addEventListener("input",()=>{const d=Number(input.value);c.gain=gainFromDb(d);output.textContent=d+" dB";changed();});
 level.append(label,output);node.append(level);
 const foot=document.createElement("p");foot.className="foot";
 foot.textContent=(s.rights||"Rights not reviewed")+" · "+(c.role==="voice"?"Source trims and narration placement in the full Studio.":"Nondestructive levels; keep source credits with reuse.");
 node.append(foot);
 return node;
}
function buildRows(){
 const holder=$("sourceRows");holder.replaceChildren();
 for(const [,src] of sources)holder.append(sourceHTML(src));
 $("duration").textContent=fmt(project.clips.reduce((n,c)=>Math.max(n,c.at+c.end-c.start),0));
}
function renderCredits(){
 const holder=$("credits");holder.replaceChildren();
 for(const s of sources.values()){
  const row=document.createElement("div"),strong=document.createElement("strong");
  strong.textContent=s.origin||s.name;
  const d=document.createElement("span");d.textContent=(s.rights||"Rights unreviewed")+(s.requiresAttribution?" · REQUIRED CREDIT ON REDISTRIBUTION":"");
  row.append(strong,d);
  if(s.originURL&&s.originURL.startsWith("https://")){
   const link=document.createElement("a");link.href=s.originURL;link.target="_blank";
   link.rel="noopener noreferrer";link.textContent=" · Original source ↗";row.append(link);
  }
  holder.append(row);
 }
}
function changed(){
 revision++;if(rendered){rendered=null;stop();}
 $("play").disabled=true;$("download").disabled=true;$("continue").disabled=!project;
 $("status").textContent="Mix changed. Render to hear the latest balance.";
}
async function render(){
 if(!project||busy)return;
 busy=true;stop();$("render").disabled=true;
 const current=revision;
 $("status").textContent="Rendering narration and background with the native C mixer…";
 try{
  validateProject(project,sources);
  const result=await send("render",{project:structuredClone(project)});
  if(current!==revision)throw Error("Your mix changed during the render. Render again.");
  rendered={pcm:new Float32Array(result.buffer),frames:result.frames,stats:result};
  $("peak").textContent=(result.peak>0?20*Math.log10(result.peak).toFixed(1):"-∞")+" dBFS";
  $("rms").textContent=(result.rms>0?20*Math.log10(result.rms).toFixed(1):"-∞")+" dBFS";
  $("clipped").textContent=String(result.overs);
  $("play").disabled=false;$("download").disabled=false;$("continue").disabled=false;
  $("status").textContent="Render ready · "+fmt(result.frames/RATE)+" · native C/Wasm · "+result.overs+" over-limit samples.";
  draw();return result;
 }finally{busy=false;$("render").disabled=false;}
}
function draw(){
 const canvas=$("wave"),width=canvas.clientWidth,height=canvas.clientHeight;
 if(!width)return;
 const px=devicePixelRatio||1;canvas.width=Math.ceil(width*px);canvas.height=Math.ceil(height*px);
 const g=canvas.getContext("2d");g.setTransform(px,0,0,px,0,0);
 g.clearRect(0,0,width,height);g.strokeStyle="#496b52";g.beginPath();g.moveTo(0,height/2);g.lineTo(width,height/2);g.stroke();
 if(!rendered)return;
 const data=rendered.pcm,frames=rendered.frames;
 g.strokeStyle="#c7e1be";g.lineWidth=1;
 for(let x=0;x<width;x++){
  let peak=0,from=Math.floor(x/width*frames),to=Math.min(frames,Math.ceil((x+1)/width*frames));
  for(let f=from;f<to;f+=Math.max(1,Math.floor((to-from)/80)))peak=Math.max(peak,Math.abs(data[f*2]),Math.abs(data[f*2+1]));
  const amp=Math.min(height*.46,peak*height*.43);
  g.beginPath();g.moveTo(x,height/2-amp);g.lineTo(x,height/2+amp);g.stroke();
 }
}
async function play(){
 if(!rendered)throw Error("Render the mix before playing.");
 stop();context??=new AudioContext({sampleRate:RATE});await context.resume();
 const data=rendered.pcm,buffer=context.createBuffer(2,rendered.frames,RATE);
 const l=buffer.getChannelData(0),r=buffer.getChannelData(1);
 for(let i=0;i<rendered.frames;i++){l[i]=data[i*2];r[i]=data[i*2+1];}
 playing=context.createBufferSource();playing.buffer=buffer;playing.connect(context.destination);
 const node=playing;playStarted=context.currentTime;
 node.onended=()=>{if(playing===node)stop();};
 node.start();$("play").textContent="▶ Playing";$("stop").disabled=false;
 const tick=()=>{if(!playing)return;$("clock").textContent=fmt(context.currentTime-playStarted);clockRaf=requestAnimationFrame(tick);};tick();
}
function download(filename,body,type){
 const url=URL.createObjectURL(new Blob([body],{type})),a=document.createElement("a");
 a.href=url;a.download=filename;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function creditsNote(){
 return showNotes(project)+"\n## Recording credits\n"+[...sources.values()].map(s=>
  "- "+(s.origin||s.name)+" — "+s.rights+(s.requiresAttribution?" (REQUIRED CC BY 4.0 attribution)":"")+
  (s.originURL?" — "+s.originURL:"")).join("\n")+"\n";
}
function exportWav(){
 if(!rendered)throw Error("No current rendered mix.");
 const start=Number($("from").value)||0,end=Number($("to").value)||0;
 if(!Number.isFinite(start)||!Number.isFinite(end)||start<0||end<0||start>rendered.frames/RATE||end>rendered.frames/RATE)
  throw Error("The chosen export region exceeds your edit.");
 if(end>0&&end<=start)throw Error("Cut ending must follow the starting point.");
 project.selection={from:start,to:end};
 const coords=selectedFrames(project,rendered.frames);
 const body=wavEncode(rendered.pcm.subarray(coords.from*2,coords.to*2),{format:"pcm16"});
 download("aurekai-quick-mix.wav",body,"audio/wav");
 if([...sources.values()].some(s=>s.requiresAttribution))download("aurekai-quick-mix-credits.md",creditsNote(),"text/markdown");
 toast("Edited WAV prepared locally. Required attribution notes exported where applicable.");
}
async function replaceNarration(file){
 if(!project||!file)throw Error("Open a source session first.");
 if(file.size>35*1024*1024||file.size<40)throw Error("Recordings must be between 40 bytes and 35 MB.");
 context??=new AudioContext({sampleRate:RATE});
 const buffer=await file.arrayBuffer();let audio=await context.decodeAudioData(buffer.slice(0));
 if(audio.sampleRate!==RATE){
  const off=new OfflineAudioContext(Math.min(2,audio.numberOfChannels),Math.ceil(audio.duration*RATE),RATE);
  const src=off.createBufferSource();src.buffer=audio;src.connect(off.destination);src.start();audio=await off.startRendering();
 }
 if(audio.length<1||audio.length>MAX_SECONDS*RATE)throw Error("Imported narration must be shorter than three minutes.");
 const other=[...sources].filter(([id])=>id!=="real-reading").reduce((n,[,s])=>n+s.pcm.length,0);
 if(other+audio.length*2>MAX_SOURCE_FLOATS)throw Error("The recording exceeds the session memory bound.");
 const pcm=new Float32Array(audio.length*2),l=audio.getChannelData(0),r=audio.getChannelData(Math.min(1,audio.numberOfChannels-1));
 for(let f=0;f<audio.length;f++){pcm[f*2]=l[f];pcm[f*2+1]=r[f];}
 const source=sources.get("real-reading");
 source.name="Your recording: "+file.name;source.pcm=pcm;source.kind="local narration";source.rights="Rights not established";
 source.origin="Imported by this visitor";source.originURL="";source.requiresAttribution=false;
 const clip=clipByRole("voice");clip.end=audio.length/RATE;
 const max=clip.at+clip.end;
 if(max>MAX_SECONDS)clip.at=0;
 if(max>MAX_SECONDS)throw Error("Narration cannot fit this session.");
 if(clip.fadeOut>clip.end)clip.fadeOut=Math.min(.3,clip.end);
 await send("reset",{});
 for(const [id,s] of sources)await send("source",{sourceId:id,name:s.name,pcm:s.pcm});
 project.credits=[...sources.values()].map(s=>(s.requiresAttribution?"REQUIRED CREDIT: ":"Credit: ")+(s.origin||s.name)+" | "+s.rights).join("\n");
 changed();buildRows();renderCredits();await render();
 toast("Your recorded voice replaced the reading; none of its bytes were uploaded.");
}
async function continueToStudio(){
 if(!project)throw Error("No source session.");
 const id="quick-radio-"+crypto.randomUUID().slice(0,12);
 project.id=id;
 const db=await new Promise((resolve,reject)=>{
  const req=indexedDB.open("bonfyre-creator-native-session-v1",1);
  req.onupgradeneeded=()=>{if(!req.result.objectStoreNames.contains("projects"))req.result.createObjectStore("projects");};
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
 });
 const data={project:structuredClone(project),
  sources:[...sources].map(([key,s])=>[key,{name:s.name,kind:s.kind,rights:s.rights,
    origin:s.origin,originURL:s.originURL,role:s.role,requiresAttribution:s.requiresAttribution,pcm:s.pcm}])};
 await new Promise((resolve,reject)=>{
  const tx=db.transaction("projects","readwrite");
  tx.objectStore("projects").add({id,revision:1,updatedAt:Date.now(),data},id);
  tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(Error("Could not save the local handoff."));
 });
 db.close();location.href="../?open="+encodeURIComponent(id);
}
for(const b of document.querySelectorAll("[data-preset]"))
 b.addEventListener("click",()=>safe(async()=>{setPreset(b.dataset.preset);buildRows();await render();}));
$("duck").addEventListener("change",()=>safe(async()=>{project.ducking.enabled=$("duck").checked;changed();await render();}));
$("duckDepth").addEventListener("input",()=>{
 if(!project)return;project.ducking.depthDb=Number($("duckDepth").value);
 $("duckValue").textContent=project.ducking.depthDb+" dB";changed();
});
$("duckDepth").addEventListener("change",()=>safe(render));
$("highpass").addEventListener("change",()=>safe(async()=>{project.voiceHighpass=$("highpass").checked;changed();await render();}));
$("peakLimit").addEventListener("change",()=>safe(async()=>{project.normalize=$("peakLimit").checked;changed();await render();}));
$("render").addEventListener("click",()=>safe(render));
$("play").addEventListener("click",()=>safe(play));
$("stop").addEventListener("click",stop);
$("download").addEventListener("click",()=>safe(exportWav));
$("notes").addEventListener("click",()=>safe(()=>{download("aurekai-quick-mix-notes.md",creditsNote(),"text/markdown");toast("Notes and required source credits downloaded.");}));
$("continue").addEventListener("click",()=>safe(continueToStudio));
$("voiceFile").addEventListener("change",e=>safe(async()=>{const file=e.target.files?.[0];if(file)await replaceNarration(file);e.target.value="";}));
new ResizeObserver(draw).observe($("wave"));
addEventListener("pagehide",()=>{stop();worker?.terminate();context?.close();});
(async()=>{try{workerSetup();await load();}catch(e){$("engineStatus").textContent="Licensed source unavailable";
 $("status").textContent=e.message+" · Use the full Creator Studio to import audio.";
 toast(e.message,true);}})();
