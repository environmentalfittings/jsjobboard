import { createContext, type ReactNode, useContext, useEffect, useMemo, useState } from 'react'

interface ToastContextValue {
  showToast: (message: string) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

export function ToastProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState('')

  useEffect(() => {
    if (!message) return
    const timer = window.setTimeout(() => setMessage(''), 2500)
    return () => window.clearTimeout(timer)
  }, [message])

  const value = useMemo(
    () => ({
      showToast: (nextMessage: string) => setMessage(nextMessage),
    }),
    [],
  )

  return (
    <ToastContext.Provider value={value}>
      {children}
      {message ? <div className="toast-notification">{message}</div> : null}
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (!context) throw new Error('useToast must be used inside ToastProvider')
  return context
}
