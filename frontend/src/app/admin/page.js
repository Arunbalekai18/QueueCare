"use client";

import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { 
  Users, Clock, CheckCircle2, XCircle, Plus, 
  Play, RotateCcw, AlertTriangle, ShieldCheck, ArrowRight, Lock, LogIn, BarChart3, LayoutDashboard
} from 'lucide-react';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
} from 'chart.js';
import { Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
  CategoryScale,
  LinearScale,
  BarElement,
  Title,
  Tooltip,
  Legend,
  ArcElement
);

export default function AdminDashboard() {
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [toasts, setToasts] = useState([]);
  
  // Tabs & Filters
  const [activeTab, setActiveTab] = useState('dashboard'); // 'dashboard' or 'analytics'
  const [walkinDept, setWalkinDept] = useState('General Medicine');
  const [callingDept, setCallingDept] = useState('all');
  const [filterDept, setFilterDept] = useState('all');

  // Auth state
  const [token, setToken] = useState(null);
  const [isMounted, setIsMounted] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('');
  const [staffName, setStaffName] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);

  // local helper to decode JWT payload parameters
  const decodeToken = (t) => {
    try {
      const payloadBase64 = t.split('.')[1];
      const decoded = JSON.parse(atob(payloadBase64.replace(/-/g, '+').replace(/_/g, '/')));
      return decoded;
    } catch (e) {
      return null;
    }
  };
  
  // Walk-in form states
  const [walkinName, setWalkinName] = useState('');
  const [walkinPhone, setWalkinPhone] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formSuccess, setFormSuccess] = useState('');
  const [formError, setFormError] = useState('');

  const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');

  const queueRef = useRef([]);
  const socketRef = useRef(null);
  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  useEffect(() => {
    setIsMounted(true);
    const savedToken = localStorage.getItem('admin_token');
    if (savedToken) {
      setToken(savedToken);
      const decoded = decodeToken(savedToken);
      if (decoded) {
        setRole(decoded.role || '');
        setStaffName(decoded.name || '');
      }
    } else {
      setLoading(false); // Enable login view immediately
    }
  }, []);

  const addToast = (message, type = 'info') => {
    const id = Date.now();
    setToasts(prev => [...prev, { id, message, type, fading: false }]);
    
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, fading: true } : t));
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id));
      }, 250);
    }, 5000);
  };

  // Fetch both active queue and history for analytics
  const fetchDashboardData = async (isInitial = false) => {
    const activeToken = localStorage.getItem('admin_token');
    if (!activeToken) return;

    // Decode role directly from token to prevent state latency issues on login
    const decoded = decodeToken(activeToken);
    const userRole = decoded ? decoded.role : '';

    try {
      const queueRes = await fetch(`${backendUrl}/api/queue`);
      if (!queueRes.ok) {
        throw new Error('Failed to retrieve clinic active queue.');
      }
      const queueData = await queueRes.json();

      let historyData = [];
      if (userRole === 'doctor') {
        const historyRes = await fetch(`${backendUrl}/api/queue/all`, {
          headers: {
            'Authorization': `Bearer ${activeToken}`
          }
        });

        if (historyRes.status === 401 || historyRes.status === 403) {
          handleLogout();
          throw new Error('Session expired. Please log in again.');
        }

        if (!historyRes.ok) {
          throw new Error('Failed to retrieve clinic queue metrics.');
        }
        historyData = await historyRes.json();
      }

      // Check for new check-ins dynamically
      if (!isInitial && queueRef.current.length > 0) {
        const newCheckins = queueData.filter(newPat => !queueRef.current.some(oldPat => oldPat.id === newPat.id));
        newCheckins.forEach(p => {
          addToast(`🆕 New patient checked in: ${p.name} (${p.department})`, 'success');
        });
      }

      setQueue(queueData);
      setHistory(historyData);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!token) return;
    
    fetchDashboardData(true);

    // Connect WebSocket
    const socket = io(backendUrl);
    socketRef.current = socket;

    socket.on('connect', () => {
      addToast('🔌 Connected to live clinic console.', 'success');
    });

    socket.on('disconnect', (reason) => {
      if (reason === 'io client disconnect') return;
      addToast('📡 Connection lost. Reconnecting...', 'danger');
    });

    socket.on('queue_updated', () => {
      fetchDashboardData(false);
    });

    return () => {
      if (socketRef.current) {
        socketRef.current.removeAllListeners();
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [token]);

  // Quick Action Handler Helper
  const handleAction = async (endpoint, id = null) => {
    const activeToken = localStorage.getItem('admin_token');
    if (!activeToken) return;
    try {
      const url = id ? `${backendUrl}/api/queue/${endpoint}/${id}` : `${backendUrl}/api/queue/${endpoint}`;
      
      const options = {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${activeToken}`,
          'Content-Type': 'application/json'
        }
      };

      if (endpoint === 'call') {
        options.body = JSON.stringify({ department: callingDept });
      }

      const res = await fetch(url, options);
      
      if (res.status === 401 || res.status === 403) {
        handleLogout();
        throw new Error('Session expired. Please log in again.');
      }

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Action failed');
      }
      
      if (endpoint === 'call') {
        const data = await res.json();
        addToast(`🔊 Called patient: ${data.patient.name} (${data.patient.department})!`, 'success');
      } else if (endpoint === 'complete') {
        addToast('✅ Marked consultation as completed.', 'success');
      } else if (endpoint === 'cancel') {
        addToast('❌ Queue ticket cancelled.', 'danger');
      } else if (endpoint === 'delay') {
        addToast('⏰ Snoozed/delayed patient position in queue.', 'warning');
      }
      
      fetchDashboardData(false);
    } catch (err) {
      addToast(`Error: ${err.message}`, 'danger');
    }
  };

  // Submit manual walk-in check-in
  const handleWalkinSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = walkinName.trim();
    const trimmedPhone = walkinPhone.trim();

    if (!trimmedName) {
      setFormError('Please enter a valid patient name.');
      return;
    }
    if (!trimmedPhone) {
      setFormError('Please enter a mobile phone number.');
      return;
    }

    // Strict Indian phone number validation (+91XXXXXXXXXX)
    const phoneRegex = /^\+91\d{10}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      setFormError('Phone number must be in the format +91XXXXXXXXXX (e.g. +919876543210).');
      return;
    }

    setFormLoading(true);
    setFormError('');
    setFormSuccess('');

    try {
      const res = await fetch(`${backendUrl}/api/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmedName, phone: trimmedPhone, department: walkinDept })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Walk-in registration failed.');
      }

      setWalkinName('');
      setWalkinPhone('');
      setFormSuccess('Walk-in patient registered successfully!');
      addToast('🆕 Registered walk-in patient successfully!', 'success');
      fetchDashboardData(false);
    } catch (err) {
      setFormError(err.message);
      addToast(`Registration failed: ${err.message}`, 'danger');
    } finally {
      setFormLoading(false);
    }
  };

  // Login handler
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!username.trim()) {
      setLoginError('Please enter a username.');
      return;
    }
    if (!password) {
      setLoginError('Please enter the password.');
      return;
    }

    setLoginLoading(true);
    setLoginError('');

    try {
      const res = await fetch(`${backendUrl}/api/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: username.trim(), password })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Login failed.');
      }

      const data = await res.json();
      localStorage.setItem('admin_token', data.token);
      setToken(data.token);
      
      const decoded = decodeToken(data.token);
      if (decoded) {
        setRole(decoded.role || '');
        setStaffName(decoded.name || '');
      }

      addToast('🔓 Logged in successfully.', 'success');
    } catch (err) {
      setLoginError(err.message);
    } finally {
      setLoginLoading(false);
    }
  };

  // Logout handler
  const handleLogout = () => {
    if (socketRef.current) {
      socketRef.current.removeAllListeners();
      socketRef.current.disconnect();
      socketRef.current = null;
    }
    localStorage.removeItem('admin_token');
    setToken(null);
    setUsername('');
    setPassword('');
    setRole('');
    setStaffName('');
    setQueue([]);
    setHistory([]);
    addToast('🔒 Logged out successfully.', 'info');
  };

  // Data processing for Chart.js
  const getPatientsPerHourData = () => {
    const counts = Array(24).fill(0);
    const today = new Date().toDateString();
    
    history.forEach(p => {
      const createdDate = new Date(p.created_at);
      if (createdDate.toDateString() === today) {
        const hr = createdDate.getHours();
        counts[hr]++;
      }
    });

    const activeHours = [];
    const activeCounts = [];
    for (let hr = 8; hr <= 18; hr++) {
      const displayHr = hr > 12 ? `${hr - 12} PM` : hr === 12 ? '12 PM' : `${hr} AM`;
      activeHours.push(displayHr);
      activeCounts.push(counts[hr]);
    }

    return {
      labels: activeHours,
      datasets: [
        {
          label: 'Checked-In Patients',
          data: activeCounts,
          backgroundColor: 'rgba(6, 182, 212, 0.45)',
          borderColor: 'rgba(6, 182, 212, 1)',
          borderWidth: 1.5,
          borderRadius: 6
        }
      ]
    };
  };

  const getAvgWaitByDeptData = () => {
    const departments = ['General Medicine', 'Cardiology', 'Pediatrics', 'Dermatology'];
    const totalWait = {};
    const count = {};

    departments.forEach(dept => {
      totalWait[dept] = 0;
      count[dept] = 0;
    });

    history.forEach(p => {
      if (p.status === 'COMPLETED' && p.called_at) {
        const created = new Date(p.created_at);
        const called = new Date(p.called_at);
        const waitMin = (called - created) / 60000;
        
        if (totalWait[p.department] !== undefined) {
          totalWait[p.department] += waitMin;
          count[p.department]++;
        }
      }
    });

    const avgWaitTimes = departments.map(dept => {
      return count[dept] > 0 ? Math.round(totalWait[dept] / count[dept]) : 0;
    });

    return {
      labels: departments,
      datasets: [
        {
          label: 'Avg Wait (mins)',
          data: avgWaitTimes,
          backgroundColor: [
            'rgba(6, 182, 212, 0.35)',   // Teal
            'rgba(245, 158, 11, 0.35)',  // Amber
            'rgba(139, 92, 246, 0.35)',  // Purple
            'rgba(16, 185, 129, 0.35)'   // Emerald
          ],
          borderColor: [
            'var(--accent-teal)',
            'var(--accent-amber)',
            'var(--accent-purple)',
            'var(--accent-emerald)'
          ],
          borderWidth: 1.5
        }
      ]
    };
  };

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        labels: {
          color: '#cbd5e1',
          font: { family: 'Inter', size: 11 }
        }
      }
    },
    scales: {
      x: {
        grid: { color: 'rgba(255, 255, 255, 0.04)' },
        ticks: { color: '#64748b' }
      },
      y: {
        grid: { color: 'rgba(255, 255, 255, 0.04)' },
        ticks: { color: '#64748b', stepSize: 1 }
      }
    }
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: 'right',
        labels: {
          color: '#cbd5e1',
          font: { family: 'Inter', size: 11 }
        }
      }
    }
  };

  // Calculate Metrics
  const activeCount = queue.length;
  const completedToday = history.filter(p => p.status === 'COMPLETED').length;
  const cancelledToday = history.filter(p => p.status === 'CANCELLED').length;
  const nowServingPatient = queue.find(p => p.status === 'SERVING');
  
  // Calculate average wait time (from creation to calling)
  const waitTimes = history
    .filter(p => p.status === 'COMPLETED' || p.status === 'SERVING' || p.called_at)
    .map(p => {
      const created = new Date(p.created_at);
      const called = p.called_at ? new Date(p.called_at) : new Date(p.updated_at);
      return called - created;
    });

  const averageWaitTime = waitTimes.length 
    ? Math.round(waitTimes.reduce((a, b) => a + b, 0) / waitTimes.length / 60000) 
    : 0;

  // Filter Queue for display
  const displayedQueue = filterDept === 'all'
    ? queue
    : queue.filter(p => p.department === filterDept);

  if (!isMounted) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '1rem' }}>
        <div className="logo-icon pulse-glow" style={{ width: '60px', height: '60px' }}>
          <Clock size={30} color="#000" />
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>Loading secure console...</p>
      </div>
    );
  }

  if (!token) {
    return (
      <div className="slide-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '65vh', padding: '1rem' }}>
        {/* Toast Notifications */}
        <div className="toast-container">
          {toasts.map(t => (
            <div key={t.id} className={`toast-card ${t.type} ${t.fading ? 'fade-out' : ''}`}>
              <div style={{ flex: 1 }}>{t.message}</div>
              <button 
                onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.25rem', padding: '0 0 0 0.5rem', lineHeight: 1 }}
              >
                &times;
              </button>
            </div>
          ))}
        </div>

        <div className="glass-card pulse-glow" style={{ maxWidth: '400px', width: '100%', padding: '2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'center', marginBottom: '1.5rem' }}>
            <div style={{ background: 'var(--accent-purple-glow)', padding: '1rem', borderRadius: '50px', color: 'var(--accent-purple)', border: '1px solid var(--accent-purple)' }}>
              <Lock size={32} />
            </div>
          </div>
          <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', textAlign: 'center', color: 'var(--text-primary)' }}>Staff Access</h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem', textAlign: 'center' }}>
            Enter your staff credentials to access clinic console controls
          </p>

          {loginError && (
            <div style={{ background: 'rgba(244, 63, 94, 0.1)', color: 'var(--accent-rose)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
              {loginError}
            </div>
          )}

          <form onSubmit={handleLogin}>
            <div className="form-group" style={{ marginBottom: '1.25rem' }}>
              <label className="form-label" htmlFor="admin-username">Username</label>
              <div style={{ position: 'relative' }}>
                <Users size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="admin-username"
                  type="text"
                  className="input-field"
                  placeholder="doctor / receptionist"
                  style={{ paddingLeft: '2.75rem', width: '100%' }}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={loginLoading}
                />
              </div>
            </div>

            <div className="form-group" style={{ marginBottom: '1.75rem' }}>
              <label className="form-label" htmlFor="admin-password">Password</label>
              <div style={{ position: 'relative' }}>
                <Lock size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                <input
                  id="admin-password"
                  type="password"
                  className="input-field"
                  placeholder="••••••••"
                  style={{ paddingLeft: '2.75rem', width: '100%' }}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loginLoading}
                />
              </div>
            </div>

            <button
              type="submit"
              className="btn btn-accent"
              style={{ width: '100%', padding: '1rem', display: 'flex', gap: '0.75rem', justifyContent: 'center' }}
              disabled={loginLoading}
            >
              <LogIn size={18} />
              <span>{loginLoading ? 'Signing In...' : 'Unlock Dashboard'}</span>
            </button>
          </form>

          <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
            <ShieldCheck size={14} />
            <span>Secure encryption active</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="slide-in">
      {/* Toast Notifications */}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast-card ${t.type} ${t.fading ? 'fade-out' : ''}`}>
            <div style={{ flex: 1 }}>{t.message}</div>
            <button 
              onClick={() => setToasts(prev => prev.filter(item => item.id !== t.id))}
              style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '1.25rem', padding: '0 0 0 0.5rem', lineHeight: 1 }}
            >
              &times;
            </button>
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem', flexWrap: 'wrap', gap: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', marginBottom: '0.25rem' }}>Clinic Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Manage patients, monitor queues, and call waiting tickets.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{
            fontSize: '0.85rem',
            fontWeight: 600,
            background: role === 'doctor' ? 'var(--accent-purple-glow)' : 'var(--accent-teal-glow)',
            color: role === 'doctor' ? 'var(--accent-purple)' : 'var(--accent-teal)',
            border: `1px solid ${role === 'doctor' ? 'var(--accent-purple)' : 'var(--accent-teal)'}`,
            padding: '0.4rem 1rem',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem'
          }}>
            <span>{role === 'doctor' ? '🩺' : '💼'}</span>
            <span>{staffName || (role === 'doctor' ? 'Doctor' : 'Receptionist')}</span>
          </div>
          <button 
            onClick={handleLogout}
            className="btn btn-secondary"
            style={{ padding: '0.6rem 1.25rem', display: 'flex', gap: '0.5rem', alignItems: 'center' }}
          >
            <LogIn size={16} style={{ transform: 'rotate(180deg)' }} />
            <span>Log Out</span>
          </button>
        </div>
      </div>

      {/* Tab Switcher - Only shown to Doctor as they are authorized to view analytics */}
      {role === 'doctor' && (
        <div style={{ display: 'flex', gap: '1rem', marginBottom: '2rem', borderBottom: '1px solid var(--border-color)', paddingBottom: '0.75rem' }}>
          <button
            onClick={() => setActiveTab('dashboard')}
            className="nav-link"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              border: 'none', 
              background: activeTab === 'dashboard' ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: activeTab === 'dashboard' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontWeight: 600
            }}
          >
            <LayoutDashboard size={16} />
            <span>Dashboard Console</span>
          </button>
          <button
            onClick={() => setActiveTab('analytics')}
            className="nav-link"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '0.5rem', 
              border: 'none', 
              background: activeTab === 'analytics' ? 'rgba(255,255,255,0.06)' : 'transparent',
              color: activeTab === 'analytics' ? 'var(--text-primary)' : 'var(--text-muted)',
              cursor: 'pointer',
              padding: '0.5rem 1rem',
              borderRadius: '8px',
              fontWeight: 600
            }}
          >
            <BarChart3 size={16} />
            <span>Clinic Analytics</span>
          </button>
        </div>
      )}

      {error && (
        <div style={{ background: 'rgba(244, 63, 94, 0.1)', color: 'var(--accent-rose)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '1rem', borderRadius: '10px', display: 'flex', gap: '0.75rem', marginBottom: '2rem' }}>
          <AlertTriangle />
          <span>{error}</span>
        </div>
      )}

      {/* Metrics Row */}
      <div className="metrics-grid">
        <div className="metric-card" style={{ '--accent-color': 'var(--accent-teal)' }}>
          <span className="metric-title">Active in Queue</span>
          <span className="metric-value">{activeCount}</span>
        </div>

        <div className="metric-card" style={{ '--accent-color': 'var(--accent-purple)' }}>
          <span className="metric-title">Avg. Wait Time</span>
          <span className="metric-value">{averageWaitTime} <span style={{ fontSize: '1.25rem' }}>mins</span></span>
        </div>

        <div className="metric-card" style={{ '--accent-color': 'var(--accent-emerald)' }}>
          <span className="metric-title">Completed Today</span>
          <span className="metric-value">{completedToday}</span>
        </div>

        <div className="metric-card" style={{ '--accent-color': 'var(--accent-rose)' }}>
          <span className="metric-title">Cancellations</span>
          <span className="metric-value">{cancelledToday}</span>
        </div>
      </div>

      {activeTab === 'analytics' ? (
        /* Analytics View */
        <div className="glass-card slide-in" style={{ padding: '2.5rem' }}>
          <h2 style={{ fontSize: '1.5rem', marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <BarChart3 size={24} color="var(--accent-purple)" />
            <span>Clinic Queue Analytics</span>
          </h2>
          
          {history.length === 0 ? (
            <div style={{ padding: '5rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <p>No analytical data available yet today.</p>
              <p style={{ fontSize: '0.85rem' }}>Check back after patients have checked in and been served.</p>
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '2rem', minHeight: '380px' }}>
              {/* Chart 1: Hourly check-ins */}
              <div className="glass-card" style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', height: '380px', display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.05rem', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Today's Check-Ins By Hour</h3>
                <div style={{ flex: 1, position: 'relative' }}>
                  <Bar data={getPatientsPerHourData()} options={chartOptions} />
                </div>
              </div>

              {/* Chart 2: Average wait by department */}
              <div className="glass-card" style={{ background: 'rgba(0,0,0,0.1)', border: '1px solid var(--border-color)', height: '380px', display: 'flex', flexDirection: 'column', padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1.05rem', marginBottom: '1.5rem', color: 'var(--text-secondary)' }}>Avg Wait Time By Department (Minutes)</h3>
                <div style={{ flex: 1, position: 'relative' }}>
                  <Doughnut data={getAvgWaitByDeptData()} options={doughnutOptions} />
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Main Dashboard Console Grid */
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr', gap: '2rem', alignItems: 'start' }}>
          
          {/* Active Queue Table */}
          <div className="glass-card" style={{ padding: '1.75rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem', flexWrap: 'wrap', gap: '1rem' }}>
              <h2 style={{ fontSize: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
                <Users size={20} color="var(--accent-teal)" />
                <span>Active Queue List</span>
              </h2>

              {/* Department Filter Selector */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>Filter:</span>
                <select
                  value={filterDept}
                  onChange={(e) => setFilterDept(e.target.value)}
                  className="input-field"
                  style={{ padding: '0.4rem 0.6rem', fontSize: '0.85rem', background: 'rgba(10, 15, 29, 0.8)', border: '1px solid var(--border-color)', borderRadius: '8px', cursor: 'pointer', color: 'var(--text-primary)' }}
                >
                  <option value="all">All Departments</option>
                  <option value="General Medicine">🩺 General Medicine</option>
                  <option value="Cardiology">❤️ Cardiology</option>
                  <option value="Pediatrics">👶 Pediatrics</option>
                  <option value="Dermatology">🛡️ Dermatology</option>
                </select>
              </div>
            </div>

            {displayedQueue.length === 0 ? (
              <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                <Users size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
                <p>No active patients in {filterDept === 'all' ? 'the queue' : filterDept}.</p>
                <p style={{ fontSize: '0.85rem' }}>Add a walk-in patient or check back later.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      <th style={{ padding: '1rem 0.5rem' }}>Pos</th>
                      <th style={{ padding: '1rem 0.5rem' }}>ID</th>
                      <th style={{ padding: '1rem 0.5rem' }}>Patient Details</th>
                      <th style={{ padding: '1rem 0.5rem' }}>Department</th>
                      <th style={{ padding: '1rem 0.5rem' }}>Status</th>
                      <th style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {displayedQueue.map((patient) => {
                      const isServing = patient.status === 'SERVING';
                      const checkedInTime = new Date(patient.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                      
                      return (
                        <tr 
                          key={patient.id} 
                          style={{ 
                            borderBottom: '1px solid var(--border-color)', 
                            background: isServing ? 'rgba(6, 182, 212, 0.03)' : 'transparent',
                            transition: 'var(--transition-fast)'
                          }}
                        >
                          <td style={{ padding: '1rem 0.5rem', fontWeight: 600 }}>
                            {isServing ? '★' : `#${patient.position}`}
                          </td>
                          <td style={{ padding: '1rem 0.5rem', color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                            {patient.id}
                          </td>
                          <td style={{ padding: '1rem 0.5rem' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{patient.name}</div>
                            <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                              {patient.phone} &bull; Check-in: {checkedInTime}
                            </div>
                          </td>
                          <td style={{ padding: '1rem 0.5rem', fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                            {patient.department || 'General Medicine'}
                          </td>
                          <td style={{ padding: '1rem 0.5rem' }}>
                            <span className={`status-tag ${
                              patient.status === 'SERVING' ? 'tag-serving' : 
                              patient.status === 'PRE_CALL' ? 'tag-waiting' : 'tag-waiting'
                            }`}>
                              {patient.status}
                            </span>
                          </td>
                          <td style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>
                            <div style={{ display: 'inline-flex', gap: '0.5rem' }}>
                              {isServing ? (
                                role === 'doctor' && (
                                  <button 
                                    onClick={() => handleAction('complete', patient.id)}
                                    className="btn btn-secondary" 
                                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', borderColor: 'var(--accent-emerald)', color: 'var(--accent-emerald)' }}
                                  >
                                    Complete
                                  </button>
                                )
                              ) : (
                                <>
                                  <button 
                                    onClick={() => handleAction('delay', patient.id)}
                                    className="btn btn-secondary" 
                                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                                    title="Delay patient (move back one space)"
                                  >
                                    Delay
                                  </button>
                                  <button 
                                    onClick={() => handleAction('cancel', patient.id)}
                                    className="btn btn-danger" 
                                    style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
                                  >
                                    Cancel
                                  </button>
                                </>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Sidebar Controls */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            
            {/* Active Call Console - Doctor only */}
            {role === 'doctor' && (
              <div className="glass-card" style={{ border: '1px solid rgba(139, 92, 246, 0.2)', boxShadow: 'var(--shadow-glow-purple)' }}>
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Clock size={20} color="var(--accent-purple)" />
                  <span>Queue Controller</span>
                </h2>

                <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                  <label className="form-label" style={{ fontSize: '0.75rem' }}>Calling Department</label>
                  <select
                    value={callingDept}
                    onChange={(e) => setCallingDept(e.target.value)}
                    className="input-field"
                    style={{ padding: '0.5rem 0.6rem', fontSize: '0.85rem', width: '100%', background: 'rgba(10, 15, 29, 0.7)', cursor: 'pointer' }}
                  >
                    <option value="all">⚡ All Departments (Oldest First)</option>
                    <option value="General Medicine">🩺 General Medicine</option>
                    <option value="Cardiology">❤️ Cardiology</option>
                    <option value="Pediatrics">👶 Pediatrics</option>
                    <option value="Dermatology">🛡️ Dermatology</option>
                  </select>
                </div>

                {nowServingPatient ? (
                  <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Currently in Room:</span>
                    <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--accent-teal)' }}>
                      {nowServingPatient.name}
                    </h3>
                    <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>
                      {nowServingPatient.department} &bull; ID: {nowServingPatient.id}
                    </p>
                  </div>
                ) : (
                  <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.01)', borderRadius: '10px', marginBottom: '1.5rem', border: '1px dashed var(--border-color)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                    No active consultation in progress.
                  </div>
                )}

                <button 
                  onClick={() => handleAction('call')}
                  className="btn btn-accent" 
                  style={{ width: '100%', padding: '0.85rem', display: 'flex', gap: '0.5rem' }}
                  disabled={queue.filter(p => p.status !== 'SERVING').length === 0}
                >
                  <Play size={16} fill="currentColor" />
                  <span>Call Next Patient</span>
                </button>
              </div>
            )}

            {/* Add Walk-in Patient Form - Receptionist only */}
            {role === 'receptionist' && (
              <div className="glass-card">
                <h2 style={{ fontSize: '1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Plus size={20} color="var(--accent-teal)" />
                  <span>Register Walk-in</span>
                </h2>

                {formSuccess && (
                  <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: 'var(--accent-emerald)', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '0.6rem 0.8rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    {formSuccess}
                  </div>
                )}
                
                {formError && (
                  <div style={{ background: 'rgba(244, 63, 94, 0.1)', color: 'var(--accent-rose)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '0.6rem 0.8rem', borderRadius: '8px', fontSize: '0.85rem', marginBottom: '1rem' }}>
                    {formError}
                  </div>
                )}

                <form onSubmit={handleWalkinSubmit}>
                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }} htmlFor="walkin-name">Patient Name</label>
                    <input 
                      id="walkin-name"
                      type="text" 
                      className="input-field" 
                      style={{ padding: '0.6rem 0.8rem', fontSize: '0.9rem' }} 
                      placeholder="Arthur Dent" 
                      value={walkinName}
                      onChange={(e) => setWalkinName(e.target.value)}
                      disabled={formLoading}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '1rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }} htmlFor="walkin-phone">Mobile Phone</label>
                    <input 
                      id="walkin-phone"
                      type="tel" 
                      className="input-field" 
                      style={{ padding: '0.6rem 0.8rem', fontSize: '0.9rem' }} 
                      placeholder="+919876543210" 
                      value={walkinPhone}
                      onChange={(e) => setWalkinPhone(e.target.value)}
                      disabled={formLoading}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                    <label className="form-label" style={{ fontSize: '0.75rem' }}>Clinic Department</label>
                    <select 
                      id="walkin-dept"
                      className="input-field" 
                      style={{ padding: '0.6rem 0.8rem', fontSize: '0.9rem', width: '100%', background: 'rgba(10, 15, 29, 0.7)', cursor: 'pointer' }} 
                      value={walkinDept}
                      onChange={(e) => setWalkinDept(e.target.value)}
                      disabled={formLoading}
                    >
                      <option value="General Medicine">🩺 General Medicine</option>
                      <option value="Cardiology">❤️ Cardiology</option>
                      <option value="Pediatrics">👶 Pediatrics</option>
                      <option value="Dermatology">🛡️ Dermatology</option>
                    </select>
                  </div>

                  <button 
                    id="btn-walkin-submit"
                    type="submit" 
                    className="btn btn-primary" 
                    style={{ width: '100%', padding: '0.75rem', fontSize: '0.9rem' }}
                    disabled={formLoading}
                  >
                    <span>Add to Queue</span>
                    <ArrowRight size={14} />
                  </button>
                </form>
              </div>
            )}

          </div>

        </div>
      )}
    </div>
  );
}
