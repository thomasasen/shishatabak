import unittest
from bs4 import BeautifulSoup
from scripts.import_listings import product_title,parse_listing,product_card
class FakeSource:
    base="https://www.example-shisha.de"
    def allowed(self,url):return url.startswith(self.base+"/")
class ListingTests(unittest.TestCase):
    def test_titles(self):
        self.assertEqual(product_title("Shades Shisha Tabak 200g - Grpporn"),("Shades","Grpporn",200))
        self.assertEqual(product_title("030 Bärenstark 180g"),("030","Bärenstark",180))
        self.assertIsNone(product_title("USB Adapter 200g - Black"))
    def test_card_pairing(self):
        html="""<div class="productbox">
          <a href="/Shades-Shisha-Tabak-200g-Grpporn">Shades Shisha Tabak 200g - Grpporn</a>
          <dl><dt>GTIN:</dt><dd>4260673312022</dd></dl>
          </div>
          <div class="productbox">
          <a href="/Shades-Shisha-Tabak-25g-Rasporn">Shades Shisha Tabak 25g - Rasporn</a>
          <dl><dt>GTIN:</dt><dd>4260673312138</dd></dl></div>"""
        records,reasons,urls=parse_listing(html,FakeSource(),"Test")
        self.assertEqual(len(records),2)
        self.assertEqual(records["4260673312022"]["name"],"Grpporn")
        self.assertEqual(records["4260673312138"]["quantity_g"],25)
    def test_avoid_card_bleed(self):
        html="""<section>
        <article><a href="/A">Shades Shisha Tabak 200g - Grpporn</a></article>
        <article><a href="/B">Shades Shisha Tabak 25g - Rasporn</a></article>
        <p>GTIN: 4260673312022</p></section>"""
        records,reasons,_=parse_listing(html,FakeSource(),"Test")
        self.assertEqual(len(records),0)
    def test_only_valid_check_digit(self):
        html="""<div><a href="/A">Shades Shisha Tabak 200g - Grpporn</a>
          GTIN: 4260673312023</div>"""
        r,_,_=parse_listing(html,FakeSource(),"Test")
        self.assertFalse(r)
if __name__=="__main__":
    unittest.main()
