class ChatBot {
    constructor() {
        this.apiKey = localStorage.getItem('claude_api_key');
        this.currentPersonality = null;
        this.personalities = [];
        this.conversationHistory = [];
        this.isTyping = false;
        this.claudeModel = null; // Will be loaded from backend
        this.maxMessages = 30; // Maximum therapist messages per session
        this.therapistMessageCount = 0; // Track therapist messages only
        this.warningShown = false; // Track if 5-message warning shown
        
        this.initializeElements();
        this.loadConfig();
        this.loadPersonalities();
        this.checkApiKey();
        this.setupEventListeners();
        this.setInitialTime();
    }

    initializeElements() {
        this.chatMessages = document.getElementById('chatMessages');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.clearButton = document.getElementById('clearChat');
        this.printPdfButton = document.getElementById('printPdf');
        this.selectPersonalityButton = document.getElementById('selectPersonality');
        this.charCount = document.getElementById('charCount');
        this.status = document.getElementById('status');
        this.chatTitle = document.getElementById('chatTitle');
        this.avatarCircle = document.getElementById('avatarCircle');
        
        // Modals
        this.personalityModal = document.getElementById('personalityModal');
        this.personalityList = document.getElementById('personalityList');
        this.cancelPersonalityButton = document.getElementById('cancelPersonality');
        this.apiKeyModal = document.getElementById('apiKeyModal');
        this.apiKeyInput = document.getElementById('apiKeyInput');
        this.saveApiKeyButton = document.getElementById('saveApiKey');
    }

    async loadConfig() {
        try {
            const response = await fetch('/api/config');
            const data = await response.json();
            this.claudeModel = data.model || 'claude-sonnet-4-20250514';
        } catch (error) {
            console.error('Failed to load config:', error);
            this.claudeModel = 'claude-sonnet-4-20250514'; // Fallback
        }
    }

    async loadPersonalities() {
        try {
            const response = await fetch('/api/personalities');
            const data = await response.json();
            this.personalities = data.personalities || [];
            this.populatePersonalitySelector();
        } catch (error) {
            console.error('Failed to load personalities:', error);
            this.personalities = [];
        }
    }

    populatePersonalitySelector() {
        this.personalityList.innerHTML = '';
        
        this.personalities.forEach(personality => {
            const option = document.createElement('div');
            option.className = 'personality-option';
            option.dataset.personalityId = personality.id;
            
            option.innerHTML = `
                <div class="personality-name">${personality.name}</div>
                <div class="personality-condition">${personality.condition}</div>
                <div class="personality-details">
                    <span class="personality-age">Age: ${personality.age}</span> • 
                    ${personality.background}
                </div>
            `;
            
            option.addEventListener('click', () => this.selectPersonality(personality.id));
            this.personalityList.appendChild(option);
        });
    }

    async selectPersonality(personalityId) {
        try {
            const response = await fetch(`/api/personality/${personalityId}`);
            const personalityData = await response.json();
            
            this.currentPersonality = personalityData;
            this.updateUIForPersonality();
            this.hidePersonalityModal();
            this.clearChatForNewPersonality();
            this.addInitialMessage();
            
            // Show chat controls
            this.printPdfButton.style.display = 'inline-flex';
            this.clearButton.style.display = 'inline-flex';
            
        } catch (error) {
            console.error('Failed to load personality:', error);
            alert('Failed to load selected client. Please try again.');
        }
    }

    updateUIForPersonality() {
        if (this.currentPersonality) {
            this.chatTitle.textContent = `Chat with ${this.currentPersonality.name}`;
            this.avatarCircle.textContent = this.currentPersonality.name.charAt(0).toUpperCase();
            this.status.textContent = 'Online';
        }
    }

    showPersonalityModal() {
        this.personalityModal.style.display = 'block';
    }

    hidePersonalityModal() {
        this.personalityModal.style.display = 'none';
    }

    clearChatForNewPersonality() {
        this.chatMessages.innerHTML = '';
        this.conversationHistory = [];
        this.therapistMessageCount = 0;
        this.warningShown = false;
    }

    async addInitialMessage() {
        if (!this.currentPersonality) return;
        
        try {
            const response = await fetch('/api/start-message');
            const data = await response.json();
            const message = data.message || "Hello... I'm here because someone suggested I should talk to someone. I'm not really sure how this works.";
            this.addMessage(message, 'bot');
        } catch (error) {
            console.error('Failed to load start message:', error);
            // Fallback message if API fails
            const fallbackMessage = "Hello... I'm here because someone suggested I should talk to someone. I'm not really sure how this works.";
            this.addMessage(fallbackMessage, 'bot');
        }
    }

    checkApiKey() {
        if (!this.apiKey) {
            this.showApiKeyModal();
        }
    }

