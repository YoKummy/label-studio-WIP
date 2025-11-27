import json
from pathlib import Path

from django.conf import settings

# Load manifest.json once at module scope
_MANIFEST = {}
try:
    # If HMR is enabled, we don't need to read the manifest as it's not used
    # All assets are served from the webpack dev server in that case
    if not settings.FRONTEND_HMR:
        manifest_path = Path(settings.STATIC_ROOT) / 'js/manifest.json'
        if manifest_path.exists():
            with open(manifest_path, 'r') as f:
                _MANIFEST = json.load(f)
except Exception:
    # If there's any error reading the manifest, we'll use the default mapping
    pass


def get_manifest_asset(path: str) -> str:
    """Maps a path to its hashed filename using manifest.json, or falls back to /react-app/ prefix

    Usage in template:
    {% manifest_asset 'main.js' %}
    """
    if path in _MANIFEST:
        asset = _MANIFEST[path]
        # manifest may store absolute paths; ensure we return a URL path
        # strip file scheme and Windows absolute drive if present
        if asset.startswith('file://'):
            asset = asset[len('file://') :]
        # remove leading drive letter like C:\ or C:/ on Windows
        if len(asset) > 1 and asset[1] == ':' and (asset[0].isalpha()):
            # convert to posix-like path by removing drive and any leading slashes
            asset = asset[2:]
        # ensure leading slash for URL join
        if not asset.startswith('/'):
            asset = '/' + asset
        return f'{settings.FRONTEND_HOSTNAME}{asset}'
    # fallback
    return f'{settings.FRONTEND_HOSTNAME}/react-app/{path}'
