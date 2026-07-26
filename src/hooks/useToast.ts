type Toast = { type: 'success' | 'error'; message: string }

const _toasts: Toast[] = []

export const useToast = () => ({
  success: (message: string) => {
    _toasts.push({ type: 'success', message })
  },
  error: (message: string) => {
    _toasts.push({ type: 'error', message })
  }
})
