FROM node:20-alpine

# Set working directory
WORKDIR /usr/src/app

# Installer nodemon globalement pour le hot reload (mode dev)
RUN npm install -g nodemon

# Copier uniquement package json
COPY backend/package*.json ./backend/

# Installer les dependences
WORKDIR /usr/src/app/backend
RUN npm install

# Copier le reste du code
WORKDIR /usr/src/app
COPY . .

# On expose le port
EXPOSE 3000

# Démarrer le serveur
WORKDIR /usr/src/app/backend
CMD [ "nodemon", "server.js" ]
