import React, { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './contexts/AuthContext';
import { UIProvider } from './contexts/UIContext';
import PrivateRoute from './components/PrivateRoute';
import Login from './pages/Auth/Login';
import Register from './pages/Auth/Register';
import Dashboard from './pages/Dashboard';

import ErrorBoundary from './components/ErrorBoundary';
import NotificationManager from './components/NotificationManager';

export default function App() {
  useEffect(() => {
    const theme = localStorage.getItem('settings_theme') || 'dark';
    document.documentElement.setAttribute('data-theme', theme);
  }, []);

  return (
    <ErrorBoundary>
      <UIProvider>
        <AuthProvider>
          <NotificationManager />
          <Router>
            <Routes>
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />
              <Route
                path="/"
                element={
                  <PrivateRoute>
                    <Dashboard />
                  </PrivateRoute>
                }
              />
              <Route path="*" element={<Navigate to="/" />} />
            </Routes>
          </Router>
        </AuthProvider>
      </UIProvider>
    </ErrorBoundary>
  );
}



