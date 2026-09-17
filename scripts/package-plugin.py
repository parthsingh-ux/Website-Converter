#!/usr/bin/env python3
"""Rebuild the installable WordPress bridge without development files."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
root = Path(__file__).resolve().parents[1]
plugin = root / 'wordpress' / 'converter-studio-bridge'
target = root / 'public' / 'downloads' / 'wordpress-converter-bridge.zip'
target.parent.mkdir(parents=True, exist_ok=True)
with ZipFile(target, 'w', ZIP_DEFLATED) as archive:
    for path in sorted(plugin.rglob('*')):
        if path.is_file() and not any(part.startswith('.') for part in path.relative_to(plugin).parts):
            archive.write(path, path.relative_to(plugin.parent))
print(target)
