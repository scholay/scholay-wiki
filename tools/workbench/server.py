#!/usr/bin/env python3
"""Loopback-only Excalidraw / Markdown workbench. Canonical files stay in the vault."""
import argparse, base64, copy, re, hashlib, importlib.util, json, mimetypes, pathlib, threading, time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs, unquote

HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[1]
spec=importlib.util.spec_from_file_location('wiki_sync', ROOT/'tools/wiki/sync.py')
wiki=importlib.util.module_from_spec(spec);spec.loader.exec_module(wiki)
LOCK=threading.RLock()

def revision(raw): return hashlib.sha256(raw).hexdigest()

class Conflict(Exception):
    pass

class Vault:
    def __init__(self,root=ROOT): self.root=pathlib.Path(root).resolve()
    def catalog(self): return json.loads((self.root/'wiki/catalog.json').read_text())
    def path(self,kind,key):
        if kind=='article':
            a=next((a for a in self.catalog()['articles'] if a['slug']==key),None)
            if not a: raise FileNotFoundError('词条不存在')
            path=(self.root/a['path']).resolve();base=self.root/'wiki/pages'
        elif kind=='board':
            if not key.endswith('.excalidraw.md') or pathlib.Path(key).name!=key: raise ValueError('画布名称无效')
            path=(self.root/'wiki/boards'/key).resolve();base=self.root/'wiki/boards'
        else: raise ValueError('类型无效')
        if not path.is_relative_to(base.resolve()): raise ValueError('文件超出内容目录')
        if not path.is_file(): raise FileNotFoundError('文件不存在')
        return path
    def read(self,kind,key):
        path=self.path(kind,key)
        return self.decode(kind,path,path.read_bytes())
    def decode(self,kind,path,raw):
        data={'revision':revision(raw),'path':str(path.relative_to(self.root)),'obsidianUrl':'obsidian://open?path='+__import__('urllib.parse',fromlist=['quote']).quote(str(path),safe='')}
        if kind=='article': data['body']=wiki.split(raw.decode())[1]
        else:
            data['scene']=wiki.read_board(path,raw.decode())[1]
            scene=data['scene'];scene.setdefault('files',{})
            _,_,_,_,tail,_=wiki.sections(raw.decode(),scene)
            for fileid,link in re.findall(r'^([A-Za-z0-9_-]+): \[\[([^\]\n]+)\]\]$',tail,re.M):
                if fileid in scene['files']:continue
                link=unquote(link.split('|')[0].split('#')[0])
                candidates=[(self.root/link).resolve(),(path.parent/link).resolve()]
                resource=next((p for p in candidates if p.is_relative_to(self.root) and p.is_file()),None)
                if not resource:continue
                mime=mimetypes.guess_type(resource.name)[0]
                if mime not in ('image/png','image/jpeg','image/gif','image/webp','image/svg+xml'):continue
                scene['files'][fileid]={'id':fileid,'mimeType':mime,'dataURL':'data:'+mime+';base64,'+base64.b64encode(resource.read_bytes()).decode(),'created':0,'lastRetrieved':0}

        return data
    def write(self,kind,key,payload):
        with LOCK:
            path=self.path(kind,key);raw=path.read_bytes()
            if payload.get('revision')!=revision(raw): raise Conflict('文件已在其他编辑器中修改，请先核对两个版本。')
            if kind=='article':
                body=payload.get('body')
                if not isinstance(body,str): raise ValueError('正文必须是文本')
                fm,_=wiki.split(raw.decode());a=next(a for a in self.catalog()['articles'] if a['slug']==key)
                if not body.splitlines() or body.splitlines()[0]!='# '+a['title']:
                    raise ValueError('请保留词条的一级标题。正式改名需同时更新 catalog 与页面属性。')
                updated=(fm+body).encode()
            else:
                scene=payload.get('scene')
                if not isinstance(scene,dict) or scene.get('type')!='excalidraw' or not isinstance(scene.get('elements'),list): raise ValueError('画布数据无效')
                ids=[e.get('id') for e in scene['elements']]
                if any(not isinstance(i,str) or not i for i in ids) or len(ids)!=len(set(ids)): raise ValueError('画布元素 ID 无效')
                scene=copy.deepcopy(scene)
                # Obsidian uses 8-character block IDs. Map browser nanoids and every binding together.
                used=set(ids);mapping={}
                for value in ids:
                    if not re.fullmatch(r'[A-Za-z0-9-]{8}',value):
                        attempt=0;new=revision(value.encode())[:8]
                        while new in used:
                            attempt+=1;new=revision((value+str(attempt)).encode())[:8]
                        mapping[value]=new;used.add(new)
                def remap(value,key=None):
                    if isinstance(value,dict):return {k:remap(v,k) for k,v in value.items()}
                    if isinstance(value,list):return [remap(v,key) for v in value]
                    if isinstance(value,str) and key in ('id','elementId','containerId','frameId','groupIds','boundElementIds','start','end'):return mapping.get(value,value)
                    return value
                scene['elements']=remap(scene['elements'])
                for e in scene['elements']:
                    if e['type']=='text':e['rawText']=e.get('originalText',e.get('text',''))
                updated=wiki.render(scene,raw.decode())
                decoded=wiki.read_board(path,updated.decode())[1]
                for original,parsed in zip(scene['elements'],decoded['elements']):
                    if original['type']=='text' and not original.get('isDeleted') and original.get('originalText',original['text'])!=parsed['originalText']:
                        raise ValueError('画布文本无法无损保存，请保留草稿并检查特殊分隔符。')
            if raw==updated:return self.decode(kind,path,raw)
            backup=self.root/'.local/workbench/backups'/str(time.time_ns())/path.relative_to(self.root)
            wiki.atomic(backup,raw)
            # Recheck after serialization/backup, so an observed external edit is never discarded.
            if path.read_bytes()!=raw: raise Conflict('保存时检测到外部修改，请核对后重试。')
            wiki.atomic(path,updated)
            return self.decode(kind,path,updated)
    def snapshot(self):
        c=self.catalog(); boards=sorted((self.root/'wiki/boards').glob('*.excalidraw.md'))
        result={'articles':{},'boards':{}}
        for a in c['articles']:
            try:result['articles'][a['slug']]=revision(self.path('article',a['slug']).read_bytes())
            except FileNotFoundError:result['articles'][a['slug']]=None
        for p in boards:result['boards'][p.name]=revision(self.path('board',p.name).read_bytes())
        return result

