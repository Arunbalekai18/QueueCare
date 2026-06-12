const mysql = require('mysql2/promise');
require('dotenv').config();

// In-Memory Database Fallback State
let useInMemory = false;
let mockPatients = [];
let mockCounter = 1;
let mockStaff = [];

// Seeded staff accounts for live testing
const initialStaffData = [
  { username: 'receptionist', password: 'receptionist123', name: 'Clinic Receptionist', role: 'receptionist' },
  { username: 'doctor', password: 'doctor123', name: 'Dr. Arun Balekai', role: 'doctor' }
];

// Initial mock data to seed for immediate visual delight (realistic clinic mid-morning entries)
const initialMockData = [
  { id: 101, name: "Rohan Sharma", phone: "+919876543210", department: "General Medicine", status: "SERVING", position: 1, created_at: new Date(Date.now() - 45 * 60000), called_at: new Date(Date.now() - 5 * 60000), sms_sent_pre_call: true, sms_sent_called: true },
  { id: 102, name: "Priya Patel", phone: "+918765432109", department: "Cardiology", status: "WAITING", position: 1, created_at: new Date(Date.now() - 30 * 60000), called_at: null, sms_sent_pre_call: true, sms_sent_called: false },
  { id: 103, name: "Amit Verma", phone: "+917654321098", department: "Pediatrics", status: "WAITING", position: 1, created_at: new Date(Date.now() - 20 * 60000), called_at: null, sms_sent_pre_call: false, sms_sent_called: false },
  { id: 104, name: "Anjali Nair", phone: "+916543210987", department: "Dermatology", status: "WAITING", position: 1, created_at: new Date(Date.now() - 15 * 60000), called_at: null, sms_sent_pre_call: false, sms_sent_called: false },
  { id: 105, name: "Vikram Singh", phone: "+919543210986", department: "General Medicine", status: "WAITING", position: 2, created_at: new Date(Date.now() - 10 * 60000), called_at: null, sms_sent_pre_call: false, sms_sent_called: false },
  { id: 106, name: "Sneha Gupta", phone: "+918543210985", department: "Cardiology", status: "WAITING", position: 2, created_at: new Date(Date.now() - 5 * 60000), called_at: null, sms_sent_pre_call: false, sms_sent_called: false }
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

    // Create table (incorporating department field)
    await pool.query(`
      CREATE TABLE IF NOT EXISTS patients (
        id INT AUTO_INCREMENT PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        phone VARCHAR(20) NOT NULL,
        department VARCHAR(50) DEFAULT 'General Medicine',
        status ENUM('WAITING', 'PRE_CALL', 'SERVING', 'COMPLETED', 'CANCELLED') DEFAULT 'WAITING',
        position INT NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        called_at TIMESTAMP NULL,
        sms_sent_pre_call BOOLEAN DEFAULT FALSE,
        sms_sent_called BOOLEAN DEFAULT FALSE
      )
    `);

    // Schema Migrations: Ensure 'department' column exists in case the table already existed
    try {
      await pool.query("ALTER TABLE patients ADD COLUMN department VARCHAR(50) DEFAULT 'General Medicine'");
      console.log("Database Migration: Successfully added 'department' column to patients table.");
    } catch (migrationError) {
      // Ignore if the column already exists (ER_DUP_FIELDNAME / Duplicate column name)
      if (!migrationError.message.includes('Duplicate column name') && migrationError.code !== 'ER_DUP_FIELDNAME') {
        console.warn("Database Migration Warning:", migrationError.message);
      }
    }

    // Create staff table for RBAC login accounts
    await pool.query(`
      CREATE TABLE IF NOT EXISTS staff (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(50) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        name VARCHAR(100) NOT NULL,
        role ENUM('receptionist', 'doctor') NOT NULL
      )
    `);

    // Check if table is empty to seed initial demo data
    const [rows] = await pool.query('SELECT COUNT(*) as count FROM patients');
    if (rows[0].count === 0) {
      console.log('Seeding demo patient queue in MySQL...');
      for (const p of initialMockData) {
        await pool.query(
          'INSERT INTO patients (id, name, phone, department, status, position, created_at, called_at, sms_sent_pre_call, sms_sent_called) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          [p.id, p.name, p.phone, p.department, p.status, p.position, p.created_at, p.called_at, p.sms_sent_pre_call, p.sms_sent_called]
        );
      }
    }

    // Seed staff table if empty
    const [staffRows] = await pool.query('SELECT COUNT(*) as count FROM staff');
    if (staffRows[0].count === 0) {
      console.log('Seeding staff accounts in MySQL...');
      for (const s of initialStaffData) {
        await pool.query(
          'INSERT INTO staff (username, password, name, role) VALUES (?, ?, ?, ?)',
          [s.username, s.password, s.name, s.role]
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
    mockStaff = JSON.parse(JSON.stringify(initialStaffData));
  }
}

// DB Abstractions
async function getQueue() {
  if (useInMemory) {
    return mockPatients
      .filter(p => ['WAITING', 'PRE_CALL', 'SERVING'].includes(p.status))
      .sort((a, b) => {
        if (a.department !== b.department) return a.department.localeCompare(b.department);
        return a.position - b.position;
      });
  }

  const [rows] = await pool.query(
    "SELECT * FROM patients WHERE status IN ('WAITING', 'PRE_CALL', 'SERVING') ORDER BY department ASC, position ASC"
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

async function addPatient(name, phone, department = 'General Medicine') {
  if (useInMemory) {
    // Find next position in target department
    const active = mockPatients.filter(p => ['WAITING', 'PRE_CALL', 'SERVING'].includes(p.status) && p.department === department);
    const maxPos = active.reduce((max, p) => p.position > max ? p.position : max, 0);
    const newPatient = {
      id: mockCounter++,
      name,
      phone,
      department,
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
      "SELECT MAX(position) as maxPos FROM patients WHERE status IN ('WAITING', 'PRE_CALL', 'SERVING') AND department = ?",
      [department]
    );
    const maxPos = active[0].maxPos || 0;
    const nextPos = maxPos + 1;

    const [result] = await connection.query(
      "INSERT INTO patients (name, phone, department, status, position) VALUES (?, ?, ?, 'WAITING', ?)",
      [name, phone, department, nextPos]
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

async function callNext(department = null) {
  if (useInMemory) {
    let targetDept = department;
    let nextWaiting = null;

    if (!targetDept || targetDept === 'all') {
      // Find oldest active waiting patient across all departments
      nextWaiting = mockPatients
        .filter(p => ['WAITING', 'PRE_CALL'].includes(p.status))
        .sort((a, b) => new Date(a.created_at) - new Date(b.created_at))[0];
      if (nextWaiting) {
        targetDept = nextWaiting.department;
      }
    } else {
      nextWaiting = mockPatients
        .filter(p => ['WAITING', 'PRE_CALL'].includes(p.status) && p.department === targetDept)
        .sort((a, b) => a.position - b.position)[0];
    }

    if (!nextWaiting) return null;

    // Transition previous SERVING patient in the same department to COMPLETED
    mockPatients.forEach(p => {
      if (p.status === 'SERVING' && p.department === targetDept) {
        p.status = 'COMPLETED';
      }
    });

    nextWaiting.status = 'SERVING';
    nextWaiting.called_at = new Date();
    
    // Recalculate queue positions of active patients in this department
    reorderMockPositions(targetDept);

    return nextWaiting;
  }

  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    
    let targetDept = department;
    let nextWaiting = null;

    if (!targetDept || targetDept === 'all') {
      // Find oldest waiting patient across all departments
      const [rows] = await connection.query(
        "SELECT * FROM patients WHERE status IN ('WAITING', 'PRE_CALL') ORDER BY created_at ASC LIMIT 1"
      );
      if (rows.length === 0) {
        await connection.commit();
        return null;
      }
      nextWaiting = rows[0];
      targetDept = nextWaiting.department;
    } else {
      // Find next waiting in specific department
      const [rows] = await connection.query(
        "SELECT * FROM patients WHERE status IN ('WAITING', 'PRE_CALL') AND department = ? ORDER BY position ASC LIMIT 1",
        [targetDept]
      );
      if (rows.length === 0) {
        await connection.commit();
        return null;
      }
      nextWaiting = rows[0];
    }

    // Auto-complete any currently serving patient in this department
    await connection.query("UPDATE patients SET status = 'COMPLETED' WHERE status = 'SERVING' AND department = ?", [targetDept]);

    // Set next patient to SERVING
    await connection.query(
      "UPDATE patients SET status = 'SERVING', called_at = NOW() WHERE id = ?",
      [nextWaiting.id]
    );

    await connection.commit();
    
    // Recalculate positions in target department
    await reorderDatabasePositions(targetDept);

    const [updated] = await pool.query("SELECT * FROM patients WHERE id = ?", [nextWaiting.id]);
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
  const patient = await getPatientById(intId);
  if (!patient) return null;

  if (useInMemory) {
    patient.status = 'COMPLETED';
    reorderMockPositions(patient.department);
    return patient;
  }

  await pool.query("UPDATE patients SET status = 'COMPLETED' WHERE id = ?", [intId]);
  await reorderDatabasePositions(patient.department);
  return getPatientById(intId);
}

async function cancelPatient(id) {
  const intId = parseInt(id);
  const patient = await getPatientById(intId);
  if (!patient) return null;

  if (useInMemory) {
    patient.status = 'CANCELLED';
    reorderMockPositions(patient.department);
    return patient;
  }

  await pool.query("UPDATE patients SET status = 'CANCELLED' WHERE id = ?", [intId]);
  await reorderDatabasePositions(patient.department);
  return getPatientById(intId);
}

async function delayPatient(id) {
  const intId = parseInt(id);
  const patient = await getPatientById(intId);
  if (!patient) return null;

  if (useInMemory) {
    const active = mockPatients
      .filter(p => ['WAITING', 'PRE_CALL', 'SERVING'].includes(p.status) && p.department === patient.department)
      .sort((a, b) => a.position - b.position);
    
    const index = active.findIndex(p => p.id === intId);
    if (index !== -1 && index < active.length - 1) {
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

    // Find the next patient in the same department
    const [nextRows] = await connection.query(
      "SELECT * FROM patients WHERE status IN ('WAITING', 'PRE_CALL', 'SERVING') AND department = ? AND position > ? ORDER BY position ASC LIMIT 1",
      [current.department, current.position]
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
function reorderMockPositions(department = null) {
  const depts = department ? [department] : ['General Medicine', 'Cardiology', 'Pediatrics', 'Dermatology'];
  for (const dept of depts) {
    const active = mockPatients
      .filter(p => ['WAITING', 'PRE_CALL', 'SERVING'].includes(p.status) && p.department === dept)
      .sort((a, b) => a.position - b.position);
    
    active.forEach((p, idx) => {
      p.position = idx + 1;
    });
  }
}

async function reorderDatabasePositions(department = null) {
  const depts = department ? [department] : ['General Medicine', 'Cardiology', 'Pediatrics', 'Dermatology'];
  for (const dept of depts) {
    const [active] = await pool.query(
      "SELECT id FROM patients WHERE status IN ('WAITING', 'PRE_CALL', 'SERVING') AND department = ? ORDER BY position ASC",
      [dept]
    );
    for (let i = 0; i < active.length; i++) {
      await pool.query("UPDATE patients SET position = ? WHERE id = ?", [i + 1, active[i].id]);
    }
  }
}

async function getStaffUser(username) {
  if (useInMemory) {
    return mockStaff.find(s => s.username === username) || null;
  }
  const [rows] = await pool.query("SELECT * FROM staff WHERE username = ?", [username]);
  return rows.length > 0 ? rows[0] : null;
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
  updateSMSFlags,
  getStaffUser
};
