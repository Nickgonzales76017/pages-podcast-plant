import test from "node:test";
import assert from "node:assert/strict";
import {RATE,emptyProject,duration,validateProject,showNotes} from "../site/studio/mix-model.mjs";
import {TREATMENTS,applyTreatment} from "../site/studio/editorial-presets.mjs";
function fixture(){
 const p=emptyProject(),sources=new Map(),parts=[
  ["voice",11.5],["music",18],["ambience",16],["fx",6]
 ];
 p.title="Short Poetry / Source-led episode";
 p.notes="These source citations and recording consent remain even after edits.";
 p.credits="REQUIRED CREDIT: C40115 — keyboard Foley — CC BY 4.0";
 parts.forEach(([role,length],i)=>{
  const id="test-"+role;
  sources.set(id,{name:role,kind:"fixture",pcm:new Float32Array(Math.round(length*RATE)*2)});
  p.clips.push({id:"clip-"+role,sourceId:id,label:role,role,at:0,start:0,end:length,
   gain:.5,pan:0,fadeIn:0,fadeOut:.2,mute:false,solo:false,tint:"#abcdea"});
 });
 return {p,sources};
}
test("four real-source production cuts change actual audio coordinates, not just labels",()=>{
 const {p,sources}=fixture();
 const variants=Object.keys(TREATMENTS).map(name=>[name,applyTreatment(p,sources,name)]);
 assert.deepEqual(variants.map(([name])=>name),["interview","documentary","voice","promo"]);
 for(const [name,result] of variants){
  assert.equal(validateProject(result,sources),true);
  assert.equal(result.clips.length,4);
  assert.equal(result.ducking.enabled,true);
  assert.ok(result.chapters.length>=2);
  assert.ok(result.title.includes(TREATMENTS[name].label));
  assert.ok(result.credits.includes("REQUIRED CREDIT"));
  assert.equal(result.notes,p.notes);
 }
 const promo=variants.find(([name])=>name==="promo")[1];
 const documentary=variants.find(([name])=>name==="documentary")[1];
 assert.ok(duration(promo)<=12.01, "Teaser is an actual shorter cut");
 assert.ok(duration(documentary)>duration(promo)+5, "Documentary arranges a longer scene");
 assert.ok(promo.clips.find(c=>c.role==="voice").start>2, "Teaser trims the source narration");
 assert.ok(promo.clips.find(c=>c.role==="fx").at>8, "Foley is used as an outro transition");
 assert.equal(p.clips[0].at,0, "Presets never mutate the source project");
});
test("licensed voice cannot disappear or be replaced by a fake title-only preset",()=>{
 const {p,sources}=fixture();p.clips[0].role="other";
 assert.throws(()=>applyTreatment(p,sources,"promo"),/needs voice and music/);
 assert.throws(()=>applyTreatment(p,sources,"unknown"),/Unknown production treatment/);
});
test("short user-supplied narration remains inside source bounds on all four cuts",()=>{
 const {p,sources}=fixture();
 const voice=sources.get("test-voice");
 voice.pcm=new Float32Array(RATE*2*3);
 p.clips[0].end=3;
 for(const preset of Object.keys(TREATMENTS)){
  const cut=applyTreatment(p,sources,preset);
  const c=cut.clips.find(x=>x.role==="voice");
  assert.ok(c.end<=3 && c.end-c.start>=.05);
  assert.equal(validateProject(cut,sources),true);
 }
});
test("source attribution and real controls survive standard show-notes export",()=>{
 const {p,sources}=fixture();
 const quick=applyTreatment(p,sources,"interview");
 const notes=showNotes(quick);
 assert.match(notes,/REQUIRED CREDIT/);
 assert.match(notes,/CC BY 4.0/);
 assert.match(notes,/Source rights require review|source rights require review/);
});
