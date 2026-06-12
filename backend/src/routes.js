const express = require('express');
const db = require('./db');
const twilioService = require('./twilio');
const { generateToken, authMiddleware, requireRole } = require('./auth');

function setupRoutes(io) {
  const router = express.Router();

  // POST Admin Login (Supporting multiple staff accounts with roles)
  router.post('/admin/login', async (req, res) => {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }
    
    try {
      const user = await db.getStaffUser(username.trim().toLowerCase());
      if (user && user.password === password) {
        const token = generateToken({
          username: user.username,
          name: user.name,
          role: user.role
        });
        return res.json({ token });
      }
      res.status(401).json({ error: 'Invalid staff credentials.' });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // Helper to get frontend base URL
  const getFrontendUrl = (req, id) => {
    if (process.env.FRONTEND_URL) {
      return `${process.env.FRONTEND_URL.replace(/\/$/, '')}/tracker/${id}`;
    }
    
    // Dynamically check origin or referer header if present
    const requestOrigin = req && (req.get('origin') || req.get('referer'));
    if (requestOrigin) {
      try {
        const urlObj = new URL(requestOrigin);
        return `${urlObj.origin}/tracker/${id}`;
      } catch (e) {
        return `${requestOrigin.replace(/\/$/, '')}/tracker/${id}`;
      }
    }
    
    // Default production fallback
    return `https://queue-care-weld.vercel.app/tracker/${id}`;
  };

  // Helper to trigger automated pre-call SMS warnings for patients near their turn
  async function checkAndSendPreCallSMS(req) {
    const queue = await db.getQueue();
    const departments = ['General Medicine', 'Cardiology', 'Pediatrics', 'Dermatology'];
    
    for (const dept of departments) {
      const waitingInDept = queue.filter(p => p.department === dept && ['WAITING', 'PRE_CALL'].includes(p.status));
      for (let index = 0; index < waitingInDept.length; index++) {
        const patient = waitingInDept[index];
        const peopleAhead = index;

        if (peopleAhead > 0 && peopleAhead <= 2 && !patient.sms_sent_pre_call) {
          const trackerUrl = getFrontendUrl(req, patient.id);
          const smsBody = `Hi ${patient.name}, your turn is approaching at QueueCare (${dept})! There are only ${peopleAhead} patient(s) ahead of you. Please head to the reception. Live link: ${trackerUrl}`;
          
          try {
            await twilioService.sendSMS(patient.phone, smsBody);
            await db.updateSMSFlags(patient.id, { sms_sent_pre_call: true });
          } catch (err) {
            console.error(`Failed pre-call SMS to ${patient.name}:`, err.message);
          }
        }
      }
    }
  }

  // GET active queue
  router.get('/queue', async (req, res) => {
    try {
      const queue = await db.getQueue();
      res.json(queue);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET all history (for admin analytics)
  router.get('/queue/all', authMiddleware, requireRole(['doctor']), async (req, res) => {
    try {
      const history = await db.getAllPatients();
      res.json(history);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // GET single patient tracker details
  router.get('/patient/:id', async (req, res) => {
    try {
      const patient = await db.getPatientById(req.params.id);
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Calculate queue details
      const activeQueue = await db.getQueue();
      
      let peopleAhead = 0;
      let estWaitTime = 0;
      const AVG_CONSULTATION_TIME = 15;

      if (['WAITING', 'PRE_CALL'].includes(patient.status)) {
        // Count how many WAITING or PRE_CALL patients in same department have smaller positions
        const waitingBefore = activeQueue.filter(
          p => p.department === patient.department && 
               ['WAITING', 'PRE_CALL'].includes(p.status) && 
               p.position < patient.position
        );
        peopleAhead = waitingBefore.length;
        estWaitTime = AVG_CONSULTATION_TIME * peopleAhead;
      }

      res.json({
        patient,
        queueDetails: {
          peopleAhead,
          estWaitTime,
          isNowServing: patient.status === 'SERVING'
        }
      });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST Patient self check-in
  router.post('/checkin', async (req, res) => {
    const { name, phone, department } = req.body;
    const selectedDept = department || 'General Medicine';
    const allowedDepts = ['General Medicine', 'Cardiology', 'Pediatrics', 'Dermatology'];
    
    if (!allowedDepts.includes(selectedDept)) {
      return res.status(400).json({ error: 'Invalid department selection.' });
    }

    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and Phone Number are required.' });
    }

    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      return res.status(400).json({ error: 'Name cannot be empty or whitespace-only.' });
    }

    const phoneRegex = /^\+91\d{10}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      return res.status(400).json({ error: 'Phone number must be in the format +91XXXXXXXXXX (e.g. +919876543210).' });
    }

    try {
      // Prevent duplicate active check-ins from the same phone number
      const activeQueue = await db.getQueue();
      const isDuplicate = activeQueue.some(p => p.phone === trimmedPhone);
      if (isDuplicate) {
        return res.status(400).json({ error: 'A patient with this phone number is already active in the queue.' });
      }

      const patient = await db.addPatient(trimmedName, trimmedPhone, selectedDept);
      const trackerUrl = getFrontendUrl(req, patient.id);
      
      // Send Welcome SMS
      const queue = await db.getQueue();
      const waitingBefore = queue.filter(
        p => p.department === selectedDept && 
             ['WAITING', 'PRE_CALL'].includes(p.status) && 
             p.position < patient.position
      );
      const posInWait = waitingBefore.length + 1;
      const AVG_CONSULTATION_TIME = 15;
      const estWait = AVG_CONSULTATION_TIME * waitingBefore.length;

      const smsBody = `Welcome ${patient.name}! You are checked in at QueueCare (${selectedDept}). Your position in queue is #${posInWait}. Est. wait time: ${estWait} mins. Live tracker: ${trackerUrl}`;
      
      try {
        await twilioService.sendSMS(patient.phone, smsBody);
      } catch (err) {
        console.error('Initial check-in SMS failed:', err.message);
      }

      // Trigger pre-call analysis for everyone in queue
      await checkAndSendPreCallSMS(req);

      // Emit WS refresh
      const updatedQueue = await db.getQueue();
      io.emit('queue_updated', updatedQueue);

      res.status(201).json(patient);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST Call Next Patient
  router.post('/queue/call', authMiddleware, requireRole(['doctor']), async (req, res) => {
    const { department } = req.body;
    try {
      const patient = await db.callNext(department);
      if (!patient) {
        return res.status(404).json({ error: `No patients waiting in ${department && department !== 'all' ? department : 'queue'}.` });
      }

      // Send Called SMS
      const smsBody = `Hi ${patient.name}, it's your turn now at QueueCare (${patient.department})! Please proceed to the counter.`;
      try {
        await twilioService.sendSMS(patient.phone, smsBody);
        await db.updateSMSFlags(patient.id, { sms_sent_called: true });
      } catch (err) {
        console.error('Call next SMS failed:', err.message);
      }

      // Check pre-calls for next inline
      await checkAndSendPreCallSMS(req);

      // WS broadcasts
      const updatedQueue = await db.getQueue();
      io.emit('queue_updated', updatedQueue);
      io.emit('patient_called', patient);

      res.json({ message: 'Patient called successfully', patient });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST Complete Patient
  router.post('/queue/complete/:id', authMiddleware, requireRole(['doctor']), async (req, res) => {
    try {
      const patient = await db.completePatient(req.params.id);
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Check pre-calls for patients behind
      await checkAndSendPreCallSMS(req);

      const updatedQueue = await db.getQueue();
      io.emit('queue_updated', updatedQueue);

      res.json({ message: 'Patient session completed', patient });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST Cancel Patient
  router.post('/queue/cancel/:id', authMiddleware, requireRole(['receptionist', 'doctor']), async (req, res) => {
    try {
      const patient = await db.cancelPatient(req.params.id);
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Check pre-calls for patients behind
      await checkAndSendPreCallSMS(req);

      const updatedQueue = await db.getQueue();
      io.emit('queue_updated', updatedQueue);

      res.json({ message: 'Patient queue ticket cancelled', patient });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  // POST Delay / Snooze Patient
  router.post('/queue/delay/:id', authMiddleware, requireRole(['receptionist', 'doctor']), async (req, res) => {
    try {
      const patient = await db.delayPatient(req.params.id);
      if (!patient) {
        return res.status(404).json({ error: 'Patient not found' });
      }

      // Check pre-calls for any re-ordered patients
      await checkAndSendPreCallSMS(req);

      const updatedQueue = await db.getQueue();
      io.emit('queue_updated', updatedQueue);

      res.json({ message: 'Patient delayed successfully', patient });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

  return router;
}

module.exports = setupRoutes;
