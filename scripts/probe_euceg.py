"""Inspect public EU-CEG waterpipe-tobacco registry for barcode columns.

Reads only public headers and limited example fields, not a personal-data dataset.
"""
import io
import json
import re
import zipfile
from xml.etree import ElementTree as ET
import requests
URL="https://www.rivm.nl/sites/default/files/2026-05/Kopie-van-Lijst-van-waterpijptabak-RIVM-2026_0.xlsx"
NS="{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
response=requests.get(URL,timeout=(8,35),headers={"User-Agent":"TabakjournalDataResearch/0.1"})
response.raise_for_status()
if len(response.content)>5_000_000:raise ValueError("Unexpectedly large RIVM file")
data=zipfile.ZipFile(io.BytesIO(response.content))
shared=[]
if "xl/sharedStrings.xml" in data.namelist():
    si_root=ET.fromstring(data.read("xl/sharedStrings.xml"))
    shared=["".join(n.text or "" for n in si.iter(NS+"t")) for si in si_root.findall(NS+"si")]
tables=[]
for path in data.namelist():
    if not re.fullmatch(r"xl/worksheets/sheet[0-9]+\.xml",path):
        continue
    root=ET.fromstring(data.read(path))
    rows=[]
    seen_gtins=0
    cols=set()
    cell_count=0
    for row in root.iter(NS+"row"):
        values={}
        for cell in row.findall(NS+"c"):
            addr=cell.attrib.get("r","?")
            v=cell.find(NS+"v")
            inline=cell.find(NS+"is")
            raw=v.text if v is not None else "".join(n.text or "" for n in inline.iter(NS+"t")) if inline is not None else ""
            if raw is None:raw=""
            if cell.attrib.get("t")=="s" and raw.isdigit():
                value=shared[int(raw)] if int(raw)<len(shared) else ""
            else:
                value=raw
            col=re.match(r"[A-Z]+",addr)
            if col:values[col.group(0)]=value
            cell_count+=1
            if re.fullmatch(r"[0-9]{8}|[0-9]{12,14}",str(value or "")):
                seen_gtins+=1
        if len(rows)<7:
            rows.append(values)
    tables.append({"sheet":path,"firstRows":rows,"numCells":cell_count,"gtinLikeCells":seen_gtins})
print(json.dumps({"resource":URL,"bytes":len(response.content),"sheets":tables},ensure_ascii=False))
