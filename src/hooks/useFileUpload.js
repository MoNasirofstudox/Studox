// useFileUpload — Supabase Storage upload hook
// Handles: progress, public URL, storage_path logging, error normalization
//
// Bucket convention:
//   course-materials → {institution_id}/{offering_id}/{uuid}-{filename}
//   submissions      → {institution_id}/{assignment_id}/{student_id}/{uuid}-{filename}
//
// Both buckets must be created in Supabase dashboard with:
//   - Public access: OFF (signed URLs only)
//   - Allowed MIME types: any (or restrict per bucket)
// RLS policies (set in dashboard SQL editor):
//   course-materials:
//     INSERT: auth.uid() is not null
//     SELECT: auth.uid() is not null
//   submissions:
//     INSERT: auth.uid() is not null
//     SELECT: auth.uid() is not null

import { useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const MAX_SIZE_MB  = 25
const MAX_SIZE     = MAX_SIZE_MB * 1024 * 1024

// Allowed MIME types per bucket
const ALLOWED_TYPES = {
  'course-materials': [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'image/png', 'image/jpeg', 'image/gif', 'image/webp',
    'video/mp4', 'video/webm',
    'text/plain', 'text/csv',
    'application/zip',
  ],
  'submissions': [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png', 'image/jpeg',
    'text/plain',
    'application/zip',
  ],
}

export function useFileUpload() {
  const [uploading,   setUploading]   = useState(false)
  const [progress,    setProgress]    = useState(0)    // 0–100
  const [error,       setError]       = useState(null)

  const upload = useCallback(async ({
    file,
    bucket,           // 'course-materials' | 'submissions'
    pathSegments,     // array of strings: [institutionId, offeringId] etc
    institutionId,
    uploadedBy,       // person.id
    onSuccess,        // ({ publicUrl, storagePath }) => void
  }) => {
    setError(null)
    setProgress(0)

    // ── Validation ──
    if (!file) { setError('No file selected.'); return }

    if (file.size > MAX_SIZE) {
      setError(`File too large. Maximum size is ${MAX_SIZE_MB}MB.`)
      return
    }

    const allowed = ALLOWED_TYPES[bucket]
    if (allowed && !allowed.includes(file.type)) {
      setError(`File type not allowed. Allowed: ${allowed.map(t => t.split('/')[1]).join(', ')}`)
      return
    }

    setUploading(true)

    // ── Build path ──
    const ext   = file.name.split('.').pop()
    const uuid  = crypto.randomUUID()
    const safe  = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').substring(0, 80)
    const parts = [...pathSegments, `${uuid}-${safe}`]
    const storagePath = parts.join('/')

    // ── Upload ──
    // Supabase JS v2 doesn't expose upload progress natively.
    // We fake it: set 10% on start, 90% on complete, 100% on URL fetch.
    setProgress(10)

    const { data, error: uploadError } = await supabase.storage
      .from(bucket)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false,
        contentType: file.type,
      })

    if (uploadError) {
      setError(uploadError.message)
      setUploading(false)
      setProgress(0)
      return
    }

    setProgress(90)

    // ── Get signed URL (valid 1 year) ──
    const { data: urlData, error: urlError } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, 60 * 60 * 24 * 365)

    if (urlError) {
      setError('Upload succeeded but could not generate URL: ' + urlError.message)
      setUploading(false)
      setProgress(0)
      return
    }

    // ── Log metadata ──
    await supabase.rpc('rpc_log_storage_object', {
      p_bucket:         bucket,
      p_storage_path:   storagePath,
      p_institution_id: institutionId,
      p_uploaded_by:    uploadedBy,
      p_file_size:      file.size,
      p_mime_type:      file.type,
    })

    setProgress(100)
    setUploading(false)

    onSuccess?.({
      publicUrl:   urlData.signedUrl,
      storagePath,
    })
  }, [])

  // Generate a fresh signed URL for an existing storage path
  const getSignedUrl = useCallback(async (bucket, storagePath, expiresInSeconds = 3600) => {
    const { data, error } = await supabase.storage
      .from(bucket)
      .createSignedUrl(storagePath, expiresInSeconds)
    if (error) return null
    return data.signedUrl
  }, [])

  return { upload, uploading, progress, error, setError, getSignedUrl }
}
