import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

const appCode=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const scannerCode=readFileSync(new URL("../scanner.js",import.meta.url),"utf8");
const catalog=JSON.parse(readFileSync(new URL("../catalog/products.json",import.meta.url),"utf8")).products;

function fixture(previous=null){
  let saved=previous===null?null:JSON.stringify(previous);
  let uid=0;
  const events={};
  const elements={
    currentSection:{textContent:""},
    screen:{innerHTML:""},
    saveStatus:{textContent:"",classList:{toggle(){}}},
    toast:{textContent:"",classList:{toggle(){},add(){},remove(){}}},
    editorDialog:{open:false,showModal(){this.open=true;},close(){this.open=false;},addEventListener(){}},
    dialogContent:{innerHTML:""}
  };
  Object.defineProperty(elements.dialogContent,"innerHTML",{
    set(html){
      this.html=html;
      if(html.includes('id="catalogPickerResults"')){
        elements.catalogPickerResults={innerHTML:""};
        elements.catalogSearch={value:"",focus(){}};
      }
      if(html.includes('id="tobacco-form"')){
        elements["f-brand"]={value:"",addEventListener(){}};
        elements["f-name"]={value:"",addEventListener(){}};
        elements.catalogResults={innerHTML:""};
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
test("catalog picker searches barcode and opens a prefilled personal record",()=>{
  const f=fixture();
  f.view("collection");
  assert.match(f.elements.screen.innerHTML,/Aus Katalog erfassen/);
  f.click("open-catalog");
  assert.match(f.elements.dialogContent.innerHTML,/catalogSearch/);
  f.elements.catalogSearch.value="4251647513279";
  f.events.input({target:{id:"catalogSearch"}});
  assert.match(f.elements.catalogPickerResults.innerHTML,/Conud Shake/);
  assert.match(f.elements.catalogPickerResults.innerHTML,/4251647513279/);
  f.click("catalog-select",{ean:"4251647513279"});
  assert.match(f.elements.dialogContent.innerHTML,/Packungen im Bestand/);
  assert.match(f.elements.dialogContent.innerHTML,/name="barcodes"[^>]*value="4251647513279"/);
  assert.match(f.elements.dialogContent.innerHTML,/name="quantity_g"[^>]*value="200"/);
});
test("manual inventory stores pack count, opening and barcode and supports zero stock",()=>{
  const f=fixture();
  f.click("add-tobacco");
  f.submit({brand:"AINO Dark",name:"Conud Shake",quantity_g:"200",stock:"3",opened:"on",barcodes:"4251647513279",base:"Dark Blend",flavor:"",notes:"Meine Dose",id:""});
  let s=f.inventory();
  assert.equal(s.tobaccos.length,1);
  assert.equal(s.tobaccos[0].stock,3);
  assert.equal(s.tobaccos[0].quantity_g,200);
  assert.equal(s.tobaccos[0].opened,true);
  assert.equal(s.tobaccos[0].barcodes[0],"4251647513279");
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
test("old version-one backup without inventory fields stays valid and preserves sessions",()=>{
  const previous={app:"tabakjournal",version:1,
    tobaccos:[{id:"old-1",brand:"Holster",name:"Ice Kaktuz",base:"Virginia",barcodes:[],flavor:"",notes:"",createdAt:"2026-11-18"}],
    sessions:[{id:"session-1",tobaccoId:"old-1",date:"2026-11-17",severity:0,taste:4,symptoms:[],notes:""}],settings:{bowl:""}};
  const f=fixture(previous);
  f.click("stock-plus",{id:"old-1"});
  const saved=f.inventory();
  assert.equal(saved.tobaccos[0].stock,2);
  assert.equal(saved.tobaccos[0].quantity_g,0);
  assert.equal(saved.tobaccos[0].opened,false);
  assert.equal(saved.sessions[0].tobaccoId,"old-1");
});
test("pack size separates distinct variants and prevents duplicate owned EANs",()=>{
  const f=fixture();
  const make=(ean,size)=>({brand:"Al Fakher",name:"Grapio",quantity_g:String(size),stock:"1",barcodes:ean,base:"Virginia",flavor:"Traube",notes:"",id:""});
  f.submit(make("5905930237654",1000));
  f.submit(make("5905930233625",200));
  f.submit(make("5905930237623",200));
  assert.equal(f.inventory().tobaccos.length,2);
  assert.equal(f.inventory().tobaccos.filter(p=>p.quantity_g===200).length,1);
});
test("scanner recognizes same product but distinguishes different known pack sizes",()=>{
  const root={addEventListener(){}};
  const ctx={window:{TabakCatalog:{products:catalog},addEventListener(){}},document:{getElementById(id){return id==="barcodeDialog"?root:null;},addEventListener(){}},console};
  runInNewContext(scannerCode,ctx);
  const same=ctx.window.TabakBarcode.sameProduct,entry=catalog.find(p=>p.ean==="5905930237654");
  assert.equal(same({brand:"Al Fakher",name:"Grapio",quantity_g:200},entry),false);
  assert.equal(same({brand:"Al Fakher",name:"Grapio",quantity_g:1000},entry),true);
  assert.equal(same({brand:"Al Fakher",name:"Grapio"},entry),true);
});
