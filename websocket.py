# routers/websocket.py
"""
WebSocket hub – one connection per user.
Messages are broadcast to all members of the same project room.

Client sends:  { "type": "message"|"typing"|"reaction", ...payload }
Server pushes: { "type": "new_message"|"typing"|"reaction_update"|"user_online", ...payload }
"""

import json
from typing import Dict, Set
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from jose import jwt, JWTError

from config import settings
from database import database

router = APIRouter()

# project_id -> set of (websocket, user_id)
rooms: Dict[str, Set[tuple]] = {}


def _get_user_id(token: str) -> str | None:
    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        return payload.get("sub")
    except JWTError:
        return None


async def _broadcast(project_id: str, payload: dict, exclude_ws: WebSocket = None):
    dead = set()
    for ws, uid in list(rooms.get(project_id, set())):
        if ws is exclude_ws:
            continue
        try:
            await ws.send_text(json.dumps(payload))
        except Exception:
            dead.add((ws, uid))
    rooms[project_id] -= dead


@router.websocket("/{project_id}")
async def chat_ws(
    websocket: WebSocket,
    project_id: str,
    token: str = Query(...),
):
    # Authenticate
    user_id = _get_user_id(token)
    if not user_id:
        await websocket.close(code=4001)
        return

    # Verify membership
    member = await database.fetch_one(
        "SELECT 1 FROM project_members WHERE project_id = :pid AND user_id = :uid",
        {"pid": project_id, "uid": user_id},
    )
    if not member:
        await websocket.close(code=4003)
        return

    await websocket.accept()

    # Join room
    rooms.setdefault(project_id, set()).add((websocket, user_id))

    # Mark user online
    await database.execute(
        "UPDATE users SET is_online = TRUE, last_seen = NOW() WHERE id = :uid",
        {"uid": user_id},
    )
    user_row = await database.fetch_one(
        "SELECT id, username, full_name, avatar_url FROM users WHERE id = :uid",
        {"uid": user_id},
    )
    await _broadcast(project_id, {
        "type": "user_online",
        "user": dict(user_row),
        "online": True,
    }, exclude_ws=websocket)

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)
            event_type = data.get("type")

            # ── New message ────────────────────────────────────────────────────
            if event_type == "message":
                content = data.get("content", "").strip()
                if not content:
                    continue
                row = await database.fetch_one(
                    """INSERT INTO messages (project_id, user_id, content)
                       VALUES (:pid, :uid, :content)
                       RETURNING id, content, edited, edited_at, created_at""",
                    {"pid": project_id, "uid": user_id, "content": content},
                )
                payload = {
                    "type": "new_message",
                    "message": {
                        **dict(row),
                        "user_id": user_id,
                        "username": user_row["username"],
                        "full_name": user_row["full_name"],
                        "avatar_url": user_row["avatar_url"],
                        "reactions": [],
                        # Serialize datetimes
                        "created_at": row["created_at"].isoformat(),
                        "edited_at": row["edited_at"].isoformat() if row["edited_at"] else None,
                    },
                }
                # Echo to sender too
                await websocket.send_text(json.dumps(payload))
                await _broadcast(project_id, payload, exclude_ws=websocket)

            # ── Typing indicator ───────────────────────────────────────────────
            elif event_type == "typing":
                await _broadcast(project_id, {
                    "type": "typing",
                    "user_id": user_id,
                    "username": user_row["username"],
                    "is_typing": data.get("is_typing", False),
                }, exclude_ws=websocket)

            # ── Reaction toggle ────────────────────────────────────────────────
            elif event_type == "reaction":
                message_id = data.get("message_id")
                emoji = data.get("emoji")
                if not message_id or not emoji:
                    continue

                existing = await database.fetch_one(
                    "SELECT id FROM reactions WHERE message_id = :mid AND user_id = :uid AND emoji = :emoji",
                    {"mid": message_id, "uid": user_id, "emoji": emoji},
                )
                if existing:
                    await database.execute("DELETE FROM reactions WHERE id = :id", {"id": existing["id"]})
                    action = "removed"
                else:
                    await database.execute(
                        "INSERT INTO reactions (message_id, user_id, emoji) VALUES (:mid, :uid, :emoji)",
                        {"mid": message_id, "uid": user_id, "emoji": emoji},
                    )
                    action = "added"

                # Fetch updated counts
                updated = await database.fetch_all(
                    """SELECT emoji, COUNT(*)::int AS count, array_agg(user_id::text) AS users
                       FROM reactions WHERE message_id = :mid GROUP BY emoji""",
                    {"mid": message_id},
                )
                broadcast_payload = {
                    "type": "reaction_update",
                    "message_id": message_id,
                    "reactions": [dict(r) for r in updated],
                    "action": action,
                }
                await websocket.send_text(json.dumps(broadcast_payload))
                await _broadcast(project_id, broadcast_payload, exclude_ws=websocket)

    except WebSocketDisconnect:
        pass
    finally:
        rooms.get(project_id, set()).discard((websocket, user_id))
        await database.execute(
            "UPDATE users SET is_online = FALSE, last_seen = NOW() WHERE id = :uid",
            {"uid": user_id},
        )
        await _broadcast(project_id, {
            "type": "user_online",
            "user_id": user_id,
            "online": False,
        })
