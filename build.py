from pathlib import Path
import re
root=Path(__file__).resolve().parent
existing=(root/'index.html').read_text()
data=re.search(r'const SEED_IMAGES=(\[.*?\]);',existing,re.S).group(0)
script=(root/'src/app.js').read_text()+'\n'+(root/'src/flow.js').read_text()
template=(root/'src/template.html').read_text()
(root/'index.html').write_text(template.replace('/*DATA*/',data).replace('/*APP*/',script))
