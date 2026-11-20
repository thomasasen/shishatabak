import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const root=new URL("../",import.meta.url);
const read=name=>readFileSync(new URL(name,root),"utf8");
const design=read("design.css");
const foundation=read("styles.css");
const html=read("index.html");
const app=read("app.js");

function theme(name){
  const block=design.match(new RegExp(':root\\[data-theme="'+name+'"\\]\\s*\\{([^}]+)\\}'));
  assert.ok(block,"Missing "+name+" design palette");
  return Object.fromEntries([...block[1].matchAll(/(--[\w-]+):\s*(#[\da-f]{6})/gi)].map(m=>[m[1],m[2]]));
}
function luminance(hex){
  const channels=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255)
    .map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4);
  return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;
}
function contrast(a,b){
  const [low,high]=[luminance(a),luminance(b)].sort((x,y)=>x-y);
  return (high+.05)/(low+.05);
}

test("Unslop palette has readable text and actions in both themes",()=>{
  for(const name of ["light","dark"]){
    const t=theme(name);
    for(const [fg,bg] of [
      ["--text","--canvas"],["--text-secondary","--canvas"],
      ["--text-tertiary","--surface"],["--text","--surface"],
      ["--text-secondary","--surface-subtle"],["--accent","--surface"],
      ["--accent","--accent-soft"],["--primary-text","--primary-bg"],
      ["--primary-text","--accent-pressed"],["--success","--success-bg"],
      ["--warning","--warning-bg"],["--danger","--danger-bg"]
    ]){
      const ratio=contrast(t[fg],t[bg]);
      assert.ok(ratio>=4.5,name+" "+fg+" / "+bg+": "+ratio.toFixed(2));
    }
  }
});

test("one authored design layer replaces legacy visual passes",()=>{
  assert.match(html,/design\.css\?v=20261120-unslop1/);
  assert.doesNotMatch(foundation,/VISUAL FIDELITY 2026-11-19|Visible design revision:/);
  assert.doesNotMatch(design,/linear-gradient\(|radial-gradient\(|glow|transition-all|animate-pulse/i);
  assert.match(design,/\.cards\{display:grid;grid-template-columns:1fr;gap:8px\}/);
  assert.match(design,/@media\(max-width:680px\)/);
  assert.match(design,/\.topbar-actions \.header-add/);
  assert.match(design,/\.dialog-actions\s*\{[\s\S]*?position:sticky;bottom:0/);
});

test("branded artwork, accessible editing and local storage stay intact",()=>{
  assert.match(html,/assets\/design-shisha-logo\.webp/);
  assert.match(design,/assets\/design-symptom-artwork\.png/);
  assert.match(app,/function shishaScale\(value\)/);
  assert.match(app,/Array\.from\(\{length:5\}/);
  assert.match(app,/class="review-symptoms" role="group"/);
  assert.match(app,/name="tolerability"/);
  assert.match(app,/function persist\(next\)/);
  assert.doesNotMatch(html,/https?:\/\/(?!www\.w3\.org)/);
});
