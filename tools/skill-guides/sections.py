import re
import sys
sys.stdout.reconfigure(encoding='utf-8')
from wikifetch import wikitext, clean


def sections(page, want, limit=900):
    t = clean(wikitext(page))
    parts = re.split(r'^(={2,4}[^=\n]+={2,4})\s*$', t, flags=re.M)
    for i in range(1, len(parts), 2):
        head = parts[i].strip('= ').strip()
        if any(w.lower() in head.lower() for w in want):
            body = re.sub(r'\n\s*\n', '\n', parts[i + 1]).strip()
            print('##', head)
            print(body[:limit])
            print()


if __name__ == '__main__':
    sections(sys.argv[1], sys.argv[2].split(','), int(sys.argv[3]) if len(sys.argv) > 3 else 900)
