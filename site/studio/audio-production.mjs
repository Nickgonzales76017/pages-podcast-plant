/* Spoken-word production DSP around the existing zero-allocation C summing
 * kernel. These are explicit, inspectable filters, not "AI audio repair."
 */
import {RATE,CHANNELS,finite,isAudible,clipFrame} from "./mix-model.mjs";
export const DUCK_STRIDE=256;
export function highpassPCM(pcm,{cutoffHz=85,sampleRate=RATE}={}){
 if(!(pcm instanceof Float32Array)||pcm.length%CHANNELS||
    !finite(cutoffHz,15,300)||!finite(sampleRate,8000,192000))
   throw Error("Voice filter input outside supported bounds.");
 const output=new Float32Array(pcm.length),rc=1/(2*Math.PI*cutoffHz),
   dt=1/sampleRate,alpha=rc/(rc+dt);
 for(let channel=0;channel<CHANNELS;channel++){
  let x1=0,y1=0;
  for(let j=channel;j<pcm.length;j+=CHANNELS){
   const x=pcm[j],y=alpha*(y1+x-x1);
   if(!Number.isFinite(x)||!Number.isFinite(y))throw Error("Nonfinite voice source.");
   output[j]=y;x1=x;y1=y;
  }
 }
 return output;
}
export function duckingGainCurve(project,sources,frames,{stride=DUCK_STRIDE,sampleRate=RATE}={}){
 if(!Number.isSafeInteger(frames)||frames<1||frames>sampleRate*180||
    !Number.isSafeInteger(stride)||stride<64||stride>4096)
   throw Error("Sidechain boundary refused.");
 const curve=new Float32Array(Math.ceil(frames/stride));
 curve.fill(1);
 if(!project.ducking?.enabled)return curve;
 const cfg=project.ducking,voices=project.clips.filter(c=>c.role==="voice"&&!c.mute);
 if(!voices.length)return curve;
 const threshold=Math.pow(10,cfg.thresholdDb/20),
   ducked=Math.pow(10,-cfg.depthDb/20),
   attack=1-Math.exp(-stride/sampleRate/(cfg.attackMs/1000)),
   release=1-Math.exp(-stride/sampleRate/(cfg.releaseMs/1000));
 let current=1;
 for(let window=0;window<curve.length;window++){
  const start=window*stride,end=Math.min(frames,start+stride);
  let sum=0,count=0;
  for(const c of voices){
   const body=sources.get(c.sourceId)?.pcm;
   if(!(body instanceof Float32Array))continue;
   const f=clipFrame(c),lo=Math.max(start,f.at),hi=Math.min(end,f.at+f.to-f.from);
   if(hi<=lo)continue;
   for(let at=lo;at<hi;at++){
    const src=(f.from+at-f.at)*CHANNELS;
    const l=body[src]*c.gain,r=body[src+1]*c.gain;
    sum+=(l*l+r*r)*.5;count++;
   }
  }
  const loudness=count?Math.sqrt(sum/count):0;
  const target=loudness>threshold?ducked:1;
  const alpha=target<current?attack:release;
  current+=(target-current)*alpha;
  curve[window]=current;
 }
 return curve;
}
export function meterSummary(samples,channels=CHANNELS){
 if(!(samples instanceof Float32Array)||!samples.length||samples.length%channels)
   throw Error("No mix samples for metering.");
 let sum=0,peak=0,over=0;
 for(const v of samples){
  if(!Number.isFinite(v))throw Error("Nonfinite mix sample.");
  peak=Math.max(peak,Math.abs(v));sum+=v*v;if(Math.abs(v)>1)over++;
 }
 const rms=Math.sqrt(sum/samples.length);
 return {
  peak,rms,over,
  samplePeakDbfs:peak>0?20*Math.log10(peak):-Infinity,
  rmsDbfs:rms>0?20*Math.log10(rms):-Infinity
 };
}
