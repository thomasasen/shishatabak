#!/usr/bin/env python3
"""Collect source-attributed product/GTIN pairs from retailer listing cards.

Only read visible product-card facts. Robots.txt checked before each site.
No account, bypass, hidden endpoints, descriptions, images or review scraping.
"""
from __future__ import annotations
import argparse
import datetime
import json
import re
import time
from collections import Counter
from pathlib import Path
from urllib.parse import urljoin, urlparse, urldefrag

from bs4 import BeautifulSoup
from scripts.import_products import Source, parsed_title, valid_gtin, DB, ROOT

NOW=datetime.date.today().isoformat()
OUT=ROOT/"catalog/listing-import-report.json"
# JTL shop public category pagination format, not an API endpoint.
STORES=[
  ("Blubberhaus","https://www.blubberhaus.de","/Shisha-Tabak",48),
  ("Shisha-Shop.de","https://shisha-shop.de","/Shisha-Tabak",48),
  ("Mall of Shisha","https://mallofshisha.de","/tabak",12),
  ("SUN-VI","https://www.sunvi.de","/Shisha-Tabak-Wasserpfeifentabak",30),
]
GTIN=re.compile(r"(?:GTIN|EAN)(?:\s*(?:[-/]\s*)?(?:13|14))?\s*[:：]?\s*([0-9]{8}|[0-9]{12,14})\b",re.I)
# Fallback only for known pack formats on tabak-only listing pages.
TRAILING_SIZE=re.compile(r"^([0-9A-Za-zÄÖÜäöüß&+.' -]{4,100})\s+(20|25|50|100|150|180|200|250|500|1000)\s*g$",re.I)
KNOWN_BRANDS={
 "030","187","7days","adalya","aino","alfakher","al waha","aqua mentha",
 "argileh","blackburn","darkside","dschinni","fumari","holster","hookain",
 "kismet","maridan","musth","nameless","revoshi","savu","shades","true passion"
}

def product_title(title: str):
    result=parsed_title(title)
    if result:
        return result
    match=TRAILING_SIZE.match(" ".join(title.split()))
    if not match:
        return None
    head,size=match.groups()
    for brand in sorted(KNOWN_BRANDS,key=len,reverse=True):
        if head.casefold().startswith(brand+" "):
            name=head[len(brand):].strip(" -")
            if len(name)>=2 and "tabak" not in name.casefold():
                return brand,name,int(size)
    return None

def product_card(anchor,site:Source):
    """Find the smallest ancestor containing exactly one product link and GTIN."""
    title=anchor.get_text(" ",strip=True)
    parsed=product_title(title)
    if not parsed:
        return None,"not_tabak"
    link=urldefrag(urljoin(site.base,anchor.get("href","")))[0]
    if not site.allowed(link) or link==site.base:
        return None,"outside_or_disallowed"
    node=anchor
    for depth in range(9):
        node=node.parent
        if node is None or getattr(node,"name",None) in ("body","html"):
            break
        description=node.get_text(" ",strip=True)
        # Avoid page text extraction and avoid ultra-large/ambiguous product cards.
        if len(description)>1800:
            break
        eans={m.group(1) for m in GTIN.finditer(description) if valid_gtin(m.group(1))}
        if not eans:
            continue
        urls=set()
        for item in node.select("a[href]"):
            if product_title(item.get_text(" ",strip=True)):
                u=urldefrag(urljoin(site.base,item["href"]))[0]
                if site.allowed(u):
                    urls.add(u)
        if len(urls)>1:
            return None,"multiple_products_in_card"
        if len(eans)!=1:
            return None,"ambiguous_gtin"
        if urls and link not in urls:
            return None,"mismatched_card"
        brand,name,grams=parsed
        return {
          "ean": next(iter(eans)),
          "brand": brand,"name":name,"quantity_g":grams,
          "base":"Unbekannt","flavor":"",
          "source":"","source_url":link,"verified_at":NOW
        },"ok"
    return None,"gtin_not_on_card"

def parse_listing(html,site,source_name):
    soup=BeautifulSoup(html,"html.parser")
    records={}
    seen=set()
    reasons=Counter()
    for anchor in soup.select("a[href]"):
        title=anchor.get_text(" ",strip=True)
        if not product_title(title):
            continue
        url=urldefrag(urljoin(site.base,anchor["href"]))[0]
        if url in seen:
            continue
        seen.add(url)
        p,reason=product_card(anchor,site)
        if not p:
            reasons[reason]+=1
            continue
        p["source"]=source_name
        if p["ean"] in records:
            prev=records[p["ean"]]
            if (prev["brand"],prev["name"],prev["quantity_g"])!=(p["brand"],p["name"],p["quantity_g"]):
                reasons["conflict_same_gtin_on_page"]+=1
                records.pop(p["ean"],None)
            continue
        records[p["ean"]]=p
    return records,reasons,seen

def collect_store(name,base,root,page_cap,current,delay):
    src=Source(base,page_cap+3,delay)
    result={"source":name,"robots":src.error or "allowed","pages":0,"candidates":0,"new_eans":0,"existing_eans":0,"conflicts":0,"rejections":{}}
    if src.error:
        return result
    reasons=Counter()
    fetched_urls=set()
    blank=0
    for page in range(1,page_cap+1):
        path=root if page==1 else root+"_s"+str(page)
        html=src.get(base+path)
        if not html:
            blank+=1;reasons["not_retrieved"]+=1
            if blank>=3:break
            continue
        entries,rejected,candidates=parse_listing(html,src,name)
        result["pages"]+=1
        reasons.update(rejected)
        never_seen=candidates-fetched_urls
        fetched_urls.update(candidates)
        if not never_seen:
            blank+=1
        else:
            blank=0
        if blank>=3:
            break
        result["candidates"]+=len(entries)
        for ean,product in entries.items():
            if ean in current:
                old=current[ean]
                if ((old["brand"].casefold()!=product["brand"].casefold()) and
                    (old["name"].casefold()!=product["name"].casefold()) and
                    old["quantity_g"]!=product["quantity_g"]):
                    reasons["cross_source_conflict"]+=1
                    result["conflicts"]+=1
                else:
                    result["existing_eans"]+=1
                continue
            current[ean]=product
            result["new_eans"]+=1
    result["requests"]=src.count
    result["rejections"]=dict(reasons)
    return result

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--max-pages",type=int,default=40)
    parser.add_argument("--delay",type=float,default=1.1)
    args=parser.parse_args()
    if not 1<=args.max_pages<=80 or args.delay<0.8:
        parser.error("invalid limits")
    db=json.loads(DB.read_text(encoding="utf-8"))
    data={p["ean"]:p for p in db["products"]}
    before=len(data)
    reports=[]
    for source,base,category,available_pages in STORES:
        report=collect_store(source,base,category,min(args.max_pages,available_pages),data,args.delay)
        reports.append(report)
        print(json.dumps(report,ensure_ascii=False),flush=True)
    if len(data)>before:
        db["products"]=sorted(data.values(),key=lambda x:(x["brand"].casefold(),x["name"].casefold(),x["quantity_g"],x["ean"]))
        db["updated_at"]=NOW
        DB.write_text(json.dumps(db,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    result={"timestamp_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),"before":before,"after":len(data),"added":len(data)-before,"sources":reports}
    OUT.write_text(json.dumps(result,ensure_ascii=False,indent=2)+"\n",encoding="utf-8")
    print(json.dumps(result,ensure_ascii=False,indent=2))
if __name__=="__main__":
    main()
