from __future__ import annotations

import os
import shutil
import threading
from copy import deepcopy
from datetime import datetime
from pathlib import Path
from typing import Callable

from .app_icons import exe_stem_name
from .clipboard import ClipboardCapture
from .clipboard import WindowsClipboardService
from .clipboard import build_record_from_capture
from .clipboard import clip_identity
from .models import DEFAULT_HISTORY_LIMIT
from .models import HistoryRecord
from .models import MAX_HISTORY_LIMIT
from .models import MIN_HISTORY_LIMIT
from .models import AppearanceSettings
from .models import SettingsState
from .models import ShortcutBindings
from .models import ToastMessage
from .models import default_settings
from .models import image_save_path_from_payload
from .models import language_from_payload
from .runtime import resolve_default_storage_path
from .storage import AppStorage
from .storage import resolve_local_path


SnapshotListener = Callable[[dict[str, object]], None]


class AppState:
    def __init__(self, *, storage: AppStorage | None = None, clipboard_service=None) -> None:
        project_root = Path(__file__).resolve().parents[2]
        default_storage_path = resolve_default_storage_path(project_root=project_root)
        self.bootstrap_storage = storage or AppStorage(base_path=default_storage_path)
        bootstrap_settings = self.bootstrap_storage.load_settings()
        unavailable_path: str | None = None
        try:
            self.storage = self._resolve_storage_for_path(Path(bootstrap_settings.storage_path))
        except OSError:
            # Unplugged drive or offline share: start on the default folder instead of crashing.
            unavailable_path = bootstrap_settings.storage_path
            self.storage = self.bootstrap_storage
        self.clipboard_service = clipboard_service or WindowsClipboardService()
        self.view = "panel"
        self.is_recording_paused = False
        if self.storage.base_path == self.bootstrap_storage.base_path:
            self.settings = bootstrap_settings
        elif self.storage.settings_path.exists():
            self.settings = self.storage.load_settings()
        else:
            self.settings = deepcopy(bootstrap_settings)
            self.settings.storage_path = str(self.storage.base_path)
        self.records = self._merge_duplicates(self.storage.load_records())
        self.toast: ToastMessage | None = None
        # What the toast's undo brings back: the clip just deleted, or the recent clips just
        # cleared, with the bytes of their images (whose files are pruned meanwhile).
        self.deleted_records: list[HistoryRecord] = []
        self.deleted_image_bytes: dict[str, bytes] = {}
        self._listeners: list[SnapshotListener] = []
        self._lock = threading.RLock()
        if unavailable_path is not None:
            self.settings.storage_path = str(self.storage.base_path)
            self.toast = self._make_toast("storage_unavailable", "danger", path=unavailable_path)
        self._normalize_storage_path()
        self._persist_all()

    def subscribe(self, listener: SnapshotListener) -> None:
        with self._lock:
            self._listeners.append(listener)

    def snapshot(self) -> dict[str, object]:
        with self._lock:
            sorted_records = self._sorted_records()
            pinned = [record for record in sorted_records if record.pinned]
            recent = [record for record in sorted_records if not record.pinned]
            return {
                "view": self.view,
                "isRecordingPaused": self.is_recording_paused,
                "pinnedRecords": [record.to_page_dict() for record in pinned],
                "recentRecords": [record.to_page_dict() for record in recent],
                "settings": self.settings.to_dict(),
                "toast": None if self.toast is None else self.toast.to_dict(),
            }

    def is_self_written_sequence(self, sequence_number: int) -> bool:
        is_self_written = getattr(self.clipboard_service, "is_self_written_sequence", None)
        if callable(is_self_written):
            return bool(is_self_written(sequence_number))
        return False

    def set_view(self, view: str) -> dict[str, object]:
        with self._lock:
            self.view = view
            snapshot = self.snapshot()
        return self._notify(snapshot)

    def toggle_pause(self) -> dict[str, object]:
        with self._lock:
            self.is_recording_paused = not self.is_recording_paused
            self.toast = (
                self._make_toast("recording_paused", "danger")
                if self.is_recording_paused
                else self._make_toast("recording_resumed", "success")
            )
            snapshot = self.snapshot()
        return self._notify(snapshot)

    def ingest_capture(self, capture: ClipboardCapture, *, captured_at: str | None = None) -> dict[str, object]:
        with self._lock:
            if self.is_recording_paused:
                return self.snapshot()

            timestamp = captured_at or self._timestamp()
            record = build_record_from_capture(capture, self.settings, captured_at=timestamp)
            if record is None:
                return self.snapshot()

            if capture.source_exe:
                record.source_icon = self.storage.app_icon(capture.source_exe)
                self._adopt_source(record, exe_stem_name(capture.source_exe))

            existing_record = self._find_same_clip(record)
            if existing_record is not None:
                if existing_record.type in ("text", "rich_text"):
                    # The same words copied again keep the latest form (formatted or plain).
                    for name in ("type", "summary", "detail", "meta", "content_hash", "plain_text", "rich_text"):
                        setattr(existing_record, name, getattr(record, name))
                existing_record.updated_at = record.updated_at
                existing_record.source_app = record.source_app
                existing_record.source_glyph = record.source_glyph
                existing_record.source_icon = record.source_icon
                self._move_to_end(existing_record)
            else:
                if record.type == "image" and capture.image_bytes:
                    record.image_path = self.storage.save_image_bytes(
                        record_id=record.id,
                        image_bytes=capture.image_bytes,
                    )
                self.records.append(record)
                self._apply_retention()

            self._persist_records()
            snapshot = self.snapshot()
        return self._notify(snapshot)

    def toggle_pin(self, record_id: str) -> dict[str, object]:
        with self._lock:
            record = self._find_record(record_id)
            if record is None:
                return self.snapshot()

            record.pinned = not record.pinned
            record.updated_at = self._timestamp()
            self._move_to_end(record)
            self._apply_retention()
            self._persist_records()
            self.toast = self._make_toast("pinned" if record.pinned else "unpinned", "success", summary=record.summary)
            snapshot = self.snapshot()
        return self._notify(snapshot)

    def delete_record(self, record_id: str) -> dict[str, object]:
        with self._lock:
            record = self._find_record(record_id)
            if record is None:
                return self.snapshot()

            self._keep_for_undo([record])
            self.records = [item for item in self.records if item.id != record_id]
            self._persist_records()
            self.toast = self._make_toast("deleted", "danger", action_kind="undo_delete", summary=record.summary)
            snapshot = self.snapshot()
        return self._notify(snapshot)

    def capture_paste_target(self) -> None:
        capture_target = getattr(self.clipboard_service, "capture_paste_target", None)
        if callable(capture_target):
            capture_target()

    def has_paste_target(self) -> bool:
        has_target = getattr(self.clipboard_service, "has_paste_target", None)
        if callable(has_target):
            return bool(has_target())
        return False

    def clear_paste_target(self) -> None:
        clear_target = getattr(self.clipboard_service, "clear_paste_target", None)
        if callable(clear_target):
            clear_target()

    def undo_delete(self) -> dict[str, object]:
        with self._lock:
            if not self.deleted_records:
                return self.snapshot()

            restored = [deepcopy(record) for record in self.deleted_records]
            for record in restored:
                image_bytes = self.deleted_image_bytes.get(record.id)
                if record.type == "image" and image_bytes is not None:
                    record.image_path = self.storage.save_image_bytes(record_id=record.id, image_bytes=image_bytes)

            self.records.extend(restored)
            self._apply_retention()
            self._persist_records()
            self.toast = (
                self._make_toast("restored", "success", summary=restored[0].summary)
                if len(restored) == 1
                else self._make_toast("restored_many", "success", count=len(restored))
            )
            self._keep_for_undo([])
            snapshot = self.snapshot()
        return self._notify(snapshot)

    def clear_all_history(self) -> dict[str, object]:
        with self._lock:
            self.records = []
            self._keep_for_undo([])
            self._persist_records()
            self.toast = self._make_toast("cleared_all", "danger")
            snapshot = self.snapshot()
        return self._notify(snapshot)

    def clear_unpinned_history(self) -> dict[str, object]:
        with self._lock:
            removed = [record for record in self.records if not record.pinned]
            self._keep_for_undo(removed)
            self.records = [record for record in self.records if record.pinned]
            self._persist_records()
            self.toast = self._make_toast(
                "cleared_unpinned",
                "danger",
                action_kind="undo_delete" if removed else None,
                count=len(removed),
            )
            snapshot = self.snapshot()
        return self._notify(snapshot)

    def report_hotkey_failed(self, shortcut: str) -> dict[str, object]:
        """Windows refused the panel shortcut (another app holds it): say so on the panel."""
        with self._lock:
            self.toast = self._make_toast("hotkey_failed", "danger", shortcut=shortcut)
            snapshot = self.snapshot()
        return self._notify(snapshot)

    def trigger_primary_action(self, record_id: str) -> dict[str, object]:
        return self._write_record_to_clipboard(record_id, as_plain_text=False, paste=True)

    def paste_plain_text(self, record_id: str) -> dict[str, object]:
        return self._write_record_to_clipboard(record_id, as_plain_text=True, paste=True)

    def copy_record(self, record_id: str) -> dict[str, object]:
        return self._write_record_to_clipboard(record_id, as_plain_text=False, paste=False)

    def save_image(self, record_id: str) -> dict[str, object]:
        """Copies an image clip's PNG into the image save folder, under a name from when it was
        copied; never overwrites a file already there."""
        with self._lock:
            record = self._find_record(record_id)
            if record is None or record.type != "image":
                return self.snapshot()
            source = resolve_local_path(record.image_path)
            folder = Path(self.settings.image_save_path)
            if source is None or not source.is_file():
                self.toast = self._make_toast("image_missing", "danger")
            else:
                try:
                    folder.mkdir(parents=True, exist_ok=True)
                    target = _unused_path(folder, _image_file_stem(record.created_at), source.suffix or ".png")
                    shutil.copyfile(source, target)
                except OSError:
                    self.toast = self._make_toast("image_save_failed", "danger", folder=str(folder))
                else:
                    self.toast = self._make_toast("image_saved", "success", path=str(target))
            snapshot = self.snapshot()
        return self._notify(snapshot)

    def save_settings(self, settings: dict[str, object], pause_recording: bool) -> dict[str, object]:
        with self._lock:
            self.settings = SettingsState(
                launch_on_startup=bool(settings["launchOnStartup"]),
                close_to_tray=bool(settings["closeToTray"]),
                follow_system_theme=bool(settings["followSystemTheme"]),
                record_text=bool(settings.get("recordText", True)),
                record_rich_text=bool(settings.get("recordRichText", True)),
                history_limit=_normalize_history_limit(settings.get("historyLimit")),
                record_images=bool(settings["recordImages"]),
                record_files=bool(settings.get("recordFiles", True)),
                storage_path=str(settings["storagePath"]),
                shortcuts=ShortcutBindings(
                    toggle_panel=str(settings["shortcuts"]["togglePanel"]),
                    primary_action=str(settings["shortcuts"]["primaryAction"]),
                    paste_plain_text=str(settings["shortcuts"]["pastePlainText"]),
                    toggle_pin=str(settings["shortcuts"]["togglePin"]),
                    delete_record=str(settings["shortcuts"]["deleteRecord"]),
                ),
                appearance=AppearanceSettings.from_dict(
                    settings["appearance"] if isinstance(settings.get("appearance"), dict) else None
                ),
                image_save_path=image_save_path_from_payload(settings.get("imageSavePath")),
                language=language_from_payload(settings.get("language")),
            )
            self.is_recording_paused = pause_recording
            self.view = "panel"
            requested_path = self.settings.storage_path
            try:
                self._normalize_storage_path()
                storage_failed = False
            except OSError:
                self.settings.storage_path = str(self.storage.base_path)
                storage_failed = True
            self._apply_retention()
            self._persist_all()
            self.toast = (
                self._make_toast("storage_unwritable", "danger", path=requested_path)
                if storage_failed
                else self._make_toast("settings_saved", "success")
            )
            snapshot = self.snapshot()
        return self._notify(snapshot)

    def default_shortcuts(self) -> dict[str, str]:
        return self._default_settings().shortcuts.to_dict()

    def dismiss_toast(self) -> dict[str, object]:
        with self._lock:
            self.toast = None
            self._keep_for_undo([])
            snapshot = self.snapshot()
        return self._notify(snapshot)

    def _write_record_to_clipboard(self, record_id: str, *, as_plain_text: bool, paste: bool) -> dict[str, object]:
        with self._lock:
            record = self._find_record(record_id)
            if record is None:
                return self.snapshot()
            record = deepcopy(record)

        if self.clipboard_service.write_record(record, as_plain_text=as_plain_text) is False:
            # Another app held the clipboard: Ctrl+V now would paste whatever was there before.
            with self._lock:
                self.toast = self._make_toast("clipboard_busy", "danger")
                snapshot = self.snapshot()
            return self._notify(snapshot)
        if paste and self.has_paste_target():
            restore_target = getattr(self.clipboard_service, "restore_paste_target", None)
            if callable(restore_target):
                restore_target()
            self.clipboard_service.send_paste_shortcut()
        return self._notify(self.snapshot())

    def _notify(self, snapshot: dict[str, object]) -> dict[str, object]:
        with self._lock:
            listeners = list(self._listeners)
        for listener in listeners:
            listener(snapshot)
        return snapshot

    def _keep_for_undo(self, records: list[HistoryRecord]) -> None:
        self.deleted_records = [deepcopy(record) for record in records]
        self.deleted_image_bytes = {}
        for record in records:
            if record.type == "image":
                image_bytes = self.storage.read_image_bytes(record.image_path)
                if image_bytes is not None:
                    self.deleted_image_bytes[record.id] = image_bytes

    def _persist_records(self) -> None:
        """Clips changed, settings did not: only the history file is written."""
        self.storage.save_records(self.records)
        self.storage.prune_unreferenced_images(record.image_path for record in self.records)

    def _persist_all(self) -> None:
        self.settings.storage_path = str(self.storage.base_path)
        self.storage.save_settings(self.settings)
        self._persist_records()
        if self.bootstrap_storage.base_path != self.storage.base_path:
            bootstrap_settings = deepcopy(self.settings)
            bootstrap_settings.storage_path = str(self.storage.base_path)
            self.bootstrap_storage.save_settings(bootstrap_settings)

    def _normalize_storage_path(self) -> None:
        storage_path = Path(self.settings.storage_path)
        if storage_path != self.storage.base_path:
            previous_storage = self.storage
            target_storage = self._resolve_storage_for_path(storage_path)
            self.records = self._merge_duplicates(self._merge_records(self.records, target_storage.load_records()))
            self.records = self._migrate_record_images(self.records, target_storage)
            self.storage = target_storage
            # The history moved: leave nothing behind, or switching back later would resurrect
            # clips (and images) the user has deleted since.
            if not _same_folder(previous_storage.base_path, target_storage.base_path):
                previous_storage.save_records([])
                previous_storage.prune_unreferenced_images([])
        self.settings.storage_path = str(self.storage.base_path)

    def _apply_retention(self) -> None:
        sorted_records = self._sorted_records()
        retained_ids: set[str] = {record.id for record in sorted_records if record.pinned}
        unpinned_records = [record for record in sorted_records if not record.pinned]

        retained_ids.update(record.id for record in unpinned_records[: self.settings.history_limit])
        self.records = [record for record in self.records if record.id in retained_ids]

    def _sorted_records(self) -> list[HistoryRecord]:
        # Newest first; on equal timestamps the record touched later (later in the list) wins.
        ordered = sorted(enumerate(self.records), key=lambda item: (item[1].updated_at, item[0]), reverse=True)
        return [record for _index, record in ordered]

    def _move_to_end(self, record: HistoryRecord) -> None:
        self.records = [item for item in self.records if item is not record] + [record]

    def _find_record(self, record_id: str) -> HistoryRecord | None:
        return next((record for record in self.records if record.id == record_id), None)

    def _adopt_source(self, record: HistoryRecord, exe_stem: str) -> None:
        """Older clips from the same app, saved before names and icons were read ("Code"
        rather than "Visual Studio Code", no icon), take this clip's name and icon."""
        if record.source_icon is None:
            return
        old_names = {exe_stem.casefold(), record.source_app.casefold()}
        for other in self.records:
            if other.source_icon is None and other.source_app.casefold() in old_names:
                other.source_app = record.source_app
                other.source_glyph = record.source_glyph
                other.source_icon = record.source_icon

    def _find_same_clip(self, record: HistoryRecord) -> HistoryRecord | None:
        identity = clip_identity(record)
        return next((other for other in self.records if clip_identity(other) == identity), None)

    @staticmethod
    def _merge_duplicates(records: list[HistoryRecord]) -> list[HistoryRecord]:
        """History saved before duplicates were recognised by their text can hold the same clip
        several times. One record per clip stays: the latest one, pinned if any copy was, with
        the first copy's creation time."""
        groups: dict[str, list[HistoryRecord]] = {}
        for record in records:
            groups.setdefault(clip_identity(record), []).append(record)
        kept: list[HistoryRecord] = []
        for record in records:
            group = groups[clip_identity(record)]
            latest = max(group, key=lambda item: item.updated_at)
            if record is not latest:
                continue
            latest.pinned = any(item.pinned for item in group)
            latest.created_at = min(item.created_at for item in group)
            kept.append(latest)
        return kept

    def _resolve_storage_for_path(self, storage_path: Path) -> AppStorage:
        if storage_path == self.bootstrap_storage.base_path:
            return self.bootstrap_storage
        return AppStorage(base_path=storage_path)

    @staticmethod
    def _merge_records(
        current_records: list[HistoryRecord],
        target_records: list[HistoryRecord],
    ) -> list[HistoryRecord]:
        merged_records = {record.id: deepcopy(record) for record in target_records}
        for record in current_records:
            merged_records[record.id] = deepcopy(record)
        return list(merged_records.values())

    @staticmethod
    def _migrate_record_images(records: list[HistoryRecord], storage: AppStorage) -> list[HistoryRecord]:
        migrated_records: list[HistoryRecord] = []
        for record in records:
            migrated_record = deepcopy(record)
            if migrated_record.type == "image" and migrated_record.image_path:
                migrated_record.image_path = storage.import_image_path(
                    record_id=migrated_record.id,
                    image_path=migrated_record.image_path,
                )
            migrated_records.append(migrated_record)
        return migrated_records

    @staticmethod
    def _make_toast(kind: str, tone: str, *, action_kind: str | None = None, **params: object) -> ToastMessage:
        return ToastMessage(
            id=f"{kind}-{int(datetime.now().timestamp() * 1000)}",
            kind=kind,
            tone=tone,
            params=params,
            action_kind=action_kind,
        )

    @staticmethod
    def _timestamp() -> str:
        # Milliseconds keep two copies within one second in order; still sorts against older
        # second-precision values saved by earlier versions.
        return datetime.now().isoformat(timespec="milliseconds")

    @staticmethod
    def _default_settings() -> SettingsState:
        default_storage_path = resolve_default_storage_path(project_root=Path(__file__).resolve().parents[2])
        return default_settings(storage_path=str(default_storage_path))


def _image_file_stem(created_at: str) -> str:
    try:
        moment = datetime.fromisoformat(created_at)
    except ValueError:
        moment = datetime.now()
    return f"ClipDeck {moment:%Y-%m-%d %H-%M-%S}"


def _unused_path(folder: Path, stem: str, suffix: str) -> Path:
    target = folder / f"{stem}{suffix}"
    counter = 2
    while target.exists():
        target = folder / f"{stem} ({counter}){suffix}"
        counter += 1
    return target


def _same_folder(left: Path, right: Path) -> bool:
    try:
        return os.path.samefile(left, right)
    except OSError:
        return False


def _normalize_history_limit(value: object) -> int:
    if value is None:
        return DEFAULT_HISTORY_LIMIT

    return max(MIN_HISTORY_LIMIT, min(MAX_HISTORY_LIMIT, int(value)))
