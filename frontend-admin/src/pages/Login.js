/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React, { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../utils/AuthContext';
import { adminAPI } from '../services/api';
import SliderCaptcha from '../components/SliderCaptcha';
import { LogoWithBackground } from '../components/Logo';
import './Login.css';

const Login = () => {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [formData, setFormData] = useState({
    username: '',
    password: '',
  });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [captchaVerified, setCaptchaVerified] = useState(false);
  const captchaRef = useRef(null);

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value,
    });
    setError('');
  };

  const handleCaptchaSuccess = () => {
    setCaptchaVerified(true);
  };

  const handleCaptchaFail = () => {
    setCaptchaVerified(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!captchaVerified) {
      setError('Please complete the captcha verification');
      return;
    }

    setLoading(true);

    try {
      const response = await adminAPI.login(formData.username, formData.password);

      if (response.data.code === 0) {
        const { token, admin } = response.data.data;
        login(token, admin);
        navigate('/dashboard');
      } else {
        setError(response.data.message || 'Login failed');
        // Reset captcha on login failure
        setCaptchaVerified(false);
        if (captchaRef.current && captchaRef.current.reset) {
          captchaRef.current.reset();
        }
      }
    } catch (err) {
      setError(err.response?.data?.message || 'An error occurred during login');
      // Reset captcha on error
      setCaptchaVerified(false);
      if (captchaRef.current && captchaRef.current.reset) {
        captchaRef.current.reset();
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-container">
      <div className="login-card fade-in">
        <div className="login-header">
          <div className="logo">
            <LogoWithBackground size={48} />
          </div>
          <h1>Scholar Admin</h1>
          <p>Sign in to your account</p>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              type="text"
              id="username"
              name="username"
              className="input"
              placeholder="Enter your username"
              value={formData.username}
              onChange={handleChange}
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              type="password"
              id="password"
              name="password"
              className="input"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              required
            />
          </div>

          <SliderCaptcha
            ref={captchaRef}
            onSuccess={handleCaptchaSuccess}
            onFail={handleCaptchaFail}
          />

          {error && (
            <div className="error-message fade-in">
              <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
                <path d="M8 0C3.6 0 0 3.6 0 8s3.6 8 8 8 8-3.6 8-8-3.6-8-8-8zm1 13H7v-2h2v2zm0-3H7V4h2v6z"/>
              </svg>
              {error}
            </div>
          )}

          <button type="submit" className="btn btn-primary btn-full" disabled={loading || !captchaVerified}>
            {loading ? (
              <>
                <span className="spinner"></span>
                <span style={{ marginLeft: '0.5rem' }}>Signing in...</span>
              </>
            ) : (
              'Sign In'
            )}
          </button>
        </form>
      </div>
    </div>
  );
};

export default Login;
