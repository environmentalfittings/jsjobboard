import { parseFeedbackResolutionImages, type FeedbackResolutionImage } from './feedbackResolutionPhotos'
import { supabase } from './supabase'

export type FeedbackResolutionNotice = {
  id: number
  message: string
  resolution_notes: string
  resolution_images: FeedbackResolutionImage[]
  resolved_at: string | null
}

export async function loadUnseenFeedbackResolutions(
  userId: string,
): Promise<{ notices: FeedbackResolutionNotice[]; error: string | null }> {
  const { data, error } = await supabase
    .from('app_feedback')
    .select('id,message,resolution_notes,resolution_images,resolved_at')
    .eq('submitted_by_user_id', userId)
    .eq('status', 'resolved')
    .is('submitter_seen_at', null)
    .not('resolution_notes', 'is', null)
    .order('resolved_at', { ascending: true })

  if (error) {
    if (/submitted_by_user_id|submitter_seen_at|column.*does not exist/i.test(error.message)) {
      return { notices: [], error: null }
    }
    return { notices: [], error: error.message }
  }

  return {
    notices: ((data ?? []) as Array<Omit<FeedbackResolutionNotice, 'resolution_images'> & { resolution_images?: unknown }>)
      .map((row) => ({
        ...row,
        resolution_notes: row.resolution_notes ?? '',
        resolution_images: parseFeedbackResolutionImages(row.resolution_images),
      }))
      .filter((row) => row.resolution_notes.trim().length > 0),
    error: null,
  }
}

export async function markFeedbackResolutionSeen(feedbackId: number): Promise<string | null> {
  const { error } = await supabase.rpc('mark_feedback_resolution_seen', { p_feedback_id: feedbackId })
  if (error) {
    if (/mark_feedback_resolution_seen|function.*does not exist/i.test(error.message)) {
      return 'Run supabase/migration-app-feedback-submitter-notifications.sql in Supabase SQL Editor'
    }
    return error.message
  }
  return null
}
