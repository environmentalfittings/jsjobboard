import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { inboxUnreadCount, loadInboxItems, type InboxItem } from '../lib/messages'

export function useInbox(userId: string | null | undefined) {
  const [items, setItems] = useState<InboxItem[]>([])
  const [loading, setLoading] = useState(Boolean(userId))
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const hasLoadedRef = useRef(false)

  const refresh = useCallback(async () => {
    if (!userId) {
      setItems([])
      setLoading(false)
      setRefreshing(false)
      setError(null)
      hasLoadedRef.current = false
      return
    }

    const isInitial = !hasLoadedRef.current
    if (isInitial) setLoading(true)
    else setRefreshing(true)

    try {
      const result = await loadInboxItems(userId)
      setItems(result.items)
      setError(result.error)
      hasLoadedRef.current = true
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [userId])

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!userId) return
    const onFocus = () => {
      void refresh()
    }
    const onInboxRefresh = () => {
      void refresh()
    }
    window.addEventListener('focus', onFocus)
    window.addEventListener('jsjb-inbox-refresh', onInboxRefresh)
    const timer = window.setInterval(() => {
      void refresh()
    }, 45000)
    return () => {
      window.removeEventListener('focus', onFocus)
      window.removeEventListener('jsjb-inbox-refresh', onInboxRefresh)
      window.clearInterval(timer)
    }
  }, [refresh, userId])

  const unreadCount = useMemo(() => (userId ? inboxUnreadCount(items, userId) : 0), [items, userId])

  return {
    items,
    loading,
    refreshing,
    error,
    unreadCount,
    refresh,
  }
}
