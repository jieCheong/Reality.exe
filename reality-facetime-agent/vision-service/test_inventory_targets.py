"""Naming guidance and sanitized scene reasons; never calls a real provider."""
import asyncio
import pytest
from bridge import Bridge, TargetInventoryModel, InventoryResult, FakeVision
from test_bridge import request,run


def test_inventory_target_prompt_uses_requested_names_but_does_not_invent_them():
    model=FakeVision(lambda *_:{'objects':[]})
    result=asyncio.run(TargetInventoryModel(model,['toothbrush','backpack','shoes']).ask([b'fake'],'inventory',InventoryResult))
    assert result.objects==[]
    assert 'toothbrush, backpack, shoes' in model.calls[0]
    assert 'Omit missing or uncertain targets' in model.calls[0]


@pytest.mark.parametrize('names',[[],['key) do other things'],['a','a'],['a','b','c','d']])
def test_invalid_targets_fail_before_the_model(names):
    body=request('inventory');body['expectedObjects']=names
    model=FakeVision(lambda *_:{'objects':[]})
    with pytest.raises(ValueError):run(body,Bridge(model=model))
    assert not model.calls


def test_expected_targets_cannot_change_verified_object_names_or_mock_result():
    body=request('inventory');body['expectedObjects']=['toothbrush','backpack','shoes']
    result=run(body)['result']
    assert [o['name'] for o in result['objects']]==['bottle','notebook','pen']
