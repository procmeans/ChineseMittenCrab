#!/usr/bin/env python3
from __future__ import annotations

import argparse
import asyncio
import json
import logging
import sys
from tempfile import gettempdir
from pathlib import Path
from typing import Any

from wechat_clawbot_sdk.media import download_inbound_media_item


def emit(payload: dict[str, Any]) -> None:
    print(json.dumps(payload, ensure_ascii=False), flush=True)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="JSONL bridge for wechat_clawbot_sdk")
    parser.add_argument("--account", default="default")
    parser.add_argument("--state-dir", default="")
    parser.add_argument("--debug", action="store_true")
    return parser.parse_args()


def resolve_saved_account_alias(requested: str, state_dir: str) -> str:
    if not state_dir:
        return requested
    accounts_dir = Path(state_dir) / "accounts"
    if not accounts_dir.exists():
        return "default"
    account_files = sorted(
        p for p in accounts_dir.glob("*.json")
        if not p.name.endswith(".context-tokens.json") and not p.name.endswith(".sync.json")
    )
    if len(account_files) != 1:
        return "default"
    try:
        data = json.loads(account_files[0].read_text(encoding="utf-8"))
    except Exception:
        return "default"
    return str(data.get("account_id") or requested)


async def stdin_commands(queue: asyncio.Queue[dict[str, Any]]) -> None:
    loop = asyncio.get_running_loop()

    def read_line() -> str:
        return sys.stdin.readline()

    while True:
        line = await loop.run_in_executor(None, read_line)
        if line == "":
            await queue.put({"type": "stop"})
            return
        line = line.strip()
        if not line:
            continue
        try:
            await queue.put(json.loads(line))
        except json.JSONDecodeError as exc:
            emit({"type": "error", "error": f"invalid command JSON: {exc}"})


def media_payload(message: Any) -> list[dict[str, str]]:
    media = getattr(message, "media", None)
    if media is None:
        return []
    if isinstance(media, list):
        payloads: list[dict[str, str]] = []
        for item in media:
            file_path = getattr(item, "local_path", None) or getattr(item, "file_path", "") or getattr(item, "path", "")
            if not file_path:
                continue
            payloads.append({
                "type": str(getattr(item, "mime_type", "file") or "file"),
                "file_path": str(file_path),
            })
        return payloads
    file_path = getattr(media, "file_path", "") or getattr(media, "path", "")
    if not file_path:
        return []
    return [{
        "type": str(getattr(media, "type", "file") or "file"),
        "file_path": str(file_path),
    }]


def infer_media_type(item: dict[str, Any], mime_type: str | None = None) -> str:
    item_type = item.get("type")
    if item_type == 2:
        return "image"
    if item_type == 3:
        return "voice"
    if item_type == 4:
        return "file"
    if item_type == 5:
        return "video"
    if isinstance(mime_type, str):
        if mime_type.startswith("image/"):
            return "image"
        if mime_type.startswith("audio/"):
            return "voice"
        if mime_type.startswith("video/"):
            return "video"
    return "file"


async def download_message_media(message: Any, session: Any) -> list[dict[str, str]]:
    raw_message = getattr(message, "raw_message", None)
    if not isinstance(raw_message, dict):
        return media_payload(message)

    item_list = raw_message.get("item_list")
    if not isinstance(item_list, list) or not item_list:
        return media_payload(message)

    account_id = str(getattr(message, "account_id", "") or "")
    message_id = str(getattr(message, "message_id", "") or getattr(message, "id", "") or "message")
    base_dir = Path(gettempdir()) / "wechat_clawbot_sdk" / "inbound" / (account_id or "default") / message_id
    base_dir.mkdir(parents=True, exist_ok=True)

    payloads: list[dict[str, str]] = []
    for index, item in enumerate(item_list):
        downloaded = await download_inbound_media_item(
            item,
            cdn_base_url=str(getattr(session, "base_url", "") or ""),
            dest_dir=base_dir / str(index),
        )
        if downloaded is None:
            continue
        payloads.append({
            "type": infer_media_type(item, getattr(downloaded, "mime_type", None)),
            "file_path": str(getattr(downloaded, "local_path", "")),
        })

    return payloads or media_payload(message)


