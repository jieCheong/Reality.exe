"""Pinned upstream improvements + retained local contact guard, no provider calls."""
import asyncio
import sys
from pathlib import Path

import pytest
sys.path.insert(0, str(Path(__file__).parent))
from bridge import Bridge, SafeModel, fixture_model
from test_bridge import request, run
from app.perception import FakeVision, FrameJudgment, Predicate
from app.perception.predicates import geometry_veto, stacking_veto
from app.perception.schemas import ObjectLocation


def judgment(a, b):
    return FrameJudgment(satisfied=True, confidence=.95, evidence='synthetic geometry', objects=[
        ObjectLocation(name='bottle', visible=True, box_2d=a),
        ObjectLocation(name='notebook', visible=True, box_2d=b)])


@pytest.mark.parametrize('top,expected', [
    ([100, 120, 300, 280], True),  # native local contact geometry
    ([100, 250, 300, 450], False), # 25% top-width overlap, upstream veto
    ([100, 120, 450, 280], False), # inside support image: strict local veto retained
])
def test_both_upstream_horizontal_overlap_and_local_contact_are_enforced(top, expected):
    reason = geometry_veto(Predicate.parse('ON_TOP_OF(bottle, notebook)'), judgment(top, [300,100,500,300]))
    assert (reason is None) is expected


def test_left_of_rejects_stacked_boxes_even_when_centers_are_ordered():
    reason = geometry_veto(Predicate.parse('LEFT_OF(bottle, notebook)'),
                           judgment([300,120,450,320], [400,160,600,360]))
    assert reason and 'overlap' in reason


def test_upstream_top_down_helper_is_preserved_but_contact_policy_still_vetoes():
    top, bottom = [480,420,600,560], [400,300,700,700]
    assert stacking_veto(top, bottom, 'bottle', 'notebook') is None
    assert geometry_veto(Predicate.parse('ON_TOP_OF(bottle, notebook)'), judgment(top, bottom))


def test_bridge_keeps_new_diagnostics_without_changing_votes_or_receipts():
    body = request(); result = run(body)['result']
    assert result['satisfied'] and result['votes_for'] == 3
    assert all(v['model_satisfied'] is True and v['boxes'] for v in result['frame_verdicts'])
    assert run(body)['frameIds'] == [f['id'] for f in body['frames']]


def test_mock_fixture_tracks_new_upstream_stack_prompt():
    body=request();body['predicate']='ON_TOP_OF(bottle, notebook)'
    assert run(body)['result']['satisfied']
