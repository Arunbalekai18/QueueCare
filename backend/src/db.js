const mysql = require('mysql2/promise');
require('dotenv').config();

// In-Memory Database Fallback State
let useInMemory = false;
let mockPatients = [];
let mockCounter = 1;

// Initial mock data to seed for immediate visual delight (realistic clinic mid-morning entries)
const initialMockData = [
  { id: 101, name: "Rohan Sharma", phone: "+919876543210", status: "SERVING", position: 1, created_at: new Date(Date.now() - 45 * 60000), called_at: new Date(Date.now() - 5 * 60000), sms_sent_pre_call: true, sms_sent_called: true },
  { id: 102, name: "Priya Patel", phone: "+918765432109", status: "WAITING", position: 2, created_at: new Date(Date.now() - 30 * 60000), called_at: null, sms_sent_pre_call: true, sms_sent_called: false },
  { id: 103, name: "Amit Verma", phone: "+917654321098", status: "WAITING", position: 3, created_at: new Date(Date.now() - 20 * 60000), called_at: null, sms_sent_pre_call: false, sms_sent_called: false },
  { id: 104, name: "Anjali Nair", phone: "+916543210987", status: "WAITING", position: 4, created_at: new Date(Date.now() - 15 * 60000), called_at: null, sms_sent_pre_call: false, sms_sent_called: false },
  { id: 105, name: "Vikram Singh", phone: "+919543210986", status: "WAITING", position: 5, created_at: new Date(Date.now() - 10 * 60000), called_at: null, sms_sent_pre_call: false, sms_sent_called: false },
  { id: 106, name: "Sneha Gupta", phone: "+918543210985", status: "WAITING", position: 6, created_at: new Date(Date.now() - 5 * 60000), called_at: null, sms_sent_pre_call: false, sms_sent_called: false }
];

let pool = null;

