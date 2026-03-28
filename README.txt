=======================================================
  CHAT APP — COMPLETE FILES
  Follow these steps IN ORDER!
=======================================================

YOUR FOLDER STRUCTURE (everything is already sorted!):
-------------------------------------------------------
complete-chat-app/
│
├── backend/                  ← Python server files
│   ├── schema.sql            ← STEP 1: Paste this in pgAdmin
│   ├── main.py               ← Starts the server
│   ├── config.py             ← Reads your settings
│   ├── database.py           ← Connects to PostgreSQL
│   ├── dependencies.py       ← Checks login tokens
│   ├── requirements.txt      ← List of packages to install
│   ├── .env                  ← ⚠️ PUT YOUR PASSWORD HERE!
│   └── routers/
│       ├── auth.py           ← Register & Login
│       ├── projects.py       ← Channels
│       ├── messages.py       ← Send/edit/delete messages
│       └── websocket.py      ← Real-time messaging
│
└── frontend/                 ← Next.js website files
    ├── .env.local            ← Points to your backend
    ├── lib/
    │   └── api.ts            ← All API calls
    ├── hooks/
    │   └── useChat.ts        ← WebSocket connection
    └── app/
        ├── login/
        │   └── page.tsx      ← Login screen
        └── chat/
            └── page.tsx      ← Main chat screen


=======================================================
  STEP 1 — DATABASE SETUP
=======================================================
1. Open pgAdmin (opens in your browser)
2. Right-click "Databases" → Create → Database
3. Name it: chatdb → click Save
4. Click on "chatdb" in the left sidebar
5. Click Tools → Query Tool
6. Open file: backend/schema.sql
7. Copy ALL the text → Paste into Query Tool
8. Press F5 to run
9. ✅ You should see "Query returned successfully"


=======================================================
  STEP 2 — ADD YOUR PASSWORD TO .env FILE
=======================================================
1. Open backend/.env in VS Code
2. Replace YOUR_PASSWORD_HERE with your PostgreSQL password
3. Save the file

Example:
  DATABASE_URL=postgresql+asyncpg://postgres:mypassword123@localhost:5432/chatdb


=======================================================
  STEP 3 — START THE BACKEND
=======================================================
Open PowerShell and type these ONE BY ONE:

  cd C:\Users\famre\OneDrive\Desktop\complete-chat-app\backend
  python -m venv venv
  venv\Scripts\activate
  pip install -r requirements.txt
  uvicorn main:app --reload

✅ Then visit: http://localhost:8000/docs
   You should see the API documentation page!


=======================================================
  STEP 4 — CREATE & START THE FRONTEND
=======================================================
Open a NEW PowerShell window and type:

  cd C:\Users\famre\OneDrive\Desktop
  npx create-next-app@latest my-chat-app

  Answer the questions:
  TypeScript?    → Yes
  ESLint?        → Yes
  Tailwind CSS?  → No
  src/ dir?      → No
  App Router?    → Yes
  import alias?  → No

  cd my-chat-app

Now COPY these files from complete-chat-app/frontend INTO my-chat-app:
  - lib/api.ts          → my-chat-app/lib/api.ts
  - hooks/useChat.ts    → my-chat-app/hooks/useChat.ts
  - app/login/page.tsx  → my-chat-app/app/login/page.tsx
  - app/chat/page.tsx   → my-chat-app/app/chat/page.tsx
  - .env.local          → my-chat-app/.env.local

Then start it:
  npm run dev

✅ Then visit: http://localhost:3000/login
   You should see the login page!


=======================================================
  EVERY TIME YOU COME BACK
=======================================================
PowerShell Window 1 (Backend):
  cd C:\Users\famre\OneDrive\Desktop\complete-chat-app\backend
  venv\Scripts\activate
  uvicorn main:app --reload

PowerShell Window 2 (Frontend):
  cd C:\Users\famre\OneDrive\Desktop\my-chat-app
  npm run dev

Open browser: http://localhost:3000

