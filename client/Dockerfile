# Stage 1: Building the React application
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json yarn.lock* package-lock.json* pnpm-lock.yaml* ./
RUN \
  if [ -f yarn.lock ]; then yarn --frozen-lockfile; \
  elif [ -f package-lock.json ]; then npm ci; \
  elif [ -f pnpm-lock.yaml ]; then yarn global add pnpm && pnpm i --frozen-lockfile; \
  else echo "Lockfile not found." && yarn; \
  fi
COPY . .
RUN yarn build # or `npm run build` if using npm

# Stage 2: Setting up Nginx to serve the React application
FROM nginx:alpine AS production
# Copy built assets from 'build' stage
COPY --from=build /app/build /usr/share/nginx/html
# Optional: If you have a custom nginx.conf, you can copy it to the container
# COPY nginx.conf /etc/nginx/nginx.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
