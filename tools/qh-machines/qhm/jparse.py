"""A small parser of the Java subset that the Quest Helper quest sources need:
tokens, expressions (calls, new, fields, literals, binary/unary), statements (declarations, assignments, calls), class methods.
Everything the parser does not understand turns into a node ('unk', text) — not into an error: a condition with an unknown piece later gives "unknown"."""
import re

TOKEN_RE = re.compile(r'''
  (?P<ws>\s+)|
  (?P<comment>//[^\n]*|/\*.*?\*/)|
  (?P<str>"(?:[^"\\]|\\.)*")|
  (?P<chr>'(?:[^'\\]|\\.)')|
  (?P<num>0[xX][0-9a-fA-F]+[lL]?|\d+\.\d+[fFdD]?|\d+[lLfFdD]?)|
  (?P<id>[A-Za-z_$][A-Za-z_0-9$]*)|
  (?P<op>->|::|==|!=|<=|>=|&&|\|\||\+\+|--|\+=|-=|\.\.\.|[(){}\[\];,.=<>!+\-*/%&|^?:@~])
''', re.X | re.S)


def tokenize(src):
    toks = []
    pos = 0
    while pos < len(src):
        m = TOKEN_RE.match(src, pos)
        if not m:
            pos += 1
            continue
        pos = m.end()
        k = m.lastgroup
        if k in ('ws', 'comment'):
            continue
        toks.append((k, m.group(k)))
    toks.append(('eof', ''))
    return toks


def unquote(s):
    body = s[1:-1]
    out, i = [], 0
    while i < len(body):
        c = body[i]
        if c == '\\' and i + 1 < len(body):
            n = body[i + 1]
            out.append({'n': '\n', 't': '\t', '"': '"', "'": "'", '\\': '\\'}.get(n, n))
            i += 2
        else:
            out.append(c)
            i += 1
    return ''.join(out)


