"""Real-browser end-to-end QA run: product, data, adversarial, mobile, cross-browser."""
import json
import threading
from functools import partial
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT=Path(__file__).resolve().parent.parent
KEY="tabakjournal:v1"
BASE=""
passed=[]

class Quiet(SimpleHTTPRequestHandler):
    def log_message(self,*args):pass

def storage(page):
    value=page.evaluate("(k)=>localStorage.getItem(k)",KEY)
    return json.loads(value) if value else None

def state(tobaccos=None,sessions=None):
    return {"app":"tabakjournal","version":1,"tobaccos":tobaccos or [],"sessions":sessions or [],"settings":{"bowl":""}}

def product(id,brand,name,score=None,barcodes=None):
    return {"id":id,"brand":brand,"name":name,"quantity_g":200,"base":"Virginia",
            "flavor":"","stock":1,"opened":False,"barcodes":barcodes or [],
            "review":{"tolerability":score,"taste":None,"symptoms":[],"notes":""}}

def historical(id,tobacco_id):
    return {"id":id,"tobaccoId":tobacco_id,"date":"2026-11-17","severity":1,
            "taste":3,"symptoms":["Schwindel"],"notes":"historischer Eintrag"}

def seed(page,data):
    page.goto(BASE)
    page.evaluate("([k,v])=>localStorage.setItem(k,JSON.stringify(v))",[KEY,data])
    page.reload()

def add(page,brand,name,score,notes=None):
    page.locator('.topbar [data-action="add-tobacco"]').click()
    page.locator("#f-brand").fill(brand)
    page.locator("#f-name").fill(name)
    if score is not None:
        page.locator('input[name="tolerability"][value="'+str(score)+'"]').check()
    if notes is not None:
        page.locator(".optional-details summary").click()
        page.locator("#f-review-notes").fill(notes)
    page.locator('#tobacco-form button[type="submit"]').click()
    if score is not None:assert not page.locator("#editorDialog").evaluate("(el)=>el.open")

def verify(label,fn):
    print("START",label,flush=True)
    fn()
    passed.append(label)
    print("PASS",label,flush=True)

def product_suite(browser):
    ctx=browser.new_context()
    page=ctx.new_page()
    errors=[]
    page.on("pageerror",lambda exc:errors.append(str(exc)))
    page.goto(BASE)
    assert "Noch kein Tabak erfasst" in page.locator("#screen").inner_text()
    page.locator('.topbar [data-action="add-tobacco"]').click()
    page.locator("#f-brand").fill("AINO Dark")
    page.locator("#f-name").fill("Conud")
    page.locator(".catalog-result").filter(has_text="Conud Shake").first.click()
    assert page.locator("#f-catalog-ean").input_value()=="4251647513279"
    assert page.locator("#f-quantity_g").input_value()=="200"
    page.locator('input[name="tolerability"][value="4"]').check()
    assert "4 von 5" in page.locator("#ratingFeedback").inner_text()
    page.locator('#tobacco-form button[type="submit"]').click()
    saved=storage(page)
    assert len(saved["tobaccos"])==1
    assert saved["tobaccos"][0]["barcodes"]==["4251647513279"]
    assert saved["tobaccos"][0]["review"]["tolerability"]==4
    assert "brand=" not in page.url
    page.reload()
    assert "Conud Shake" in page.locator("#collectionResults").inner_text()
    page.locator(".tobacco-card").get_by_role("button",name="Bewertung bearbeiten").click()
    page.locator('input[name="tolerability"][value="2"]').check()
    page.locator(".optional-details summary").click()
    page.locator("#f-review-notes").fill("Schlechter verträglich")
    page.locator('input[name="symptom"][value="Übelkeit"]').check()
    page.locator('#tobacco-form button[type="submit"]').click()
    assert len(storage(page)["tobaccos"])==1
    assert storage(page)["tobaccos"][0]["review"]["tolerability"]==2
    assert storage(page)["tobaccos"][0]["review"]["symptoms"]==["Übelkeit"]
    page.reload()
    assert "Schlechter verträglich" in page.locator("#collectionResults").inner_text()
    assert not errors,errors
    ctx.close()

