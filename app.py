from flask import Flask, request, jsonify, send_from_directory
import os
import json
import anthropic
import random
from decouple import config

app = Flask(__name__, static_folder='static', static_url_path='')

# Claude API configuration
CLAUDE_MODEL = "claude-sonnet-4-20250514"
PERSONALITIES_DIR = "personalities"
FLASK_DEBUG = config('FLASK_DEBUG', default=False, cast=bool)
ANTHROPIC_API_KEY = config('ANTHROPIC_API_KEY')
STUDENT_TOKENS = {token.strip() for token in config('STUDENT_TOKENS', default='').split(',') if token.strip()}

CONTENT_SECURITY_POLICY = (
    "default-src 'self'; "
    "script-src 'self'; "
    "style-src 'self'; "
    "img-src 'self' data:; "
    "connect-src 'self'; "
    "frame-ancestors 'none'; "
    "base-uri 'self'; "
    "form-action 'self'"
)

@app.after_request
def set_security_headers(response):
    """Add cheap-insurance security headers to every response"""
    response.headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains'
    response.headers['X-Content-Type-Options'] = 'nosniff'
    response.headers['X-Frame-Options'] = 'DENY'
    response.headers['Referrer-Policy'] = 'strict-origin-when-cross-origin'
    response.headers['Permissions-Policy'] = 'geolocation=(), microphone=(), camera=()'
    response.headers['Content-Security-Policy'] = CONTENT_SECURITY_POLICY
    return response

@app.route('/')
def index():
    """Serve the main HTML file"""
    return send_from_directory(app.static_folder, 'index.html')

