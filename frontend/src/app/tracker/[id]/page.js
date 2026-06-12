"use client";

import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { Clock, Users, Bell, AlertCircle, ArrowLeft, Radio } from 'lucide-react';
import Link from 'next/link';

export default function TrackerPage({ params }) {
  const { id } = params;
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [connected, setConnected] = useState(false);
  const [toasts, setToasts] = useState([]);

  const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');

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

  const fetchPatientDetails = async (isInitial = false) => {
    try {
      const response = await fetch(`${backendUrl}/api/patient/${id}`);
      
      if (!response.ok) {
        if (response.status === 404) {
          throw new Error('Queue ticket not found. It may have expired or been removed.');
        }
        throw new Error('Failed to fetch ticket status.');
      }
      
      const resData = await response.json();
      
      // Compare and trigger toast alerts for real-time visual delight
      if (!isInitial && data) {
        const prevStatus = data.patient.status;
        const newStatus = resData.patient.status;
        const prevAhead = data.queueDetails.peopleAhead;
        const newAhead = resData.queueDetails.peopleAhead;

        if (newStatus !== prevStatus) {
          if (newStatus === 'SERVING') {
            addToast("🔊 It's your turn — please head to the counter", 'success');
          } else if (newStatus === 'PRE_CALL') {
            addToast("🔔 You're next — please head to the counter", 'warning');
          } else if (newStatus === 'COMPLETED') {
            addToast("✅ Consultation completed. Thank you!", 'success');
          } else if (newStatus === 'CANCELLED') {
            addToast("❌ Your queue ticket was cancelled.", 'danger');
          }
        } else if (newAhead < prevAhead) {
          if (newAhead === 1) {
            addToast("🔔 You're next — please head to the counter", 'warning');
          } else if (newStatus === 'WAITING') {
            addToast(`🏃 Position updated! You moved forward in the queue. Only ${newAhead} patients ahead.`, 'info');
          }
        }
      }
      
      setData(resData);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPatientDetails(true);

    const socket = io(backendUrl);

    socket.on('connect', () => {
      setConnected(true);
      addToast('🔌 Connected to live updates server.', 'success');
    });

    socket.on('disconnect', (reason) => {
      setConnected(false);
      if (reason === 'io client disconnect') return;
      addToast('📡 Connection lost. Reconnecting...', 'danger');
    });

    // Listen to global queue updates
    socket.on('queue_updated', () => {
      fetchPatientDetails(false);
    });

    // Clean up connections on unmount
    return () => {
      socket.disconnect();
    };
  }, [id]);

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', flexDirection: 'column', gap: '1rem' }}>
        <div className="logo-icon pulse-glow" style={{ width: '60px', height: '60px' }}>
          <Clock size={30} color="#000" />
        </div>
        <p style={{ color: 'var(--text-secondary)' }}>Loading your real-time queue ticket...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card slide-in" style={{ maxWidth: '600px', margin: '4rem auto', textAlign: 'center', border: '1px solid rgba(244, 63, 94, 0.2)' }}>
        <AlertCircle size={48} color="var(--accent-rose)" style={{ margin: '0 auto 1rem' }} />
        <h2 style={{ marginBottom: '1rem' }}>Ticket Error</h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: '2rem' }}>{error}</p>
        <Link href="/" className="btn btn-secondary">
          <ArrowLeft size={16} />
          <span>Back to Check-in</span>
        </Link>
      </div>
    );
  }

  const { patient, queueDetails } = data;
  const isServing = patient.status === 'SERVING';
  const isNext = queueDetails.peopleAhead === 1 || patient.status === 'PRE_CALL';

  return (
    <div className="slide-in" style={{ maxWidth: '700px', margin: '1rem auto' }}>
      
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

      {/* Top sticky banner for urgent patient notification */}
      {(isServing || isNext) && (
        <div 
          className="pulse-glow slide-in"
          style={{ 
            background: isServing ? 'var(--accent-teal-glow)' : 'var(--accent-amber-glow)', 
            color: isServing ? 'var(--accent-teal)' : 'var(--accent-amber)', 
            border: `1px solid ${isServing ? 'var(--accent-teal)' : 'var(--accent-amber)'}`, 
            padding: '1.25rem 2rem', 
            borderRadius: '12px', 
            marginBottom: '1.5rem', 
            textAlign: 'center', 
            fontWeight: 600, 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            gap: '0.75rem', 
            fontSize: '1.1rem',
            boxShadow: isServing ? 'var(--shadow-glow-teal)' : '0 0 30px rgba(245, 158, 11, 0.15)'
          }}
        >
          <Bell size={20} className="float-animation" />
          <span>{isServing ? "🔊 It's your turn — please head to the counter" : "🔔 You're next — please head to the counter"}</span>
        </div>
      )}
      
      {/* Back button */}
      <Link href="/" style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-muted)', textDecoration: 'none', marginBottom: '1.5rem', fontSize: '0.9rem' }}>
        <ArrowLeft size={16} />
        <span>Exit Tracker</span>
      </Link>

      {/* Live status badge */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Radio size={16} color={connected ? 'var(--accent-emerald)' : 'var(--accent-rose)'} className={connected ? 'pulse-glow' : ''} />
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', fontWeight: 500 }}>
            {connected ? 'Live connection active' : 'Connecting to server...'}
          </span>
        </div>
        <div>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>Ticket #{patient.id}</span>
        </div>
      </div>

      {/* Status card */}
      <div className="glass-card" style={{ padding: '3rem 2rem', textAlign: 'center', position: 'relative', overflow: 'hidden', border: isServing ? '2px solid var(--accent-teal)' : '1px solid var(--border-color)', boxShadow: isServing ? 'var(--shadow-glow-teal)' : 'var(--shadow-lg)' }}>
        
        {isServing && (
          <div style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '4px', background: 'linear-gradient(90deg, var(--accent-teal), var(--accent-purple))' }} />
        )}

        <p className="form-label" style={{ color: 'var(--text-muted)', marginBottom: '0.5rem' }}>Patient Name</p>
        <h1 style={{ fontSize: '2.5rem', fontWeight: 700, marginBottom: '2rem' }}>{patient.name}</h1>

        {/* Visual state handler */}
        {isServing ? (
          <div className="slide-in" style={{ margin: '2rem 0' }}>
            <div style={{ display: 'inline-flex', background: 'var(--accent-teal-glow)', padding: '1.5rem', borderRadius: '100px', color: 'var(--accent-teal)', marginBottom: '1.5rem', border: '1px solid var(--accent-teal)' }} className="pulse-glow">
              <Bell size={48} />
            </div>
            <h2 style={{ fontSize: '2rem', color: 'var(--accent-teal)', marginBottom: '0.5rem' }}>It's Your Turn!</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1.1rem' }}>
              Please proceed to the counter or Treatment Room 1.
            </p>
          </div>
        ) : patient.status === 'WAITING' || patient.status === 'PRE_CALL' ? (
          <div className="slide-in">
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', margin: '2rem 0' }}>
              
              <div className="glass-card" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1.5rem', borderRadius: '12px' }}>
                <Users size={24} color="var(--accent-teal)" style={{ margin: '0 auto 0.5rem' }} />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Patients Ahead</p>
                <p style={{ fontFamily: 'Outfit', fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {queueDetails.peopleAhead}
                </p>
              </div>

              <div className="glass-card" style={{ background: 'rgba(255, 255, 255, 0.02)', padding: '1.5rem', borderRadius: '12px' }}>
                <Clock size={24} color="var(--accent-purple)" style={{ margin: '0 auto 0.5rem' }} />
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '0.25rem' }}>Est. Wait Time</p>
                <p style={{ fontFamily: 'Outfit', fontSize: '2.5rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {queueDetails.estWaitTime} <span style={{ fontSize: '1.25rem' }}>min</span>
                </p>
              </div>

            </div>

            {(patient.status === 'PRE_CALL' || queueDetails.peopleAhead === 1) ? (
              <div className="pulse-glow" style={{ background: 'var(--accent-amber-glow)', color: 'var(--accent-amber)', padding: '1rem', borderRadius: '10px', fontSize: '0.95rem', border: '1px solid rgba(245, 158, 11, 0.3)', display: 'flex', alignItems: 'center', gap: '0.75rem', justifyContent: 'center', fontWeight: 600 }}>
                <Bell size={18} className="float-animation" />
                <span>You're next — please head to the counter</span>
              </div>
            ) : (
              <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                We will send you an SMS notification when you are next in line.
              </p>
            )}
          </div>
        ) : (
          <div style={{ margin: '2rem 0' }}>
            <h2 style={{ fontSize: '1.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
              {patient.status === 'COMPLETED' ? 'Session Completed' : 'Ticket Cancelled'}
            </h2>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>
              Thank you for choosing QueueCare.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
