# Build stage
FROM node:20-alpine AS build
WORKDIR /app
COPY package*.json /app/
RUN npm ci --no-audit --no-fund
COPY . /app
# Allow API base to be set at build time (Railway allows build envs)
ARG VITE_API_BASE
ENV VITE_API_BASE=${VITE_API_BASE}
RUN npm run build

# Serve static files with a lightweight server
FROM nginx:alpine AS runtime
WORKDIR /usr/share/nginx/html
COPY --from=build /app/dist /usr/share/nginx/html

# Install envsubst for dynamic config generation
RUN apk add --no-cache gettext

# Template nginx config that respects the PORT environment variable
COPY <<'EOF' /etc/nginx/conf.d/default.conf.template
server {
  listen       ${PORT};
  server_name  _;

  root   /usr/share/nginx/html;
  index  index.html index.htm;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

ENV PORT=8080
EXPOSE 8080

# Render config from template and start nginx
CMD ["sh", "-c", "envsubst '$PORT' < /etc/nginx/conf.d/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]


