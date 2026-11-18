/* Tabakjournal Pilot — zero dependencies, local-first, GitHub Pages compatible. */
"use strict";
(function () {
  const STORAGE_KEY = "tabakjournal:v1";
  const APP_ID = "tabakjournal";
  const VERSION = 1;
  // Curated product facts; personal records remain separate in browser storage.
  const PRODUCT_CATALOG = window.TabakCatalog?.products||[];
  // Group distinct barcode editions of the same tobacco by name and package size.
  // All canonical source records remain untouched in catalog.js.
  const groupedCatalog=new Map();
  for(const entry of PRODUCT_CATALOG){
    const group=[entry.brand,entry.name,entry.quantity_g].join("|").toLocaleLowerCase("de");
    const old=groupedCatalog.get(group);
    if(!old){
      groupedCatalog.set(group,{brand:entry.brand,name:entry.name,quantity_g:entry.quantity_g,
        base:entry.base||"Unbekannt",flavor:entry.flavor||"",ean:entry.ean,aliases:[...(entry.aliases||[])]});
    }else{
      if(old.base==="Unbekannt"&&entry.base&&entry.base!=="Unbekannt")old.base=entry.base;
      if(!old.flavor&&entry.flavor)old.flavor=entry.flavor;
      old.aliases=[...new Set([...old.aliases,...(entry.aliases||[])])];
    }
  }
  const CATALOG=[...groupedCatalog.values()].sort((a,b)=>a.brand.localeCompare(b.brand,"de")||a.name.localeCompare(b.name,"de")||a.quantity_g-b.quantity_g);
  const BRANDS = Array.from(new Set(CATALOG.map(x => x.brand).concat([
    "Al Massiva", "Blackburn", "Darkside", "Kismet", "Must H", "True Passion",
    "Maridan", "Chaos", "Brohood", "Bad und Mad", "Start Now", "Ocean Hookah",
    "Social Smoke", "O's", "Stral", "Revoshi", "Holster", "Hookain"
  ]))).sort((a,b) => a.localeCompare(b, "de"));
  const SYMPTOMS = ["Schwindel","Übelkeit","Kopfschmerzen","Herzrasen","Andere"];
  const SEVERITIES = ["Keine Beschwerden","Leichte Beschwerden","Deutliche Beschwerden","Starke Beschwerden"];
  const $ = id => document.getElementById(id);
  const emptyState = () => ({app:APP_ID,version:VERSION,tobaccos:[],sessions:[],settings:{bowl:""}});
  let state = emptyState();
  let view = "overview";
  let query = "";
  let filter = "all";
  let importMode = "merge";
  let toastTimer;
  let storageError = "";
  let dialogBaseline = null;
  function escapeHTML(value) { return String(value == null ? "" : value).replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  function plain(value, len=300) { return typeof value === "string" ? value.trim().slice(0,len) : ""; }
  function key(value) { return String(value).toLocaleLowerCase("de").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,""); }
  function uid() { return typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now().toString(36)+"-"+Math.random().toString(36).slice(2); }
  function localDate() { const d=new Date();return new Date(d.getTime()-d.getTimezoneOffset()*60000).toISOString().slice(0,10); }
  function fmtDate(value) { try { return new Intl.DateTimeFormat("de-DE",{day:"2-digit",month:"short",year:"numeric"}).format(new Date(value+"T12:00:00")); } catch { return value; } }
  function pName(p) { return p ? p.brand+" · "+p.name : "Unbekannter Tabak"; }
  function productById(id) { return state.tobaccos.find(p => p.id===id); }
  function sessionsOf(id) { return state.sessions.filter(s => s.tobaccoId===id); }
  function numbers() {
    const symptomatic=state.sessions.filter(s=>s.severity>0).length;
    return {tabak:state.tobaccos.length,packs:state.tobaccos.reduce((sum,p)=>sum+(p.stock??1),0),sessions:state.sessions.length, symptom:symptomatic,none:state.sessions.length-symptomatic};
  }
  function uiIcon(name) {
    const allowed=["overview","collection","sessions","insights","data","plus","search","edit","check"];
    return allowed.includes(name)?'<svg class="ui-icon" aria-hidden="true" focusable="false"><use href="#i-'+name+'"></use></svg>':"";
  }
  function badge(severity) {
    if (severity===0) return '<span class="tag good">Keine Beschwerden</span>';
    if (severity===1) return '<span class="tag warn">Leicht</span>';
    return '<span class="tag bad">'+(severity===2?'Deutlich':'Stark')+'</span>';
  }
  function caption(heading, text) { return '<div class="page-head"><div><h1>'+escapeHTML(heading)+'</h1><p>'+escapeHTML(text)+'</p></div></div>'; }
  function empty(icon,title,description,action,label) {
    const iconName=({"◷":"sessions","▤":"collection","▥":"insights","⌕":"search"})[icon]||"overview";
    return '<div class="empty"><div class="empty-icon">'+uiIcon(iconName)+'</div><strong>'+escapeHTML(title)+'</strong><p>'+escapeHTML(description)+'</p>'+(action?'<button class="btn btn-secondary" data-action="'+action+'">'+escapeHTML(label)+'</button>':'')+'</div>';
  }
  function sessionRow(s) {
    const t=productById(s.tobaccoId);
    return '<div class="row-item"><div class="mini-badge">'+uiIcon("sessions")+'</div><div class="row-item-info"><strong>'+escapeHTML(pName(t))+'</strong><small>'+escapeHTML(fmtDate(s.date))+' · '+(s.duration?s.duration+' Minuten · ':'')+'Geschmack '+s.taste+'/5</small></div><div class="row-item-right">'+badge(s.severity)+'<button class="icon-btn" title="Session bearbeiten" aria-label="Session bearbeiten" data-action="edit-session" data-id="'+escapeHTML(s.id)+'">'+uiIcon("edit")+'</button></div></div>';
  }
  function productRow(p) {
    const ss=sessionsOf(p.id), affected=ss.filter(s=>s.severity>0).length;
    return '<div class="row-item"><div class="mini-badge">'+escapeHTML(p.brand.slice(0,2).toUpperCase())+'</div><div class="row-item-info"><strong>'+escapeHTML(pName(p))+'</strong><small>'+escapeHTML(p.base)+' · '+(p.stock??1)+' '+((p.stock??1)===1?'Packung':'Packungen')+' · '+ss.length+' Sessions</small></div><div class="row-item-right">'+(ss.length?affected?'<span class="tag warn">'+affected+' mit Beschwerden</span>':'<span class="tag good">Ohne Beschwerden</span>':'<span class="tag">Neu</span>')+'<button class="icon-btn" title="Tabak bearbeiten" aria-label="Tabak bearbeiten" data-action="edit-tobacco" data-id="'+escapeHTML(p.id)+'">'+uiIcon("edit")+'</button></div></div>';
  }
  function overview() {
    const n=numbers();
    const recent=state.sessions.slice().sort((a,b)=>(b.date+b.createdAt).localeCompare(a.date+a.createdAt)).slice(0,5);
    const products=state.tobaccos.slice().sort((a,b)=>(b.createdAt||"").localeCompare(a.createdAt||"")).slice(0,5);
    return caption("Deine Übersicht","Behalte deine Sammlung und persönlichen Erfahrungen im Blick.")+
      '<section class="hero"><div class="hero-copy"><span class="hero-kicker">Privates Journal</span><h2>Deine Sammlung im Blick.</h2><p>Verwalte deine Tabake und Packungen. Dokumentiere Geschmack und persönliche Erfahrungen nach jeder Session.</p><button type="button" class="btn btn-primary" data-action="'+(n.tabak?"add-session":"add-tobacco")+'">'+uiIcon(n.tabak?"sessions":"plus")+(n.tabak?" Session erfassen":" Ersten Tabak erfassen")+'</button></div></section>'+
      '<div class="stats">'+
      stat("Sorten in Sammlung",n.tabak,"Eigene Tabake","")+
      stat("Packungen im Bestand",n.packs,"Erfasste Packungen","")+
      stat("Dokumentierte Sessions",n.sessions,"Gespeicherte Einträge","")+
      stat("Sessions mit Beschwerden",n.symptom,"Leicht bis stark","orange")+'</div>'+
      '<div class="panel-grid"><section class="panel"><div class="panel-head"><h3>Letzte Sessions</h3><button class="btn btn-ghost" data-view="sessions">Alle anzeigen →</button></div><div class="panel-body">'+(recent.length?recent.map(sessionRow).join(""):empty("◷","Noch keine Session","Erfasse nach einer Session Geschmack und mögliche Beschwerden.","add-session","Session erfassen"))+'</div></section>'+
      '<section class="panel"><div class="panel-head"><h3>Zuletzt hinzugefügt</h3><button class="btn btn-ghost" data-view="collection">Sammlung öffnen →</button></div><div class="panel-body">'+(products.length?products.map(productRow).join(""):empty("▤","Sammlung ist leer","Füge deine ersten Tabake hinzu. Die Suche hilft mit Herstellern und Beispielsorten.","add-tobacco","Tabak hinzufügen"))+'</div></section></div>'+
      '<h3 class="section-title">Wichtig zur Einordnung</h3><div class="hint warning">Schwindel und Übelkeit können auch bei elektrischer Beheizung auftreten, beispielsweise im Zusammenhang mit Nikotin. Die Aufzeichnungen zeigen persönliche Muster, ersetzen aber keine medizinische Untersuchung. Bei Beschwerden die Session beenden; wiederkehrende Symptome ärztlich abklären.</div>';
  }
  function stat(label,value,note,tone) {
    return '<div class="stat"><div class="stat-label"><i class="stat-indicator '+tone+'"></i>'+escapeHTML(label)+'</div><strong class="stat-value">'+value+'</strong><small>'+escapeHTML(note)+'</small></div>';
  }
  function collection() {
    const sorted=state.tobaccos.filter(p => (filter==="all"||p.base===filter) && key([p.brand,p.name,p.flavor].join(" ")).includes(key(query))).sort((a,b)=>pName(a).localeCompare(pName(b),"de"));
    const packCount=state.tobaccos.reduce((sum,p)=>sum+(p.stock??1),0);
    return caption("Meine Tabake","Erfasse deine Tabake mit Packungsgröße, Anzahl und Öffnungsstatus. Alle Daten bleiben lokal.")+
      '<div class="collection-actions"><div class="collection-summary"><strong>'+state.tobaccos.length+' Sorten</strong><span> · '+packCount+' '+(packCount===1?'Packung':'Packungen')+' im Bestand</span></div>'+
      '<div class="btn-row"><button type="button" class="btn btn-primary btn-sm" data-action="add-tobacco">＋ Tabak erfassen</button></div></div>'+
      '<div class="toolbar"><div class="search-wrap"><input class="search" id="searchBar" type="search" placeholder="Hersteller, Sorte oder Geschmack suchen..." value="'+escapeHTML(query)+'" autocomplete="off" aria-label="Meine Tabake durchsuchen"></div><div class="filters">'+
      [["all","Alle"],["Virginia","Virginia"],["Dark Blend","Dark Blend"],["Unbekannt","Unbekannt"]].map(x=>'<button class="filter '+(filter===x[0]?"active":"")+'" data-filter="'+x[0]+'">'+x[1]+'</button>').join("")+'</div></div>'+
      (sorted.length?'<div class="cards">'+sorted.map(tobaccoCard).join("")+'</div>':empty("⌕",state.tobaccos.length?"Keine Treffer":"Noch keine Tabake",state.tobaccos.length?"Versuche andere Suchbegriffe oder Filter.":"Erfasse einen Tabak und übernimm die passenden Angaben aus den automatischen Katalogvorschlägen.","add-tobacco","Tabak erfassen"))+
      '<p class="smallprint">Anzahl bezeichnet vorhandene Packungen, nicht die Restmenge in Gramm. Der Öffnungsstatus bedeutet, dass mindestens eine Packung geöffnet ist. Auch Tabake mit Bestand 0 behalten ihre Sessions.</p>';
  }
  function tobaccoCard(p) {
    const ss=sessionsOf(p.id), n=ss.filter(s=>s.severity>0).length, flavor=p.flavor||"Geschmacksprofil nicht erfasst",stock=p.stock??1;
    const stockLabel=stock+' '+(stock===1?'Packung':'Packungen');
    const size=p.quantity_g?p.quantity_g+' g / Packung':'Größe unbekannt';
    return '<article class="tobacco-card"><div class="card-top"><span class="card-brand">'+escapeHTML(p.brand)+'</span><span class="tag">'+escapeHTML(p.base)+'</span></div><h3>'+escapeHTML(p.name)+'</h3><div class="card-meta">'+escapeHTML(flavor)+'</div>'+
      '<div class="inventory-meta"><strong>'+escapeHTML(stockLabel)+'</strong><span>'+escapeHTML(size)+'</span>'+(p.opened&&stock?'<span class="tag warn">Geöffnet</span>':stock===0?'<span class="tag">Aufgebraucht</span>':'<span class="tag good">Nicht als geöffnet markiert</span>')+'</div>'+
      '<div class="card-top"><span class="pill-number">'+ss.length+' Sessions</span>'+(ss.length?n?'<span class="tag warn">'+n+' mit Beschwerden</span>':'<span class="tag good">Keine Beschwerden protokolliert</span>':'<span class="tag">Noch keine Bewertung</span>')+'</div>'+
      '<div class="card-foot"><div class="stock-actions" aria-label="Bestand ändern"><button type="button" class="icon-btn" title="Eine Packung weniger" aria-label="Bestand von '+escapeHTML(p.name)+' verringern" data-action="stock-minus" data-id="'+escapeHTML(p.id)+'" '+(stock===0?'disabled':'')+'>−</button><span aria-label="'+escapeHTML(stockLabel)+'">'+stock+'</span><button type="button" class="icon-btn" title="Eine Packung mehr" aria-label="Bestand von '+escapeHTML(p.name)+' erhöhen" data-action="stock-plus" data-id="'+escapeHTML(p.id)+'" '+(stock>=999?'disabled':'')+'>＋</button></div>'+
      '<div class="card-actions"><button class="icon-btn" title="Session erfassen" aria-label="Session für '+escapeHTML(p.name)+' erfassen" data-action="add-session" data-id="'+escapeHTML(p.id)+'">'+uiIcon("sessions")+'</button><button class="icon-btn" title="Bestand und Tabak bearbeiten" aria-label="Tabak bearbeiten" data-action="edit-tobacco" data-id="'+escapeHTML(p.id)+'">'+uiIcon("edit")+'</button></div></div></article>';
  }

  function sessionsView() {
    const sorted=state.sessions.slice().sort((a,b)=>(b.date+b.createdAt).localeCompare(a.date+a.createdAt));
    return caption("Session-Tagebuch","Jede Session wird separat bewertet. So bleiben Veränderungen sichtbar.")+
      '<div class="toolbar"><div class="hint">Festes Heizsystem: <strong>NOCCA eHMD · ohne Kohle</strong>. Temperatur und Kopf können optional pro Session erfasst werden.</div><button class="btn btn-primary" data-action="add-session">＋ Neue Session</button></div>'+
      (sorted.length?'<div class="session-list">'+sorted.map(s=>'<article class="session-card"><div class="session-info"><h3>'+escapeHTML(pName(productById(s.tobaccoId)))+'</h3><p>'+escapeHTML(fmtDate(s.date))+(s.duration?' · '+s.duration+' Minuten':'')+(s.temperature?' · '+s.temperature+' °C':'')+(s.bowl?' · '+escapeHTML(s.bowl):'')+'</p><p style="margin-top:5px">Geschmack '+s.taste+'/5'+(s.symptoms.length?' · '+escapeHTML(s.symptoms.join(", ")):'')+(s.notes?' · '+escapeHTML(s.notes):'')+'</p></div><div class="session-cta">'+badge(s.severity)+'<button class="btn btn-secondary btn-sm" data-action="edit-session" data-id="'+escapeHTML(s.id)+'">Bearbeiten</button></div></article>').join("")+'</div>':
      empty("◷","Noch keine Sessions","Füge einen Tabak hinzu und dokumentiere anschließend deine erste Session.","add-session","Session erfassen"));
  }
  function insights() {
    const n=numbers(), all=n.sessions||1;
    const dist=[0,1,2,3].map(i=>state.sessions.filter(s=>s.severity===i).length);
    const colors=["var(--severity0)","var(--severity1)","var(--severity2)","var(--severity3)"];
    const bars=dist.map((count,i)=>'<span title="'+SEVERITIES[i]+': '+count+'" style="width:'+(count/all*100)+'%;background:'+colors[i]+'"></span>').join("");
    const brands={};
    state.sessions.forEach(s=>{const p=productById(s.tobaccoId);if(!p)return;const b=p.brand;if(!brands[b])brands[b]={sessions:0,symptoms:0};brands[b].sessions++;if(s.severity>0)brands[b].symptoms++;});
    const sorted=Object.entries(brands).sort((a,b)=>b[1].sessions-a[1].sessions);
    return caption("Auswertung","Deine Einträge im Überblick. Zusammenhänge sind keine Ursachenbeweise.")+
      '<div class="stats">'+stat("Erfasste Sessions",n.sessions,"Basis der Auswertung","")+stat("Ohne Beschwerden",n.none,"Protokollierte Sessions","")+stat("Mit Beschwerden",n.symptom,"Alle Schweregrade","orange")+stat("Hersteller",Object.keys(brands).length,"Mit Session-Einträgen","")+'</div>'+
      '<div class="panel-grid"><section class="panel"><div class="panel-head"><h3>Verteilung der Beschwerden</h3></div><div class="panel-body">'+(n.sessions?'<div class="risk-track">'+bars+'</div><div class="legend">'+SEVERITIES.map((label,i)=>'<span><i style="background:'+colors[i]+'"></i>'+label+': '+dist[i]+'</span>').join("")+'</div>':empty("▥","Noch keine Daten","Bewerte Sessions, damit hier die Verteilung sichtbar wird."))+'</div></section>'+
      '<section class="panel"><div class="panel-head"><h3>Hersteller · Sessions mit Beschwerden</h3></div><div class="panel-body">'+(sorted.length?'<div class="bars">'+sorted.map(([brand,stats])=>'<div class="bar-row"><span class="bar-label" title="'+escapeHTML(brand)+'">'+escapeHTML(brand)+'</span><div class="bar-background"><div class="bar-fill" style="width:'+(100*stats.symptoms/stats.sessions)+'%"></div></div><span>'+stats.symptoms+'/'+stats.sessions+'</span></div>').join("")+'</div>':empty("▥","Keine Daten","Du brauchst mindestens eine Session."))+'</div></section></div>'+
      '<h3 class="section-title">Beschwerden nach Grundtabak</h3><section class="panel"><div class="panel-body">'+baseInsight()+'</div></section>'+
      '<div class="hint warning" style="margin-top:20px"><strong>Keine medizinische Diagnose:</strong> Unterschiede zwischen Sorten oder Herstellern können auch mit Sitzungsdauer, Temperatur, Nikotinexposition oder anderen Umständen zusammenhängen. Kleine Stichproben sind besonders unsicher.</div>';
  }
  function baseInsight() {
    const bases=["Virginia","Dark Blend","Unbekannt"], h={};
    bases.forEach(b=>h[b]={total:0,symptoms:0});
    state.sessions.forEach(s=>{const p=productById(s.tobaccoId);if(!p)return;const b=h[p.base]?p.base:"Unbekannt";h[b].total++;if(s.severity>0)h[b].symptoms++;});
    if(!state.sessions.length)return empty("▥","Noch keine Auswertung","Sobald Sessions vorhanden sind, werden die Grundtabake verglichen.");
    return '<div class="bars">'+bases.map(base=>'<div class="bar-row"><span class="bar-label">'+base+'</span><div class="bar-background"><div class="bar-fill" style="width:'+(h[base].total?100*h[base].symptoms/h[base].total:0)+'%"></div></div><span>'+h[base].symptoms+'/'+h[base].total+'</span></div>').join("")+'</div><p class="smallprint">Die Zahlen zeigen Sessions mit Beschwerden im Verhältnis zu allen Sessions mit diesem Grundtabak. Fehlen Produktangaben, erscheint „Unbekannt“.</p>';
  }
  function dataView() {
    return caption("Daten & Backup","Alle Einträge liegen ausschließlich in deinem Browser. Sichere sie regelmäßig.")+
      '<div class="data-grid"><div class="data-tile"><span class="page-kicker">SICHERN</span><h3>Vollständiges JSON-Backup</h3><p>Exportiert alle Tabake, Session-Protokolle und Einstellungen in eine Datei. Die Datei lässt sich später wieder einlesen oder auf ein anderes Gerät übertragen.</p><button class="btn btn-primary" data-action="export">↓ Backup exportieren</button></div>'+
      '<div class="data-tile"><span class="page-kicker">WIEDERHERSTELLEN</span><h3>JSON-Backup importieren</h3><p>Entscheide, ob du die importierten Einträge mit deinen bestehenden Daten zusammenführen oder den aktuellen Datenbestand ersetzen möchtest.</p><div class="btn-row"><button class="btn btn-secondary" data-action="import-merge">↗ Zusammenführen</button><button class="btn btn-secondary" data-action="import-replace">↗ Ersetzen</button></div><input type="file" id="importFile" accept=".json,application/json" hidden></div></div>'+
      '<h3 class="section-title">Datenschutz & Speicherort</h3><div class="panel"><div class="panel-body"><p class="privacy-note">Die App verwendet <strong>localStorage</strong>. Die Daten bleiben nach einem normalen Browserneustart erhalten, werden aber nicht zwischen Browsern oder Geräten synchronisiert. Private Fenster, das Löschen von Websitedaten oder eine Browserbereinigung können sie entfernen. Der Betreiber von GitHub Pages erhält keine Kopie deiner Sammlung durch diese App.</p><p class="smallprint">Aktueller Stand: '+state.tobaccos.length+' Tabake · '+state.sessions.length+' Sessions. Backup enthält auch Angaben zu Beschwerden und sollte vertraulich behandelt werden.</p><button class="btn btn-danger" data-action="clear-all">Alle lokalen Daten löschen</button></div></div>'+
      '<div class="hint warning" style="margin-top:18px">Vor dem Ersetzen oder Löschen zuerst ein aktuelles Backup exportieren. Der Import akzeptiert das versionierte JSON-Format dieses Piloten.</div>';
  }
  function render() {
    const names={overview:"Übersicht",collection:"Meine Tabake",sessions:"Sessions",insights:"Auswertung",data:"Daten & Backup"};
    $("currentSection").textContent=names[view];
    document.querySelectorAll(".nav-item").forEach(b=>{const active=b.dataset.view===view;b.classList.toggle("is-active",active);if(active)b.setAttribute?.("aria-current","page");else b.removeAttribute?.("aria-current");});
    $("screen").innerHTML={overview,collection,sessions:sessionsView,insights,data:dataView}[view]();
    $("saveStatus").textContent=storageError?"Speicherfehler":"Lokal gespeichert";
    $("saveStatus").classList.toggle("error",!!storageError);
  }
  function toast(text,isError=false) {
    const el=$("toast");el.textContent=text;el.classList.toggle("error",isError);el.classList.add("visible");
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>el.classList.remove("visible"),3500);
  }
  function setView(next) { if(!["overview","collection","sessions","insights","data"].includes(next))return;view=next;query="";filter="all";render();const reduced=window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;window.scrollTo({top:0,behavior:reduced?"auto":"smooth"});$("screen").focus?.({preventScroll:true}); }
  function persist(next) {
    try {
      localStorage.setItem(STORAGE_KEY,JSON.stringify(next));
      state=next;storageError="";render();return true;
    } catch(e) { storageError="Deine Eingaben konnten nicht gespeichert werden.";render();toast(storageError+" Prüfe Browser-Einstellungen oder Speicherplatz.",true);return false; }
  }
  function load() {
    try {
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw)return;
      state=validate(JSON.parse(raw));
    } catch (e) { storageError="Gespeicherte Daten konnten nicht gelesen werden.";toast(storageError+" Vorhandene Websitedaten nicht löschen.",true); }
  }
  function normalizeBase(base) { return ["Virginia","Dark Blend","Unbekannt"].includes(base)?base:"Unbekannt"; }
  function normalizeBarcode(value) {
    const raw=String(value??"").trim().replace(/[\s-]/g,"");
    if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(raw))return null;
    let sum=0,weight=3;
    for(let i=raw.length-2;i>=0;i--){sum+=Number(raw[i])*weight;weight=weight===3?1:3;}
    if((10-sum%10)%10!==Number(raw.at(-1)))return null;
    return raw.length===12?"0"+raw:raw;
  }
  function parseBarcodes(values) {
    const arr=Array.isArray(values)?values:String(values||"").split(/[,;\s]+/);
    const result=[];
    for(const val of arr){
      if(!String(val||"").trim())continue;
      const barcode=normalizeBarcode(val);
      if(!barcode)throw new Error("Ungültige EAN/UPC: "+String(val).slice(0,30));
      if(!result.includes(barcode))result.push(barcode);
    }
    if(result.length>30)throw new Error("Maximal 30 EANs pro Tabak.");
    return result;
  }
  function validate(raw) {
    if(!raw||raw.app!==APP_ID||raw.version!==VERSION||!Array.isArray(raw.tobaccos)||!Array.isArray(raw.sessions))throw new Error("Nicht unterstütztes Backup-Format oder Version.");
    if(raw.tobaccos.length>5000||raw.sessions.length>50000)throw new Error("Datei überschreitet die zulässige Anzahl von Einträgen.");
    const ids=new Set(),allBarcodes=new Set(),tobaccos=[];
    for(const t of raw.tobaccos) {
      if(!t||typeof t.id!=="string"||!(/^[\w-]{1,80}$/).test(t.id)||ids.has(t.id)||!plain(t.brand,120)||!plain(t.name,160))throw new Error("Ungültige oder doppelte Tabakdaten.");
      ids.add(t.id);
      const barcodes=parseBarcodes(t.barcodes||[]);
      for(const code of barcodes){
        if(allBarcodes.has(code))throw new Error("EAN/UPC ist mehreren Tabaken zugeordnet: "+code);
        allBarcodes.add(code);
      }
      const quantity_g=t.quantity_g??0,stock=t.stock??1,opened=t.opened??false;
       if(!Number.isInteger(quantity_g)||quantity_g<0||quantity_g>1000||!Number.isInteger(stock)||stock<0||stock>999||typeof opened!=="boolean")throw new Error("Ungültige Packungsgröße, Bestandszahl oder Öffnungsstatus.");
       tobaccos.push({id:t.id,barcodes,brand:plain(t.brand,120),name:plain(t.name,160),base:normalizeBase(t.base),flavor:plain(t.flavor,200),notes:plain(t.notes,1000),quantity_g,stock,opened:stock>0&&opened,createdAt:plain(t.createdAt,40)});
    }
    const sessionIds=new Set(),sessions=[];
    for(const s of raw.sessions) {
      if(!s||typeof s.id!=="string"||!(/^[\w-]{1,80}$/).test(s.id)||sessionIds.has(s.id)||!ids.has(s.tobaccoId)||!(/^\d{4}-\d{2}-\d{2}$/).test(s.date)||!Number.isInteger(s.severity)||s.severity<0||s.severity>3||!Number.isInteger(s.taste)||s.taste<1||s.taste>5)throw new Error("Ungültige Session-Daten oder fehlender Tabakbezug.");
      sessionIds.add(s.id);
      sessions.push({id:s.id,tobaccoId:s.tobaccoId,date:s.date,severity:s.severity,taste:s.taste,duration:Number.isFinite(s.duration)?Math.max(0,Math.min(600,Math.round(s.duration))):0,temperature:Number.isFinite(s.temperature)?Math.max(0,Math.min(350,Math.round(s.temperature))):0,bowl:plain(s.bowl,100),symptoms:Array.isArray(s.symptoms)?Array.from(new Set(s.symptoms.filter(x=>SYMPTOMS.includes(x)))):[],notes:plain(s.notes,1000),createdAt:plain(s.createdAt,40)});
    }
    return {app:APP_ID,version:VERSION,tobaccos,sessions,settings:{bowl:plain(raw.settings&&raw.settings.bowl,100)}};
  }
  function formSnapshot() {
    const form=$("editorDialog").querySelector?.("form");
    if(!form)return null;
    return JSON.stringify([...new FormData(form).entries()]);
  }
  function dialog(markup) {
    $("dialogContent").innerHTML=markup;
    const dlg=$("editorDialog");if(!dlg.open)dlg.showModal();
    dialogBaseline=formSnapshot();
  }
  function closeDialog(force=false) {
    const dlg=$("editorDialog");if(!dlg.open)return;
    if(!force&&dialogBaseline!==null&&formSnapshot()!==dialogBaseline&&!confirm("Ungespeicherte Eingaben verwerfen?"))return;
    dlg.close();dialogBaseline=null;
  }
  function input(name,label,value,placeholder,required=false,type="text",extra="") {
    return '<div class="field"><label for="f-'+name+'">'+label+'</label><input id="f-'+name+'" name="'+name+'" type="'+type+'" value="'+escapeHTML(value||"")+'" placeholder="'+escapeHTML(placeholder||"")+'" '+(required?"required ":"")+extra+'></div>';
  }
  function tobaccoDialog(id,preset=null) {
    const existing=state.tobaccos.find(x=>x.id===id);
    const p=existing||preset;
    const isEdit=Boolean(existing);
    dialog('<div class="dialog-head"><div><h2 id="dialogTitle">'+(isEdit?"Tabak bearbeiten":"Tabak erfassen")+'</h2><p>Hersteller oder Sorte eingeben, Katalogvorschlag auswählen und Bestand speichern.</p></div><button class="close-btn" data-action="close-dialog" aria-label="Schließen">×</button></div>'+
      '<form class="editor-form" id="tobacco-form"><div class="fields">'+
      input("brand","Hersteller *",p&&p.brand,"z. B. Hookain",true,'text','list="brandList" maxlength="120"')+
      '<datalist id="brandList">'+BRANDS.map(b=>'<option value="'+escapeHTML(b)+'"></option>').join("")+'</datalist>'+
      input("name","Sorte *",p&&p.name,"z. B. White Caek",true,'text','maxlength="160" autocomplete="off"')+
      '<div class="field-help">Während der Eingabe erscheinen passende Sorten und Packungsgrößen aus dem vorhandenen Produktkatalog.</div>'+
      '<div class="catalog-results" id="catalogResults" aria-label="Produktvorschläge"></div>'+
      '<div class="field-help" id="catalogSelection" role="status"></div>'+
      '<input type="hidden" id="f-catalog-ean" name="catalog_ean" value="">'+
      '<div class="field-row"><div class="field"><label for="f-base">Grundtabak</label><select id="f-base" name="base">'+["Unbekannt","Virginia","Dark Blend"].map(b=>'<option '+((p?p.base:"Unbekannt")===b?"selected ":"")+'value="'+b+'">'+b+'</option>').join("")+'</select></div>'+
      input("flavor","Geschmacksprofil",p&&p.flavor,"z. B. Traube, Minze",false,"text",'maxlength="200"')+'</div>'+
      '<div class="field-row">'+
      input("quantity_g","Packungsgröße (g)",p?.quantity_g?String(p.quantity_g):"","z. B. 200",false,"number",'min="0" max="1000" step="1"')+
      input("stock","Packungen im Bestand *",String(p?.stock??1),"z. B. 2",true,"number",'min="0" max="999" step="1"')+'</div>'+
      '<label class="inventory-open-label"><input type="checkbox" name="opened" '+(p?.opened?'checked ':'')+'> Mindestens eine Packung ist geöffnet</label>'+
      '<span class="field-help">Packungsgröße 0 bedeutet „unbekannt“, Bestand 0 „aufgebraucht“. Vorhandene Sessions bleiben erhalten.</span>'+
      '<div class="field"><label for="f-notes">Eigene Notizen</label><textarea id="f-notes" maxlength="1000" name="notes" placeholder="Optional">'+escapeHTML(p&&p.notes)+'</textarea></div>'+
      '<div class="hint">Deine persönliche Sammlung ist unabhängig vom Online-Katalog und bleibt lokal im Browser gespeichert.</div></div>'+
      '<div class="dialog-actions">'+(isEdit?'<button type="button" class="btn btn-danger" data-action="delete-tobacco" data-id="'+escapeHTML(existing.id)+'">Löschen</button>':'')+
      '<button type="button" class="btn btn-secondary" data-action="close-dialog">Abbrechen</button><button class="btn btn-primary" type="submit">'+(isEdit?"Änderungen speichern":"Tabak speichern")+'</button></div><input name="id" type="hidden" value="'+escapeHTML(id||"")+'"></form>');
    initAutocomplete();
  }
  function initAutocomplete() {
    const brand=$("f-brand"),name=$("f-name"),results=$("catalogResults");
    if(!brand||!name||!results)return;
    const update=()=>{
      const selected=$("f-catalog-ean");
      if(selected)selected.value="";
      const status=$("catalogSelection");
      if(status)status.textContent="";
      const b=key(brand.value),n=key(name.value);
      if(!b&&!n){results.innerHTML="";return;}
      const matches=CATALOG.filter(p=>(!b||key(p.brand).includes(b))&&
        (!n||[p.name,...p.aliases].some(label=>key(label).includes(n)))).slice(0,8);
      results.innerHTML=matches.map(p=>{
        const idx=CATALOG.indexOf(p),size=p.quantity_g?p.quantity_g+" g":"Größe unbekannt";
        const details=[size,p.base!=="Unbekannt"?p.base:"",p.flavor].filter(Boolean).join(" · ");
        return '<button class="catalog-result" type="button" data-action="choose-suggestion" data-index="'+idx+'"><span><strong>'+escapeHTML(p.brand)+'</strong> · '+escapeHTML(p.name)+'</span><small>'+escapeHTML(details)+'</small></button>';
      }).join("");
    };
    brand.addEventListener("input",update);name.addEventListener("input",update);
    update();
  }
  function sessionDialog(id,preferredProduct) {
    if(!state.tobaccos.length){toast("Bitte zuerst einen Tabak hinzufügen.");tobaccoDialog();return;}
    const s=state.sessions.find(x=>x.id===id);
    const picked=(s&&s.tobaccoId)||preferredProduct||state.tobaccos[0].id;
    const date=s?s.date:localDate(),severity=s?s.severity:0,taste=s?s.taste:4;
    dialog('<div class="dialog-head"><div><h2 id="dialogTitle">'+(s?"Session bearbeiten":"Session erfassen")+'</h2><p>NOCCA eHMD · elektrische Beheizung ohne Kohle</p></div><button class="close-btn" data-action="close-dialog" aria-label="Schließen">×</button></div>'+
      '<form class="editor-form" id="session-form"><div class="fields"><div class="field"><label for="s-tobacco">Tabak *</label><select name="tobaccoId" id="s-tobacco" required>'+state.tobaccos.slice().sort((a,b)=>pName(a).localeCompare(pName(b),"de")).map(p=>'<option value="'+escapeHTML(p.id)+'" '+(p.id===picked?"selected":"")+'>'+escapeHTML(pName(p))+'</option>').join("")+'</select></div>'+
      '<div class="field-row">'+input("date","Datum",date,"",true,"date")+'<div class="field"><label for="s-taste">Geschmack</label><select id="s-taste" name="taste">'+[1,2,3,4,5].map(i=>'<option '+(i===taste?"selected ":"")+'value="'+i+'">'+i+' / 5</option>').join("")+'</select></div></div>'+
      '<div class="field"><label>Beschwerden während / nach der Session</label><div class="segmented">'+SEVERITIES.map((x,i)=>'<label><input type="radio" name="severity" value="'+i+'" '+(i===severity?"checked":"")+'><span>'+["Keine","Leicht","Deutlich","Stark"][i]+'</span></label>').join("")+'</div></div>'+
      '<div class="field"><label>Welche Beschwerden?</label><div class="symptom-grid">'+SYMPTOMS.map(sym=>'<label class="symptom-choice"><input type="checkbox" name="symptom" value="'+sym+'" '+(s&&s.symptoms.includes(sym)?"checked":"")+'> '+sym+'</label>').join("")+'</div></div>'+
      '<div class="field-row">'+input("duration","Dauer (Minuten)",s&&s.duration||"","z. B. 45",false,"number",'min="0" max="600" step="1"')+
      input("temperature","NOCCA Temperatur (°C)",s&&s.temperature||"","z. B. 200",false,"number",'min="0" max="350" step="1"')+'</div>'+
      input("bowl","Kopf (optional)",s?s.bowl:state.settings.bowl,"z. B. Cosmo Bowl",false,"text",'maxlength="100"')+
      '<div class="field"><label for="s-notes">Notizen</label><textarea name="notes" id="s-notes" maxlength="1000" placeholder="Was ist dir aufgefallen?">'+escapeHTML(s&&s.notes)+'</textarea></div>'+
      '<div class="hint warning">Bei Schwindel oder Übelkeit die Session beenden. Wiederkehrende Beschwerden ärztlich abklären. Die Bewertung ersetzt keine Diagnose.</div></div>'+
      '<div class="dialog-actions">'+(s?'<button type="button" class="btn btn-danger" data-action="delete-session" data-id="'+escapeHTML(s.id)+'">Löschen</button>':'')+
      '<button type="button" class="btn btn-secondary" data-action="close-dialog">Abbrechen</button><button class="btn btn-primary" type="submit">'+(s?"Änderungen speichern":"Session speichern")+'</button></div><input name="id" type="hidden" value="'+escapeHTML(id||"")+'"></form>');
  }
  function saveTobacco(form) {
    const fd=new FormData(form),brand=plain(fd.get("brand"),120),name=plain(fd.get("name"),160),id=String(fd.get("id")||"");
    if(!brand||!name){toast("Hersteller und Sorte sind Pflichtfelder.",true);return;}
    const weightInput=String(fd.get("quantity_g")??"").trim(),stockInput=String(fd.get("stock")??"1").trim();
    const quantity_g=weightInput===""?0:Number(weightInput),stock=Number(stockInput);
    if((weightInput!==""&&!/^\d+$/.test(weightInput))||!Number.isInteger(quantity_g)||quantity_g<0||quantity_g>1000||
       !/^\d+$/.test(stockInput)||!Number.isInteger(stock)||stock<0||stock>999){
      toast("Packungsgröße muss 0–1000 g und Bestand 0–999 Packungen betragen.",true);return;
    }
    const duplicate=state.tobaccos.find(p=>p.id!==id&&key(p.brand)===key(brand)&&key(p.name)===key(name)&&
      ((p.quantity_g||0)===0||quantity_g===0||p.quantity_g===quantity_g));
    if(duplicate){toast("Diese Sorte ist bereits vorhanden. Bitte den Bestand dort anpassen.",true);return;}
    const existing=state.tobaccos.find(p=>p.id===id);
    // Legacy identifiers are retained when identity is unchanged. No barcode scanning
    // or remote lookups occur; catalog ids are used only for local product association.
    const sameIdentity=existing&&key(existing.brand)===key(brand)&&key(existing.name)===key(name)&&
      (existing.quantity_g||0)===quantity_g;
    const barcodes=sameIdentity?[...(existing.barcodes||[])]:[];
    const selected=CATALOG.find(p=>p.ean===String(fd.get("catalog_ean")||""));
    if(selected&&key(selected.brand)===key(brand)&&key(selected.name)===key(name)&&
       selected.quantity_g===quantity_g&&!barcodes.includes(selected.ean))barcodes.push(selected.ean);
    const conflict=state.tobaccos.find(p=>p.id!==id&&(p.barcodes||[]).some(raw=>barcodes.includes(raw)));
    if(conflict){toast("Dieses Katalogprodukt ist bereits in deiner Sammlung.",true);return;}
    const p={id:existing?existing.id:uid(),barcodes,brand,name,base:normalizeBase(fd.get("base")),flavor:plain(fd.get("flavor"),200),notes:plain(fd.get("notes"),1000),
      quantity_g,stock,opened:stock>0&&fd.get("opened")==="on",createdAt:existing?existing.createdAt:new Date().toISOString()};
    const next={...state,tobaccos:existing?state.tobaccos.map(x=>x.id===p.id?p:x):[...state.tobaccos,p]};
    if(persist(next)){closeDialog(true);toast(existing?"Tabak und Bestand aktualisiert.":"Tabak in deine Sammlung aufgenommen.");}
  }
  function saveSession(form) {
    const fd=new FormData(form),id=String(fd.get("id")||""),tobaccoId=String(fd.get("tobaccoId")||"");
    if(!productById(tobaccoId)){toast("Bitte einen vorhandenen Tabak wählen.",true);return;}
    const severity=Number(fd.get("severity")),taste=Number(fd.get("taste")),duration=fd.get("duration")===""?0:Number(fd.get("duration")),temperature=fd.get("temperature")===""?0:Number(fd.get("temperature"));
    const date=String(fd.get("date")||"");
    if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(severity)||severity<0||severity>3||!Number.isInteger(taste)||taste<1||taste>5||!Number.isInteger(duration)||duration<0||duration>600||!Number.isInteger(temperature)||temperature<0||temperature>350){toast("Bitte die Eingaben prüfen.",true);return;}
    const existing=state.sessions.find(s=>s.id===id);
    const symptoms=severity===0?[]:fd.getAll("symptom").filter(x=>SYMPTOMS.includes(x));
    const bowl=plain(fd.get("bowl"),100);
    const s={id:existing?existing.id:uid(),tobaccoId,date,severity,taste,duration,temperature,bowl,symptoms,notes:plain(fd.get("notes"),1000),createdAt:existing?existing.createdAt:new Date().toISOString()};
    const next={...state,sessions:existing?state.sessions.map(x=>x.id===s.id?s:x):[...state.sessions,s],settings:{...state.settings,bowl}};
    if(persist(next)){closeDialog(true);toast(existing?"Session aktualisiert.":"Session gespeichert.");}
  }
  function deleteTobacco(id) {
    const p=productById(id);if(!p)return;
    const count=sessionsOf(id).length;
    if(!confirm('"'+pName(p)+'" und '+count+' zugehörige Sessions unwiderruflich löschen?'))return;
    const next={...state,tobaccos:state.tobaccos.filter(p=>p.id!==id),sessions:state.sessions.filter(s=>s.tobaccoId!==id)};
    if(persist(next)){closeDialog(true);toast("Tabak und zugehörige Sessions gelöscht.");}
  }
  function deleteSession(id) {
    if(!confirm("Diese Session wirklich dauerhaft löschen?"))return;
    if(persist({...state,sessions:state.sessions.filter(s=>s.id!==id)})){closeDialog(true);toast("Session gelöscht.");}
  }
  function exportData() {
    const payload={...state,exportedAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="tabakjournal-backup-"+localDate()+".json";document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);toast("Backup erstellt. Datei sicher aufbewahren.");
  }
  function mergeData(incoming) {
    const productKey=p=>key(p.brand)+"|"+key(p.name)+"|"+(p.quantity_g||0);
    const productMap=new Map(state.tobaccos.map(p=>[productKey(p),p.id]));
    const rekey={},products=state.tobaccos.slice();
    for(const p of incoming.tobaccos){
      const byId=products.findIndex(x=>x.id===p.id);
      const matched=productMap.get(productKey(p)) ||
        products.find(x=>key(x.brand)===key(p.brand)&&key(x.name)===key(p.name)&&((x.quantity_g||0)===0||(p.quantity_g||0)===0))?.id;
      if(byId>=0){
        const prior=products[byId];
        products[byId]={...p,quantity_g:p.quantity_g||prior.quantity_g||0,
          stock:Math.max(prior.stock??1,p.stock??1),opened:prior.opened||p.opened,
          barcodes:[...new Set([...(prior.barcodes||[]),...(p.barcodes||[])])]};
        rekey[p.id]=p.id;productMap.set(productKey(products[byId]),p.id);
      }else if(matched){
        rekey[p.id]=matched;
        const idx=products.findIndex(x=>x.id===matched),prior=products[idx];
        products[idx]={...prior,quantity_g:prior.quantity_g||p.quantity_g||0,
          stock:Math.max(prior.stock??1,p.stock??1),opened:prior.opened||p.opened,
          barcodes:[...new Set([...(prior.barcodes||[]),...(p.barcodes||[])])]};
        productMap.set(productKey(products[idx]),matched);
      }else{
        products.push(p);productMap.set(productKey(p),p.id);rekey[p.id]=p.id;
      }
    }
    const oldSessions=new Map(state.sessions.map(s=>[s.id,s]));
    for(const entry of incoming.sessions)oldSessions.set(entry.id,{...entry,tobaccoId:rekey[entry.tobaccoId]||entry.tobaccoId});
    return {...state,tobaccos:products,sessions:[...oldSessions.values()]};
  }
  async function importFile(file) {
    if(!file)return;
    if(file.size>8*1024*1024){toast("Datei ist zu groß (maximal 8 MB).",true);return;}
    try {
      const incoming=validate(JSON.parse(await file.text()));
      if(importMode==="replace"&&!confirm("ACHTUNG: Alle vorhandenen Tabake und Sessions werden durch den Dateiinhalt ersetzt. Fortfahren?"))return;
      const next=importMode==="replace"?incoming:mergeData(incoming);
      const checked=validate(next);
      if(persist(checked)){toast("Import erfolgreich: "+incoming.tobaccos.length+" Tabake und "+incoming.sessions.length+" Sessions aus der Datei.");setView("data");}
    } catch (e) {toast("Import abgebrochen: "+(e&&e.message?e.message:"Ungültige Datei."),true);}
  }
  document.addEventListener("click",e=>{
    const b=e.target.closest("[data-view], [data-filter], [data-action]");
    if(!b)return;
    if(b.dataset.view){e.preventDefault?.();setView(b.dataset.view);return;}
    if(b.dataset.filter){filter=b.dataset.filter;render();return;}
    const action=b.dataset.action,id=b.dataset.id;
    if(action==="add-tobacco")tobaccoDialog();
    if(action==="stock-plus"||action==="stock-minus"){
      const item=productById(id);
      if(item){const current=item.stock??1,nextStock=current+(action==="stock-plus"?1:-1);
        if(nextStock>=0&&nextStock<=999&&persist({...state,tobaccos:state.tobaccos.map(p=>p.id===id?{...p,stock:nextStock,opened:nextStock>0&&p.opened}:p)}))toast("Bestand aktualisiert.");}
    }
    if(action==="edit-tobacco")tobaccoDialog(id);
    if(action==="add-session")sessionDialog(null,id);
    if(action==="edit-session")sessionDialog(id);
    if(action==="close-dialog")closeDialog();
    if(action==="choose-suggestion"){
      const item=CATALOG[Number(b.dataset.index)];
      if(item&&$("f-brand")&&$("f-name")){
        $("f-brand").value=item.brand;$("f-name").value=item.name;
        $("f-base").value=item.base;$("f-flavor").value=item.flavor;
        $("f-quantity_g").value=String(item.quantity_g);
        $("f-catalog-ean").value=item.ean;
        $("catalogResults").innerHTML="";
        $("catalogSelection").textContent="Produktdaten übernommen: "+item.brand+" · "+item.name+" · "+item.quantity_g+" g";
      }
    }
    if(action==="delete-tobacco")deleteTobacco(id);
    if(action==="delete-session")deleteSession(id);
    if(action==="export")exportData();
    if(action==="import-merge"||action==="import-replace"){importMode=action==="import-merge"?"merge":"replace";$("importFile").click();}
    if(action==="clear-all"){
      if(!confirm("Alle "+state.tobaccos.length+" Tabake und "+state.sessions.length+" Sessions unwiderruflich löschen? Vorher ein Backup exportieren."))return;
      if(persist(emptyState()))toast("Alle Daten gelöscht.");
    }
  });
  document.addEventListener("submit",e=>{
    if(e.target.id==="tobacco-form"){e.preventDefault();saveTobacco(e.target);}
    if(e.target.id==="session-form"){e.preventDefault();saveSession(e.target);}
  });
  document.addEventListener("change",e=>{
    if(e.target.id==="importFile"){const file=e.target.files&&e.target.files[0];importFile(file);e.target.value="";}
  });
  document.addEventListener("input",e=>{
    if(e.target.id==="searchBar"){
      query=e.target.value;const pos=e.target.selectionStart;render();const replacement=$("searchBar");if(replacement){replacement.focus();replacement.setSelectionRange(pos,pos);}
    }
  });
  $("editorDialog").addEventListener("click",e=>{if(e.target===$("editorDialog"))closeDialog();});
  $("editorDialog").addEventListener("cancel",e=>{e.preventDefault();closeDialog();});
  load();render();
})();