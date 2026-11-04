import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
os.chdir(HERE)
t = open('page.tpl.html').read()
inline = lambda s: s.replace('/*CHALK*/', open('chalk.js').read()).replace('/*EXAMPLES*/', open('examples.js').read()).replace('/*GUIDE*/', json.dumps(open('guide.txt').read()))
open('sketch-studio-artifact.html', 'w').write(inline(t))
# the school's site: same page, own API, a link back to the admin
s = t.replace('''  const use = window.claude && window.claude.use ? (n) => window.claude.use(n).catch(() => null) : async () => null;
  [sample, db, downloads] = await Promise.all([use("sample"), use("db"), use("downloads")]);''', '''  [sample, db, downloads] = [sampleShim, dbShim, downloadsShim];''')
s = s.replace('''    cancelled: "Stopped." })[code] || "Couldn't draw that. Try again in a moment.";''', '''    cancelled: "Stopped.",
    signed_out: "You've been signed out of the admin. Sign in again in another tab, then try again.",
    no_key: "The studio needs the Anthropic API key. Add it in Admin, Social, Connect to Social, AI searches.",
    network: "Lost the connection to the server. Try again.",
    server: "Claude couldn't finish that one. Try again in a moment." })[code] || "Couldn't draw that. Try again in a moment.";''')
s = s.replace('<!--ADMINLINK-->', '<a class="adminlink" href="/admin">OH-SO ED admin</a>')
s = s.replace('<script>/*CHALK*/</script>', '<script>/*CHALK*/</script>\n<script>' + open('site-shim.js').read() + '</script>')
assert 'sampleShim, dbShim' in s and 'no_key:' in s
doc = ('<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">'
       '<meta name="robots" content="noindex"><link rel="icon" href="/ose-icon.png">'
       '<style>:root{padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}body{margin:0}img{max-width:100%}[hidden]{display:none!important}</style>'
       '</head><body>' + inline(s) + '</body></html>')
open(os.path.join(HERE, '../../src/lib/studio-page.ts'), 'w').write('// Generated from the Sketch Studio page (Claude session, 3 Nov). The whole page, served by /admin/studio.\nexport const STUDIO_HTML = ' + json.dumps(doc) + ';\n')
print(len(doc))
