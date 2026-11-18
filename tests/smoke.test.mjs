import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

const source = readFileSync(new URL("../app.js", import.meta.url), "utf8");
const key = "tabakjournal:v1";

function runApp(sharedStorage = new Map()) {
  const elements = new Map();
  const listeners = {};
  const nav = ["overview", "collection", "sessions", "insights", "data"].map(view => ({
    dataset: { view },
    classList: { toggle() {} }
  }));
  function element(id) {
    if (!elements.has(id)) {
      const node = {
        id, value: "", textContent: "", innerHTML: "", files: [],
        classList: { toggle() {}, add() {}, remove() {} },
        addEventListener() {}, click() {}, focus() {}, setSelectionRange() {},
        open: false,
        showModal() { this.open = true; },
        close() { this.open = false; },
        append() {}, remove() {}
      };
      elements.set(id, node);
    }
    return elements.get(id);
  }
  class MockFormData {
    constructor(form) { this.data = form.data || {}; }
    get(name) { return Object.prototype.hasOwnProperty.call(this.data, name) ? this.data[name] : null; }
    getAll(name) { const v = this.get(name); return v == null ? [] : Array.isArray(v) ? v : [v]; }
  }
  const document = {
    getElementById: element,
    querySelectorAll() { return nav; },
    addEventListener(event, cb) { listeners[event] = cb; },
    createElement() { return { click() {}, remove() {}, set href(v) {}, set download(v) {} }; },
    body: { append() {} }
  };
  const storage = {
    getItem(k) { return sharedStorage.has(k) ? sharedStorage.get(k) : null; },
    setItem(k,v) { sharedStorage.set(k,v); }
  };
  const ctx = {
    document, localStorage: storage, window: { scrollTo() {} },
    FormData: MockFormData, confirm() { return true; },
    crypto: { randomUUID: (() => {let id=0;return ()=>"test-id-"+(++id)+"-"+Math.random().toString(36).slice(2);})() },
    setTimeout() {return 1;}, clearTimeout() {},
    URL: {createObjectURL() {return "blob:test";},revokeObjectURL() {}},
    Blob, console, Intl, Date
  };
  runInNewContext(source,ctx, { filename:"app.js",timeout:5000 });
  return {
    element, listeners, sharedStorage,
    saved() { return JSON.parse(sharedStorage.get(key)); },
    submit(id, data) {
      listeners.submit({target:{id,data},preventDefault() {}});
    },
    click(action,id) {
      const target={dataset:{action,id},closest() {return this;}};
      listeners.click({target});
    },
    async import(data) {
      listeners.change({target:{id:"importFile",files:[{size:1000,text:async()=>JSON.stringify(data)}],value:""}});
      await new Promise(resolve=>setImmediate(resolve));
    }
  };
}

test("first render has no seeded personal records", () => {
  const app=runApp();
  assert.match(app.element("screen").innerHTML,/Deine Übersicht/);
  assert.match(app.element("screen").innerHTML,/Noch keine Session/);
  assert.equal(app.sharedStorage.size,0);
});

test("products and sessions survive a browser restart", () => {
  const data=new Map();
  const app=runApp(data);
  app.submit("tobacco-form",{id:"",brand:"Hookain",name:"White Caek",base:"Virginia",flavor:"Kuchen",notes:"Probe"});
  assert.equal(app.saved().tobaccos.length,1);
  const productId=app.saved().tobaccos[0].id;
  app.submit("session-form",{id:"",tobaccoId:productId,date:"2026-11-17",severity:"1",taste:"4",duration:"35",temperature:"200",bowl:"Cosmo Bowl",symptom:["Schwindel"],notes:"Leichter Schwindel"});
  assert.equal(app.saved().sessions.length,1);
  assert.equal(app.saved().sessions[0].symptoms[0],"Schwindel");
  const restarted=runApp(data);
  assert.equal(restarted.saved().tobaccos[0].brand,"Hookain");
  assert.equal(restarted.saved().sessions[0].temperature,200);
  assert.match(restarted.element("screen").innerHTML,/Hookain/);
});