def search_filter_suite(browser):
    ctx=browser.new_context()
    page=ctx.new_page()
    page.goto(BASE)
    add(page,"A Test","Guter Tabak",5)
    add(page,"B Test","Schlechter Tabak",1)
    add(page,"C Test","Mittel Tabak",3)
    assert len(storage(page)["tobaccos"])==3
    field=page.locator("#searchBar")
    field.fill("Guter")
    assert field.evaluate("(el)=>document.activeElement===el")
    assert "Guter Tabak" in page.locator("#collectionResults").inner_text()
    assert "Schlechter Tabak" not in page.locator("#collectionResults").inner_text()
    field.fill("")
    for target,positive,negative in [
        ("good","Guter Tabak","Schlechter Tabak"),
        ("bad","Schlechter Tabak","Guter Tabak"),
    ]:
        page.locator('[data-filter="'+target+'"]').click()
        text=page.locator("#collectionResults").inner_text()
        assert positive in text and negative not in text
        assert page.locator('[data-filter="'+target+'"]').get_attribute("aria-pressed")=="true"
    page.locator('[data-filter="unrated"]').click()
    assert "Keine passenden Tabake" in page.locator("#collectionResults").inner_text()
    page.locator('[data-filter="all"]').click()
    # Duplicate must never add a second record.
    page.locator('.topbar [data-action="add-tobacco"]').click()
    page.locator("#f-brand").fill("A Test")
    page.locator("#f-name").fill("Guter Tabak")
    page.locator('input[name="tolerability"][value="3"]').check()
    page.locator('#tobacco-form button[type="submit"]').click()
    assert page.locator("#editorDialog").evaluate("(el)=>el.open")
    assert len(storage(page)["tobaccos"])==3
    ctx.once("dialog",lambda d:d.accept())
    page.locator('[data-action="close-dialog"]').first.click()
    # Delete cancellation and acceptance.
    page.locator(".tobacco-card").filter(has_text="Guter Tabak").get_by_role("button",name="Bewertung bearbeiten").click()
    page.locator(".optional-details summary").click()
    ctx.once("dialog",lambda d:d.dismiss())
    page.locator('[data-action="delete-tobacco"]').click()
    assert len(storage(page)["tobaccos"])==3
    ctx.once("dialog",lambda d:d.accept())
    page.locator('[data-action="delete-tobacco"]').click()
    assert len(storage(page)["tobaccos"])==2
    ctx.close()

def backup_suite(browser):
    ctx=browser.new_context(accept_downloads=True)
    page=ctx.new_page()
    initial=state([product("legacy","Alt","Archiv",None,["4260623441833"])],[historical("session1","legacy")])
    seed(page,initial)
    assert "Noch nicht bewertet" in page.locator("#collectionResults").inner_text()
    page.locator('[data-view="data"]').first.click()
    with page.expect_download() as item:
        page.locator('[data-action="export"]').click()
    saved=json.loads(Path(item.value.path()).read_text(encoding="utf-8"))
    assert len(saved["sessions"])==1 and len(saved["tobaccos"])==1
    incoming=state([product("external","Alt","Archiv",5)],[historical("session2","external")])
    page.locator("#importFile").set_input_files({
        "name":"merge.json","mimeType":"application/json","buffer":json.dumps(incoming).encode()
    })
    page.wait_for_function("JSON.parse(localStorage.getItem('tabakjournal:v1')).sessions.length===2")
    data=storage(page)
    assert len(data["tobaccos"])==1
    assert data["sessions"][1]["tobaccoId"]=="legacy"
    assert data["tobaccos"][0]["review"]["tolerability"]==5
    # Personal rating wins over imported rating.
    lower=state([product("another","Alt","Archiv",1)])
    page.locator("#importFile").set_input_files({
        "name":"lower.json","mimeType":"application/json","buffer":json.dumps(lower).encode()
    })
    page.wait_for_timeout(150)
    assert storage(page)["tobaccos"][0]["review"]["tolerability"]==5
    before=storage(page)
    page.locator("#importFile").set_input_files({
        "name":"invalid.json","mimeType":"application/json","buffer":b'{"wrong":1}'
    })
    page.wait_for_timeout(150)
    assert storage(page)==before
    ctx.once("dialog",lambda d:d.accept())
    page.locator('[data-action="import-replace"]').click()
    page.locator("#importFile").set_input_files({
        "name":"replace.json","mimeType":"application/json","buffer":json.dumps(state()).encode()
    })
    page.wait_for_function("JSON.parse(localStorage.getItem('tabakjournal:v1')).tobaccos.length===0")
    page.locator('[data-action="import-merge"]').click()
    page.locator("#importFile").set_input_files({
        "name":"restore.json","mimeType":"application/json","buffer":json.dumps(saved).encode()
    })
    page.wait_for_function("JSON.parse(localStorage.getItem('tabakjournal:v1')).tobaccos.length===1")
    assert len(storage(page)["sessions"])==1
    ctx.once("dialog",lambda d:d.dismiss())
    page.locator('[data-action="clear-all"]').click()
    assert len(storage(page)["tobaccos"])==1
    ctx.once("dialog",lambda d:d.accept())
    page.locator('[data-action="clear-all"]').click()
    assert len(storage(page)["tobaccos"])==0 and len(storage(page)["sessions"])==0
    ctx.close()

