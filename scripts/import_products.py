#!/usr/bin/env python3
"""Import public product facts with GTIN, package size and individual source URL."""
import argparse
import csv
import datetime
import io
import json
import re
import time
import urllib.parse
import urllib.robotparser
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree

import requests
from bs4 import BeautifulSoup

ROOT=Path(__file__).resolve().parents[1]
DB=ROOT/"catalog/products.json"
REPORT=ROOT/"catalog/import-report.json"
DAY=datetime.date.today().isoformat()
AGENT="TabakjournalCatalogBot/0.3 (+https://github.com/thomasasen/shishatabak)"
SITES=[
  ("Shisha-Nil","https://www.shisha-nil.de",["/tabak/shisha-tabak/200g-tabak/","/tabak/shisha-tabak/25g-tabak/","/tabak/shisha-tabak/100g-tabak/","/tabak/shisha-tabak/alle-tabake/"]),
  ("Shisharia","https://shisharia.de",["/shisha-tabak-200g","/shisha-tabak-25g","/shisha-tabak-100g"]),
  ("Turaah","https://turaah.de",["/Shisha-Tabak"]),
  ("Blubberhaus","https://www.blubberhaus.de",["/Shisha-Tabak"]),
  ("Shisha-Shop.de","https://shisha-shop.de",["/Shisha-Tabak"]),
]
GTIN_RE=re.compile(r"(?:GTIN(?:/EAN)?|EAN)\s*[:：]?\s*(?:\|\s*)?(\d{8}|\d{12,14})\b",re.I)
TITLE_RE=re.compile(r"^(.+?)\s+(?:Shisha[- ]?Tabak|Tobacco|Tabak)\s+(?:(?:Core|Line|Strong|Standard|Premium|Red Series)\s+)?(\d{2,4})\s*g\s*[-–:]\s*(.+)$",re.I)
FALLBACK_RE=re.compile(r"^(.+?)\s+(\d{2,4})\s*g\s*[-–:]\s*(.+)$",re.I)
PRODUCT_RE=re.compile(r"(?:shisha|tobacco|tabak).*(?:20|25|50|100|150|180|200|250|500|1000)-?g\b",re.I)
SIZE_SET={20,25,50,100,150,180,200,250,500,1000}

def valid_gtin(s):
    if not isinstance(s,str) or not re.fullmatch(r"\d{8}|\d{12,14}",s):return False
    v=0;w=3
    for d in reversed(s[:-1]):
        v+=int(d)*w;w=1 if w==3 else 3
    return (10-v%10)%10==int(s[-1])

def parsed_title(s):
    s=" ".join(s.split())
    # Require an explicit tobacco product heading; size alone is not enough.
    m=TITLE_RE.match(s)
    if not m:return None
    brand,size,name=m.groups()
    brand=brand.strip(" -");name=name.strip(" -")
    # Exclude placeholder headings (missing variety) and trim marketing subheadlines.
    if name.lower() in ("shisha tabak","tabak","tobacco","shisha tobacco"):return None
    if ": " in name and len(name)>45:name=name.split(": ",1)[0].strip()
    if not 2<=len(brand)<=90 or not 2<=len(name)<=130 or int(size) not in SIZE_SET:return None
    if any(x in s.lower() for x in ("tabakersatz","aroma shot","molasse","dampfstein")):return None
    return brand,name,int(size)