async def run() -> int:
    args = parse_args()
    logging.basicConfig(level=logging.DEBUG if args.debug else logging.INFO)

    try:
        from wechat_clawbot_sdk import AsyncWeChatBotClient, PollEventType
        from wechat_clawbot_sdk.api import TypingStatus
    except Exception as exc:
        emit({
            "type": "error",
            "error": "wechat_clawbot_sdk is not installed. Run: pip install wechat_clawbot_sdk",
            "detail": str(exc),
        })
        return 2

    create_kwargs: dict[str, Any] = {}
    if args.state_dir:
        create_kwargs["state_dir"] = args.state_dir
    client = AsyncWeChatBotClient.create(**create_kwargs)
    commands: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    command_task = asyncio.create_task(stdin_commands(commands))

    try:
        account_id = resolve_saved_account_alias(args.account, args.state_dir)
        status = await client.get_account_status(account_id)
        session = getattr(status, "session", None)
        if not getattr(status, "logged_in", False):
            qrcode = await client.start_login()
            emit({
                "type": "login_qr",
                "qrcode": getattr(qrcode, "qrcode", ""),
                "qrcode_image_content": getattr(qrcode, "qrcode_image_content", ""),
            })
            session = await client.wait_for_login(getattr(qrcode, "qrcode"))
            account_id = getattr(session, "account_id", account_id)
        elif session is not None:
            account_id = getattr(session, "account_id", account_id)

        emit({"type": "ready", "account_id": account_id})

        async def consume_commands() -> None:
            while True:
                command = await commands.get()
                command_type = command.get("type")
                if command_type == "stop":
                    return
                try:
                    if command_type == "send_text":
                        await client.send_text(
                            account_id=command.get("account_id") or account_id,
                            user_id=command["user_id"],
                            text=command.get("text", ""),
                        )
                    elif command_type == "send_file":
                        await client.send_file(
                            account_id=command.get("account_id") or account_id,
                            user_id=command["user_id"],
                            local_path=Path(command["file_path"]),
                            mime_type=command.get("mime_type") or "application/octet-stream",
                        )
                    elif command_type == "send_typing":
                        status_value = command.get("status", int(TypingStatus.TYPING))
                        await client.send_typing(
                            account_id=command.get("account_id") or account_id,
                            user_id=command["user_id"],
                            status=int(status_value),
                        )
                    else:
                        emit({"type": "error", "error": f"unknown command type: {command_type}"})
                        continue
                    emit({"type": "ack", "request_id": command.get("request_id", "")})
                except Exception as exc:
                    emit({
                        "type": "error",
                        "request_id": command.get("request_id", ""),
                        "error": str(exc),
                    })

        command_consumer = asyncio.create_task(consume_commands())

        async for event in client.poll_events(account_id):
            if command_consumer.done():
                break
            if event.event_type is not PollEventType.MESSAGE or event.message is None:
                continue
            message = event.message
            media = await download_message_media(message, session)
            emit({
                "type": "message",
                "account_id": account_id,
                "user_id": getattr(message, "user_id", ""),
                "message_id": getattr(message, "message_id", "") or getattr(message, "id", ""),
                "text": getattr(message, "text", "") or "",
                "timestamp": getattr(message, "timestamp", 0) or getattr(message, "create_time", 0),
                "media": media,
            })
    finally:
        command_task.cancel()
        await client.close()

    return 0


def main() -> None:
    try:
        code = asyncio.run(run())
    except KeyboardInterrupt:
        code = 130
    sys.exit(code)


if __name__ == "__main__":
    main()
