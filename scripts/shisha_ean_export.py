#!/usr/bin/env python3
"""Lokaler, vorsichtiger Shisha-EAN-Exporter fuer oeffentlich zugaengliche Shopseiten.

Unterstuetzt SUN-VI, Blubberhaus und Shisha-Shop.de. Verarbeitet nur Artikel,
bei denen eine eindeutige Sorte und Packungsgroesse auf einer Einzelproduktseite
und eine gueltige GTIN/UPC nachweisbar sind.

Beachtet robots.txt, pausen, gleiche Domain und HTTP-Fehler; keine Umgehungen.
Ausgabe: *_verified.csv, *_review.csv, *_report.json, *_catalog_candidates.json.

Installieren: python -m pip install requests beautifulsoup4
Beispiel:      python shisha_ean_export.py --site sunvi --max-pages 8
"""
from __future__ import annotations

import argparse
import csv
import datetime as dt
import json
import re
import sys
import time
from collections import Counter
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import urljoin, urlparse, urldefrag, unquote
from urllib.robotparser import RobotFileParser

import requests
from bs4 import BeautifulSoup

USER_AGENT = "ShishaEANResearchBot/1.0 (+https://github.com/thomasasen/shishatabak)"
GTIN_RE = re.compile(r"\b(?:GTIN(?:/EAN)?|EAN(?:\s*[-/]\s*13)?)\s*[:：]?\s*(\d{8}|\d{12,14})\b", re.I)
PACK_RE = re.compile(r"(?<!\d)(?:(?P<g>20|25|50|100|125|150|180|200|250|500|1000)\s*g|(?P<kg>1)\s*kg)\b", re.I)
EXCLUDED_RE = re.compile(r"(?:e[-\s]?liquid|vape|e[-\s]?zigarette|tabakersatz|dampfsteine|molasse|kopf|kohle|schlauch|pfeife)\b", re.I)
WORTHLESS_NAMES = {"tabak", "tobacco", "shisha tabak", "shisha tobacco", "alle sorten", "verschiedene sorten", "darkblend", "virginia"}

@dataclass(frozen=True)
class Shop:
    key: str
    name: str
    base: str
    path: str
    default_pages: int

SHOPS = {
    "sunvi": Shop("sunvi", "SUN-VI", "https://www.sunvi.de", "/Shisha-Tabak-Wasserpfeifentabak", 8),
    "blubberhaus": Shop("blubberhaus", "Blubberhaus", "https://www.blubberhaus.de", "/Shisha-Tabak", 55),
    "shisha-shop": Shop("shisha-shop", "Shisha-Shop.de", "https://shisha-shop.de", "/Shisha-Tabak", 55),
}


def gtin_valid(code: str) -> bool:
    if not re.fullmatch(r"\d{8}|\d{12,14}", code):
        return False
    total, factor = 0, 3
    for digit in code[-2::-1]:
        total += int(digit) * factor
        factor = 1 if factor == 3 else 3
    return (10 - total % 10) % 10 == int(code[-1])


def clean(s: str) -> str:
    return " ".join((s or "").split()).strip()


def grams(text: str) -> int | None:
    matches = list(PACK_RE.finditer(text))
    if not matches:
        return None
    m = matches[-1]
    return 1000 if m.group("kg") else int(m.group("g"))


