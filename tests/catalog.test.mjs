import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
const base=new URL("../",import.meta.url);
const productFile=JSON.parse(readFileSync(new URL("../catalog/products.json",import.meta.url),"utf8"));
const products=productFile.products;
function validEAN(code){
  if(!(/^\d{8}$|^\d{12,14}$/).test(code))return false;
  let sum=0,w=3;for(let i=code.length-2;i>=0;i--){sum+=Number(code[i])*w;w=w===3?1:3;}
  return (10-sum%10)%10===Number(code.at(-1));
}
test("catalog has 100+ source-traceable, checkdigit-valid unique codes",()=>{
  assert.ok(products.length>=100,products.length);
  assert.ok(new Set(products.map(p=>p.brand)).size>=15);
  for(const p of products){
    assert.ok(validEAN(p.ean),p.brand+" "+p.name+" "+p.ean);
    assert.match(p.source_url,/^https:\/\//);
    assert.ok([20,25,50,100,150,180,200,250,500,1000].includes(p.quantity_g),p.quantity_g);
  }
  assert.equal(new Set(products.map(p=>p.ean)).size,products.length);
});
test("generated browser database matches canonical JSON",()=>{
  const context={window:{}};
  runInNewContext(readFileSync(new URL("../catalog.js",import.meta.url),"utf8"),context);
  assert.equal(JSON.stringify(context.window.TabakCatalog.products),JSON.stringify(products));
});
test("scan module validates EAN and UPC before lookup",()=>{
  const root={addEventListener() {}};
  const context={
    window:{TabakCatalog:{products},addEventListener() {}},
    document:{getElementById(id){return id==="barcodeDialog"?root:null;},addEventListener() {}},
    console
  };
  runInNewContext(readFileSync(new URL("../scanner.js",import.meta.url),"utf8"),context);
  const n=context.window.TabakBarcode.normalizeCode;
  assert.equal(n("4255799718414"),"4255799718414");
  assert.equal(n("4255799718415"),null);
  assert.equal(n(" 4255799718414 "),"4255799718414");
  assert.equal(n("740813533752"),"0740813533752");
  assert.equal(n("abc"),null);
  assert.equal(context.window.TabakBarcode.catalogCount,products.length);
});
test("GitHub Pages scripts load catalog before app and scanner",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  const names=["catalog.js","app.js","scanner.js"];
  assert.ok(names.every(n=>html.includes(n)));
  assert.ok(html.indexOf(names[0])<html.indexOf(names[1]));
  assert.ok(html.indexOf(names[1])<html.indexOf(names[2]));
});

test("Argileh ORNG MNT variants share a canonical name and aliases",()=>{
  const hits=products.filter(p=>p.brand==="Argileh"&&["4260623442977","4260623441833"].includes(p.ean));
  assert.equal(hits.length,2);
  for(const p of hits){
    assert.equal(p.name,"ORNG MNT");
    assert.equal(p.quantity_g,200);
    assert.ok(p.aliases.includes("OG&M"));
    assert.ok(p.aliases.includes("OMI"));
  }
  const ctx={window:{TabakCatalog:{products},addEventListener(){}},document:{getElementById(id){return id==="barcodeDialog"?{addEventListener(){}}:null;},addEventListener(){}},console};
  runInNewContext(readFileSync(new URL("../scanner.js",import.meta.url),"utf8"),ctx);
  const matches=ctx.window.TabakBarcode.sameProduct;
  const entry=hits[0];
  assert.ok(matches({brand:"Argileh",name:"OG&M"},entry));
  assert.ok(matches({brand:"Argileh Tobacco",name:"OMI"},entry));
  assert.ok(matches({brand:"Argileh",name:"ORNG MNT"},entry));
  assert.ok(!matches({brand:"Dschinni",name:"ORNG MNT"},entry));
});

