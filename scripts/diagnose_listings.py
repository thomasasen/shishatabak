from scripts.import_products import Source
from bs4 import BeautifulSoup
from scripts.import_listings import product_title,GTIN,STORES
import json
for name,base,root,_ in STORES:
    s=Source(base,3,0.8)
    page=s.get(base+root)
    if page is None:
        print(json.dumps({"source":name,"robots":s.error,"result":"no HTML"}));continue
    soup=BeautifulSoup(page,"html.parser")
    links=[(a.get_text(" ",strip=True)[:95],a.get("href","")[:90]) for a in soup.select("a[href]") if a.get_text(" ",strip=True)]
    parsed=[(title,href) for title,href in links if product_title(title)]
    sample_gtins=[m.group(1) for m in GTIN.finditer(soup.get_text(" ",strip=True))][:7]
    plain=soup.get_text(" ",strip=True)
    samples={}
    for needle in ("Shisha Tabak 200g","Shades","Adalya","GTIN","EAN","productbox","productbox-title","schema.org/Product"):
        index=page.lower().find(needle.lower())
        txtindex=plain.lower().find(needle.lower())
        samples[needle]={"htmlOccurrences":page.lower().count(needle.lower()),"at":index,"htmlAround":page[max(0,index-100):index+230] if index>=0 else None,"textAround":plain[max(0,txtindex-60):txtindex+180] if txtindex>=0 else None}
    classes={}
    for selector in (".productbox",".productbox-title",".productbox__title","article.productbox","a.productbox-title","[itemtype*=Product]"):
        nodes=soup.select(selector)
        classes[selector]={"count":len(nodes),"firstText":nodes[0].get_text(" ",strip=True)[:240] if nodes else ""}
    print(json.dumps({"source":name,"htmlBytes":len(page),"title":soup.title.get_text(" ",strip=True)[:120] if soup.title else None,"links":len(links),"matchingTitles":len(parsed),"samples":parsed[:3],"otherLinks":links[:4],"GTINs":sample_gtins,"classCounts":classes,"needles":samples,"bodyStart":plain[:200]},ensure_ascii=False))
