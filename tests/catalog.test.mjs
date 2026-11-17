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
    assert.ok([25,100,200,500].includes(p.quantity_g),p.quantity_g);
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
