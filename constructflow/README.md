# Main Application

## How to run

>### For TAs:
>The .env file is emailed to you, please put it into the `constructflow` folder and skip to **Step 4**.

First setup the local environemnt (Firebase configuration):   
This is to protect Firebase API keys from being exposed, set up local environment variables.

**Step 1: Create your `.env` file**   
In the root directory `constructflow/` (the same folder as `package.json`), create a new file and name it exactly `.env`.

**Step 2: Add the Firebase keys**   
Copy the following template into the `.env` file.

```env
# Firebase Configuration
VITE_FIREBASE_API_KEY="insert_key_here"
VITE_FIREBASE_AUTH_DOMAIN="insert_domain_here"
VITE_FIREBASE_PROJECT_ID="insert_project_id_here"
VITE_FIREBASE_STORAGE_BUCKET="insert_storage_bucket_here"
VITE_FIREBASE_MESSAGING_SENDER_ID="insert_sender_id_here"
VITE_FIREBASE_APP_ID="insert_app_id_here"
```

**Step 3: Get the actual values**   
Log into the shared Firebase Console and go to **Project Settings > General**. Paste the exact values inside the quotation marks in the `.env` file.

**Step 4: Start the local server**
  
```bash
# Install dependencies
npm install

# Start development server
npm run dev
```

The app runs on `http://localhost:5173` by default.

## Testing

```bash
# Install dependencies
npm install

# Run the tests
npx vitest run
```

## App Structure

- `src/pages/` - Main route pages (dashboards, projects, workers, etc.)
- `src/components/` - Reusable UI components
- `src/contexts/` - React context for authentication state
- `src/styles/` - CSS stylesheets for each component
- `src/firebase.js` - Firebase configuration and exported services

A more detailed structure is in the project's GitHub Wiki.
