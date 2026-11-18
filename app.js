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
  let state=emptyState(),view="collection",query="",filter="all",importMode="merge",dialogBaseline=null,toastTimer,storageError="";
  const escapeHTML=value=>String(value==null?"":value).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const plain=(value,max=300)=>typeof value==="string"?value.trim().slice(0,max):"";
  const key=value=>String(value??"").toLocaleLowerCase("de").normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g,"");
  const uid=()=>typeof crypto!=="undefined"&&crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+"-"+Math.random().toString(36).slice(2);
  const localDate=()=>{const date=new Date();return new Date(date.getTime()-date.getTimezoneOffset()*60000).toISOString().slice(0,10);};
  const productById=id=>state.tobaccos.find(p=>p.id===id);
  const productName=p=>p?p.brand+" · "+p.name:"Unbekannter Tabak";
  const icon=name=>'<svg class="ui-icon" aria-hidden="true" focusable="false"><use href="#i-'+name+'"></use></svg>';
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
  function ratingTag(review){
    const value=review?.tolerability;
    if(value==null)return '<div class="rating-summary unrated"><span class="rating-summary-label">Noch nicht bewertet</span></div>';
    const tone=value>=4?"good":value<=2?"poor":"neutral";
    const label=["Sehr schlecht verträglich","Schlecht verträglich","Mittelmäßig verträglich","Gut verträglich","Sehr gut verträglich"][value-1];
    return '<div class="rating-summary '+tone+'" aria-label="Verträglichkeit: '+value+' von 5, '+escapeHTML(label)+'">'+
      '<strong class="rating-summary-value">'+value+'<small>/5</small></strong>'+
      '<span class="rating-summary-label">'+escapeHTML(label)+'</span></div>';
  }
  function card(p){
    const r=p.review||defaultReview();
    const details=[p.quantity_g?p.quantity_g+" g":"",p.base!=="Unbekannt"?p.base:"",p.flavor].filter(Boolean);
    return '<article class="tobacco-card">'+
      '<div class="card-top"><span class="card-brand">'+escapeHTML(p.brand)+'</span></div>'+
      '<h2>'+escapeHTML(p.name)+'</h2>'+
      '<div class="card-meta">'+(details.length?escapeHTML(details.join(" · ")):"Produktdetails nicht hinterlegt")+'</div>'+
      ratingTag(r)+
      (r.taste!=null?'<div class="rating-secondary">Geschmack <strong>'+r.taste+'/5</strong></div>':'')+
      (r.symptoms.length?'<div class="review-symptoms"><strong>Beobachtete Beschwerden:</strong> '+escapeHTML(r.symptoms.join(", "))+'</div>':'')+
      (r.notes?'<p class="review-notes">'+escapeHTML(r.notes)+'</p>':'')+
      '<div class="card-foot">'+button(r.tolerability==null?"Jetzt bewerten":"Bewertung bearbeiten","edit-tobacco",p.id,r.tolerability==null?"primary":"secondary")+'</div>'+
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
      '<p class="smallprint">Verträglichkeit ist eine persönliche Einschätzung, keine medizinische Diagnose. Bei Beschwerden den Konsum beenden und wiederkehrende Symptome ärztlich abklären.</p>';
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
  function dataView(){
    if(!state)return '<header class="page-head"><h1>Backup</h1></header><div class="hint warning">Bestehende Browserdaten konnten nicht gelesen werden. Diese Anwendung schreibt deshalb keine neuen Daten, um sie nicht zu überschreiben.</div>';
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
    $("currentSection").textContent=view==="collection"?"Meine Tabake":"Backup";
    $("saveStatus").textContent=storageError||"Lokal gespeichert";
    $("saveStatus").classList.toggle("error",!!storageError);
    document.querySelectorAll(".nav-item").forEach(el=>{
      const active=el.dataset.view===view;
      el.classList.toggle("is-active",active);
      if(active)el.setAttribute?.("aria-current","page");else el.removeAttribute?.("aria-current");
    });
    $("screen").innerHTML=view==="collection"?collection():dataView();
  }
  function setView(next){
    if(!["collection","data"].includes(next))return;
    view=next;query="";filter="all";render();
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
    const entry=Boolean(p);
    dialog('<div class="dialog-head"><div><h2 id="dialogTitle">'+(entry?"Tabak bewerten":"Tabak hinzufügen")+'</h2>'+
      '<p>Die Verträglichkeit steht im Mittelpunkt. Pro Sorte gibt es eine Bewertung, keine einzelnen Sessions.</p></div>'+
      '<button class="close-btn" type="button" data-action="close-dialog" aria-label="Schließen">×</button></div>'+
      '<form class="editor-form" id="tobacco-form">'+
      '<div class="fields">'+
      input("brand","Hersteller *",p?.brand||"","z. B. Hookain",true,"text",'list="brandList" maxlength="120"')+
      '<datalist id="brandList">'+BRANDS.map(b=>'<option value="'+escapeHTML(b)+'"></option>').join("")+'</datalist>'+
      input("name","Sorte *",p?.name||"","z. B. White Caek",true,"text",'maxlength="160" autocomplete="off"')+
      '<p class="field-help">Passende Sorten und Packungsgrößen erscheinen während der Eingabe.</p>'+
      '<div class="catalog-results" id="catalogResults" aria-label="Katalogvorschläge"></div>'+
      '<div class="field-help" role="status" id="catalogSelection"></div>'+
      '<input type="hidden" id="f-catalog-ean" name="catalog_ean" value="">'+
      '<div class="field-row">'+input("quantity_g","Packungsgröße (g)",p?.quantity_g||"","z. B. 200",false,"number",'min="0" max="1000" step="1"')+
      '<div class="field"><label for="f-base">Grundtabak</label><select id="f-base" name="base">'+
      ["Unbekannt","Virginia","Dark Blend"].map(v=>'<option value="'+v+'"'+(v===(p?.base||"Unbekannt")?' selected':'')+'>'+v+'</option>').join("")+'</select></div></div>'+
      input("flavor","Geschmacksrichtung",p?.flavor||"","z. B. Minze, Traube",false,"text",'maxlength="200"')+
      '<fieldset class="rating-block"><legend>Verträglichkeit <span class="required-star">*</span></legend>'+
      '<p>Wie gut verträgst du diesen Tabak insgesamt? 1 = sehr schlecht, 5 = sehr gut.</p>'+
      '<div class="rating-options" role="group" aria-label="Verträglichkeit von eins bis fünf">'+
      TOLERABILITY.map((label,i)=>'<label class="rating-option"><input type="radio" name="tolerability" value="'+(i+1)+'"'+
      (r.tolerability===i+1?' checked':'')+(i===0?' required':'')+'><span class="rating-score">'+(i+1)+'</span><span class="rating-name">'+label+'</span></label>').join("")+
      '</div></fieldset>'+
      '<div class="field"><label for="f-taste">Geschmack (optional)</label><select id="f-taste" name="taste"><option value="">Keine Bewertung</option>'+
      [1,2,3,4,5].map(n=>'<option value="'+n+'"'+(r.taste===n?' selected':'')+'>'+n+'/5</option>').join("")+'</select></div>'+
      '<fieldset class="symptom-block"><legend>Beobachtete Beschwerden (optional)</legend><p>Mehrfachauswahl möglich.</p><div class="symptom-grid">'+
      SYMPTOMS.map(sym=>'<label class="symptom-choice"><input type="checkbox" name="symptom" value="'+escapeHTML(sym)+'"'+
      (r.symptoms.includes(sym)?' checked':'')+'> '+escapeHTML(sym)+'</label>').join("")+'</div></fieldset>'+
      '<div class="field"><label for="f-review-notes">Notizen zur Verträglichkeit (optional)</label>'+
      '<textarea id="f-review-notes" name="review_notes" maxlength="1000" placeholder="Wie hast du den Tabak vertragen?">'+escapeHTML(r.notes||(r.updatedAt?"":p?.notes||""))+'</textarea></div>'+
      '<div class="hint">Die Bewertung beschreibt deine persönlichen Erfahrungen. Sie gilt nicht als medizinischer Befund.</div></div>'+
      '<div class="dialog-actions">'+(entry?'<button class="btn btn-danger" type="button" data-action="delete-tobacco" data-id="'+escapeHTML(p.id)+'">Tabak löschen</button>':'')+
      '<button class="btn btn-secondary" type="button" data-action="close-dialog">Abbrechen</button>'+
      '<button class="btn btn-primary" type="submit">Bewertung speichern</button></div>'+
      '<input type="hidden" name="id" value="'+escapeHTML(p?.id||"")+'"></form>');
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
      results.innerHTML=matches.map(p=>'<button type="button" class="catalog-result" data-action="choose-suggestion" data-index="'+CATALOG.indexOf(p)+'">'+
        '<span><strong>'+escapeHTML(p.brand)+'</strong> · '+escapeHTML(p.name)+'</span><small>'+
        escapeHTML([p.quantity_g+" g",p.base!=="Unbekannt"?p.base:"",p.flavor].filter(Boolean).join(" · "))+'</small></button>').join("");
    };
    brand.addEventListener("input",update);name.addEventListener("input",update);update();
  }
  function saveTobacco(form){
    if(!state)return;
    const fd=new FormData(form),id=String(fd.get("id")||""),brand=plain(fd.get("brand"),120),name=plain(fd.get("name"),160);
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
    const identity=p=>key(p.brand)+"|"+key(p.name)+"|"+p.quantity_g;
    const products=state.tobaccos.map(p=>({...p,barcodes:[...p.barcodes]}));
    const ids={};
    for(const item of incoming.tobaccos){
      const match=products.find(p=>p.id===item.id)||products.find(p=>identity(p)===identity(item))||
        products.find(p=>key(p.brand)===key(item.brand)&&key(p.name)===key(item.name)&&
          (!p.quantity_g||!item.quantity_g));
      if(match){
        ids[item.id]=match.id;
        // Local review is authoritative; import fills in missing ratings only.
        if(match.review?.tolerability==null&&item.review?.tolerability!=null)match.review=item.review;
        match.barcodes=[...new Set([...match.barcodes,...item.barcodes])];
        if(!match.quantity_g)match.quantity_g=item.quantity_g;
      }else{products.push(item);ids[item.id]=item.id;}
    }
    const sessions=new Map(state.sessions.map(s=>[s.id,s]));
    for(const entry of incoming.sessions)if(!sessions.has(entry.id))sessions.set(entry.id,{...entry,tobaccoId:ids[entry.tobaccoId]||entry.tobaccoId});
    return {...state,tobaccos:products,sessions:[...sessions.values()]};
  }
  async function importFile(file){
    if(!state||!file)return;
    if(file.size>8*1024*1024){notice("Backup darf höchstens 8 MB groß sein.",true);return;}
    try{
      const incoming=validate(JSON.parse(await file.text()));
      if(importMode==="replace"&&!confirm("Alle eigenen Bewertungen und gespeicherten Daten durch den Inhalt des Backups ersetzen?"))return;
      const next=importMode==="replace"?incoming:mergeData(incoming);
      if(persist(next)){notice("Backup erfolgreich importiert.");setView("data");}
    }catch(error){notice("Import nicht möglich: "+error.message,true);}
  }
  document.addEventListener("click",event=>{
    const el=event.target.closest?.("[data-view], [data-filter], [data-action]");
    if(!el)return;
    if(el.dataset.view){event.preventDefault?.();setView(el.dataset.view);return;}
    if(el.dataset.filter){filter=el.dataset.filter;render();return;}
    const action=el.dataset.action,id=el.dataset.id;
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
    if(action==="import-merge"||action==="import-replace"){importMode=action==="import-merge"?"merge":"replace";$("importFile")?.click();}
    if(action==="clear-all"){
      if(!state)return;
      if(!confirm("Alle "+state.tobaccos.length+" Tabake und ihre Bewertungen sowie "+state.sessions.length+" frühere Protokolle dauerhaft löschen? Vorher ein Backup erstellen."))return;
      if(persist(emptyState()))notice("Alle lokalen Daten gelöscht.");
    }
  });
  document.addEventListener("submit",event=>{
    if(event.target.id==="tobacco-form"){event.preventDefault();saveTobacco(event.target);}
  });
  document.addEventListener("change",event=>{
    if(event.target.id==="importFile"){
      const file=event.target.files?.[0];void importFile(file);event.target.value="";
    }
  });
  document.addEventListener("input",event=>{
    if(event.target.id==="searchBar"){
      query=event.target.value;const pos=event.target.selectionStart;
      render();const el=$("searchBar");
      if(el){el.focus();el.setSelectionRange?.(pos,pos);}
    }
  });
  $("editorDialog").addEventListener("click",event=>{if(event.target===$("editorDialog"))closeDialog();});
  $("editorDialog").addEventListener("cancel",event=>{event.preventDefault();closeDialog();});
  load();render();
})();
