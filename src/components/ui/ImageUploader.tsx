'use client'

import Image from 'next/image'
import {
  type ChangeEvent,
  type DragEvent,
  useId,
  useRef,
  useState,
} from 'react'
import {
  ImagePlus,
  LoaderCircle,
  Trash2,
  Upload,
} from 'lucide-react'

import { createClient } from '@/lib/supabase/client'

type ImageUploaderProps = {
  bucket: 'avatars' | 'organization-logos'
  folder: string
  currentUrl?: string | null
  label?: string
  description?: string
  disabled?: boolean
  onUploadComplete: (publicUrl: string) => void
  onRemove?: () => void
}

const MAX_FILE_SIZE = 2 * 1024 * 1024

const ALLOWED_FILE_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/svg+xml',
]

function getFileExtension(file: File): string {
  const extension = file.name.split('.').pop()?.toLowerCase()

  if (extension) {
    return extension
  }

  switch (file.type) {
    case 'image/jpeg':
      return 'jpg'
    case 'image/png':
      return 'png'
    case 'image/webp':
      return 'webp'
    case 'image/svg+xml':
      return 'svg'
    default:
      return 'png'
  }
}

function getStoragePathFromPublicUrl(
  publicUrl: string,
  bucket: string,
): string | null {
  const marker = `/storage/v1/object/public/${bucket}/`
  const markerIndex = publicUrl.indexOf(marker)

  if (markerIndex === -1) {
    return null
  }

  return decodeURIComponent(
    publicUrl.slice(markerIndex + marker.length).split('?')[0],
  )
}

