# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json /app/
RUN npm ci --no-audit --no-fund
COPY . /app
RUN npm run build

# Serve static files with a lightweight server
FROM nginx:alpine AS runtime
WORKDIR /usr/share/nginx/html
COPY --from=build /app/dist /usr/share/nginx/html

# Install envsubst for dynamic config generation
RUN apk add --no-cache gettext

# Template nginx config that respects the PORT environment variable and proxies
# API requests to the backend, removing the Origin header to avoid CORS issues,
# forwarding the correct Host header and enabling SNI for HTTPS backends.
COPY <<'EOF' /etc/nginx/conf.d/default.conf.template
server {
  listen       ${PORT};
  server_name  _;

  root   /usr/share/nginx/html;
  index  index.html index.htm;

  location /api/ {
    proxy_pass ${API_PROXY_TARGET};
    proxy_set_header Host $proxy_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Origin "";
    proxy_ssl_server_name on;
  }

  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

ENV PORT=8080
ENV API_PROXY_TARGET=https://curvasdesembolsoserver-production.up.railway.app/api/
EXPOSE 8080

# Render config from template and start nginx
CMD ["sh", "-c", "envsubst '$PORT $API_PROXY_TARGET' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]