    showApiKeyModal() {
        this.apiKeyModal.style.display = 'block';
    }

    hideApiKeyModal() {
        this.apiKeyModal.style.display = 'none';
    }

    setupEventListeners() {
        // Send message events
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Character counter
        this.messageInput.addEventListener('input', () => {
            const length = this.messageInput.value.length;
            this.charCount.textContent = length;
            
            if (length > 900) {
                this.charCount.style.color = '#dc2626';
            } else if (length > 800) {
                this.charCount.style.color = '#f59e0b';
            } else {
                this.charCount.style.color = '#64748b';
            }
        });

        // Clear chat
        this.clearButton.addEventListener('click', () => this.clearChat());

        // Print PDF
        this.printPdfButton.addEventListener('click', () => this.printChatAsPdf());

        // Personality selector
        this.selectPersonalityButton.addEventListener('click', () => this.showPersonalityModal());
        this.cancelPersonalityButton.addEventListener('click', () => this.hidePersonalityModal());

        // API key modal
        this.saveApiKeyButton.addEventListener('click', () => this.saveApiKey());
        this.apiKeyInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                this.saveApiKey();
            }
        });

        // Modal click outside to close
        this.apiKeyModal.addEventListener('click', (e) => {
            if (e.target === this.apiKeyModal) {
                // Don't allow closing without API key
                if (this.apiKey) {
                    this.hideApiKeyModal();
                }
            }
        });

        this.personalityModal.addEventListener('click', (e) => {
            if (e.target === this.personalityModal) {
                this.hidePersonalityModal();
            }
        });
    }

    setInitialTime() {
        const initialTimeElement = document.getElementById('initialTime');
        if (initialTimeElement) {
            initialTimeElement.textContent = this.formatTime(new Date());
        }
    }

    saveApiKey() {
        const apiKey = this.apiKeyInput.value.trim();
        
        if (!apiKey) {
            this.showError('Please enter a valid API key.');
            return;
        }

        if (!apiKey.startsWith('sk-ant-')) {
            this.showError('Invalid API key format. Claude API keys should start with "sk-ant-".');
            return;
        }

        this.apiKey = apiKey;
        localStorage.setItem('claude_api_key', apiKey);
        this.hideApiKeyModal();
        this.updateStatus('Online');
        
        // Clear any existing error
        this.clearError();
    }

    showError(message) {
        // Remove existing error
        this.clearError();
        
        const errorDiv = document.createElement('div');
        errorDiv.className = 'error-message';
        errorDiv.textContent = message;
        
        this.apiKeyModal.querySelector('.modal-content').insertBefore(
            errorDiv, 
            this.apiKeyModal.querySelector('.modal-actions')
        );
    }

    clearError() {
        const existingError = this.apiKeyModal.querySelector('.error-message');
        if (existingError) {
            existingError.remove();
        }
    }

    updateStatus(status) {
        this.status.textContent = status;
    }

    async sendMessage() {
        const message = this.messageInput.value.trim();
        
        if (!message || this.isTyping) return;
        
        if (!this.apiKey) {
            this.showApiKeyModal();
            return;
        }

        if (!this.currentPersonality) {
            this.showPersonalityModal();
            return;
        }

        // Check if session has ended
        if (this.therapistMessageCount >= this.maxMessages) {
            alert('This session has ended. Please start a new session or select a different client.');
            return;
        }

        // Increment therapist message count
        this.therapistMessageCount++;

        // Add user message to chat
        this.addMessage(message, 'user');
        this.messageInput.value = '';
        this.charCount.textContent = '0';

        // Check if warning should be shown (5 messages remaining)
        const messagesRemaining = this.maxMessages - this.therapistMessageCount;
        if (messagesRemaining === 5 && !this.warningShown) {
            this.addSystemMessage(`⏰ <strong>Session Time Warning:</strong> You have 5 messages remaining in this session. Please begin wrapping up the conversation with your client.`);
            this.warningShown = true;
        }
        
        // Show typing indicator
        this.showTypingIndicator();
        
        try {
            // Check if this is the last message
            const isLastMessage = this.therapistMessageCount >= this.maxMessages;
            const response = await this.callClaudeAPI(message, isLastMessage);
            this.hideTypingIndicator();
            this.addMessage(response, 'bot');

            // If session has ended, disable input and show message
            if (isLastMessage) {
                this.endSession();
            }
        } catch (error) {
            this.hideTypingIndicator();
            this.handleError(error);
            // Decrement count if message failed
            this.therapistMessageCount--;
        }
    }

    addMessage(content, sender) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}-message`;
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        if (sender === 'user') {
            avatar.textContent = 'U';
        } else {
            avatar.textContent = this.currentPersonality ? 
                this.currentPersonality.name.charAt(0).toUpperCase() : 'B';
        }
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        const messageText = document.createElement('p');
        messageText.textContent = content;
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = this.formatTime(new Date());
        
        contentDiv.appendChild(messageText);
        contentDiv.appendChild(timeSpan);
        messageDiv.appendChild(avatar);
        messageDiv.appendChild(contentDiv);
        
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();

        // Store in conversation history
        this.conversationHistory.push({
            role: sender === 'user' ? 'user' : 'assistant',
            content: content
        });
    }

    addSystemMessage(content) {
        const messageDiv = document.createElement('div');
        messageDiv.className = 'message system-message';
        
        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';
        
        const messageText = document.createElement('p');
        messageText.innerHTML = content; // Use innerHTML to support HTML formatting
        
        const timeSpan = document.createElement('span');
        timeSpan.className = 'message-time';
        timeSpan.textContent = this.formatTime(new Date());
        
        contentDiv.appendChild(messageText);
        contentDiv.appendChild(timeSpan);
        messageDiv.appendChild(contentDiv);
        
        this.chatMessages.appendChild(messageDiv);
        this.scrollToBottom();
    }

    endSession() {
        this.messageInput.disabled = true;
        this.sendButton.disabled = true;
        this.messageInput.placeholder = 'Session has ended. Please start a new session.';
        this.updateStatus('Session Ended');
        
        this.addSystemMessage(`⏱️ <strong>Session Complete:</strong> This training session has ended (${this.maxMessages} messages reached). You can review the conversation, export to PDF, or start a new session.`);
    }

    showTypingIndicator() {
        this.isTyping = true;
        this.sendButton.disabled = true;
        this.updateStatus('Typing...');
        
        const typingDiv = document.createElement('div');
        typingDiv.className = 'message bot-message';
        typingDiv.id = 'typing-indicator';
        
        const avatar = document.createElement('div');
        avatar.className = 'message-avatar';
        avatar.textContent = this.currentPersonality ? 
            this.currentPersonality.name.charAt(0).toUpperCase() : 'B';
        
        const typingContent = document.createElement('div');
        typingContent.className = 'typing-indicator';
        
        const typingText = document.createElement('span');
        const personName = this.currentPersonality ? this.currentPersonality.name : 'Client';
        typingText.textContent = `${personName} is typing`;
        
        const dotsContainer = document.createElement('div');
        dotsContainer.className = 'typing-dots';
        
        for (let i = 0; i < 3; i++) {
            const dot = document.createElement('div');
            dot.className = 'typing-dot';
            dotsContainer.appendChild(dot);
        }
        
        typingContent.appendChild(typingText);
        typingContent.appendChild(dotsContainer);
        typingDiv.appendChild(avatar);
        typingDiv.appendChild(typingContent);
        
        this.chatMessages.appendChild(typingDiv);
        this.scrollToBottom();
    }

    hideTypingIndicator() {
        this.isTyping = false;
        this.sendButton.disabled = false;
        this.updateStatus('Online');
        
        const typingIndicator = document.getElementById('typing-indicator');
        if (typingIndicator) {
            typingIndicator.remove();
        }
    }

    async callClaudeAPI(userMessage, isLastMessage = false) {
        // Build the conversation history for Claude API
        const messages = [...this.conversationHistory];
        
        // Add the current user message
        messages.push({
            role: 'user',
            content: userMessage
        });

        // Prepare the API request
        const requestBody = {
            model: this.claudeModel,
            max_tokens: 1000,
            system: this.currentPersonality ? this.currentPersonality.personality : '',
            messages: messages,
            api_key: this.apiKey,
            is_last_message: isLastMessage
        };

        try {
            const response = await fetch('/api/claude', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(`API Error (${response.status}): ${errorData.error?.message || 'Unknown error'}`);
            }

            const data = await response.json();
            
            // Handle the response format
            if (data.content && Array.isArray(data.content) && data.content.length > 0) {
                return data.content[0].text;
            } else {
                throw new Error('Unexpected response format from Claude API');
            }
            
        } catch (error) {
            throw error;
        }
    }

    handleError(error) {
        console.error('Chat error:', error);
        
        let errorMessage = 'Sorry, I encountered an error. Please try again.';
        
        if (error.message.includes('401') || error.message.includes('Invalid API key')) {
            errorMessage = 'Invalid API key. Please check your Claude API key.';
            // Clear stored API key and show modal
            localStorage.removeItem('claude_api_key');
            this.apiKey = null;
            setTimeout(() => this.showApiKeyModal(), 1000);
        } else if (error.message.includes('429')) {
            errorMessage = 'Too many requests. Please wait a moment and try again.';
        } else if (error.message.includes('400')) {
            errorMessage = 'Invalid request. Please try rephrasing your message.';
        } else if (error.message.includes('Failed to fetch') || error.message.includes('Network')) {
            errorMessage = 'Network error. Please check your internet connection and try again.';
        } else if (error.message.includes('Server error')) {
            errorMessage = 'Server error occurred. Please try again in a moment.';
        }
        
        this.addMessage(errorMessage, 'bot');
        this.updateStatus('Error');
        
        // Reset status after a delay
        setTimeout(() => {
            if (this.apiKey) {
                this.updateStatus('Online');
            }
        }, 3000);
    }

    clearChat() {
        if (confirm('Are you sure you want to start a new session with this client?')) {
            this.clearChatForNewPersonality();
            this.conversationHistory = [];
            this.therapistMessageCount = 0;
            this.warningShown = false;
            
            // Re-enable input if it was disabled
            this.messageInput.disabled = false;
            this.sendButton.disabled = false;
            this.messageInput.placeholder = 'Type your message here...';
            
            if (this.currentPersonality) {
                this.updateStatus('Online');
                this.addInitialMessage();
            }
        }
    }

    printChatAsPdf() {
        // Create a new window for printing
        const printWindow = window.open('', '_blank');
        
        if (!printWindow) {
            alert('Please allow popups to print the chat history.');
            return;
        }

        // Get current date and time
        const now = new Date();
        const dateStr = now.toLocaleDateString();
        const timeStr = now.toLocaleTimeString();

        // Create the HTML content for the PDF
        const htmlContent = `
            <!DOCTYPE html>
            <html lang="en">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Chat History - ${dateStr}</title>
                <link rel="stylesheet" href="styles.css">
            </head>
            <body class="pdf-print-styles">
                <div class="header">
                    <h1>CBT Training Session${this.currentPersonality ? ` with ${this.currentPersonality.name}` : ''}</h1>
                    ${this.currentPersonality ? `
                        <div class="client-info">
                            <strong>Client:</strong> ${this.currentPersonality.name}, Age ${this.currentPersonality.age}<br>
                            <strong>Condition:</strong> ${this.currentPersonality.condition}<br>
                            <strong>Background:</strong> ${this.currentPersonality.background}
                        </div>
                    ` : ''}
                    <div class="date">Generated on ${dateStr} at ${timeStr}</div>
                </div>
                <div class="chat-content">
                    ${this.generatePdfChatContent()}
                </div>
                <div class="footer">
                    <p>CBT Training Session${this.currentPersonality ? ` with ${this.currentPersonality.name}` : ''}</p>
                    <p>Total messages: ${this.conversationHistory.length + 1}</p>
                </div>
            </body>
            </html>
        `;

        // Write content to the new window
        printWindow.document.write(htmlContent);
        printWindow.document.close();

        // Wait for content to load, then print
        printWindow.onload = () => {
            setTimeout(() => {
                printWindow.print();
                // Close the window after printing (optional)
                printWindow.onafterprint = () => {
                    printWindow.close();
                };
            }, 250);
        };
    }

    generatePdfChatContent() {
        const messages = this.chatMessages.children;
        let content = '';

        for (let i = 0; i < messages.length; i++) {
            const message = messages[i];
            
            // Skip typing indicator
            if (message.id === 'typing-indicator') continue;

            const isUser = message.classList.contains('user-message');
            const messageContent = message.querySelector('.message-content p');
            const messageTime = message.querySelector('.message-time');
            
            if (messageContent) {
                const sender = isUser ? 'You (Therapist)' : 
                    (this.currentPersonality ? this.currentPersonality.name : 'Client');
                const cssClass = isUser ? 'user-message' : 'bot-message';
                const time = messageTime ? messageTime.textContent : '';

                content += `
                    <div class="message ${cssClass}">
                        <div class="message-header">${sender}</div>
                        <div class="message-content">${this.escapeHtml(messageContent.textContent)}</div>
                        <div class="message-time">${time}</div>
                    </div>
                `;
            }
        }

        return content;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    formatTime(date) {
        return date.toLocaleTimeString([], { 
            hour: '2-digit', 
            minute: '2-digit' 
        });
    }

    scrollToBottom() {
        setTimeout(() => {
            this.chatMessages.scrollTop = this.chatMessages.scrollHeight;
        }, 100);
    }
}

// Initialize the chatbot when the page loads
document.addEventListener('DOMContentLoaded', () => {
    new ChatBot();
});

// Handle page visibility change to update status
document.addEventListener('visibilitychange', () => {
    const status = document.getElementById('status');
    if (status && localStorage.getItem('claude_api_key')) {
        if (document.hidden) {
            status.textContent = 'Away';
        } else {
            status.textContent = 'Online';
        }
    }
});
