/* Tabakjournal – a single personal rating per tobacco, local-first and static. */
"use strict";
(function () {
  const STORAGE_KEY="tabakjournal:v1";
  const APP_ID="tabakjournal",VERSION=1;
  const SYMPTOMS=["Schwindel","Übelkeit","Kopfschmerzen","Herzrasen","Andere Beschwerden"];
  const TOLERABILITY=["Sehr schlecht","Schlecht","Mittel","Gut","Sehr gut"];
  const PRODUCT_CATALOG=window.TabakCatalog?.products||[];
  const grouped=new Map();
  for(const item of PRODUCT_CATALOG){
    const group=[item.brand,item.name,item.quantity_g].join("|").toLocaleLowerCase("de");
    const existing=grouped.get(group);
    if(!existing)grouped.set(group,{brand:item.brand,name:item.name,quantity_g:item.quantity_g,
      base:item.base||"Unbekannt",flavor:item.flavor||"",ean:item.ean,aliases:[...(item.aliases||[])]});
    else {
      if(existing.base==="Unbekannt"&&item.base&&item.base!=="Unbekannt")existing.base=item.base;
      if(!existing.flavor&&item.flavor)existing.flavor=item.flavor;
      existing.aliases=[...new Set([...existing.aliases,...(item.aliases||[])])];
    }
  }
  const CATALOG=[...grouped.values()].sort((a,b)=>
    a.brand.localeCompare(b.brand,"de")||a.name.localeCompare(b.name,"de")||a.quantity_g-b.quantity_g);
  const BRANDS=[...new Set(CATALOG.map(p=>p.brand))].sort((a,b)=>a.localeCompare(b,"de"));
  const $=id=>document.getElementById(id);
  const emptyState=()=>({app:APP_ID,version:VERSION,tobaccos:[],sessions:[],settings:{bowl:""}});
  let state=emptyState(),view="collection",query="",filter="all",catalogQuery="",theme="dark",importMode="merge",dialogBaseline=null,toastTimer,storageError="";
  const escapeHTML=value=>String(value==null?"":value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const plain=(value,max=300)=>typeof value==="string"?value.trim().slice(0,max):"";
  const key=value=>String(value??"").toLocaleLowerCase("de").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"");
  const uid=()=>typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
  const localDate=()=>{const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);};
  const productById=id=>state.tobaccos.find(p=>p.id===id);
  const productName=p=>p?p.brand+" · "+p.name:"Unbekannter Tabak";
  const icon=name=>'<svg class="ui-icon" aria-hidden="true" focusable="false"><use href="#i-'+name+'"></use></svg>';
  const SYMPTOM_ICONS={
    "Schwindel":"dizziness",
    "Übelkeit":"nausea",
    "Kopfschmerzen":"headache",
    "Herzrasen":"palpitations",
    "Andere Beschwerden":"other"
  };
  const symptomIcon=symptom=>{
    const name=SYMPTOM_ICONS[symptom];
    return name?'<span class="symptom-art symptom-art--'+name+'" aria-hidden="true"></span>':"";
  };
  function applyTheme(next,persistChoice=false){
    theme=next==="light"?"light":"dark";
    document.documentElement?.setAttribute?.("data-theme",theme);
    const control=document.querySelector?.(".theme-toggle");
    if(control){
      control.setAttribute("aria-label",theme==="dark"?"Helles Design aktivieren":"Dunkles Design aktivieren");
      control.setAttribute("title",theme==="dark"?"Helles Design aktivieren":"Dunkles Design aktivieren");
      const glyph=control.querySelector?.("use");
      if(glyph)glyph.setAttribute("href",theme==="dark"?"#i-moon":"#i-sun");
    }
    if(persistChoice){
      try{localStorage.setItem("tabakjournal:theme",theme);}catch{ /* Theme must not affect ratings. */ }
    }
  }
  function readTheme(){
    try{return localStorage.getItem("tabakjournal:theme")==="light"?"light":"dark";}
    catch{return "dark";}
  }
  const normalizedBase=value=>["Virginia","Dark Blend","Unbekannt"].includes(value)?value:"Unbekannt";
  const ratingValue=value=>value==null||value===""?null:Number(value);
  function defaultReview(){return {tolerability:null,taste:null,symptoms:[],notes:"",updatedAt:""};}
  function normalizeReview(value){
    const source=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
    const tolerability=ratingValue(source.tolerability),taste=ratingValue(source.taste);
    if(tolerability!==null&&(!Number.isInteger(tolerability)||tolerability<1||tolerability>5))
      throw new Error("Verträglichkeit muss zwischen 1 und 5 liegen.");
    if(taste!==null&&(!Number.isInteger(taste)||taste<1||taste>5))
      throw new Error("Geschmacksbewertung muss zwischen 1 und 5 liegen.");
    if(source.symptoms!=null&&!Array.isArray(source.symptoms))throw new Error("Ungültige Beschwerdenangaben.");
    const symptoms=[...new Set((source.symptoms||[]).filter(x=>SYMPTOMS.includes(x)))];
    return {tolerability,taste,symptoms,notes:plain(source.notes,1000),updatedAt:plain(source.updatedAt,40)};
  }
  function normalizeBarcode(value){
    const code=String(value??"").trim().replace(/[\s-]/g,"");
    if(!/^(?:\d{8}|\d{12}|\d{13}|\d{14})$/.test(code))return null;
    let sum=0,multiplier=3;
    for(let i=code.length-2;i>=0;i--){sum+=Number(code[i])*multiplier;multiplier=multiplier===3?1:3;}
    if((10-sum%10)%10!==Number(code.at(-1)))return null;
    return code.length===12?"0"+code:code;
  }
  function parseBarcodes(values){
    const input=Array.isArray(values)?values:String(values||"").split(/[,;\s]+/);
    const found=[];
    for(const item of input){
      if(!String(item||"").trim())continue;
      const code=normalizeBarcode(item);
      if(!code)throw new Error("Ungültige historische GTIN in Backup.");
      if(!found.includes(code))found.push(code);
    }
    if(found.length>30)throw new Error("Zu viele Produktkennungen.");
    return found;
  }
  function validate(raw){
    if(!raw||raw.app!==APP_ID||raw.version!==VERSION||!Array.isArray(raw.tobaccos)||
      (raw.sessions!==undefined&&!Array.isArray(raw.sessions)))throw new Error("Nicht unterstütztes Backup-Format.");
    if(raw.tobaccos.length>5000||(raw.sessions||[]).length>50000)throw new Error("Backup zu groß.");
    const productIds=new Set(),codes=new Set(),tobaccos=[];
    for(const item of raw.tobaccos){
      if(!item||typeof item.id!=="string"||!/^[\w-]{1,80}$/.test(item.id)||
         productIds.has(item.id)||!plain(item.brand,120)||!plain(item.name,160))throw new Error("Ungültige Tabakdaten.");
      productIds.add(item.id);
      const barcodes=parseBarcodes(item.barcodes||[]);
      for(const code of barcodes){if(codes.has(code))throw new Error("Produktkennung mehrfach zugeordnet.");codes.add(code);}
      const quantity_g=item.quantity_g??0,stock=item.stock??1,opened=item.opened??false;
      if(!Number.isInteger(quantity_g)||quantity_g<0||quantity_g>1000||
         !Number.isInteger(stock)||stock<0||stock>999||typeof opened!=="boolean")throw new Error("Ungültige historische Bestandsdaten.");
      tobaccos.push({
        id:item.id,brand:plain(item.brand,120),name:plain(item.name,160),
        base:normalizedBase(item.base),flavor:plain(item.flavor,200),
        quantity_g,stock,opened:stock>0&&opened,barcodes,notes:plain(item.notes,1000),
        review:normalizeReview(item.review),createdAt:plain(item.createdAt,40)
      });
    }
    // Historical sessions stay in local data and JSON backups for lossless migration;
    // there is deliberately no session UI, aggregation, or automatic inferred rating.
    const sessions=[],sessionIds=new Set();
    for(const item of raw.sessions||[]){
      if(!item||typeof item.id!=="string"||!/^[\w-]{1,80}$/.test(item.id)||
        sessionIds.has(item.id)||!productIds.has(item.tobaccoId)||
        !/^\d{4}-\d{2}-\d{2}$/.test(item.date)||!Number.isInteger(item.severity)||
        item.severity<0||item.severity>3||!Number.isInteger(item.taste)||item.taste<1||item.taste>5)
        throw new Error("Ungültige historische Sessiondaten.");
      sessionIds.add(item.id);
      sessions.push({id:item.id,tobaccoId:item.tobaccoId,date:item.date,severity:item.severity,taste:item.taste,
        duration:Number.isFinite(item.duration)?Math.max(0,Math.min(600,Math.round(item.duration))):0,
        temperature:Number.isFinite(item.temperature)?Math.max(0,Math.min(350,Math.round(item.temperature))):0,
        bowl:plain(item.bowl,100),symptoms:Array.isArray(item.symptoms)?[...new Set(item.symptoms.filter(x=>["Schwindel","Übelkeit","Kopfschmerzen","Herzrasen","Andere"].includes(x)))]:[],
        notes:plain(item.notes,1000),createdAt:plain(item.createdAt,40)});
    }
    return {app:APP_ID,version:VERSION,tobaccos,sessions,settings:{bowl:plain(raw.settings?.bowl,100)}};
  }
  function notice(message,isError=false){
    const node=$("toast");if(!node)return;
    node.textContent=message;node.classList.toggle("error",isError);node.classList.add("visible");
    clearTimeout(toastTimer);toastTimer=setTimeout(()=>node.classList.remove("visible"),4000);
  }
  function persist(next){
    try{
      const checked=validate(next);
      localStorage.setItem(STORAGE_KEY,JSON.stringify(checked));
      state=checked;storageError="";render();return true;
    }catch(error){
      storageError="Daten konnten nicht gespeichert werden.";
      render();notice(storageError+" "+error.message,true);return false;
    }
  }
  function load(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(raw)state=validate(JSON.parse(raw));
    }catch(error){
      storageError="Vorhandene Browserdaten konnten nicht gelesen werden.";
      // Do not overwrite corrupted or unsupported storage on subsequent actions.
      state=null;
    }
  }
  function button(label,action,id="",variant="primary"){
    return '<button class="btn btn-'+variant+'" type="button" data-action="'+action+'"'+
      (id?' data-id="'+escapeHTML(id)+'"':'')+'>'+escapeHTML(label)+'</button>';
  }
  function shishaScale(value){
    return '<span class="shisha-scale" aria-hidden="true">'+
      Array.from({length:5},(_,i)=>'<svg class="shisha-mark '+(i<value?'is-filled':'is-muted')+'" viewBox="0 0 32 36" focusable="false"><use href="#i-shisha"></use></svg>').join("")+
    '</span>';
  }
  function ratingTag(review){
    const value=review?.tolerability;
    if(value==null)return '<div class="rating-summary unrated" role="group" aria-label="Verträglichkeit: noch nicht bewertet">'+
      shishaScale(0)+'<span class="rating-summary-bottom"><span class="rating-summary-label">Noch nicht bewertet</span></span></div>';
    const tone=value>=4?"good":value<=2?"poor":"neutral";
    const fullLabel=["Sehr schlecht verträglich","Schlecht verträglich","Mittelmäßig verträglich","Gut verträglich","Sehr gut verträglich"][value-1];
    return '<div class="rating-summary '+tone+'" role="group" aria-label="Verträglichkeit: '+value+' von 5, '+escapeHTML(fullLabel)+'">'+
      shishaScale(value)+
      '<span class="rating-summary-bottom"><span class="rating-summary-label">'+escapeHTML(TOLERABILITY[value-1])+'</span>'+
      '<span class="rating-count">'+value+' von 5</span></span></div>';
  }
  function card(p){
    const r=p.review||defaultReview();
    const details=[p.quantity_g?p.quantity_g+" g":"",p.base!=="Unbekannt"?p.base:"",p.flavor].filter(Boolean);
    const action=r.tolerability==null?"Jetzt bewerten":"Bewertung bearbeiten";
    const tone=r.tolerability==null?"unrated":r.tolerability>=4?"good":r.tolerability<=2?"poor":"neutral";
    const symptoms=r.symptoms.length?
      '<div class="review-symptoms" role="group" aria-label="Beschwerden: '+escapeHTML(r.symptoms.join(", "))+'">'+
      r.symptoms.map(sym=>'<span class="symptom-item" title="'+escapeHTML(sym)+'"><span class="symptom-mini">'+symptomIcon(sym)+'</span>'+
        '<span class="symptom-label">'+escapeHTML(sym)+'</span></span>').join("")+
      '</div>':'<span class="no-symptoms">Keine Beschwerden erfasst</span>';
    return '<article class="tobacco-card rate-'+tone+'">'+
      '<div class="card-head">'+

        '<div class="card-identity">'+
          '<div class="card-brand">'+escapeHTML(p.brand)+'</div>'+
          '<h2>'+escapeHTML(p.name)+'</h2>'+
          '<div class="card-meta">'+(details.length?escapeHTML(details.join(" · ")):"Produktdetails nicht hinterlegt")+'</div>'+
        '</div>'+
        '<div class="card-side">'+
          '<div class="card-rating">'+ratingTag(r)+'</div>'+
          '<div class="card-symptoms">'+symptoms+'</div>'+
          '<div class="card-actions"><button class="card-edit" type="button" data-action="edit-tobacco" data-id="'+escapeHTML(p.id)+'"'+
            ' aria-label="'+escapeHTML(action+": "+p.brand+" "+p.name)+'" title="'+escapeHTML(action)+'">'+
            icon(r.tolerability==null?"plus":"edit")+'</button></div>'+
        '</div>'+
      '</div>'+
      ((r.taste!=null||r.notes)?'<div class="card-extra-row">'+
          (r.taste!=null?'<span class="rating-secondary">Geschmack <strong>'+r.taste+'/5</strong></span>':"")+
          (r.notes?'<p class="review-notes">'+escapeHTML(r.notes)+'</p>':"")+
        '</div>':"")+
    '</article>';
  }
  function matchingProducts(){
    if(!state)return [];
    return state.tobaccos.filter(p=>
      key([p.brand,p.name,p.flavor,p.review?.notes||""].join(" ")).includes(key(query))&&
      (filter==="all"||(filter==="good"&&p.review?.tolerability>=4)||
       (filter==="bad"&&p.review?.tolerability!=null&&p.review.tolerability<=2)||
       (filter==="unrated"&&p.review?.tolerability==null))
    ).sort((a,b)=>a.brand.localeCompare(b.brand,"de")||a.name.localeCompare(b.name,"de"));
  }
  function collectionCards(products){
    return products.length?'<div class="cards">'+products.map(card).join("")+'</div>':
      '<div class="panel"><div class="empty"><div class="empty-icon">'+icon("collection")+'</div><strong>'+
      (state.tobaccos.length?"Keine passenden Tabake":"Noch kein Tabak erfasst")+'</strong><p>'+
      (state.tobaccos.length?"Filter oder Suche ändern.":"Füge deine erste Sorte hinzu und bewerte ihre Verträglichkeit.")+'</p>'+
      (!state.tobaccos.length?button("Ersten Tabak hinzufügen","add-tobacco"):"")+'</div></div>';
  }
  function collection(){
    if(!state)return '<div class="hint warning">Deine bisherigen Daten konnten nicht sicher gelesen werden. Bitte Browserdaten nicht löschen oder überschreiben und zuerst eine Sicherung der vorhandenen Daten erstellen.</div>';
    const products=matchingProducts();
    const rated=state.tobaccos.filter(p=>p.review?.tolerability!=null).length;
    return '<header class="page-head"><div><h1>Meine Tabake</h1><p>Wie gut verträgst du deine Tabaksorten? Halte deine persönliche Bewertung fest.</p></div></header>'+
      '<div class="collection-meta"><strong>'+state.tobaccos.length+' Sorten</strong><span> · '+rated+' bewertet</span></div>'+
      '<div class="toolbar"><div class="search-wrap"><input type="search" class="search" id="searchBar" value="'+escapeHTML(query)+'" placeholder="Hersteller, Sorte oder Geschmack" aria-label="Meine Tabake durchsuchen" autocomplete="off"></div>'+
      '<div class="filters" role="group" aria-label="Bewertung filtern">'+[
        ["all","Alle"],["good","Gut verträglich"],["bad","Schlecht verträglich"],["unrated","Unbewertet"]
      ].map(pair=>'<button type="button" class="filter '+(filter===pair[0]?'active':'')+'" data-filter="'+pair[0]+'" aria-pressed="'+(filter===pair[0])+'">'+pair[1]+'</button>').join("")+'</div></div>'+
      '<div id="resultsStatus" class="results-count" role="status" aria-live="polite">'+products.length+' '+(products.length===1?"Sorte":"Sorten")+' angezeigt</div>'+
      '<div id="collectionResults">'+collectionCards(products)+'</div>'+
      '<p class="smallprint">'+icon("info")+'<span>Verträglichkeit ist eine persönliche Einschätzung, keine medizinische Diagnose. Bei Beschwerden den Konsum beenden und wiederkehrende Symptome ärztlich abklären.</span></p>';
  }
  function refreshCollectionResults(){
    const results=$("collectionResults"),status=$("resultsStatus");
    if(!results){render();return;}
    const products=matchingProducts();
    results.innerHTML=collectionCards(products);
    if(status)status.textContent=products.length+' '+(products.length===1?"Sorte":"Sorten")+' angezeigt';
    document.querySelectorAll(".filter").forEach(el=>{
      const active=el.dataset.filter===filter;
      el.classList.toggle("active",active);
      el.setAttribute?.("aria-pressed",String(active));
    });
  }
  function catalogResults(){
    const term=key(catalogQuery);
    const found=term?CATALOG.filter(p=>key([p.brand,p.name,p.flavor,...p.aliases].join(" ")).includes(term)):CATALOG;
    const shown=found.slice(0,60);
    return '<p class="results-count">'+found.length+' Sorten im lokalen Katalog'+(found.length>shown.length?' · erste '+shown.length+' angezeigt':"")+'</p>'+
      '<div class="catalog-grid">'+shown.map(p=>{
        const index=CATALOG.indexOf(p);
        return '<article class="catalog-entry"><div><strong>'+escapeHTML(p.brand)+'</strong><h2>'+escapeHTML(p.name)+'</h2>'+
          '<p>'+escapeHTML([p.quantity_g?p.quantity_g+" g":"",p.base!=="Unbekannt"?p.base:"",p.flavor].filter(Boolean).join(" · "))+'</p></div>'+
          '<button type="button" class="btn btn-secondary" data-action="add-catalog-product" data-index="'+index+'">Bewerten</button></article>';
      }).join("")+'</div>';
  }
  function catalogView(){
    return '<header class="page-head"><h1>Katalog</h1><p>Lokale Tabaksorten durchsuchen und direkt zur Bewertung übernehmen.</p></header>'+
      '<div class="search-wrap catalog-search"><input type="search" class="search" id="catalogSearch" value="'+escapeHTML(catalogQuery)+'"'+
      ' placeholder="Hersteller, Sorte oder Geschmack" aria-label="Tabakkatalog durchsuchen" autocomplete="off"></div>'+
      '<div id="catalogViewResults">'+catalogResults()+'</div>';
  }
  function settingsView(){
    return '<header class="page-head"><h1>Einstellungen</h1><p>Darstellung und lokale Datensicherung verwalten.</p></header>'+
      '<div class="data-grid settings-grid"><section class="data-tile"><h3>Darstellung</h3><p>Wähle das helle oder dunkle Design. Die Auswahl wird nur in diesem Browser gespeichert.</p>'+
        '<div class="btn-row"><button type="button" class="btn btn-secondary" data-action="set-theme" data-theme="dark" aria-pressed="'+(theme==="dark")+'">Dunkel</button>'+
        '<button type="button" class="btn btn-secondary" data-action="set-theme" data-theme="light" aria-pressed="'+(theme==="light")+'">Hell</button></div></section>'+
        '<section class="data-tile"><h3>Datensicherung</h3><p>Tabake und persönliche Bewertungen bleiben lokal auf diesem Gerät. Regelmäßig sichern.</p>'+
        '<button class="btn btn-secondary" type="button" data-view="data">'+icon("data")+' Backup verwalten</button></section></div>';
  }
  function refreshCatalogResults(){
    const target=$("catalogViewResults");
    if(target)target.innerHTML=catalogResults();
  }
  function selectCatalogProduct(p){
    if(!p)return;
    tobaccoDialog();
    const brand=$("f-brand"),name=$("f-name");
    if(!brand||!name)return;
    brand.value=p.brand;name.value=p.name;
    $("f-base").value=p.base;
    $("f-flavor").value=p.flavor;
    $("f-quantity_g").value=String(p.quantity_g||"");
    $("f-catalog-ean").value=p.ean||"";
    const results=$("catalogResults");if(results)results.innerHTML="";
    const info=$("catalogSelection");if(info)info.textContent="Übernommen: "+p.brand+" · "+p.name;
  }
  function dataView(){
    if(!state)return '<header class="page-head"><h1>Backup wiederherstellen</h1><p>Deine gespeicherten Daten konnten nicht gelesen werden. Sie wurden nicht verändert.</p></header>'+
      '<div class="hint warning">Sichere zuerst die unveränderten Rohdaten, bevor du ein gültiges Backup einspielst. Zusammenführen ist nicht möglich, solange der vorhandene Speicher beschädigt ist.</div>'+
      '<div class="data-grid"><section class="data-tile"><h3>Vorhandene Rohdaten sichern</h3><p>Speichert die ursprünglichen Browserdaten als Textdatei, damit du sie später prüfen oder retten kannst.</p>'+
      button("Rohdaten herunterladen","export-raw")+'</section>'+
      '<section class="data-tile"><h3>Gültiges Backup wiederherstellen</h3><p>Ersetzt die nicht lesbaren Browserdaten erst nach ausdrücklicher Bestätigung durch ein geprüftes JSON-Backup.</p>'+
      '<button class="btn btn-primary" type="button" data-action="import-replace">JSON-Backup auswählen</button>'+
      '<input id="importFile" type="file" accept=".json,application/json" hidden></section></div>';
    return '<header class="page-head"><div><h1>Backup</h1><p>Deine Bewertungen bleiben auf diesem Gerät. Sichere sie regelmäßig als JSON-Datei.</p></div></header>'+
      '<div class="data-grid">'+
      '<section class="data-tile"><h3>Sicherung erstellen</h3><p>Exportiert '+state.tobaccos.length+' Tabake mit Bewertungen und alle bisherigen Daten. Historische Sessions bleiben im Backup erhalten, werden aber nicht mehr in der App angezeigt.</p>'+
      button("JSON-Backup herunterladen","export")+'</section>'+
      '<section class="data-tile"><h3>Sicherung wiederherstellen</h3><p>Bestehendes Backup zusammenführen oder den aktuellen Bestand ersetzen. Frühere Backups bleiben verwendbar.</p>'+
      '<div class="btn-row"><button class="btn btn-secondary" data-action="import-merge">Zusammenführen</button><button class="btn btn-danger" data-action="import-replace">Ersetzen</button></div>'+
      '<input id="importFile" type="file" accept=".json,application/json" hidden></section></div>'+
      '<p class="smallprint">Frühere Daten aus älteren App-Versionen bleiben im Backup enthalten, auch wenn sie nicht mehr in der Oberfläche erscheinen.</p>'+
      '<div class="data-tile archive-tile"><h3>Alle lokalen Daten löschen</h3><p>Dies entfernt Tabake, Bewertungen und frühere Daten dauerhaft aus diesem Browser. Erstelle vorher ein Backup.</p>'+
      '<button class="btn btn-danger" data-action="clear-all">Alle Daten löschen</button></div>';
  }
  function render(){
    $("saveStatus").textContent=storageError||"Lokal gespeichert";
    $("saveStatus").classList.toggle("error",!!storageError);
    document.querySelectorAll(".topbar [data-view]").forEach(el=>{
      const active=el.dataset.view===view;
      el.classList.toggle("is-active",active);
      if(active)el.setAttribute?.("aria-current","page");else el.removeAttribute?.("aria-current");
    });
    $("screen").innerHTML=view==="collection"?collection():view==="catalog"?catalogView():view==="settings"?settingsView():dataView();
  }
  function setView(next){
    if(!["collection","catalog","data","settings"].includes(next))return;
    view=next;query="";filter="all";catalogQuery="";render();
    window.scrollTo?.({top:0,behavior:window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches?"auto":"smooth"});
    $("screen").focus?.({preventScroll:true});
  }
  function snapshot(){
    const form=$("editorDialog").querySelector?.("form");
    return form?JSON.stringify([...new FormData(form).entries()]):null;
  }
  function dialog(markup){
    $("dialogContent").innerHTML=markup;
    const node=$("editorDialog");if(!node.open)node.showModal();
    dialogBaseline=snapshot();
  }
  function closeDialog(force=false){
    const node=$("editorDialog");if(!node.open)return;
    if(!force&&dialogBaseline!==null&&snapshot()!==dialogBaseline&&!confirm("Ungespeicherte Änderungen verwerfen?"))return;
    node.close();dialogBaseline=null;
  }
  function input(name,label,value,placeholder="",required=false,type="text",extra=""){
    return '<div class="field"><label for="f-'+name+'">'+escapeHTML(label)+'</label>'+
      '<input id="f-'+name+'" name="'+name+'" type="'+type+'" value="'+escapeHTML(value??"")+
      '" placeholder="'+escapeHTML(placeholder)+'" '+(required?'required ':'')+extra+'></div>';
  }
  function tobaccoDialog(id){
    if(!state){notice("Gespeicherte Daten konnten nicht sicher gelesen werden.",true);return;}
    const p=productById(id),r=p?.review||defaultReview();
    const entry=Boolean(p),hasDetails=Boolean(r.taste!=null||r.symptoms.length||r.notes||p?.notes);
    dialog('<div class="dialog-head"><div><h2 id="dialogTitle">'+(entry?"Bewertung bearbeiten":"Tabak hinzufügen")+'</h2>'+
      '<p>Wähle die Sorte und bewerte vor allem ihre Verträglichkeit.</p></div>'+
      '<button class="close-btn" type="button" data-action="close-dialog" aria-label="Schließen">×</button></div>'+
      '<form class="editor-form" id="tobacco-form" method="post">'+
      '<div class="fields">'+
      input("brand","Hersteller *",p?.brand||"","z. B. Hookain",true,"text",'list="brandList" maxlength="120" autocomplete="off"')+
      '<datalist id="brandList">'+BRANDS.map(b=>'<option value="'+escapeHTML(b)+'"></option>').join("")+'</datalist>'+
      input("name","Sorte *",p?.name||"","z. B. White Caek",true,"text",'maxlength="160" autocomplete="off"')+
      '<p class="field-help">Während der Eingabe erscheinen passende Produkte aus dem Katalog.</p>'+
      '<div class="catalog-results" id="catalogResults" aria-label="Produktvorschläge"></div>'+
      '<div class="field-help" role="status" aria-live="polite" id="catalogSelection"></div>'+
      '<input type="hidden" id="f-catalog-ean" name="catalog_ean" value="">'+
      '<fieldset class="rating-block"><legend>Verträglichkeit <span class="required-star" aria-label="Pflichtfeld">*</span></legend>'+
      '<p id="ratingHelp">Wie gut verträgst du den Tabak? 1 = sehr schlecht, 5 = sehr gut.</p>'+
      '<div class="rating-options">'+
      TOLERABILITY.map((label,i)=>'<label class="rating-option"><input type="radio" name="tolerability" value="'+(i+1)+'" aria-label="'+(i+1)+' von 5: '+escapeHTML(label)+'"'+
      (r.tolerability===i+1?' checked':'')+(i===0?' required':'')+'><svg class="rating-choice-shisha" aria-hidden="true" focusable="false"><use href="#i-shisha"></use></svg><span class="rating-score">'+(i+1)+'</span><span class="rating-name">'+label+'</span></label>').join("")+
      '</div><p id="ratingFeedback" class="rating-feedback" role="status" aria-live="polite">'+
      (r.tolerability==null?"Bitte einen Wert auswählen.":"Ausgewählt: "+r.tolerability+" von 5 · "+TOLERABILITY[r.tolerability-1])+'</p></fieldset>'+
      '<details class="optional-details"'+(hasDetails?' open':'')+'><summary>Weitere Angaben <span>optional</span></summary><div class="optional-content">'+
      '<div class="field-row">'+input("quantity_g","Packungsgröße (g)",p?.quantity_g||"","z. B. 200",false,"number",'min="0" max="1000" step="1" inputmode="numeric"')+
      '<div class="field"><label for="f-base">Grundtabak</label><select id="f-base" name="base">'+
      ["Unbekannt","Virginia","Dark Blend"].map(v=>'<option value="'+v+'"'+(v===(p?.base||"Unbekannt")?' selected':'')+'>'+v+'</option>').join("")+'</select></div></div>'+
      input("flavor","Geschmacksrichtung",p?.flavor||"","z. B. Minze, Traube",false,"text",'maxlength="200"')+
      '<div class="field"><label for="f-taste">Geschmack</label><select id="f-taste" name="taste"><option value="">Keine Bewertung</option>'+
      [1,2,3,4,5].map(n=>'<option value="'+n+'"'+(r.taste===n?' selected':'')+'>'+n+' von 5</option>').join("")+'</select></div>'+
      '<fieldset class="symptom-block"><legend>Beobachtete Beschwerden</legend><p>Mehrfachauswahl möglich.</p><div class="symptom-grid">'+
      SYMPTOMS.map(sym=>'<label class="symptom-choice"><input type="checkbox" name="symptom" value="'+escapeHTML(sym)+'"'+
      (r.symptoms.includes(sym)?' checked':'')+'>'+symptomIcon(sym)+'<span class="symptom-text">'+escapeHTML(sym)+'</span></label>').join("")+'</div></fieldset>'+
      '<div class="field"><label for="f-review-notes">Persönliche Notiz</label>'+
      '<textarea id="f-review-notes" name="review_notes" maxlength="1000" placeholder="Was ist dir bei der Verträglichkeit aufgefallen?">'+escapeHTML(r.notes||(r.updatedAt?"":p?.notes||""))+'</textarea></div>'+
      (entry?'<button class="btn btn-danger" type="button" data-action="delete-tobacco" data-id="'+escapeHTML(p.id)+'">Tabak löschen</button>':'')+
      '</div></details>'+
      '<p class="review-disclaimer">Eine persönliche Bewertung ist kein medizinischer Befund.</p></div>'+
      '<div class="dialog-actions"><button class="btn btn-secondary" type="button" data-action="close-dialog">Abbrechen</button>'+
      '<button class="btn btn-primary" type="submit">'+(entry?"Änderungen speichern":"Tabak speichern")+'</button></div>'+
      '<input type="hidden" name="tobacco_id" value="'+escapeHTML(p?.id||"")+'"></form>');
    initAutocomplete();
  }
  function initAutocomplete(){
    const brand=$("f-brand"),name=$("f-name"),results=$("catalogResults");
    if(!brand||!name||!results)return;
    const update=()=>{
      if($("f-catalog-ean"))$("f-catalog-ean").value="";
      if($("catalogSelection"))$("catalogSelection").textContent="";
      const b=key(brand.value),n=key(name.value);
      if(!b&&!n){results.innerHTML="";return;}
      const matches=CATALOG.filter(p=>(!b||key(p.brand).includes(b))&&
        (!n||[p.name,...p.aliases].some(label=>key(label).includes(n)))).slice(0,8);
      const status=$("catalogSelection");
      if(status)status.textContent=matches.length?matches.length+" Produktvorschläge. Mit Tab auswählen.":"Kein Katalogtreffer. Du kannst den Tabak manuell eintragen.";
      results.innerHTML=matches.map(p=>'<button type="button" class="catalog-result" data-action="choose-suggestion" data-index="'+CATALOG.indexOf(p)+'">'+
        '<span><strong>'+escapeHTML(p.brand)+'</strong> · '+escapeHTML(p.name)+'</span><small>'+
        escapeHTML([p.quantity_g+" g",p.base!=="Unbekannt"?p.base:"",p.flavor].filter(Boolean).join(" · "))+'</small></button>').join("");
    };
    brand.addEventListener("input",update);name.addEventListener("input",update);update();
  }
  function saveTobacco(form){
    if(!state)return;
    const fd=new FormData(form),id=String(fd.get("tobacco_id")||""),brand=plain(fd.get("brand"),120),name=plain(fd.get("name"),160);
    if(!brand||!name){notice("Hersteller und Sorte sind Pflichtfelder.",true);return;}
    const rawWeight=String(fd.get("quantity_g")??"").trim(),quantity_g=rawWeight===""?0:Number(rawWeight);
    if((rawWeight!==""&&!/^\d+$/.test(rawWeight))||!Number.isInteger(quantity_g)||quantity_g<0||quantity_g>1000){
      notice("Bitte eine gültige Packungsgröße zwischen 0 und 1000 g eintragen.",true);return;
    }
    const value=Number(fd.get("tolerability"));
    if(!Number.isInteger(value)||value<1||value>5){notice("Bitte die Verträglichkeit von 1 bis 5 bewerten.",true);return;}
    const taste=ratingValue(fd.get("taste"));
    if(taste!==null&&(!Number.isInteger(taste)||taste<1||taste>5)){notice("Bitte die Geschmacksbewertung prüfen.",true);return;}
    const duplicate=state.tobaccos.find(p=>p.id!==id&&key(p.brand)===key(brand)&&key(p.name)===key(name)&&
      ((p.quantity_g||0)===quantity_g||(p.quantity_g||0)===0||quantity_g===0));
    if(duplicate){notice("Diese Sorte ist schon vorhanden. Bitte ihre Bewertung bearbeiten.",true);return;}
    const existing=productById(id);
    const sameIdentity=existing&&key(existing.brand)===key(brand)&&key(existing.name)===key(name)&&
      existing.quantity_g===quantity_g;
    const barcodes=sameIdentity?[...(existing.barcodes||[])]:[];
    const selected=CATALOG.find(p=>p.ean===String(fd.get("catalog_ean")||""));
    if(selected&&key(selected.brand)===key(brand)&&key(selected.name)===key(name)&&selected.quantity_g===quantity_g){
      const used=state.tobaccos.some(p=>p.id!==id&&(p.barcodes||[]).includes(selected.ean));
      if(used){notice("Dieses Produkt ist bereits in deiner Sammlung.",true);return;}
      if(!barcodes.includes(selected.ean))barcodes.push(selected.ean);
    }
    const review={
      tolerability:value,taste,symptoms:[...new Set(fd.getAll("symptom").filter(s=>SYMPTOMS.includes(s)))],
      notes:plain(fd.get("review_notes"),1000),updatedAt:new Date().toISOString()
    };
    const product={
      id:existing?.id||uid(),brand,name,base:normalizedBase(fd.get("base")),flavor:plain(fd.get("flavor"),200),
      quantity_g,barcodes,stock:existing?.stock??1,opened:existing?.opened??false,
      notes:existing?.notes||"",review,createdAt:existing?.createdAt||new Date().toISOString()
    };
    const next={...state,tobaccos:existing?state.tobaccos.map(p=>p.id===id?product:p):[...state.tobaccos,product]};
    if(persist(next)){closeDialog(true);notice(existing?"Bewertung aktualisiert.":"Tabak und Bewertung gespeichert.");}
  }
  function deleteTobacco(id){
    if(!state)return;
    const product=productById(id);if(!product)return;
    const historical=state.sessions.filter(s=>s.tobaccoId===id).length;
    if(!confirm('"'+productName(product)+'" mit Bewertung'+(historical?' und '+historical+' älteren Protokollen':'')+' dauerhaft löschen?'))return;
    const next={...state,tobaccos:state.tobaccos.filter(p=>p.id!==id),sessions:state.sessions.filter(s=>s.tobaccoId!==id)};
    if(persist(next)){closeDialog(true);notice("Tabak gelöscht.");}
  }
  function exportRawData(){
    try{
      const raw=localStorage.getItem(STORAGE_KEY);
      if(!raw){notice("Keine Rohdaten im lokalen Speicher vorhanden.",true);return;}
      const blob=new Blob([raw],{type:"text/plain;charset=utf-8"});
      const url=URL.createObjectURL(blob),anchor=document.createElement("a");
      anchor.href=url;anchor.download="tabakjournal-rohdaten-"+localDate()+".txt";
      document.body.append(anchor);anchor.click();anchor.remove();
      setTimeout(()=>URL.revokeObjectURL(url),1500);
      notice("Unveränderte Rohdaten als Datei gesichert.");
    }catch(error){notice("Rohdaten konnten nicht exportiert werden: "+error.message,true);}
  }
  function exportData(){
    if(!state)return;
    const payload={...state,exportedAt:new Date().toISOString()};
    const blob=new Blob([JSON.stringify(payload,null,2)],{type:"application/json;charset=utf-8"});
    const url=URL.createObjectURL(blob),anchor=document.createElement("a");
    anchor.href=url;anchor.download="tabakbewertungen-"+localDate()+".json";
    document.body.append(anchor);anchor.click();anchor.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1500);notice("Backup gespeichert.");
  }
  function mergeData(incoming){
    // Product identity is based on brand + variety + compatible pack size, not
    // an ID alone: backups made on separate devices can reuse an internal ID.
    const sameProduct=(a,b)=>key(a.brand)===key(b.brand)&&key(a.name)===key(b.name)&&
      (a.quantity_g===b.quantity_g||!a.quantity_g||!b.quantity_g);
    const products=state.tobaccos.map(p=>({...p,barcodes:[...p.barcodes]}));
    const productIds=new Set(products.map(p=>p.id));
    const idMap=new Map();
    const uniqueProductId=()=>{
      let id;
      do{id=uid();}while(productIds.has(id));
      productIds.add(id);
      return id;
    };
    for(const item of incoming.tobaccos){
      const byId=products.find(p=>p.id===item.id);
      const match=(byId&&sameProduct(byId,item)?byId:null)||
        products.find(p=>sameProduct(p,item));
      if(match){
        idMap.set(item.id,match.id);
        // Prefer an existing local rating; imported ratings fill only blanks.
        if(match.review?.tolerability==null&&item.review?.tolerability!=null)
          match.review=item.review;
        match.barcodes=[...new Set([...match.barcodes,...item.barcodes])];
        if(!match.quantity_g)match.quantity_g=item.quantity_g;
      }else{
        const id=productIds.has(item.id)?uniqueProductId():item.id;
        productIds.add(id);
        idMap.set(item.id,id);
        products.push({...item,id});
      }
    }
    const sessions=new Map(state.sessions.map(s=>[s.id,s]));
    for(const item of incoming.sessions){
      const entry={...item,tobaccoId:idMap.get(item.tobaccoId)||item.tobaccoId};
      const existing=sessions.get(entry.id);
      if(!existing){
        sessions.set(entry.id,entry);
      }else if(JSON.stringify(existing)!==JSON.stringify(entry)){
        // Preserve both histories if two independent backups used the same ID.
        let id;
        do{id=uid();}while(sessions.has(id));
        sessions.set(id,{...entry,id});
      }
    }
    return {...state,tobaccos:products,sessions:[...sessions.values()]};
  }
  async function importFile(file){
    if(!file)return;
    if(file.size>8*1024*1024){notice("Backup darf höchstens 8 MB groß sein.",true);return;}
    try{
      const incoming=validate(JSON.parse(await file.text()));
      if(importMode==="replace"&&!confirm("Alle eigenen Bewertungen und gespeicherten Daten durch den Inhalt des Backups ersetzen?"))return;
      if(!state&&importMode!=="replace")throw new Error("Beschädigte Daten können nur durch ein gültiges Backup ersetzt werden.");
      const next=importMode==="replace"?incoming:mergeData(incoming);
      if(persist(next)){notice("Backup erfolgreich importiert.");setView("data");}
    }catch(error){notice("Import nicht möglich: "+error.message,true);}
  }
  function restoreFailedSubmissionFromUrl(){
    // Earlier versions accidentally sent form fields as a GET request due to a
    // hidden input named "id" shadowing HTMLFormElement.id. Never auto-save
    // values from a URL: restore a visible draft and require explicit Save.
    const search=window.location?.search;
    if(!search)return;
    let params;
    try{params=new URLSearchParams(search);}catch{return;}
    if(!params.has("brand")||!params.has("name")||!params.has("tolerability"))return;
    const fields=["brand","name","catalog_ean","tolerability","quantity_g","base",
      "flavor","taste","symptom","review_notes","id","tobacco_id"];
    const remaining=new URLSearchParams(params);
    for(const field of fields)remaining.delete(field);
    try{
      const newSearch=remaining.toString(),location=window.location;
      window.history?.replaceState?.(window.history.state,"",
        location.pathname+(newSearch?"?"+newSearch:"")+(location.hash||""));
    }catch{ /* URL cleanup must never block the app. */ }
    if(!state)return;
    try{
      const previousId=params.get("tobacco_id")||params.get("id")||"";
      tobaccoDialog(productById(previousId)?previousId:null);
      const form=$("editorDialog").querySelector?.("#tobacco-form");
      if(!form)return;
      for(const field of ["brand","name","catalog_ean","quantity_g","base","flavor","taste","review_notes"]){
        if(!params.has(field))continue;
        const control=form.elements.namedItem(field);
        if(control)control.value=params.get(field);
      }
      const score=params.get("tolerability");
      form.querySelectorAll('input[name="tolerability"]').forEach(radio=>{
        radio.checked=radio.value===score;
      });
      const selectedSymptoms=params.getAll("symptom");
      form.querySelectorAll('input[name="symptom"]').forEach(input=>{
        input.checked=selectedSymptoms.includes(input.value);
      });
      const feedback=$("ratingFeedback"),n=Number(score);
      if(feedback&&Number.isInteger(n)&&n>=1&&n<=5)
        feedback.textContent="Ausgewählt: "+n+" von 5 · "+TOLERABILITY[n-1];
      form.querySelector(".optional-details").open=true;
      const note=$("catalogSelection");
      if(note)note.textContent="Nicht gespeicherte Eingaben aus dem letzten Speicherversuch wiederhergestellt. Bitte jetzt erneut speichern.";
    }catch(error){
      // The main collection must remain usable if a malformed old URL cannot
      // be reconstructed into a draft.
      notice("Die alten Formulareingaben konnten nicht vollständig wiederhergestellt werden.",true);
    }
  }
  document.addEventListener("click",event=>{
    const el=event.target.closest?.("[data-view], [data-filter], [data-action]");
    if(!el)return;
    if(el.dataset.view){event.preventDefault?.();setView(el.dataset.view);return;}
    if(el.dataset.filter){filter=el.dataset.filter;refreshCollectionResults();return;}
    const action=el.dataset.action,id=el.dataset.id;
    if(action==="toggle-theme"){applyTheme(theme==="dark"?"light":"dark",true);if(view==="settings")render();return;}
    if(action==="set-theme"){applyTheme(el.dataset.theme,true);render();return;}
    if(action==="add-catalog-product"){selectCatalogProduct(CATALOG[Number(el.dataset.index)]);return;}
    if(action==="add-tobacco")tobaccoDialog();
    if(action==="edit-tobacco")tobaccoDialog(id);
    if(action==="close-dialog")closeDialog();
    if(action==="choose-suggestion"){
      const p=CATALOG[Number(el.dataset.index)];
      if(p&&$("f-brand")){
        $("f-brand").value=p.brand;$("f-name").value=p.name;$("f-base").value=p.base;
        $("f-flavor").value=p.flavor;$("f-quantity_g").value=String(p.quantity_g);
        $("f-catalog-ean").value=p.ean;$("catalogResults").innerHTML="";
        $("catalogSelection").textContent="Übernommen: "+p.brand+" · "+p.name+" · "+p.quantity_g+" g";
      }
    }
    if(action==="delete-tobacco")deleteTobacco(id);
    if(action==="export")exportData();
    if(action==="export-raw")exportRawData();
    if(action==="import-merge"||action==="import-replace"){importMode=action==="import-merge"?"merge":"replace";$("importFile")?.click();}
    if(action==="clear-all"){
      if(!state)return;
      if(!confirm("Alle "+state.tobaccos.length+" Tabake und ihre Bewertungen sowie "+state.sessions.length+" frühere Protokolle dauerhaft löschen? Vorher ein Backup erstellen."))return;
      if(persist(emptyState()))notice("Alle lokalen Daten gelöscht.");
    }
  });
  document.addEventListener("submit",event=>{
    if(event.target?.getAttribute?.("id")==="tobacco-form"){event.preventDefault();saveTobacco(event.target);}
  });
  document.addEventListener("change",event=>{
    if(event.target.name==="tolerability"){
      const selected=Number(event.target.value),label=$("ratingFeedback");
      if(label&&selected>=1&&selected<=5)label.textContent="Ausgewählt: "+selected+" von 5 · "+TOLERABILITY[selected-1];
    }
    if(event.target.id==="importFile"){
      const file=event.target.files?.[0];void importFile(file);event.target.value="";
    }
  });
  document.addEventListener("input",event=>{
    if(event.target.id==="catalogSearch"){
      catalogQuery=event.target.value;refreshCatalogResults();return;
    }
    if(event.target.id==="searchBar"){
      query=event.target.value;
      refreshCollectionResults();
    }
  });
  $("editorDialog").addEventListener("click",event=>{if(event.target===$("editorDialog"))closeDialog();});
  $("editorDialog").addEventListener("cancel",event=>{event.preventDefault();closeDialog();});
  applyTheme(readTheme());load();render();restoreFailedSubmissionFromUrl();
})();