class Parser:
    def __init__(self, toks):
        self.t = toks
        self.i = 0

    def peek(self, k=0):
        j = self.i + k
        return self.t[j] if j < len(self.t) else ('eof', '')

    def at(self, text, k=0):
        return self.peek(k)[1] == text and self.peek(k)[0] in ('op', 'id')

    def next(self):
        tok = self.t[self.i]
        self.i += 1
        return tok

    def eat(self, text):
        if self.at(text):
            self.i += 1
            return True
        return False

    def expect(self, text):
        if not self.eat(text):
            raise SyntaxError('expected %r, found %r (token %d)' % (text, self.peek(), self.i))

    # ---------- expressions ----------
    BINOPS = [['||'], ['&&'], ['|'], ['^'], ['&'], ['==', '!='], ['<', '>', '<=', '>='], ['+', '-'], ['*', '/', '%']]

    def expr(self):
        return self.ternary()

    def ternary(self):
        c = self.binary(0)
        if self.at('?'):
            self.next()
            a = self.ternary()
            self.expect(':')
            b = self.ternary()
            return ('tern', c, a, b)
        return c

    def binary(self, level):
        if level >= len(self.BINOPS):
            return self.unary()
        left = self.binary(level + 1)
        while self.peek()[0] == 'op' and self.peek()[1] in self.BINOPS[level]:
            op = self.next()[1]
            # "<" after a type name occurs in generics only in new/declarations; in expressions it is a comparison
            right = self.binary(level + 1)
            left = ('bin', op, left, right)
        return left

    def unary(self):
        tok = self.peek()
        if tok[0] == 'op' and tok[1] in ('!', '-', '+', '~'):
            self.next()
            return ('un', tok[1], self.unary())
        return self.postfix(self.primary())

    def args(self):
        self.expect('(')
        out = []
        if not self.at(')'):
            while True:
                out.append(self.expr())
                if self.eat(','):
                    continue
                break
        self.expect(')')
        return out

    def skip_generics(self):
        """Skip <...> (generics) if they stand here."""
        if not self.at('<'):
            return
        depth = 0
        while True:
            tok = self.next()
            if tok[1] == '<':
                depth += 1
            elif tok[1] == '>':
                depth -= 1
            elif tok[1] == '>>':
                depth -= 2
            if depth <= 0 or tok[0] == 'eof':
                return

    def skip_balanced(self, open_, close):
        depth = 0
        while True:
            tok = self.next()
            if tok[0] == 'op' and tok[1] == open_:
                depth += 1
            elif tok[0] == 'op' and tok[1] == close:
                depth -= 1
                if depth == 0:
                    return
            elif tok[0] == 'eof':
                return

    def primary(self):
        tok = self.peek()
        k, v = tok
        if k == 'str':
            self.next()
            return ('lit', unquote(v))
        if k == 'chr':
            self.next()
            return ('lit', unquote(v))
        if k == 'num':
            self.next()
            s = v.rstrip('lLfFdD') if not v.lower().startswith('0x') else v.rstrip('lL')
            try:
                return ('lit', int(s, 0))
            except ValueError:
                return ('lit', float(s))
        if k == 'op' and v == '(':
            # a type cast (Type) expr / a lambda (a, b) -> ... / parentheses
            j = self.i + 1
            depth = 1
            while depth and self.t[j][0] != 'eof':
                if self.t[j][1] == '(' and self.t[j][0] == 'op':
                    depth += 1
                elif self.t[j][1] == ')' and self.t[j][0] == 'op':
                    depth -= 1
                j += 1
            after = self.t[j] if j < len(self.t) else ('eof', '')
            if after[1] == '->':
                params = [t[1] for t in self.t[self.i + 1:j - 1] if t[0] == 'id']
                self.i = j + 1
                return self.lambda_body(params)
            # a cast: (int) x, (Type) name
            inner = self.t[self.i + 1:j - 1]
            if inner and all(t[0] == 'id' or t[1] in ('.', '<', '>', '[', ']', ',') for t in inner) and after[0] in ('id', 'str', 'num') or (inner and len(inner) == 1 and inner[0][0] == 'id' and after[1] in ('(', '!')):
                if inner[0][1][:1].isupper() or inner[0][1] in ('int', 'long', 'double', 'float', 'boolean', 'String'):
                    self.i = j
                    return ('cast', self.unary())
            self.next()
            e = self.expr()
            self.expect(')')
            return e
        if k == 'id':
            if v == 'new':
                return self.new_expr()
            if v in ('true', 'false'):
                self.next()
                return ('lit', v == 'true')
            if v == 'null':
                self.next()
                return ('lit', None)
            if v == 'this':
                self.next()
                return ('name', 'this')
            # a lambda x -> ...
            if self.peek(1)[1] == '->':
                params = [v]
                self.i += 2
                return self.lambda_body(params)
            self.next()
            if self.at('('):
                return ('call', None, v, self.args())
            return ('name', v)
        if k == 'op' and v == '{':
            # an array initializer {a, b}
            self.next()
            out = []
            while not self.at('}') and self.peek()[0] != 'eof':
                out.append(self.expr())
                if not self.eat(','):
                    break
            self.expect('}')
            return ('arr', out)
        self.next()
        return ('unk', v)

    def lambda_body(self, params=()):
        if self.at('{'):
            self.next()
            body = self.block()
            self.expect('}')
            return ('lambda', list(params), 'block', body)
        return ('lambda', list(params), 'expr', self.expr())

    def new_expr(self):
        self.expect('new')
        name = self.next()[1]
        while self.at('.'):
            self.next()
            name = self.next()[1]
        self.skip_generics()
        if self.at('['):
            # new T[]{...} / new T[n]
            while self.at('['):
                self.skip_balanced('[', ']')
            if self.at('{'):
                arr = self.primary()
                return arr
            return ('arr', [])
        args = self.args()
        body = None
        if self.at('{'):
            self.skip_balanced('{', '}')
            body = 'anon'
        return ('new', name, args, body)

    def postfix(self, e):
        while True:
            if self.at('.'):
                self.next()
                if self.at('<'):
                    self.skip_generics()
                name = self.next()[1]
                if self.at('('):
                    e = ('call', e, name, self.args())
                else:
                    e = ('field', e, name)
            elif self.at('::'):
                self.next()
                self.next()
                e = ('mref',)
            elif self.at('['):
                self.next()
                idx = self.expr()
                self.expect(']')
                e = ('index', e, idx)
            elif self.at('++') or self.at('--'):
                self.next()
            else:
                return e

    # ---------- statements ----------
    def statement(self):
        """One statement: ('decl', name, expr) | ('assign', lhs, expr) | ('expr', expr) | ('skip', text)."""
        tok = self.peek()
        if tok == ('op', ';'):
            self.next()
            return None
        if tok == ('op', '{'):
            self.skip_balanced('{', '}')
            return ('skip', '{...}')
        if tok[0] == 'id' and tok[1] in ('if', 'for', 'while', 'switch', 'try', 'do', 'synchronized'):
            self.skip_statement()
            return ('skip', tok[1])
        if tok[0] == 'id' and tok[1] in ('return', 'break', 'continue', 'throw'):
            self.skip_to_semicolon()
            return None
        if tok[0] == 'id' and tok[1] in ('final', 'var') or self.looks_like_decl():
            return self.declaration()
        e = self.expr()
        if self.at('=') or self.at('+=') or self.at('-='):
            op = self.next()[1]
            rhs = self.expr()
            self.eat(';')
            return ('assign', e, rhs)
        self.eat(';')
        return ('expr', e)

    def skip_to_semicolon(self):
        depth = 0
        while True:
            tok = self.next()
            if tok[0] == 'eof':
                return
            if tok[0] == 'op':
                if tok[1] in '({[':
                    depth += 1
                elif tok[1] in ')}]':
                    depth -= 1
                elif tok[1] == ';' and depth <= 0:
                    return

    def skip_statement(self):
        # up to the end of the statement: either a block {...}, or up to ';'; for if/else — both.
        while True:
            tok = self.peek()
            if tok[0] == 'eof':
                return
            if tok == ('op', '{'):
                self.skip_balanced('{', '}')
                if self.at('else'):
                    self.next()
                    if self.at('if'):
                        self.next()
                        if self.at('('):
                            self.skip_balanced('(', ')')
                        continue
                    continue
                return
            if tok == ('op', ';'):
                self.next()
                return
            if tok == ('op', '('):
                self.skip_balanced('(', ')')
                continue
            self.next()

    def looks_like_decl(self):
        """Type name = ... / Type<A, B> name ... / Type[] name ..."""
        j = self.i
        t = self.t
        if t[j][0] != 'id':
            return False
        j += 1
        while t[j][1] == '.' and t[j + 1][0] == 'id':
            j += 2
        if t[j][1] == '<':
            depth = 0
            while True:
                if t[j][1] == '<':
                    depth += 1
                elif t[j][1] == '>':
                    depth -= 1
                elif t[j][1] == '>>':
                    depth -= 2
                elif t[j][0] == 'eof':
                    return False
                j += 1
                if depth <= 0:
                    break
        while t[j][1] == '[' and t[j + 1][1] == ']':
            j += 2
        return t[j][0] == 'id' and t[j + 1][1] in ('=', ';', ',')

    def declaration(self):
        if self.peek()[1] == 'final':
            self.next()
        # the type
        self.next()
        while self.at('.'):
            self.next()
            self.next()
        self.skip_generics()
        while self.at('['):
            self.next()
            self.expect(']')
        items = []
        while True:
            name = self.next()[1]
            while self.at('['):
                self.next()
                self.expect(']')
            init = None
            if self.eat('='):
                init = self.expr()
            items.append(('decl', name, init))
            if self.eat(','):
                continue
            break
        self.eat(';')
        return items[0] if len(items) == 1 else ('multi', items)

    def block(self):
        """The statements up to the closing }."""
        out = []
        while not self.at('}') and self.peek()[0] != 'eof':
            before = self.i
            try:
                s = self.statement()
            except SyntaxError:
                self.i = before
                self.skip_to_semicolon()
                s = ('skip', 'syntax')
            if s is not None:
                out.append(s)
            if self.i == before:
                self.next()
        return out


