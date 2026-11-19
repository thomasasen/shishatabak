import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";

// Unlike older mocks, this fixture allows ONLY IDs that actually occur in
// index.html. A stale $("someDeletedId") now fails the test just like a browser.
const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
const script=readFileSync(new URL("../app.js",import.meta.url),"utf8");
const realIds=new Set([...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]));
const header=html.match(/<header class="topbar">([\s\S]*?)<\/header>/)?.[1]||"";
const navDestinations=[...header.matchAll(/data-view="([^"]+)"/g)].map(m=>m[1]);

function startApp(initialStorage=null){
  const nodes=new Map(),listeners=new Map(),storage=new Map();
  if(initialStorage!==null)storage.set("tabakjournal:v1",JSON.stringify(initialStorage));
  for(const id of realIds){
    const classes=new Set(),attrs=new Map();
    nodes.set(id,{
      id,textContent:"",innerHTML:"",open:false,value:"",
      classList:{
        toggle(value,on){if(on)classes.add(value);else classes.delete(value);},
        add(value){classes.add(value);},remove(value){classes.delete(value);},
        contains(value){return classes.has(value);}
      },
      setAttribute(name,value){attrs.set(name,value);},
      removeAttribute(name){attrs.delete(name);},
      getAttribute(name){return attrs.get(name)||null;},
      addEventListener(){},focus(){},querySelector(){return null;},
      showModal(){this.open=true;},close(){this.open=false;}
    });
  }
  const navButtons=navDestinations.map(view=>({
    dataset:{view},classList:{toggle(){}},
    setAttribute(){},removeAttribute(){}
  }));
  const document={
    getElementById(id){return nodes.get(id)||null;},
    querySelectorAll(selector){return selector===".topbar [data-view]"?navButtons:[];},
    addEventListener(type,listener){listeners.set(type,listener);}
  };
  const context={
    window:{TabakCatalog:{products:[]},scrollTo(){}},
    document,
    localStorage:{getItem(k){return storage.get(k)||null;},setItem(k,value){storage.set(k,value);}},
    crypto:{randomUUID(){return "uuid-for-startup-test";}},
    console,Date,Intl,setTimeout(){return 1;},clearTimeout(){},confirm(){return true;}
  };
  runInNewContext(script,context,{filename:"app.js",timeout:5000});
  function navigate(view){
    const node={dataset:{view},closest(){return this;}};
    listeners.get("click")({target:node,preventDefault(){}});
  }
  return {nodes,navButtons,navigate,storage};
}

test("boot: real index.html IDs can initialize the app and render the collection",()=>{
  assert.ok(realIds.has("screen"));
  assert.ok(realIds.has("editorDialog"));
  assert.ok(realIds.has("saveStatus"));
  assert.ok(realIds.has("toast"));
  // Intentional: the removed header element must NOT be present.
  assert.ok(!realIds.has("currentSection"));
  const app=startApp();
  const screen=app.nodes.get("screen").innerHTML;
  assert.match(screen,/<h1>Meine Tabake<\/h1>/);
  assert.match(screen,/Noch kein Tabak erfasst/);
  assert.match(screen,/Tabak hinzufügen/);
  assert.equal(app.nodes.get("saveStatus").textContent,"Lokal gespeichert");
});
test("boot: switching between collection and Backup works with the real header",()=>{
  const app=startApp();
  assert.deepEqual(navDestinations,["collection","data"]);
  app.navigate("data");
  assert.match(app.nodes.get("screen").innerHTML,/<h1>Backup<\/h1>/);
  app.navigate("collection");
  assert.match(app.nodes.get("screen").innerHTML,/<h1>Meine Tabake<\/h1>/);
});
test("boot: existing v1 localStorage content renders saved products after the redesign",()=>{
  const legacy={
    app:"tabakjournal",version:1,settings:{bowl:""},sessions:[],
    tobaccos:[{id:"legacy-1",brand:"Hookain",name:"White Caek",
      quantity_g:200,base:"Virginia",flavor:"Kuchen",stock:1,opened:false,
      barcodes:[],review:{tolerability:4,taste:3,symptoms:[],notes:"",updatedAt:""}}]
  };
  const app=startApp(legacy);
  assert.match(app.nodes.get("screen").innerHTML,/White Caek/);
  assert.equal((app.nodes.get("screen").innerHTML.match(/class="shisha-mark filled"/g)||[]).length,4);
  assert.match(app.nodes.get("screen").innerHTML,/4 von 5/);
  assert.match(app.nodes.get("screen").innerHTML,/Gut verträglich/);
});
