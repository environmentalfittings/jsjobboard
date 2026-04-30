import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App.tsx'
import { supabaseConfigError } from './lib/supabase'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {supabaseConfigError ? (
      <div style={{ maxWidth: 760, margin: '40px auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
        <h2>Configuration required</h2>
        <p>{supabaseConfigError}</p>
        <p>Set these in your Vercel Project Settings {"->"} Environment Variables, then redeploy.</p>
      </div>
    ) : (
      <BrowserRouter>
        <App />
      </BrowserRouter>
    )}
  </StrictMode>,
)