def parse_title(title: str, site: str) -> dict | None:
    """Avoid importing parent products where no identifiable flavour exists."""
    title = clean(title)
    if EXCLUDED_RE.search(title):
        return None
    size = grams(title)
    if not size:
        return None

    brand, name = "", ""
    # SUN-VI: NameLess Tobacco - BLACK NANA (Traube, Minze) #40 - 25g
    # Other JTL: Social Smoke Shisha Tabak 200g - Voltage
    if site == "sunvi":
        m = re.match(r"^(.+?)\s+[-–]\s+(.+?)\s+[-–]\s*(?:\d+\s*g|1\s*kg)\s*$", title, re.I)
        if m:
            brand, name = m.group(1), m.group(2)
    if not name:
        m = re.match(r"^(.+?)\s+(?:Shisha[- ]?Tabak|Tobacco|Tabak)\s*(?:\d+\s*g|1\s*kg)\s*[-–:]\s*(.+)$", title, re.I)
        if m:
            brand, name = m.group(1), m.group(2)
    if not name:
        m = re.match(r"^(.+?)\s*[-–]\s*(.+?)\s*[-–]\s*(?:Shisha[- ]?Tabak|Tobacco|Tabak)\s*(?:\d+\s*g|1\s*kg)\s*$", title, re.I)
        if m:
            brand, name = m.group(1), m.group(2)
    if not name:
        return None
    brand, name = clean(brand).strip(" -"), clean(name).strip(" -")
    if not (2 <= len(brand) <= 80 and 2 <= len(name) <= 160):
        return None
    if name.casefold() in WORTHLESS_NAMES:
        return None
    canonical = {"nameless tobacco": "Nameless", "nameless": "Nameless", "almassiva tobacco": "Al Massiva", "al massiva tobacco": "Al Massiva", "187 strassenbande": "187 Tobacco", "os tobacco": "O's Tobacco"}
    brand = canonical.get(brand.casefold(), brand)
    taste = ""
    # SUN-VI prints taste components in brackets after variety, not necessarily
    # independently validated; keep as descriptive hint only.
    taste_match = re.search(r"\(([^()]{3,100})\)", name)
    if taste_match and site == "sunvi":
        taste = taste_match.group(1)
        name = clean(name.replace(taste_match.group(0), ""))
    return {"brand": brand, "name": name, "quantity_g": size, "flavor": taste}


def parse_family_title(title: str) -> dict | None:
    """Recognize a parent product with pack size, not an individual flavor.

    E.g. 'Almassiva Shisha Tabak 200g'. This is discovery metadata only;
    it must never itself become a catalog row or receive a guessed EAN.
    """
    title = clean(title)
    if EXCLUDED_RE.search(title) or not grams(title):
        return None
    if not re.search(r"\b(?:Shisha[- ]?Tabak|Tobacco|Tabak)\b", title, re.I):
        return None
    # Reject long navigation/advertisement text masquerading as a product title.
    if len(title) > 120 or title.count("\n"):
        return None
    return {"title": title, "quantity_g": grams(title), "parent": True}


def variant_urls_from_parent(soup: BeautifulSoup, parent_url: str,
                             parent: dict, session: "SafeSession") -> dict[str, dict]:
    """Follow only explicit SKU child links derived from the same parent URL.

    JTL stores variants under URLs like /Almassiva-Shisha-Tabak-200g-5-Palm.
    Never infer GTINs from the parent page's selection options.
    """
    parent_path = urlparse(parent_url).path.rstrip("/")
    result = {}
    if not parent_path or not parent.get("parent"):
        return result
    prefix = parent_path + "-"
    for a in soup.select("a[href]"):
        url = urldefrag(urljoin(parent_url, a.get("href", "")))[0]
        if not session.allowed(url):
            continue
        child_path = urlparse(url).path
        if not child_path.startswith(prefix):
            continue
        # The variant must have a distinct, human-readable extension.
        suffix = unquote(child_path[len(prefix):]).replace("-", " ")
        if not (2 <= len(suffix) <= 95):
            continue
        synthetic_title = parent["title"] + " - " + suffix
        metadata = parse_title(synthetic_title, session.shop.key)
        if metadata is None or metadata["quantity_g"] != parent["quantity_g"]:
            continue
        result[url] = {"title": synthetic_title, **metadata, "parent": False}
    return result


class SafeSession:
    def __init__(self, shop: Shop, delay: float):
        self.shop = shop
        self.delay = delay
        self.last = 0.0
        self.count = 0
        self.http = requests.Session()
        self.http.headers.update({"User-Agent": USER_AGENT, "Accept": "text/html,application/xhtml+xml"})
        self.robot = RobotFileParser()
        robots = shop.base + "/robots.txt"
        try:
            response = self.http.get(robots, timeout=(8, 18))
            if response.status_code == 404:
                self.robot.parse([])  # no restrictions published at that path
            elif response.status_code == 200 and len(response.content) <= 1_000_000:
                self.robot.parse(response.text.splitlines())
            else:
                raise RuntimeError(f"robots.txt HTTP {response.status_code}; stoppe sicherheitshalber")
        except requests.RequestException as exc:
            raise RuntimeError(f"robots.txt nicht erreichbar: {exc}") from exc
        try:
            self.delay = max(self.delay, float(self.robot.crawl_delay(USER_AGENT) or self.robot.crawl_delay("*") or 0))
        except (ValueError, TypeError):
            pass

    def allowed(self, url: str) -> bool:
        p = urlparse(url)
        return p.scheme == "https" and p.netloc.lower() == urlparse(self.shop.base).netloc.lower() and self.robot.can_fetch(USER_AGENT, url)

    def get(self, url: str) -> BeautifulSoup | None:
        if not self.allowed(url):
            return None
        pause = self.delay - (time.monotonic() - self.last)
        if pause > 0:
            time.sleep(pause)
        self.last = time.monotonic()
        self.count += 1
        try:
            r = self.http.get(url, timeout=(8, 25), allow_redirects=True)
            if r.status_code in (403, 429):
                raise RuntimeError(f"Shop verweigert Zugriff (HTTP {r.status_code}); keine weiteren Versuche")
            if not self.allowed(r.url) or r.status_code != 200:
                return None
            if len(r.content) > 6_000_000 or "html" not in r.headers.get("content-type", ""):
                return None
            return BeautifulSoup(r.text, "html.parser")
        except requests.RequestException:
            return None


