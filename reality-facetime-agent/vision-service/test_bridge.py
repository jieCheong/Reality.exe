import asyncio
import base64
import io
import time
import pytest
import numpy as np
from PIL import Image
from bridge import Bridge, SafeModel, fixture_model
from app.perception import FrameJudgment
from app.perception.model import FakeVision


def request(operation='verify', scenario=None):
    now = int(time.time() * 1000)
    frames = []
    pixels = np.random.default_rng(1).integers(60, 200, (120, 160, 3), dtype=np.uint8)
    for i in range(3 if operation == 'verify' else 2):
        image = pixels.copy(); image[0:10,0:10] = 70 + i*20
        out = io.BytesIO(); Image.fromarray(image).save(out, format='JPEG')
        frames.append({'id': str(i), 'capturedAtMs': now - (2-i)*250, 'jpeg': base64.b64encode(out.getvalue()).decode()})
    body = {'requestId': 'fixture-request', 'revision': 1, 'operation': operation, 'frames': frames,
            'catalog': [{'name': n, 'description': n} for n in ['bottle','notebook','pen']]}
    if operation == 'verify': body['predicate'] = 'ORDER_LEFT_TO_RIGHT(bottle, notebook, pen)'
    if scenario: body['mockScenario'] = scenario
    return body


def run(body, bridge=None): return asyncio.run((bridge or Bridge()).analyze(body))


def test_original_consensus_and_geometry_are_used():
    result = run(request())['result']
    assert result['satisfied'] and result['votes_for'] == 3 and result['votes_total'] == 3
    assert not run(request(scenario='geometry_veto'))['result']['satisfied']
    assert not run(request(scenario='low_confidence'))['result']['satisfied']
    assert not run(request(scenario='error'))['result']['satisfied']


def test_insufficient_duplicate_stale_or_out_of_order_frames_fail_before_model():
    for change in ['short', 'duplicate_id', 'duplicate_image', 'stale', 'unordered']:
        body = request()
        if change == 'short': body['frames'].pop()
        if change == 'duplicate_id': body['frames'][1]['id'] = body['frames'][0]['id']
        if change == 'duplicate_image': body['frames'][1]['jpeg'] = body['frames'][0]['jpeg']
        if change == 'stale': body['frames'][0]['capturedAtMs'] -= 10000
        if change == 'unordered': body['frames'].reverse()
        with pytest.raises(ValueError): run(body)


def test_dark_frames_skip_provider_and_inventory_keeps_contract():
    model = fixture_model(None)
    body = request('inventory')
    assert len(run(body, Bridge(model=model))['result']['objects']) == 3
    count = len(model.calls)
    for i, frame in enumerate(body['frames']):
        out = io.BytesIO(); Image.new('RGB', (160,120), (i,i,i)).save(out, format='JPEG')
        frame['jpeg'] = base64.b64encode(out.getvalue()).decode()
    assert run(body, Bridge(model=model))['result']['status'] == 'unstable_scene'
    assert len(model.calls) == count


def test_strict_geometry_vetoes_missing_or_out_of_range_boxes():
    for boxes in [[], [0,0,0,0], [-1,0,100,100]]:
        model = SafeModel(FakeVision(lambda *_: {'satisfied': True, 'confidence': .95, 'evidence': 'mock',
            'objects': [{'name':'pen','visible':True,'box_2d':boxes}]}))
        with pytest.raises(ValueError): asyncio.run(model.ask([b'jpeg'], '- "pen": silver pen', FrameJudgment))


def test_real_mode_forbids_mock_overrides_without_contacting_groq():
    with pytest.raises(ValueError): run(request(scenario='pass'), Bridge(provider='groq'))


def test_groq_transport_uses_bounded_json_mode_and_rejects_coerced_booleans(monkeypatch):
    import groq
    from types import SimpleNamespace
    from bridge import GroqOnlyVision
    calls = []
    class Client:
        def __init__(self, **options):
            assert options['max_retries'] == 0 and options['timeout'] == 7
            self.chat = SimpleNamespace(completions=self)
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def create(self, **options):
            calls.append(options)
            return SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"satisfied":"true","confidence":0.95,"evidence":"fake"}'))])
    monkeypatch.setattr(groq, 'AsyncGroq', Client)
    monkeypatch.setenv('GROQ_API_KEY', 'mock-key-never-sent')
    with pytest.raises(ValueError): asyncio.run(GroqOnlyVision().ask([b'fake-jpeg'], 'Mock prompt', FrameJudgment))
    assert calls[0]['response_format'] == {'type': 'json_object'}
    assert calls[0]['model'] == 'qwen/qwen3.8-27b'
    assert calls[0]['max_completion_tokens'] == 700