def parse_class(src):
    """The methods and fields of the file's top class: {'methods': {name: [statements]}, 'ctor': [statements], 'fields': [statements], 'extends': name,
    'name': name, 'imports': {Simple: Full}}."""
    # imports
    imports = {}
    static_imports = {}
    for m in re.finditer(r'^\s*import\s+(static\s+)?([\w.]+?)(?:\.\*)?\s*;', src, re.M):
        full = m.group(2)
        simple = full.split('.')[-1]
        (static_imports if m.group(1) else imports)[simple] = full
    toks = tokenize(src)
    p = Parser(toks)
    # find the class declaration
    name = extends = None
    i = 0
    while i < len(toks):
        if toks[i] == ('id', 'class') and toks[i + 1][0] == 'id':
            name = toks[i + 1][1]
            j = i + 2
            while toks[j][1] != '{' and toks[j][0] != 'eof':
                if toks[j] == ('id', 'extends'):
                    extends = toks[j + 1][1]
                j += 1
            p.i = j + 1
            break
        i += 1
    methods, fields, ctor = {}, [], []
    order = []
    while not p.at('}') and p.peek()[0] != 'eof':
        start = p.i
        # the header up to '{' or ';' at zero bracket depth
        j = p.i
        depth = 0
        kind = None
        while j < len(toks):
            tk = toks[j]
            if tk[0] == 'op':
                if tk[1] == '(':
                    depth += 1
                elif tk[1] == ')':
                    depth -= 1
                elif tk[1] == '<':
                    pass
                elif depth == 0 and tk[1] == '{':
                    kind = 'block'
                    break
                elif depth == 0 and tk[1] == ';':
                    kind = 'semi'
                    break
                elif depth == 0 and tk[1] == '=':
                    kind = 'init'
                    break
            if tk[0] == 'eof':
                break
            j += 1
        if kind is None:
            break
        header = toks[start:j]
        if kind == 'block':
            # a method/constructor/nested class/initializer
            names = [t[1] for t in header]
            paren = next((k for k, t in enumerate(header) if t == ('op', '(')), None)
            if paren is not None and paren > 0 and header[paren - 1][0] == 'id' and 'class' not in names:
                mname = header[paren - 1][1]
                p.i = j + 1
                body = p.block()
                p.expect('}')
                if mname == name:
                    ctor = body
                else:
                    methods[mname] = body
                    order.append(mname)
                continue
            # a nested one: we skip it
            p.i = j
            p.skip_balanced('{', '}')
            continue
        if kind == 'semi':
            # a field without an initializer (or an annotation)
            p.i = j + 1
            continue
        if kind == 'init':
            # a field with an initializer: ... name = expr ;
            names = [t for t in header if t[0] == 'id']
            fname = names[-1][1] if names else None
            p.i = j + 1
            try:
                e = p.expr()
            except SyntaxError:
                e = ('unk', 'syntax')
            p.eat(';')
            if fname:
                fields.append(('decl', fname, e))
            continue
    return {'name': name, 'extends': extends, 'methods': methods, 'ctor': ctor, 'fields': fields, 'imports': imports,
            'static_imports': static_imports, 'order': order}
