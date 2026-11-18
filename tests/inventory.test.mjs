import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const appCode=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const catalog=JSON.parse(readFileSync(new URL("../catalog/products.json",import.meta.url),"utf8")).products;

function fixture(previous=null){
  let saved=previous===null?null:JSON.stringify(previous),uid=0;
  const events={};
  const field=()=>({value:"",listeners:{},addEventListener(type,fn){this.listeners[type]=fn;},focus(){}});
  const elements={
    currentSection:{textContent:""},screen:{innerHTML:""},
    saveStatus:{textContent:"",classList:{toggle(){}}},
    toast:{textContent:"",classList:{toggle(){},add(){},remove(){}}},
    editorDialog:{open:false,showModal(){this.open=true;},close(){this.open=false;},addEventListener(){},querySelector(){return null;}},
    dialogContent:{innerHTML:""}
  };
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
    },get(){return this.html||"";}
  });
  const ctx={
    window:{TabakCatalog:{products:catalog},scrollTo(){}},
    localStorage:{getItem(){return saved;},setItem(_key,value){saved=value;}},
    document:{getElementById(id){return elements[id]||null;},querySelectorAll(){return [];},addEventListener(type,handler){events[type]=handler;}},
    crypto:{randomUUID(){return "generated-"+(++uid);}},
    FormData:class{constructor(form){this.data=form.values;}get(k){return this.data[k]??null;}getAll(k){return this.data[k]||[];}},
    confirm(){return true;},clearTimeout(){},setTimeout(){return 1;},console
  };
  runInNewContext(appCode,ctx);
  function click(action,fields={}){
    const button={dataset:{action,...fields}};
    events.click({target:{closest(){return button;}}});
  }
  function view(which){events.click({target:{closest(){return {dataset:{view:which}};}}});}
  function submit(values){events.submit({target:{id:"tobacco-form",values},preventDefault(){}});}
  function inventory(){return saved===null?null:JSON.parse(saved);}
  return {events,elements,click,view,submit,inventory};
}

test("single entry flow suggests catalog products and autofills name, base, flavor, package size",()=>{
  const f=fixture();
  f.view("collection");
  assert.match(f.elements.screen.innerHTML,/Tabak erfassen/);
  assert.doesNotMatch(f.elements.screen.innerHTML,/Barcode scannen|data-scan-action|open-catalog/);
  f.click("add-tobacco");
  assert.match(f.elements.dialogContent.innerHTML,/Produktvorschläge/);
  assert.doesNotMatch(f.elements.dialogContent.innerHTML,/EANs \/ UPCs bearbeiten/);
  f.elements["f-brand"].value="AINO Dark";
  f.elements["f-name"].value="Conud";
  f.elements["f-name"].listeners.input();
  const html=f.elements.catalogResults.innerHTML;
  assert.match(html,/Conud Shake/);
  assert.match(html,/200 g/);
  const match=html.match(/data-index="(\d+)"/);
  assert.ok(match);
  f.click("choose-suggestion",{index:match[1]});
  assert.equal(f.elements["f-brand"].value,"AINO Dark");
  assert.equal(f.elements["f-name"].value,"Conud Shake");
  assert.equal(f.elements["f-quantity_g"].value,"200");
  assert.equal(f.elements["f-base"].value,"Unbekannt");
  assert.equal(f.elements["f-catalog-ean"].value,"4251647513279");
  assert.match(f.elements.catalogSelection.textContent,/Produktdaten übernommen/);
  f.submit({brand:"AINO Dark",name:"Conud Shake",base:"Unbekannt",flavor:"",quantity_g:"200",stock:"2",catalog_ean:"4251647513279",id:""});
  const s=f.inventory();
  assert.equal(s.tobaccos.length,1);
  assert.equal(s.tobaccos[0].quantity_g,200);
  assert.equal(s.tobaccos[0].stock,2);
  assert.equal(s.tobaccos[0].barcodes[0],"4251647513279");
});

