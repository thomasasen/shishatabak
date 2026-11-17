#!/usr/bin/env python3
"""Red-team checks of GTIN product catalog.

Checks integrity and source provenance, not legal rights or physical-package truth.
Never equates a mathematically valid GTIN with confirmed product identity.
"""
import argparse
import json
import re
from collections import Counter,defaultdict
from pathlib import Path
from urllib.parse import urlparse
ROOT=Path(__file__).resolve().parents[1]
def valid_gtin(s):
    if not isinstance(s,str) or not re.fullmatch(r"\d{8}|\d{12,14}",s):
        return False
    total=0
    weight=3
    for digit in reversed(s[:-1]):
        total+=int(digit)*weight
        weight=1 if weight==3 else 3
    return (10-total%10)%10==int(s[-1])

VALID_BASE={"Virginia","Dark Blend","Unbekannt"}
VALID_SIZES={20,25,50,100,125,150,180,200,250,500,1000}
BANNED=re.compile(r"(e[\s-]?liquid|e[\s-]?zigarette|vape[\s-]?pod|dampfsteine|molasse|tabakersatz|nikotinbeutel|nicotine\s+pouch)",re.I)
GENERIC={"shisha tabak","tabak","tobacco","shisha tobacco","geschmacksrichtung","alle sorten"}
ALIASES={
  "almassiva":"Al Massiva",
  "187":"187 Tobacco",
  "aqua mentha premium":"Aqua Mentha",
  "savu premium":"Savu",
}

def check(products):
    fatal=[];warn=[];by_gtin={};by_url=defaultdict(set)
    families=defaultdict(list);brandnames=Counter();sources=Counter()
    for i,p in enumerate(products):
        label=f"products[{i}]"
        code=p.get("ean")
        if not valid_gtin(code):fatal.append({"id":label,"issue":"invalid_gtin","ean":code})
        if code in by_gtin:
            fatal.append({"id":label,"issue":"duplicate_gtin","ean":code,"other":by_gtin[code]})
        by_gtin[code]=label
        gtin14=str(code).zfill(14)
        if gtin14 in by_gtin and by_gtin[gtin14]!=label and gtin14!=code:
            warn.append({"id":label,"issue":"padded_gtin_collision","ean":code})
        fields=("brand","name","source","source_url")
        if any(not isinstance(p.get(k),str) or not p[k].strip() for k in fields):
            fatal.append({"id":label,"issue":"missing_required_field"})
            continue
        if not isinstance(p.get("quantity_g"),int) or p["quantity_g"] not in VALID_SIZES:
            fatal.append({"id":label,"issue":"unrecognized_pack_size","size":p.get("quantity_g")})
        if p.get("base") not in VALID_BASE:
            fatal.append({"id":label,"issue":"unrecognized_tobacco_base","base":p.get("base")})
        src=p["source_url"]
        parsed=urlparse(src)
        if parsed.scheme!="https" or not parsed.netloc or parsed.username or parsed.password:
            fatal.append({"id":label,"issue":"unsafe_source_url","url":src})
        else:
            by_url[src.split("?")[0]].add(str(code))
        title=p["brand"]+" "+p["name"]
        if BANNED.search(title):
            fatal.append({"id":label,"issue":"non_tobacco_product","title":title})
        if p["name"].strip().casefold() in GENERIC:
            fatal.append({"id":label,"issue":"generic_variety","title":title})
        if len(p["name"])>110:
            warn.append({"id":label,"issue":"very_long_variety","title":title[:110]})
        if p["brand"].casefold() in ALIASES and p["brand"]!=ALIASES[p["brand"].casefold()]:
            warn.append({"id":label,"issue":"brand_alias","brand":p["brand"],"canonical":ALIASES[p["brand"].casefold()]})
        if not p.get("flavor"):
            pass
        brandnames[p["brand"]]+=1
        sources[p["source"]]+=1
        family=(p["brand"].casefold().strip(),re.sub(r"[^a-z0-9]","",p["name"].lower()),p["quantity_g"])
        families[family].append(str(code))
    for url,codes in by_url.items():
        if len(codes)>1:
            # A published regulatory register contains many products under one URL.
            # Only waive the detail-page collision when there is a distinct, nonempty
            # original product ID for every EAN and all rows are explicitly EAN typed.
            registry=[p for p in products if p.get("source_url","").split("?")[0]==url and p.get("source")=="RIVM EU-CEG"]
            refs=[p.get("source_reference") for p in registry]
            # EU-CEG ProductID identifies a product; the same ProductID can appear
            # in multiple official presentations with distinct EANs and pack weights.
            official=len(registry)==len(codes) and all(
                ref and re.fullmatch(r"\d{5}-\d{2}-\d{5}",ref) and
                p.get("evidence_type")=="EU-CEG ProductNumberType=EAN" and p.get("market")=="NL"
                for ref,p in zip(refs,registry))
            if not official:
                warn.append({"issue":"multiple_gtins_same_detail_url","source_url":url,"count":len(codes)})
    multi=sum(1 for codes in families.values() if len(codes)>1)
    return {
      "summary":{
        "ean_records":len(products),
        "distinct_gtins":len(by_gtin),
        "brands_or_lines":len(brandnames),
        "tobacco_base_unknown":sum(p.get("base")=="Unbekannt" for p in products),
        "flavor_missing":sum(not p.get("flavor") for p in products),
        "families_multiple_gtins":multi,
        "source_counts":dict(sources),
        "fatal_issues":len(fatal),
        "warnings":len(warn)
      },
      "fatal":fatal,
      "warnings":warn[:300],
      "note":"GTIN checksum and source-URL syntax cannot prove the barcode exists on the physical pack. External supplier data is not independently verified."
    }

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--input",default=str(ROOT/"catalog/products.json"))
    parser.add_argument("--report",default=str(ROOT/"catalog/audit-report.json"))
    args=parser.parse_args()
    products=json.loads(Path(args.input).read_text(encoding="utf8"))["products"]
    report=check(products)
    Path(args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(json.dumps(report["summary"],ensure_ascii=False,indent=2))
    return 1 if report["fatal"] else 0

if __name__=="__main__":
    raise SystemExit(main())
