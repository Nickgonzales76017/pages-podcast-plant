import test from "node:test";
import assert from "node:assert/strict";
import {RATE,exampleSession,exampleAudio,showNotes,validateProject} from "../site/studio/mix-model.mjs";
import {highpassPCM,duckingGainCurve,meterSummary,DUCK_STRIDE} from "../site/studio/audio-production.mjs";
import {SOURCES} from "../site/studio/editorial-kit.mjs";
test("production source catalog is genuine recordings with explicit licensing and attribution",()=>{
 assert.equal(SOURCES.length,4);
 assert.deepEqual(SOURCES.map(s=>s.role),["voice","music","ambience","fx"]);
 assert.ok(SOURCES.every(s=>s.file.endsWith(".mp3")&&s.url.startsWith("https://")));
 assert.ok(SOURCES.some(s=>s.license==="Public domain / PD Mark 1.0"));
 assert.ok(SOURCES.some(s=>s.license==="CC0 1.0"));
 const keyboard=SOURCES.find(s=>s.role==="fx");
 assert.equal(keyboard.license,"CC BY 4.0");
 assert.equal(keyboard.requiredCredit,true);
 assert.equal(SOURCES.filter(s=>s.requiredCredit).length,1);
});
test("one-pole voice highpass suppresses DC and remains bounded",()=>{
 const constant=new Float32Array(RATE*2).fill(.25);
 const filtered=highpassPCM(constant);
 assert.equal(filtered.length,constant.length);
 assert.ok(Math.abs(filtered[2*(RATE-1)])<.00001);
 assert.ok(Math.abs(filtered[2*(RATE-1)+1])<.00001);
 assert.throws(()=>highpassPCM(new Float32Array([1,2,3])),/filter input/);
});
test("sidechain ducking responds to voice and recovers after it stops",()=>{
 const project=exampleSession(),sources=exampleAudio();
 project.clips[0].role="voice";project.clips[1].role="music";
 project.ducking={enabled:true,depthDb:15,thresholdDb:-35,attackMs:20,releaseMs:400};
 validateProject(project,sources);
 const frames=RATE*13,curve=duckingGainCurve(project,sources,frames);
 assert.equal(curve.length,Math.ceil(frames/DUCK_STRIDE));
 assert.ok(curve[0]<1);
 assert.ok(curve[Math.floor(2*RATE/DUCK_STRIDE)]<.8);
 assert.ok(curve[Math.floor(12.8*RATE/DUCK_STRIDE)]>.95);
 project.ducking.enabled=false;
 assert.ok(duckingGainCurve(project,sources,frames).every(v=>v===1));
});
test("meter exposes exact linear peak and RMS without mislabeling as LUFS",()=>{
 const m=meterSummary(new Float32Array([.5,-.5,.5,-.5]));
 assert.equal(m.peak,.5);assert.equal(m.rms,.5);
 assert.ok(Math.abs(m.samplePeakDbfs-(-6.0206))<.001);
 assert.equal(m.over,0);
 assert.throws(()=>meterSummary(new Float32Array([1,NaN])),/Nonfinite/);
});
test("creator notes carry required source attribution",()=>{
 const project=exampleSession();project.credits=
 "REQUIRED CREDIT: C40115 — Keychron V1 Ultra | CC BY 4.0 | https://commons.wikimedia.org/wiki/File:Typing_on_Keychron_V1_Ultra_(Red_Linear_Switch).wav";
 const notes=showNotes(project);
 assert.match(notes,/Credits and licence/);
 assert.match(notes,/REQUIRED CREDIT/);
 assert.match(notes,/CC BY 4.0/);
});
