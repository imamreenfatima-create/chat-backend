from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from database import database
from routers import auth, projects, messages, websocket

@asynccontextmanager
async def lifespan(app: FastAPI):
    await database.connect()
    yield
    await database.disconnect()

app = FastAPI(title="Chat API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router,      prefix="/api/auth",     tags=["auth"])
app.include_router(projects.router,  prefix="/api/projects", tags=["projects"])
app.include_router(messages.router,  prefix="/api/messages", tags=["messages"])
app.include_router(websocket.router, prefix="/ws",           tags=["websocket"])

@app.get("/health")
async def health():
    return {"status": "ok", "message": "Server is running!"}
