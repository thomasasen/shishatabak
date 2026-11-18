import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const appCode=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const products=JSON.parse(readFileSync(new URL("../catalog/products.json",import.meta.url),"utf8")).products;
function fixture(savedValue=null){
  const events={},elements={
    currentSection:{textContent:""},
    screen:{innerHTML:"",focus(){}},
    saveStatus:{textContent:"",classList:{toggle(){}}},
    toast:{textContent:"",classList:{toggle(){},add(){},remove(){}}},
    editorDialog:{open:false,showModal(){this.open=true;},close(){this.open=false;},addEventListener(){},querySelector(){return null;}},
    dialogContent:{innerHTML:""}
  };
  const field=()=>({value:"",handlers:{},addEventListener(type,cb){this.handlers[type]=cb;},focus(){}});
  Object.defineProperty(elements.dialogContent,"innerHTML",{
    set(html){
      this.html=html;
      if(html.includes('id="tobacco-form"')){
        for(const name of ["brand","name","base","flavor","quantity_g","catalog-ean"]){
          elements["f-"+name]=field();
        }
        elements.catalogResults={innerHTML:""};
        elements.catalogSelection={textContent:""};
      }
    },
    get(){return this.html||"";}
  });
  let saved=savedValue&&JSON.stringify(savedValue);
  const ctx={
    window:{TabakCatalog:{products},scrollTo(){}},
    document:{getElementById(id){return elements[id]||null;},querySelectorAll(){return [];},addEventListener(type,cb){events[type]=cb;}},
    localStorage:{getItem(){return saved||null;},setItem(_k,value){saved=value;}},
    crypto:{randomUUID:(()=>{let n=0;return ()=>"rating-"+(++n);})()},
    FormData:class{constructor(form){this.data=form.data||{};}get(k){return this.data[k]??null;}getAll(k){const v=this.data[k];return v==null?[]:Array.isArray(v)?v:[v];}},
    confirm(){return true;},clearTimeout(){},setTimeout(){return 1;},console
  };
  runInNewContext(appCode,ctx);
  return {
    elements,events,read(){return saved?JSON.parse(saved):null;},
    click(action,extras={}){const target={dataset:{action,...extras},closest(){return this;}};events.click({target});},
    filter(value){const target={dataset:{filter:value},closest(){return this;}};events.click({target});},
    submit(data){events.submit({target:{id:"tobacco-form",data},preventDefault(){}});}
  };
}
test("single form places five-step tolerability rating before optional taste and symptoms",()=>{
  const f=fixture();
  f.click("add-tobacco");
  const html=f.elements.dialogContent.innerHTML;
  assert.match(html,/Verträglichkeit/);
  assert.match(html,/name="tolerability" value="1"/);
  assert.match(html,/name="tolerability" value="5"/);
  assert.match(html,/Geschmack \(optional\)/);
  assert.match(html,/Beobachtete Beschwerden \(optional\)/);
  assert.ok(html.indexOf("rating-block")<html.indexOf("Geschmack (optional)"));
  assert.doesNotMatch(html,/Session erfassen|Packungen im Bestand|NOCCA Temperatur|duration/);
});
test("product autocomplete retains aliases and picks the correct package size",()=>{
  const f=fixture();
  f.click("add-tobacco");
  f.elements["f-brand"].value="AINO Dark";
  f.elements["f-name"].value="Conud";
  f.elements["f-name"].handlers.input();
  const result=f.elements.catalogResults.innerHTML;
  assert.match(result,/Conud Shake/);
  assert.match(result,/200 g/);
  const index=result.match(/data-index="(\d+)"/)?.[1];
  assert.ok(index);
  f.click("choose-suggestion",{index});
  assert.equal(f.elements["f-brand"].value,"AINO Dark");
  assert.equal(f.elements["f-name"].value,"Conud Shake");
  assert.equal(f.elements["f-quantity_g"].value,"200");
  assert.equal(f.elements["f-catalog-ean"].value,"4251647513279");
  assert.match(f.elements.catalogSelection.textContent,/Übernommen/);
});
test("same tobacco in different pack sizes can have different personal ratings",()=>{
  const f=fixture();
  const save=size=>f.submit({
    brand:"Al Fakher",name:"Grapio",base:"Virginia",quantity_g:String(size),
    tolerability:size===200?"2":"5",taste:"",symptom:[],review_notes:""
  });
  save(200);save(1000);
  const s=f.read();
  assert.equal(s.tobaccos.length,2);
  assert.deepEqual(s.tobaccos.map(p=>p.review.tolerability),[2,5]);
  assert.match(f.elements.screen.innerHTML,/Verträglichkeit 2\/5/);
  assert.match(f.elements.screen.innerHTML,/Verträglichkeit 5\/5/);
  f.filter("good");
  assert.match(f.elements.screen.innerHTML,/Verträglichkeit 5\/5/);
  assert.doesNotMatch(f.elements.screen.innerHTML,/Verträglichkeit 2\/5/);
  f.filter("bad");
  assert.match(f.elements.screen.innerHTML,/Verträglichkeit 2\/5/);
});
test("legacy Sessiondaten do not silently become an inferred general tolerability rating",()=>{
  const old={
    app:"tabakjournal",version:1,settings:{bowl:""},
    tobaccos:[{id:"old-1",brand:"Argileh",name:"ORNG MNT",base:"Virginia",quantity_g:200}],
    sessions:[{id:"old-session",tobaccoId:"old-1",date:"2026-11-17",severity:3,taste:1,symptoms:["Schwindel"]}]
  };
  const f=fixture(old);
  assert.match(f.elements.screen.innerHTML,/Noch nicht bewertet/);
  assert.equal(f.read().sessions.length,1);
  assert.doesNotMatch(f.elements.screen.innerHTML,/Session/);
});
