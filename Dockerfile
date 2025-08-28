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

# Provide a default nginx config that serves static files
COPY <<EOF /etc/nginx/conf.d/default.conf
server {
  listen       80;
  server_name  _;

  root   /usr/share/nginx/html;
  index  index.html index.htm;

  location / {
    try_files $uri $uri/ /index.html;
  }
}
EOF

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]