export default function ImageUploader({
  bucket,
  folder,
  currentUrl = null,
  label = 'Upload image',
  description = 'PNG, JPG or WEBP. Maximum file size: 2 MB.',
  disabled = false,
  onUploadComplete,
  onRemove,
}: ImageUploaderProps) {
  const inputId = useId()
  const inputRef = useRef<HTMLInputElement>(null)

  const [localPreviewUrl, setLocalPreviewUrl] = useState<
    string | null | undefined
  >(undefined)
  const [isDragging, setIsDragging] = useState(false)
  const [isUploading, setIsUploading] = useState(false)
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [successMessage, setSuccessMessage] = useState<string | null>(null)

  const previewUrl =
    localPreviewUrl === undefined ? currentUrl : localPreviewUrl

  function validateFile(file: File): string | null {
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      return 'Choose a PNG, JPG, WEBP or SVG image.'
    }

    if (bucket === 'avatars' && file.type === 'image/svg+xml') {
      return 'Profile avatars must be PNG, JPG or WEBP images.'
    }

    if (file.size > MAX_FILE_SIZE) {
      return 'The selected image is larger than 2 MB.'
    }

    return null
  }

  async function uploadFile(file: File) {
    setErrorMessage(null)
    setSuccessMessage(null)

    const validationError = validateFile(file)

    if (validationError) {
      setErrorMessage(validationError)
      return
    }

    const objectUrl = URL.createObjectURL(file)

    setLocalPreviewUrl(objectUrl)
    setIsUploading(true)

    try {
      const supabase = createClient()
      const extension = getFileExtension(file)
      const filePath = `${folder}/image-${Date.now()}.${extension}`

      const { error: uploadError } = await supabase.storage
        .from(bucket)
        .upload(filePath, file, {
          cacheControl: '3600',
          contentType: file.type,
          upsert: false,
        })

      if (uploadError) {
        throw uploadError
      }

      const {
        data: { publicUrl },
      } = supabase.storage.from(bucket).getPublicUrl(filePath)

      setLocalPreviewUrl(publicUrl)
      onUploadComplete(publicUrl)
      setSuccessMessage('Image uploaded successfully.')

      if (currentUrl) {
        const previousPath = getStoragePathFromPublicUrl(
          currentUrl,
          bucket,
        )

        if (previousPath && previousPath !== filePath) {
          const { error: removeOldImageError } = await supabase.storage
            .from(bucket)
            .remove([previousPath])

          if (removeOldImageError) {
            console.error(
              'Unable to remove the previous image:',
              removeOldImageError,
            )
          }
        }
      }
    } catch (error) {
      console.error('Image upload failed:', error)

      setLocalPreviewUrl(undefined)
      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'The image could not be uploaded.',
      )
    } finally {
      URL.revokeObjectURL(objectUrl)
      setIsUploading(false)

      if (inputRef.current) {
        inputRef.current.value = ''
      }
    }
  }

  function handleInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]

    if (file) {
      void uploadFile(file)
    }
  }

  function handleDragOver(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()

    if (!disabled && !isUploading) {
      setIsDragging(true)
    }
  }

  function handleDragLeave(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault()
    setIsDragging(false)

    if (disabled || isUploading) {
      return
    }

    const file = event.dataTransfer.files?.[0]

    if (file) {
      void uploadFile(file)
    }
  }

  async function handleRemove() {
    if (!previewUrl || disabled || isUploading) {
      return
    }

    setErrorMessage(null)
    setSuccessMessage(null)
    setIsUploading(true)

    try {
      const storagePath = getStoragePathFromPublicUrl(
        previewUrl,
        bucket,
      )

      if (storagePath) {
        const supabase = createClient()

        const { error: removeError } = await supabase.storage
          .from(bucket)
          .remove([storagePath])

        if (removeError) {
          throw removeError
        }
      }

      setLocalPreviewUrl(null)
      onRemove?.()
      setSuccessMessage('Image removed successfully.')
    } catch (error) {
      console.error('Image removal failed:', error)

      setErrorMessage(
        error instanceof Error
          ? error.message
          : 'The image could not be removed.',
      )
    } finally {
      setIsUploading(false)
    }
  }

  const isDisabled = disabled || isUploading

  return (
    <div className="space-y-4">
      <div>
        <p className="text-sm font-semibold text-white">
          {label}
        </p>

        <p className="mt-1 text-sm leading-6 text-slate-400">
          {description}
        </p>
      </div>

      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <div className="relative h-28 w-28 shrink-0 overflow-hidden rounded-3xl border border-white/10 bg-[#07111F]">
          {previewUrl ? (
            <Image
              src={previewUrl}
              alt="Uploaded image preview"
              fill
              unoptimized
              sizes="112px"
              className="object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-slate-500">
              <ImagePlus
                className="h-8 w-8"
                aria-hidden="true"
              />
            </div>
          )}

          {isUploading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-[#07111F]/80">
              <LoaderCircle
                className="h-7 w-7 animate-spin text-cyan-300"
                aria-hidden="true"
              />
            </div>
          ) : null}
        </div>

        <div className="min-w-0 flex-1 space-y-3">
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={
              isDragging
                ? 'rounded-3xl border border-cyan-300/60 bg-cyan-300/10 p-5'
                : 'rounded-3xl border border-dashed border-white/15 bg-white/[0.02] p-5 transition hover:border-white/25 hover:bg-white/[0.04]'
            }
          >
            <input
              ref={inputRef}
              id={inputId}
              type="file"
              accept={
                bucket === 'avatars'
                  ? 'image/jpeg,image/png,image/webp'
                  : 'image/jpeg,image/png,image/webp,image/svg+xml'
              }
              disabled={isDisabled}
              onChange={handleInputChange}
              className="sr-only"
            />

            <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-medium text-slate-200">
                  Drag and drop an image here
                </p>

                <p className="mt-1 text-xs text-slate-500">
                  Or choose an image from your computer.
                </p>
              </div>

              <label
                htmlFor={inputId}
                aria-disabled={isDisabled}
                className={
                  isDisabled
                    ? 'inline-flex cursor-not-allowed items-center gap-2 rounded-2xl bg-white/5 px-4 py-2.5 text-sm font-semibold text-slate-500'
                    : 'inline-flex cursor-pointer items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-sm font-semibold text-[#07111F] transition hover:bg-slate-100'
                }
              >
                {isUploading ? (
                  <LoaderCircle
                    className="h-4 w-4 animate-spin"
                    aria-hidden="true"
                  />
                ) : (
                  <Upload
                    className="h-4 w-4"
                    aria-hidden="true"
                  />
                )}

                {isUploading ? 'Uploading...' : 'Choose image'}
              </label>
            </div>
          </div>

          {previewUrl && onRemove ? (
            <button
              type="button"
              disabled={isDisabled}
              onClick={() => void handleRemove()}
              className="inline-flex items-center gap-2 rounded-2xl border border-red-400/20 bg-red-400/10 px-4 py-2.5 text-sm font-semibold text-red-200 transition hover:bg-red-400/15 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Trash2
                className="h-4 w-4"
                aria-hidden="true"
              />

              Remove image
            </button>
          ) : null}
        </div>
      </div>

      <div aria-live="polite">
        {errorMessage ? (
          <p className="text-sm text-red-300">
            {errorMessage}
          </p>
        ) : null}

        {successMessage ? (
          <p className="text-sm text-emerald-300">
            {successMessage}
          </p>
        ) : null}
      </div>
    </div>
  )
}