import { useEffect, useId, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useInbox } from '../hooks/useInbox'
import { markInboxItemRead } from '../lib/messages'

interface NavMessagesMenuProps {
  userId: string
  username: string
}

function formatWhen(value: string) {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })
}

function previewBody(body: string) {
  const compact = body.replace(/\s+/g, ' ').trim()
  if (compact.length <= 120) return compact
  return `${compact.slice(0, 117)}…`
}

export function NavMessagesMenu({ userId, username }: NavMessagesMenuProps) {
  const menuId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)
  const { items, loading, unreadCount, refresh } = useInbox(userId)

  const inboxItems = items
    .filter((item) => item.recipientUserId === userId && !item.archived)
    .slice(0, 12)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  const openItem = async (itemKey: string) => {
    const item = items.find((row) => row.key === itemKey)
    if (!item || item.read) return
    await markInboxItemRead(item)
    void refresh()
  }

  return (
    <div className="nav-messages" ref={rootRef}>
      <button
        type="button"
        className={`nav-messages-button${open ? ' nav-messages-button--open' : ''}`}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-controls={menuId}
        onClick={() => {
          setOpen((value) => !value)
          if (!open) void refresh()
        }}
      >
        Messages
        {unreadCount > 0 ? <span className="nav-messages-badge">{unreadCount > 99 ? '99+' : unreadCount}</span> : null}
      </button>
      {open ? (
        <div className="nav-messages-panel" id={menuId} role="menu">
          <div className="nav-messages-panel-head">
            <div>
              <div className="nav-messages-panel-title">Messages</div>
              <div className="nav-messages-panel-subtitle">{username}</div>
            </div>
            <Link to="/messages?compose=1" className="button-secondary nav-messages-compose-link" onClick={() => setOpen(false)}>
              New message
            </Link>
          </div>
          {loading ? (
            <p className="nav-messages-empty">Loading…</p>
          ) : inboxItems.length === 0 ? (
            <p className="nav-messages-empty">No messages yet.</p>
          ) : (
            <div className="nav-messages-list">
              {inboxItems.map((item) => (
                <Link
                  key={item.key}
                  to={`/messages?item=${encodeURIComponent(item.key)}`}
                  className={`nav-messages-item${item.read ? '' : ' nav-messages-item--unread'}`}
                  role="menuitem"
                  onClick={() => {
                    setOpen(false)
                    void openItem(item.key)
                  }}
                >
                  <div className="nav-messages-item-top">
                    <span className="nav-messages-item-from">
                      {!item.read ? <span className="nav-messages-item-new-dot" aria-hidden="true" /> : null}
                      {item.category === 'notification' ? item.subject ?? 'Notification' : item.senderName ?? 'Message'}
                      {!item.read ? <span className="nav-messages-item-new-label">New</span> : null}
                    </span>
                    <time className="nav-messages-item-time" dateTime={item.createdAt}>
                      {formatWhen(item.createdAt)}
                    </time>
                  </div>
                  <div className="nav-messages-item-preview">{previewBody(item.body)}</div>
                </Link>
              ))}
            </div>
          )}
          <div className="nav-messages-panel-foot">
            <Link to="/messages" className="nav-messages-view-all" onClick={() => setOpen(false)}>
              View all messages
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  )
}
