module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        navy: '#07111F',
        deepblue: '#0B1B34',
        primary: '#2563EB',
        bright: '#3B82F6',
        cyan: '#22D3EE',
        lightbg: '#F8FAFC',
        border: '#E2E8F0',
        maintext: '#0F172A',
        muted: '#64748B'
      },
      borderRadius: {
        lg: '12px'
      }
    }
  },
  corePlugins: {
    preflight: false
  },
  plugins: []
}
