/**
 * ============================================================================
 * Scholay学术 V1.0
 * Copyright (c) 2025 成都恩特罐罐文化科技有限公司
 * 统一社会信用代码: 91510100MAEEHRNE26
 * All Rights Reserved.
 * ============================================================================
 */

import React from 'react';
import ReactDOM from 'react-dom/client';
import './assets/styles/index.css';
import { AppProviders } from './app/providers/AppProviders';
import { AppRouter } from './app/routes/AppRouter';

if (import.meta.env.PROD) {
  const noop = () => {};
  console.log = noop;
  console.debug = noop;
  console.info = noop;
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(
  <AppProviders>
    <AppRouter />
  </AppProviders>
);
