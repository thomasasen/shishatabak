"use strict";
/* Barcode-first catalog search. Separate from personal data so scans do not need a remote lookup. */
(() => {
  const DB=window.TabakCatalog?.products||[];
  const STORAGE="tabakjournal:v1";
  const $=id=>document.getElementById(id);
  const dialog=$("barcodeDialog");
  const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm=s=>String(s??"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
  function normalizeCode(input) {
    let s=String(input??"").replace(/[\s-]/g,"");
    if(!/^\d+$/.test(s)||![8,12,13,14].includes(s.length))return null;
    let sum=0,multiplier=3;
    for(let i=s.length-2;i>=0;i--){sum+=Number(s[i])*multiplier;multiplier=multiplier===3?1:3;}
    if((10-sum%10)%10!==Number(s[s.length-1]))return null;
    if(s.length===12)s="0"+s; // UPC-A and EAN-13 with leading zero are equivalent.
    return s;
  }
  function state(){
    const raw=localStorage.getItem(STORAGE);
    const s=raw?JSON.parse(raw):{app:"tabakjournal",version:1,tobaccos:[],sessions:[],settings:{bowl:""}};
    if(s.app!=="tabakjournal"||s.version!==1||!Array.isArray(s.tobaccos)||!Array.isArray(s.sessions))throw Error("Lokale Daten haben ein unbekanntes Format.");
    return s;
  }
  function store(s){
    localStorage.setItem(STORAGE,JSON.stringify(s));
    dialog.close();void stop();
    window.location.reload();
  }
  function status(message){const el=$("scanStatus");if(el)el.textContent=message;}
  function shell(title,subtitle,contents){
    $("barcodeDialogContent").innerHTML='<div class="dialog-head"><div><h2 id="barcodeDialogTitle">'+escape(title)+'</h2><p>'+escape(subtitle)+'</p></div><button class="close-btn" type="button" data-scan-action="close" aria-label="Schließen">×</button></div><div class="editor-form">'+contents+'</div>';
    if(!dialog.open)dialog.showModal();
  }
  let html5=null,started=false,starting=false,stopWhenReady=false,locked=false,scriptPromise=null;
  function close(){ if(dialog.open)dialog.close();void stop(); }
  function openScanner(){
    close();locked=false;
    shell("Barcode scannen","Kamera auf den Barcode deiner Tabakdose richten",
      '<div class="hint">Die EAN wird lokal auf deinem Smartphone ausgelesen. Bei einem bekannten Code erscheint direkt der Tabak.</div>'+
      '<div id="scanCamera" class="scan-area"><div class="empty-preview">▥<p>Kamera noch nicht gestartet</p></div></div>'+
      '<div class="scan-status" id="scanStatus" role="status">Barcode gut beleuchten, gerade halten und vollständig ins Bild bringen.</div>'+
      '<div class="btn-row" style="margin-top:12px"><button type="button" class="btn btn-primary" data-scan-action="start">Kamera starten</button><button type="button" class="btn btn-secondary" data-scan-action="stop">Kamera stoppen</button></div>'+
      '<div class="scan-divider">ALTERNATIVEN</div>'+
      '<div class="field"><label for="scanPhoto">Foto des Barcodes auswählen</label><input type="file" id="scanPhoto" accept="image/*"></div>'+
      '<form id="scanCodeForm" class="scan-choice"><div class="field"><label for="scanCodeInput">EAN / UPC manuell eingeben</label><input id="scanCodeInput" name="code" type="text" inputmode="numeric" maxlength="20" placeholder="z. B. 4255799718414" autocomplete="off" required></div><button type="submit" class="btn btn-secondary">Prüfen</button></form>'+
      '<p class="smallprint">'+DB.length+' online recherchierte Produktvarianten im lokalen Katalog. Ist dein Barcode unbekannt, lässt er sich einmalig zuordnen.</p>');
  }
  async function library(){
    if(window.Html5Qrcode)return;
    if(!scriptPromise)scriptPromise=new Promise((resolve,reject)=>{
      const tag=document.createElement("script");
      tag.src="https://cdn.jsdelivr.net/npm/html5-qrcode@2.3.8/html5-qrcode.min.js";
      tag.async=true;
      tag.onload=()=>window.Html5Qrcode?resolve():reject(Error("Scanner-Bibliothek nicht verfügbar."));
      tag.onerror=()=>reject(Error("Scanner-Bibliothek konnte nicht geladen werden."));
      document.head.appendChild(tag);
    }).catch(e=>{scriptPromise=null;throw e;});
    await scriptPromise;
  }
  function formats(){
    const x=window.Html5QrcodeSupportedFormats;
    return {formatsToSupport:[x.EAN_13,x.EAN_8,x.UPC_A,x.UPC_E],verbose:false};
  }
  async function stop(){
    if(starting){stopWhenReady=true;return;}
    const current=html5;html5=null;
    if(!current)return;
    if(started){started=false;try{await current.stop();}catch{/* stopped by browser */}}
    try{current.clear();}catch{/* already cleared */}
  }
  async function start(){
    if(started||starting){status("Kamera ist bereits aktiv oder startet gerade.");return;}
    if(!window.isSecureContext||!navigator.mediaDevices?.getUserMedia){status("Kamera benötigt HTTPS und eine Freigabe im Browser. Bitte Foto oder manuelle EAN-Eingabe nutzen.");return;}
    status("Scanner wird geladen …");
    try{
      await library();
      if(!dialog.open||!$("scanCamera"))return;
      await stop();
      html5=new window.Html5Qrcode("scanCamera",formats());
      starting=true;stopWhenReady=false;locked=false;
      const current=html5;
      await current.start({facingMode:"environment"},{fps:10,qrbox:(w,h)=>({width:Math.max(130,Math.min(w-20,300)),height:Math.max(70,Math.min(h-20,140))})},decoded=>{
        if(locked)return;
        const valid=normalizeCode(decoded);
        if(!valid)return;
        locked=true;
        void (async()=>{await stop();lookup(valid);})();
      },()=>{});
      starting=false;started=true;
      if(stopWhenReady||!dialog.open||current!==html5)await stop();
      else status("Kamera aktiv. Die EAN wird automatisch erkannt.");
    }catch(e){
      starting=false;await stop();
      status("Kamera nicht verfügbar: "+(e?.name==="NotAllowedError"?"Zugriff verweigert":String(e?.message||e))+". Du kannst ein Foto auswählen oder die EAN eintippen.");
    }
  }
  async function scanPhoto(file){
    if(!file)return;
    if(file.size>12_000_000){status("Foto zu groß (max. 12 MB).");return;}
    status("Foto wird nach EAN/UPC durchsucht …");
    try{
      await library();await stop();
      if(!dialog.open||!$("scanCamera"))return;
      html5=new window.Html5Qrcode("scanCamera",formats());
      const decoded=await html5.scanFile(file,true);
      await stop();
      lookup(decoded);
    }catch(e){await stop();status("Kein lesbarer Barcode gefunden. Foto gerade und scharf aufnehmen oder Code eingeben.");}
  }
  function btn(action,label,{code="",id="",primary=false}={}){
    return '<button type="button" class="btn '+(primary?"btn-primary":"btn-secondary")+'" data-scan-action="'+escape(action)+'" data-code="'+escape(code)+'" data-id="'+escape(id)+'">'+escape(label)+'</button>';
  }
  function lookup(value){
    const code=normalizeCode(value);
    if(!code){status("EAN/UPC ist ungültig (Länge oder Prüfziffer).");return;}
    void stop();
    let s;try{s=state();}catch(e){status(e.message);return;}
    const owned=s.tobaccos.find(t=>(t.barcodes||[]).some(x=>normalizeCode(x)===code));
    const entry=DB.find(p=>normalizeCode(p.ean)===code);
    const title='Barcode '+code;
    if(owned){
      shell(title,"Der Barcode ist in deiner Sammlung gespeichert",
        '<div class="scan-result good"><strong>Tabak erkannt</strong><h3>'+escape(owned.brand+" · "+owned.name)+'</h3>Bereits in deiner Sammlung</div>'+
        '<div class="btn-row">'+btn("session","Session erfassen",{id:owned.id,primary:true})+btn("rescan","Weitere Dose scannen")+'</div>');
      return;
    }
    if(entry){
      const exists=s.tobaccos.find(t=>norm(t.brand)===norm(entry.brand)&&norm(t.name)===norm(entry.name));
      shell(title,"EAN aus dem recherchierten Produktkatalog",
        '<div class="scan-result good"><strong>Produkt gefunden</strong><h3>'+escape(entry.brand+" · "+entry.name)+'</h3>'+escape(entry.quantity_g+" g · "+entry.base)+'</div>'+
        '<p class="smallprint">Quelle: <a href="'+escape(entry.source_url)+'" target="_blank" rel="noopener noreferrer">'+escape(entry.source)+'</a>. Bitte Aufdruck und Packungsgröße mit dem Ergebnis vergleichen.</p>'+
        '<div class="btn-row">'+(exists?btn("link","Barcode dem vorhandenen Tabak zuordnen",{id:exists.id,code,primary:true}):btn("add","In meine Sammlung übernehmen",{code,primary:true}))+btn("rescan","Erneut scannen")+'</div>');
      return;
    }
    const choices=s.tobaccos.length?'<div class="scan-choice"><div class="field"><label for="scanProduct">Oder vorhandenen Tabak zuordnen</label><select id="scanProduct">'+s.tobaccos.map(t=>'<option value="'+escape(t.id)+'">'+escape(t.brand+" · "+t.name)+'</option>').join("")+'</select></div>'+btn("link-selected","Zuordnen",{code})+'</div>':"";
    shell(title,"Code lesbar, Produktzuordnung noch unbekannt",
      '<div class="scan-result warn">Diese EAN steht noch nicht in der Produktdatenbank. Du kannst sie jetzt einem Tabak zuordnen. Beim nächsten Scan wird sie wiedererkannt.</div>'+
      '<form id="scanNewProduct" class="fields"><div class="field-row"><div class="field"><label for="scanBrand">Hersteller *</label><input id="scanBrand" name="brand" maxlength="120" required placeholder="Hersteller"></div><div class="field"><label for="scanName">Sorte *</label><input id="scanName" name="name" maxlength="160" required placeholder="Sortenname"></div></div>'+
      '<div class="field"><label for="scanBase">Grundtabak</label><select id="scanBase" name="base"><option>Unbekannt</option><option>Virginia</option><option>Dark Blend</option></select></div>'+
      '<input type="hidden" name="code" value="'+escape(code)+'"><button class="btn btn-primary" type="submit">Tabak mit Barcode speichern</button></form>'+
      choices+'<p class="smallprint">Es wird keine Produktzuordnung geraten. Deine lokale EAN-Zuordnung ist Bestandteil des JSON-Backups.</p>');
  }
  function persistBarcode(code,product){
    try{
      const s=state();
      const current=s.tobaccos.find(t=>(t.barcodes||[]).some(x=>normalizeCode(x)===code));
      if(current)throw Error("Diese EAN ist bereits "+current.brand+" · "+current.name+" zugeordnet.");
      if(product.id){
        const stored=s.tobaccos.find(t=>t.id===product.id);
        if(!stored)throw Error("Tabak nicht mehr vorhanden.");
        stored.barcodes=[...new Set([...(stored.barcodes||[]),code])];
      }else{
        if(!product.brand||!product.name)throw Error("Hersteller und Sorte eingeben.");
        const exists=s.tobaccos.find(t=>norm(t.brand)===norm(product.brand)&&norm(t.name)===norm(product.name));
        if(exists)throw Error("Diese Sorte gibt es bereits. Nutze die Zuordnung zum vorhandenen Tabak.");
        s.tobaccos.push({id:crypto.randomUUID?crypto.randomUUID():Date.now()+"-"+Math.random().toString(36).slice(2),brand:product.brand.slice(0,120),name:product.name.slice(0,160),base:product.base||"Unbekannt",flavor:(product.flavor||"").slice(0,200),notes:"",barcodes:[code],createdAt:new Date().toISOString()});
      }
      store(s);
    }catch(e){const node=$("scanError");if(node)node.textContent=e.message;else window.alert("Speichern fehlgeschlagen: "+e.message);}
  }
  function openSession(id){
    close();
    const button=document.createElement("button");
    button.dataset.action="add-session";button.dataset.id=id;button.hidden=true;
    document.body.append(button);button.click();button.remove();
  }
  // The global catalog powers autocomplete in the original tobacco editor without duplicating its data model.
  document.addEventListener("input",event=>{
    if(!["f-brand","f-name"].includes(event.target?.id))return;
    const b=$("f-brand"),n=$("f-name"),box=$("catalogResults");
    if(!b||!n||!box)return;
    const brand=norm(b.value),name=norm(n.value);
    if(!brand&&!name)return;
    const matches=DB.filter(p=>(!brand||norm(p.brand).includes(brand))&&(!name||norm(p.name).includes(name))).slice(0,9);
    box.innerHTML=matches.map((p)=>'<button class="catalog-result" type="button" data-scan-action="suggest" data-code="'+escape(p.ean)+'"><span><strong>'+escape(p.brand)+'</strong> · '+escape(p.name)+'</span><small>'+escape(p.quantity_g)+' g</small></button>').join("");
  });
  document.addEventListener("click",event=>{
    const el=event.target.closest("[data-scan-action]");
    if(!el)return;
    const cmd=el.dataset.scanAction,code=normalizeCode(el.dataset.code);
    if(cmd==="open"||cmd==="rescan")openScanner();
    if(cmd==="close")close();
    if(cmd==="start")void start();
    if(cmd==="stop"){void stop();status("Kamera gestoppt.");}
    if(cmd==="session")openSession(el.dataset.id);
    if(cmd==="add"){
      const p=DB.find(p=>normalizeCode(p.ean)===code);if(p)persistBarcode(code,{brand:p.brand,name:p.name,base:p.base,flavor:p.flavor});
    }
    if(cmd==="link")persistBarcode(code,{id:el.dataset.id});
    if(cmd==="link-selected")persistBarcode(code,{id:$("scanProduct")?.value});
    if(cmd==="suggest"){
      const p=DB.find(x=>normalizeCode(x.ean)===code);
      if(p){
        $("f-brand").value=p.brand;$("f-name").value=p.name;$("f-base").value=p.base||"Unbekannt";$("f-flavor").value=p.flavor||"";
        $("catalogResults").innerHTML="";
      }
    }
  });
  document.addEventListener("submit",event=>{
    if(event.target.id==="scanCodeForm"){
      event.preventDefault();lookup(new FormData(event.target).get("code"));
    }
    if(event.target.id==="scanNewProduct"){
      event.preventDefault();const fields=new FormData(event.target);
      persistBarcode(normalizeCode(fields.get("code")),{brand:String(fields.get("brand")||"").trim(),name:String(fields.get("name")||"").trim(),base:String(fields.get("base")||"Unbekannt")});
    }
  });
  document.addEventListener("change",event=>{
    if(event.target.id==="scanPhoto"){const photo=event.target.files?.[0];void scanPhoto(photo);event.target.value="";}
  });
  dialog.addEventListener("cancel",()=>{void stop();});
  dialog.addEventListener("click",event=>{if(event.target===dialog)close();});
  window.addEventListener("pagehide",()=>{void stop();});
  // Unprivileged diagnostic API for automated checks; no personal records exposed.
  window.TabakBarcode={normalizeCode,catalogCount:DB.length};
})();
