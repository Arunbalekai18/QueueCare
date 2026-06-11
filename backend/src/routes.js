const express = require('express');
const db = require('./db');
const twilioService = require('./twilio');

function setupRoutes(io) {
  const router = express.Router();

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
    // Filter down to patients still waiting (not already being served)
    const waitingPatients = queue.filter(p => ['WAITING', 'PRE_CALL'].includes(p.status));
    
    // We notify patients who have 1 or 2 people ahead of them (index 1 and index 2 in waiting array)
    for (let index = 0; index < waitingPatients.length; index++) {
      const patient = waitingPatients[index];
      const peopleAhead = index;

      if (peopleAhead > 0 && peopleAhead <= 2 && !patient.sms_sent_pre_call) {
        const trackerUrl = getFrontendUrl(req, patient.id);
        const smsBody = `Hi ${patient.name}, your turn is approaching at QueueCare! There are only ${peopleAhead} patient(s) ahead of you. Please head to the reception. Live link: ${trackerUrl}`;
        
        try {
          await twilioService.sendSMS(patient.phone, smsBody);
          await db.updateSMSFlags(patient.id, { sms_sent_pre_call: true });
        } catch (err) {
          console.error(`Failed pre-call SMS to ${patient.name}:`, err.message);
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
  router.get('/queue/all', async (req, res) => {
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

      if (['WAITING', 'PRE_CALL'].includes(patient.status)) {
        // Count how many WAITING or PRE_CALL patients have smaller positions
        const waitingBefore = activeQueue.filter(
          p => ['WAITING', 'PRE_CALL'].includes(p.status) && p.position < patient.position
        );
        peopleAhead = waitingBefore.length;
        
        // Est wait: 15 minutes per waiting patient plus 10 for the currently serving one if exists
        const currentlyServing = activeQueue.find(p => p.status === 'SERVING');
        estWaitTime = (peopleAhead * 15) + (currentlyServing ? 10 : 0);
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
    const { name, phone } = req.body;
    if (!name || !phone) {
      return res.status(400).json({ error: 'Name and Phone Number are required.' });
    }

    try {
      const patient = await db.addPatient(name, phone);
      const trackerUrl = getFrontendUrl(req, patient.id);
      
      // Send Welcome SMS
      // Since position is dynamic, calculate how many active waiting are before them
      const queue = await db.getQueue();
      const waitingBefore = queue.filter(
        p => ['WAITING', 'PRE_CALL'].includes(p.status) && p.position < patient.position
      );
      const posInWait = waitingBefore.length + 1;
      const estWait = (waitingBefore.length * 15) + (queue.some(p => p.status === 'SERVING') ? 10 : 0);

      const smsBody = `Welcome ${patient.name}! You are checked in at QueueCare. Your position in queue is #${posInWait}. Est. wait time: ${estWait} mins. Live tracker: ${trackerUrl}`;
      
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
  router.post('/queue/call', async (req, res) => {
    try {
      const patient = await db.callNext();
      if (!patient) {
        return res.status(404).json({ error: 'No patients waiting in queue.' });
      }

      // Send Called SMS
      const smsBody = `Hi ${patient.name}, it's your turn now at QueueCare! Please proceed to the treatment room/counter.`;
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
  router.post('/queue/complete/:id', async (req, res) => {
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
  router.post('/queue/cancel/:id', async (req, res) => {
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
  router.post('/queue/delay/:id', async (req, res) => {
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
