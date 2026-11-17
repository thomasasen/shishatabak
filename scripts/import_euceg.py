#!/usr/bin/env python3
"""Import only official EAN-labelled waterpipe tobacco presentations (RIVM EU-CEG).

The EU-CEG ProductID, SUBMITTER ProductNumber and SKU are NOT EANs.
"""
from __future__ import annotations
import argparse
import datetime
import io
import json
import re
import zipfile
from collections import Counter
from pathlib import Path
from xml.etree import ElementTree as ET
import requests
from scripts.audit_catalog import valid_gtin,VALID_SIZES,ROOT

DATA_URL="https://www.rivm.nl/sites/default/files/2026-05/Kopie-van-Lijst-van-waterpijptabak-RIVM-2026_0.xlsx"
SOURCE_URL="https://www.rivm.nl/documenten/lijst-van-waterpijptabak-rivm-2026"
DB=ROOT/"catalog/products.json"
REPORT=ROOT/"catalog/euceg-import-report.json"
NS="{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"

def cells_from_xlsx(content):
    with zipfile.ZipFile(io.BytesIO(content)) as archive:
        names=archive.namelist()
        shared=[]
        if "xl/sharedStrings.xml" in names:
            strings=ET.fromstring(archive.read("xl/sharedStrings.xml"))
            shared=["".join(el.text or "" for el in cell.iter(NS+"t")) for cell in strings.findall(NS+"si")]
        sheet=next((p for p in names if re.fullmatch(r"xl/worksheets/sheet[0-9]+\.xml",p)),None)
        if not sheet:raise ValueError("No Excel worksheet")
        root=ET.fromstring(archive.read(sheet))
        for row in root.iter(NS+"row"):
            values={}
            for cell in row.findall(NS+"c"):
                m=re.match(r"[A-Z]+",cell.get("r",""))
                if not m:continue
                raw=cell.find(NS+"v")
                inline=cell.find(NS+"is")
                value=raw.text if raw is not None else "".join(t.text or "" for t in inline.iter(NS+"t")) if inline is not None else ""
                value=value or ""
                if cell.get("t")=="s" and value.isdigit():
                    value=shared[int(value)] if int(value)<len(shared) else ""
                values[m.group(0)]=str(value).strip()
            yield values

def parse_registry(content):
    rows=iter(cells_from_xlsx(content))
    try: headers=next(rows)
    except StopIteration:raise ValueError("Empty source workbook")
    required={"C":"ProductTypeEN","G":"BrandName","H":"BrandSubtypeName",
              "L":"PackageNetWeight","M":"ProductNumberType","N":"ProductNumber"}
    for col,name in required.items():
        if headers.get(col)!=name:raise ValueError("Unexpected registry column "+col+": "+str(headers.get(col)))
    found={};errors=Counter()
    for record in rows:
        if record.get("C","").casefold()!="waterpipe tobacco":
            errors["not_waterpipe_tobacco"]+=1;continue
        if record.get("M","").strip().upper()!="EAN":
            errors["not_ean_number_type"]+=1;continue
        code=record.get("N","").strip()
        if not valid_gtin(code):
            errors["invalid_ean"]+=1;continue
        brand=record.get("G","").strip()
        name=record.get("H","").strip()
        if len(brand)<2 or len(name)<2 or name in {"-","--","N/A"}:
            errors["missing_brand_or_variety"]+=1;continue
        value=record.get("L","")
        try:grams=float(value)
        except ValueError:errors["invalid_weight"]+=1;continue
        if not grams.is_integer() or int(grams) not in VALID_SIZES:
            errors["unsupported_weight"]+=1;continue
        p={
            "ean":code,"brand":brand,"name":name,"quantity_g":int(grams),
            "base":"Unbekannt","flavor":"","source":"RIVM EU-CEG",
            "source_url":SOURCE_URL,
            "verified_at":datetime.date.today().isoformat(),
            "market":"NL","source_reference":record.get("D",""),
            "evidence_type":"EU-CEG ProductNumberType=EAN"
        }
        if code in found:
            old=found[code]
            if old is None:
                errors["additional_conflicting_ean_in_registry"]+=1
                continue
            if (old["brand"].casefold(),old["name"].casefold(),old["quantity_g"])!=(brand.casefold(),name.casefold(),int(grams)):
                errors["conflicting_ean_in_registry"]+=1
                found[code]=None
            else:errors["duplicate_ean_presentation"]+=1
        else:found[code]=p
    clean=[p for p in found.values() if p is not None]
    return clean,dict(errors)

def merge_source(products,entries):
    catalog={p["ean"]:p for p in products}
    accepted=[]
    conflicts=[]
    for p in entries:
        code=p["ean"]
        if code in catalog:
            existing=catalog[code]
            brand_ok=existing["brand"].casefold().replace(" ","")==p["brand"].casefold().replace(" ","")
            name_ok=existing["name"].casefold().replace(" ","")==p["name"].casefold().replace(" ","")
            if (not brand_ok and not name_ok) or existing["quantity_g"]!=p["quantity_g"]:
                conflicts.append({"ean":code,"existing_brand":existing["brand"],"registry_brand":p["brand"],
                                  "existing_name":existing["name"],"registry_name":p["name"],
                                  "existing_weight":existing["quantity_g"],"registry_weight":p["quantity_g"]})
            continue
        catalog[code]=p
        accepted.append(p)
    return accepted,conflicts

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--input",default=str(DB))
    parser.add_argument("--report",default=str(REPORT))
    args=parser.parse_args()
    data=json.loads(Path(args.input).read_text(encoding="utf8"))
    old=data["products"]
    result=requests.get(DATA_URL,headers={"User-Agent":"TabakjournalPublicRegistryResearch/0.4"},timeout=(8,35))
    result.raise_for_status()
    if len(result.content)>5_000_000:raise ValueError("RIVM resource unexpectedly large")
    entries,rejected=parse_registry(result.content)
    imported,conflicts=merge_source(old,entries)
    report={
        "source":SOURCE_URL,
        "retrieved_at_utc":datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "source_candidates":len(entries),
        "imported":len(imported),
        "existing_total":len(old),
        "after_total":len(old)+len(imported),
        "rejected":rejected,
        "cross_source_conflicts":conflicts[:80],
        "rules":"Only type=Waterpipe tobacco, ProductNumberType=EAN, mod-10 valid and known pack weight. Internal ProductIDs and SUBMITTER numbers never counted as EAN."
    }
    Path(args.report).write_text(json.dumps(report,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    if imported:
        data["products"].extend(imported)
        data["products"].sort(key=lambda p:(p["brand"].casefold(),p["name"].casefold(),p["quantity_g"],p["ean"]))
        data["updated_at"]=datetime.date.today().isoformat()
        Path(args.input).write_text(json.dumps(data,ensure_ascii=False,indent=2)+"\n",encoding="utf8")
    print(json.dumps(report,ensure_ascii=False,indent=2))

if __name__=="__main__":main()
