FROM node:20-alpine

# Mettre le répertoire de travail
WORKDIR /usr/src/app

# Copier les fichiers du backend 
COPY backend/package*.json ./backend/

# Installer les dépendances de production
WORKDIR /usr/src/app/backend
RUN npm install

# Revenir à la racine et copier le reste de l'application (frontend + fichiers backend restants)
WORKDIR /usr/src/app
COPY . .

# On expose le port 3000 correspondant au backend Express Node.js
EXPOSE 3000

# Démarrer le serveur
WORKDIR /usr/src/app/backend
CMD [ "node", "server.js" ]