def collision_suite(browser):
    """A merge must not mistake coinciding IDs for identical products."""
    ctx=browser.new_context()
    page=ctx.new_page()
    local=state([product("shared-id","Lokaler Hersteller","Lokale Sorte",4)],
                [historical("same-session","shared-id")])
    seed(page,local)
    page.locator('[data-view="data"]').first.click()
    incoming=state([product("shared-id","Import Hersteller","Andere Sorte",1)],
                   [historical("same-session","shared-id")])
    page.locator("#importFile").set_input_files({
        "name":"collision.json","mimeType":"application/json",
        "buffer":json.dumps(incoming).encode()
    })
    page.wait_for_function("JSON.parse(localStorage.getItem('tabakjournal:v1')).tobaccos.length===2")
    merged=storage(page)
    assert len(merged["tobaccos"])==2,merged["tobaccos"]
    assert len({entry["id"] for entry in merged["tobaccos"]})==2
    old=next(x for x in merged["tobaccos"] if x["name"]=="Lokale Sorte")
    new=next(x for x in merged["tobaccos"] if x["name"]=="Andere Sorte")
    assert old["id"]=="shared-id" and old["review"]["tolerability"]==4
    assert new["id"]!="shared-id" and new["review"]["tolerability"]==1
    assert len(merged["sessions"])==2,"Same session IDs may not discard imported history"
    assert len({e["id"] for e in merged["sessions"]})==2
    assert {e["tobaccoId"] for e in merged["sessions"]}=={old["id"],new["id"]}
    page.reload()
    assert len(storage(page)["tobaccos"])==2
    ctx.close()

def damaged_storage_suite(browser):
    """Damaged localStorage must remain exportable and restorable by user choice."""
    ctx=browser.new_context(accept_downloads=True)
    page=ctx.new_page()
    page.goto(BASE)
    raw='{"app":"tabakjournal","version":1,"tobaccos":[BROKEN]}'
    page.evaluate("([k,v])=>localStorage.setItem(k,v)",[KEY,raw])
    page.reload()
    assert "konnten nicht sicher gelesen werden" in page.locator("#screen").inner_text()
    assert page.locator("#saveStatus").inner_text()!="Lokal gespeichert"
    assert page.evaluate("(k)=>localStorage.getItem(k)",KEY)==raw
    page.locator('[data-view="data"]').first.click()
    assert "Backup wiederherstellen" in page.locator("#screen h1").inner_text()
    with page.expect_download() as dl:
        page.locator('[data-action="export-raw"]').click()
    assert Path(dl.value.path()).read_text(encoding="utf-8")==raw
    # A second corrupt import must NOT delete the existing raw bytes.
    page.locator('[data-action="import-replace"]').click()
    page.locator("#importFile").set_input_files({
        "name":"bad.json","mimeType":"application/json","buffer":b"BAD INPUT"
    })
    page.wait_for_timeout(200)
    assert page.evaluate("(k)=>localStorage.getItem(k)",KEY)==raw
    # Valid backup restores functional UI after explicit overwrite confirmation.
    restored=state([product("restored","Wiederhergestellt","Tabak",4)])
    ctx.once("dialog",lambda d:d.accept())
    page.locator('[data-action="import-replace"]').click()
    page.locator("#importFile").set_input_files({
        "name":"recovery.json","mimeType":"application/json",
        "buffer":json.dumps(restored).encode()
    })
    page.wait_for_timeout(450)
    current=page.evaluate("(k)=>localStorage.getItem(k)",KEY)
    assert current!=raw,("Recovery did not replace invalid storage; UI message: "+
                        page.locator("#toast").inner_text())
    assert len(storage(page)["tobaccos"])==1
    page.reload()
    assert "Tabak" in page.locator("#collectionResults").inner_text()
    assert storage(page)["tobaccos"][0]["review"]["tolerability"]==4
    ctx.close()


