import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'

import { UIProvider } from './contexts/UIContext'
import { SoundProvider } from './contexts/SoundContext'

console.log("Main.tsx bootstrapping...");
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <UIProvider>
      <SoundProvider>
        <App />
      </SoundProvider>
    </UIProvider>
  </React.StrictMode>,
)
