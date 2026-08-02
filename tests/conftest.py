import os
import sys

# Set before `import app` so decouple's config() picks these up instead of any
# real .env file — os.environ takes precedence over the .env-backed repository.
os.environ['ANTHROPIC_API_KEY'] = 'sk-ant-test-key-not-real'
os.environ['STUDENT_TOKENS'] = 'test-token-1,test-token-2'
os.environ['FLASK_DEBUG'] = 'False'

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import pytest
import app as app_module


@pytest.fixture
def client():
    app_module.app.config['TESTING'] = True
    with app_module.app.test_client() as test_client:
        yield test_client
