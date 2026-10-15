/* Typed multitrack timeline over source-owned PCM.
 * No JSON business store, no remote upload of local media.
 */
export const RATE=48000, CHANNELS=2, MAX_CLIPS=32, MAX_SOURCES=16,
  MAX_SECONDS=180, MAX_SOURCE_FLOATS=RATE*CHANNELS*260;
export const finite=(n,lo,hi)=>Number.isFinite(n)&&n>=lo&&n<=hi;
const bound=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
export function validateProject(p,sources){
 if(!p||!Array.isArray(p.clips)||p.clips.length>MAX_CLIPS||p.sampleRate!==RATE)
   throw Error("Invalid source-bound timeline.");
 if(!finite(p.master,0,2)||!Array.isArray(p.chapters)||p.chapters.length>80)
   throw Error("Invalid master or chapter map.");
 let total=0;
 for(const s of sources.values()){
   if(!(s.pcm instanceof Float32Array)||s.pcm.length%CHANNELS||
      !s.pcm.length||s.pcm.length>MAX_SOURCE_FLOATS)
      throw Error("Invalid decoded PCM source.");
   total+=s.pcm.length;
 }
 if(sources.size>MAX_SOURCES||total>MAX_SOURCE_FLOATS)
   throw Error("Source capacity exceeded; use shorter or fewer source clips.");
 const ids=new Set();
 for(const c of p.clips){
   const s=sources.get(c.sourceId);
   if(!/^[a-z0-9-]{1,70}$/i.test(c.id)||ids.has(c.id)||!s)
      throw Error("Clip source identity is missing.");
   ids.add(c.id);
   if(!finite(c.start,0,s.pcm.length/(RATE*CHANNELS))||
      !finite(c.end,c.start,s.pcm.length/(RATE*CHANNELS))||c.end-c.start<1/RATE||
      !finite(c.at,0,MAX_SECONDS)||c.at+c.end-c.start>MAX_SECONDS+1e-6||
      !finite(c.gain,0,2)||!finite(c.pan,-1,1)||
      !finite(c.fadeIn,0,c.end-c.start)||!finite(c.fadeOut,0,c.end-c.start)||
      typeof c.mute!=="boolean"||typeof c.solo!=="boolean")
      throw Error("Clip exceeds original source, arrangement or mix bounds.");
 }
 for(const m of p.chapters)if(!finite(m.at,0,MAX_SECONDS)||
    typeof m.title!=="string"||m.title.length>100)throw Error("Invalid cue marker.");
 return true;
}
export function duration(p){
 return Math.max(.5,...p.clips.map(c=>c.at+c.end-c.start),...p.chapters.map(m=>m.at));
}
export const fmt=s=>{
 s=Math.max(0,Number(s)||0);
 const mins=Math.floor(s/60),sec=Math.floor(s%60),msec=Math.floor((s%1)*100);
 return String(mins).padStart(2,"0")+":"+String(sec).padStart(2,"0")+"."+String(msec).padStart(2,"0");
};
export function clipFrame(c){
 return {at:Math.round(c.at*RATE),from:Math.round(c.start*RATE),
  to:Math.round(c.end*RATE)};
}
export function trimClip(c,source,start,end){
 const cap=source.pcm.length/(RATE*CHANNELS);
 if(!finite(start,0,cap)||!finite(end,start,cap)||end-start<1/RATE)
   throw Error("Trim lies outside the original recording.");
 return {...c,start,end};
}
export function panGains(pan){
 if(!finite(pan,-1,1))throw Error("Pan must remain between left and right.");
 return {left:Math.cos((pan+1)*Math.PI/4)*Math.SQRT2,
  right:Math.sin((pan+1)*Math.PI/4)*Math.SQRT2};
}
export const isAudible=(c,solo)=>!c.mute&&(!solo||c.solo);
export function envelope(c,position){
 const local=position-c.start,len=c.end-c.start;
 const attack=c.fadeIn>0?bound(local/c.fadeIn,0,1):1;
 const release=c.fadeOut>0?bound((len-local)/c.fadeOut,0,1):1;
 return Math.min(attack,release);
}
export function sourcePeaks(samples,columns=240){
 const peaks=new Float32Array(columns),frames=samples.length/2;
 for(let i=0;i<columns;i++){
  const a=Math.floor(i*frames/columns),b=Math.min(frames,Math.max(a+1,Math.ceil((i+1)*frames/columns)));
  let peak=0;
  for(let f=a;f<b;f++)peak=Math.max(peak,Math.abs(samples[2*f]),Math.abs(samples[2*f+1]));
  peaks[i]=peak;
 }
 return peaks;
}
export const emptyProject=()=>({
 sampleRate:RATE,id:"local-session",title:"Untitled session",master:1,
 normalize:false,notes:"",rights:"unreviewed",clips:[],chapters:[],
 selection:{from:0,to:0}
});
export function exampleSession(){
 const p=emptyProject();
 p.title="Aurekai / Sound design session";
 p.notes="Synthetic example with four editable sources. Import recordings to replace them.";
 p.chapters=[{at:0,title:"Opening"},{at:4,title:"Build"},{at:9,title:"Outro"}];
 const labels=["Pulse","Bass","Atmosphere","Signal"],ends=[10,9,12,7];
 p.clips=labels.map((label,i)=>({
  id:"demo-"+i,sourceId:"demo-"+i,label,at:[0,.5,1.2,4][i],
  start:0,end:ends[i],gain:[.72,.5,.35,.3][i],pan:[0,-.22,.3,.15][i],
  fadeIn:i===2?1.5:.04,fadeOut:i===2?1.3:.6,
  mute:false,solo:false,tint:["#b8e4bd","#b7ce96","#d6ba8a","#92c9d0"][i]
 }));
 return p;
}
export function exampleAudio(){
 const result=new Map(),clips=exampleSession().clips;
 for(let t=0;t<clips.length;t++){
  const frames=Math.round(clips[t].end*RATE),pcm=new Float32Array(frames*2);
  for(let f=0;f<frames;f++){
   const sec=f/RATE,x=Math.PI*2*sec;
   let v=0;
   if(t===0)v=.42*Math.exp(-(sec%(.5))*11)*Math.sin(x*95)+.08*Math.exp(-(sec%(.25))*30)*Math.sin(x*830);
   else if(t===1)v=.21*(Math.sin(x*55)+.45*Math.sin(x*110));
   else if(t===2)v=.17*(Math.sin(x*220)+.4*Math.sin(x*330)+.2*Math.sin(x*440));
   else v=.28*Math.exp(-(sec%1)*4)*Math.sin(x*(440+70*Math.sin(sec*2)));
   pcm[f*2]=v;pcm[f*2+1]=v*(.92+.08*Math.sin(sec*1.5));
  }
  result.set("demo-"+t,{name:clips[t].label+" · synthetic",pcm,
   kind:"generated",rights:"generated locally",peaks:sourcePeaks(pcm)});
 }
 return result;
}
export function wavEncode(data,{sampleRate=RATE,channels=2,format="pcm16"}={}){
 if(!(data instanceof Float32Array)||data.length%channels||
    data.length>RATE*MAX_SECONDS*CHANNELS||
    !["pcm16","float32"].includes(format))throw Error("WAV exceeds format or session bound.");
 const float=format==="float32",bps=float?4:2,bytes=new ArrayBuffer(44+data.length*bps),v=new DataView(bytes);
 const word=(at,s)=>[...s].forEach((c,i)=>v.setUint8(at+i,c.charCodeAt(0)));
 word(0,"RIFF");v.setUint32(4,bytes.byteLength-8,true);
 word(8,"WAVE");word(12,"fmt ");v.setUint32(16,16,true);
 v.setUint16(20,float?3:1,true);v.setUint16(22,channels,true);
 v.setUint32(24,sampleRate,true);v.setUint32(28,sampleRate*channels*bps,true);
 v.setUint16(32,channels*bps,true);v.setUint16(34,bps*8,true);
 word(36,"data");v.setUint32(40,data.length*bps,true);
 data.forEach((n,i)=>{
  if(!Number.isFinite(n))throw Error("Nonfinite PCM cannot be exported.");
  if(float)v.setFloat32(44+4*i,n,true);
  else{const x=bound(n,-1,1);v.setInt16(44+2*i,Math.round(x*(x<0?32768:32767)),true);}
 });
 return bytes;
}
export function selectedFrames(p,frames){
 const from=Math.round((p.selection?.from||0)*RATE);
 const to=Math.round((p.selection?.to||0)*RATE);
 return from>=0&&to>from&&to<=frames?{from,to}:{from:0,to:frames};
}
export function showNotes(p){
 const chapters=[...p.chapters].sort((a,b)=>a.at-b.at);
 return [
  "# "+p.title,"","## Chapters",
  ...chapters.map(m=>"- "+fmt(m.at)+" — "+m.title),"",
  "## Production notes",p.notes||"Notes not provided.","",
  "## Rights and release review",
  "Rights state: "+p.rights,
  "This document has not been published or distributed; source rights require review."
 ].join("\n")+"\n";
}
const quoted=s=>'"'+String(s??"").replace(/[\t\r\n"]/g," ").slice(0,180)+'"';
export function handoffYaff(p){
 if(!p||!Array.isArray(p.clips)||p.sampleRate!==RATE||p.clips.length>MAX_CLIPS)
   throw Error("Invalid typed session handoff.");
 return ["program creator-session-proposal","title "+quoted(p.title),
  "sample_rate "+RATE,"channels 2","clips "+p.clips.length,"master "+p.master,
  "rights "+p.rights,
  ...p.clips.map(c=>["clip",c.id,c.sourceId,clipFrame(c).at,
   clipFrame(c).from,clipFrame(c).to,c.gain,c.pan,c.fadeIn,c.fadeOut,
   c.mute?"mute":"active",c.solo?"solo":"standard"].join(" ")),
  ...p.chapters.map(m=>"chapter "+Math.round(m.at*RATE)+" "+quoted(m.title)),
  "authority none","cannot_infer source_clip_is_not_rights_admission_or_release"
 ].join("\n")+"\n";
}