from __future__ import annotations

from collections.abc import Callable
import ctypes
import threading
import time

import pystray
from PIL import Image

from .brand_icon import load_icon
from .state import AppState

APP_NAME = "ClipDeck"
TRAY_TITLE = "ClipDeck"

# The tray speaks the app's language (Settings > General > Language).
TEXTS = {
    "zh": {
        "show": "显示主面板",
        "pause": "暂停记录",
        "resume": "继续记录",
        "settings": "打开设置",
        "clear": "清空全部历史",
        "exit": f"退出 {APP_NAME}",
        "confirm_clear": "确定要清空全部历史记录吗？固定和最近记录都会被删除。",
        "hotkey_failed_title": "快捷键不可用",
        "hotkey_failed": "{shortcut} 已被其他程序占用。可以从托盘图标打开 ClipDeck，并在设置里换一个快捷键。",
    },
    "en": {
        "show": "Show Panel",
        "pause": "Pause Recording",
        "resume": "Resume Recording",
        "settings": "Open Settings",
        "clear": "Clear All History",
        "exit": f"Exit {APP_NAME}",
        "confirm_clear": "Clear all clipboard history? Pinned and recent clips will be removed.",
        "hotkey_failed_title": "Shortcut unavailable",
        "hotkey_failed": "{shortcut} is taken by another app. Open ClipDeck from the tray icon and choose another shortcut in Settings.",
    },
}


def texts(language: str) -> dict[str, str]:
    return TEXTS.get(language, TEXTS["en"])


def menu_labels(*, is_recording_paused: bool, language: str = "zh") -> list[str]:
    text = texts(language)
    return [
        text["show"],
        text["resume"] if is_recording_paused else text["pause"],
        text["settings"],
        text["clear"],
        text["exit"],
    ]


# uxtheme.dll exports these by ordinal only (Windows 10 1903 and later; Explorer and Office use
# them for their dark menus): SetPreferredAppMode(mode) and FlushMenuThemes().
_SET_PREFERRED_APP_MODE = 135
_FLUSH_MENU_THEMES = 136
_FORCE_DARK = 2


def use_dark_menus() -> bool:
    """Draw this process's native menus (the tray menu) in Windows' dark style instead of the old
    white one. Undocumented, so any failure just leaves the light menu."""
    if not hasattr(ctypes, "windll"):
        return False
    try:
        uxtheme = ctypes.WinDLL("uxtheme")
        set_preferred_app_mode = uxtheme[_SET_PREFERRED_APP_MODE]
        set_preferred_app_mode.argtypes = [ctypes.c_int]
        set_preferred_app_mode.restype = ctypes.c_int
        flush_menu_themes = uxtheme[_FLUSH_MENU_THEMES]
        flush_menu_themes.argtypes = []
        flush_menu_themes.restype = None
        set_preferred_app_mode(_FORCE_DARK)
        flush_menu_themes()
        return True
    except (AttributeError, OSError):
        return False


def confirm_clear_all_history(language: str = "zh") -> bool:
    result = ctypes.windll.user32.MessageBoxW(
        None,
        texts(language)["confirm_clear"],
        APP_NAME,
        0x00000001 | 0x00000030,
    )
    return result == 1


class TrayController:
    def __init__(
        self,
        *,
        state: AppState,
        show_history: Callable[[], None],
        show_settings: Callable[[], None],
        exit_app: Callable[[], None],
        confirm_clear: Callable[[], bool] | None = None,
    ) -> None:
        self.state = state
        self.show_history = show_history
        self.show_settings = show_settings
        self.exit_app = exit_app
        self.confirm_clear = confirm_clear or (lambda: confirm_clear_all_history(self._language()))
        self.icon = pystray.Icon(
            "clipboard-history",
            icon=self._create_icon(),
            title=TRAY_TITLE,
            menu=self._create_menu(),
        )

    def run(self) -> None:
        use_dark_menus()
        self.icon.run_detached()

    def stop(self) -> None:
        self.icon.stop()

    def notify_hotkey_failed(self, shortcut: str) -> None:
        """A Windows notification from the tray icon. Reported at launch, possibly before the
        icon is up, so it waits (briefly) for the icon first."""
        text = texts(self._language())
        message = text["hotkey_failed"].format(shortcut=shortcut)

        def show() -> None:
            for _ in range(50):
                if self.icon.visible:
                    break
                time.sleep(0.1)
            try:
                self.icon.notify(message, text["hotkey_failed_title"])
            except Exception:
                pass

        threading.Thread(target=show, name="tray-notify", daemon=True).start()

    def _language(self) -> str:
        settings = getattr(self.state, "settings", None)
        return getattr(settings, "language", "zh")

    def _label(self, index: int):
        # Read when the menu opens, so it follows the language and the recording state.
        return lambda _item: menu_labels(
            is_recording_paused=self.state.is_recording_paused, language=self._language()
        )[index]

    def _create_menu(self) -> pystray.Menu:
        return pystray.Menu(
            pystray.MenuItem(self._label(0), self._handle_open_history, default=True),
            pystray.MenuItem(self._label(1), self._handle_toggle_pause),
            pystray.MenuItem(self._label(2), self._handle_open_settings),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(self._label(3), self._handle_clear_all_history),
            pystray.Menu.SEPARATOR,
            pystray.MenuItem(self._label(4), self._handle_exit),
        )

    @staticmethod
    def _create_icon() -> Image.Image:
        return load_icon(64)

    def _handle_open_history(self, _icon: pystray.Icon, _item: pystray.MenuItem) -> None:
        self.state.set_view("panel")
        self.show_history()

    def _handle_toggle_pause(self, _icon: pystray.Icon, _item: pystray.MenuItem) -> None:
        self.state.toggle_pause()
        self.icon.update_menu()

    def _handle_open_settings(self, _icon: pystray.Icon, _item: pystray.MenuItem) -> None:
        self.state.set_view("settings")
        self.show_settings()

    def _handle_clear_all_history(self, _icon: pystray.Icon, _item: pystray.MenuItem) -> None:
        if self.confirm_clear():
            self.state.clear_all_history()

    def _handle_exit(self, _icon: pystray.Icon, _item: pystray.MenuItem) -> None:
        self.exit_app()


