#!/bin/zsh
cd "$(dirname "$0")"
python3 tools/wiki/sync.py watch