test("existing catalog variants remain separately suggested for different weights",()=>{
  const f=fixture();
  f.click("add-tobacco");
  f.elements["f-brand"].value="Al Fakher";
  f.elements["f-name"].value="Grapio";
  f.elements["f-name"].listeners.input();
  const html=f.elements.catalogResults.innerHTML;
  assert.match(html,/Grapio/);
  assert.match(html,/25 g/);
  assert.match(html,/200 g/);
  assert.match(html,/1000 g/);
});

test("manual entry stores count and opening status without requiring a catalog product",()=>{
  const f=fixture();
  f.click("add-tobacco");
  f.submit({brand:"Eigener Hersteller",name:"Eigene Sorte",quantity_g:"200",stock:"3",opened:"on",base:"Dark Blend",flavor:"",notes:"Meine Dose",id:""});
  let s=f.inventory();
  assert.equal(s.tobaccos.length,1);
  assert.equal(s.tobaccos[0].stock,3);
  assert.equal(s.tobaccos[0].quantity_g,200);
  assert.equal(s.tobaccos[0].opened,true);
  assert.deepEqual(s.tobaccos[0].barcodes,[]);
  const id=s.tobaccos[0].id;
  f.click("stock-plus",{id});
  assert.equal(f.inventory().tobaccos[0].stock,4);
  for(let n=0;n<4;n++)f.click("stock-minus",{id});
  s=f.inventory();
  assert.equal(s.tobaccos[0].stock,0);
  assert.equal(s.tobaccos[0].opened,false);
  assert.equal(s.tobaccos[0].id,id);
  f.view("collection");
  assert.match(f.elements.screen.innerHTML,/Aufgebraucht/);
});

test("old version-one backups without stock fields stay valid, sessions stay linked",()=>{
  const previous={app:"tabakjournal",version:1,
    tobaccos:[{id:"old-1",brand:"Holster",name:"Ice Kaktuz",base:"Virginia",barcodes:[],flavor:"",notes:"",createdAt:"2026-11-18"}],
    sessions:[{id:"session-1",tobaccoId:"old-1",date:"2026-11-17",severity:0,taste:4,symptoms:[],notes:""}],settings:{bowl:""}};
  const f=fixture(previous);
  f.click("stock-plus",{id:"old-1"});
  const saved=f.inventory();
  assert.equal(saved.tobaccos[0].stock,2);
  assert.equal(saved.tobaccos[0].quantity_g,0);
  assert.equal(saved.sessions[0].tobaccoId,"old-1");
});

test("different package sizes remain separate while duplicate varieties are rejected",()=>{
  const f=fixture();
  const make=size=>({brand:"Al Fakher",name:"Grapio",quantity_g:String(size),stock:"1",base:"Virginia",flavor:"Traube",notes:"",id:""});
  f.submit(make(1000));
  f.submit(make(200));
  f.submit(make(200));
  assert.equal(f.inventory().tobaccos.length,2);
  assert.equal(f.inventory().tobaccos.filter(p=>p.quantity_g===200).length,1);
});

test("editing an existing product preserves legacy catalog identifiers and sessions",()=>{
  const prior={app:"tabakjournal",version:1,tobaccos:[{id:"legacy-1",brand:"Argileh",name:"ORNG MNT",quantity_g:200,stock:1,opened:false,base:"Virginia",flavor:"",notes:"",barcodes:["4260623441833"]}],sessions:[{id:"old-session",tobaccoId:"legacy-1",date:"2026-11-17",severity:0,taste:4,symptoms:[],notes:""}],settings:{bowl:""}};
  const f=fixture(prior);
  f.submit({id:"legacy-1",brand:"Argileh",name:"ORNG MNT",quantity_g:"200",stock:"2",base:"Virginia",notes:"Aktualisiert"});
  const s=f.inventory();
  assert.equal(s.tobaccos[0].stock,2);
  assert.deepEqual(s.tobaccos[0].barcodes,["4260623441833"]);
  assert.equal(s.sessions[0].tobaccoId,"legacy-1");
});
