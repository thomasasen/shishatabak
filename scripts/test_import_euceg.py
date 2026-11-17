import io
import json
import unittest
import zipfile
from scripts.import_euceg import parse_registry,merge_source
def fixture():
    ns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"
    headers={"C":"ProductTypeEN","G":"BrandName","H":"BrandSubtypeName","L":"PackageNetWeight","M":"ProductNumberType","N":"ProductNumber"}
    rows=[headers,
          {"C":"Waterpipe tobacco","G":"Serbetli","H":"Ice Grape Raspberry","L":"50.0","M":"EAN","N":"8697690812727"},
          {"C":"Waterpipe tobacco","G":"Misleading Brand","H":"Not a barcode","L":"50.0","M":"SUBMITTER","N":"8697690812710"},
          {"C":"Waterpipe tobacco","G":"Serbetli","H":"Mint","L":"50.0","M":"EAN","N":"8697690812728"},
          {"C":"Pipe tobacco","G":"Not waterpipe","H":"No","L":"50.0","M":"EAN","N":"8697690812710"}]
    body=['<worksheet xmlns="'+ns+'"><sheetData>']
    for n,row in enumerate(rows,1):
        body.append('<row r="'+str(n)+'">')
        for col,val in row.items():
            body.append('<c r="'+col+str(n)+'" t="inlineStr"><is><t>'+val+'</t></is></c>')
        body.append('</row>')
    body.append('</sheetData></worksheet>')
    output=io.BytesIO()
    with zipfile.ZipFile(output,"w") as zipped:
        zipped.writestr("xl/worksheets/sheet1.xml","".join(body))
    return output.getvalue()
class EUCEGTests(unittest.TestCase):
    def test_only_real_ean(self):
        entries,rejected=parse_registry(fixture())
        self.assertEqual(len(entries),1)
        self.assertEqual(entries[0]["ean"],"8697690812727")
        self.assertEqual(entries[0]["quantity_g"],50)
        self.assertEqual(rejected["not_ean_number_type"],1)
        self.assertEqual(rejected["invalid_ean"],1)
    def test_existing_barcode_never_overwritten(self):
        p={"ean":"8697690812727","brand":"Serbetli","name":"Different name","quantity_g":200}
        result,conflicts=merge_source([p],[{"ean":"8697690812727","brand":"Serbetli","name":"Ice Grape Raspberry","quantity_g":50}])
        self.assertEqual(result,[])
        self.assertEqual(len(conflicts),1)
if __name__=="__main__":unittest.main()
