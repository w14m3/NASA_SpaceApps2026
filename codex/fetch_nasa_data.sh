#!/usr/bin/env bash
# Thin wrapper: the cross-platform implementation is codex/fetch_nasa_data.py
exec "$(command -v python3 || command -v python)" "$(dirname "$0")/fetch_nasa_data.py" "$@"
