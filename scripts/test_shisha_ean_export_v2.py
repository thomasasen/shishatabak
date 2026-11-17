import csv
import json
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from bs4 import BeautifulSoup
import shisha_ean_export as e


class TestJTLVariants(unittest.TestCase):
    def test_generic_parent_found_in_listing_and_variant_links_discovered(self):
        shop=e.SHOPS['shisha-shop']
        class Stub:
            def __init__(self): self.shop=shop
            def allowed(self, url): return url.startswith(shop.base+'/')
        listing=BeautifulSoup('''
          <div class="productbox"><a href="/Almassiva-Shisha-Tabak-200g" class="productbox-title">Almassiva Shisha Tabak 200g</a><span>20 Sorten</span></div>
          <div class="productbox"><a href="/Savu-Shisha-Tabak-200g-Strawbelly" class="productbox-title">Savu Shisha Tabak 200g - Strawbelly</a></div>
          <div class="productbox"><a href="/Savu-Shisha-Tabak-200g" class="productbox-title">Savu Shisha Tabak 200g</a></div>
          <a href="/ELFBAR-PODS-20MG">ELFBAR PODS 20mg</a>
        ''','html.parser')
        entries,codes=e.product_urls_from_listing(listing,Stub())
        self.assertEqual(len(entries),3)
        self.assertTrue(entries[shop.base+'/Almassiva-Shisha-Tabak-200g']['parent'])
        self.assertFalse(entries[shop.base+'/Savu-Shisha-Tabak-200g-Strawbelly']['parent'])
        parent=entries[shop.base+'/Almassiva-Shisha-Tabak-200g']
        variants=BeautifulSoup('''
        <main><h1>Almassiva Shisha Tabak 200g</h1>
         <table><tr><td><a href="/Almassiva-Shisha-Tabak-200g-4B">4B</a></td></tr>
         <tr><td><a href="/Almassiva-Shisha-Tabak-200g-5-Palm">5 Palm</a></td></tr></table>
         <a href="/Almassiva-Shisha-Tabak-25g-4B">Wrong pack</a>
         <a href="/Savu-Shisha-Tabak-200g-Other">Other brand</a>
        </main>''','html.parser')
        rows=e.variant_urls_from_parent(variants,shop.base+'/Almassiva-Shisha-Tabak-200g',parent,Stub())
        self.assertEqual(len(rows),2)
        self.assertEqual(rows[shop.base+'/Almassiva-Shisha-Tabak-200g-5-Palm']['name'],'5 Palm')

    def test_end_to_end_fixture_exports_two_unique_skus_and_not_parent(self):
        shop=e.SHOPS['shisha-shop']
        listing='''<main><a href="/Almassiva-Shisha-Tabak-200g" class="productbox-title">Almassiva Shisha Tabak 200g</a></main>'''
        parent='''<main><h1>Almassiva Shisha Tabak 200g</h1><table>
          <tr><td><a href="/Almassiva-Shisha-Tabak-200g-4B">4B</a></td></tr>
          <tr><td><a href="/Almassiva-Shisha-Tabak-200g-5-Palm">5 Palm</a></td></tr>
          </table></main>'''
        detail4='''<main><h1>Almassiva Shisha Tabak 200g - 4B</h1><p>GTIN: 4251776106069</p></main>'''
        detail5='''<main><h1>Almassiva Shisha Tabak 200g - 5 Palm</h1><p>GTIN: 4251776106007</p></main>'''
        fixture={shop.base+'/Shisha-Tabak':listing,
                 shop.base+'/Almassiva-Shisha-Tabak-200g':parent,
                 shop.base+'/Almassiva-Shisha-Tabak-200g-4B':detail4,
                 shop.base+'/Almassiva-Shisha-Tabak-200g-5-Palm':detail5}
        class FakeSession:
            def __init__(self, shop, delay): self.shop=shop;self.count=0
            def allowed(self,url):return url.startswith(self.shop.base+'/')
            def get(self,url):
                self.count+=1
                return BeautifulSoup(fixture[url],'html.parser') if url in fixture else None
        with tempfile.TemporaryDirectory() as temp, patch.object(e,'SafeSession',FakeSession):
            args=SimpleNamespace(delay=1.5,max_pages=1,max_products=20,output=Path(temp))
            report=e.run(shop,args)
            self.assertEqual(report['distinct_gtins'],2)
            self.assertEqual(report['issues']['parent_inspected'],1)
            self.assertEqual(report['issues']['variant_links'],2)
            rows=json.loads((Path(temp)/'shisha-shop_catalog_candidates.json').read_text())
            self.assertEqual({x['ean'] for x in rows},{'4251776106069','4251776106007'})
            self.assertEqual({x['name'] for x in rows},{'4B','5 Palm'})
            self.assertEqual(len(rows),len(set(r['ean'] for r in rows)))
            self.assertTrue(all('200g-' in row['source_url'] for row in rows))

    def test_parent_with_gtin_but_no_variant_does_not_export(self):
        parent=e.parse_family_title('187 Shisha Tabak 200g')
        self.assertIsNotNone(parent)
        class Stub:
            shop=e.SHOPS['blubberhaus']
            def allowed(self,url):return url.startswith(self.shop.base+'/')
        page=BeautifulSoup('''<main><h1>187 Shisha Tabak 200g</h1><p>GTIN: 4251822814863</p><option>040 Hamburg</option></main>''','html.parser')
        self.assertEqual(e.variant_urls_from_parent(page,Stub.shop.base+'/187-Shisha-Tabak-200g',parent,Stub()),{})
        record, reason=e.product_detail(page,'blubberhaus')
        self.assertIsNone(record)

    def test_suspicious_parent_name_not_assigned_gtin(self):
        self.assertIsNone(e.parse_title('187 Shisha Tabak 150g DARKBLEND','shisha-shop'))
        self.assertIsNotNone(e.parse_family_title('187 Shisha Tabak 150g DARKBLEND'))
        self.assertIsNone(e.parse_family_title('100g Vape Liquid'))

if __name__=='__main__':unittest.main()