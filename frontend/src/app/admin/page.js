"use client";

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { 
  Users, Clock, CheckCircle2, XCircle, Plus, 
  Play, RotateCcw, AlertTriangle, ShieldCheck, ArrowRight 
} from 'lucide-react';

export default function AdminDashboard() {
  const [queue, setQueue] = useState([]);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  // Walk-in form states
  const [walkinName, setWalkinName] = useState('');
  const [walkinPhone, setWalkinPhone] = useState('');
  const [formLoading, setFormLoading] = useState(false);
  const [formSuccess, setFormSuccess] = useState('');
  const [formError, setFormError] = useState('');

  const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');

  // Fetch both active queue and history for analytics
  const fetchDashboardData = async () => {
    try {
      const queueRes = await fetch(`${backendUrl}/api/queue`);
      const historyRes = await fetch(`${backendUrl}/api/queue/all`);

      if (!queueRes.ok || !historyRes.ok) {
        throw new Error('Failed to retrieve clinic queue metrics.');
      }

      const queueData = await queueRes.json();
      const historyData = await historyRes.json();

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
    fetchDashboardData();

    // Connect WebSocket
    const socket = io(backendUrl);

    socket.on('queue_updated', () => {
      fetchDashboardData();
    });

    return () => {
      socket.disconnect();
    };
  }, []);

  // Quick Action Handler Helper
  const handleAction = async (endpoint, id = null) => {
    try {
      const url = id ? `${backendUrl}/api/queue/${endpoint}/${id}` : `${backendUrl}/api/queue/${endpoint}`;
      const res = await fetch(url, { method: 'POST' });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Action failed');
      }
      
      fetchDashboardData();
    } catch (err) {
      alert(`Error: ${err.message}`);
    }
  };

  // Submit manual walk-in check-in
  const handleWalkinSubmit = async (e) => {
    e.preventDefault();
    if (!walkinName || !walkinPhone) {
      setFormError('Name and Phone fields are required.');
      return;
    }

    setFormLoading(true);
    setFormError('');
    setFormSuccess('');

    try {
      const res = await fetch(`${backendUrl}/api/checkin`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: walkinName, phone: walkinPhone })
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Walk-in registration failed.');
      }

      setWalkinName('');
      setWalkinPhone('');
      setFormSuccess('Walk-in patient registered successfully!');
      fetchDashboardData();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setFormLoading(false);
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

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '1rem' }}>
        <div className="logo-icon pulse-glow" style={{ width: '60px', height: '60px' }}>
          <Clock size={30} color="#000" />
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>Loading clinic coordinator dashboard...</p>
      </div>
    );
  }

  return (
    <div className="slide-in">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <div>
          <h1 style={{ fontSize: '2.25rem', marginBottom: '0.25rem' }}>Clinic Dashboard</h1>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.95rem' }}>Manage patients, monitor queues, and call waiting tickets.</p>
        </div>
      </div>

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

      {/* Main Grid: Left (Queue list), Right (Controls) */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 0.8fr', gap: '2rem', alignItems: 'start' }}>
        
        {/* Active Queue Table */}
        <div className="glass-card" style={{ padding: '1.75rem' }}>
          <h2 style={{ fontSize: '1.25rem', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Users size={20} color="var(--accent-teal)" />
            <span>Active Queue List</span>
          </h2>

          {queue.length === 0 ? (
            <div style={{ padding: '4rem 1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
              <Users size={40} style={{ opacity: 0.3, marginBottom: '1rem' }} />
              <p>The clinic queue is currently empty.</p>
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
                    <th style={{ padding: '1rem 0.5rem' }}>Status</th>
                    <th style={{ padding: '1rem 0.5rem', textAlign: 'right' }}>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {queue.map((patient) => {
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
                              <button 
                                onClick={() => handleAction('complete', patient.id)}
                                className="btn btn-secondary" 
                                style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem', borderColor: 'var(--accent-emerald)', color: 'var(--accent-emerald)' }}
                              >
                                Complete
                              </button>
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
          
          {/* Active Call Console */}
          <div className="glass-card" style={{ border: '1px solid rgba(139, 92, 246, 0.2)', boxShadow: 'var(--shadow-glow-purple)' }}>
            <h2 style={{ fontSize: '1.25rem', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Clock size={20} color="var(--accent-purple)" />
              <span>Queue Controller</span>
            </h2>

            {nowServingPatient ? (
              <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.02)', borderRadius: '10px', marginBottom: '1.5rem', border: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>Currently in Room:</span>
                <h3 style={{ fontSize: '1.4rem', fontWeight: 700, marginTop: '0.25rem', color: 'var(--accent-teal)' }}>
                  {nowServingPatient.name}
                </h3>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', marginTop: '0.25rem' }}>ID: {nowServingPatient.id} &bull; {nowServingPatient.phone}</p>
              </div>
            ) : (
              <div style={{ padding: '1rem', background: 'rgba(255, 255, 255, 0.01)', borderRadius: '10px', marginBottom: '1.5rem', border: '1px dashed var(--border-color)', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No patient is currently being served.
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

          {/* Add Walk-in Patient Form */}
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

              <div className="form-group" style={{ marginBottom: '1.5rem' }}>
                <label className="form-label" style={{ fontSize: '0.75rem' }} htmlFor="walkin-phone">Mobile Phone</label>
                <input 
                  id="walkin-phone"
                  type="tel" 
                  className="input-field" 
                  style={{ padding: '0.6rem 0.8rem', fontSize: '0.9rem' }} 
                  placeholder="+15554242" 
                  value={walkinPhone}
                  onChange={(e) => setWalkinPhone(e.target.value)}
                  disabled={formLoading}
                />
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

        </div>

      </div>
    </div>
  );
}
