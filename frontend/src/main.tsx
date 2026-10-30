import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App'
import { applyAppearance, DEFAULT_APPEARANCE } from './app/appearance'
import { installDesktopBackdrop } from './shared/ui/desktopBackdrop'
import { installFrameRate } from './shared/ui/frameRate'
import { installPanelSleep } from './shared/ui/panelSleep'
import { installWindowDrag } from './shared/ui/windowDrag'
import { installWindowResize } from './shared/ui/windowResize'

// Resolve the theme before the first paint; App re-applies the saved appearance once it loads.
applyAppearance(DEFAULT_APPEARANCE)

// Inside the desktop host the page background must stay transparent so the native
// acrylic backdrop shows through; in a plain browser we paint a preview wallpaper instead.
function markDesktopHost() {
  document.documentElement.classList.add('is-desktop')
}

if ((window as Window & { pywebview?: unknown }).pywebview) {
  markDesktopHost()
} else {
  window.addEventListener('pywebviewready', markDesktopHost, { once: true })
}

installDesktopBackdrop()
installWindowDrag()
installWindowResize()
installPanelSleep()
installFrameRate()

// A file dropped on the panel would make WebView2 open it in place of the app (the pinned panel
// stays up while you drag from Explorer). Nothing here takes drops, so none are accepted.
for (const type of ['dragover', 'drop'] as const) {
  window.addEventListener(type, (event) => {
    event.preventDefault()
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'none'
  })
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
