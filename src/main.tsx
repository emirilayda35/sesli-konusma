import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { registerSW } from 'virtual:pwa-register'

registerSW({ immediate: true })

import { UIProvider } from './contexts/UIContext'
import { SoundProvider } from './contexts/SoundContext'

import { LanguageProvider } from './contexts/LanguageContext'

console.log("Main.tsx bootstrapping...");
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <LanguageProvider>
      <UIProvider>
        <SoundProvider>
          <App />
        </SoundProvider>
      </UIProvider>
    </LanguageProvider>
  </React.StrictMode>,
)
