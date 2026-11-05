from __future__ import annotations

import ctypes

from backend.app.foreground import WindowsForegroundWatcher


def test_foreground_watcher_starts_and_stops_cleanly() -> None:
    if not hasattr(ctypes, "windll"):
        return

    watcher = WindowsForegroundWatcher(on_foreground=lambda _hwnd: None)
    watcher.start()
    thread = watcher._thread

    assert thread is not None and thread.is_alive()
    assert watcher._thread_id

    watcher.stop()

    assert not thread.is_alive()
    assert watcher._thread_id == 0
