# Production multi-stage Dockerfile for TrueFeed backend
# - Build stage installs dependencies and copies source
# - Final stage contains only what is necessary to run

# Use Node LTS (18) alpine for smaller image size
FROM node:18-alpine AS build

WORKDIR /usr/src/app

# Install dependencies based on package-lock for reproducible builds
COPY package*.json ./
RUN npm install --production

# Copy project files
COPY . .

# Ensure a .env file exists in the build stage (empty if not provided)
RUN if [ -f .env ]; then echo ".env detected"; else echo "creating empty .env" && touch .env; fi

# Final runtime image
FROM node:18-alpine AS runtime

WORKDIR /usr/src/app

# Copy only production dependencies and source
COPY --from=build /usr/src/app/node_modules ./node_modules
COPY --from=build /usr/src/app/src ./src
COPY --from=build /usr/src/app/.env ./.env
COPY package*.json ./

# Default environment (can be overridden by docker run -e or .env)
ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

# Run the server
CMD ["node", "src/server.js"]
