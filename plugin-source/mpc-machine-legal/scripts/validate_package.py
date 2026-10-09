#!/usr/bin/env python3
"""Validate portable package structure and integrity inventory."""
from pathlib import Path
import hashlib,json,re,sys
root=Path(__file__).resolve().parents[1];errors=[]
def read_json(rel):
    try:
        v=json.loads((root/rel).read_text());assert isinstance(v,dict);return v
    except Exception as e:errors.append(f'{rel}: {e}');return {}
def req(c,m):
    if not c:errors.append(m)
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
portable=read_json('plugin.json');legacy=read_json('.codex-plugin/plugin.json')
req(portable.get('$schema')=='https://agent-plugins.org/schemas/1.0.0/plugin.schema.json','incorrect portable schema')
req(bool(re.fullmatch(r'(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)',portable.get('version',''))),'invalid release version')
ext=portable.get('extensions',{}).get('com.openai',{});interface=ext.get('interface',{})
req(0<len(interface.get('shortDescription',''))<=30,'listing subtitle must be 1-30 characters')
for key,value in legacy.items():
    if key=='skills':req(value in ('./skills','./skills/'),'unexpected legacy skills location')
    elif key in ('interface','apps'):req(ext.get(key)==value,f'compatibility mismatch: {key}')
    else:req(portable.get(key)==value,f'compatibility mismatch: {key}')
skills=list(root.glob('skills/*/SKILL.md'));req(len(skills)==14,'expected all 14 skills')
for path in skills:
    content=path.read_text();parts=content.split('---',2)
    req(content.startswith('---\n') and len(parts)==3,f'missing skill frontmatter: {path.parent.name}')
    if len(parts)==3:
        n=re.search(r'^name:\s*([^\n]+)',parts[1],re.M);d=re.search(r'^description:\s*(\S.+)',parts[1],re.M)
        req(bool(n) and n.group(1).strip().strip('\"\'')==path.parent.name,f'skill directory/name mismatch: {path.parent.name}');req(bool(d),f'missing description: {path.parent.name}')
for path in root.rglob('*'):
    req(not path.is_symlink(),f'symlink: {path.relative_to(root)}');req(path.name not in ('node_modules','__pycache__','.env'),f'unwanted artifact: {path.relative_to(root)}')
integ=read_json('BUILD_INTEGRITY.json');mode=integ.get('mode','FULL')
if mode=='FULL':
    files=integ.get('files',{});actual={p.relative_to(root).as_posix():sha(p) for p in root.rglob('*') if p.is_file() and p.name!='BUILD_INTEGRITY.json'};req(files==actual,'bundled files differ from integrity inventory')
elif mode=='DELTA_WITH_PINNED_BASE':
    req(integ.get('version')==portable.get('version'),'integrity/plugin version mismatch')
    for rel,expected in integ.get('files',{}).items():
        p=root/rel;req(p.is_file(),f'missing delta file: {rel}')
        if p.is_file():req(sha(p)==expected,f'delta hash mismatch: {rel}')
    for rel,expected in integ.get('pinned_unchanged',{}).items():
        p=root/rel;req(p.is_file(),f'missing pinned base file: {rel}')
        if p.is_file():req(sha(p)==expected,f'pinned base hash mismatch: {rel}')
else:req(False,'unknown integrity mode')
print(json.dumps({'ok':not errors,'errors':errors,'skills':len(skills),'integrity_mode':mode,'scope':'local structural/hash checks; canonical promotion unverified'}));sys.exit(1 if errors else 0)
