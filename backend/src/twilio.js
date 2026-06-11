const twilio = require('twilio');
require('dotenv').config();

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;
const fromPhone = process.env.TWILIO_PHONE_NUMBER;

let client = null;
let isMock = true;

if (accountSid && authToken && fromPhone) {
  try {
    client = twilio(accountSid, authToken);
    isMock = false;
    console.log('✅ Twilio SMS Client initialized successfully.');
  } catch (error) {
    console.warn('⚠️  Twilio Initialization failed. Using simulation mode.', error.message);
  }
} else {
  console.log('📱 Twilio keys not detected. SMS notification client initialized in SIMULATION MODE.');
}

/**
 * Sends SMS notification to patient.
 * @param {string} to - Recipient phone number (e.g. +1234567890)
 * @param {string} body - SMS Text message content
 */
async function sendSMS(to, body) {
  if (isMock) {
    // Stylized Terminal Simulation Layout
    console.log('\n📱 --- SIMULATED OUTGOING SMS CLIENT ---');
    console.log(`| TO:   ${to}`);
    console.log(`| FROM: ${fromPhone || 'QUEUECARE_SENDER'}`);
    console.log('| BODY:');
    console.log(`|       "${body}"`);
    console.log('----------------------------------------\n');
    return { sid: 'SM_mock_' + Math.random().toString(36).substr(2, 9), status: 'queued' };
  }

  try {
    const message = await client.messages.create({
      body: body,
      from: fromPhone,
      to: to
    });
    console.log(`✉️  SMS successfully sent to ${to}. SID: ${message.sid}`);
    return message;
  } catch (error) {
    console.error(`❌ SMS transmission failed to ${to}:`, error.message);
    throw error;
  }
}

module.exports = {
  sendSMS
};
