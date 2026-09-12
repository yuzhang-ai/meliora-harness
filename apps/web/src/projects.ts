import {scenarios,streamFor,type Scenario} from "./replay";
export interface Chat {id:string;title:string;scenario:Scenario;count:number;message:string;draft:string;decision:string}
export interface Project {id:string;name:string;source:"fixture"|"folder"|"manual";chats:Chat[]}
export interface Library {projects:Project[];activeId:string}
export function defaultLibrary():Library {
 const chats=scenarios.map(s=>({id:"chat-"+s.id,title:s.title,scenario:s.id,count:s.id==="reconnecting"?0:streamFor(s.id).length,message:"",draft:"",decision:""}));
 return {projects:[{id:"project-meliora",name:"meliora-harness",source:"fixture",chats}],activeId:chats[0].id};
}
export function parseLibrary(raw:string|null):Library {
 try {
  if(raw && raw.length>250_000) return defaultLibrary();
  const data=JSON.parse(raw||"null") as Library;
  if(!data||!Array.isArray(data.projects)||!data.projects.length||data.projects.length>100) return defaultLibrary();
  const ids=new Set<string>();
  for(const p of data.projects){
   if(typeof p.id!=="string"||ids.has(p.id)||typeof p.name!=="string"||!p.name.trim()||p.name.length>200||!["fixture","folder","manual"].includes(p.source)||!Array.isArray(p.chats)||!p.chats.length||p.chats.length>200)return defaultLibrary();
   ids.add(p.id);
   for(const c of p.chats){
    if(typeof c.id!=="string"||ids.has(c.id)||typeof c.title!=="string"||c.title.length>200||!scenarios.some(s=>s.id===c.scenario)||!Number.isInteger(c.count)||c.count<0||c.count>streamFor(c.scenario).length||typeof c.message!=="string"||c.message.length>20_000||typeof c.draft!=="string"||c.draft.length>20_000||typeof c.decision!=="string"||c.decision.length>2_000)return defaultLibrary();
    ids.add(c.id);
   }
  }
  return data.projects.some(p=>p.chats.some(c=>c.id===data.activeId))?data:defaultLibrary();
 }catch{return defaultLibrary();}
}
export function newChat():Chat{return {id:crypto.randomUUID(),title:"新对话",scenario:"read-only-success",count:0,message:"",draft:"",decision:""};}
export function addProject(library:Library,name:string,source:Project["source"]):Library{
 const clean=name.trim().slice(0,200);if(!clean)return library;
 const chat=newChat();return {projects:[...library.projects,{id:crypto.randomUUID(),name:clean,source,chats:[chat]}],activeId:chat.id};
}
