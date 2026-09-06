#!/usr/bin/env python3
"""Prepare a clean GitHub Wiki checkout for review; never commit or push."""
import pathlib, subprocess, shutil, sys
from sync import ROOT

remote='git@github.com:scholay/scholay.wiki.git'
target=ROOT/'.local/github-wiki-checkout'
def git(*args):
    return subprocess.check_output(['git','-C',str(target),*args],text=True).strip()

subprocess.run(['python3',str(ROOT/'tools/wiki/export.py'),'--github'],check=True)
probe=subprocess.run(['git','ls-remote',remote],capture_output=True,text=True)
if probe.returncode:
    raise SystemExit('GitHub Wiki remote is unavailable. Enable Wiki and create its first page in GitHub, then rerun. Local export is ready; nothing was published.\n'+probe.stderr)
if not target.exists():
    target.parent.mkdir(parents=True,exist_ok=True)
    subprocess.run(['git','clone',remote,str(target)],check=True)
if git('remote','get-url','origin')!=remote: raise SystemExit('Unexpected Wiki remote')
if git('status','--porcelain'): raise SystemExit('Wiki checkout has changes; review them before preparing again.')
subprocess.run(['git','-C',str(target),'pull','--ff-only'],check=True)
for file in (ROOT/'build/github-wiki').rglob('*'):
    if file.is_file():
        dest=target/file.relative_to(ROOT/'build/github-wiki');dest.parent.mkdir(parents=True,exist_ok=True);shutil.copy2(file,dest)
print(git('status','--short'))
print('Prepared for review at '+str(target)+'. Existing unrelated pages retained. No commit or push performed.')
