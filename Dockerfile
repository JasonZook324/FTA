# Use a stable Node.js image
FROM node:22.2.0

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package.json package-lock.json ./
RUN npm install

# Copy the rest of the app
COPY . .

# Build client and server
RUN npm run build

# Expose the port your server listens on
EXPOSE 3000

# Start the server
CMD ["npm", "start"]
