import test from "node:test";
import assert from "node:assert/strict";
import {webcrypto} from "node:crypto";
if(!globalThis.crypto)globalThis.crypto=webcrypto;
import {createNativeMixer,KERNEL_SHA256} from "../site/studio/native-kernel.mjs";
import {RATE,MAX_SECONDS,CHANNELS,validateProject,exampleSession,exampleAudio,
  duration,fmt,clipFrame,trimClip,panGains,envelope,sourcePeaks,
  wavEncode,showNotes,handoffYaff,selectedFrames} from "../site/studio/mix-model.mjs";

test("source-derived native kernel is hashed, no-import and bounded",async()=>{
 const mix=await createNativeMixer();
 assert.match(mix.kernel,new RegExp(KERNEL_SHA256));
 assert.ok(!String(mix.kernel).includes("failed"));
 assert.throws(()=>mix.mixBlock({frames:1025,channels:2,stems:[]}),/bound/);
 assert.throws(()=>mix.mixBlock({frames:16,channels:2,stems:[{at:0,gain:5,samples:new Float32Array(4)}]}),/stem/);
});
test("native C WASM mixes predictable sources exactly in f32",async()=>{
 const mix=await createNativeMixer();
 const a=new Float32Array([.25,.5,.75,1]),b=new Float32Array([.5,.25,-.75,-1]);
 const result=mix.mixBlock({frames:2,channels:2,stems:[{at:0,gain:1,samples:a},{at:0,gain:.5,samples:b}]});
 assert.deepEqual([...result],[.5,.625,.375,.5]);
 const offset=mix.mixBlock({frames:4,channels:2,stems:[{at:2,gain:1,samples:a}]});
 assert.deepEqual([...offset],[0,0,0,0,.25,.5,.75,1]);
});
test("synthetic multitrack example uses source identity and sample coordinates",()=>{
 const p=exampleSession(),sources=exampleAudio();
 assert.equal(p.clips.length,4);assert.equal(sources.size,4);
 assert.ok(validateProject(p,sources));
 assert.ok(duration(p)>10&&duration(p)<14);
 assert.equal(clipFrame(p.clips[1]).at,24000);
 assert.equal(fmt(65.25),"01:05.25");
 const duplicate=structuredClone(p);duplicate.clips[1].id=duplicate.clips[0].id;
 assert.throws(()=>validateProject(duplicate,sources),/identity/);
});
test("a bounded edit cannot escape source or arrangement limits",()=>{
 const p=exampleSession(),sources=exampleAudio();
 assert.throws(()=>trimClip(p.clips[0],sources.get("demo-0"),0,12),/Trim/);
 const bad=structuredClone(p);bad.clips[0].at=MAX_SECONDS;
 assert.throws(()=>validateProject(bad,sources),/boundary|bounds/);
 assert.throws(()=>panGains(2),/Pan/);
 assert.throws(()=>validateProject({...p,sampleRate:44100},sources),/timeline/);
});
test("equal-power panning and short fades preserve center and silence ends",()=>{
 const mid=panGains(0),left=panGains(-1),right=panGains(1);
 assert.ok(Math.abs(mid.left-1)<1e-12&&Math.abs(mid.right-1)<1e-12);
 assert.ok(left.right<1e-10);assert.ok(right.left<1e-10);
 const c=exampleSession().clips[0];
 assert.equal(envelope(c,c.start),0);
 assert.ok(envelope(c,c.start+.1)>.9);
 assert.ok(envelope(c,c.end-.01)<.04);
});
test("decoded source waveform peaks are finite and bounded",()=>{
 const src=exampleAudio().get("demo-0").pcm;
 const peaks=sourcePeaks(src,97);
 assert.equal(peaks.length,97);
 assert.ok([...peaks].some(x=>x>.05));
 assert.ok([...peaks].every(x=>x>=0&&x<1));
});
test("16 bit PCM RIFF and 32 float WAV headers correctly encode stereo",()=>{
 const frames=new Float32Array([0,1,-1,.5,.25,-.25]);
 const pcm=new DataView(wavEncode(frames,{format:"pcm16"}));
 assert.equal(pcm.getUint32(4,true)+8,56);
 assert.equal(pcm.getUint16(20,true),1);assert.equal(pcm.getUint16(22,true),2);
 assert.equal(pcm.getUint32(24,true),RATE);assert.equal(pcm.getInt16(44,true),0);
 assert.equal(pcm.getInt16(46,true),32767);assert.equal(pcm.getInt16(48,true),-32768);
 const raw=new DataView(wavEncode(frames,{format:"float32"}));
 assert.equal(raw.getUint16(20,true),3);assert.equal(raw.getUint16(34,true),32);
 assert.equal(raw.getFloat32(56,true),-1);
 assert.throws(()=>wavEncode(new Float32Array([0,NaN])),/Nonfinite/);
});
test("source selection defaults to full mix and remains bounded",()=>{
 const p=exampleSession();const frames=RATE*12;
 assert.deepEqual(selectedFrames(p,frames),{from:0,to:frames});
 p.selection={from:2,to:5};
 assert.deepEqual(selectedFrames(p,frames),{from:RATE*2,to:RATE*5});
 p.selection.to=1000;
 assert.deepEqual(selectedFrames(p,frames),{from:0,to:frames});
});
test("chapter notes are honest and handoff never confers authority",()=>{
 const p=exampleSession();
 assert.match(showNotes(p),/## Chapters/);
 assert.match(showNotes(p),/rights require review/);
 assert.match(handoffYaff(p),/program creator-session-proposal/);
 assert.match(handoffYaff(p),/authority none/);
 assert.match(handoffYaff(p),/sample_rate 48000/);
});
test("source memory and clip cardinality refuse unsupported workloads",()=>{
 const p=exampleSession(),sources=exampleAudio();
 const many=structuredClone(p);
 while(many.clips.length<=32){
  const original=many.clips[0];
  many.clips.push({...original,id:"expanded-"+many.clips.length});
 }
 assert.throws(()=>validateProject(many,sources),/timeline/);
 assert.equal(CHANNELS,2);
});
