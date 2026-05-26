FROM mcr.microsoft.com/playwright:v1.60.0-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Generate drizzle client and build next (optional, depending on if Railway uses the web service too)
# But since this is primarily for cron jobs running ts-node, we just need npm ci.
# However, if it also runs the Next.js web server, we should build it.
# We will just expose the start command in railway.toml

# Default command if run as a web service
CMD ["npm", "run", "start"]