def parse_product(html,url,source):
    soup=BeautifulSoup(html,"html.parser")
    h=soup.find("h1")
    parsed=parsed_title(h.get_text(" ",strip=True)) if h else None
    if not parsed:return None,"no_clear_product_title"
    brand,name,size=parsed
    ld=set()
    for elem in soup.select('script[type="application/ld+json"]'):
        try: todo=[json.loads(elem.string or elem.get_text())]
        except (TypeError,ValueError):continue
        while todo:
            node=todo.pop()
            if isinstance(node,list):todo.extend(node);continue
            if not isinstance(node,dict):continue
            if "@graph" in node:todo.append(node["@graph"])
            types=node.get("@type",[])
            if isinstance(types,str):types=[types]
            if not any(str(t).lower().endswith("product") for t in types):continue
            for field in ("gtin13","gtin14","gtin12","gtin8","gtin"):
                value=node.get(field)
                if isinstance(value,(str,int)) and valid_gtin(str(value)):ld.add(str(value))
    content=soup.get_text(" ",strip=True)
    visible={m.group(1) for m in GTIN_RE.finditer(content) if valid_gtin(m.group(1))}
    values=ld or visible
    if len(values)!=1:return None,("no_gtin" if not values else "ambiguous_gtin")
    base="Unbekannt"
    m=re.search(r"\bTabakart\s*[:：]?\s*(?:\|\s*)?(Virginia|Dark\s*Blend)\b",content,re.I)
    if m:base="Virginia" if "virginia" in m.group(1).lower() else "Dark Blend"
    return {
      "ean":next(iter(values)),"brand":brand,"name":name,"quantity_g":size,
      "base":base,"flavor":"","source":source,"source_url":url,
      "verified_at":DAY,
    },"ok"

class Source:
    def __init__(self,base,limit,delay):
        self.base=base;self.host=urllib.parse.urlparse(base).netloc
        self.session=requests.Session();self.session.headers.update({"User-Agent":AGENT})
        self.limit=limit;self.count=0;self.delay=delay;self.last=0
        self.robots=urllib.robotparser.RobotFileParser()
        self.error=""
        try:
            r=self.session.get(base+"/robots.txt",timeout=(8,15))
            if r.status_code==404:self.robots.parse([])
            elif r.status_code==200 and len(r.content)<1000000:self.robots.parse(r.text.splitlines())
            else:self.error="robots_http_"+str(r.status_code)
        except requests.RequestException:self.error="robots_unreachable"
        if not self.error:
            try:self.delay=max(self.delay,min(float(self.robots.crawl_delay(AGENT) or self.robots.crawl_delay("*") or 0),20))
            except (ValueError,TypeError):pass
    def allowed(self,url):
        parsed=urllib.parse.urlparse(url)
        return not self.error and parsed.scheme=="https" and parsed.netloc==self.host and self.robots.can_fetch(AGENT,url)
    def get(self,url):
        if not self.allowed(url) or self.count>=self.limit:return None
        wait=self.delay-(time.monotonic()-self.last)
        if wait>0:time.sleep(wait)
        self.count+=1;self.last=time.monotonic()
        try:
            r=self.session.get(url,timeout=(8,17))
            if not self.allowed(r.url) or r.status_code!=200 or len(r.content)>5000000:return None
            return r.text
        except requests.RequestException:return None

def is_product_url(url):
    return bool(PRODUCT_RE.search(urllib.parse.urlparse(url).path))

def discover(source,roots):
    result=set()
    # Bounded sitemap discovery, including sitemap indexes.
    queue=[source.base+"/sitemap.xml",source.base+"/sitemap_index.xml"]
    seen=set()
    while queue and len(seen)<45:
        url=queue.pop(0)
        if url in seen:continue
        seen.add(url)
        xml=source.get(url)
        if not xml or "<loc>" not in xml:continue
        try:root=ElementTree.fromstring(xml)
        except ElementTree.ParseError:continue
        index=root.tag.lower().endswith("sitemapindex")
        for e in root.iter():
            if not e.tag.lower().endswith("loc") or not e.text:continue
            link=e.text.strip()
            if not source.allowed(link):continue
            if index:queue.append(link)
            elif is_product_url(link):result.add(link)
    # Independent fallbacks when sitemap endpoints are absent or incomplete.
    for root in roots:
        for page in range(1,5):
            url=source.base+root+("?" if "?" not in root else "&")+"p="+str(page)
            html=source.get(url)
            if not html:continue
            soup=BeautifulSoup(html,"html.parser")
            for anchor in soup.select("a[href]"):
                link=urllib.parse.urldefrag(urllib.parse.urljoin(url,anchor["href"]))[0]
                if source.allowed(link) and is_product_url(link):
                    result.add(link)
    return sorted(result)

