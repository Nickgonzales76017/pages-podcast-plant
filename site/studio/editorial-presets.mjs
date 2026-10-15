/* Shared editorial arrangement programs. One typed source-bound transform
 * for Quick Mix and the full Creator Studio; no duplicated demo timeline.
 */
import {RATE,MAX_SECONDS,validateProject} from "./mix-model.mjs";
export const TREATMENTS=Object.freeze({
 interview:{label:"Spoken opener",voice:1,music:.32,ambience:.07,fx:.06,depth:15,
  chapters:[[0,"Music opens"],[2,"Narration"],[13,"Closing Foley"]],
  cuts:{voice:[2,0,11.5,.12,.35],music:[0,0,18,.75,1.3],
   ambience:[1.8,0,16,1.2,1.2],fx:[13,0,6,.08,.4]}},
 documentary:{label:"Documentary scene",voice:.9,music:.3,ambience:.2,fx:.13,depth:10,
  chapters:[[0,"Location opens"],[3,"Narration"],[12,"Scene changes"]],
  cuts:{voice:[3,0,11.5,.2,.8],music:[1.7,1.2,18,.9,2],
   ambience:[0,0,16,1.4,2],fx:[12,0,6,.15,.6]}},
 voice:{label:"Voice forward",voice:1.15,music:.1,ambience:0,fx:0,depth:18,
  chapters:[[0,"Narration begins"],[7,"Closing phrase"]],
  cuts:{voice:[.2,0,11.5,.05,.6],music:[0,0,13,.5,2],
   ambience:[0,0,12,.5,2],fx:[9,0,3,.15,.8]}},
 promo:{label:"Short-form teaser",voice:.9,music:.55,ambience:.13,fx:.26,depth:8,
  chapters:[[0,"Musical hook"],[1.8,"Reading excerpt"],[8.5,"Editorial sting"]],
  cuts:{voice:[1.8,2.7,9.5,.08,.5],music:[0,0,12,.3,1],
   ambience:[2,0,8,.3,.8],fx:[8.5,0,3,.06,.35]}}
});
export function applyTreatment(project,sources,name){
 const p=TREATMENTS[name];if(!p)throw Error("Unknown production treatment.");
 const next=structuredClone(project);
 const used=new Set();
 for(const c of next.clips){
  if(!Object.hasOwn(p.cuts,c.role))continue;
  const source=sources.get(c.sourceId);
  if(!source?.pcm)throw Error("Treatment requires an admitted source recording.");
  used.add(c.role);
  const [at,start,end,fadeIn,fadeOut]=p.cuts[c.role],length=source.pcm.length/(RATE*2);
  if(length<.05)throw Error("Source is too short for a production treatment.");
  c.gain=p[c.role];c.solo=false;c.mute=false;
  c.start=Math.min(start,Math.max(0,length-.05));c.end=Math.min(length,end);
  if(c.end-c.start<.05){c.start=0;c.end=length;}
  c.at=Math.max(0,Math.min(at,MAX_SECONDS-(c.end-c.start)));
  c.fadeIn=Math.min(fadeIn,c.end-c.start);
  c.fadeOut=Math.min(fadeOut,c.end-c.start);
 }
 if(!used.has("voice")||!used.has("music"))throw Error("A narrated production needs voice and music roles.");
 next.ducking={enabled:true,depthDb:p.depth,thresholdDb:-37,attackMs:45,releaseMs:340};
 next.normalize=true;next.voiceHighpass=true;
 next.chapters=p.chapters.map(([at,title])=>({at,title}));
 next.title=project.title.includes(" / ")?project.title.split(" / ")[0]+" / "+p.label:project.title+" / "+p.label;
 validateProject(next,sources);
 return next;
}