def compact_card_suite(browser):
    """Compact rating cards remain short, readable and fully editable."""
    brand="Sehr lange Marke mit zusätzlichen Wörtern"
    name="Extra lange Produktsorte mit mehreren Aromen und langer Bezeichnung"
    note="Die vollständig gespeicherte persönliche Notiz mit vielen Details " * 4
    for width in (320,390,1280):
        ctx=browser.new_context(viewport={"width":width,"height":800},
                                is_mobile=width<500,has_touch=width<500)
        page=ctx.new_page()
        entry=product("compact-id",brand,name,2)
        entry["review"].update({
            "taste":3,
            "symptoms":["Schwindel","Übelkeit","Kopfschmerzen","Herzrasen"],
            "notes":note
        })
        seed(page,state([entry]))
        card=page.locator(".tobacco-card")
        assert card.count()==1
        assert page.locator(".rating-summary-value").inner_text()=="2/5"
        assert page.locator(".rating-summary-label").inner_text()=="Schlecht"
        button=page.locator(".card-edit")
        bounds=button.bounding_box()
        assert bounds["width"]>=44 and bounds["height"]>=44,(width,bounds)
        assert "Bewertung bearbeiten" in button.get_attribute("aria-label")
        assert page.locator(".review-notes").inner_text()==note
        assert page.locator(".review-symptoms").count()==1
        assert page.locator(".card-extra-row").count()==1
        for selector in (".review-notes",".review-symptoms",".card-meta"):
            css=page.locator(selector).evaluate(
                "(el)=>({overflow:getComputedStyle(el).overflow,"
                "textOverflow:getComputedStyle(el).textOverflow})")
            assert css=={"overflow":"hidden","textOverflow":"ellipsis"},(selector,css)
        card_height=card.bounding_box()["height"]
        assert card_height <= (225 if width<500 else 195),(width,card_height)
        doc=page.evaluate("({scroll:document.documentElement.scrollWidth,"
                          "client:document.documentElement.clientWidth})")
        assert doc["scroll"]<=doc["client"]+1,(width,doc)
        button.click()
        assert page.locator("#editorDialog").evaluate("(el)=>el.open")
        assert page.locator("#f-brand").input_value()==brand
        assert page.locator("#f-name").input_value()==name
        assert page.locator("#f-review-notes").input_value()==note.strip()
        page.locator('[data-action="close-dialog"]').first.click()
        assert len(storage(page)["tobaccos"])==1
        ctx.close()

