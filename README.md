# 🏥 QueueCare | Patient Queue Management System

QueueCare is a real-time patient queue management system designed to eliminate waiting room congestion and enhance patient comfort. Patients scan a QR code at the clinic kiosk, check in on their mobile phones, track their live slot dynamically, and receive automated SMS updates when their turn is near.

📱 Patient Check-in: /
📺 TV Monitor (waiting room display): /monitor
🩺 Staff Admin Portal: /admin



# 💡 The Problem

Patients in clinics often wait for hours with no idea how long is left, unable to step away without losing their place in line. QueueCare solves this by letting patients check in remotely, track their live position from anywhere, and get notified before their turn — so they can wait comfortably instead of sitting in a crowded room.


## 🌟 Key Features


📋 Multi-Department Queuing

Independent, isolated queues for each clinic department (General Medicine, Cardiology, Pediatrics, Dermatology), with real-time wait estimates calculated per department based on average consultation time × patients ahead.

🎟️ Live Patient Ticket Tracker

A mobile-first status page showing the patient's ticket number, live queue position, and estimated wait time — updating instantly via WebSockets, no refresh needed.

📺 Waiting Room TV Monitor

A large-screen display for the waiting room showing the patient currently being served and the "Up Next" list, with a QR code for new patients to check in directly from their phones.

🔐 Role-Based Staff Access

Doctor — calls next patients, completes consultations, views clinic analytics (check-in volume, wait times by department)
Receptionist — registers walk-in patients, manages queue order (delay/cancel)


⏰ Automatic No-Show Handling

A background worker checks for patients who were called but didn't show up within a configurable timeout, automatically skipping them and reordering the queue.

📲 Real-Time Notifications

In-app live alerts plus SMS notifications (via Twilio) when a patient's turn is approaching.



## 🛠️ Tech Stack

| Layer | Technology |
| :--- | :--- |
| **Frontend** | HTML, CSS, JavaScript |
| **Backend** | Node.js, Express |
| **Database** | MySQL |
| **Real-time** | Socket.io (WebSockets) |
| **SMS** | Twilio |
| **Hosting** | Vercel (frontend), Render (backend) |



## 🚀 Installation & Local Setup

### 1. Configure Environments
Create a `.env` file inside the `backend/` directory:
```env
PORT=5000
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=
DB_NAME=queuecare

# JWT secret for RBAC authentication sessions
JWT_SECRET=queuecare_super_secret_session_key

# Twilio SMS API Credentials (Optional: falls back to console logger if empty)
TWILIO_ACCOUNT_SID=your_account_sid
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=your_twilio_phone
```

Create a `.env.local` file inside the `frontend/` directory:
```env
NEXT_PUBLIC_BACKEND_URL=http://localhost:5000
```

---

### 2. Run the Backend Server
```bash
cd backend
npm install
npm run dev
```
*Note: The backend will automatically connect to your MySQL database, run auto-migrations to create the `patients` and `staff` tables, and seed the demo dataset. If MySQL is unreachable, it automatically triggers an **In-Memory fallback database** so you can test all features instantly offline.*

---

### 3. Run the Frontend Client
```bash
cd frontend
npm install
npm run dev
```
Open **[http://localhost:3000](http://localhost:3000)** in your browser!
