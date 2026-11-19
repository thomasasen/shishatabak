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
test("single-purpose header keeps Backup a utility, not a full-height tab or sidebar",()=>{
  assert.doesNotMatch(html,/<aside|class="sidebar"|class="nav-item"|<nav class="nav"/);
  assert.match(html,/class="topbar-brand"[^>]*data-view="collection"/);
  assert.match(html,/class="btn btn-secondary btn-sm utility-action"[^>]*data-view="data"/);
  assert.equal((html.match(/aria-current="page"/g)||[]).length,1);
  assert.match(html,/<a class="skip-link" href="#screen">/);
  assert.match(html,/<main id="screen" class="content" tabindex="-1"><\/main>/);
  assert.doesNotMatch(html,/<main[^>]*aria-live=/);
  assert.match(html,/data-action="add-tobacco"[^>]*aria-label="Tabak hinzufügen"/);
  assert.doesNotMatch(html,/scanner\.js|barcodeDialog|data-view="sessions"|data-view="overview"|data-view="insights"/);
  assert.doesNotMatch(app,/sessionDialog\(|session-form|add-session|sessionsView\(|insightsView\(/);
});
test("mobile toolbar, five equal rating targets and sticky form actions remain accessible",()=>{
  assert.match(css,/@media\(max-width:680px\)/);
  assert.doesNotMatch(css,/\.sidebar\s*\{[^}]*position:fixed/s);
  assert.match(css,/\.topbar-actions \.btn\s*\{height:44px;width:44px/);
  assert.match(css,/\.rating-options\s*\{\s*display:grid;grid-template-columns:repeat\(5,minmax\(44px,1fr\)\)/);
  const ratingRule=css.match(/\.rating-options\s*\{([^}]*)\}/);
  assert.ok(ratingRule);
  assert.doesNotMatch(ratingRule[1],/repeat\(3,/,"rating must never wrap to 3+2");
  assert.match(css,/\.dialog-actions\s*\{[^}]*position:sticky;bottom:0/s);
  assert.match(css,/:focus-visible/);
  assert.match(css,/prefers-reduced-motion:reduce/);
  assert.match(css,/prefers-reduced-transparency:reduce/);
  assert.match(css,/prefers-contrast:more/);
  assert.match(css,/forced-colors:active/);
  assert.match(app,/name="tolerability"/);
  assert.match(app,/name="tolerability"[^>]*aria-label=/);
  assert.match(app,/class="optional-details"/);
  assert.match(app,/id="ratingFeedback"/);
});
test("content surfaces stay solid and blurred material appears only in functional toolbar",()=>{
  assert.match(css,/\.topbar\s*\{[^}]*backdrop-filter:/s);
  for(const selector of [".tobacco-card",".rating-summary"]){
    const start=css.indexOf(selector+"{");
    assert.notEqual(start,-1,"missing "+selector);
    const block=css.slice(start,css.indexOf("}",start));
    assert.doesNotMatch(block,/backdrop-filter/,"content blur prohibited: "+selector);
  }
  const grouped=css.match(/\.panel,\.data-tile\s*\{([^}]*)\}/);
  assert.ok(grouped,"shared content surfaces rule must exist");
  assert.doesNotMatch(grouped[1],/backdrop-filter/);
});
test("search updates only the results instead of replacing the live input node",()=>{
  assert.match(app,/function refreshCollectionResults\(\)/);
  assert.match(app,/results\.innerHTML=collectionCards\(products\)/);
  assert.match(app,/query=event\.target\.value;\s*refreshCollectionResults\(\)/);
  assert.match(app,/filter=el\.dataset\.filter;refreshCollectionResults\(\)/);
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

test("compact tobacco cards keep rating prominent and editing accessible without full-width footer",()=>{
  assert.match(app,/class="card-head"/);
  assert.match(app,/class="card-identity"/);
  assert.match(app,/class="card-side"/);
  assert.match(app,/class="card-edit"/);
  assert.match(app,/aria-label="'+escapeHTML\(action\+": "/);
  assert.match(app,/icon\(r\.tolerability==null\?"plus":"edit"\)/);
  assert.doesNotMatch(app,/class="card-foot"/);
  assert.match(css,/\.tobacco-card\s*\{[^}]*padding:15px 16px/s);
  assert.match(css,/\.card-edit\s*\{[^}]*width:44px;height:44px/s);
  assert.match(css,/\.rating-summary\s*\{[^}]*min-height:58px/s);
  for(const className of ["card-meta","review-symptoms","review-notes"]){
    const start=css.indexOf("."+className+"{");
    assert.notEqual(start,-1,"missing "+className);
    const rule=css.slice(start,css.indexOf("}",start));
    assert.match(rule,/text-overflow:ellipsis/,"single-line summary required: "+className);
    assert.match(rule,/overflow:hidden/,"untruncated layout can expand card: "+className);
  }
  assert.match(css,/\.tobacco-card\{padding:14px\}/);
});
