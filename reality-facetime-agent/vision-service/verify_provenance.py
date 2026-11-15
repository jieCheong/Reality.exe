"""Offline verification of baseline + explicitly declared local patch hashes."""
import hashlib
import json
from pathlib import Path


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest() if path.is_file() else None


def verify(root):
    root = Path(root)
    manifest = json.loads((root / 'UPSTREAM.json').read_text())
    baseline = manifest['files']
    expected = dict(baseline)
    errors = []
    declared = set()
    for patch in manifest.get('local_patches', []):
        if digest(root / patch['patch_file']) != patch['patch_sha256']:
            errors.append(f"Patch artifact mismatch: {patch['id']}")
        for name, record in patch['files'].items():
            if name in declared or record['upstream_sha256'] != baseline.get(name):
                errors.append(f'Invalid baseline/patch declaration: {name}')
            declared.add(name)
            expected[name] = record['integrated_sha256']
    for name, sha in expected.items():
        if digest(root / 'vendor' / name) != sha:
            errors.append(f'Installed file mismatch: {name}')
    actual = {str(path.relative_to(root / 'vendor')) for path in (root / 'vendor').rglob('*.py')}
    for name in sorted(actual - expected.keys()):
        errors.append(f'Undeclared Python file: {name}')
    return errors


if __name__ == '__main__':
    errors = verify(Path(__file__).parent)
    print(json.dumps({'provenance': 'FAIL' if errors else 'PASS', 'errors': errors}))
    raise SystemExit(bool(errors))