def product_urls_from_listing(soup: BeautifulSoup, session: SafeSession) -> tuple[dict, dict]:
    results, listing_gtins = {}, {}
    shop_key = session.shop.key
    for anchor in soup.select('a[href]'):
        raw = clean(anchor.get_text(" ", strip=True) or anchor.get("title", ""))
        parsed = parse_title(raw, shop_key)
        if parsed is None:
            parsed = parse_family_title(raw)
        if parsed is None:
            continue
        url = urldefrag(urljoin(session.shop.base, anchor.get("href", "")))[0]
        if not session.allowed(url) or url == session.shop.base:
            continue
        if urlparse(url).path.rstrip("/") == session.shop.path:
            continue
        # Parent products are discovery nodes, never verifiable EAN records.
        results[url] = {"title": raw, **parsed, "parent": bool(parsed.get("parent"))}
        if parsed.get("parent"):
            continue
        # Optional listing EAN only for a single concrete variant card.
        node = anchor
        for _ in range(7):
            node = node.parent
            if node is None or node.name in {"body", "html"}:
                break
            txt = clean(node.get_text(" ", strip=True))
            if len(txt) > 1800:
                break
            nums = {m.group(1) for m in GTIN_RE.finditer(txt) if gtin_valid(m.group(1))}
            if not nums:
                continue
            competing = set()
            for a in node.select("a[href]"):
                other = parse_title(clean(a.get_text(" ", strip=True)), shop_key)
                if other:
                    competing.add(urldefrag(urljoin(session.shop.base, a["href"]))[0])
            if competing and (len(competing) > 1 or url not in competing):
                break
            if len(nums) == 1:
                listing_gtins[url] = next(iter(nums))
            break
    return results, listing_gtins


def product_detail(soup: BeautifulSoup, site: str) -> tuple[dict | None, str]:
    h1 = soup.find("h1")
    if not h1:
        return None, "Keine Produktueberschrift"
    title = clean(h1.get_text(" ", strip=True))
    meta = parse_title(title, site)
    if meta is None:
        # B2B pages sometimes capitalize differently. Do not guess identities.
        return None, "Keine eindeutige Sorte/Groesse im H1"
    main = soup.select_one("main") or soup
    text = clean(main.get_text(" ", strip=True))
    p = text.find(title)
    # Only inspect the product section directly following H1;
    # do not use EANs from recommended products lower in the page.
    near = text[max(0, p):max(0, p) + 1400]
    codes = {m.group(1) for m in GTIN_RE.finditer(near) if gtin_valid(m.group(1))}
    if len(codes) != 1:
        return None, "GTIN fehlt/mehrdeutig im Produktbereich"
    code = next(iter(codes))
    base = "Unbekannt"
    base_match = re.search(r"\b(?:Grundtabak|Tabakart)\s*[:：]?\s*(Virginia|Dark\s*Blend|Darkblend)\b", near, re.I)
    if base_match:
        base = "Virginia" if "virginia" in base_match.group(1).casefold() else "Dark Blend"
    if base == "Unbekannt":
        # Do not infer from marketing copy elsewhere on the site.
        pass
    return {**meta, "ean": code, "base": base}, "ok"


def save_csv(path: Path, records: list[dict], fields: list[str]):
    with path.open("w", newline="", encoding="utf-8-sig") as f:
        writer = csv.DictWriter(f, fieldnames=fields, extrasaction="ignore", delimiter=";")
        writer.writeheader()
        writer.writerows(records)


