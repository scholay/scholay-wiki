import React from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import './Home.css';

const Home = () => {
  const { isAuthenticated } = useAuth();

  return (
    <div className="home">
      <div className="animated-bg"></div>

      <nav className="navbar">
        <div className="navbar-content">
          <div className="logo">
            <svg width="40" height="40" viewBox="0 0 48 48" fill="none">
              <defs>
                <linearGradient id="logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#667eea" />
                  <stop offset="100%" stopColor="#764ba2" />
                </linearGradient>
              </defs>
              <circle cx="24" cy="24" r="24" fill="url(#logo-gradient)" opacity="0.2"/>
              <path d="M24 10L34 20H29V34H19V20H14L24 10Z" fill="url(#logo-gradient)"/>
              <rect x="14" y="36" width="20" height="2" rx="1" fill="url(#logo-gradient)"/>
            </svg>
            <span className="logo-text">Scholar</span>
          </div>

          <div className="nav-links">
            {isAuthenticated ? (
              <Link to="/dashboard" className="btn btn-primary">
                Dashboard
              </Link>
            ) : (
              <>
                <Link to="/login" className="btn btn-outline">
                  Sign In
                </Link>
                <Link to="/register" className="btn btn-primary">
                  Get Started
                </Link>
              </>
            )}
          </div>
        </div>
      </nav>

      <main className="hero">
        <div className="hero-content fade-in">
          <h1 className="hero-title">
            Discover Academic
            <br />
            <span className="text-gradient glow-text">Knowledge</span>
          </h1>
          <p className="hero-subtitle">
            Powered by AI, Scholar helps you search, discover, and explore
            <br />
            academic papers and research with unprecedented ease
          </p>

          <div className="cta-buttons">
            <Link to="/register" className="btn btn-primary btn-lg">
              <svg width="20" height="20" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-11a1 1 0 10-2 0v3.586L7.707 9.293a1 1 0 00-1.414 1.414l3 3a1 1 0 001.414 0l3-3a1 1 0 00-1.414-1.414L11 10.586V7z" clipRule="evenodd"/>
              </svg>
              Start Exploring
            </Link>
            <a href="#features" className="btn btn-outline btn-lg">
              Learn More
            </a>
          </div>
        </div>

        <div className="floating-cards">
          <div className="floating-card card-1 glass-card">
            <svg width="32" height="32" viewBox="0 0 20 20" fill="#667eea">
              <path d="M9 4.804A7.968 7.968 0 005.5 4c-1.255 0-2.443.29-3.5.804v10A7.969 7.969 0 015.5 14c1.669 0 3.218.51 4.5 1.385A7.962 7.962 0 0114.5 14c1.255 0 2.443.29 3.5.804v-10A7.968 7.968 0 0014.5 4c-1.255 0-2.443.29-3.5.804V12a1 1 0 11-2 0V4.804z"/>
            </svg>
            <h3>Research Papers</h3>
            <p>Access millions of papers</p>
          </div>

          <div className="floating-card card-2 glass-card">
            <svg width="32" height="32" viewBox="0 0 20 20" fill="#764ba2">
              <path fillRule="evenodd" d="M6.267 3.455a3.066 3.066 0 001.745-.723 3.066 3.066 0 013.976 0 3.066 3.066 0 001.745.723 3.066 3.066 0 012.812 2.812c.051.643.304 1.254.723 1.745a3.066 3.066 0 010 3.976 3.066 3.066 0 00-.723 1.745 3.066 3.066 0 01-2.812 2.812 3.066 3.066 0 00-1.745.723 3.066 3.066 0 01-3.976 0 3.066 3.066 0 00-1.745-.723 3.066 3.066 0 01-2.812-2.812 3.066 3.066 0 00-.723-1.745 3.066 3.066 0 010-3.976 3.066 3.066 0 00.723-1.745 3.066 3.066 0 012.812-2.812zm7.44 5.252a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
            </svg>
            <h3>AI-Powered</h3>
            <p>Smart recommendations</p>
          </div>

          <div className="floating-card card-3 glass-card">
            <svg width="32" height="32" viewBox="0 0 20 20" fill="#4facfe">
              <path d="M2 6a2 2 0 012-2h12a2 2 0 012 2v2a2 2 0 100 4v2a2 2 0 01-2 2H4a2 2 0 01-2-2v-2a2 2 0 100-4V6z"/>
            </svg>
            <h3>Citations</h3>
            <p>Track references easily</p>
          </div>
        </div>
      </main>

      <section id="features" className="features">
        <div className="features-content">
          <h2 className="section-title text-gradient">Why Choose Scholar?</h2>

          <div className="features-grid">
            <div className="feature-card glass-card fade-in">
              <div className="feature-icon">
                <svg width="40" height="40" viewBox="0 0 20 20" fill="url(#icon-gradient)">
                  <path fillRule="evenodd" d="M12.395 2.553a1 1 0 00-1.45-.385c-.345.23-.614.558-.822.88-.214.33-.403.713-.57 1.116-.334.804-.614 1.768-.84 2.734a31.365 31.365 0 00-.613 3.58 2.64 2.64 0 01-.945-1.067c-.328-.68-.398-1.534-.398-2.654A1 1 0 005.05 6.05 6.981 6.981 0 003 11a7 7 0 1011.95-4.95c-.592-.591-.98-.985-1.348-1.467-.363-.476-.724-1.063-1.207-2.03zM12.12 15.12A3 3 0 017 13s.879.5 2.5.5c0-1 .5-4 1.25-4.5.5 1 .786 1.293 1.371 1.879A2.99 2.99 0 0113 13a2.99 2.99 0 01-.879 2.121z" clipRule="evenodd"/>
                </svg>
              </div>
              <h3>Lightning Fast</h3>
              <p>Search through millions of academic papers in milliseconds with our optimized search engine</p>
            </div>

            <div className="feature-card glass-card fade-in" style={{animationDelay: '0.1s'}}>
              <div className="feature-icon">
                <svg width="40" height="40" viewBox="0 0 20 20" fill="url(#icon-gradient)">
                  <path d="M10.394 2.08a1 1 0 00-.788 0l-7 3a1 1 0 000 1.84L5.25 8.051a.999.999 0 01.356-.257l4-1.714a1 1 0 11.788 1.838L7.667 9.088l1.94.831a1 1 0 00.787 0l7-3a1 1 0 000-1.838l-7-3zM3.31 9.397L5 10.12v4.102a8.969 8.969 0 00-1.05-.174 1 1 0 01-.89-.89 11.115 11.115 0 01.25-3.762zM9.3 16.573A9.026 9.026 0 007 14.935v-3.957l1.818.78a3 3 0 002.364 0l5.508-2.361a11.026 11.026 0 01.25 3.762 1 1 0 01-.89.89 8.968 8.968 0 00-5.35 2.524 1 1 0 01-1.4 0zM6 18a1 1 0 001-1v-2.065a8.935 8.935 0 00-2-.712V17a1 1 0 001 1z"/>
                </svg>
              </div>
              <h3>Smart AI</h3>
              <p>Get personalized paper recommendations based on your interests and reading history</p>
            </div>

            <div className="feature-card glass-card fade-in" style={{animationDelay: '0.2s'}}>
              <div className="feature-icon">
                <svg width="40" height="40" viewBox="0 0 20 20" fill="url(#icon-gradient)">
                  <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd"/>
                </svg>
              </div>
              <h3>Organize</h3>
              <p>Create collections, take notes, and manage your research workflow efficiently</p>
            </div>
          </div>
        </div>
      </section>

      <svg width="0" height="0">
        <defs>
          <linearGradient id="icon-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#667eea" />
            <stop offset="100%" stopColor="#764ba2" />
          </linearGradient>
        </defs>
      </svg>
    </div>
  );
};

export default Home;
