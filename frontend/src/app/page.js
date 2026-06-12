"use client";

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { User, Phone, CheckCircle2, Clock, MessageSquare, ShieldCheck } from 'lucide-react';

export default function CheckinPage() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    const trimmedName = name.trim();
    const trimmedPhone = phone.trim();

    if (!trimmedName) {
      setError('Please enter a valid full name.');
      return;
    }
    if (!trimmedPhone) {
      setError('Please enter your mobile phone number.');
      return;
    }
    
    // Strict Indian phone number validation (+91XXXXXXXXXX)
    const phoneRegex = /^\+91\d{10}$/;
    if (!phoneRegex.test(trimmedPhone)) {
      setError('Phone number must be in the format +91XXXXXXXXXX (e.g. +919876543210).');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const backendUrl = (process.env.NEXT_PUBLIC_BACKEND_URL || 'http://localhost:5000').replace(/\/$/, '');
      const response = await fetch(`${backendUrl}/api/checkin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: trimmedName, phone: trimmedPhone }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Check-in failed');
      }

      const data = await response.json();
      // Redirect to patient live tracker page
      router.push(`/tracker/${data.id}`);
    } catch (err) {
      setError(err.message || 'Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="slide-in" style={{ display: 'grid', gridTemplateColumns: '1.2fr 0.8fr', gap: '3rem', marginTop: '2rem', alignItems: 'center' }}>
      
      {/* Description Column */}
      <div>
        <h1 className="title-large" style={{ fontSize: '3.5rem' }}>
          Skip the Waiting Room.<br />
          <span style={{ color: 'var(--accent-teal)' }}>Wait Anywhere.</span>
        </h1>
        <p className="subtitle-large" style={{ fontSize: '1.2rem', marginBottom: '2.5rem' }}>
          Check in below to join the virtual queue. We will text you when your turn is near, so you can wait in your car, grab a coffee, or stay comfortable at home.
        </p>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div style={{ background: 'var(--accent-teal-glow)', padding: '0.50rem', borderRadius: '8px', color: 'var(--accent-teal)' }}>
              <Clock size={20} />
            </div>
            <div>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.25rem' }}>Real-time updates</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Watch your queue slot progress live from your browser.</p>
            </div>
          </div>

          <div className="glass-card" style={{ padding: '1.5rem', display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div style={{ background: 'var(--accent-purple-glow)', padding: '0.50rem', borderRadius: '8px', color: 'var(--accent-purple)' }}>
              <MessageSquare size={20} />
            </div>
            <div>
              <h4 style={{ color: 'var(--text-primary)', marginBottom: '0.25rem' }}>SMS alerts</h4>
              <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Get notifications before and exactly when your turn arrives.</p>
            </div>
          </div>
        </div>
      </div>

      {/* Checkin Form Column */}
      <div className="glass-card pulse-glow" style={{ padding: '2.5rem' }}>
        <h2 style={{ fontSize: '1.75rem', marginBottom: '0.5rem', textAlign: 'center' }}>Patient Check-In</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', marginBottom: '2rem', textAlign: 'center' }}>
          Enter your details to join the live clinic queue
        </p>

        {error && (
          <div style={{ background: 'rgba(244, 63, 94, 0.1)', color: 'var(--accent-rose)', border: '1px solid rgba(244, 63, 94, 0.2)', padding: '0.75rem 1rem', borderRadius: '8px', fontSize: '0.9rem', marginBottom: '1.5rem' }}>
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label className="form-label" htmlFor="patient-name">Full Name</label>
            <div style={{ position: 'relative' }}>
              <User size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                id="patient-name"
                type="text"
                className="input-field"
                placeholder="John Doe"
                style={{ paddingLeft: '2.75rem', width: '100%' }}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <div className="form-group" style={{ marginBottom: '2rem' }}>
            <label className="form-label" htmlFor="patient-phone">Mobile Phone (For SMS)</label>
            <div style={{ position: 'relative' }}>
              <Phone size={18} style={{ position: 'absolute', left: '1rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
              <input
                id="patient-phone"
                type="tel"
                className="input-field"
                placeholder="+15550199"
                style={{ paddingLeft: '2.75rem', width: '100%' }}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          <button
            id="btn-checkin-submit"
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '1rem', display: 'flex', gap: '0.75rem' }}
            disabled={loading}
          >
            {loading ? (
              <span>Registering...</span>
            ) : (
              <>
                <CheckCircle2 size={18} />
                <span>Join Virtual Queue</span>
              </>
            )}
          </button>
        </form>

        <div style={{ marginTop: '1.5rem', display: 'flex', gap: '0.5rem', alignItems: 'center', justifyContent: 'center', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
          <ShieldCheck size={14} />
          <span>Your contact info is encrypted and kept confidential.</span>
        </div>
      </div>
    </div>
  );
}
