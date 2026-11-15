"""Provenance is local-only and must detect drift in originals and patches."""
import shutil
from pathlib import Path

import pytest
from verify_provenance import verify

ROOT = Path(__file__).parent


def copy_tree(tmp_path):
    target = tmp_path / 'service'
    shutil.copytree(ROOT, target, ignore=shutil.ignore_patterns('__pycache__', '.pytest_cache'))
    return target


def test_current_integrated_files_match_declared_baseline_and_patches():
    assert verify(ROOT) == []


@pytest.mark.parametrize('relative', ['vendor/app/perception/predicates.py',
                                     'vendor/app/perception/frames.py',
                                     'vendor/tests/test_perception.py'])
def test_undeclared_content_change_is_detected(tmp_path, relative):
    target = copy_tree(tmp_path)
    with (target / relative).open('a') as out:
        out.write('\n# unintended drift\n')
    assert any('Installed file mismatch' in error for error in verify(target))


def test_no_local_patches_vendor_matches_upstream_exactly():
    # support-contact-v1 was superseded by the upstream B1 geometry; the vendored copy is unpatched.
    import json
    assert json.loads((ROOT / 'UPSTREAM.json').read_text())['local_patches'] == []


def test_undeclared_vendored_python_file_is_detected(tmp_path):
    target = copy_tree(tmp_path)
    (target / 'vendor/app/perception/extra.py').write_text('# not declared\n')
    assert any('Undeclared Python file' in error for error in verify(target))
