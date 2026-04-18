# Deployment

## Target setup

- Frontend: Vercel
- Backend: Render Web Service
- Database: MongoDB Atlas

## Backend on Render

### Service settings

- Root directory: `server`
- Build command: `npm install`
- Start command: `npm run start`

### Required environment variables

- `MONGO_URI`
- `JWT_SECRET`
- `CLIENT_ORIGIN`
  - Example: `https://your-frontend.vercel.app,http://localhost:3000`
- `PORT`
  - Render sets this automatically, but you can leave it unset

### Optional environment variables

- `OPENAI_API_KEY`
- `XTTS_API_URL`
- `XTTS_SPEAKER_WAV`
- `XTTS_LANGUAGE`
- `XTTS_TIMEOUT_MS`

## Frontend on Vercel

### Project settings

- Root directory: `client`
- Framework preset: `Create React App`
- Build command: `npm run build`
- Output directory: `build`

### Required environment variables

- `REACT_APP_API_URL`
  - Example: `https://your-render-service.onrender.com/api`
- `REACT_APP_API_WS`
  - Example: `https://your-render-service.onrender.com`
- `REACT_APP_GEMINI_API_KEY`

## Order of deployment

1. Create MongoDB Atlas cluster and copy the connection string.
2. Deploy the backend to Render with `MONGO_URI`, `JWT_SECRET`, and a temporary `CLIENT_ORIGIN=http://localhost:3000`.
3. Deploy the frontend to Vercel with the Render backend URL in `REACT_APP_API_URL` and `REACT_APP_API_WS`.
4. Copy the final Vercel production URL.
5. Update Render `CLIENT_ORIGIN` to include the Vercel URL.
   - Example: `https://your-frontend.vercel.app,http://localhost:3000`
6. Redeploy Render once after updating `CLIENT_ORIGIN`.

## Notes

- `client/vercel.json` is included for SPA route rewrites.
- Socket.IO now uses the same configured Render base URL instead of hardcoded localhost.
- Backend CORS accepts multiple origins via comma-separated `CLIENT_ORIGIN`.
