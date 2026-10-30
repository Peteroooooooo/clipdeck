from __future__ import annotations

from collections.abc import Callable

from .models import AppearanceSettings
from .state import AppState


class AppBridge:
    def __init__(self, state: AppState) -> None:
        self._state = state
        self._hide_window: Callable[[], None] | None = None
        self._pick_storage_path: Callable[[str], str | None] | None = None
        self._confirm_clear_all_history: Callable[[], bool] | None = None
        self._toggle_always_on_top: Callable[[], None] | None = None
        self._is_always_on_top: Callable[[], bool] | None = None
        self._preview_appearance: Callable[[dict[str, object]], None] | None = None
        self._begin_window_drag: Callable[[float, float], None] | None = None
        self._begin_window_resize: Callable[[str, float], None] | None = None
        self._conceal_window: Callable[[], None] | None = None
        self._page_ready: Callable[[], None] | None = None
        self._reveal_started: Callable[[int], None] | None = None

    def _bind_conceal_window(self, conceal_window: Callable[[], None]) -> None:
        self._conceal_window = conceal_window

    def _bind_page_ready(self, page_ready: Callable[[], None]) -> None:
        self._page_ready = page_ready

    def _bind_reveal_started(self, reveal_started: Callable[[int], None]) -> None:
        self._reveal_started = reveal_started

    def _bind_hide_window(self, hide_window: Callable[[], None]) -> None:
        self._hide_window = hide_window

    def _bind_pick_storage_path(self, pick_storage_path: Callable[[str], str | None]) -> None:
        self._pick_storage_path = pick_storage_path

    def _bind_confirm_clear_all_history(self, confirm_clear_all_history: Callable[[], bool]) -> None:
        self._confirm_clear_all_history = confirm_clear_all_history

    def _bind_toggle_always_on_top(self, toggle_always_on_top: Callable[[], None]) -> None:
        self._toggle_always_on_top = toggle_always_on_top

    def _bind_is_always_on_top(self, is_always_on_top: Callable[[], bool]) -> None:
        self._is_always_on_top = is_always_on_top

    def _bind_preview_appearance(self, preview_appearance: Callable[[dict[str, object]], None]) -> None:
        self._preview_appearance = preview_appearance

    def _bind_begin_window_drag(self, begin_window_drag: Callable[[float, float], None]) -> None:
        self._begin_window_drag = begin_window_drag

    def begin_window_drag(self, grab_x: float, grab_y: float) -> None:
        """The page's title area was pressed at (grab_x, grab_y), physical px inside the window."""
        if self._begin_window_drag is None:
            return
        self._begin_window_drag(float(grab_x), float(grab_y))

    def _bind_begin_window_resize(self, begin_window_resize: Callable[[str, float], None]) -> None:
        self._begin_window_resize = begin_window_resize

    def begin_window_resize(self, edge: str, grab_y: float) -> None:
        """The panel's top or bottom edge was pressed at grab_y, physical px inside the window."""
        if self._begin_window_resize is None or edge not in ("top", "bottom"):
            return
        self._begin_window_resize(edge, float(grab_y))

    def preview_appearance(self, appearance: dict[str, object]) -> None:
        """Apply unsaved glass settings to the native window while the user edits them."""
        if self._preview_appearance is None:
            return
        self._preview_appearance(AppearanceSettings.from_dict(appearance if isinstance(appearance, dict) else None).to_dict())

    def get_app_state(self) -> dict[str, object]:
        return self._snapshot()

    def set_view(self, view: str) -> dict[str, object]:
        if view != "panel":
            self._state.clear_paste_target()
        return self.with_window_state(self._state.set_view(view))

    def toggle_pause(self) -> dict[str, object]:
        return self.with_window_state(self._state.toggle_pause())

    def toggle_pin(self, record_id: str) -> dict[str, object]:
        return self.with_window_state(self._state.toggle_pin(record_id))

    def delete_record(self, record_id: str) -> dict[str, object]:
        return self.with_window_state(self._state.delete_record(record_id))

    def undo_delete(self) -> dict[str, object]:
        return self.with_window_state(self._state.undo_delete())

    def clear_all_history(self) -> dict[str, object]:
        return self.with_window_state(self._state.clear_all_history())

    def clear_unpinned_history(self) -> dict[str, object]:
        return self.with_window_state(self._state.clear_unpinned_history())

    def trigger_primary_action(self, record_id: str) -> dict[str, object]:
        if self._should_hide_window_for_action():
            self._hide_window()
        return self.with_window_state(self._state.trigger_primary_action(record_id))

    def paste_plain_text(self, record_id: str) -> dict[str, object]:
        if self._should_hide_window_for_action() and self._state.has_paste_target():
            self._hide_window()
        return self.with_window_state(self._state.paste_plain_text(record_id))

    def copy_record(self, record_id: str) -> dict[str, object]:
        if self._should_hide_window_for_action():
            self.hide_window()
        return self.with_window_state(self._state.copy_record(record_id))

    def save_image(self, record_id: str) -> dict[str, object]:
        """Saves an image clip into the image save folder; the window stays open."""
        return self.with_window_state(self._state.save_image(record_id))

    def save_settings(self, settings: dict[str, object], pause_recording: bool) -> dict[str, object]:
        return self.with_window_state(self._state.save_settings(settings, pause_recording))

    def default_shortcuts(self) -> dict[str, str]:
        """Factory shortcuts for the settings draft; nothing changes until the user saves."""
        return self._state.default_shortcuts()

    def dismiss_toast(self) -> dict[str, object]:
        return self.with_window_state(self._state.dismiss_toast())

    def toggle_always_on_top(self) -> dict[str, object]:
        if self._toggle_always_on_top is not None:
            self._toggle_always_on_top()
        return self._snapshot()

    def hide_window(self) -> None:
        """Hidden from the page (Esc, close button, click-away): plays the short conceal."""
        self._state.clear_paste_target()
        if self._conceal_window is not None:
            self._conceal_window()
        elif self._hide_window is not None:
            self._hide_window()

    def page_ready(self) -> None:
        """The page has drawn its first frame with data; a normal launch may show the window."""
        if self._page_ready is not None:
            self._page_ready()

    def reveal_started(self, seq: int) -> None:
        """The page's frames reach the screen again after a summon and its reveal has begun."""
        if self._reveal_started is not None:
            self._reveal_started(int(seq))

    def pick_storage_path(self, current_path: str) -> str | None:
        if self._pick_storage_path is None:
            return None
        return self._pick_storage_path(current_path)

    def confirm_clear_all_history(self) -> bool:
        if self._confirm_clear_all_history is None:
            return True
        return self._confirm_clear_all_history()

    def _snapshot(self) -> dict[str, object]:
        return self.with_window_state(self._state.snapshot())

    def with_window_state(self, snapshot: dict[str, object]) -> dict[str, object]:
        """A state snapshot plus what only the window knows (always on top)."""
        return {**snapshot, "isAlwaysOnTop": False if self._is_always_on_top is None else self._is_always_on_top()}

    def _should_hide_window_for_action(self) -> bool:
        if self._hide_window is None:
            return False
        if self._is_always_on_top is None:
            return True
        return not self._is_always_on_top()