def run(shop: Shop, args) -> dict:
    session = SafeSession(shop, args.delay)
    pages = min(args.max_pages or shop.default_pages, 60)
    seen = set()
    listing_names = {}
    listing_eans = {}
    empty_pages = 0
    stats = Counter()
    print(f"[{shop.name}] Suche in hoechstens {pages} Kategorieseiten", flush=True)

    for number in range(1, pages + 1):
        suffix = "" if number == 1 else f"_s{number}"
        url = shop.base + shop.path + suffix
        page = session.get(url)
        if page is None:
            stats["category_not_readable"] += 1
            empty_pages += 1
            print(f"  Seite {number}: nicht lesbar (URL: {url})", flush=True)
            if empty_pages >= 2:
                break
            continue
        # Some protection pages report HTTP 200 and contain no actual catalog.
        title = clean(page.title.get_text(" ", strip=True)) if page.title else ""
        if any(tag in title.casefold() for tag in ("just a moment", "one moment", "access denied", "captcha")):
            raise RuntimeError(f"Abrufschutz statt Kategorie-HTML auf {url}: {title}")
        entries, codes = product_urls_from_listing(page, session)
        new = set(entries) - seen
        parent_count = sum(bool(e.get("parent")) for e in entries.values())
        print(f"  Seite {number}: {len(entries)} Artikel-Links "
              f"({parent_count} Sammelartikel), {len(new)} neu", flush=True)
        stats["category_products"] += len(entries)
        stats["parent_products"] += parent_count
        seen.update(entries)
        listing_names.update(entries)
        listing_eans.update(codes)
        empty_pages = 0 if new else empty_pages + 1
        if empty_pages >= 2:
            break

    candidates = dict(listing_names)
    # Expand each parent only through direct, same-shop SKU subpages.
    # Do not stop after max-products parents: max-products refers to detail SKUs.
    urls = []
    for url, meta in list(candidates.items()):
        if meta.get("parent"):
            if args.max_products and len(urls) >= args.max_products:
                break
            try:
                page = session.get(url)
            except RuntimeError:
                raise
            if page is None:
                stats["parent_unavailable"] += 1
                continue
            stats["parent_inspected"] += 1
            children = variant_urls_from_parent(page, url, meta, session)
            stats["variant_links"] += len(children)
            for child_url, child_meta in children.items():
                if child_url not in candidates:
                    candidates[child_url] = child_meta
                if child_url not in urls:
                    urls.append(child_url)
            if not children:
                stats["parent_without_direct_variants"] += 1
        else:
            if url not in urls:
                urls.append(url)

    if args.max_products:
        urls = urls[:args.max_products]
    print(f"[{shop.name}] Pruefe {len(urls)} eindeutige Detailseiten "
          f"(aus {stats['variant_links']} Varianten-Links)", flush=True)
    if not urls:
        print(f"[{shop.name}] Diagnose: keine konkreten Detailseiten erkannt. "
              "Bei Sammelartikeln muessen eindeutige Varianten-Links vorhanden sein; "
              "anderenfalls keine EAN-Zuordnung moeglich.", flush=True)
        stats["no_concrete_products"] += 1

    valid, needs_review = [], []
    date = dt.datetime.now(dt.timezone.utc).date().isoformat()
    for index, url in enumerate(urls, 1):
        listing = candidates[url]
        try:
            detail_html = session.get(url)
        except RuntimeError as exc:
            needs_review.append({"source_url": url, "title": listing["title"], "problem": str(exc)})
            stats["access_denied"] += 1
            break
        if detail_html is None:
            needs_review.append({"source_url": url, "title": listing["title"], "problem": "Detailseite nicht erreichbar"})
            stats["detail_unavailable"] += 1
            continue
        detail, reason = product_detail(detail_html, shop.key)
        if detail is None:
            needs_review.append({"source_url": url, "title": listing["title"], "problem": reason})
            stats["detail_unusable"] += 1
            continue
        listing_gtin = listing_eans.get(url, "")
        if listing_gtin and listing_gtin != detail["ean"]:
            needs_review.append({"source_url": url, "title": listing["title"], "listing_gtin": listing_gtin,
                                 "detail_gtin": detail["ean"], "problem": "EAN-Konflikt: Liste und Detailseite"})
            stats["ean_conflict"] += 1
            continue
        if detail["quantity_g"] != listing["quantity_g"]:
            needs_review.append({"source_url": url, "title": listing["title"], "problem": "Groesse in Liste und Detail widerspruechlich", "detail_gtin": detail["ean"]})
            stats["size_conflict"] += 1
            continue
        if detail["name"].casefold() != listing["name"].casefold():
            needs_review.append({"source_url": url, "title": listing["title"], "problem": "Sortenname in Liste und Detail nicht identisch", "detail_gtin": detail["ean"]})
            stats["name_conflict"] += 1
            continue
        row = {"ean": detail["ean"], "brand": detail["brand"], "name": detail["name"],
               "quantity_g": detail["quantity_g"], "base": detail["base"],
               "flavor": detail["flavor"], "source": shop.name, "source_url": url,
               "verified_at": date, "listing_gtin": listing_gtin, "detail_gtin": detail["ean"]}
        valid.append(row)
        stats["valid"] += 1
        if index % 25 == 0:
            print(f"  {index}/{len(urls)} geprueft, davon {stats['valid']} eindeutige Produkte", flush=True)

    by_gtin = {}
    for row in valid:
        code = row["ean"]
        if code in by_gtin:
            old = by_gtin[code]
            if (old["brand"].casefold(), old["name"].casefold(), old["quantity_g"]) != (row["brand"].casefold(), row["name"].casefold(), row["quantity_g"]):
                needs_review.append({"source_url": row["source_url"], "title": row["name"], "detail_gtin": code, "problem": "Dieselbe GTIN fuer verschiedene Produkte"})
                stats["duplicate_gtin_conflict"] += 1
            continue
        by_gtin[code] = row
    valid = list(by_gtin.values())
    prefix = args.output / shop.key
    fields = ["ean", "brand", "name", "quantity_g", "base", "flavor", "source", "source_url", "verified_at", "listing_gtin", "detail_gtin"]
    review_fields = ["title", "listing_gtin", "detail_gtin", "problem", "source_url"]
    save_csv(Path(str(prefix) + "_verified.csv"), valid, fields)
    save_csv(Path(str(prefix) + "_review.csv"), needs_review, review_fields)
    product_fields = ["ean", "brand", "name", "quantity_g", "base", "flavor", "source", "source_url", "verified_at"]
    candidates = [{k: row[k] for k in product_fields} for row in valid]
    Path(str(prefix) + "_catalog_candidates.json").write_text(json.dumps(candidates, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    if not urls:
        stats["no_concrete_products"] = 1
    report = {"shop": shop.name, "category": shop.base + shop.path,
              "checked_urls": len(urls), "distinct_gtins": len(valid),
              "review_count": len(needs_review), "http_requests": session.count,
              "issues": dict(stats),
              "note": "Checksum and product-detail evidence only; physical packs and rights not verified."}
    Path(str(prefix) + "_report.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"[{shop.name}] Exportiert: {len(valid)} plausible GTINs; {len(needs_review)} Prueffaelle", flush=True)
    return report


def main() -> int:
    parser = argparse.ArgumentParser(description="Shisha-EAN aus oeffentlichen Produktdaten exportieren")
    parser.add_argument("--site", choices=[*SHOPS, "all"], default="sunvi")
    parser.add_argument("--max-pages", type=int, default=None, help="Maximal Kategorieseiten je Website")
    parser.add_argument("--max-products", type=int, default=None, help="Optional: Anzahl gepruefter Detailseiten begrenzen, z.B. 10")
    parser.add_argument("--delay", type=float, default=1.5, help="Mindestabstand zwischen Aufrufen in Sekunden; mindestens 1.0")
    parser.add_argument("--output", type=Path, default=Path("shisha-export"))
    args = parser.parse_args()
    if args.delay < 1.0 or (args.max_pages is not None and not 1 <= args.max_pages <= 60) or (args.max_products is not None and not 1 <= args.max_products <= 5000):
        parser.error("Ungueltige Grenzen; delay >= 1.0 Sekunden, max-pages 1-60, max-products 1-5000")
    args.output.mkdir(parents=True, exist_ok=True)
    names = list(SHOPS) if args.site == "all" else [args.site]
    total = []
    for name in names:
        try:
            total.append(run(SHOPS[name], args))
        except (RuntimeError, requests.RequestException) as exc:
            print(f"[{name}] Sicherer Abbruch: {exc}", file=sys.stderr)
            total.append({"shop": name, "error": str(exc)})
    print("\nGesamtbericht:")
    print(json.dumps(total, ensure_ascii=False, indent=2))
    return int(all("error" in row for row in total))

if __name__ == "__main__":
    raise SystemExit(main())