async function initDB() {
  const config = {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '3306'),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
  };

  if (process.env.DB_SSL === 'true' || config.host.includes('aivencloud.com')) {
    config.ssl = { rejectUnauthorized: false };
  }

  try {
    // Attempt database server connection
    console.log(`Connecting to MySQL at ${config.host}:${config.port}...`);
    const connection = await mysql.createConnection(config);
    
    // Create database if not exists
    const dbName = process.env.DB_NAME || 'queuecare';
    await connection.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\``);
    await connection.end();

    // Reconnect directly to the database
    pool = mysql.createPool({
      ...config,
      database: dbName,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0
    });

    // Create table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        status ENUM('WAITING', 'PRE_CALL', 'SERVING', 'COMPLETED', 'CANCELLED') DEFAULT 'WAITING',
        position INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        called_at TIMESTAMP NULL,
        sms_sent_pre_call BOOLEAN DEFAULT FALSE,
        sms_sent_called BOOLEAN DEFAULT FALSE
      )
    `);

    // Check if table is empty to seed initial demo data
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM patients');
    if (rows[0].count === 0) {
      console.log('Seeding demo patient queue in MySQL...');
      for (const p of initialMockData) {
        await pool.query(
          'INSERT INTO patients (name, phone, status, position, created_at, called_at, sms_sent_pre_call, sms_sent_called) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
          [p.name, p.phone, p.status, p.position, p.created_at, p.called_at, p.sms_sent_pre_call, p.sms_sent_called]
        );
      }
    }

    console.log('✅ MySQL Database successfully connected and initialized.');
  } catch (error) {
    console.warn('\n⚠️  -------------------------------------------------------------');
    console.warn('⚠️  DATABASE SETUP WARNING: Cannot connect to MySQL.');
    console.warn(`⚠️  Error details: ${error.message}`);
    console.warn('⚠️  Fallback: Initializing IN-MEMORY DATABASE for live demo testing.');
    console.warn('⚠️  -------------------------------------------------------------\n');
    useInMemory = true;
    mockPatients = JSON.parse(JSON.stringify(initialMockData));
    mockCounter = 107; // Continue after mock ids (101-106)
  }
}

// DB Abstractions
async function getQueue() {
  if (useInMemory) {
    return mockPatients
      .filter(p => ['WAITING', 'PRE_CALL', 'SERVING'].includes(p.status))
      .sort((a, b) => a.position - b.position);
  }

  const [rows] = await pool.query(
    "SELECT * FROM patients WHERE status IN ('WAITING', 'PRE_CALL', 'SERVING') ORDER BY position ASC"
  );
  return rows;
}

async function getAllPatients() {
  if (useInMemory) {
    return mockPatients.sort((a, b) => b.id - a.id);
  }

  const [rows] = await pool.query("SELECT * FROM patients ORDER BY id DESC");
  return rows;
}

async function getPatientById(id) {
  const intId = parseInt(id);
  if (useInMemory) {
    return mockPatients.find(p => p.id === intId) || null;
  }

  const [rows] = await pool.query("SELECT * FROM patients WHERE id = ?", [intId]);
  return rows.length > 0 ? rows[0] : null;
}

async function addPatient(name, phone) {
  if (useInMemory) {
    // Find next position
    const active = mockPatients.filter(p => ['WAITING', 'PRE_CALL', 'SERVING'].includes(p.status));
    const maxPos = active.reduce((max, p) => p.position > max ? p.position : max, 0);
    const newPatient = {
      id: mockCounter++,
      name,
      phone,
      status: 'WAITING',
      position: maxPos + 1,
      created_at: new Date(),
      called_at: null,
      sms_sent_pre_call: false,
      sms_sent_called: false
    };
    mockPatients.push(newPatient);
    return newPatient;
  }

  // MySQL Transaction or safety lock
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const [active] = await connection.query(
      "SELECT MAX(position) as maxPos FROM patients WHERE status IN ('WAITING', 'PRE_CALL', 'SERVING')"
    );
    const maxPos = active[0].maxPos || 0;
    const nextPos = maxPos + 1;

    const [result] = await connection.query(
      "INSERT INTO patients (name, phone, status, position) VALUES (?, ?, 'WAITING', ?)",
      [name, phone, nextPos]
    );
    await connection.commit();

    const [rows] = await pool.query("SELECT * FROM patients WHERE id = ?", [result.insertId]);
    return rows[0];
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function callNext() {
  if (useInMemory) {
    const nextWaiting = mockPatients
      .filter(p => ['WAITING', 'PRE_CALL'].includes(p.status))
      .sort((a, b) => a.position - b.position)[0];

    if (!nextWaiting) return null;

    // Transition previous SERVING patients to COMPLETED (or let admin do it explicitly)
    // For demo, we will mark current serving as COMPLETED
    mockPatients.forEach(p => {
      if (p.status === 'SERVING') {
        p.status = 'COMPLETED';
      }
    });

    nextWaiting.status = 'SERVING';
    nextWaiting.called_at = new Date();
    
    // Recalculate queue positions of active patients
    reorderMockPositions();

    return nextWaiting;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    // Auto-complete any currently serving patients
    await connection.query("UPDATE patients SET status = 'COMPLETED' WHERE status = 'SERVING'");

    // Find the next patient
    const [nextRow] = await connection.query(
      "SELECT * FROM patients WHERE status IN ('WAITING', 'PRE_CALL') ORDER BY position ASC LIMIT 1"
    );

    if (nextRow.length === 0) {
      await connection.commit();
      return null;
    }

    const patientId = nextRow[0].id;
    await connection.query(
      "UPDATE patients SET status = 'SERVING', called_at = NOW() WHERE id = ?",
      [patientId]
    );

    await connection.commit();
    
    // Recalculate queue positions
    await reorderDatabasePositions();

    const [updated] = await pool.query("SELECT * FROM patients WHERE id = ?", [patientId]);
    return updated[0];
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

async function completePatient(id) {
  const intId = parseInt(id);
  if (useInMemory) {
    const patient = mockPatients.find(p => p.id === intId);
    if (patient) {
      patient.status = 'COMPLETED';
      reorderMockPositions();
    }
    return patient;
  }

  await pool.query("UPDATE patients SET status = 'COMPLETED' WHERE id = ?", [intId]);
  await reorderDatabasePositions();
  return getPatientById(intId);
}

async function cancelPatient(id) {
  const intId = parseInt(id);
  if (useInMemory) {
    const patient = mockPatients.find(p => p.id === intId);
    if (patient) {
      patient.status = 'CANCELLED';
      reorderMockPositions();
    }
    return patient;
  }

  await pool.query("UPDATE patients SET status = 'CANCELLED' WHERE id = ?", [intId]);
  await reorderDatabasePositions();
  return getPatientById(intId);
}

async function delayPatient(id) {
  const intId = parseInt(id);
  if (useInMemory) {
    const active = mockPatients
      .filter(p => ['WAITING', 'PRE_CALL', 'SERVING'].includes(p.status))
      .sort((a, b) => a.position - b.position);
    
    const index = active.findIndex(p => p.id === intId);
    if (index !== -1 && index < active.length - 1) {
      // Swap positions with the next active patient
      const current = active[index];
      const nextPat = active[index + 1];
      const tempPos = current.position;
      current.position = nextPat.position;
      nextPat.position = tempPos;
    }
    return mockPatients.find(p => p.id === intId);
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();

    const [currentRows] = await connection.query("SELECT * FROM patients WHERE id = ?", [intId]);
    if (currentRows.length === 0) throw new Error("Patient not found");
    const current = currentRows[0];

    // Find the next patient in the queue
    const [nextRows] = await connection.query(
      "SELECT * FROM patients WHERE status IN ('WAITING', 'PRE_CALL', 'SERVING') AND position > ? ORDER BY position ASC LIMIT 1",
      [current.position]
    );

    if (nextRows.length > 0) {
      const nextPat = nextRows[0];
      // Swap positions
      await connection.query("UPDATE patients SET position = ? WHERE id = ?", [nextPat.position, current.id]);
      await connection.query("UPDATE patients SET position = ? WHERE id = ?", [current.position, nextPat.id]);
    }

    await connection.commit();
    return getPatientById(intId);
  } catch (err) {
    await connection.rollback();
    throw err;
  } finally {
    connection.release();
  }
}

// SMS Flag triggers
async function updateSMSFlags(id, fields) {
  const intId = parseInt(id);
  const sets = [];
  const vals = [];
  if (fields.sms_sent_pre_call !== undefined) {
    sets.push("sms_sent_pre_call = ?");
    vals.push(fields.sms_sent_pre_call);
  }
  if (fields.sms_sent_called !== undefined) {
    sets.push("sms_sent_called = ?");
    vals.push(fields.sms_sent_called);
  }

  if (sets.length === 0) return;

  if (useInMemory) {
    const patient = mockPatients.find(p => p.id === intId);
    if (patient) {
      if (fields.sms_sent_pre_call !== undefined) patient.sms_sent_pre_call = fields.sms_sent_pre_call;
      if (fields.sms_sent_called !== undefined) patient.sms_sent_called = fields.sms_sent_called;
    }
    return;
  }

  vals.push(intId);
  await pool.query(`UPDATE patients SET ${sets.join(', ')} WHERE id = ?`, vals);
}

// Helpers for reordering
function reorderMockPositions() {
  const active = mockPatients
    .filter(p => ['WAITING', 'PRE_CALL', 'SERVING'].includes(p.status))
    .sort((a, b) => a.position - b.position);
  
  active.forEach((p, idx) => {
    p.position = idx + 1;
  });
}

async function reorderDatabasePositions() {
  const [active] = await pool.query(
    "SELECT id FROM patients WHERE status IN ('WAITING', 'PRE_CALL', 'SERVING') ORDER BY position ASC"
  );
  for (let i = 0; i < active.length; i++) {
    await pool.query("UPDATE patients SET position = ? WHERE id = ?", [i + 1, active[i].id]);
  }
}

module.exports = {
  initDB,
  getQueue,
  getAllPatients,
  getPatientById,
  addPatient,
  callNext,
  completePatient,
  cancelPatient,
  delayPatient,
  updateSMSFlags
};
