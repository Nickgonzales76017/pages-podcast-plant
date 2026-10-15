/* Bounded offline mixer worker using the exact C aurekai_mix_f32 operation
 * compiled to WebAssembly. Source PCM stays in this browser's worker.
 * A render is not an upload, entitlement, proof of rights, or distribution.
 */
import {createNativeMixer} from "./native-kernel.mjs";
import {RATE,MAX_SECONDS,MAX_CLIPS,MAX_SOURCES,MAX_SOURCE_FLOATS,
  validateProject,duration,clipFrame,panGains,isAudible,envelope} from "./mix-model.mjs";
const sources=new Map();
let desired=0,mixerPromise=createNativeMixer(),kernelVersion="";
const send=(type,body)=>postMessage({type,...body});
self.addEventListener("message",async ({data})=>{
 try{
  if(!data||!Number.isSafeInteger(data.id))throw Error("Invalid render request.");
  if(data.type==="reset"){sources.clear();desired++;send("reset",{id:data.id});return;}
  if(data.type==="source"){
   const id=data.sourceId,p=data.pcm;
   if(typeof id!=="string"||!(/^[a-z0-9-]{1,70}$/i.test(id))||
     !(p instanceof Float32Array)||p.length%2||!p.length||p.length>MAX_SOURCE_FLOATS)
       throw Error("The selected audio source is out of bounds.");
   if(!sources.has(id)&&sources.size>=MAX_SOURCES)throw Error("Maximum sixteen source files.");
   let sum=0;for(const [other,s] of sources)if(other!==id)sum+=s.pcm.length;
   if(sum+p.length>MAX_SOURCE_FLOATS)throw Error("Audio sources exceed the session memory limit.");
   sources.set(id,{name:data.name||id,pcm:p});
   send("source",{id:data.id,sourceId:id,frames:p.length/2});return;
  }
  if(data.type==="cancel"){desired++;send("cancel",{id:data.id});return;}
  if(data.type!=="render")throw Error("Unknown audio operation.");
  const current=++desired,project=data.project;
  validateProject(project,sources);
  const mixer=await mixerPromise;
  const frames=Math.ceil(duration(project)*RATE);
  if(frames>MAX_SECONDS*RATE)throw Error("Output is longer than three minutes.");
  const output=new Float32Array(frames*2),clips=project.clips.map(c=>({...c,...clipFrame(c)}));
  const hasSolo=project.clips.some(c=>c.solo&&!c.mute);
  let peak=0,energy=0,overs=0;
  const blockCount=Math.ceil(frames/1024),chunk=128;
  for(let at=0,block=0;at<frames;at+=1024,block++){
   if(current!==desired){send("cancelled",{id:data.id});return;}
   const count=Math.min(1024,frames-at),stems=[];
   for(const c of clips){
    if(!isAudible(c,hasSolo))continue;
    const lo=Math.max(at,c.at),hi=Math.min(at+count,c.at+c.to-c.from);
    if(hi<=lo)continue;
    const body=new Float32Array((hi-lo)*2),source=sources.get(c.sourceId).pcm;
    const pan=panGains(c.pan);
    for(let f=lo;f<hi;f++){
     const sourceFrame=c.from+f-c.at,index=(f-lo)*2;
     const env=envelope(c,sourceFrame/RATE)*c.gain;
     body[index]=source[sourceFrame*2]*env*pan.left;
     body[index+1]=source[sourceFrame*2+1]*env*pan.right;
    }
    stems.push({at:lo-at,samples:body,gain:1});
   }
   const mixed=mixer.mixBlock({frames:count,channels:2,stems});
   for(let i=0;i<mixed.length;i++)output[at*2+i]=mixed[i]*project.master;
   if(block%chunk===0){
    send("progress",{id:data.id,ratio:block/blockCount,stage:"Mixing native blocks"});
    await new Promise(resolve=>setTimeout(resolve,0));
   }
  }
  for(const v of output){
   peak=Math.max(peak,Math.abs(v));energy+=v*v;if(Math.abs(v)>1)overs++;
  }
  const prePeak=peak;let normalization=1;
  if(project.normalize&&peak>0){
   normalization=.97/peak;
   for(let i=0;i<output.length;i++)output[i]*=normalization;
   peak=.97;overs=0;
  }
  const rms=Math.sqrt(energy/output.length)*(project.normalize?normalization:1);
  const array=output.buffer;
  send("result",{id:data.id,frames,peak,rms,overs,prePeak,normalization,buffer:array},[array]);
 }catch(error){send("error",{id:data?.id??-1,message:error.message||String(error)});}
});
