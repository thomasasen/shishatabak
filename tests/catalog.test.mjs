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
test("GitHub Pages loads the static product catalog before the application, with no scanner",()=>{
  const html=readFileSync(new URL("../index.html",import.meta.url),"utf8");
  assert.match(html,/<script src="\.\/catalog\.js" defer><\/script>/);
  assert.match(html,/<script src="\.\/app\.js" defer><\/script>/);
  assert.ok(html.indexOf("catalog.js")<html.indexOf("app.js"));
  assert.doesNotMatch(html,/scanner\.js|barcodeDialog|data-scan-action|ean-suche\.net/);
});
test("Argileh ORNG MNT remains discoverable through existing catalog aliases",()=>{
  const hits=products.filter(p=>p.brand==="Argileh"&&["4260623442977","4260623441833"].includes(p.ean));
  assert.equal(hits.length,2);
  for(const p of hits){
    assert.equal(p.name,"ORNG MNT");
    assert.equal(p.quantity_g,200);
    assert.ok(p.aliases.includes("OG&M"));
    assert.ok(p.aliases.includes("OMI"));
  }
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