def collect_store(name,base,roots,current,max_requests,max_products,delay):
    source=Source(base,max_requests,delay)
    report={"name":name,"robots":source.error or "allowed","new":0,"requests":0,"discovered":0,"inspected":0,"reasons":{}}
    if source.error:return report
    links=discover(source,roots)
    report["discovered"]=len(links)
    existing={x.get("source_url","").split("?")[0] for x in current.values()}
    why=Counter()
    for url in links:
        if report["inspected"]>=max_products or source.count>=source.limit:break
        if url.split("?")[0] in existing:continue
        html=source.get(url)
        if not html:why["not_retrieved"]+=1;continue
        report["inspected"]+=1
        item,reason=parse_product(html,url,name)
        if not item:why[reason]+=1;continue
        if item["ean"] in current:
            why["already_catalogued"]+=1
            continue
        current[item["ean"]]=item;report["new"]+=1
    report["requests"]=source.count
    report["reasons"]=dict(why)
    return report

def from_datakick(current):
    report={"name":"Datakick CC0","new":0}
    try:
        resp=requests.get("https://gtinsearch.org/items.csv",headers={"User-Agent":AGENT},timeout=(8,50))
        resp.raise_for_status()
        if len(resp.content)>40000000:raise ValueError("download too large")
        rows=csv.DictReader(io.StringIO(resp.content.decode("utf-8-sig",errors="replace")))
        candidates=0
        for row in rows:
            r={str(k).lower():str(v or "") for k,v in row.items() if k}
            title=next((r[k] for k in ("name","title","product_name","description") if r.get(k)),"")
            brand=next((r[k] for k in ("brand","brand_name","manufacturer") if r.get(k)),"")
            gtin=next((r[k] for k in ("gtin14","gtin","ean","upc","barcode") if r.get(k)),"")
            if not any(q in (title+" "+brand).lower() for q in ("shisha","hookah","waterpipe","wasserpfeife")):continue
            title_parts=parsed_title(title)
            if not title_parts or not valid_gtin(gtin):continue
            candidates+=1
            if gtin in current:continue
            b,n,grams=title_parts
            current[gtin]={"ean":gtin,"brand":brand.strip() or b,"name":n,"quantity_g":grams,
                           "base":"Unbekannt","flavor":"","source":"Datakick CC0",
                           "source_url":"https://gtinsearch.org/download","verified_at":DAY}
            report["new"]+=1
        report["eligible_products"]=candidates
    except (requests.RequestException,ValueError) as exc:
        report["error"]=str(exc)[:160]
    return report

def main():
    cli=argparse.ArgumentParser()
    cli.add_argument("--max-requests",type=int,default=370)
    cli.add_argument("--max-products",type=int,default=300)
    cli.add_argument("--delay",type=float,default=1.0)
    options=cli.parse_args()
    if not (10<=options.max_requests<=450 and 5<=options.max_products<=350 and options.delay>=0.8):
        cli.error("out-of-range limits")
    data=json.loads(DB.read_text(encoding="utf-8"))
    products={p["ean"]:p for p in data["products"]}
    before=len(products)
    reports=[from_datakick(products)]
    caps={"Shisha-Nil":300,"Shisharia":95,"Turaah":230,"Blubberhaus":190,"Shisha-Shop.de":190}
    for name,base,roots in SITES:
        cap=min(options.max_products,caps[name])
        requests=min(options.max_requests,cap+80)
        report=collect_store(name,base,roots,products,requests,cap,options.delay)
        reports.append(report)
        print(json.dumps(report,ensure_ascii=False),flush=True)
    updated=sorted(products.values(),key=lambda p:(p["brand"].casefold(),p["name"].casefold(),p["quantity_g"],p["ean"]))
    assert all(valid_gtin(p["ean"]) for p in updated)
    if len(products)>before:
        data["products"]=updated
        data["updated_at"]=DAY
        DB.write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    report={"timestamp_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "before":before,"after":len(products),"added":len(products)-before,
            "sources":reports}
    REPORT.write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__":main()
