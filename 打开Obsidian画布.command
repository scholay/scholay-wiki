#!/bin/zsh
cd "$(dirname "$0")"
python3 tools/wiki/sync.py verify || exit 1
vault_uri=$(python3 -c 'from pathlib import Path; from urllib.parse import quote; print("obsidian://open?path="+quote(str(Path("wiki/boards/Scholay.excalidraw.md").resolve()),safe=""))')
open "$vault_uri"
