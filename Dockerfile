FROM mcr.microsoft.com/playwright:v1.60.0-jammy

# Set working directory
WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm ci

# Copy the rest of the application
COPY . .

# Generate drizzle client and build next
RUN npm run build

# Default command if run as a web service
CMD ["npm", "run", "start"]
