/* Real editorial media: LibriVox, CC0 music, public-domain room and CC-BY Foley.
 * This is a boundary loader for externally sourced AUDIO BYTES, not a runtime
 * business manifest or a truth claim about any audio it has not checked.
 */
import {RATE,emptyProject,sourcePeaks,validateProject} from "./mix-model.mjs";
export const SOURCES=Object.freeze([
 {id:"reading",file:"voice-reading.mp3",label:"Reader · public-domain voice",role:"voice",
  origin:"LibriVox / Sara Teasdale — After Love",
  url:"https://archive.org/details/spc266_2508_librivox",
  license:"Public domain / PD Mark 1.0",requiredCredit:false,
  tint:"#b8dcc1",gain:.88,at:2,fadeIn:.12,fadeOut:.35,pan:0},
 {id:"bed",file:"music-bed.mp3",label:"Lo-fi bed · DURU",role:"music",
  origin:"DURU — duru-roomscene-lofi",url:"https://github.com/uncle-sheepsky/duru-cc0-bgm",
  license:"CC0 1.0",requiredCredit:false,
  tint:"#d7bf89",gain:.36,at:0,fadeIn:.75,fadeOut:1.3,pan:0},
 {id:"location",file:"location-ambience.mp3",label:"Café · location ambience",role:"ambience",
  origin:"stephan / pdsounds.org — Restaurant ambience",
  url:"https://commons.wikimedia.org/wiki/File:Restaurant_ambience.ogg",
  license:"Public domain",requiredCredit:false,
  tint:"#8bbecb",gain:.12,at:1.8,fadeIn:1.2,fadeOut:1.2,pan:-.12},
 {id:"foley",file:"keyboard-foley.mp3",label:"Keyboard · editorial Foley",role:"fx",
  origin:"C40115 — Typing on Keychron V1 Ultra (Red Linear Switch)",
  url:"https://commons.wikimedia.org/wiki/File:Typing_on_Keychron_V1_Ultra_(Red_Linear_Switch).wav",
  license:"CC BY 4.0",requiredCredit:true,
  tint:"#d2a89e",gain:.12,at:13,fadeIn:.08,fadeOut:.4,pan:.35}
]);
const media=new URL("./media/",import.meta.url);
async function responseFile(url,bound=650000){
 const r=await fetch(url,{cache:"no-store"});
 if(!r.ok)throw Error("Published editorial audio unavailable ("+r.status+").");
 const body=await r.arrayBuffer();
 if(body.byteLength<=0||body.byteLength>bound)throw Error("Audio source failed size admission.");
 return body;
}
export async function loadEditorialSession(audio,report=()=>{}){
 if(!audio||typeof audio.decodeAudioData!=="function")throw Error("A browser audio decoder is required.");
 const checksumText=new TextDecoder().decode(await responseFile(new URL("SHA256SUMS",media),16000));
 const hashes=new Map();
 for(const row of checksumText.trim().split(/\r?\n/)){
  const m=row.match(/^([0-9a-f]{64})\s+([a-z0-9-]+\.mp3)$/);
  if(!m||hashes.has(m[2]))throw Error("Malformed or duplicate editorial asset checksum.");
  hashes.set(m[2],m[1]);
 }
 if(SOURCES.some(s=>!hashes.has(s.file)))throw Error("Editorial media build is incomplete.");
 const sources=new Map(),project=emptyProject();
 project.id="editorial-session";project.title="After Love / An editorial sound scene";
 project.notes="A sourced spoken-word vignette. Bring the LibriVox reading forward, duck the lo-fi bed, and choose a clean outro. Credits must accompany any published export.";
 project.rights="permission-pending";
 project.ducking={enabled:true,depthDb:12,thresholdDb:-37,attackMs:45,releaseMs:340};
 project.chapters=[
  {at:0,title:"Music intro"},{at:2,title:"Poem begins"},{at:12.5,title:"Scene transition"},
  {at:16,title:"Closing sound"}];
 project.credits=SOURCES.map(s=>(s.requiredCredit?"REQUIRED CREDIT: ":"Credit: ")+s.origin+
   " | "+s.license+" | "+s.url).join("\n");
 const memory=RATE*2*260;
 let floats=0;
 for(let index=0;index<SOURCES.length;index++){
  const item=SOURCES[index];report("Loading real licensed source "+(index+1)+"/"+SOURCES.length+": "+item.label);
  const binary=await responseFile(new URL(item.file,media));
  const digest=[...new Uint8Array(await crypto.subtle.digest("SHA-256",binary))]
    .map(x=>x.toString(16).padStart(2,"0")).join("");
  if(hashes.get(item.file)!==digest)throw Error("Published "+item.file+" did not match its signed checksum listing.");
  const recording=await audio.decodeAudioData(binary.slice(0));
  if(recording.sampleRate!==RATE)throw Error("Editorial audio must be resampled to 48kHz.");
  if(recording.numberOfChannels<1||recording.numberOfChannels>2)throw Error("Editorial source must be mono or stereo.");
  const pcm=new Float32Array(recording.length*2),left=recording.getChannelData(0),
    right=recording.getChannelData(recording.numberOfChannels===2?1:0);
  floats+=pcm.length;
  if(floats>memory)throw Error("Editorial sources exceed local memory budget.");
  for(let f=0;f<recording.length;f++){pcm[f*2]=left[f];pcm[f*2+1]=right[f];}
  const sourceId="real-"+item.id;
  sources.set(sourceId,{name:item.label,pcm,peaks:sourcePeaks(pcm),
    kind:"licensed recording",rights:item.license,origin:item.origin,
    originURL:item.url,requiresAttribution:item.requiredCredit,role:item.role,sha256:digest});
  const seconds=pcm.length/(RATE*2);
  project.clips.push({
    id:"clip-"+item.id,sourceId,label:item.label,role:item.role,
    at:item.at,start:0,end:seconds,gain:item.gain,pan:item.pan,
    fadeIn:item.fadeIn,fadeOut:item.fadeOut,mute:false,solo:false,tint:item.tint
  });
 }
 validateProject(project,sources);
 report("All four source recordings verified against SHA-256 and decoded locally.");
 return {project,sources,hashes};
}
