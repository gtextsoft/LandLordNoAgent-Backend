# CORS Deployment Checklist

## ✅ Changes Made

1. **Updated CORS Configuration** (`server.js`):
   - Added `https://landlord-no-agent-frontend.vercel.app` to allowed origins
   - Improved preflight OPTIONS request handling
   - Configured helmet to work with CORS
   - Added explicit CORS error handling

2. **Fixed Frontend API Call** (`LandlordNoAgentFrontend/src/lib/api.ts`):
   - Removed duplicate `verified=true` parameter

## 🚀 Deployment Steps

### 1. Commit and Push Changes
```bash
cd LandLordNoAgentBackend
git add server.js
git commit -m "Fix CORS: Add Vercel frontend URL and improve preflight handling"
git push origin main
```

### 2. Verify Render Deployment
- Go to your Render dashboard
- Check that the deployment is successful
- View logs to see: `🌐 Allowed CORS origins: [...]`

### 3. Test CORS Configuration
After deployment, test the CORS endpoint:
```bash
curl -H "Origin: https://landlord-no-agent-frontend.vercel.app" \
     -H "Access-Control-Request-Method: GET" \
     -H "Access-Control-Request-Headers: Content-Type" \
     -X OPTIONS \
     https://landlordnoagent-backend.onrender.com/api/properties
```

Expected response headers:
- `Access-Control-Allow-Origin: https://landlord-no-agent-frontend.vercel.app`
- `Access-Control-Allow-Methods: GET, POST, PUT, DELETE, PATCH, OPTIONS`
- `Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With, Accept, Origin`

### 4. Test Health Endpoint
```bash
curl https://landlordnoagent-backend.onrender.com/api/health
```

Should return JSON with `allowedOrigins` array.

### 5. Test CORS Test Endpoint
```bash
curl -H "Origin: https://landlord-no-agent-frontend.vercel.app" \
     https://landlordnoagent-backend.onrender.com/api/cors-test
```

## 🔍 Troubleshooting

### If CORS errors persist:

1. **Check Render Logs**:
   - Look for: `🌐 Allowed CORS origins: [...]`
   - Verify the frontend URL is in the list
   - Check for CORS error messages

2. **Verify Environment Variables** (Optional):
   - In Render dashboard, add `FRONTEND_URL` environment variable
   - Value: `https://landlord-no-agent-frontend.vercel.app`
   - This allows adding more URLs without code changes

3. **Clear Browser Cache**:
   - CORS preflight responses are cached (24 hours)
   - Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)

4. **Check Network Tab**:
   - Open browser DevTools → Network tab
   - Look for the OPTIONS preflight request
   - Check response headers for CORS headers

5. **Test with curl**:
   ```bash
   # Test preflight
   curl -X OPTIONS \
        -H "Origin: https://landlord-no-agent-frontend.vercel.app" \
        -H "Access-Control-Request-Method: GET" \
        -v \
        https://landlordnoagent-backend.onrender.com/api/properties
   
   # Test actual request
   curl -H "Origin: https://landlord-no-agent-frontend.vercel.app" \
        -v \
        https://landlordnoagent-backend.onrender.com/api/properties?verified=true&limit=6
   ```

## 📝 Current Allowed Origins

- `http://localhost:3000` (local development)
- `https://landlordnoagent.vercel.app` (old Vercel URL)
- `https://landlord-no-agent-frontend.vercel.app` (current Vercel URL)

## 🔐 Security Notes

- CORS is configured to allow credentials (`credentials: true`)
- Only specific origins are allowed (not `*`)
- Preflight requests are cached for 24 hours
- Helmet is configured to work with CORS

