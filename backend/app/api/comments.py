"""
Comments API for KiCAD-Prism Collaboration Feature

Handles CRUD operations for design review comments stored in
.kicad-prism/comments.json within project repositories.
"""

import os
import json
import uuid
from datetime import datetime
from typing import List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services import project_service

router = APIRouter()

# ============================================================
# PYDANTIC MODELS
# ============================================================

class CommentLocation(BaseModel):
    x: float
    y: float
    layer: str = ""
    page: str = ""

class CreateCommentRequest(BaseModel):
    context: str  # "PCB" or "SCH"
    location: CommentLocation
    content: str

class CreateReplyRequest(BaseModel):
    content: str

class UpdateCommentRequest(BaseModel):
    status: Optional[str] = None  # "OPEN" or "RESOLVED"

class CommentReply(BaseModel):
    author: str
    timestamp: str
    content: str

class Comment(BaseModel):
    id: str
    author: str
    timestamp: str
    status: str
    context: str
    location: CommentLocation
    content: str
    replies: List[CommentReply] = []

class CommentsMeta(BaseModel):
    version: str = "1.0"
    generator: str = "KiCad-Prism-Web"

class CommentsFile(BaseModel):
    meta: CommentsMeta = CommentsMeta()
    comments: List[Comment] = []

# ============================================================
# HELPER FUNCTIONS
# ============================================================

def get_comments_path(project_path: str) -> str:
    """Get path to .comments/comments.json"""
    return os.path.join(project_path, ".comments", "comments.json")

def ensure_comments_dir(project_path: str) -> str:
    """Ensure .comments directory exists"""
    prism_dir = os.path.join(project_path, ".comments")
    os.makedirs(prism_dir, exist_ok=True)
    return prism_dir

def read_comments_file(project_path: str) -> CommentsFile:
    """Read comments from .kicad-prism/comments.json"""
    comments_path = get_comments_path(project_path)
    
    if not os.path.exists(comments_path):
        return CommentsFile()
    
    try:
        with open(comments_path, 'r', encoding='utf-8') as f:
            data = json.load(f)
            return CommentsFile(**data)
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Error reading comments file: {e}")
        return CommentsFile()

def write_comments_file(project_path: str, comments_file: CommentsFile) -> None:
    """Write comments to .kicad-prism/comments.json"""
    ensure_comments_dir(project_path)
    comments_path = get_comments_path(project_path)
    
    with open(comments_path, 'w', encoding='utf-8') as f:
        json.dump(comments_file.model_dump(), f, indent=2)

def generate_comment_id() -> str:
    """Generate a short unique comment ID"""
    return f"c_{uuid.uuid4().hex[:6]}"

def get_current_user() -> str:
    """Get current user - placeholder for future auth integration"""
    # TODO: Integrate with actual authentication
    return "anonymous"

# ============================================================
# API ENDPOINTS
# ============================================================

@router.get("/{project_id}/comments")
async def get_comments(project_id: str):
    """
    Get all comments for a project.
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    comments_file = read_comments_file(project.path)
    return comments_file.model_dump()

@router.post("/{project_id}/comments")
async def create_comment(project_id: str, request: CreateCommentRequest):
    """
    Create a new comment on the design.
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Validate context
    if request.context not in ["PCB", "SCH"]:
        raise HTTPException(status_code=400, detail="Context must be 'PCB' or 'SCH'")
    
    # Read existing comments
    comments_file = read_comments_file(project.path)
    
    # Create new comment
    new_comment = Comment(
        id=generate_comment_id(),
        author=get_current_user(),
        timestamp=datetime.utcnow().isoformat() + "Z",
        status="OPEN",
        context=request.context,
        location=request.location,
        content=request.content,
        replies=[]
    )
    
    # Add to list
    comments_file.comments.append(new_comment)
    
    # Write back
    write_comments_file(project.path, comments_file)
    
    return new_comment.model_dump()

@router.patch("/{project_id}/comments/{comment_id}")
async def update_comment(project_id: str, comment_id: str, request: UpdateCommentRequest):
    """
    Update a comment's status (e.g., resolve it).
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Read existing comments
    comments_file = read_comments_file(project.path)
    
    # Find the comment
    comment = next((c for c in comments_file.comments if c.id == comment_id), None)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Update status if provided
    if request.status:
        if request.status not in ["OPEN", "RESOLVED"]:
            raise HTTPException(status_code=400, detail="Status must be 'OPEN' or 'RESOLVED'")
        comment.status = request.status
    
    # Write back
    write_comments_file(project.path, comments_file)
    
    return comment.model_dump()

@router.post("/{project_id}/comments/{comment_id}/replies")
async def add_reply(project_id: str, comment_id: str, request: CreateReplyRequest):
    """
    Add a reply to an existing comment.
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Read existing comments
    comments_file = read_comments_file(project.path)
    
    # Find the comment
    comment = next((c for c in comments_file.comments if c.id == comment_id), None)
    if not comment:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Create reply
    new_reply = CommentReply(
        author=get_current_user(),
        timestamp=datetime.utcnow().isoformat() + "Z",
        content=request.content
    )
    
    # Add reply
    comment.replies.append(new_reply)
    
    # Write back
    write_comments_file(project.path, comments_file)
    
    return {"comment": comment.model_dump(), "reply": new_reply.model_dump()}

@router.delete("/{project_id}/comments/{comment_id}")
async def delete_comment(project_id: str, comment_id: str):
    """
    Delete a comment.
    """
    projects = project_service.get_registered_projects()
    project = next((p for p in projects if p.id == project_id), None)
    if not project:
        raise HTTPException(status_code=404, detail="Project not found")
    
    # Read existing comments
    comments_file = read_comments_file(project.path)
    
    # Find and remove the comment
    original_count = len(comments_file.comments)
    comments_file.comments = [c for c in comments_file.comments if c.id != comment_id]
    
    if len(comments_file.comments) == original_count:
        raise HTTPException(status_code=404, detail="Comment not found")
    
    # Write back
    write_comments_file(project.path, comments_file)
    
    return {"deleted": comment_id}
