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
                                     'vendor/tests/test_support_geometry.py'])
def test_undeclared_content_change_is_detected(tmp_path, relative):
    target = copy_tree(tmp_path)
    with (target / relative).open('a') as out:
        out.write('\n# unintended drift\n')
    assert any('Installed file mismatch' in error for error in verify(target))


def test_changed_review_patch_is_detected(tmp_path):
    target = copy_tree(tmp_path)
    (target / 'patches/support-contact-v2.patch').write_text('wrong patch\n')
    assert any('Patch artifact mismatch' in error for error in verify(target))


def test_undeclared_vendored_python_file_is_detected(tmp_path):
    target = copy_tree(tmp_path)
    (target / 'vendor/app/perception/extra.py').write_text('# not declared\n')
    assert any('Undeclared Python file' in error for error in verify(target))
