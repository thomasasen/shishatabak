import unittest
from scripts.audit_catalog import check
def product(code="4260623441833",brand="Argileh",name="ORNG MNT"):
    return {"ean":code,"brand":brand,"name":name,"quantity_g":200,"base":"Virginia","flavor":"Orange, Minze","source":"Shisharia","source_url":"https://shisharia.de/Argileh-Shisha-Tabak-200g-Orng-Mnt"}
class AuditTests(unittest.TestCase):
    def test_correct_record(self):
        report=check([product()])
        self.assertEqual(report["summary"]["fatal_issues"],0)
        self.assertEqual(report["summary"]["ean_records"],1)
    def test_duplicate_ean(self):
        report=check([product(),product()])
        self.assertIn("duplicate_gtin",[x["issue"] for x in report["fatal"]])
    def test_invalid_ean(self):
        report=check([product("4260623441834")])
        self.assertIn("invalid_gtin",[x["issue"] for x in report["fatal"]])
    def test_not_shisha_tobacco(self):
        report=check([product(name="E-Liquid Pod")])
        self.assertIn("non_tobacco_product",[x["issue"] for x in report["fatal"]])
    def test_bad_source(self):
        p=product();p["source_url"]="http://shisharia.de/product"
        report=check([p])
        self.assertIn("unsafe_source_url",[x["issue"] for x in report["fatal"]])
    def test_generic(self):
        report=check([product(name="Shisha Tabak")])
        self.assertIn("generic_variety",[x["issue"] for x in report["fatal"]])
if __name__=="__main__":unittest.main()
