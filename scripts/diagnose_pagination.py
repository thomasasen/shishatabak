from scripts.import_products import Source,parsed_title
from bs4 import BeautifulSoup
from urllib.parse import urlparse
import json
targets=[
 ("Turaah","https://turaah.de","/Shisha-Tabak"),
 ("Blubberhaus","https://www.blubberhaus.de","/Shisha-Tabak"),
 ("Shisha-Shop.de","https://shisha-shop.de","/Shisha-Tabak"),
 ("Wolke7","https://wolke7shishashop.de","/Shisha-Tabak-200g"),
 ("SUN-VI","https://www.sunvi.de","/Shisha-Tabak-Wasserpfeifentabak")
]
for name,base,root in targets:
    s=Source(base,10,0.8)
    variations=[root,root+"?p=2",root+"_s2",root+"?seite=2",root+"?af=50"]
    out=[]
    for suffix in variations:
        html=s.get(base+suffix)
        if not html:out.append({"path":suffix,"error":"not_accessible"});continue
        soup=BeautifulSoup(html,"html.parser")
        cards=soup.select(".productbox-title a[href]")
        titles=[a.get_text(" ",strip=True) for a in cards]
        pager=[]
        for a in soup.select("a[href]"):
            href=a.get("href","")
            txt=a.get_text(" ",strip=True)
            if any(x in (href+" "+txt).lower() for x in ("seite 2","page=2","?p=2","_s2","weiter","next","?p=","?seite=")):
                if href not in pager:pager.append(href[:170])
        out.append({"path":suffix,"titles":titles[:3],"num":len(titles),"allUnique":len(set(titles)),"paginationLinks":pager[:15]})
    print(json.dumps({"source":name,"robots":s.error or "allowed","results":out},ensure_ascii=False),flush=True)
