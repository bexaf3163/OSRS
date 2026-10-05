"""Readable output of a machine: the conditions as a string, the step tree with indents."""
import json
import sys

sys.path.insert(0, '.')


def rq(q, ref, depth=0):
    n = q['reqs'][ref] if isinstance(ref, str) else ref
    o = n['o']
    latch = '!' if n.get('latch') else ''
    if o in ('and', 'or', 'nor', 'nand'):
        return '%s%s(%s)' % (latch, o.upper(), ', '.join(rq(q, a) for a in n['a']))
    if o == 'item':
        return 'item(%s%s%s%s%s)' % (n.get('nm') or n.get('ids'), ' x%d' % n['q'] if n.get('q') else '', ' eq' if n.get('eq') else '',
                                     ' +bank' if n.get('bank') else '', ' ids=%s' % n['ids'][:2] if n.get('ids') else '')
    if o == 'zone':
        return 'zone%s%s' % ('!' if n.get('out') else '', n['z'])
    if o == 'vb':
        if 'bit' in n:
            return 'vb%d.bit%d=%d' % (n['id'], n['bit'], n['set'])
        return 'vb%d %s %s' % (n['id'], n.get('op', '=='), n.get('v'))
    if o == 'vp':
        if 'bit' in n:
            return 'vp%d.bit%d=%d' % (n['id'], n['bit'], n['set'])
        if 'vs' in n:
            return 'vp%d in %s>>%s' % (n['id'], n['vs'], n.get('sh'))
        return 'vp%d %s %s' % (n['id'], n.get('op', '=='), n.get('v'))
    if o in ('chat', 'mes'):
        return '%s%s%s' % (latch, o, n['m'])
    if o == 'dlg':
        return 'dlg%s%s' % ('[%s]' % n['who'] if n.get('who') else '', n['m'])
    if o == 'wt':
        return 'wt(%d,%d%s)%s' % (n['g'], n['c'], ',ch' if n.get('ch') else '', n['m'])
    if o == '?':
        return '?(%s)' % n.get('d')
    return json.dumps(n, ensure_ascii=False)


def nd(q, ref, ind=0, out=None):
    out = out if out is not None else []
    n = q['nodes'][ref] if isinstance(ref, str) else ref
    pad = '  ' * ind
    if 's' in n:
        out.append('%s-> %s%s' % (pad, n['s'], '  [lock %s]' % rq(q, n['l']) if n.get('l') else ''))
        return out
    out.append('%s[%s]%s' % (pad, n.get('n') or '', '  [lock %s]' % rq(q, n['l']) if n.get('l') else ''))
    for c, ch in n['c']:
        out.append('%s if %s' % (pad, rq(q, c)))
        nd(q, ch, ind + 2, out)
    out.append('%s else' % pad)
    nd(q, n['d'], ind + 2, out)
    return out


def show(q, stage=None):
    for k, ref in q['stages'].items():
        if stage is not None and str(stage) != k:
            continue
        print('== stage', k)
        print('\n'.join(nd(q, ref, 1)))


if __name__ == '__main__':
    import build
    sid = sys.argv[1]
    q = build.build_quest(sid)
    show(q, sys.argv[2] if len(sys.argv) > 2 else None)
    print('alias', q['alias'], 'unknown', q['unknown'])