test("camera scanning requires three matching decodes rather than one lucky checksum",()=>{
  const root={addEventListener() {}};
  const context={
    window:{TabakCatalog:{products},addEventListener() {}},
    document:{getElementById(id){return id==="barcodeDialog"?root:null;},addEventListener(){}},
    console
  };
  runInNewContext(readFileSync(new URL("../scanner.js",import.meta.url),"utf8"),context);
  const consensus=context.window.TabakBarcode.createScanConsensus(3,70,4000);
  assert.equal(consensus("0050674441883",100).accepted,false);
  assert.equal(consensus("0050674441883",125).count,1); // too soon for a new frame
  assert.equal(consensus("0050674441883",210).count,2);
  assert.equal(consensus("0050674441883",340).accepted,true);
  const noisy=context.window.TabakBarcode.createScanConsensus(3,70,4000);
  noisy("4260623442977",100);
  noisy("0050674441883",200);
  assert.equal(noisy("4260623442977",300).count,1);
  assert.equal(noisy("4260623442977",420).count,2);
  assert.equal(noisy("4260623442977",540).accepted,true);
  assert.equal(noisy("4260623442976",650).accepted,false); // invalid check digit
});

test("standard scanner only accepts EAN-13 and rejects UPC-A fallback",()=>{
  const dialog={addEventListener(){}};
  const ctx={window:{TabakCatalog:{products},addEventListener(){}},document:{getElementById(id){return id==="barcodeDialog"?dialog:null;},addEventListener(){}},console};
  runInNewContext(readFileSync(new URL("../scanner.js",import.meta.url),"utf8"),ctx);
  const {validForScanMode,normalizeCode,decodedFormat}=ctx.window.TabakBarcode;
  const ean={result:{format:{formatName:"EAN_13"}}};
  const upc={result:{format:{formatName:"UPC_A"}}};
  const ean8={result:{format:{formatName:"EAN_8"}}};
  assert.equal(validForScanMode("4260623441833",ean,false),true);
  assert.equal(validForScanMode("0000674441833",upc,false),false);
  assert.equal(validForScanMode("0000674441833",ean,false),true); // mathematically valid; print must still be checked
  assert.equal(validForScanMode("050674441883",upc,false),false);
  assert.equal(validForScanMode("050674441883",upc,true),true);
  assert.equal(validForScanMode("4260623441833",ean,true),true);
  assert.equal(validForScanMode("4260623441833",{result:{format:{formatName:"UPC_E"}}},true),false);
  assert.equal(normalizeCode("050674441883"),"0050674441883");
  assert.equal(decodedFormat(upc),"UPC_A");
});