class Handler(BaseHTTPRequestHandler):
    def log_message(self,fmt,*args):
        if args and str(args[1] if len(args)>1 else '').startswith(('4','5')): super().log_message(fmt,*args)
    def allowed(self):
        authority=self.headers.get('Host','')
        host=urlsplit('//'+authority).hostname
        if host not in ('127.0.0.1','localhost','::1'): return False
        origin=self.headers.get('Origin')
        return not origin or origin in ('http://'+authority,'http://127.0.0.1:5176','http://localhost:5176')
    def send_json(self,data,status=200):
        raw=json.dumps(data,ensure_ascii=False).encode();self.send_response(status)
        self.send_header('Content-Type','application/json; charset=utf-8');self.send_header('Cache-Control','no-store')
        self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
    def do_GET(self):
        if not self.allowed():self.send_json({'error':'仅允许本地工作台访问'},403);return
        u=urlsplit(self.path);v=self.server.vault
        try:
            if u.path=='/api/catalog':
                c=v.catalog();c['boards']=[p.name for p in sorted((v.root/'wiki/boards').glob('*.excalidraw.md'))];self.send_json(c)
            elif u.path=='/api/snapshot':self.send_json(v.snapshot())
            elif u.path=='/api/health':self.send_json({'ok':True,'root':str(v.root)})
            elif u.path in ('/api/article','/api/board'):
                self.send_json(v.read(u.path.split('/')[-1],parse_qs(u.query).get('key',[''])[0]))
            else:
                rel=unquote(u.path).lstrip('/') or 'index.html';p=(HERE/'dist'/rel).resolve()
                if not p.is_relative_to((HERE/'dist').resolve()) or not p.is_file():raise FileNotFoundError('请先构建工作台')
                raw=p.read_bytes();self.send_response(200);self.send_header('Content-Type',mimetypes.guess_type(p.name)[0] or 'application/octet-stream');self.send_header('Content-Length',str(len(raw)));self.end_headers();self.wfile.write(raw)
        except FileNotFoundError as e:self.send_json({'error':str(e)},404)
        except (ValueError,KeyError) as e:self.send_json({'error':str(e)},400)
        except Exception as e:self.send_json({'error':'读取失败：'+str(e)},500)
    def do_PUT(self):
        if not self.allowed() or not self.headers.get('Content-Type','').startswith('application/json'):
            self.send_json({'error':'仅允许本地 JSON 请求'},403);return
        try:
            size=int(self.headers.get('Content-Length','0'))
            if size<1 or size>32*1024*1024:raise ValueError('请求为空或超过 32 MiB')
            payload=json.loads(self.rfile.read(size));u=urlsplit(self.path)
            if u.path not in ('/api/article','/api/board'):raise FileNotFoundError('接口不存在')
            self.send_json(self.server.vault.write(u.path.split('/')[-1],parse_qs(u.query).get('key',[''])[0],payload))
        except Conflict as e:self.send_json({'error':str(e)},409)
        except FileNotFoundError as e:self.send_json({'error':str(e)},404)
        except (ValueError,KeyError) as e:self.send_json({'error':str(e)},400)
        except Exception as e:self.send_json({'error':'保存失败：'+str(e)},500)

def main():
    p=argparse.ArgumentParser();p.add_argument('--port',type=int,default=8765);p.add_argument('--root',type=pathlib.Path,default=ROOT);args=p.parse_args()
    server=ThreadingHTTPServer(('127.0.0.1',args.port),Handler);server.vault=Vault(args.root)
    print(f'Scholay workbench: http://127.0.0.1:{args.port}',flush=True)
    try:server.serve_forever()
    except KeyboardInterrupt:pass
    finally:server.server_close()
if __name__=='__main__':main()
