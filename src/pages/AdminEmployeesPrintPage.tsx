import { useEffect } from 'react'
import { useEmployees } from '../hooks/useEmployees'

const APP_URL =
  String(import.meta.env.VITE_APP_PUBLIC_URL ?? window.location.origin).trim().replace(/\/$/, '') ||
  window.location.origin

export function AdminEmployeesPrintPage() {
  const { employees, loading } = useEmployees()

  useEffect(() => {
    document.title = 'J-S Machine & Valve — Login Usernames'
  }, [])

  return (
    <section className="employee-print-page">
      <div className="employee-print-toolbar no-print">
        <button type="button" className="button-primary" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <header className="employee-print-header">
        <h1>J-S Machine &amp; Valve — Login Usernames</h1>
      </header>

      <table className="employee-print-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Username</th>
            <th>Initials</th>
          </tr>
        </thead>
        <tbody>
          {loading ? (
            <tr>
              <td colSpan={3}>Loading…</td>
            </tr>
          ) : (
            employees
              .filter((employee) => employee.is_active)
              .map((employee) => (
                <tr key={employee.id}>
                  <td>{employee.full_name}</td>
                  <td>
                    <code>{employee.username}</code>
                  </td>
                  <td>{employee.initials}</td>
                </tr>
              ))
          )}
        </tbody>
      </table>

      <footer className="employee-print-footer">
        <p>Your password will be given to you by the administrator.</p>
        <p>
          Log in at: <strong>{APP_URL}/login</strong>
        </p>
        <p>Contact Mike to reset your password.</p>
      </footer>
    </section>
  )
}
