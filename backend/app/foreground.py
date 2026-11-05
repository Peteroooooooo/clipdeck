"""Follows which window the user brings to the front, as Windows reports it."""

from __future__ import annotations

import ctypes
import threading
from collections.abc import Callable

if hasattr(ctypes, "windll"):
    from ctypes import wintypes
else:  # pragma: no cover - non-Windows guard
    wintypes = None

EVENT_SYSTEM_FOREGROUND = 0x0003
OBJID_WINDOW = 0
WINEVENT_OUTOFCONTEXT = 0x0000
WINEVENT_SKIPOWNPROCESS = 0x0002
PM_NOREMOVE = 0x0000
WM_QUIT = 0x0012


class WindowsForegroundWatcher:
    """Calls `on_foreground(hwnd)` each time a window of another app comes to the front.

    A WinEvent hook on a thread of its own: Windows calls it back from that thread's message
    loop, which otherwise sleeps in GetMessage, so nothing is polled.
    """

    def __init__(self, *, on_foreground: Callable[[int], None]) -> None:
        self.on_foreground = on_foreground
        self._thread: threading.Thread | None = None
        self._thread_id = 0
        self._ready = threading.Event()
        self._is_windows = wintypes is not None
        if not self._is_windows:
            return
        # Own instances, so these signatures never clash with other modules' use of windll.
        self.user32 = ctypes.WinDLL("user32")
        self.kernel32 = ctypes.WinDLL("kernel32")
        self._proc_type = ctypes.WINFUNCTYPE(
            None,
            wintypes.HANDLE,
            wintypes.DWORD,
            wintypes.HWND,
            wintypes.LONG,
            wintypes.LONG,
            wintypes.DWORD,
            wintypes.DWORD,
        )
        self._configure_api()

    def start(self) -> None:
        if not self._is_windows or (self._thread is not None and self._thread.is_alive()):
            return
        self._ready.clear()
        self._thread = threading.Thread(target=self._run, name="foreground-watcher", daemon=True)
        self._thread.start()
        self._ready.wait(timeout=1.0)

    def stop(self) -> None:
        if self._thread is None:
            return
        if self._thread_id:
            self.user32.PostThreadMessageW(self._thread_id, WM_QUIT, 0, 0)
        self._thread.join(timeout=1.0)
        self._thread = None

    def _run(self) -> None:
        message = wintypes.MSG()
        # The first PeekMessage creates this thread's message queue.
        self.user32.PeekMessageW(ctypes.byref(message), None, 0, 0, PM_NOREMOVE)
        self._thread_id = int(self.kernel32.GetCurrentThreadId())

        def handle(_hook, event, hwnd, id_object, _id_child, _thread, _time) -> None:
            if event != EVENT_SYSTEM_FOREGROUND or id_object != OBJID_WINDOW or not hwnd:
                return
            try:
                self.on_foreground(int(hwnd))
            except Exception:
                pass

        # Must stay referenced for as long as the hook is installed.
        callback = self._proc_type(handle)
        hook = self.user32.SetWinEventHook(
            EVENT_SYSTEM_FOREGROUND,
            EVENT_SYSTEM_FOREGROUND,
            None,
            callback,
            0,
            0,
            WINEVENT_OUTOFCONTEXT | WINEVENT_SKIPOWNPROCESS,
        )
        self._ready.set()
        try:
            if not hook:
                return
            while self.user32.GetMessageW(ctypes.byref(message), None, 0, 0) > 0:
                self.user32.TranslateMessage(ctypes.byref(message))
                self.user32.DispatchMessageW(ctypes.byref(message))
        finally:
            if hook:
                self.user32.UnhookWinEvent(hook)
            self._thread_id = 0

    def _configure_api(self) -> None:
        self.user32.SetWinEventHook.argtypes = [
            wintypes.DWORD,
            wintypes.DWORD,
            wintypes.HMODULE,
            self._proc_type,
            wintypes.DWORD,
            wintypes.DWORD,
            wintypes.DWORD,
        ]
        self.user32.SetWinEventHook.restype = wintypes.HANDLE
        self.user32.UnhookWinEvent.argtypes = [wintypes.HANDLE]
        self.user32.UnhookWinEvent.restype = wintypes.BOOL
        self.user32.PeekMessageW.argtypes = [
            ctypes.POINTER(wintypes.MSG),
            wintypes.HWND,
            ctypes.c_uint,
            ctypes.c_uint,
            ctypes.c_uint,
        ]
        self.user32.PeekMessageW.restype = wintypes.BOOL
        self.user32.GetMessageW.argtypes = [ctypes.POINTER(wintypes.MSG), wintypes.HWND, ctypes.c_uint, ctypes.c_uint]
        self.user32.GetMessageW.restype = wintypes.BOOL
        self.user32.TranslateMessage.argtypes = [ctypes.POINTER(wintypes.MSG)]
        self.user32.TranslateMessage.restype = wintypes.BOOL
        self.user32.DispatchMessageW.argtypes = [ctypes.POINTER(wintypes.MSG)]
        self.user32.DispatchMessageW.restype = wintypes.LPARAM
        self.user32.PostThreadMessageW.argtypes = [wintypes.DWORD, ctypes.c_uint, wintypes.WPARAM, wintypes.LPARAM]
        self.user32.PostThreadMessageW.restype = wintypes.BOOL
        self.kernel32.GetCurrentThreadId.argtypes = []
        self.kernel32.GetCurrentThreadId.restype = wintypes.DWORD
