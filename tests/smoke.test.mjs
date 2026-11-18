import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const script=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const STORAGE="tabakjournal:v1";
function fixture(previous=null){
  const storage=new Map();
  if(previous!==null)storage.set(STORAGE,JSON.stringify(previous));
  const listeners={};
  const nodes=new Map();
  const nav=["collection","data"].map(view=>({
    dataset:{view},classList:{toggle(){}},setAttribute(){},removeAttribute(){}
  }));
  function get(id){
    if(!nodes.has(id))nodes.set(id,{
      id,value:"",textContent:"",innerHTML:"",files:[],dataset:{},open:false,
      classList:{toggle(){},add(){},remove(){}},
      addEventListener(){},focus(){},setSelectionRange(){},click(){},
      showModal(){this.open=true;},close(){this.open=false;},
      querySelector(){return null;},append(){},remove(){}
    });
    return nodes.get(id);
  }
  class MockFormData{
    constructor(form){this.data=form.data||{};}
    get(name){return Object.prototype.hasOwnProperty.call(this.data,name)?this.data[name]:null;}
    getAll(name){const v=this.get(name);return v==null?[]:Array.isArray(v)?v:[v];}
    *entries(){for(const [key,value] of Object.entries(this.data))yield [key,value];}
  }
  const document={
    getElementById:get,querySelectorAll(){return nav;},
    addEventListener(type,handler){listeners[type]=handler;},
    createElement(){return {click(){},remove(){},set href(v){},set download(v){}};},
    body:{append(){}}
  };
  const ctx={
    document,localStorage:{getItem(k){return storage.get(k)||null;},setItem(k,v){storage.set(k,v);}},
    window:{TabakCatalog:{products:[]},scrollTo(){}},crypto:{randomUUID:(()=>{let n=0;return ()=>"test-"+(++n);})()},
    FormData:MockFormData,confirm(){return true;},clearTimeout(){},setTimeout(){return 1;},
    URL:{createObjectURL(){return "blob:test";},revokeObjectURL(){}},Blob,console,Date,Intl
  };
  runInNewContext(script,ctx,{filename:"app.js",timeout:5000});
  return {
    storage,listeners,get,
    read(){return JSON.parse(storage.get(STORAGE));},
    submit(data){listeners.submit({target:{id:"tobacco-form",data},preventDefault(){}});},
    click(action,id){const el={dataset:{action,id},closest(){return this;}};listeners.click({target:el});},
    view(next){const el={dataset:{view:next},closest(){return this;}};listeners.click({target:el,preventDefault(){}});},
    async import(backup,mode="merge"){this.click(mode==="replace"?"import-replace":"import-merge");listeners.change({target:{id:"importFile",files:[{size:4096,text:async()=>JSON.stringify(backup)}],value:""}});await new Promise(resolve=>setImmediate(resolve));}
  };
}
const product=(overrides={})=>({
  id:"",brand:"Hookain",name:"White Caek",base:"Virginia",flavor:"Kuchen",quantity_g:"200",
  tolerability:"4",taste:"3",symptom:["Schwindel"],review_notes:"Nach kurzer Zeit Schwindel",...overrides
});
test("landing page is Meine Tabake with no session or dashboard actions",()=>{
  const app=fixture();
  const html=app.get("screen").innerHTML;
  assert.match(html,/Meine Tabake/);
  assert.match(html,/Verträglichkeit/);
  assert.match(html,/Noch kein Tabak erfasst/);
  assert.doesNotMatch(html,/Session erfassen|Neue Session|Session-Tagebuch|Packungen im Bestand/);
  assert.equal(app.storage.size,0);
});
test("a single rating per tobacco saves tolerability first, optional taste, symptoms, notes and survives restart",()=>{
  const app=fixture();
  app.submit(product());
  let s=app.read();
  assert.equal(s.tobaccos.length,1);
  assert.equal(s.tobaccos[0].review.tolerability,4);
  assert.equal(s.tobaccos[0].review.taste,3);
  assert.deepEqual(s.tobaccos[0].review.symptoms,["Schwindel"]);
  assert.equal(s.tobaccos[0].review.notes,"Nach kurzer Zeit Schwindel");
  assert.equal(s.sessions.length,0);
  const reopened=fixture(s);
  assert.match(reopened.get("screen").innerHTML,/Verträglichkeit: 4 von 5/);
  assert.match(reopened.get("screen").innerHTML,/Schwindel/);
  const id=s.tobaccos[0].id;
  reopened.submit(product({id,tolerability:"5",taste:"",symptom:[],review_notes:"Jetzt gut verträglich"}));
  s=reopened.read();
  assert.equal(s.tobaccos.length,1);
  assert.equal(s.tobaccos[0].id,id);
  assert.equal(s.tobaccos[0].review.tolerability,5);
  assert.equal(s.tobaccos[0].review.taste,null);
  assert.equal(s.tobaccos[0].review.notes,"Jetzt gut verträglich");
});
test("search keeps the main view stable while only results update",()=>{
  const app=fixture();
  app.submit(product({tolerability:"4",symptom:[]}));
  const before=app.get("screen").innerHTML;
  app.listeners.input({target:{id:"searchBar",value:"NichtsGefunden"}});
  assert.equal(app.get("screen").innerHTML,before,"typing must not rebuild the input or page");
  assert.match(app.get("collectionResults").innerHTML,/Keine passenden Tabake/);
  assert.match(app.get("resultsStatus").textContent,/0 Sorten/);
  app.listeners.input({target:{id:"searchBar",value:"Hookain"}});
  assert.match(app.get("collectionResults").innerHTML,/White Caek/);
});

