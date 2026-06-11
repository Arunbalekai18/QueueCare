import './global.css';

export const metadata = {
  title: 'QueueCare | Patient Queue Management System',
  description: 'Track your clinic queue position in real-time, get SMS alerts when your turn is near, and avoid waiting room crowds.',
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><text y=%22.9em%22 font-size=%2290%22>🏥</text></svg>" />
      </head>
      <body>
        <div className="app-container">
          <header className="header" id="navbar">
            <div className="logo-container">
              <div className="logo-icon">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#000000" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z"/>
                  <path d="M12 5v14"/>
                  <path d="M5 12h14"/>
                </svg>
              </div>
              <span className="logo-text">QueueCare</span>
            </div>
            
            <nav className="nav-links">
              <a href="/" className="nav-link" id="nav-checkin">Check-in</a>
              <a href="/monitor" className="nav-link" id="nav-monitor">TV Monitor</a>
              <a href="/admin" className="nav-link" id="nav-admin">Admin Portal</a>
            </nav>
          </header>

          <main>{children}</main>

          <footer className="footer">
            <p>&copy; {new Date().getFullYear()} QueueCare Systems. Built for modern clinics and patient convenience.</p>
          </footer>
        </div>
      </body>
    </html>
  );
}
