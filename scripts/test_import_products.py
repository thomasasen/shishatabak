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
        self.assertEqual(parsed_title("187 Shisha Tabak 200g - 040 HAMBURG"),("187","040 HAMBURG",200))
        self.assertEqual(parsed_title("Cloud Smoke Shisha Tabak 200g - Modus"),("Cloud Smoke","Modus",200))
        self.assertIsNone(parsed_title("Aino Tobacco Shisha Tabak 20g - Shisha Tabak"))
        self.assertEqual(parsed_title("Xracher Tobacco Shisha Tabak 20g - MLNBRRY: Fruchtige Explosion mit Honigmelone, Beerenmix und Waldbeeren"),("Xracher Tobacco","MLNBRRY",20))
    def test_html(self):
        p,r=parse_product("<h1>Holster Tobacco 200g - Bono</h1><div>GTIN/EAN: 4255799709528 Tabakart: Virginia</div>","https://www.shisha-nil.de/holster-tobacco-200g-bono","Shisha-Nil")
        self.assertEqual(r,"ok")
        self.assertEqual(p["ean"],"4255799709528")
        self.assertEqual(p["base"],"Virginia")
    def test_turaah_product_gtin(self):
        html='<h1>187 Shisha Tabak 200g - 040 HAMBURG</h1><div>Artikelnummer: 2283TT EAN: 4251822810834</div>'
        p,r=parse_product(html,"https://turaah.de/187-Shisha-Tabak-200g-040-HAMBURG","Turaah")
        self.assertEqual(r,"ok")
        self.assertEqual(p["ean"],"4251822810834")
    def test_ambiguous(self):
        p,r=parse_product("<h1>Holster Tobacco 200g - Bono</h1><p>GTIN/EAN: 4255799709528 EAN: 4260623441833</p>","https://www.shisha-nil.de/holster-tobacco-200g-bono","Shisha-Nil")
        self.assertEqual(r,"ambiguous_gtin")
        self.assertIsNone(p)
if __name__=="__main__":unittest.main()
