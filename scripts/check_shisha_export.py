#!/usr/bin/env python3
"""Conservative, read-only EAN comparison for shisha EAN exporter JSON files.

Never writes to catalog/products.json. Compare canonical GTINs (padding-aware),
inspect source URL and size, and quarantine ambiguous identities.
"""
import argparse
import json
import re
from collections import Counter
from pathlib import Path

ALIASES = {
    "adalyatabak": "adalya", "alfakhertabak": "alfakher",
    "otobacco": "os", "ostobacco": "os", "187tobacco": "187tobacco",
    "187strassenbande": "187tobacco", "almassivatobacco": "almassiva",
    "maridantobacco": "maridan", "truepassiontobacco": "truepassion",
    "chaostobacco": "chaos", "namelesstobacco": "nameless"
}

def normalize_name(s):
    return re.sub(r"[^a-z0-9]+", "",str(s).casefold())

def brand_key(s):
    k=normalize_name(s)
    return ALIASES.get(k,k)

def valid_gtin(raw):
    if not isinstance(raw,str) or not re.fullmatch(r"\d{8}|\d{12,14}",raw):
        return False
    factor=3;total=0
    for c in reversed(raw[:-1]):
        total+=int(c)*factor;factor=1 if factor==3 else 3
    return (10-total%10)%10==int(raw[-1])

def family(p):
    return (brand_key(p.get("brand","")), normalize_name(p.get("name","")), p.get("quantity_g"))

def run(db,files):
    current=db["products"]
    by_ean={p["ean"].zfill(14):p for p in current}
    by_family={}
    for p in current: by_family.setdefault(family(p),set()).add(p["ean"])
    accepted=[];rejected=[];duplicates=[];seen={};stats=Counter()
    for path in files:
        records=json.loads(path.read_text(encoding="utf-8"))
        if not isinstance(records,list):raise ValueError(f"Erwartete JSON-Liste: {path}")
        for product in records:
            code=product.get("ean") if isinstance(product,dict) else None
            if not valid_gtin(code) or not isinstance(product.get("quantity_g"),int) or not product.get("brand") or not product.get("name") or not str(product.get("source_url","")).startswith("https://"):
                rejected.append({"source_file":path.name,"reason":"invalid_record_or_gtin","record":product});stats['invalid']+=1;continue
            key=code.zfill(14)
            if key in seen:
                prior=seen[key]
                if family(prior)!=family(product):
                    rejected.append({"source_file":path.name,"reason":"conflicting_input_gtin","record":product,"other":prior});stats['conflict']+=1
                else:stats['repeated_upload']+=1
                continue
            seen[key]=product
            if key in by_ean:
                existing=by_ean[key]
                if family(existing)!=family(product):
                    # Different name spellings are common but must not overwrite an existing mapping.
                    duplicates.append({"ean":code,"source_file":path.name,"reason":"known_gtin_identity_differs","incoming":product,"existing":existing});stats['known_with_different_identity']+=1
                else:stats['already_known']+=1
                continue
            same_family=sorted(by_family.get(family(product),set()))
            if same_family:
                # GTIN differences for same pack can be valid revisions or mislabelled SKUs.
                rejected.append({"source_file":path.name,"reason":"possible_packaging_revision_manual_review","other_gtins":same_family,"record":product});stats['possible_revision']+=1
                continue
            accepted.append(product);by_family.setdefault(family(product),set()).add(code)
            stats['new_candidates']+=1
    return accepted,rejected,duplicates,stats


def main():
    parser=argparse.ArgumentParser(description="Export-Daten konservativ mit bestehendem Tabak-Katalog abgleichen, nichts überschreiben")
    parser.add_argument('--catalog',required=True,type=Path,help='Pfad zu catalog/products.json')
    parser.add_argument('--input',required=True,type=Path,nargs='+',help='Ein oder mehrere *_catalog_candidates.json')
    parser.add_argument('--output',type=Path,default=Path('shisha-export/abgleich'))
    args=parser.parse_args()
    catalog=json.loads(args.catalog.read_text(encoding='utf-8'))
    new,review,duplicates,stats=run(catalog,args.input)
    args.output.mkdir(parents=True,exist_ok=True)
    for name,data in [('new_candidates.json',new),('review_candidates.json',review),('already_known_conflicts.json',duplicates)]:
        (args.output/name).write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({'source_files':[str(x) for x in args.input], 'catalog_before':len(catalog['products']), 'new_candidates_without_known_family':len(new), 'review':len(review),'existing_gtin_identity_discrepancies':len(duplicates),'stats':stats},ensure_ascii=False,indent=2))
    print('Hinweis: Dies ist ein READ-ONLY-Abgleich. Der GitHub-Katalog wurde nicht verändert.')

if __name__=='__main__':main()