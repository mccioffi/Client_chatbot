import types
from unittest.mock import MagicMock, patch

import anthropic
import httpx

import app as app_module


def test_health_check(client):
    response = client.get('/health')
    assert response.status_code == 200
    assert response.get_json() == {'status': 'healthy', 'service': 'claude-chatbot'}


def test_get_config(client):
    response = client.get('/api/config')
    assert response.status_code == 200
    assert response.get_json() == {'model': app_module.CLAUDE_MODEL}


def test_get_personalities_list(client):
    response = client.get('/api/personalities')
    assert response.status_code == 200
    data = response.get_json()
    assert 'personalities' in data
    assert len(data['personalities']) > 0
    for personality in data['personalities']:
        assert {'id', 'name', 'condition', 'age', 'background'} <= personality.keys()


def test_get_personality_detail_valid(client):
    listing = client.get('/api/personalities').get_json()['personalities']
    personality_id = listing[0]['id']

    response = client.get(f'/api/personality/{personality_id}')
    assert response.status_code == 200
    data = response.get_json()
    assert data['name'] == listing[0]['name']


def test_get_personality_detail_not_found(client):
    response = client.get('/api/personality/does-not-exist')
    assert response.status_code == 404


def test_index_serves_html(client):
    response = client.get('/')
    assert response.status_code == 200
    assert b'<html' in response.data.lower()


def test_static_asset_is_served(client):
    response = client.get('/styles.css')
    assert response.status_code == 200


def test_source_files_are_not_served(client):
    # Regression test: the app used to serve its own source (and .git) over
    # HTTP via a catch-all static route. Only static/ should be reachable.
    for path in ('/app.py', '/requirements.txt', '/.git/config'):
        response = client.get(path)
        assert response.status_code == 404, f'{path} should not be servable'


def test_start_message_returns_a_message(client):
    response = client.get('/api/start-message')
    assert response.status_code == 200
    data = response.get_json()
    assert isinstance(data['message'], str) and data['message']


def test_claude_proxy_no_data(client):
    response = client.post('/api/claude', json={})
    assert response.status_code == 400
    assert response.get_json()['error']['message'] == 'No data provided'


def test_claude_proxy_missing_access_code(client):
    response = client.post('/api/claude', json={'messages': [{'role': 'user', 'content': 'hi'}]})
    assert response.status_code == 401
    assert response.get_json()['error']['type'] == 'invalid_token'


def test_claude_proxy_invalid_access_code(client):
    response = client.post('/api/claude', json={
        'messages': [{'role': 'user', 'content': 'hi'}],
        'access_code': 'not-a-real-code',
    })
    assert response.status_code == 401
    assert response.get_json()['error']['type'] == 'invalid_token'


def test_claude_proxy_valid_access_code_missing_messages(client):
    response = client.post('/api/claude', json={
        'messages': [],
        'access_code': 'test-token-1',
    })
    assert response.status_code == 400


def _fake_claude_response():
    return types.SimpleNamespace(
        id='msg_test123',
        type='message',
        role='assistant',
        content=[types.SimpleNamespace(type='text', text="I'm doing okay, thanks for asking.")],
        model=app_module.CLAUDE_MODEL,
        stop_reason='end_turn',
        stop_sequence=None,
        usage=types.SimpleNamespace(input_tokens=42, output_tokens=13),
    )


def test_claude_proxy_valid_request_returns_formatted_response(client):
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _fake_claude_response()

    with patch.object(app_module.anthropic, 'Anthropic', return_value=mock_client):
        response = client.post('/api/claude', json={
            'messages': [{'role': 'user', 'content': 'How are you?'}],
            'access_code': 'test-token-1',
        })

    assert response.status_code == 200
    data = response.get_json()
    assert data['content'][0]['text'] == "I'm doing okay, thanks for asking."
    assert data['usage']['input_tokens'] == 42
    mock_client.messages.create.assert_called_once()


def test_claude_proxy_authentication_error_hides_key_details_from_student(client):
    mock_client = MagicMock()
    fake_response = httpx.Response(status_code=401, request=httpx.Request('POST', 'https://api.anthropic.com/v1/messages'))
    mock_client.messages.create.side_effect = anthropic.AuthenticationError(
        'invalid x-api-key', response=fake_response, body=None
    )

    with patch.object(app_module.anthropic, 'Anthropic', return_value=mock_client):
        response = client.post('/api/claude', json={
            'messages': [{'role': 'user', 'content': 'hi'}],
            'access_code': 'test-token-1',
        })

    assert response.status_code == 500
    message = response.get_json()['error']['message']
    assert 'instructor' in message.lower()
    assert 'x-api-key' not in message


def test_claude_proxy_rate_limit_error(client):
    mock_client = MagicMock()
    fake_response = httpx.Response(status_code=429, request=httpx.Request('POST', 'https://api.anthropic.com/v1/messages'))
    mock_client.messages.create.side_effect = anthropic.RateLimitError(
        'rate limited', response=fake_response, body=None
    )

    with patch.object(app_module.anthropic, 'Anthropic', return_value=mock_client):
        response = client.post('/api/claude', json={
            'messages': [{'role': 'user', 'content': 'hi'}],
            'access_code': 'test-token-1',
        })

    assert response.status_code == 429


def test_claude_proxy_last_message_adds_session_ending_instruction(client):
    mock_client = MagicMock()
    mock_client.messages.create.return_value = _fake_claude_response()

    with patch.object(app_module.anthropic, 'Anthropic', return_value=mock_client):
        client.post('/api/claude', json={
            'messages': [{'role': 'user', 'content': 'goodbye'}],
            'access_code': 'test-token-1',
            'is_last_message': True,
        })

    sent_system_prompt = mock_client.messages.create.call_args.kwargs['system']
    assert 'SESSION ENDING' in sent_system_prompt


def test_claude_proxy_formats_tool_use_content_block(client):
    mock_client = MagicMock()
    response_with_tool_use = _fake_claude_response()
    response_with_tool_use.content = [
        types.SimpleNamespace(type='tool_use', id='tool_1', name='lookup', input={'query': 'x'})
    ]
    mock_client.messages.create.return_value = response_with_tool_use

    with patch.object(app_module.anthropic, 'Anthropic', return_value=mock_client):
        response = client.post('/api/claude', json={
            'messages': [{'role': 'user', 'content': 'hi'}],
            'access_code': 'test-token-1',
        })

    assert response.status_code == 200
    block = response.get_json()['content'][0]
    assert block == {'type': 'tool_use', 'id': 'tool_1', 'name': 'lookup', 'input': {'query': 'x'}}
