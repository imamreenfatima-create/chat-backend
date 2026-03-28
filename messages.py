from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from database import database
from dependencies import get_current_user

router = APIRouter()

class MessageCreate(BaseModel):
    content: str

class MessageUpdate(BaseModel):
    content: str

@router.get("/{project_id}")
async def get_messages(project_id: str, before: Optional[str] = Query(None), limit: int = Query(50, le=100), current_user=Depends(get_current_user)):
    member = await database.fetch_one("SELECT 1 FROM project_members WHERE project_id = :pid AND user_id = :uid", {"pid": project_id, "uid": current_user["id"]})
    if not member:
        raise HTTPException(403, "You are not a member of this channel.")
    cursor_clause = ""
    params = {"pid": project_id, "limit": limit}
    if before:
        cursor_clause = "AND m.created_at < (SELECT created_at FROM messages WHERE id = :before)"
        params["before"] = before
    rows = await database.fetch_all(
        f"""SELECT m.id, m.content, m.edited, m.edited_at, m.created_at,
               u.id AS user_id, u.username, u.full_name, u.avatar_url,
               COALESCE(json_agg(json_build_object('emoji', r.emoji, 'count', r.cnt, 'users', r.users)) FILTER (WHERE r.emoji IS NOT NULL), '[]') AS reactions
           FROM messages m JOIN users u ON u.id = m.user_id
           LEFT JOIN (SELECT message_id, emoji, COUNT(*)::int AS cnt, array_agg(user_id::text) AS users FROM reactions GROUP BY message_id, emoji) r ON r.message_id = m.id
           WHERE m.project_id = :pid {cursor_clause}
           GROUP BY m.id, u.id ORDER BY m.created_at DESC LIMIT :limit""", params)
    return list(reversed([dict(r) for r in rows]))

@router.post("/{project_id}", status_code=201)
async def send_message(project_id: str, body: MessageCreate, current_user=Depends(get_current_user)):
    member = await database.fetch_one("SELECT 1 FROM project_members WHERE project_id = :pid AND user_id = :uid", {"pid": project_id, "uid": current_user["id"]})
    if not member:
        raise HTTPException(403, "You are not a member of this channel.")
    row = await database.fetch_one(
        "INSERT INTO messages (project_id, user_id, content) VALUES (:pid, :uid, :content) RETURNING id, content, edited, edited_at, created_at",
        {"pid": project_id, "uid": current_user["id"], "content": body.content},
    )
    return {**dict(row), "user_id": current_user["id"], "username": current_user["username"], "full_name": current_user["full_name"], "avatar_url": current_user.get("avatar_url"), "reactions": []}

@router.patch("/{message_id}")
async def edit_message(message_id: str, body: MessageUpdate, current_user=Depends(get_current_user)):
    msg = await database.fetch_one("SELECT user_id FROM messages WHERE id = :id", {"id": message_id})
    if not msg:
        raise HTTPException(404, "Message not found.")
    if str(msg["user_id"]) != current_user["id"]:
        raise HTTPException(403, "You can only edit your own messages.")
    row = await database.fetch_one("UPDATE messages SET content = :content, edited = TRUE, edited_at = NOW() WHERE id = :id RETURNING id, content, edited, edited_at, created_at", {"content": body.content, "id": message_id})
    return dict(row)

@router.delete("/{message_id}", status_code=204)
async def delete_message(message_id: str, current_user=Depends(get_current_user)):
    msg = await database.fetch_one("SELECT user_id FROM messages WHERE id = :id", {"id": message_id})
    if not msg:
        raise HTTPException(404, "Message not found.")
    if str(msg["user_id"]) != current_user["id"]:
        raise HTTPException(403, "You can only delete your own messages.")
    await database.execute("DELETE FROM messages WHERE id = :id", {"id": message_id})

@router.post("/{message_id}/reactions/{emoji}")
async def toggle_reaction(message_id: str, emoji: str, current_user=Depends(get_current_user)):
    existing = await database.fetch_one("SELECT id FROM reactions WHERE message_id = :mid AND user_id = :uid AND emoji = :emoji", {"mid": message_id, "uid": current_user["id"], "emoji": emoji})
    if existing:
        await database.execute("DELETE FROM reactions WHERE id = :id", {"id": existing["id"]})
        return {"action": "removed"}
    await database.execute("INSERT INTO reactions (message_id, user_id, emoji) VALUES (:mid, :uid, :emoji)", {"mid": message_id, "uid": current_user["id"], "emoji": emoji})
    return {"action": "added"}
