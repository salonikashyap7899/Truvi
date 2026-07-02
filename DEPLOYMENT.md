# Production deployment checklist

## 1. Provision infrastructure
- Use MongoDB Atlas with a replica set (required for commission transaction support).
- Create a Render web service for this repository.
- Enable a persistent disk for uploads if uploaded files must survive redeploys.

## 2. Configure environment variables
Set these in your hosting provider:
- MONGO_URI
- JWT_ACCESS_SECRET
- JWT_REFRESH_SECRET
- NODE_ENV=production
- PORT=10000 (Render will inject this automatically, but set it explicitly if needed)
- CLIENT_URL=https://your-domain.example.com
- PUBLIC_URL=https://your-domain.example.com
- UPLOAD_DIR=/var/data/uploads

## 3. Build and start commands
- Build: npm run build
- Start: npm start

## 4. Health check
- Path: /health
- Expected: {"status":"ok"}

## 5. Notes
- The server serves the built React app from the same process.
- Uploaded files are stored on disk and should use a persistent volume in production.
- If you later move uploads to S3, only the upload service needs to change.
