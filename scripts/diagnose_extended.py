"""Inspect public retailer product pages for a defensible GTIN import."""
import json
from bs4 import BeautifulSoup
from scripts.import_products import Source,discover,parse_product,GTIN_RE,valid_gtin
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
    root_html=src.get(base+roots[0]) if not src.error else None
    root_soup=BeautifulSoup(root_html,"html.parser") if root_html else None
    root_links=[{"text":a.get_text(" ",strip=True)[:70],"href":a.get("href","")[:110]} for a in root_soup.select("a[href]") if any(word in (a.get_text(" ",strip=True)+" "+a.get("href","")).lower() for word in ("tabak","tobacco","200g","25g"))] if root_soup else []
    for url in links[:8]:
        html=src.get(url)
        if not html:reasons["no_html"]=reasons.get("no_html",0)+1;continue
        p,why=parse_product(html,url,name)
        if name=="Nargileshop":
            el=BeautifulSoup(html,"html.parser")
            heading=el.find("h1")
            raw=el.get_text(" ",strip=True)
            examples.append({"url":url,"h1":heading.get_text(" ",strip=True)[:110] if heading else None,"validGtins":list({m.group(1) for m in GTIN_RE.finditer(raw) if valid_gtin(m.group(1))})[:5],"jsonLd":len(el.select('script[type="application/ld+json"]'))})
        reasons[why]=reasons.get(why,0)+1
        if p:good.append(p)
        elif len(examples)<3:
            h=BeautifulSoup(html,"html.parser").find("h1")
            examples.append({"url":url,"h1":h.get_text(" ",strip=True)[:130] if h else None})
    print(json.dumps({"source":name,"robots":src.error or "allowed","discovered":len(links),"requests":src.count,"good":good[:4],"reasons":reasons,"failed_examples":examples[:8],"listingLinkSamples":root_links[:8]},ensure_ascii=False),flush=True)
