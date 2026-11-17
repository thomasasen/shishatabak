"""Inspect public retailer product pages for a defensible GTIN import."""
import json
from bs4 import BeautifulSoup
from scripts.import_products import Source,discover,parse_product
SITES=[
 ("Jookah","https://jookah.de",["/Shisha-Tabak-200g"]),
 ("Wolke7","https://wolke7shishashop.de",["/Shisha-Tabak-200g"]),
 ("Nargileshop","https://nargileshop.de",["/shisha-tabak/200g-shisha-tabak-kaufen"]),
 ("Shisha Galaxy","https://www.shishagalaxy.de",["/shisha-tabak/alle-tabaksorten-a-z/"]),
]
for name,base,roots in SITES:
    src=Source(base,35,0.8)
    links=discover(src,roots) if not src.error else []
    reasons={}
    good=[]
    examples=[]
    for url in links[:8]:
        html=src.get(url)
        if not html:reasons["no_html"]=reasons.get("no_html",0)+1;continue
        p,why=parse_product(html,url,name)
        reasons[why]=reasons.get(why,0)+1
        if p:good.append(p)
        elif len(examples)<3:
            h=BeautifulSoup(html,"html.parser").find("h1")
            examples.append({"url":url,"h1":h.get_text(" ",strip=True)[:130] if h else None})
    print(json.dumps({"source":name,"robots":src.error or "allowed","discovered":len(links),"requests":src.count,"good":good[:4],"reasons":reasons,"failed_examples":examples},ensure_ascii=False),flush=True)
