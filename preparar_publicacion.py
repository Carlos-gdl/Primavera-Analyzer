#!/usr/bin/env python3
"""Regenera archivos de publicación desde los originales, sin cambiar su lógica.
Uso: python preparar_publicacion.py --version V-76
Ejecutar dentro de la carpeta de archivos del sitio ANTES de publicar la versión.
"""
from pathlib import Path
import argparse,re,json,hashlib
args=argparse.ArgumentParser();args.add_argument('--version',required=True);args=args.parse_args()
if not re.fullmatch(r'V-\d+',args.version):raise SystemExit('Formato requerido: V-76')
p=Path(__file__).resolve().parent
boot=(p/'actualizacion-v75.js').read_text()
prev=json.loads((p/'publicacion-recursos.json').read_text()) if (p/'publicacion-recursos.json').exists() else {}
inverse={v:k for k,v in prev.items()}
sources={}
for page in ['index','masivos','repeat60']:
 s=(p/(page+'.html')).read_text();s=re.sub(r'<!-- PA75-BEGIN -->.*?<!-- PA75-END -->','',s,flags=re.S)
 def restore(m):
  attrs,content=m.groups()
  if 'data-pa-pending' not in attrs:return m[0]
  original=re.search(r'data-pa-original-src="([^"]+)"',attrs)
  if original:attrs=re.sub(r'data-pa-src="[^"]*"','src="'+original[1]+'"',attrs)
  attrs=re.sub(r'\s+(?:type|data-pa-pending|data-pa-original-src)="[^"]*"','',attrs)
  return '<script'+attrs+'>'+content+'</script>'
 s=re.sub(r'<script\b([^>]*)>(.*?)</script>',restore,s,flags=re.S)
 s=re.sub(r'(?<![\w-])(href|src)="([^"]+)"',lambda m:m[1]+'="'+inverse.get(m[2],m[2])+'"',s)
 sources[page]=s
runtime={f.name:f.read_bytes() for f in p.iterdir() if f.suffix in ['.js','.css','.png'] and not re.search(r'\.[a-f0-9]{12}\.',f.name) and f.name!='actualizacion-v75.js'}
names={n:Path(n).stem+'.'+hashlib.sha256(b).hexdigest()[:12]+Path(n).suffix for n,b in runtime.items()}
for n in list(runtime):
 if n.endswith('.css'):
  runtime[n]=re.sub(r'url\(([\'"]?)([^)\'"\s]+)\1\)',lambda m:'url('+m[1]+names.get(m[2],m[2])+m[1]+')',runtime[n].decode()).encode()
  names[n]=Path(n).stem+'.'+hashlib.sha256(runtime[n]).hexdigest()[:12]+'.css'
for n,b in runtime.items():(p/names[n]).write_bytes(b)
release=args.version+'-'+hashlib.sha256(args.version.encode()+boot.encode()+b''.join(runtime[k] for k in sorted(runtime))+''.join(sources.values()).encode()).hexdigest()[:12]
num=args.version.split('-')[1];pages={k:k+'.pa'+num+'.'+release.split('-')[-1]+'.html' for k in sources}
for page,s in sources.items():
 def suspend(m):
  attrs,content=m.groups();match=re.search(r'\bsrc="([^"]+)"',attrs)
  if match:
   original=match[1];url=names.get(original,original);attrs=attrs[:match.start()]+f'data-pa-src="{url}" data-pa-original-src="{original}"'+attrs[match.end():]
  return '<script type="application/x-pa-pending" data-pa-pending=""'+attrs+'>'+content+'</script>'
 s=re.sub(r'<script\b([^>]*)>(.*?)</script>',suspend,s,flags=re.S)
 s=re.sub(r'(?<![\w-])(href|src)="([^"]+)"',lambda m:m[1]+'="'+names.get(m[2],m[2])+'"',s)
 config=json.dumps({'release':release,'version':args.version,'page':page},separators=(',',':'))
 addition='<!-- PA75-BEGIN -->\n<meta name="pa-version" content="'+args.version+'">\n<script id="pa-release-config" type="application/json">'+config+'</script>\n<script>'+boot+'</script>\n<!-- PA75-END -->'
 s=s.replace('</head>',addition+'</head>');(p/(page+'.html')).write_text(s);(p/pages[page]).write_text(s)
(p/'publicacion-recursos.json').write_text(json.dumps(names,indent=2)+'\n')
(p/'version.json').write_text(json.dumps({'schema':1,'version':args.version,'release':release,'pages':pages},indent=2)+'\n')
print(release)
