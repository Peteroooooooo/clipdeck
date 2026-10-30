from __future__ import annotations

import ctypes
import queue
import threading
from collections.abc import Callable
from ctypes import wintypes


MOD_ALT = 0x0001
MOD_CONTROL = 0x0002
MOD_SHIFT = 0x0004
MOD_WIN = 0x0008
MOD_NOREPEAT = 0x4000
PM_NOREMOVE = 0x0000
WM_HOTKEY = 0x0312
WM_APP = 0x8000

MODIFIER_MAP = {
    "alt": MOD_ALT,
    "ctrl": MOD_CONTROL,
    "control": MOD_CONTROL,
    "shift": MOD_SHIFT,
    "win": MOD_WIN,
    "meta": MOD_WIN,
}

SPECIAL_KEY_MAP = {
    "space": 0x20,
    "enter": 0x0D,
    "return": 0x0D,
    "delete": 0x2E,
    "backspace": 0x08,
    "tab": 0x09,
    "escape": 0x1B,
    "esc": 0x1B,
    "up": 0x26,
    "down": 0x28,
    "left": 0x25,
    "right": 0x27,
}


def parse_shortcut_binding(binding: str) -> tuple[int, int] | None:
    tokens = [token.strip().lower() for token in binding.split("+") if token.strip()]
    if not tokens:
        return None

    modifiers = 0
    key_code: int | None = None
    for token in tokens:
        if token in MODIFIER_MAP:
            modifiers |= MODIFIER_MAP[token]
            continue

        if token in SPECIAL_KEY_MAP:
            if key_code is not None:
                return None
            key_code = SPECIAL_KEY_MAP[token]
            continue

        if len(token) == 1 and token.isalpha():
            if key_code is not None:
                return None
            key_code = ord(token.upper())
            continue

        if len(token) == 1 and token.isdigit():
            if key_code is not None:
                return None
            key_code = ord(token)
            continue

        if token.startswith("f") and token[1:].isdigit():
            function_number = int(token[1:])
            if 1 <= function_number <= 24 and key_code is None:
                key_code = 0x6F + function_number
                continue

        return None

    if key_code is None:
        return None

    return modifiers, key_code


class WindowsGlobalHotkeyManager:
    """Holds the panel shortcut on a thread of its own that sleeps in GetMessage until the
    shortcut is pressed or a new one is set (posted as WM_APP), instead of polling."""

    HOTKEY_ID = 1

    def __init__(self, *, on_register_failed: Callable[[str], None] | None = None) -> None:
        self.user32 = ctypes.windll.user32
        self.kernel32 = ctypes.windll.kernel32
        self._configure_api()
        self.on_register_failed = on_register_failed
        self._commands: queue.Queue[tuple[str, str | None, object | None]] = queue.Queue()
        self._thread: threading.Thread | None = None
        self._thread_id = 0
        self._ready = threading.Event()

    def update_toggle_panel(self, shortcut: str, callback) -> None:
        self._ensure_thread()
        self._commands.put(("set", shortcut, callback))
        self._wake()

    def stop(self) -> None:
        if self._thread is None:
            return

        self._commands.put(("stop", None, None))
        self._wake()
        self._thread.join(timeout=1.0)
        self._thread = None

    def _ensure_thread(self) -> None:
        if self._thread is not None and self._thread.is_alive():
            return

        self._ready.clear()
        self._thread = threading.Thread(target=self._run, name="global-hotkey-manager", daemon=True)
        self._thread.start()
        # Until its queue exists, a posted wake-up would be lost.
        self._ready.wait(timeout=1.0)

    def _wake(self) -> None:
        if self._thread_id:
            self.user32.PostThreadMessageW(self._thread_id, WM_APP, 0, 0)

    def _report_failure(self, shortcut: str) -> None:
        if self.on_register_failed is None:
            return
        try:
            self.on_register_failed(shortcut)
        except Exception:
            pass

    def _run(self) -> None:
        registered = False
        callback = None
        message = wintypes.MSG()
        # The first PeekMessage creates this thread's message queue.
        self.user32.PeekMessageW(ctypes.byref(message), None, 0, 0, PM_NOREMOVE)
        self._thread_id = int(self.kernel32.GetCurrentThreadId())
        self._ready.set()

        try:
            while self.user32.GetMessageW(ctypes.byref(message), None, 0, 0) > 0:
                if message.message == WM_HOTKEY and message.wParam == self.HOTKEY_ID:
                    if callable(callback):
                        try:
                            callback()
                        except Exception:
                            pass
                    continue

                if message.message != WM_APP:
                    continue

                while True:
                    try:
                        command, shortcut, next_callback = self._commands.get_nowait()
                    except queue.Empty:
                        break

                    if command == "stop":
                        return

                    if registered:
                        self.user32.UnregisterHotKey(None, self.HOTKEY_ID)
                        registered = False

                    callback = next_callback
                    binding = parse_shortcut_binding(shortcut or "")
                    if binding is None:
                        if shortcut:
                            self._report_failure(shortcut)
                        continue

                    modifiers, key_code = binding
                    # Without NOREPEAT, holding the chord fires repeatedly and flickers the panel.
                    registered = bool(
                        self.user32.RegisterHotKey(None, self.HOTKEY_ID, modifiers | MOD_NOREPEAT, key_code)
                    )
                    if not registered:
                        self._report_failure(shortcut or "")
        finally:
            if registered:
                self.user32.UnregisterHotKey(None, self.HOTKEY_ID)
            self._thread_id = 0

    def _configure_api(self) -> None:
        self.user32.RegisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_uint, ctypes.c_uint]
        self.user32.RegisterHotKey.restype = wintypes.BOOL
        self.user32.UnregisterHotKey.argtypes = [wintypes.HWND, ctypes.c_int]
        self.user32.UnregisterHotKey.restype = wintypes.BOOL
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
        self.user32.PostThreadMessageW.argtypes = [wintypes.DWORD, ctypes.c_uint, wintypes.WPARAM, wintypes.LPARAM]
        self.user32.PostThreadMessageW.restype = wintypes.BOOL
        self.kernel32.GetCurrentThreadId.argtypes = []
        self.kernel32.GetCurrentThreadId.restype = wintypes.DWORD
