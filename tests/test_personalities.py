import json
import os

import pytest

PERSONALITIES_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'personalities')
REQUIRED_FIELDS = {'name', 'condition', 'age', 'background', 'personality', 'opening_lines'}


def personality_files():
    return sorted(f for f in os.listdir(PERSONALITIES_DIR) if f.endswith('.json'))


@pytest.mark.parametrize('filename', personality_files())
def test_personality_file_is_valid_json(filename):
    filepath = os.path.join(PERSONALITIES_DIR, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        json.load(f)


@pytest.mark.parametrize('filename', personality_files())
def test_personality_file_has_required_fields(filename):
    filepath = os.path.join(PERSONALITIES_DIR, filename)
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)

    missing = REQUIRED_FIELDS - data.keys()
    assert not missing, f'{filename} is missing required fields: {missing}'

    assert isinstance(data['name'], str) and data['name']
    assert isinstance(data['condition'], str) and data['condition']
    assert isinstance(data['age'], int)
    assert isinstance(data['background'], str) and data['background']
    assert isinstance(data['personality'], str) and data['personality']

    opening_lines = data['opening_lines']
    assert isinstance(opening_lines, list) and len(opening_lines) > 0
    for line in opening_lines:
        assert isinstance(line, str) and line


def test_at_least_one_personality_exists():
    assert personality_files()
