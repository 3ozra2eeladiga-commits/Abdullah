import sys,re,os
s=open(sys.argv[1],encoding='utf-8').read()
s=re.sub(r'<!doctype html>\s*','',s,flags=re.I)
for t in ('<html lang="ru">','</html>','<head>','</head>','<body>','</body>'): s=s.replace(t,'')
s=re.sub(r'<meta charset="utf-8">\s*','',s); s=re.sub(r'<meta name="viewport"[^>]*>\s*','',s)
s=s.replace('<title>Локация Комфорта — строим дома</title>','<title>Локация Комфорта</title>\n<meta name="claude:viewport-fit-sides" content="cover">',1)
s=s.replace('<script>document.documentElement.classList.add("js")</script>','')
s=s.replace('body{font-family:Montserrat','html{color-scheme:light}\nbody{font-family:Montserrat',1)
s=s.replace('padding:16px 0;color:var(--ink);','padding:calc(16px + env(safe-area-inset-top,0px)) 0 16px;color:var(--ink);',1)
demo='<div style="position:fixed;left:50%;bottom:calc(10px + env(safe-area-inset-bottom,0px));transform:translateX(-50%);z-index:40;background:rgba(21,21,21,.82);color:#fafaf8;font:500 10px/1 Montserrat,system-ui,sans-serif;letter-spacing:.22em;text-transform:uppercase;padding:9px 14px;white-space:nowrap">Концепт нового сайта · демо</div>\n'
open(sys.argv[2],'w',encoding='utf-8').write(s);print(round(os.path.getsize(sys.argv[2])/1e6,2),'MB')
