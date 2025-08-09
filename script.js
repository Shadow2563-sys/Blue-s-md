// Loading screen transition
document.addEventListener('DOMContentLoaded', () => {
    if (window.location.pathname === '/') {
        setTimeout(() => {
            window.location.href = '/login';
        }, 10000);
    }
    
    // Initialize forms
    if (document.getElementById('loginForm')) {
        setupLoginForm();
    }
    
    if (document.getElementById('signupForm')) {
        setupSignupForm();
    }
    
    if (document.getElementById('consoleOutput')) {
        setupConsole();
    }
});

// Login form handling
function setupLoginForm() {
    const form = document.getElementById('loginForm');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        const data = {
            username: formData.get('username'),
            password: formData.get('password')
        };
        
        try {
            const response = await fetch('/api/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Store token and redirect
                localStorage.setItem('authToken', result.token);
                window.location.href = '/dashboard';
            } else {
                alert(result.message || 'Login failed');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred during login');
        }
    });
}

// Signup form handling
function setupSignupForm() {
    const form = document.getElementById('signupForm');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const formData = new FormData(form);
        const data = {
            username: formData.get('username'),
            email: formData.get('email'),
            password: formData.get('password')
        };
        
        try {
            const response = await fetch('/api/signup', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(data)
            });
            
            const result = await response.json();
            
            if (response.ok) {
                // Store token and redirect
                localStorage.setItem('authToken', result.token);
                window.location.href = '/dashboard';
            } else {
                alert(result.message || 'Signup failed');
            }
        } catch (error) {
            console.error('Error:', error);
            alert('An error occurred during signup');
        }
    });
}

// Console functionality
function setupConsole() {
    const consoleOutput = document.getElementById('consoleOutput');
    const consoleInput = document.getElementById('consoleInput');
    const sendBtn = document.getElementById('sendBtn');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    
    let isRunning = false;
    let pairedNumber = null;
    let eventSource = null;
    
    // Display username
    const username = localStorage.getItem('username') || 'USER';
    document.getElementById('usernameDisplay').textContent = `USER: ${username}`;
    
    // Add initial console message
    addConsoleLine('System initialized. Type "help" for commands.', 'system');
    
    // Start button
    startBtn.addEventListener('click', async () => {
        if (isRunning) return;
        
        try {
            const response = await fetch('/api/start-console', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            
            const result = await response.json();
            
            if (response.ok) {
                isRunning = true;
                startBtn.disabled = true;
                stopBtn.disabled = false;
                consoleInput.disabled = false;
                sendBtn.disabled = false;
                
                addConsoleLine('Blue\'s MD online. Please input number', 'system');
                
                // Connect to SSE for updates
                connectToUpdates();
            } else {
                addConsoleLine(`Error: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            addConsoleLine('Error starting console', 'error');
        }
    });
    
    // Stop button
    stopBtn.addEventListener('click', async () => {
        if (!isRunning) return;
        
        try {
            const response = await fetch('/api/stop-console', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                }
            });
            
            const result = await response.json();
            
            if (response.ok) {
                isRunning = false;
                startBtn.disabled = false;
                stopBtn.disabled = true;
                consoleInput.disabled = true;
                sendBtn.disabled = true;
                
                addConsoleLine('System stopped.', 'system');
                
                // Close SSE connection
                if (eventSource) {
                    eventSource.close();
                    eventSource = null;
                }
            } else {
                addConsoleLine(`Error: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            addConsoleLine('Error stopping console', 'error');
        }
    });
    
    // Send button/input handling
    function handleInput() {
        const input = consoleInput.value.trim();
        if (!input) return;
        
        addConsoleLine(`> ${input}`, 'input');
        consoleInput.value = '';
        
        if (!isRunning) {
            addConsoleLine('System is not running. Type "start" to begin.', 'error');
            return;
        }
        
        // Handle commands
        if (input.toLowerCase() === 'help') {
            addConsoleLine('Available commands:', 'system');
            addConsoleLine('start - Start the system', 'system');
            addConsoleLine('stop - Stop the system', 'system');
            addConsoleLine('clear - Clear console', 'system');
            return;
        }
        
        if (input.toLowerCase() === 'clear') {
            consoleOutput.innerHTML = '';
            return;
        }
        
        // Process number input
        processNumberInput(input);
    }
    
    sendBtn.addEventListener('click', handleInput);
    consoleInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') handleInput();
    });
    
    // Process number input
    async function processNumberInput(number) {
        try {
            const response = await fetch('/api/process-number', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
                },
                body: JSON.stringify({ number })
            });
            
            const result = await response.json();
            
            if (response.ok) {
                pairedNumber = number;
                addConsoleLine(`Number ${number} paired successfully. Waiting for code...`, 'system');
            } else {
                addConsoleLine(`Error: ${result.message}`, 'error');
            }
        } catch (error) {
            console.error('Error:', error);
            addConsoleLine('Error processing number', 'error');
        }
    }
    
    // Connect to Server-Sent Events for updates
    function connectToUpdates() {
        eventSource = new EventSource(`/api/console-updates?token=${localStorage.getItem('authToken')}`);
        
        eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            addConsoleLine(data.message, 'response');
        };
        
        eventSource.onerror = (error) => {
            console.error('SSE error:', error);
            addConsoleLine('Connection error. Try restarting the system.', 'error');
            eventSource.close();
        };
    }
    
    // Logout button
    logoutBtn.addEventListener('click', () => {
        localStorage.removeItem('authToken');
        window.location.href = '/login';
    });
    
    // Helper function to add lines to console
    function addConsoleLine(text, type = 'system') {
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = text;
        consoleOutput.appendChild(line);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
    }
}
