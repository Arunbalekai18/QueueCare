"use client";

import { useEffect, useState, useRef } from 'react';
import { io } from 'socket.io-client';
import { Bell, Tv, Radio, ArrowRight, UserCheck, CalendarDays, Users, Volume2, VolumeX } from 'lucide-react';
import QRCode from 'qrcode';

export default function MonitorPage() {
  const [queue, setQueue] = useState([]);
  const [connected, setConnected] = useState(false);
  const [calledPatient, setCalledPatient] = useState(null);
  const [flashAlert, setFlashAlert] = useState(false);
  const [time, setTime] = useState(null);

  // Audio and QR state
  const [isMuted, setIsMuted] = useState(true);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const isMutedRef = useRef(true);

  const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');

  useEffect(() => {
    isMutedRef.current = isMuted;
  }, [isMuted]);

  const fetchQueue = async () => {
    try {
      const res = await fetch(`${backendUrl}/api/queue`);
      if (res.ok) {
        const data = await res.json();
        setQueue(data);
      }
    } catch (err) {
      console.error('Failed to fetch monitor queue:', err);
    }
  };

  const playChime = () => {
    if (isMutedRef.current) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return;
      const ctx = new AudioContext();
      
      // Tone 1: E5
      const osc1 = ctx.createOscillator();
      const gain1 = ctx.createGain();
      osc1.type = 'sine';
      osc1.frequency.setValueAtTime(659.25, ctx.currentTime); // E5
      gain1.gain.setValueAtTime(0, ctx.currentTime);
      gain1.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.08);
      gain1.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.0);
      osc1.connect(gain1);
      gain1.connect(ctx.destination);
      
      // Tone 2: C5 (delayed by 0.25s)
      const osc2 = ctx.createOscillator();
      const gain2 = ctx.createGain();
      osc2.type = 'sine';
      osc2.frequency.setValueAtTime(523.25, ctx.currentTime + 0.25); // C5
      gain2.gain.setValueAtTime(0, ctx.currentTime + 0.25);
      gain2.gain.linearRampToValueAtTime(0.25, ctx.currentTime + 0.33);
      gain2.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 1.25);
      osc2.connect(gain2);
      gain2.connect(ctx.destination);
      
      osc1.start(ctx.currentTime);
      osc1.stop(ctx.currentTime + 1.0);
      
      osc2.start(ctx.currentTime + 0.25);
      osc2.stop(ctx.currentTime + 1.25);
    } catch (err) {
      console.warn('Audio playback failed or blocked:', err);
    }
  };

  useEffect(() => {
    fetchQueue();

    // Digital clock updater
    setTime(new Date());
    const clockTimer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    // Generate QR Code dynamically linking to root check-in page
    if (typeof window !== 'undefined') {
      const checkinUrl = `${window.location.origin}/`;
      QRCode.toDataURL(checkinUrl, { margin: 2, scale: 4 })
        .then(url => setQrCodeDataUrl(url))
        .catch(err => console.error('QR code generation failed:', err));
    }

    // Setup Websockets
    const socket = io(backendUrl);

    socket.on('connect', () => {
      setConnected(true);
    });

    socket.on('disconnect', () => {
      setConnected(false);
    });

    socket.on('queue_updated', () => {
      fetchQueue();
    });

    // Trigger visual + sound alarm when a new patient is called
    socket.on('patient_called', (patient) => {
      setCalledPatient(patient);
      setFlashAlert(true);
      
      // Synthesized chime triggered in real-time
      playChime();
      
      // Stop flashing and return to normal after 7 seconds
      const timeout = setTimeout(() => {
        setFlashAlert(false);
      }, 7000);

      return () => clearTimeout(timeout);
    });

    return () => {
      clearInterval(clockTimer);
      socket.disconnect();
    };
  }, []);

  const currentlyServing = queue.find(p => p.status === 'SERVING');
  const upNext = queue.filter(p => ['WAITING', 'PRE_CALL'].includes(p.status)).slice(0, 4);

  // Time formatter
  const formatTime = (date) => {
    if (!date) return '';
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  };

  const formatDate = (date) => {
    if (!date) return '';
    return date.toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const toggleMuteAndTest = () => {
    const nextMute = !isMuted;
    setIsMuted(nextMute);
    
    // Play a quick test sound if unmuting to bypass browser constraints
    if (nextMute === false) {
      try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.frequency.setValueAtTime(880, ctx.currentTime); // Quick beep
        gain.gain.setValueAtTime(0, ctx.currentTime);
        gain.gain.linearRampToValueAtTime(0.1, ctx.currentTime + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25);
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start(ctx.currentTime);
        osc.stop(ctx.currentTime + 0.25);
      } catch (e) {
        console.warn(e);
      }
    }
  };

  return (
    <div className="slide-in" style={{ marginTop: '1rem' }}>
      
      {/* TV Header panel */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2.5rem', background: 'rgba(255, 255, 255, 0.02)', padding: '1rem 2rem', borderRadius: '12px', border: '1px solid var(--border-color)', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
          <Tv size={24} color="var(--accent-teal)" />
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Waiting Room TV Monitor</h2>
          <span style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem', fontSize: '0.75rem', color: 'var(--text-muted)' }}>
            <Radio size={12} color={connected ? 'var(--accent-emerald)' : 'var(--accent-rose)'} />
            {connected ? 'LIVE CONNECTION' : 'RECONNECTING'}
          </span>
          
          {/* Audio Chime State Selector Toggle */}
          <button
            onClick={toggleMuteAndTest}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.35rem',
              marginLeft: '1rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '20px',
              border: `1px solid ${isMuted ? 'var(--accent-rose)' : 'var(--accent-emerald)'}`,
              background: isMuted ? 'rgba(244, 63, 94, 0.05)' : 'rgba(16, 185, 129, 0.05)',
              color: isMuted ? 'var(--accent-rose)' : 'var(--accent-emerald)',
              cursor: 'pointer',
              fontSize: '0.75rem',
              fontWeight: 600,
              transition: 'var(--transition-fast)'
            }}
            title={isMuted ? "Click to enable audio chimes" : "Audio chimes active (click to mute)"}
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span>{isMuted ? "Audio Off (Click to Enable)" : "Audio Active"}</span>
          </button>
        </div>
        
        {/* Live Clock */}
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', fontFamily: 'Outfit' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            <CalendarDays size={16} />
            <span>{formatDate(time)}</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--accent-teal)' }}>
            {formatTime(time)}
          </div>
        </div>
      </div>

      {/* Visual Flash Announcement overlay */}
      {flashAlert && calledPatient && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(10, 15, 29, 0.96)', zIndex: 9999, display: 'flex',
          flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          animation: 'slideIn 0.3s ease-out', border: '10px solid var(--accent-teal)',
          boxShadow: 'inset 0 0 100px rgba(6, 182, 212, 0.4)'
        }}>
          <div className="pulse-glow" style={{ background: 'var(--accent-teal-glow)', padding: '2.5rem', borderRadius: '100px', color: 'var(--accent-teal)', marginBottom: '2rem', border: '2px solid var(--accent-teal)' }}>
            <Bell size={80} className="float-animation" />
          </div>
          <span style={{ fontSize: '1.5rem', textTransform: 'uppercase', letterSpacing: '0.3em', color: 'var(--accent-teal)', fontWeight: 600 }}>NOW CALLING</span>
          <h1 style={{ fontSize: '6rem', fontWeight: 800, marginTop: '1rem', marginBottom: '1rem', color: '#fff', textAlign: 'center', fontFamily: 'Outfit' }}>
            {calledPatient.name}
          </h1>
          <p style={{ fontSize: '1.8rem', color: 'var(--text-secondary)' }}>
            Please proceed to the counter in <span style={{ color: 'var(--accent-teal)', fontWeight: 600 }}>{calledPatient.department}</span>
          </p>
        </div>
      )}

      {/* Main Layout Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '2.5rem', minHeight: '60vh' }}>
        
        {/* Left Column: Now Serving banner */}
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div className="glass-card" style={{ 
            flex: 1, 
            display: 'flex', 
            flexDirection: 'column', 
            justifyContent: 'center', 
            alignItems: 'center', 
            padding: '4rem 2rem', 
            border: '2px solid var(--accent-teal)',
            boxShadow: 'var(--shadow-glow-teal)',
            position: 'relative'
          }}>
            <div style={{ position: 'absolute', top: '1.5rem', left: '2rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--accent-teal)' }}>
              <UserCheck size={20} />
              <span style={{ fontSize: '0.85rem', fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase' }}>NOW SERVING</span>
            </div>

            {currentlyServing ? (
              <div style={{ textAlign: 'center' }}>
                <h1 style={{ fontSize: '4.5rem', fontWeight: 800, fontFamily: 'Outfit', marginBottom: '1.5rem', color: 'var(--text-primary)' }}>
                  {currentlyServing.name}
                </h1>
                <div style={{ display: 'inline-block', background: 'var(--accent-teal-glow)', color: 'var(--accent-teal)', border: '1px solid var(--accent-teal)', padding: '0.75rem 2.5rem', borderRadius: '50px', fontSize: '1.5rem', fontWeight: 600, fontFamily: 'Outfit' }}>
                  {currentlyServing.department.toUpperCase()}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: 'center', color: 'var(--text-muted)' }}>
                <Users size={60} style={{ opacity: 0.2, marginBottom: '1.5rem' }} />
                <h3 style={{ fontSize: '1.75rem', fontWeight: 500 }}>No Active Consultations</h3>
                <p style={{ fontSize: '1rem', marginTop: '0.5rem' }}>Please wait for the next call announcement.</p>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Up Next queue list & QR check-in widget */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <h3 style={{ fontSize: '1.1rem', textTransform: 'uppercase', letterSpacing: '0.1em', color: 'var(--text-secondary)', paddingLeft: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span>Up Next</span>
            <ArrowRight size={16} color="var(--accent-purple)" />
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            {upNext.length === 0 ? (
              <div className="glass-card" style={{ padding: '3rem 1rem', display: 'flex', justifyContent: 'center', alignItems: 'center', color: 'var(--text-muted)', borderStyle: 'dashed' }}>
                <p style={{ fontSize: '1rem' }}>No further patients waiting.</p>
              </div>
            ) : (
              upNext.map((patient, index) => (
                <div 
                  key={patient.id} 
                  className="glass-card" 
                  style={{ 
                    padding: '1.25rem 1.75rem', 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center',
                    borderLeft: '4px solid var(--accent-purple)',
                    background: index === 0 ? 'rgba(139, 92, 246, 0.05)' : 'var(--bg-surface)'
                  }}
                >
                  <div>
                    <h4 style={{ fontSize: '1.35rem', fontWeight: 700, fontFamily: 'Outfit', color: 'var(--text-primary)' }}>
                      {patient.name}
                    </h4>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{patient.department} &bull; ID: {patient.id}</span>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ 
                      fontSize: '0.9rem', 
                      fontWeight: 700, 
                      color: index === 0 ? 'var(--accent-purple)' : 'var(--text-secondary)',
                      fontFamily: 'Outfit'
                    }}>
                      {index === 0 ? 'PREPARING' : `WAITING #${index + 1}`}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Dynamic Check-in QR Card */}
          {qrCodeDataUrl && (
            <div className="glass-card" style={{ padding: '1.25rem', display: 'flex', alignItems: 'center', gap: '1.25rem', border: '1px dashed var(--accent-teal-glow)', background: 'rgba(6, 182, 212, 0.02)', marginTop: '0.5rem' }}>
              <div style={{ background: '#fff', padding: '0.35rem', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                <img src={qrCodeDataUrl} alt="Check-in QR" style={{ width: '80px', height: '80px', display: 'block' }} />
              </div>
              <div style={{ flex: 1 }}>
                <h4 style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: '0.25rem' }}>📱 Scan to Check In</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: '1.3' }}>Scan this QR code with your phone to join the virtual queue and monitor your queue ticket in real time.</p>
              </div>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
