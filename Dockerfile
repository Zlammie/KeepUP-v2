# Dockerfile for KeepUP-v2
# Builds the Node.js app and sets up the container to run on port 3000

# Use a lightweight Node.js base image
FROM node:18-alpine

# Create and set the working directory
WORKDIR /usr/src/app

# Install app dependencies (package.json and package-lock.json)
COPY package*.json ./
RUN npm install --production

# Copy the rest of the application code
COPY . .

# Expose the app port
EXPOSE 3000

# Start the app
CMD ["npm", "start"]