test("tolerability score must be explicitly chosen and in the 1–5 range",()=>{
  const app=fixture();
  app.submit(product({tolerability:""}));
  assert.equal(app.storage.size,0);
  app.submit(product({tolerability:"6"}));
  assert.equal(app.storage.size,0);
  app.submit(product({tolerability:"1",taste:"99"}));
  assert.equal(app.storage.size,0);
  app.submit(product({tolerability:"1",taste:""}));
  assert.equal(app.read().tobaccos[0].review.tolerability,1);
});
test("old version-one session history is preserved invisibly when editing a rating",()=>{
  const old={app:"tabakjournal",version:1,settings:{bowl:"Cosmo"},tobaccos:[{
    id:"old-1",brand:"Argileh",name:"ORNG MNT",base:"Virginia",flavor:"Minze",
    barcodes:["4260623441833"],stock:3,quantity_g:200,opened:true,notes:"Alte Notiz"
  }],sessions:[{id:"old-session",tobaccoId:"old-1",date:"2026-11-17",severity:1,taste:4,symptoms:["Schwindel"],notes:"Historisch"}]};
  const app=fixture(old);
  const html=app.get("screen").innerHTML;
  assert.doesNotMatch(html,/Historisch|Session/);
  app.submit(product({id:"old-1",brand:"Argileh",name:"ORNG MNT",flavor:"Minze",tolerability:"2",review_notes:"Heute schlechter"}));
  const s=app.read();
  assert.equal(s.sessions.length,1);
  assert.equal(s.sessions[0].tobaccoId,"old-1");
  assert.equal(s.tobaccos[0].stock,3);
  assert.equal(s.tobaccos[0].opened,true);
  assert.deepEqual(s.tobaccos[0].barcodes,["4260623441833"]);
  assert.equal(s.tobaccos[0].review.tolerability,2);
});
test("merge imports legacy history and does not overwrite an existing personal rating",async()=>{
  const app=fixture();
  app.submit(product({tolerability:"4",symptom:[]}));
  const existing=app.read().tobaccos[0];
  const backup={app:"tabakjournal",version:1,settings:{bowl:""},tobaccos:[{
    id:"external",brand:"Hookain",name:"White Caek",base:"Virginia",quantity_g:200,
    review:{tolerability:1,taste:2,symptoms:["Übelkeit"],notes:"Extern"}
  }],sessions:[{id:"old-session",tobaccoId:"external",date:"2026-11-17",severity:1,taste:3,symptoms:[]}]};
  await app.import(backup);
  const s=app.read();
  assert.equal(s.tobaccos.length,1);
  assert.equal(s.tobaccos[0].review.tolerability,4);
  assert.equal(s.sessions.length,1);
  assert.equal(s.sessions[0].tobaccoId,existing.id);
});
test("corrupt backup never overwrites personal ratings",async()=>{
  const app=fixture();
  app.submit(product({tolerability:"5"}));
  const before=JSON.stringify(app.read());
  await app.import({app:"wrong",version:1,tobaccos:[],sessions:[]});
  assert.equal(JSON.stringify(app.read()),before);
});
