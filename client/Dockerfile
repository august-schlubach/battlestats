# Use the official Node.js image.
FROM node:18

# Create and change to the app directory.
WORKDIR /app

# Copy package.json and package-lock.json first to leverage Docker cache.
COPY package*.json ./

# Install dependencies.
RUN npm install -g npm@latest
RUN npm ci

# Copy the rest of the application code.
COPY . .

# Build the application.
RUN npm run build

# Expose the port the app runs on.
EXPOSE 3001

# Start the application.
CMD ["npm", "start"]