@app.route('/api/personalities')
def get_personalities():
    """Get list of available personalities"""
    try:
        personalities = []
        personalities_path = os.path.join(os.path.dirname(__file__), PERSONALITIES_DIR)
        
        if os.path.exists(personalities_path):
            for filename in os.listdir(personalities_path):
                if filename.endswith('.json'):
                    filepath = os.path.join(personalities_path, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                            personality_data = json.load(f)
                            personalities.append({
                                'id': filename[:-5],  # Remove .json extension
                                'name': personality_data.get('name', 'Unknown'),
                                'condition': personality_data.get('condition', 'Unknown'),
                                'age': personality_data.get('age', 'Unknown'),
                                'background': personality_data.get('background', '')
                            })
                    except Exception as e:
                        print(f"Error loading personality file {filename}: {e}")
                        continue
        
        return jsonify({'personalities': personalities})
    except Exception as e:
        return jsonify({'error': {'message': f'Failed to load personalities: {str(e)}'}}), 500

@app.route('/api/personality/<personality_id>')
def get_personality(personality_id):
    """Get a specific personality by ID"""
    try:
        personalities_path = os.path.join(os.path.dirname(__file__), PERSONALITIES_DIR)
        filepath = os.path.join(personalities_path, f"{personality_id}.json")
        
        if not os.path.exists(filepath):
            return jsonify({'error': {'message': 'Personality not found'}}), 404
        
        with open(filepath, 'r', encoding='utf-8') as f:
            personality_data = json.load(f)
        
        return jsonify(personality_data)
    except Exception as e:
        return jsonify({'error': {'message': f'Failed to load personality: {str(e)}'}}), 500

@app.route('/api/config')
def get_config():
    """Get configuration settings including Claude model"""
    return jsonify({'model': CLAUDE_MODEL})

@app.route('/api/start-message')
def get_start_message():
    """Get a randomly selected initial message"""

    fallback_messages = ["Hello... I'm here because someone suggested I should talk to someone. I'm not really sure how this works.",
                         "Hi. I was told this might help, though I'm honestly not sure about any of this.",
                         "Hello. I'm here because I think I need to talk to someone about what I've been going through."
                        ]
    
    try:
        start_messages_path = os.path.join(os.path.dirname(__file__), 'start_messages.txt')
        
        if not os.path.exists(start_messages_path):
            # Fallback messages if file doesn't exist
            selected_message = random.choice(fallback_messages)
            return jsonify({'message': selected_message})
        
        with open(start_messages_path, 'r', encoding='utf-8') as f:
            messages = [line.strip() for line in f.readlines() if line.strip()]
        
        if not messages:
            # Fallback if file is empty
            fallback_message = fallback_messages[0]
            return jsonify({'message': fallback_message})
        
        selected_message = random.choice(messages)
        return jsonify({'message': selected_message})
        
    except Exception as e:
        # Return fallback message on error
        fallback_message = fallback_messages[0]
        return jsonify({'message': fallback_message})

@app.route('/api/claude', methods=['POST'])
def claude_proxy():
    """Proxy requests to Claude API using the anthropic client"""
    try:
        # Get the request data
        data = request.get_json()
        
        if not data:
            return jsonify({'error': {'message': 'No data provided'}}), 400
        
        # Validate the student's access code (an opaque token, no personal data)
        access_code = data.get('access_code')
        if not access_code or access_code not in STUDENT_TOKENS:
            return jsonify({'error': {'message': 'Invalid or missing access code', 'type': 'invalid_token'}}), 401

        # Use the centrally configured Anthropic API key
        client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY, timeout=45.0)
        
        # Extract message data
        messages = data.get('messages', [])
        system_prompt = data.get('system', '')
        max_tokens = data.get('max_tokens', 1000)
        model = data.get('model', CLAUDE_MODEL)
        
        if not messages:
            return jsonify({'error': {'message': 'Messages are required'}}), 400
        
        # Check if this is the last message in the session
        is_last_message = data.get('is_last_message', False)
        
        # Enhance system prompt with conversation context
        enhanced_system_prompt = f"""You are participating in a Cognitive Behavioral Therapy (CBT) training simulation. Your role is to authentically portray a client in a therapy session, allowing trainee therapists to practice their therapeutic skills.

{system_prompt}

IMPORTANT GUIDELINES:
- Keep your responses SHORT and conversational (1-3 sentences typically, rarely more than 4-5)
- Respond naturally as a real person would in a therapy session, not as a detailed character description
- Show emotions and reactions authentically through your words and tone
- Allow the therapist to guide the conversation; don't volunteer too much information at once
- Be realistic about the pacing of disclosure - people don't immediately share everything
- Your responses should feel like genuine dialogue, not monologues or reports
- React to what the therapist says; let the conversation flow naturally"""

        # Add session ending instruction if this is the last message
        if is_last_message:
            enhanced_system_prompt += """\n\nSESSION ENDING: This is the final message of the session. You must now politely indicate that you need to leave. Apologize briefly and mention that your time is up or you have another commitment. Keep it natural and brief (1-2 sentences). For example: "I'm sorry, but I need to go now - my time is up." or "I appreciate talking with you, but I have to leave now." """
        
        # Make request to Claude API using the anthropic client
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            system=enhanced_system_prompt,
            messages=messages
        )
        
        # Convert response to dict format that matches the expected API response
        content_blocks = []
        for content in response.content:
            if content.type == 'text':
                content_blocks.append({'type': content.type, 'text': content.text})
            elif content.type == 'tool_use':
                content_blocks.append({
                    'type': content.type, 
                    'id': content.id,
                    'name': content.name,
                    'input': content.input
                })
            else:  # Other types, handle gracefully
                content_blocks.append({'type': content.type})
        
        response_data = {
            'id': response.id,
            'type': response.type,
            'role': response.role,
            'content': content_blocks,
            'model': response.model,
            'stop_reason': response.stop_reason,
            'stop_sequence': response.stop_sequence,
            'usage': {
                'input_tokens': response.usage.input_tokens,
                'output_tokens': response.usage.output_tokens
            }
        }
        
        return jsonify(response_data)
            
    except anthropic.AuthenticationError as e:
        return jsonify({'error': {'message': 'Server configuration error - please contact your instructor', 'type': 'authentication_error'}}), 500
    except anthropic.PermissionDeniedError as e:
        return jsonify({'error': {'message': 'Permission denied', 'type': 'permission_error'}}), 403
    except anthropic.NotFoundError as e:
        return jsonify({'error': {'message': 'Resource not found', 'type': 'not_found_error'}}), 404
    except anthropic.RateLimitError as e:
        return jsonify({'error': {'message': 'Rate limit exceeded', 'type': 'rate_limit_error'}}), 429
    except anthropic.BadRequestError as e:
        return jsonify({'error': {'message': f'Bad request: {str(e)}', 'type': 'invalid_request_error'}}), 400
    except anthropic.APIError as e:
        return jsonify({'error': {'message': f'API error: {str(e)}', 'type': 'api_error'}}), 500
    except Exception as e:
        return jsonify({'error': {'message': f'Server error: {str(e)}', 'type': 'server_error'}}), 500

@app.route('/health')
def health_check():
    """Health check endpoint for Azure"""
    return jsonify({'status': 'healthy', 'service': 'claude-chatbot'})

if __name__ == '__main__':  # pragma: no cover
    # For local development
    port = int(os.environ.get('PORT', 8000))
    app.run(host='0.0.0.0', port=port, debug=FLASK_DEBUG)
