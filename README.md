# Singular Backend

Backend service for the Singular application, handling user data, onboarding flow, and OpenAI Assistant integration.

## 🚀 Quick Start

### 1. Environment Setup
Create a `.env` file based on the example:
PORT=8080
MONGODB_URI=mongodb+srv://...
MONGODB_DBNAME=singular
OPENAI_API_KEY=sk-...
CLIENT_ORIGIN=http://localhost:3000

### 2. Database Initialization (New Cluster)
If you are starting with a fresh MongoDB cluster, you must populate two collections manually or via scripts before the frontend can work.

#### A. Collection: `question`
Populate this collection with the onboarding questions. The frontend expects at least 12 questions to flow correctly through the "intro", "deep dive", and "optional" phases.

**Schema Example:**
// 1. Input Type (e.g., Name)
{
  "title": "¿Cómo te llamas?",
  "typeInput": "input",
  "required": true,
  "orderNumber": 1,
  "createdAt": "2024-03-20T10:00:00Z"
}

// 2. Select Type (e.g., Age/Country)
{
  "title": "¿Desde dónde te conectas?",
  "typeInput": "select",
  "options": [
    { "title": "Argentina", "img": "arg" },
    { "title": "México", "img": "mex" },
    { "title": "Colombia", "img": "col" },
    { "title": "Otro" }
  ],
  "required": true,
  "orderNumber": 3,
  "createdAt": "2024-03-20T10:10:00Z"
}

// 3. Area Type (Open text)
{
  "title": "¿Qué es lo que más te apasiona?",
  "subtitle": "Hobbies, temas, deportes...",
  "typeInput": "area",
  "required": true,
  "orderNumber": 4,
  "createdAt": "2024-03-20T10:15:00Z"
}

#### B. Collection: `agents`
You need to register an OpenAI Assistant in the database.

**Option 1: Using the API (Recommended)**
Use the `POST /agent/create-agent` endpoint. This will create the assistant in OpenAI and save it to MongoDB.
- **Body:** `{ "userEmail": "admin@singular.app", "instructions": "..." }`
- **Instructions:** Copy the content from the file `study-prompt.md` in the root of this repo.

**Option 2: Manual Insert**
If you already have an Assistant ID from OpenAI Platform:
{
  "assistantId": "asst_YOUR_EXISTING_ID",
  "createdAt": "2024-03-20T12:00:00Z",
  "files": []
}*Note: Ensure `NEXT_PUBLIC_ASSISTANT_ID` in the frontend `.env` matches this ID.*

## Development

# Install dependencies
pnpm install

# Run in development mode
pnpm dev## Build

pnpm build
pnpm start