test("camera controls detect capabilities and use supported video track settings",async()=>{
  const root={addEventListener(){}};
  const ctx={window:{TabakCatalog:{products},addEventListener(){}},document:{getElementById(id){return id==="barcodeDialog"?root:null;},addEventListener(){}},console};
  runInNewContext(readFileSync(new URL("../scanner.js",import.meta.url),"utf8"),ctx);
  const api=ctx.window.TabakBarcode;
  const applied=[],lit=[];
  const camera={
    getRunningTrackCapabilities:()=>({torch:true,focusMode:["continuous","manual"],focusDistance:{min:0.1,max:3,step:0.1},zoom:{min:1,max:5,step:0.2}}),
    getRunningTrackCameraCapabilities:()=>({torchFeature:()=>({isSupported:()=>true,apply:async value=>lit.push(value)})}),
    applyVideoConstraints:async options=>applied.push(options)
  };
  const caps=api.cameraFeatures(camera);
  assert.equal(caps.torch,true);
  assert.equal(caps.autofocus,true);
  assert.equal(caps.focusMode,"continuous");
  assert.equal(caps.manualFocus.min,0.1);
  assert.equal(caps.zoom.max,5);
  await api.applyTorch(camera,caps,true);
  await api.applyTorch(camera,caps,false);
  assert.deepEqual(lit,[true,false]);
  await api.applyAutoFocus(camera,caps);
  await api.applyManualFocus(camera,caps,1.8);
  await api.applyZoom(camera,caps,4.5);
  assert.equal(JSON.stringify(applied),JSON.stringify([
    {advanced:[{focusMode:"continuous"}]},
    {advanced:[{focusMode:"manual",focusDistance:1.8}]},
    {advanced:[{zoom:4.5}]}
  ]));
});
test("unsupported camera has no callable torch/focus and clamps manual controls",async()=>{
  const root={addEventListener(){}};
  const ctx={window:{TabakCatalog:{products},addEventListener(){}},document:{getElementById(id){return id==="barcodeDialog"?root:null;},addEventListener(){}},console};
  runInNewContext(readFileSync(new URL("../scanner.js",import.meta.url),"utf8"),ctx);
  const api=ctx.window.TabakBarcode;
  const unsupported=api.cameraFeatures({getRunningTrackCapabilities(){return {};}});
  assert.equal(unsupported.torch,false);
  assert.equal(unsupported.autofocus,false);
  assert.equal(unsupported.manualFocus,null);
  assert.equal(unsupported.zoom,null);
  await assert.rejects(api.applyTorch(null,unsupported,true),/nicht verfügbar/);
  await assert.rejects(api.applyAutoFocus(null,unsupported),/nicht unterstützt/);
  const calls=[];
  const camera={
    getRunningTrackCapabilities:()=>({zoom:{min:1,max:3,step:1}}),
    applyVideoConstraints:async c=>calls.push(c)
  };
  const features=api.cameraFeatures(camera);
  await api.applyZoom(camera,features,999);
  assert.equal(JSON.stringify(calls),JSON.stringify([{advanced:[{zoom:3}]}]));
});


test("SUN-VI reconciliation adds verified-format GTINs without overwriting old identities",()=>{
  assert.ok(products.length>=759);
  const nameless=products.find(p=>p.ean==="4260711891496");
  assert.equal(nameless.brand,"Nameless");
  assert.equal(nameless.name,"#40 Black Nana");
  assert.equal(nameless.quantity_g,25);
  assert.equal(nameless.source,"SUN-VI");
  const prior=products.find(p=>p.ean==="4251776106656");
  assert.equal(prior.source,"Shisha-Nil");
  assert.equal(prior.base,"Virginia");
  assert.equal(prior.flavor,"Himbeere, Wassermelonen, Zitronen");
  assert.match(prior.flavor_source_url,/^https:\/\/www\.sunvi\.de\//);
  const love=products.find(p=>p.ean==="8681511384401");
  assert.equal(love.flavor,"Honigmelone, Maracuja, Minze, Wassermelone");
  assert.ok(!products.some(p=>p.source_url.includes("NASTY-GIRL-Erdbeere-Wassermelone-200g")));
});


test("Shisha-Shop import adds distinct GTINs without overwriting existing identities",()=>{
  assert.equal(products.length,994);
  assert.equal(new Set(products.map(p=>p.ean)).size,994);
  const newAino=products.find(p=>p.ean==="4251647513279");
  assert.equal(newAino.brand,"AINO Dark");
  assert.equal(newAino.name,"Conud Shake");
  assert.equal(newAino.source,"Shisha-Shop.de");
  const kismet=products.find(p=>p.ean==="4260482894634");
  assert.equal(kismet.brand,"Kismet Honey Blend");
  const nana=products.find(p=>p.ean==="4251862400033");
  assert.equal(nana.name,"#40 Black Nana");
  assert.ok(nana.aliases.includes("Black Nana"));
  const preserved=products.find(p=>p.ean==="4260553820371");
  assert.equal(preserved.quantity_g,25);
  assert.equal(preserved.source,"Shisha-Nil");
  const other=products.find(p=>p.ean==="5905930233595");
  assert.equal(other.source,"Shisha-Shop.de");
  assert.ok(products.find(p=>p.ean==="5905930237593"));
});
