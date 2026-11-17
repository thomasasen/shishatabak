import unittest
import shisha_ean_export as e
from bs4 import BeautifulSoup

class LocalExporterTests(unittest.TestCase):
    def test_gtin(self):
        self.assertTrue(e.gtin_valid('4260623441833'))
        self.assertFalse(e.gtin_valid('4260623441834'))
        self.assertTrue(e.gtin_valid('4260711891496'))
        self.assertTrue(e.gtin_valid('663992173178'))

    def test_titles(self):
        data = e.parse_title('NameLess Tobacco - BLACK NANA (schw. Traube, Minze) #40 - 25g','sunvi')
        self.assertEqual((data['brand'], data['name'], data['quantity_g']), ('Nameless','BLACK NANA #40',25))
        self.assertEqual(data['flavor'], 'schw. Traube, Minze')
        self.assertEqual(e.parse_title('Shades Shisha Tabak 200g - Bluegasmus','shisha-shop')['name'],'Bluegasmus')
        self.assertEqual(e.parse_title('Social Smoke - Voltage - Shisha Tabak 200g','blubberhaus')['name'],'Voltage')
        self.assertIsNone(e.parse_title('187 Shisha Tabak 150g DARKBLEND','shisha-shop'))

    def test_detail(self):
        soup = BeautifulSoup('<html><body><main><h1>NameLess Tobacco - BLACK NANA (schw. Traube, Minze) #40 - 25g</h1><p>Artikelnummer: 41568 GTIN: 4260620113917</p></main></body></html>','html.parser')
        item, reason = e.product_detail(soup, 'sunvi')
        self.assertEqual(reason,'ok')
        self.assertEqual(item['ean'],'4260620113917')

    def test_listing(self):
        class Stub:
            shop=e.SHOPS['sunvi']
            def allowed(self,url):return url.startswith(self.shop.base+'/')
        listing = '<html><div class="productbox"><a class="productbox-title" href="/NameLess-Tobacco-BLACK-NANA-40-25g">NameLess Tobacco - BLACK NANA (schw. Traube, Minze) #40 - 25g</a><div>Artikelnummer: 41568 GTIN: 4260711891496</div></div></html>'
        entries, codes = e.product_urls_from_listing(BeautifulSoup(listing,'html.parser'), Stub())
        self.assertEqual(len(entries),1)
        self.assertEqual(list(codes.values()),['4260711891496'])

if __name__=='__main__':unittest.main()