"use strict";
/* Barcode-first catalog search. Separate from personal data so scans do not need a remote lookup. */
(() => {
  const DB=window.TabakCatalog?.products||[];
  const STORAGE="tabakjournal:v1";
  const $=id=>document.getElementById(id);
  const dialog=$("barcodeDialog");
  const escape=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
  const norm=s=>String(s??"").toLowerCase().normalize("NFKD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]/g,"");
  const sameProduct=(t,p)=>{
    const cleanBrand=b=>norm(b).replace(/(tobacco|tabak)$/,"");
    return cleanBrand(t.brand)===cleanBrand(p.brand)
      && [p.name,...(p.aliases||[])].some(label=>norm(label)===norm(t.name));
  };
  function normalizeCode(input) {
    let s=String(input??"").replace(/[\s-]/g,"");
    if(!/^\d+$/.test(s)||![8,12,13,14].includes(s.length))return null;
    let sum=0,multiplier=3;
    for(let i=s.length-2;i>=0;i--){sum+=Number(s[i])*multiplier;multiplier=multiplier===3?1:3;}
    if((10-sum%10)%10!==Number(s[s.length-1]))return null;
    if(s.length===12)s="0"+s; // UPC-A and EAN-13 with leading zero are equivalent.
    return s;
  }
  // Validate multiple independent camera frames before treating a decodable barcode as real.
  // A valid GTIN check digit is not proof that the camera read the label correctly.
  function createScanConsensus(required=3, minGapMs=70, timeoutMs=4000) {
    let previous=null, count=0, lastAt=-Infinity;
    return (raw, at=Date.now()) => {
      const code=normalizeCode(raw);
      if(!code)return {code:null,count:0,accepted:false};
      if(code!==previous||at-lastAt>timeoutMs){
        previous=code;count=1;lastAt=at;
      }else if(at-lastAt>=minGapMs){
        count++;lastAt=at;
      }
      return {code,count,accepted:count>=required};
    };
  }
  // html5-qrcode exposes torch/zoom helpers and browser MediaTrackCapabilities.
  // All controls are optional: mobile browsers differ considerably.
  function cameraFeatures(camera) {
    let media={};
    try{media=camera?.getRunningTrackCapabilities?.()||{};}catch{/* unsupported */}
    let torchFeature=null;
    try{torchFeature=camera?.getRunningTrackCameraCapabilities?.()?.torchFeature?.()||null;}catch{/* unsupported */}
    const torch=Boolean(
      (typeof torchFeature?.isSupported==="function"&&torchFeature.isSupported()) ||
      media.torch===true || (Array.isArray(media.torch)&&media.torch.includes(true))
    );
    const focusModes=Array.isArray(media.focusMode)?media.focusMode.filter(x=>typeof x==="string"):[];
    const range=(value)=>{
      if(!value||!Number.isFinite(Number(value.min))||!Number.isFinite(Number(value.max))||Number(value.max)<=Number(value.min))return null;
      return {min:Number(value.min),max:Number(value.max),step:Number(value.step)>0?Number(value.step):0.1};
    };
    return {
      torch,torchFeature,
      autofocus:focusModes.includes("continuous")||focusModes.includes("single-shot"),
      focusMode:focusModes.includes("continuous")?"continuous":focusModes.includes("single-shot")?"single-shot":null,
      manualFocus:focusModes.includes("manual")?range(media.focusDistance):null,
      zoom:range(media.zoom)
    };
  }
  async function applyAutoFocus(camera,features){
    if(!camera||!features?.autofocus)throw Error("Autofokus wird von dieser Kamera nicht unterstützt.");
    await camera.applyVideoConstraints({advanced:[{focusMode:features.focusMode}]});
  }
  async function applyManualFocus(camera,features,value){
    if(!camera||!features?.manualFocus)throw Error("Manuelle Fokussteuerung ist nicht verfügbar.");
    const r=features.manualFocus;
    const distance=Math.min(r.max,Math.max(r.min,Number(value)));
    if(!Number.isFinite(distance))throw Error("Ungültiger Fokuswert.");
    await camera.applyVideoConstraints({advanced:[{focusMode:"manual",focusDistance:distance}]});
    return distance;
  }
  async function applyZoom(camera,features,value){
    if(!camera||!features?.zoom)throw Error("Kamerazoom ist nicht verfügbar.");
    const r=features.zoom;
    const level=Math.min(r.max,Math.max(r.min,Number(value)));
    if(!Number.isFinite(level))throw Error("Ungültiger Zoomwert.");
    await camera.applyVideoConstraints({advanced:[{zoom:level}]});
    return level;
  }
  async function applyTorch(camera,features,enabled){
    if(!camera||!features?.torch)throw Error("Kameralicht ist nicht verfügbar.");
    if(features.torchFeature?.isSupported?.()&&typeof features.torchFeature.apply==="function"){
      await features.torchFeature.apply(Boolean(enabled));
    }else{
      await camera.applyVideoConstraints({advanced:[{torch:Boolean(enabled)}]});
    }
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
  let consensus=createScanConsensus(),activeAltFormats=false;
  let activeFeatures=null,torchOn=false,controlsBusy=false,focusTimer=null,zoomTimer=null;
  function resetCameraControls(){
    activeFeatures=null;torchOn=false;controlsBusy=false;
    clearTimeout(focusTimer);clearTimeout(zoomTimer);
    const panel=$("scanCameraControls");
    if(panel)panel.hidden=true;
  }
  function displayCameraControls(camera){
    const panel=$("scanCameraControls");
    if(!panel||!camera)return;
    const features=cameraFeatures(camera);
    activeFeatures=features;
    const light=$("scanLightButton"),auto=$("scanFocusButton");
    const focus=$("scanFocusControl"),zoom=$("scanZoomControl");
    const hint=$("scanCameraFeatureHint");
    if(light){light.hidden=!features.torch;light.disabled=!features.torch;light.textContent="◉ Licht einschalten";light.setAttribute("aria-pressed","false");}
    if(auto){auto.hidden=!features.autofocus;auto.disabled=!features.autofocus;}
    const configureRange=(container,id,range,labelId)=>{
      if(!container)return;
      container.hidden=!range;
      if(!range)return;
      const input=$(id);
      if(!input)return;
      input.min=String(range.min);input.max=String(range.max);input.step=String(range.step);
      const current=(()=>{try{return camera.getRunningTrackSettings?.()||{};}catch{return {};}})();
      const name=id==="scanManualFocus"?"focusDistance":"zoom";
      const initial=Number.isFinite(Number(current[name]))?Number(current[name]):range.min;
      input.value=String(Math.min(range.max,Math.max(range.min,initial)));
      const valueLabel=$(labelId);if(valueLabel)valueLabel.textContent=Number(input.value).toFixed(1);
    };
    configureRange(focus,"scanManualFocus",features.manualFocus,"scanFocusValue");
    configureRange(zoom,"scanZoom",features.zoom,"scanZoomValue");
    const hasControls=features.torch||features.autofocus||features.manualFocus||features.zoom;
    panel.hidden=!hasControls;
    if(hint)hint.textContent=hasControls?
      "Die verfügbaren Regler werden direkt von deiner Kamera gesteuert.":
      "Dieser Browser bietet für die ausgewählte Kamera keine steuerbaren Fokus-, Licht- oder Zoomfunktionen. Mehr Abstand und gute Raumbeleuchtung helfen.";
  }
  async function runCameraControl(callback,successText){
    if(!started||starting||!html5||!dialog.open){status("Bitte zuerst die Kamera starten.");return;}
    if(controlsBusy)return;
    const camera=html5;
    controlsBusy=true;
    try{
      await callback(camera);
      if(html5===camera&&started)status(successText);
    }catch(error){
      if(html5===camera&&started)status("Kamerasteuerung fehlgeschlagen: "+String(error?.message||error));
    }finally{controlsBusy=false;}
  }
  async function toggleCameraLight(){
    const next=!torchOn;
    await runCameraControl(async camera=>{
      await applyTorch(camera,activeFeatures,next);
      if(camera!==html5||!started)return;
      torchOn=next;
      const button=$("scanLightButton");
      if(button){button.textContent=next?"◉ Licht ausschalten":"◉ Licht einschalten";button.setAttribute("aria-pressed",String(next));}
    },next?"Kameralicht eingeschaltet.":"Kameralicht ausgeschaltet.");
  }
  async function requestFocus(){
    await runCameraControl(async camera=>{
      await applyAutoFocus(camera,activeFeatures);
      consensus=createScanConsensus();
    },"Autofokus angefordert. Halte den Barcode ruhig ins Bild.");
  }
  async function changeCameraRange(kind,raw){
    const number=Number(raw);
    if(!Number.isFinite(number))return;
    const isFocus=kind==="focus";
    await runCameraControl(async camera=>{
      const applied=isFocus?
        await applyManualFocus(camera,activeFeatures,number):
        await applyZoom(camera,activeFeatures,number);
      const output=$(isFocus?"scanFocusValue":"scanZoomValue");
      if(output&&camera===html5)output.textContent=Number(applied).toFixed(1);
      if(isFocus)consensus=createScanConsensus();
    },isFocus?"Manueller Fokus eingestellt.":"Zoom angepasst.");
  }
  // Some decoders report UPC-A when an EAN-13 starts with 0. The captured
  // format still matters: never silently normalize all UPC/EAN variants.
  function decodedFormat(info) {
    const name=info?.result?.format?.formatName;
    return typeof name==="string"?name.toUpperCase():null;
  }
  function validForScanMode(raw,info,allowAlt=false){
    const format=decodedFormat(info);
    const code=normalizeCode(raw);
    if(!code)return false;
    if(format && !["EAN_13","EAN_8","UPC_A"].includes(format))return false;
    if(!allowAlt){
      // When format metadata is absent (file decoding), require 13 digits
      // exactly; with metadata insist on the actual EAN-13 symbology.
      return String(raw).replace(/[\s-]/g,"").length===13 && (!format||format==="EAN_13");
    }
    if(format==="EAN_8")return String(raw).replace(/[\s-]/g,"").length===8;
    if(format==="UPC_A")return String(raw).replace(/[\s-]/g,"").length===12;
    return !format||format==="EAN_13";
  }
  function close(){ if(dialog.open)dialog.close();void stop(); }
  function openScanner(){
    close();locked=false;consensus=createScanConsensus();
    shell("Barcode scannen","Kamera auf den Barcode deiner Tabakdose richten",
      '<div class="hint">Die EAN wird lokal auf deinem Smartphone ausgelesen. Bei einem bekannten Code erscheint direkt der Tabak.</div>'+
      '<div id="scanCamera" class="scan-area"><div class="empty-preview">▥<p>Kamera noch nicht gestartet</p></div></div>'+
      '<div id="scanCameraControls" class="scan-camera-controls" hidden><div class="btn-row"><button type="button" id="scanLightButton" class="btn btn-secondary btn-sm" data-scan-action="torch" aria-pressed="false" hidden>◉ Licht einschalten</button><button type="button" id="scanFocusButton" class="btn btn-secondary btn-sm" data-scan-action="autofocus" hidden>◎ Scharfstellen</button></div>'+
      '<label id="scanFocusControl" class="scan-range" hidden><span>Manueller Fokus <output id="scanFocusValue"></output></span><input id="scanManualFocus" type="range" aria-label="Manueller Fokus"></label>'+
      '<label id="scanZoomControl" class="scan-range" hidden><span>Kamerazoom <output id="scanZoomValue"></output></span><input id="scanZoom" type="range" aria-label="Kamerazoom"></label></div>'+
      '<p id="scanCameraFeatureHint" class="scan-feature-hint">Kamerafunktionen werden nach dem Start geprüft.</p>'+
      '<div class="scan-status" id="scanStatus" role="status">Barcode gut beleuchten, gerade halten und vollständig ins Bild bringen.</div>'+
      '<div class="field" style="margin-top:10px"><label><input id="scanAltFormats" type="checkbox"> Auch EAN-8 und UPC-A scannen (für Sonderfälle)</label><span class="field-help">Standard: ausschließlich EAN-13. Bei Änderung wird die Kamera neu gestartet.</span></div>'+
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
  function formats(allowAlt=false){
    const x=window.Html5QrcodeSupportedFormats;
    return {formatsToSupport:allowAlt?[x.EAN_13,x.EAN_8,x.UPC_A]:[x.EAN_13],verbose:false};
  }
  async function stop(){
    if(starting){stopWhenReady=true;return;}
    const current=html5;html5=null;
    const wasStarted=started;started=false;
    resetCameraControls();
    if(!current)return;
    if(wasStarted){try{await current.stop();}catch{/* stopped by browser */}}
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
      activeAltFormats=Boolean($("scanAltFormats")?.checked);
      html5=new window.Html5Qrcode("scanCamera",formats(activeAltFormats));
      starting=true;stopWhenReady=false;locked=false;consensus=createScanConsensus();
      const current=html5;
      await current.start({facingMode:"environment"},{fps:10,qrbox:(w,h)=>({width:Math.max(130,Math.min(w-20,300)),height:Math.max(70,Math.min(h-20,140))})},(decoded,info)=>{
        if(locked)return;
        if(!validForScanMode(decoded,info,activeAltFormats))return;
        const result=consensus(decoded);
        if(!result.code)return;
        if(!result.accepted){
          status("Barcode "+(decodedFormat(info)||"EAN")+" gelesen: "+result.code+" – bitte ruhig halten ("+result.count+"/3).");
          return;
        }
        locked=true;
        void (async()=>{await stop();lookup(result.code);})();
      },()=>{});
      starting=false;started=true;
      if(stopWhenReady||!dialog.open||current!==html5)await stop();
      else {
        displayCameraControls(current);
        status("Kamera aktiv. Die EAN wird automatisch erkannt.");
      }
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
      const allowAlt=Boolean($("scanAltFormats")?.checked);
      html5=new window.Html5Qrcode("scanCamera",formats(allowAlt));
      const decoded=await html5.scanFile(file,true);
      await stop();
      if(!validForScanMode(decoded,null,allowAlt)){
        status("Ergebnis passt nicht zum gewählten Barcodeformat. EAN-13 verwenden oder Zusatzformate aktivieren.");
        return;
      }
      lookup(decoded);
    }catch(e){await stop();status("Kein lesbarer Barcode gefunden. Foto gerade und scharf aufnehmen oder Code eingeben.");}
  }
  function btn(action,label,{code="",id="",primary=false}={}){
    return '<button type="button" class="btn '+(primary?"btn-primary":"btn-secondary")+'" data-scan-action="'+escape(action)+'" data-code="'+escape(code)+'" data-id="'+escape(id)+'">'+escape(label)+'</button>';
  }
  async function queryExternal(code) {
    // Optional public product-name fallback. No credentials; only the scanned EAN is sent.
    const target=$("remoteLookup");
    if(!target)return;
    target.textContent="Prüfe die EAN zusätzlich in einer öffentlichen Produktdatenbank …";
    try{
      const controller=new AbortController();
      const timer=setTimeout(()=>controller.abort(),6500);
      let response;
      try{response=await fetch("https://ean-suche.net/api/produkt/"+encodeURIComponent(code),{method:"GET",mode:"cors",cache:"no-store",signal:controller.signal});}
      finally{clearTimeout(timer);}
      if(!$("remoteLookup")||$("remoteLookup").dataset.code!==code)return;
      if(response.status===404){target.textContent="Auch online kein Produkt gefunden. Bitte einmalig selbst zuordnen.";return;}
      if(!response.ok)throw Error(response.status===429?"Anfragelimit erreicht.":"Anfrage nicht möglich.");
      const payload=await response.json();
      if(!payload||payload.found!==true||typeof payload.product_name!=="string"||!payload.product_name.trim()){
        target.textContent="Online keine eindeutig benannte Ware gefunden. Bitte selbst zuordnen.";return;
      }
      const title=payload.product_name.trim().slice(0,180);
      target.innerHTML='<div class="scan-result good"><strong>Online-Treffer als Vorschlag</strong><h3>'+escape(title)+'</h3>Bitte vor dem Speichern Hersteller, Sorte und Packung auf deiner Dose prüfen. Ein generischer EAN-Treffer ist noch kein bestätigtes Tabakprodukt.</div>';
      const field=$("scanName");
      if(field&&!field.value.trim())field.value=title.slice(0,160);
    }catch(error){
      if($("remoteLookup")?.dataset.code===code)target.textContent="Online-Suche momentan nicht verfügbar. Die manuelle Zuordnung funktioniert weiterhin.";
    }
  }
  async function lookup(value){
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
      const exists=s.tobaccos.find(t=>sameProduct(t,entry));
      shell(title,"EAN aus dem recherchierten Produktkatalog",
        '<div class="scan-result good"><strong>Produkt gefunden</strong><h3>'+escape(entry.brand+" · "+entry.name)+'</h3>'+escape(entry.quantity_g+" g · "+entry.base)+'</div>'+
        '<p class="smallprint">Quelle: <a href="'+escape(entry.source_url)+'" target="_blank" rel="noopener noreferrer">'+escape(entry.source)+'</a>. Bitte Aufdruck und Packungsgröße mit dem Ergebnis vergleichen.</p>'+
        '<div class="btn-row">'+(exists?btn("link","Barcode dem vorhandenen Tabak zuordnen",{id:exists.id,code,primary:true}):btn("add","In meine Sammlung übernehmen",{code,primary:true}))+btn("rescan","Erneut scannen")+'</div>');
      return;
    }
    const choices=s.tobaccos.length?'<div class="scan-choice"><div class="field"><label for="scanProduct">Oder vorhandenen Tabak zuordnen</label><select id="scanProduct">'+s.tobaccos.map(t=>'<option value="'+escape(t.id)+'">'+escape(t.brand+" · "+t.name)+'</option>').join("")+'</select></div>'+btn("link-selected","Zuordnen",{code})+'</div>':"";
    shell(title,"Code lesbar, Produktzuordnung noch unbekannt",
      '<div class="scan-result warn">Die Nummer hat eine gültige Prüfziffer, ist aber keinem Produkt zugeordnet. <strong>Vergleiche die erkannten Ziffern mit dem Aufdruck direkt unter dem Barcode auf deiner Dose.</strong> Wiederholte Kameratreffer sind kein Nachweis für die richtige Zahl.</div>'+
      '<div class="field"><label for="scanPrintedCode">Gedruckte Ziffern auf der Dose (falls abweichend)</label><div class="btn-row"><input id="scanPrintedCode" type="text" inputmode="numeric" maxlength="20" placeholder="Hier die richtige EAN eintippen" style="flex:1;min-width:160px"><button type="button" class="btn btn-secondary" data-scan-action="check-printed">Erneut prüfen</button></div></div>'+
      '<div class="field" style="margin:14px 0"><label><input id="scanVerified" type="checkbox"> Ich habe die angezeigte EAN mit den Ziffern auf der Verpackung abgeglichen.</label></div>'+
      '<form id="scanNewProduct" class="fields"><div class="field-row"><div class="field"><label for="scanBrand">Hersteller *</label><input id="scanBrand" name="brand" maxlength="120" required placeholder="Hersteller"></div><div class="field"><label for="scanName">Sorte *</label><input id="scanName" name="name" maxlength="160" required placeholder="Sortenname"></div></div>'+
      '<div class="field"><label for="scanBase">Grundtabak</label><select id="scanBase" name="base"><option>Unbekannt</option><option>Virginia</option><option>Dark Blend</option></select></div>'+
      '<input type="hidden" name="code" value="'+escape(code)+'"><button class="btn btn-primary" type="submit">Tabak mit Barcode speichern</button></form>'+
      choices+'<div class="scan-status" id="remoteLookup" data-code="'+escape(code)+'">Öffentliche Produktdatenbank wird abgefragt …</div><p class="smallprint">Externe Quelle: <a href="https://ean-suche.net" target="_blank" rel="noopener noreferrer">EAN-Suche.net</a> (60 Abfragen/Stunde/IP laut Anbieter). Die App überträgt ausschließlich die EAN an den Dienst. Es wird keine Produktzuordnung geraten. Deine lokale EAN-Zuordnung bleibt Teil des JSON-Backups.</p>');
    // Leading-zero unknowns are especially easy to confuse with truncated UPC reads.
    // Avoid wasting third-party queries before the physical print is verified.
    if(!/^0{3}/.test(code))void queryExternal(code);
    else {
      const remote=$("remoteLookup");
      if(remote)remote.textContent="Auffälliger Null-Präfix: Bitte zuerst die gedruckten Ziffern vergleichen. Eine Online-Abfrage kann nach Bestätigung gestartet werden.";
    }
  }
  function persistBarcode(code,product){
    try{
      const s=state();
      if(!DB.some(p=>normalizeCode(p.ean)===code) && !$("scanVerified")?.checked)
        throw Error("Bitte zunächst die EAN unter dem Barcode auf der Dose abgleichen und bestätigen.");
      const current=s.tobaccos.find(t=>(t.barcodes||[]).some(x=>normalizeCode(x)===code));
      if(current)throw Error("Diese EAN ist bereits "+current.brand+" · "+current.name+" zugeordnet.");
      if(product.id){
        const stored=s.tobaccos.find(t=>t.id===product.id);
        if(!stored)throw Error("Tabak nicht mehr vorhanden.");
        stored.barcodes=[...new Set([...(stored.barcodes||[]),code])];
      }else{
        if(!product.brand||!product.name)throw Error("Hersteller und Sorte eingeben.");
        const entry=DB.find(p=>normalizeCode(p.ean)===code);
        const exists=s.tobaccos.find(t=>entry?sameProduct(t,entry):(norm(t.brand)===norm(product.brand)&&norm(t.name)===norm(product.name)));
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
    if(event.target?.id==="scanManualFocus"){
      clearTimeout(focusTimer);
      const value=event.target.value;
      const label=$("scanFocusValue");if(label)label.textContent=Number(value).toFixed(1);
      focusTimer=setTimeout(()=>void changeCameraRange("focus",value),180);
      return;
    }
    if(event.target?.id==="scanZoom"){
      clearTimeout(zoomTimer);
      const value=event.target.value;
      const label=$("scanZoomValue");if(label)label.textContent=Number(value).toFixed(1);
      zoomTimer=setTimeout(()=>void changeCameraRange("zoom",value),180);
      return;
    }
    if(!["f-brand","f-name"].includes(event.target?.id))return;
    const b=$("f-brand"),n=$("f-name"),box=$("catalogResults");
    if(!b||!n||!box)return;
    const brand=norm(b.value),name=norm(n.value);
    if(!brand&&!name)return;
    const matches=DB.filter(p=>(!brand||norm(p.brand).includes(brand))&&(!name||[p.name,...(p.aliases||[])].some(label=>norm(label).includes(name)))).slice(0,9);
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
    if(cmd==="torch")void toggleCameraLight();
    if(cmd==="autofocus")void requestFocus();
    if(cmd==="check-printed"){
      const printed=String($("scanPrintedCode")?.value||"");
      const value=normalizeCode(printed);
      if(!value){
        const n=$("scanPrintedCode");if(n)n.setCustomValidity("Ungültige EAN/UPC (Länge oder Prüfziffer).");
        if(n){n.reportValidity();n.setCustomValidity("");}
      }else void lookup(value);
    }
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
    if(event.target.id==="scanAltFormats" && (started||starting)){
      void (async()=>{await stop();status("Barcodeformat geändert. Kamera bitte erneut starten.");})();
    }
    if(event.target.id==="scanVerified" && event.target.checked && $("remoteLookup")?.dataset.code?.startsWith("000")){
      void queryExternal($("remoteLookup").dataset.code);
    }
  });
  dialog.addEventListener("cancel",()=>{void stop();});
  dialog.addEventListener("click",event=>{if(event.target===dialog)close();});
  window.addEventListener("pagehide",()=>{void stop();});
  // Unprivileged diagnostic API for automated checks; no personal records exposed.
  window.TabakBarcode={normalizeCode,catalogCount:DB.length,sameProduct,createScanConsensus,validForScanMode,decodedFormat,cameraFeatures,applyAutoFocus,applyManualFocus,applyZoom,applyTorch};
})();
