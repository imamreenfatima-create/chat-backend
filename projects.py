from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from database import database
from dependencies import get_current_user

router = APIRouter()

class ProjectCreate(BaseModel):
    name: str
    description: Optional[str] = None
    icon: str = "📁"
    color: str = "#6366f1"

@router.get("/")
async def list_projects(current_user=Depends(get_current_user)):
    rows = await database.fetch_all(
        """SELECT p.id, p.name, p.description, p.icon, p.color, p.created_at,
               (SELECT COUNT(*) FROM messages m WHERE m.project_id = p.id
                AND m.created_at > COALESCE(
                    (SELECT rs.last_read_at FROM read_status rs WHERE rs.user_id = :uid AND rs.project_id = p.id),
                    '1970-01-01')) AS unread_count
           FROM projects p JOIN project_members pm ON pm.project_id = p.id
           WHERE pm.user_id = :uid ORDER BY p.created_at""",
        {"uid": current_user["id"]},
    )
    return [dict(r) for r in rows]

@router.post("/", status_code=201)
async def create_project(body: ProjectCreate, current_user=Depends(get_current_user)):
    row = await database.fetch_one(
        "INSERT INTO projects (name, description, icon, color, created_by) VALUES (:name, :description, :icon, :color, :user_id) RETURNING *",
        {**body.dict(), "user_id": current_user["id"]},
    )
    await database.execute(
        "INSERT INTO project_members (project_id, user_id, role) VALUES (:pid, :uid, 'owner')",
        {"pid": row["id"], "uid": current_user["id"]},
    )
    return dict(row)

@router.get("/{project_id}/members")
async def list_members(project_id: str, current_user=Depends(get_current_user)):
    rows = await database.fetch_all(
        "SELECT u.id, u.username, u.full_name, u.avatar_url, u.is_online, pm.role FROM users u JOIN project_members pm ON pm.user_id = u.id WHERE pm.project_id = :pid",
        {"pid": project_id},
    )
    return [dict(r) for r in rows]

@router.post("/{project_id}/members/{user_id}", status_code=201)
async def add_member(project_id: str, user_id: str, current_user=Depends(get_current_user)):
    member = await database.fetch_one(
        "SELECT role FROM project_members WHERE project_id = :pid AND user_id = :uid",
        {"pid": project_id, "uid": current_user["id"]},
    )
    if not member or member["role"] not in ("owner", "admin"):
        raise HTTPException(403, "Only owners and admins can add members.")
    await database.execute(
        "INSERT INTO project_members (project_id, user_id) VALUES (:pid, :uid) ON CONFLICT DO NOTHING",
        {"pid": project_id, "uid": user_id},
    )
    return {"ok": True}

@router.post("/{project_id}/read")
async def mark_read(project_id: str, current_user=Depends(get_current_user)):
    await database.execute(
        "INSERT INTO read_status (user_id, project_id, last_read_at) VALUES (:uid, :pid, NOW()) ON CONFLICT (user_id, project_id) DO UPDATE SET last_read_at = NOW()",
        {"uid": current_user["id"], "pid": project_id},
    )
    return {"ok": True}

# NEW: Find or create a DM channel between two users
@router.post("/dm/{other_user_id}")
async def get_or_create_dm(other_user_id: str, current_user=Depends(get_current_user)):
    my_id = current_user["id"]

    # Check if DM channel already exists between these two users
    existing = await database.fetch_one(
        """SELECT p.id, p.name, p.description, p.icon, p.color, p.created_at
           FROM projects p
           JOIN project_members pm1 ON pm1.project_id = p.id AND pm1.user_id = :my_id
           JOIN project_members pm2 ON pm2.project_id = p.id AND pm2.user_id = :other_id
           WHERE p.name LIKE 'dm-%'
           AND (SELECT COUNT(*) FROM project_members WHERE project_id = p.id) = 2
           LIMIT 1""",
        {"my_id": my_id, "other_id": other_user_id},
    )

    if existing:
        return {**dict(existing), "unread_count": 0}

    # Get other user's info
    other_user = await database.fetch_one(
        "SELECT id, username, full_name FROM users WHERE id = :id",
        {"id": other_user_id},
    )
    if not other_user:
        raise HTTPException(404, "User not found")

    # Create new DM channel
    dm_name = f"dm-{current_user['username']}-{other_user['username']}"
    row = await database.fetch_one(
        "INSERT INTO projects (name, description, icon, color, created_by) VALUES (:name, :description, :icon, :color, :user_id) RETURNING *",
        {"name": dm_name, "description": f"DM with {other_user['full_name']}", "icon": "💬", "color": "#6366f1", "user_id": my_id},
    )

    # Add both users
    await database.execute(
        "INSERT INTO project_members (project_id, user_id, role) VALUES (:pid, :uid, 'owner')",
        {"pid": row["id"], "uid": my_id},
    )
    await database.execute(
        "INSERT INTO project_members (project_id, user_id) VALUES (:pid, :uid) ON CONFLICT DO NOTHING",
        {"pid": row["id"], "uid": other_user_id},
    )

    return {**dict(row), "unread_count": 0}
