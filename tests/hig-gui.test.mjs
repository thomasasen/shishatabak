import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root=new URL("../",import.meta.url);
const read=path=>readFileSync(new URL(path,root),"utf8");
const html=read("index.html"),css=read("styles.css"),app=read("app.js");
function tokenMap(text){
  const out={};
  for(const m of text.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g))out[m[1]]=m[2].trim();
  return out;
}
function tokens(){
  const light=css.match(/:root\s*\{([^}]*)\}/);
  const dark=css.match(/@media\(prefers-color-scheme:dark\)\s*\{\s*:root\s*\{([^}]*)\}/);
  assert.ok(light&&dark,"Light and dark semantic color tokens required");
  return [tokenMap(light[1]),{...tokenMap(light[1]),...tokenMap(dark[1])}];
}
function channel(v){return v<=0.04045?v/12.92:((v+.055)/1.055)**2.4;}
function luminance(hex){
  assert.match(hex,/^#[0-9a-f]{6}$/i,"color must be explicit six-digit hex");
  const r=channel(parseInt(hex.slice(1,3),16)/255);
  const g=channel(parseInt(hex.slice(3,5),16)/255);
  const b=channel(parseInt(hex.slice(5,7),16)/255);
  return .2126*r+.7152*g+.0722*b;
}
function ratio(a,b){const l=[luminance(a),luminance(b)].sort((x,y)=>x-y);return(l[1]+.05)/(l[0]+.05);}
test("HIG semantic foreground combinations meet WCAG AA in light and dark including primary hover",()=>{
  for(const theme of tokens()){
    for(const [foreground,background] of [
      ["--text","--surface"],["--text-secondary","--surface"],["--text-tertiary","--surface"],
      ["--text-secondary","--canvas"],["--text-secondary","--surface-subtle"],
      ["--text-tertiary","--surface-subtle"],["--accent","--surface"],["--accent","--accent-soft"],
      ["--primary-text","--primary-bg"],["--primary-text","--accent-pressed"],
      ["--success","--success-bg"],["--warning","--warning-bg"],["--danger","--danger-bg"]
    ]){
      const value=ratio(theme[foreground],theme[background]);
      assert.ok(value>=4.5,foreground+" on "+background+" only "+value.toFixed(2)+":1");
    }
  }
});
test("exactly two destinations, keyboard skip link and accessible add-tobacco action",()=>{
  const tabs=[...html.matchAll(/<button[^>]+class="nav-item[^"]*"[^>]*data-view="([^"]+)"/g)];
  assert.deepEqual(tabs.map(m=>m[1]),["collection","data"]);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  assert.equal((html.match(/class="nav-icon"/g)||[]).length,2);
  assert.match(html,/<a class="skip-link" href="#screen">/);
  assert.match(html,/<main id="screen" class="content" tabindex="-1"><\/main>/);
  assert.doesNotMatch(html,/<main[^>]*aria-live=/);
  assert.doesNotMatch(html,/data-scan-action|scanner\\.js|barcodeDialog|ean-suche\\.net/);
  assert.match(html,/data-action="add-tobacco"[^>]*aria-label="Tabak erfassen"/);
  assert.doesNotMatch(app,/data-scan-action|openCatalogPicker|renderCatalogPicker/);
  assert.doesNotMatch(html,/data-view="sessions"|data-view="overview"|data-view="insights"/);
  assert.doesNotMatch(app,/sessionDialog\(|session-form|add-session|sessionsView\(|insightsView\(/);
});
test("mobile navigation is a safe-area aware bottom bar; interactive targets and focus styles exist",()=>{
  assert.match(css,/@media\(max-width:780px\)/);
  assert.match(css,/\.sidebar\s*\{\s*position:fixed;top:auto;bottom:0/);
  assert.match(css,/env\(safe-area-inset-bottom\)/);
  assert.match(css,/\.nav\s*\{display:grid;grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(css,/\.topbar-actions \.btn\s*\{width:44px;height:44px/);
  assert.match(css,/\.icon-btn\s*\{width:44px;height:44px/);
  assert.match(css,/:focus-visible/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/prefers-reduced-transparency:reduce/);
  assert.match(css,/prefers-contrast:more/);
  assert.match(css,/forced-colors:active/);
  assert.match(css,/\.rating-options\s*\{display:grid;grid-template-columns:repeat\(5,minmax\(0,1fr\)\)/);
  assert.match(app,/name="tolerability"/);
});
test("content surfaces stay solid; only floating navigation has optional blur",()=>{
  assert.match(css,/\.topbar\s*\{[^}]*backdrop-filter:/s);
  assert.match(css,/\.sidebar\s*\{[^}]*backdrop-filter:/s);
  for(const selector of [".hero",".tobacco-card",".panel",".stat",".data-tile"]){
    const start=css.indexOf(selector+"{");
    assert.notEqual(start,-1);
    const block=css.slice(start,css.indexOf("}",start));
    assert.doesNotMatch(block,/backdrop-filter|rgba\(/,"content glass prohibited: "+selector);
  }
});
test("dialog dismissal protects unsaved data and screen changes update accessible current page",()=>{
  assert.match(app,/function snapshot\(\)/);
  assert.match(app,/Ungespeicherte Änderungen verwerfen/);
  assert.match(app,/addEventListener\("cancel",(?:event|e)=>\{(?:event|e)\.preventDefault\(\);closeDialog\(\)/);
  assert.match(app,/setAttribute\?\.\("aria-current","page"\)/);
  assert.match(app,/removeAttribute\?\.\("aria-current"\)/);
  assert.match(app,/focus\?\.\(\{preventScroll:true\}\)/);
  assert.match(app,/window\.matchMedia\?\./);
});
