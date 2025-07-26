#!/bin/sh
set -e

# Replace environment variables in nginx config and built files
if [ -n "$VITE_API_URL" ]; then
    echo "Setting API URL to: $VITE_API_URL"
    find /usr/share/nginx/html -name "*.js" -exec sed -i "s|VITE_API_URL_PLACEHOLDER|$VITE_API_URL|g" {} +
fi

if [ -n "$VITE_SSE_URL" ]; then
    echo "Setting SSE URL to: $VITE_SSE_URL"
    find /usr/share/nginx/html -name "*.js" -exec sed -i "s|VITE_SSE_URL_PLACEHOLDER|$VITE_SSE_URL|g" {} +
fi

# Update nginx configuration with backend URL if provided
if [ -n "$BACKEND_URL" ]; then
    echo "Setting backend URL to: $BACKEND_URL"
    sed -i "s|http://backend:3001|$BACKEND_URL|g" /etc/nginx/conf.d/default.conf
fi

# Start nginx
exec "$@"