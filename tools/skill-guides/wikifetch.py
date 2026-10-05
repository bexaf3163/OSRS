"""A cached read of OSRS Wiki article wikitext (MediaWiki parse API). The cache (work/) is not committed."""
import json
import os
import re
import time
import urllib.parse
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.path.join(HERE, 'work')
UA = 'OSRS-Put tracker (https://github.com/bexaf3163/OSRS)'


def wikitext(page):
    os.makedirs(WORK, exist_ok=True)
    f = os.path.join(WORK, re.sub(r'[^A-Za-z0-9_.-]', '_', page) + '.txt')
    if os.path.exists(f):
        return open(f, encoding='utf-8').read()
    q = urllib.parse.urlencode({'action': 'parse', 'page': page, 'prop': 'wikitext', 'redirects': '1', 'formatversion': '2', 'format': 'json'})
    req = urllib.request.Request('https://oldschool.runescape.wiki/api.php?' + q, headers={'User-Agent': UA})
    d = json.load(urllib.request.urlopen(req, timeout=40))
    t = d['parse']['wikitext'] if 'parse' in d else ''
    open(f, 'w', encoding='utf-8').write(t)
    time.sleep(0.3)
    return t


def clean(t):
    t = re.sub(r'\{\{SCP\|([^|}]+)\|([^|}]+)[^}]*\}\}', r'\2 \1 xp', t)
    t = re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]*)\]\]', r'\1', t)
    t = re.sub(r"'''?", '', t)
    t = re.sub(r'<[^>]+>', '', t)
    for _ in range(3):
        t = re.sub(r'\{\{[^{}]*\}\}', '', t)
    return t
