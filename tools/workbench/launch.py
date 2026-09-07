#!/usr/bin/env python3
"""Build and open the local workbench; reuse a running instance for this vault."""
import argparse,json,pathlib,subprocess,sys,time,urllib.request,webbrowser
HERE=pathlib.Path(__file__).resolve().parent
ROOT=HERE.parents[1]
URL='http://127.0.0.1:8765'
def health():
 try:
  with urllib.request.urlopen(URL+'/api/health',timeout=1) as r:return json.load(r)
 except Exception:return None
def main():
 p=argparse.ArgumentParser();p.add_argument('--no-open',action='store_true');args=p.parse_args()
 if not (HERE/'node_modules').exists():subprocess.run(['npm','ci'],cwd=HERE,check=True)
 sources=[*HERE.joinpath('src').rglob('*'),HERE/'package-lock.json',HERE/'index.html',HERE/'vite.config.js']
 index=HERE/'dist/index.html'
 if not index.exists() or any(f.is_file() and f.stat().st_mtime>index.stat().st_mtime for f in sources):
  subprocess.run(['npm','run','build'],cwd=HERE,check=True)
 state=health()
 if state and state.get('root')!=str(ROOT):raise SystemExit('端口 8765 已被另一内容仓库占用，请先关闭另一工作台。')
 if not state:
  logs=ROOT/'.local/workbench';logs.mkdir(parents=True,exist_ok=True)
  with (logs/'server.log').open('ab') as log:
   child=subprocess.Popen([sys.executable,str(HERE/'server.py')],cwd=ROOT,stdin=subprocess.DEVNULL,stdout=log,stderr=log,start_new_session=True)
  (logs/'server.pid').write_text(str(child.pid))
  for _ in range(40):
   if health():break
   if child.poll() is not None:raise SystemExit('工作台启动失败，请查看 .local/workbench/server.log')
   time.sleep(.1)
  else:raise SystemExit('工作台尚未就绪，请查看 .local/workbench/server.log')
 print(URL)
 if not args.no_open:webbrowser.open(URL)
if __name__=='__main__':main()
