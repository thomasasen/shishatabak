import unittest
from scripts.import_products import valid_gtin, parsed_title, parse_product
class ImportTests(unittest.TestCase):
    def test_gtin(self):
        self.assertTrue(valid_gtin("4260623441833"))
        self.assertFalse(valid_gtin("4260623441834"))
        self.assertTrue(valid_gtin("022099552697"))
    def test_titles(self):
        self.assertEqual(parsed_title("Holster Tobacco 200g - Bono"),("Holster","Bono",200))
        self.assertEqual(parsed_title("Shades Shisha Tabak 200g - Ananazz"),("Shades","Ananazz",200))
        self.assertEqual(parsed_title("Darkside Shisha Tabak Core 100g - Astro T"),("Darkside","Astro T",100))
        self.assertIsNone(parsed_title("USB Adapter 200g - Black"))
    def test_html(self):
        p,r=parse_product("<h1>Holster Tobacco 200g - Bono</h1><div>GTIN/EAN: 4255799709528 Tabakart: Virginia</div>","https://www.shisha-nil.de/holster-tobacco-200g-bono","Shisha-Nil")
        self.assertEqual(r,"ok")
        self.assertEqual(p["ean"],"4255799709528")
        self.assertEqual(p["base"],"Virginia")
    def test_ambiguous(self):
        p,r=parse_product("<h1>Holster Tobacco 200g - Bono</h1><p>GTIN/EAN: 4255799709528 EAN: 4260623441833</p>","https://www.shisha-nil.de/holster-tobacco-200g-bono","Shisha-Nil")
        self.assertEqual(r,"ambiguous_gtin")
        self.assertIsNone(p)
if __name__=="__main__":unittest.main()
