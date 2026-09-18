import React from 'react';
import ReactDOM from 'react-dom/client';
import { createBrowserRouter, Navigate, RouterProvider } from 'react-router-dom';
import { Layout } from './components/Layout.js';
import { FeaturesPage } from './pages/FeaturesPage.js';
import { TestCasesPage } from './pages/TestCasesPage.js';
import { SettingsPage } from './pages/SettingsPage.js';
import './styles.css';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    children: [
      { index: true, element: <Navigate to="/features" replace /> },
      { path: 'features', element: <FeaturesPage /> },
      { path: 'test-cases', element: <TestCasesPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: '*', element: <Navigate to="/features" replace /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>,
);