test("invalid import never replaces an existing collection", async () => {
  const app=runApp();
  app.submit("tobacco-form",{id:"",brand:"Nameless",name:"Black Nana",base:"Virginia"});
  const before=JSON.stringify(app.saved());
  await app.import({app:"wrong",version:1,tobaccos:[],sessions:[]});
  assert.equal(JSON.stringify(app.saved()),before);
});

test("merge import reuses products instead of duplicating them", async () => {
  const app=runApp();
  app.submit("tobacco-form",{id:"",brand:"Nameless",name:"Black Nana",base:"Virginia"});
  const incoming={
    app:"tabakjournal",version:1,settings:{bowl:""},
    tobaccos:[{id:"other-id",brand:"Nameless",name:"Black Nana",base:"Virginia",flavor:"Traube",notes:"",createdAt:""}],
    sessions:[{id:"another-session",tobaccoId:"other-id",date:"2026-11-17",severity:0,taste:5,duration:0,temperature:0,bowl:"",symptoms:[],notes:"",createdAt:""}]
  };
  await app.import(incoming);
  assert.equal(app.saved().tobaccos.length,1);
  assert.equal(app.saved().sessions.length,1);
  assert.equal(app.saved().sessions[0].tobaccoId,app.saved().tobaccos[0].id);
});

test("legacy backup identifiers survive a non-identity edit without losing sessions",()=>{
  const old={app:"tabakjournal",version:1,settings:{bowl:""},tobaccos:[
    {id:"legacy-tabak",brand:"Argileh",name:"ORNG MNT",base:"Virginia",flavor:"",notes:"",quantity_g:200,barcodes:["4260623441833"],stock:1,opened:false}
  ],sessions:[{id:"legacy-session",tobaccoId:"legacy-tabak",date:"2026-11-17",severity:1,taste:3,notes:"",symptoms:[]}]};
  const storage=new Map([["tabakjournal:v1",JSON.stringify(old)]]);
  const app=runApp(storage);
  app.submit("tobacco-form",{id:"legacy-tabak",brand:"Argileh",name:"ORNG MNT",base:"Virginia",quantity_g:"200",stock:"2",notes:"Geändert"});
  assert.deepEqual(app.saved().tobaccos[0].barcodes,["4260623441833"]);
  assert.equal(app.saved().tobaccos[0].stock,2);
  assert.equal(app.saved().sessions[0].tobaccoId,"legacy-tabak");
});
test("invalid legacy EAN data is rejected on import without overwriting the collection",async()=>{
  const app=runApp();
  app.submit("tobacco-form",{id:"",brand:"Argileh",name:"Test",base:"Virginia"});
  const before=JSON.stringify(app.saved());
  const corrupt={app:"tabakjournal",version:1,tobaccos:[{
    id:"legacy-1",brand:"Argileh",name:"ORNG MNT",base:"Virginia",barcodes:["4260623441834"]
  }],sessions:[],settings:{bowl:""}};
  await app.import(corrupt);
  assert.equal(JSON.stringify(app.saved()),before);
});
test("import rejects two products claiming the same EAN and preserves local storage",async()=>{
  const app=runApp();
  app.submit("tobacco-form",{id:"",brand:"Existing",name:"Existing",base:"Virginia"});
  const before=JSON.stringify(app.saved());
  const data={app:"tabakjournal",version:1,tobaccos:[
    {id:"product-one",brand:"A",name:"One",base:"Virginia",barcodes:["4260623441833"]},
    {id:"product-two",brand:"B",name:"Two",base:"Virginia",barcodes:["4260623441833"]}
  ],sessions:[],settings:{bowl:""}};
  await app.import(data);
  assert.equal(JSON.stringify(app.saved()),before);
});