def adversarial_suite(browser):
    ctx=browser.new_context()
    page=ctx.new_page()
    errors=[]
    page.on("pageerror",lambda exc:errors.append(str(exc)))
    page.goto(BASE)
    add(page,'<img src=x onerror=alert(1)>','<script>window.__hack=1</script>',4,
        notes='"><svg/onload=alert(2)>')
    assert len(storage(page)["tobaccos"])==1
    assert page.locator("#collectionResults script").count()==0
    assert page.locator("#collectionResults img").count()==0
    assert not page.evaluate("Boolean(window.__hack)")
    page.locator('.topbar [data-action="add-tobacco"]').click()
    page.locator("#f-brand").fill("Blocked")
    page.locator("#f-name").fill("Storage")
    page.locator('input[name="tolerability"][value="2"]').check()
    page.evaluate("""() => {const native=Storage.prototype.setItem;
      Storage.prototype.setItem=function(k,v){if(k==='tabakjournal:v1')throw new DOMException('Quota','QuotaExceededError');
      return native.call(this,k,v)}}""")
    page.locator('#tobacco-form button[type="submit"]').click()
    assert page.locator("#editorDialog").evaluate("(el)=>el.open")
    assert len(storage(page)["tobaccos"])==1
    assert "nicht gespeichert" in page.locator("#toast").inner_text()
    assert not errors,errors
    ctx.close()

def cross_browser(browser_type,name):
    browser=browser_type.launch(headless=True,args=["--no-sandbox"] if name=="Chromium" else [])
    try:
        ctx=browser.new_context()
        page=ctx.new_page()
        page.goto(BASE)
        add(page,"Cross","Browser "+name,4)
        page.reload()
        assert storage(page)["tobaccos"][0]["review"]["tolerability"]==4
        assert "Browser "+name in page.locator("#collectionResults").inner_text()
        page.locator('[data-view="data"]').first.click()
        assert "Backup"==page.locator("#screen h1").inner_text()
        ctx.close()
    finally:browser.close()

def mobile(browser_type):
    browser=browser_type.launch(headless=True,args=["--no-sandbox"])
    try:
        for width in (320,375,430,768):
            ctx=browser.new_context(viewport={"width":width,"height":740},is_mobile=True,has_touch=True)
            page=ctx.new_page()
            page.goto(BASE)
            w=page.evaluate("({scroll:document.documentElement.scrollWidth,view:document.documentElement.clientWidth})")
            assert w["scroll"]<=w["view"]+1,(width,w)
            page.locator('.topbar [data-action="add-tobacco"]').click()
            radios=page.locator('input[name="tolerability"]')
            assert radios.count()==5
            positions=[radios.nth(i).bounding_box() for i in range(5)]
            assert max(pos["y"] for pos in positions)-min(pos["y"] for pos in positions)<2
            assert min(pos["width"] for pos in positions)>=43
            page.locator("#f-brand").fill("Mobil")
            page.locator("#f-name").fill("Test")
            radios.nth(3).check()
            page.locator('#tobacco-form button[type="submit"]').click()
            assert len(storage(page)["tobaccos"])==1
            ctx.close()
    finally:browser.close()

def main():
    global BASE
    server=ThreadingHTTPServer(("127.0.0.1",0),partial(Quiet,directory=str(ROOT)))
    threading.Thread(target=server.serve_forever,daemon=True).start()
    BASE="http://127.0.0.1:"+str(server.server_port)+"/"
    try:
        with sync_playwright() as p:
            browser=p.chromium.launch(headless=True,args=["--no-sandbox"])
            try:
                for label,fn in [
                    ("Product: catalog/save/reload/edit",product_suite),
                    ("Product: search/filter/duplicate/delete",search_filter_suite),
                    ("UI: compact rating cards at 320/390/1280 px",compact_card_suite),
                    ("Data: export/import/merge/replace/legacy/clear",backup_suite),
                    ("Data Red Team: colliding product and session IDs",collision_suite),
                    ("Data Recovery: broken localStorage raw export and backup restore",damaged_storage_suite),
                    ("Red Team: injection and storage failure",adversarial_suite),
                ]:verify(label,lambda fn=fn:fn(browser))
            finally:browser.close()
            for name,engine in [("Chromium",p.chromium),("Firefox",p.firefox),("WebKit",p.webkit)]:
                verify("Cross-browser "+name,lambda e=engine,n=name:cross_browser(e,n))
            verify("Mobile: widths 320,375,430,768",lambda:mobile(p.chromium))
        print("QS ERGEBNIS:",len(passed),"Suiten bestanden; 0 Fehler",flush=True)
    finally:
        server.shutdown()
        server.server_close()

if __name__=="__main__":main()
